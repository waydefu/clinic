import { type PilotEvent, type SourceEventShape } from './pilot-sanitizer.js';

/**
 * CAL-PILOT-001 的兩個 Google 用戶端：來源唯讀、目的地唯寫。
 *
 * ## 為什麼是兩個檔案裡的兩個 class，而不是一個
 *
 * 因為「來源永遠不會被寫壞」這件事必須**在型別上就成立**，而不是靠註解約定。
 * `SourceCalendarReader` **沒有任何寫入方法**——不是有但不呼叫，是根本不存在。
 * 就算之後有人想在匯入流程裡「順手改一下來源」，也得先新增一個方法，那是會
 * 被 code review 看到的動作，不是一行 typo 就能造成的事故。
 *
 * ## scope 對應
 *
 * | 用戶端 | scope | 能做什麼 |
 * | --- | --- | --- |
 * | `SourceCalendarReader` | `calendar.events.readonly` | 只有 list |
 * | `TestCalendarWriter` | `calendar.events` | 對指定的測試日曆 insert |
 *
 * 兩者**必須使用不同的憑證主體**。同一把金鑰同時能讀來源又能寫目的地，等於把
 * 「讀寫分離」這個設計削成裝飾品。
 */

const API_BASE = 'https://www.googleapis.com/calendar/v3';

/** 來源唯讀 scope。比 `calendar.readonly` 窄：不含日曆清單、設定與 ACL。 */
export const SOURCE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.events.readonly';

/** 目的地寫入 scope。 */
export const TEST_WRITER_SCOPE =
  'https://www.googleapis.com/auth/calendar.events';

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ status: number; text: () => Promise<string> }>;

export class PilotCalendarError extends Error {
  public readonly name = 'PilotCalendarError';
  public constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

/**
 * 來源日曆的唯讀用戶端。
 *
 * **這個 class 只有 `listEvents`。** 沒有 insert、patch、delete、move，也沒有任何
 * 可以間接寫入的路徑。
 */
export class SourceCalendarReader {
  private readonly calendarId: string;
  private readonly getAccessToken: () => Promise<string>;
  private readonly fetchImpl: FetchLike;

  public constructor(config: {
    calendarId: string;
    getAccessToken: () => Promise<string>;
    fetchImpl?: FetchLike;
  }) {
    this.calendarId = config.calendarId;
    this.getAccessToken = config.getAccessToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /**
   * 讀取時間窗內的事件。
   *
   * `singleEvents=true` 讓 Google 把週期性事件展開成個別 instance——我們要的是
   * 一個個真實時段，不是一條重複規則。`showDeleted=false` 配合它會自動排除已
   * 取消的 instance。
   *
   * **刻意不要 syncToken**：Google 的 API 不允許 `timeMin`／`timeMax` 與
   * `syncToken` 併用，而有界時間窗對第一輪試辦更重要。增量同步是之後的事。
   */
  public async listEvents(
    windowStart: Date,
    windowEnd: Date,
    maxResults = 250
  ): Promise<readonly SourceEventShape[]> {
    const token = await this.getAccessToken();
    const collected: SourceEventShape[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(
        `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events`
      );
      url.searchParams.set('timeMin', windowStart.toISOString());
      url.searchParams.set('timeMax', windowEnd.toISOString());
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('showDeleted', 'false');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', String(maxResults));
      if (pageToken !== undefined) url.searchParams.set('pageToken', pageToken);

      const response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });
      const raw = await response.text();
      if (response.status < 200 || response.status >= 300)
        // 不回傳 Google 的錯誤本文：它可能夾帶事件標題等來源內容。
        throw new PilotCalendarError(
          `Source calendar read failed (${response.status}).`,
          response.status
        );

      const body = JSON.parse(raw) as {
        items?: SourceEventShape[];
        nextPageToken?: string;
      };
      collected.push(...(body.items ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken !== undefined);

    return collected;
  }
}

/**
 * 目的地測試日曆的寫入用戶端。
 *
 * 它只接受已消毒的 `PilotEvent`——型別上就無法把原始 Google 事件塞進來。
 */
export class TestCalendarWriter {
  private readonly calendarId: string;
  private readonly getAccessToken: () => Promise<string>;
  private readonly fetchImpl: FetchLike;
  private readonly batchId: string;

  public constructor(config: {
    calendarId: string;
    getAccessToken: () => Promise<string>;
    batchId: string;
    fetchImpl?: FetchLike;
  }) {
    this.calendarId = config.calendarId;
    this.getAccessToken = config.getAccessToken;
    this.batchId = config.batchId;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /**
   * 寫入一筆消毒後的事件。
   *
   * 事件標題只有假名，描述只有批次 ID——**沒有任何來源內容**。批次 ID 是清除時
   * 的依據：清理只要刪掉帶這個 ID 的事件即可，不需要保留任何來源資訊。
   */
  public async insert(event: PilotEvent): Promise<void> {
    const token = await this.getAccessToken();
    const endsAt = new Date(
      Date.parse(event.startsAt) + 30 * 60_000
    ).toISOString();

    const response = await this.fetchImpl(
      `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: event.displayLabel,
          description: `CAL-PILOT batch ${this.batchId}`,
          start: { dateTime: event.startsAt, timeZone: 'Asia/Taipei' },
          end: { dateTime: endsAt, timeZone: 'Asia/Taipei' },
          // 同一個 pilotId 重跑會撞到既有事件（409），因此重跑不會產生第二筆。
          id: `calpilot${event.pilotId}`
        })
      }
    );

    // 409 = 這筆已經寫過了。重跑本來就該是冪等的，視為成功。
    if (response.status === 409) return;
    if (response.status < 200 || response.status >= 300)
      throw new PilotCalendarError(
        `Test calendar write failed (${response.status}).`,
        response.status
      );
  }
}
