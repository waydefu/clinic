import { stagingRequest } from '../store.js';

// localStorage 本身幾乎同步；保留短暫延遲，才能在合成環境實際看見並測試未來
// HTTPS 請求一定會經過的 pending/disabled/aria-busy 狀態。
const DEFAULT_SYNTHETIC_LATENCY_MS = 300;

// 合成 transport 幾乎瞬時，這個逾時對它不會觸發；它固定的是「一個慢到掛住的
// 請求會變成可重試的 SERVICE_UNAVAILABLE」這條路徑，讓未來的 /v1 fetch 換上來
// 時，UI 已經有逾時語意。0 代表停用（測試以假 transport 注入時不需要計時器）。
const DEFAULT_TIMEOUT_MS = 10_000;

// 可安全重試的 HTTP 狀態：短暫的伺服器／網路狀況。4xx 客戶端錯誤（408/425/429
// 除外）不可自動重試——請求本身要先改。429/503 在真實 transport 會帶 Retry-After。
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

// v1 error code → 安全的繁中訊息。與 apps/api 的 SAFE_MESSAGE_BY_API_CODE 對齊，
// 讓合成錯誤與未來 /v1 transport 的錯誤在畫面上讀起來一致，且都不洩漏識別碼。
const SAFE_MESSAGE_BY_CODE = Object.freeze({
  VALIDATION_FAILED: '輸入內容不正確，請檢查後再試。',
  AUTHENTICATION_REQUIRED: '請先登入後再操作。',
  AUTHORIZATION_DENIED: '您沒有執行這項操作的權限。',
  NOT_FOUND: '找不到指定的資料。',
  POLICY_ACCEPTANCE_REQUIRED: '需要先同意最新的隱私政策才能繼續。',
  CONFLICT: '資料狀態已變更，請重新整理後再試。',
  IDEMPOTENCY_MISMATCH: '這個請求代碼已用於不同的內容，請以新的請求重試。',
  RATE_LIMITED: '操作過於頻繁，請稍後再試。',
  INTERNAL_ERROR: '系統發生非預期錯誤，請稍後再試。',
  SERVICE_UNAVAILABLE: '服務暫時無法使用，請稍後再試。'
});

// status → v1 code，給沒有結構化錯誤本體時的後備分類。
function apiCodeForStatus(status) {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'AUTHENTICATION_REQUIRED';
    case 403:
      return 'AUTHORIZATION_DENIED';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 428:
      return 'POLICY_ACCEPTANCE_REQUIRED';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
  }
}

function valueOf(error, key) {
  return typeof error === 'object' && error !== null ? error[key] : undefined;
}

export class ApiClientError extends Error {
  constructor(
    message,
    {
      code = 'CLIENT_REQUEST_FAILED',
      retryable = false,
      correlationId,
      cause
    } = {}
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiClientError';
    this.code = code;
    this.retryable = retryable;
    this.correlationId = correlationId;
  }
}

// 逾時是內部標記，讓重試迴圈能把它換成一則安全的、可重試的錯誤。
class TransportTimeoutError extends Error {
  constructor() {
    super('transport timed out');
    this.name = 'TransportTimeoutError';
  }
}

export function asApiClientError(error) {
  if (error instanceof ApiClientError) return error;
  const message =
    error instanceof Error && error.message !== ''
      ? error.message
      : '目前無法完成操作，請稍後再試。';
  const code = valueOf(error, 'code');
  const retryable = valueOf(error, 'retryable');
  const correlationId = valueOf(error, 'correlationId');

  return new ApiClientError(message, {
    code: typeof code === 'string' ? code : 'SYNTHETIC_COMMAND_REJECTED',
    retryable: retryable === true,
    correlationId:
      typeof correlationId === 'string' ? correlationId : undefined,
    cause: error
  });
}

/**
 * Builds the client error for a non-2xx HTTP response. A future `/v1` fetch
 * transport calls this after reading the response: `code` comes from the parsed
 * ApiErrorResponse body when present, otherwise from the status; `retryable` is
 * decided by the status alone so a caller never has to parse a message. The
 * message is always a safe, resource-free string.
 */
export function httpTransportError({
  status,
  code,
  correlationId,
  message
} = {}) {
  const resolvedCode =
    typeof code === 'string' ? code : apiCodeForStatus(Number(status));
  return new ApiClientError(
    typeof message === 'string' && message !== ''
      ? message
      : (SAFE_MESSAGE_BY_CODE[resolvedCode] ??
          SAFE_MESSAGE_BY_CODE.INTERNAL_ERROR),
    {
      code: resolvedCode,
      retryable: RETRYABLE_STATUSES.has(Number(status)),
      correlationId:
        typeof correlationId === 'string' ? correlationId : undefined
    }
  );
}

function offlineError() {
  return new ApiClientError('目前沒有網路連線，請確認連線後重試。', {
    code: 'SERVICE_UNAVAILABLE',
    retryable: true
  });
}

function timeoutError() {
  return new ApiClientError(SAFE_MESSAGE_BY_CODE.SERVICE_UNAVAILABLE, {
    code: 'SERVICE_UNAVAILABLE',
    retryable: true
  });
}

function isOffline() {
  // Node/vitest have no navigator; `?.` keeps the check a no-op off-browser.
  return globalThis.navigator?.onLine === false;
}

function wait(milliseconds) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function withTimeout(promise, timeoutMs) {
  if (timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new TransportTimeoutError()),
      timeoutMs
    );
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * The UI depends on this client rather than directly on localStorage or fetch.
 * Stage 0 injects the browser-local transport; a future /v1 transport can keep
 * the same request/error contract without changing the controllers.
 *
 * Only safe GET requests may retry automatically. A write needs its original
 * idempotency key and an explicit user retry, so POST is never replayed here.
 * Timeout and offline surface as retryable SERVICE_UNAVAILABLE, so the same
 * pending/error/retry UI already covers a real network before /v1 lands.
 */
export function createApiClient(
  transport,
  { readRetries = 1, minimumLatencyMs = 0, timeoutMs = 0 } = {}
) {
  if (typeof transport !== 'function')
    throw new TypeError('API client transport must be a function.');

  return Object.freeze({
    async request(path, options = {}) {
      const method = String(options.method ?? 'GET').toUpperCase();
      let attempt = 0;
      while (true) {
        await wait(minimumLatencyMs);
        let clientError;
        if (isOffline()) {
          clientError = offlineError();
        } else {
          try {
            return await withTimeout(transport(path, options), timeoutMs);
          } catch (error) {
            clientError =
              error instanceof TransportTimeoutError
                ? timeoutError()
                : asApiClientError(error);
          }
        }
        const canRetry =
          method === 'GET' && clientError.retryable && attempt < readRetries;
        if (!canRetry) throw clientError;
        attempt += 1;
      }
    }
  });
}

export const apiClient = createApiClient(stagingRequest, {
  minimumLatencyMs: DEFAULT_SYNTHETIC_LATENCY_MS,
  timeoutMs: DEFAULT_TIMEOUT_MS
});
