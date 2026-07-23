import {
  isCalendarEventId,
  type OutboxTraceContext
} from '@beauessence/domain';

/**
 * 外部日曆的邊界。
 *
 * worker 只認識這個介面，不認識 Google。階段 C 接上真實 Calendar 時只換實作，
 * 重試、退避、死信與冪等的行為完全不動——那些已在本機用假實作驗證過。
 *
 * ## 對應到 Google Calendar API 的哪些呼叫
 *
 * | 這裡的 action | 真實實作 | 已存在／已刪除時 |
 * | --- | --- | --- |
 * | `upsert` | `events.insert`（自訂 ID）；回 409 就改 `events.patch` | 409 = 事件已存在 → **視為成功**後續更新 |
 * | `cancel` | `events.delete` | 410／404 = 早就沒了 → **視為成功** |
 *
 * 為什麼是 upsert 而不是分開的 create／update：worker 手上只有預約狀態，
 * 無法知道日曆那一側到底有沒有這個事件（Google 明說無法保證偵測 ID 衝突）。
 * 「先 insert，撞到就 patch」是官方建議的寫法，也讓重試永遠安全。
 */

export type CalendarAction = 'upsert' | 'cancel';

/**
 * 診所端日曆事件的長度（2026-07-22 專案負責人指定）。
 *
 * 與時段網格（初診 30 分）刻意不同：時段是掛號的節奏，這裡是醫師日曆上要
 * 預留的實際看診區塊。患者自己的行事曆則只標記開始時間，不佔區間——見
 * `apps/web/public/modules/calendar-export.js`。
 *
 * 這是測試設定，不代表 D-004（服務時長與容量）已核准。
 */
export const CLINIC_EVENT_MINUTES = 60;

/**
 * 事件顏色。Google Calendar API 用 `colorId`（字串數字），`11` 是番茄紅、
 * `10` 是羅勒綠。診所端採綠色與品牌一致；紅色在多數行事曆語彙裡代表取消。
 * 真實用戶端接上時把這個值填進 `events.insert` 的 `colorId`。
 */
export const CLINIC_EVENT_COLOR_ID = '10';

/** 依開始時間推算診所端事件的結束時間。 */
export function clinicEventEnd(startsAt: string): string {
  return new Date(
    Date.parse(startsAt) + CLINIC_EVENT_MINUTES * 60_000
  ).toISOString();
}

export interface CalendarProjectionRequest extends OutboxTraceContext {
  /**
   * 固定的冪等鍵，直接作為 Google Calendar 的 event ID：同一鍵重送不得產生
   * 第二個事件。格式受限（base32hex），一律由
   * `@beauessence/domain` 的 `calendar-event-id.ts` 產生。
   */
  readonly idempotencyKey: string;
  /** 要對日曆做什麼；由 worker 依預約狀態決定。 */
  readonly action: CalendarAction;
  readonly appointmentId: string;
  readonly appointmentStatus: string;
  readonly startsAt: string;
  /** 診所端事件的結束時間（開始 + `CLINIC_EVENT_MINUTES`）。 */
  readonly endsAt: string;
  readonly bookingKind: string;
  /** 傳給 Google 的 `colorId`。 */
  readonly colorId: string;
}

export interface CalendarPort {
  /**
   * 套用一次投影。實作必須以 idempotencyKey 去重，重試 N 次仍只有一個事件。
   *
   * 丟出的錯誤若帶 `retryable === false`，worker 會直接送進死信而不重試。
   */
  project(request: CalendarProjectionRequest): Promise<void>;
}

export class CalendarError extends Error {
  public readonly name = 'CalendarError';

  public constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

/**
 * 供本機驗證用的假日曆，刻意模仿 Google 的四個關鍵語意，讓錯誤在本機就爆炸，
 * 而不是等到接上真實 API 的第一次呼叫：
 *
 * 1. event ID 不合 base32hex 格式者拒絕，且**不可重試**——重試一百次格式
 *    還是錯的，那是死信而不是暫時故障。
 * 2. `upsert` 撞到既有事件（等同 Google 的 409）視為**冪等成功**並更新內容，
 *    不是失敗。官方明說無法保證偵測 ID 衝突，因此 worker 不得把「已存在」
 *    當失敗重試。
 * 3. `cancel` 刪除不存在的事件（等同 410／404）同樣視為成功：目標狀態已達成。
 * 4. 事件內容只保留識別碼、狀態、時間與掛號別，與正式投影的欄位限制一致。
 *
 * 計數器供測試斷言「重試 N 次仍只有一個事件」與各動作各發生幾次。
 */
export class InMemoryCalendar implements CalendarPort {
  public readonly events = new Map<string, CalendarProjectionRequest>();
  public callCount = 0;
  /** 分別記錄新建、命中既有事件（409 路徑）、刪除與刪除不存在的次數。 */
  public insertCount = 0;
  public conflictUpdateCount = 0;
  public cancelCount = 0;
  public cancelMissCount = 0;
  private failuresRemaining = 0;
  private failureRetryable = true;
  private writeThenFailRemaining = 0;

  public failNext(times: number, retryable = true): void {
    this.failuresRemaining = times;
    this.failureRetryable = retryable;
  }

  /**
   * 模擬 Google 官方警告的最危險情境：**事件已在日曆建立成功，但回應在網路上
   * 遺失**，於是 worker 以為失敗而重試。這正是「自訂 event ID」要防的重複風險。
   * 這裡先把事件寫進去，再丟可重試錯誤——重送時 upsert 撞到既有事件，必須維持
   * 一個事件而非兩個（runbook 步驟 3）。
   */
  public failNextAfterWrite(times: number): void {
    this.writeThenFailRemaining = times;
  }

  // 這個假實作沒有真正的 I/O，因此不是 async function；回傳 Promise 是為了
  // 符合 CalendarPort 介面，讓 worker 的呼叫路徑與真實實作完全一致。
  public project(request: CalendarProjectionRequest): Promise<void> {
    this.callCount += 1;
    if (!isCalendarEventId(request.idempotencyKey))
      return Promise.reject(
        new CalendarError(
          `"${request.idempotencyKey}" is not a valid Calendar event ID (base32hex, 5-1024 chars).`,
          false
        )
      );
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return Promise.reject(
        new CalendarError('Synthetic calendar failure.', this.failureRetryable)
      );
    }
    if (this.writeThenFailRemaining > 0 && request.action !== 'cancel') {
      this.writeThenFailRemaining -= 1;
      // 事件真的寫進去了，只是回應遺失。
      if (this.events.has(request.idempotencyKey))
        this.conflictUpdateCount += 1;
      else this.insertCount += 1;
      this.events.set(request.idempotencyKey, request);
      return Promise.reject(
        new CalendarError(
          'Calendar wrote the event but the response was lost.',
          true
        )
      );
    }

    const exists = this.events.has(request.idempotencyKey);
    if (request.action === 'cancel') {
      if (exists) {
        this.events.delete(request.idempotencyKey);
        this.cancelCount += 1;
      } else this.cancelMissCount += 1;
      return Promise.resolve();
    }

    // upsert：撞到既有事件就更新內容（Google 的 insert → 409 → patch 路徑）。
    if (exists) this.conflictUpdateCount += 1;
    else this.insertCount += 1;
    this.events.set(request.idempotencyKey, request);
    return Promise.resolve();
  }
}
