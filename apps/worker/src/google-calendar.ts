import { createPrivateKey, createSign } from 'node:crypto';

import {
  CalendarError,
  type CalendarPort,
  type CalendarProjectionOptions,
  type CalendarProjectionRequest
} from './calendar-port.js';
import { InMemoryCalendar } from './calendar-port.js';
import {
  OUTBOX_LEASE_SECONDS,
  OUTBOX_SETTLE_SAFETY_MARGIN_MS
} from './worker-timing.js';

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
const DEFAULT_GOOGLE_HTTP_TIMEOUT_MS = 30_000;
const MAX_GOOGLE_HTTP_TIMEOUT_MS = 60_000;
const DEFAULT_CALENDAR_PROJECTION_TIMEOUT_MS = 90_000;
const MAX_CALENDAR_PROJECTION_TIMEOUT_MS =
  OUTBOX_LEASE_SECONDS * 1000 - OUTBOX_SETTLE_SAFETY_MARGIN_MS;
const MAX_ERROR_RESPONSE_BYTES = 65_536;
const RETRYABLE_CALENDAR_403_REASONS = new Set([
  'quotaExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded'
]);

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
    signal?: AbortSignal;
  }
) => Promise<{
  status: number;
  text: () => Promise<string>;
}>;

export interface GoogleCalendarConfig {
  readonly calendarId: string;
  /** 回傳有效的 OAuth access token；預設用服務帳號流程。可注入以利測試。 */
  readonly getAccessToken: (deadlineSignal?: AbortSignal) => Promise<string>;
  /** 事件標題前綴與地址。 */
  readonly clinicName?: string;
  readonly clinicAddress?: string;
  /** 可注入的 HTTP，預設為全域 fetch。 */
  readonly fetchImpl?: FetchLike;
  /** 單一 HTTP 呼叫的 timeout；總投影時間另受 projectionTimeoutMs 約束。 */
  readonly requestTimeoutMs?: number;
  /**
   * token + insert + optional 409 patch 共用的總期限。最大值保留租約安全餘裕，
   * 避免第一個 worker 尚未完成時工作已被第二個 worker 重領。
   */
  readonly projectionTimeoutMs?: number;
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
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validatedRequestTimeout(timeoutMs: number): number {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_GOOGLE_HTTP_TIMEOUT_MS
  )
    throw new Error(
      `Google HTTP timeout must be an integer between 1 and ${MAX_GOOGLE_HTTP_TIMEOUT_MS} milliseconds.`
    );
  return timeoutMs;
}

function validatedProjectionTimeout(timeoutMs: number): number {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_CALENDAR_PROJECTION_TIMEOUT_MS
  )
    throw new Error(
      `Calendar projection timeout must be an integer between 1 and ${MAX_CALENDAR_PROJECTION_TIMEOUT_MS} milliseconds so it stays below the worker lease.`
    );
  return timeoutMs;
}

function effectiveProjectionTimeout(
  configuredTimeoutMs: number,
  leaseTimeoutMs: number | undefined
): number {
  if (leaseTimeoutMs === undefined) return configuredTimeoutMs;
  if (!Number.isSafeInteger(leaseTimeoutMs) || leaseTimeoutMs < 1)
    throw new CalendarError(
      'Calendar projection skipped because the worker lease has no safe time remaining.',
      true
    );
  return Math.min(configuredTimeoutMs, leaseTimeoutMs);
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Operation aborted.');
}

/**
 * Passing a signal to an injected adapter is not enough to enforce a deadline:
 * a faulty adapter can ignore it. Race the operation as well, while retaining a
 * rejection handler so a late failure never becomes unhandled.
 */
function awaitWithAbort<T>(
  startOperation: () => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  let operation: Promise<T>;
  try {
    operation = startOperation();
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error('Operation failed.')
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error('Operation failed.'));
      }
    );
  });
}

