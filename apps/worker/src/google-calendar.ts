import { createSign } from 'node:crypto';

import {
  CalendarError,
  type CalendarPort,
  type CalendarProjectionRequest
} from './calendar-port.js';
import { InMemoryCalendar } from './calendar-port.js';

/**
 * 真實 Google Calendar 用戶端：把假日曆換成打 Google REST API 的實作。
 *
 * ## 這個檔案做什麼、不做什麼
 *
 * 它**只**把 `CalendarProjectionRequest` 對映成 Calendar API 呼叫，行為與
 * `InMemoryCalendar` 逐條對齊（見該類別的四點語意）：worker 的重試、退避、
 * 死信與冪等完全不動——那些已在 Emulator 演練過。
 *
 * | action | Google 呼叫 | 已存在／已刪除 |
 * | --- | --- | --- |
 * | `upsert` | `events.insert`（帶自訂 ID）；回 409 改 `events.patch` | 409＝已存在 → 冪等成功 |
 * | `cancel` | `events.delete` | 404／410＝早就沒了 → 成功 |
 *
 * ## 安全界線（與 ADR-0002 一致）
 *
 * - **憑證只從 env 讀，絕不寫進原始碼、日誌或 Git。** 服務帳號 JSON 走
 *   `GOOGLE_SERVICE_ACCOUNT_JSON`，日曆走 `GOOGLE_CALENDAR_ID`。
 * - **事件欄位最小化**：只放診所名稱、掛號別、時間、地址與預約編號。姓名、
 *   電話、身分證、手術種類、備註一律不離開本系統。
 * - **專用測試日曆**：這是測試整合（2026-07-23 專案負責人授權「測試不審核」），
 *   D-009 的正式核准與正式日曆仍為 pending。日曆 ID 必須指向專用測試日曆，
 *   不得指向任何醫師私人或正式日曆。
 *
 * ## 為什麼不加 googleapis 相依
 *
 * 用 Node 內建 `crypto`（服務帳號 JWT 的 RS256 簽章）加 `fetch`（REST）即可，
 * 不必為了一個小用戶端拖進一整包相依。token 交換與 HTTP 都可注入，單元測試
 * 因此不需網路也不需真實金鑰。
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const API_BASE = 'https://www.googleapis.com/calendar/v3';

/** 掛號別在日曆上的中文標籤。刻意只有這兩個字，不帶任何看診項目資訊。 */
const KIND_LABEL: Record<string, string> = {
  initial: '初診',
  follow_up: '回診'
};

type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  }
) => Promise<{
  status: number;
  text: () => Promise<string>;
}>;

export interface GoogleCalendarConfig {
  readonly calendarId: string;
  /** 回傳有效的 OAuth access token；預設用服務帳號流程。可注入以利測試。 */
  readonly getAccessToken: () => Promise<string>;
  /** 事件標題前綴與地址。 */
  readonly clinicName?: string;
  readonly clinicAddress?: string;
  /** 可注入的 HTTP，預設為全域 fetch。 */
  readonly fetchImpl?: FetchLike;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface ServiceAccount {
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
}

/**
 * 從服務帳號 JSON 建一個會快取 token 的取得器（RS256 JWT → OAuth token）。
 *
 * 金鑰只在記憶體中使用，簽出的 JWT 效期短（一小時），token 快取到過期前 60 秒。
 * 這裡刻意不把金鑰或 token 記進任何日誌。
 */
export function createServiceAccountTokenProvider(
  serviceAccountJson: string,
  fetchImpl: FetchLike = fetch,
  now: () => number = Date.now
): () => Promise<string> {
  let account: ServiceAccount;
  try {
    account = JSON.parse(serviceAccountJson) as ServiceAccount;
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
  if (
    typeof account.client_email !== 'string' ||
    typeof account.private_key !== 'string'
  )
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON must contain client_email and private_key.'
    );

  let cached: { token: string; expiresAtMs: number } | undefined;

  return async () => {
    if (cached !== undefined && now() < cached.expiresAtMs) return cached.token;

    const issuedAt = Math.floor(now() / 1000);
    const expiresAt = issuedAt + 3600;
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: CALENDAR_SCOPE,
        aud: account.token_uri ?? TOKEN_URL,
        iat: issuedAt,
        exp: expiresAt
      })
    );
    const signature = base64Url(
      createSign('RSA-SHA256')
        .update(`${header}.${claims}`)
        .sign(account.private_key)
    );
    const assertion = `${header}.${claims}.${signature}`;

    const response = await fetchImpl(account.token_uri ?? TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString()
    });
    const raw = await response.text();
    if (response.status !== 200)
      // 換 token 失敗多半是金鑰或權限問題，重試無濟於事：不可重試。
      throw new CalendarError(
        `Token exchange failed (${response.status}).`,
        false
      );
    const token = JSON.parse(raw) as {
      access_token?: string;
      expires_in?: number;
    };
    if (typeof token.access_token !== 'string')
      throw new CalendarError('Token response had no access_token.', false);
    cached = {
      token: token.access_token,
      expiresAtMs: now() + ((token.expires_in ?? 3600) - 60) * 1000
    };
    return cached.token;
  };
}

