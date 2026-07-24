import { stagingRequest } from '../store.js';

// localStorage 本身幾乎同步；保留短暫延遲，才能在合成環境實際看見並測試未來
// HTTPS 請求一定會經過的 pending/disabled/aria-busy 狀態。
const DEFAULT_SYNTHETIC_LATENCY_MS = 300;

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

function wait(milliseconds) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

/**
 * The UI depends on this client rather than directly on localStorage or fetch.
 * Stage 0 injects the browser-local transport; a future /v1 transport can keep
 * the same request/error contract without changing the controllers.
 *
 * Only safe GET requests may retry automatically. A write needs its original
 * idempotency key and an explicit user retry, so POST is never replayed here.
 */
export function createApiClient(
  transport,
  { readRetries = 1, minimumLatencyMs = 0 } = {}
) {
  if (typeof transport !== 'function')
    throw new TypeError('API client transport must be a function.');

  return Object.freeze({
    async request(path, options = {}) {
      const method = String(options.method ?? 'GET').toUpperCase();
      let attempt = 0;
      while (true) {
        await wait(minimumLatencyMs);
        try {
          return await transport(path, options);
        } catch (error) {
          const clientError = asApiClientError(error);
          const canRetry =
            method === 'GET' && clientError.retryable && attempt < readRetries;
          if (!canRetry) throw clientError;
          attempt += 1;
        }
      }
    }
  });
}

export const apiClient = createApiClient(stagingRequest, {
  minimumLatencyMs: DEFAULT_SYNTHETIC_LATENCY_MS
});