function requestSignal(
  timeoutMs: number,
  deadlineSignal?: AbortSignal
): AbortSignal {
  const requestTimeout = AbortSignal.timeout(timeoutMs);
  return deadlineSignal === undefined
    ? requestTimeout
    : AbortSignal.any([deadlineSignal, requestTimeout]);
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function calendarErrorReason(raw: string): string | undefined {
  if (raw.length > MAX_ERROR_RESPONSE_BYTES) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return undefined;
  const error = (parsed as { readonly error?: unknown }).error;
  if (typeof error !== 'object' || error === null || Array.isArray(error))
    return undefined;
  const errors = (error as { readonly errors?: unknown }).errors;
  if (!Array.isArray(errors)) return undefined;
  let firstReason: string | undefined;
  for (const detail of errors) {
    if (typeof detail !== 'object' || detail === null || Array.isArray(detail))
      continue;
    const reason = (detail as { readonly reason?: unknown }).reason;
    if (typeof reason !== 'string') continue;
    firstReason ??= reason;
    if (RETRYABLE_CALENDAR_403_REASONS.has(reason)) return reason;
  }
  return firstReason;
}

function parseServiceAccount(serviceAccountJson: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be a JSON object.');

  const account = parsed as Partial<ServiceAccount> & {
    readonly type?: unknown;
    readonly token_uri?: unknown;
  };
  if (
    !isNonEmptyString(account.client_email) ||
    !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/u.test(
      account.client_email.trim()
    )
  )
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON must contain a valid service-account client_email.'
    );
  if (
    !isNonEmptyString(account.private_key) ||
    !/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----\s*$/u.test(
      account.private_key
    )
  )
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON must contain a PKCS#8 private_key.'
    );
  try {
    if (createPrivateKey(account.private_key).asymmetricKeyType !== 'rsa')
      throw new Error('not-rsa');
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON private_key must be a valid RSA private key.'
    );
  }
  if (account.type !== undefined && account.type !== 'service_account')
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON type must be service_account when present.'
    );
  if (account.token_uri !== undefined && account.token_uri !== TOKEN_URL)
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON token_uri must use the official Google OAuth endpoint.'
    );

  return {
    client_email: account.client_email.trim(),
    private_key: account.private_key
  };
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
  now: () => number = Date.now,
  requestTimeoutMs = DEFAULT_GOOGLE_HTTP_TIMEOUT_MS
): (deadlineSignal?: AbortSignal) => Promise<string> {
  const account = parseServiceAccount(serviceAccountJson);
  const timeoutMs = validatedRequestTimeout(requestTimeoutMs);

  let cached: { token: string; expiresAtMs: number } | undefined;

  return async (deadlineSignal?: AbortSignal) => {
    if (cached !== undefined && now() < cached.expiresAtMs) return cached.token;

    const issuedAt = Math.floor(now() / 1000);
    const expiresAt = issuedAt + 3600;
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: CALENDAR_SCOPE,
        aud: TOKEN_URL,
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

    let response: Awaited<ReturnType<FetchLike>>;
    const signal = requestSignal(timeoutMs, deadlineSignal);
    try {
      response = await awaitWithAbort(
        () =>
          fetchImpl(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
              assertion
            }).toString(),
            signal
          }),
        signal
      );
    } catch {
      throw new CalendarError('Token exchange request failed.', true);
    }
    let raw: string;
    try {
      raw = await awaitWithAbort(() => response.text(), signal);
    } catch {
      throw new CalendarError('Token response could not be read.', true);
    }
    if (response.status !== 200)
      // 408／429／5xx 是暫時性；其餘 4xx 多半是 JWT、金鑰或權限錯誤。
      throw new CalendarError(
        `Token exchange failed (${response.status}).`,
        isRetryableHttpStatus(response.status)
      );
    if (raw.length > MAX_ERROR_RESPONSE_BYTES)
      throw new CalendarError('Token response was unexpectedly large.', false);
    let token: unknown;
    try {
      token = JSON.parse(raw);
    } catch {
      throw new CalendarError('Token response was not valid JSON.', false);
    }
    if (typeof token !== 'object' || token === null || Array.isArray(token))
      throw new CalendarError('Token response was not a JSON object.', false);
    const responseBody = token as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (
      !isNonEmptyString(responseBody.access_token) ||
      responseBody.access_token.length > 16_384
    )
      throw new CalendarError(
        'Token response had an invalid access_token.',
        false
      );
    if (
      typeof responseBody.expires_in !== 'number' ||
      !Number.isInteger(responseBody.expires_in) ||
      responseBody.expires_in <= 60 ||
      responseBody.expires_in > 86_400
    )
      throw new CalendarError('Token response had invalid expires_in.', false);
    cached = {
      token: responseBody.access_token.trim(),
      expiresAtMs: now() + (responseBody.expires_in - 60) * 1000
    };
    return cached.token;
  };
}