export class GoogleCalendarClient implements CalendarPort {
  private readonly calendarId: string;
  private readonly getAccessToken: () => Promise<string>;
  private readonly clinicName: string;
  private readonly clinicAddress: string;
  private readonly fetchImpl: FetchLike;

  public constructor(config: GoogleCalendarConfig) {
    this.calendarId = config.calendarId;
    this.getAccessToken = config.getAccessToken;
    this.clinicName = config.clinicName ?? '一森渼診所';
    this.clinicAddress = config.clinicAddress ?? '臺北市松山區光復北路112號2樓';
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  public async project(request: CalendarProjectionRequest): Promise<void> {
    const token = await this.getAccessToken();
    if (request.action === 'cancel') return this.cancel(request, token);
    return this.upsert(request, token);
  }

  /** 事件內容：刻意最小化，不含任何病患個資（ADR-0002）。 */
  private eventBody(request: CalendarProjectionRequest): string {
    return JSON.stringify({
      id: request.idempotencyKey,
      summary:
        `${this.clinicName} ${KIND_LABEL[request.bookingKind] ?? ''}`.trim(),
      description: `預約編號 ${request.appointmentId}`,
      location: this.clinicAddress,
      colorId: request.colorId,
      start: { dateTime: request.startsAt, timeZone: 'Asia/Taipei' },
      end: { dateTime: request.endsAt, timeZone: 'Asia/Taipei' }
    });
  }

  private encodedPath(...segments: string[]): string {
    return `${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events${segments
      .map((segment) => `/${encodeURIComponent(segment)}`)
      .join('')}`;
  }

  private async upsert(
    request: CalendarProjectionRequest,
    token: string
  ): Promise<void> {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const insert = await this.call(this.encodedPath(), {
      method: 'POST',
      headers,
      body: this.eventBody(request)
    });
    if (insert.ok) return;
    // 409＝事件已存在（Google 明說無法保證偵測 ID 衝突，故不得當失敗）：
    // 改為 patch 更新同一個事件，維持一筆而非兩筆。
    if (insert.status === 409) {
      const patch = await this.call(this.encodedPath(request.idempotencyKey), {
        method: 'PATCH',
        headers,
        body: this.eventBody(request)
      });
      if (patch.ok) return;
      throw this.toError('patch', patch.status);
    }
    throw this.toError('insert', insert.status);
  }

  private async cancel(
    request: CalendarProjectionRequest,
    token: string
  ): Promise<void> {
    const response = await this.call(this.encodedPath(request.idempotencyKey), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    // 404／410＝事件早就不在：目標狀態（該時段清空）已達成，視為成功。
    if (response.ok || response.status === 404 || response.status === 410)
      return;
    throw this.toError('delete', response.status);
  }

  private async call(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ): Promise<{ ok: boolean; status: number }> {
    try {
      const response = await this.fetchImpl(url, init);
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status
      };
    } catch (error) {
      // 網路層錯誤（連線中斷、逾時）屬暫時性：可重試。
      throw new CalendarError(
        `Calendar request failed: ${error instanceof Error ? error.message : 'network error'}.`,
        true
      );
    }
  }

  /**
   * HTTP 狀態碼 → 可重試與否。
   *
   * 可重試：429（限流）、5xx（伺服器暫時性）。
   * 不可重試：401／403（認證或權限——重試無濟於事，應死信讓人排除根因）、
   * 400／422（請求本身有問題）、其餘 4xx。逾時與連線錯誤在 `call` 已歸為可重試。
   */
  private toError(operation: string, status: number): CalendarError {
    const retryable = status === 429 || (status >= 500 && status < 600);
    return new CalendarError(
      `Calendar ${operation} failed (${status}).`,
      retryable
    );
  }
}

/**
 * 依環境選擇日曆用戶端。
 *
 * 兩個 env 都齊備才回傳真實用戶端；否則回退到 `InMemoryCalendar`，讓本機開發
 * 與測試在**沒有憑證**時也不會意外對外呼叫。這也是「憑證只走 env」的自然結果：
 * 沒設就不連。
 */
export function createCalendarPort(
  env: Record<string, string | undefined> = process.env
): CalendarPort {
  const calendarId = env['GOOGLE_CALENDAR_ID'];
  const serviceAccountJson = env['GOOGLE_SERVICE_ACCOUNT_JSON'];
  if (
    calendarId === undefined ||
    calendarId === '' ||
    serviceAccountJson === undefined ||
    serviceAccountJson === ''
  )
    return new InMemoryCalendar();
  return new GoogleCalendarClient({
    calendarId,
    getAccessToken: createServiceAccountTokenProvider(serviceAccountJson)
  });
}