export class GoogleCalendarClient implements CalendarPort {
  private readonly calendarId: string;
  private readonly getAccessToken: (
    deadlineSignal?: AbortSignal
  ) => Promise<string>;
  private readonly clinicName: string;
  private readonly clinicAddress: string;
  private readonly fetchImpl: FetchLike;
  private readonly requestTimeoutMs: number;
  private readonly projectionTimeoutMs: number;

  public constructor(config: GoogleCalendarConfig) {
    this.calendarId = config.calendarId;
    this.getAccessToken = config.getAccessToken;
    this.clinicName = config.clinicName ?? '一森渼診所';
    this.clinicAddress = config.clinicAddress ?? '臺北市松山區光復北路112號2樓';
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.requestTimeoutMs = validatedRequestTimeout(
      config.requestTimeoutMs ?? DEFAULT_GOOGLE_HTTP_TIMEOUT_MS
    );
    this.projectionTimeoutMs = validatedProjectionTimeout(
      config.projectionTimeoutMs ?? DEFAULT_CALENDAR_PROJECTION_TIMEOUT_MS
    );
  }

  public async project(
    request: CalendarProjectionRequest,
    options: CalendarProjectionOptions = {}
  ): Promise<void> {
    const timeoutMs = effectiveProjectionTimeout(
      this.projectionTimeoutMs,
      options.timeoutMs
    );
    const configuredSignal = AbortSignal.timeout(timeoutMs);
    const deadlineSignal =
      options.signal === undefined
        ? configuredSignal
        : AbortSignal.any([options.signal, configuredSignal]);
    let token: string;
    try {
      token = await awaitWithAbort(
        () => this.getAccessToken(deadlineSignal),
        deadlineSignal
      );
    } catch (error) {
      if (deadlineSignal.aborted && !(error instanceof CalendarError))
        throw new CalendarError('Calendar projection deadline exceeded.', true);
      throw error;
    }
    if (request.action === 'cancel')
      return this.cancel(request, token, deadlineSignal);
    return this.upsert(request, token, deadlineSignal);
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
    token: string,
    deadlineSignal: AbortSignal
  ): Promise<void> {
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    const insert = await this.call(
      this.encodedPath(),
      {
        method: 'POST',
        headers,
        body: this.eventBody(request)
      },
      deadlineSignal
    );
    if (insert.ok) return;
    // 409＝事件已存在（Google 明說無法保證偵測 ID 衝突，故不得當失敗）：
    // 改為 patch 更新同一個事件，維持一筆而非兩筆。
    if (insert.status === 409) {
      const patch = await this.call(
        this.encodedPath(request.idempotencyKey),
        {
          method: 'PATCH',
          headers,
          body: this.eventBody(request)
        },
        deadlineSignal
      );
      if (patch.ok) return;
      throw this.toError('patch', patch.status, patch.reason);
    }
    throw this.toError('insert', insert.status, insert.reason);
  }

  private async cancel(
    request: CalendarProjectionRequest,
    token: string,
    deadlineSignal: AbortSignal
  ): Promise<void> {
    const response = await this.call(
      this.encodedPath(request.idempotencyKey),
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      },
      deadlineSignal
    );
    // 404／410＝事件早就不在：目標狀態（該時段清空）已達成，視為成功。
    if (response.ok || response.status === 404 || response.status === 410)
      return;
    throw this.toError('delete', response.status, response.reason);
  }

  private async call(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    deadlineSignal: AbortSignal
  ): Promise<{ ok: boolean; status: number; reason?: string }> {
    const signal = requestSignal(this.requestTimeoutMs, deadlineSignal);
    try {
      const response = await awaitWithAbort(
        () =>
          this.fetchImpl(url, {
            ...init,
            signal
          }),
        signal
      );
      const reason =
        response.status === 403
          ? calendarErrorReason(
              await awaitWithAbort(() => response.text(), signal)
            )
          : undefined;
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        ...(reason === undefined ? {} : { reason })
      };
    } catch {
      // 網路層錯誤（連線中斷、逾時）屬暫時性；不回傳底層訊息，避免 URL 或
      // adapter 細節進入 outbox 的 lastError。
      throw new CalendarError('Calendar request failed.', true);
    }
  }

  /**
   * HTTP 狀態碼 → 可重試與否。
   *
   * 可重試：408／429、5xx，以及 Google 在 403 本文中明確標成
   * userRateLimitExceeded／rateLimitExceeded／quotaExceeded 的配額錯誤。
   * 不可重試：401、一般 403（認證或權限）、400／422（請求本身有問題）與
   * 其餘 4xx。逾時與連線錯誤在 `call` 已歸為可重試。
   */
  private toError(
    operation: string,
    status: number,
    reason?: string
  ): CalendarError {
    const retryable =
      isRetryableHttpStatus(status) ||
      (status === 403 &&
        reason !== undefined &&
        RETRYABLE_CALENDAR_403_REASONS.has(reason));
    return new CalendarError(
      `Calendar ${operation} failed (${status}).`,
      retryable
    );
  }
}

/**
 * 依環境選擇日曆用戶端。
 *
 * 完全沒有整合設定時才回傳 `InMemoryCalendar`，讓本機開發與測試不會意外對外
 * 呼叫。真實測試整合必須明確設為 `test`，而且兩個 credential env 都要齊備；
 * 半套設定或未知模式一律啟動失敗，避免把設定錯誤偽裝成成功的假日曆。
 */
export function createCalendarPort(
  env: Record<string, string | undefined> = process.env
): CalendarPort {
  const mode = env['GOOGLE_CALENDAR_INTEGRATION_MODE']?.trim();
  const calendarId = env['GOOGLE_CALENDAR_ID']?.trim();
  const serviceAccountJson = env['GOOGLE_SERVICE_ACCOUNT_JSON']?.trim();
  const hasCalendarId = isNonEmptyString(calendarId);
  const hasServiceAccount = isNonEmptyString(serviceAccountJson);
  const hasCredentials = hasCalendarId || hasServiceAccount;

  if (mode === undefined || mode === '' || mode === 'disabled') {
    if (hasCredentials)
      throw new Error(
        'Google Calendar credentials are set while GOOGLE_CALENDAR_INTEGRATION_MODE is disabled.'
      );
    return new InMemoryCalendar();
  }
  if (mode !== 'test')
    throw new Error(
      'GOOGLE_CALENDAR_INTEGRATION_MODE must be disabled or test.'
    );
  if (!hasCalendarId || !hasServiceAccount)
    throw new Error(
      'Google Calendar test integration requires both GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT_JSON.'
    );

  return new GoogleCalendarClient({
    calendarId,
    getAccessToken: createServiceAccountTokenProvider(serviceAccountJson)
  });
}
