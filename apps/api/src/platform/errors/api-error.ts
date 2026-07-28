import type { ApiErrorCode, ApiErrorResponse } from '@beauessence/contracts';
import { DomainError, type DomainErrorCode } from '@beauessence/domain';
import { ZodError } from 'zod';

/**
 * The single place a failure becomes an HTTP status and a safe body.
 *
 * Nothing here reads an error message to decide a status: a message can carry a
 * patient's name, a slot id or an SDK stack, so the mapper classifies by type
 * and code only and emits a fixed, generic message per API code. The domain
 * message, the stack, any SDK error and any identifier stay on the server.
 *
 * No route emits this yet. The controllers that will are still gated (D-001～
 * D-006); this fixes the transport contract so they cannot each invent one.
 */

/**
 * A failure the application layer raises before or instead of a domain error,
 * carrying the API code directly so the mapper never has to guess it. Auth,
 * rate-limit and maintenance are not domain concerns, so they are not
 * DomainErrors.
 */
export abstract class PlatformError extends Error {
  public abstract readonly apiCode: ApiErrorCode;
}

export class AuthenticationRequiredError extends PlatformError {
  public readonly apiCode = 'AUTHENTICATION_REQUIRED' as const;
  public constructor() {
    super('Authentication is required.');
    this.name = 'AuthenticationRequiredError';
  }
}

export class AuthorizationDeniedError extends PlatformError {
  public readonly apiCode = 'AUTHORIZATION_DENIED' as const;
  public constructor() {
    super('Authorization was denied.');
    this.name = 'AuthorizationDeniedError';
  }
}

export class PolicyAcceptanceRequiredError extends PlatformError {
  public readonly apiCode = 'POLICY_ACCEPTANCE_REQUIRED' as const;
  public constructor() {
    super('An approved privacy-notice flow is required.');
    this.name = 'PolicyAcceptanceRequiredError';
  }
}

/**
 * Carries how long the caller should wait, so the 429 can answer the question
 * it raises. A response that says "too fast" without saying "for how long"
 * leaves the client guessing, and a guessing client retries too early — which
 * is exactly the load the limit exists to prevent.
 *
 * The limiter knows this: a fixed window closes at a known instant.
 */
export class RateLimitedError extends PlatformError {
  public readonly apiCode = 'RATE_LIMITED' as const;
  public constructor(public readonly retryAfterSeconds?: number) {
    super('The request was rate limited.');
    this.name = 'RateLimitedError';
  }
}

export class ServiceUnavailableError extends PlatformError {
  public readonly apiCode = 'SERVICE_UNAVAILABLE' as const;
  public constructor(public readonly retryAfterSeconds?: number) {
    super('A required dependency is temporarily unavailable.');
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Every domain code has an explicit transport home. The `Record` is exhaustive
 * over `DomainErrorCode`, so a new domain error will not compile until it is
 * classified here rather than silently defaulting to a 500.
 */
export const DOMAIN_TO_API_CODE: Record<DomainErrorCode, ApiErrorCode> = {
  APPOINTMENT_NOT_CONFIRMABLE: 'CONFLICT',
  APPOINTMENT_NOT_CANCELLABLE: 'CONFLICT',
  APPOINTMENT_NOT_FOUND: 'NOT_FOUND',
  BOOKING_KIND_MISMATCH: 'CONFLICT',
  CANCELLATION_WINDOW_CLOSED: 'CONFLICT',
  COMPLETION_NOT_AUTHORIZED: 'AUTHORIZATION_DENIED',
  DELEGATION_NOT_AUTHORIZED: 'AUTHORIZATION_DENIED',
  DUPLICATE_ACTIVE_BOOKING: 'CONFLICT',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_MISMATCH',
  INVALID_ASSIGNMENT: 'CONFLICT',
  INVALID_TIMESTAMP: 'VALIDATION_FAILED',
  INVALID_VALUE: 'VALIDATION_FAILED',
  PATIENT_BOOKING_GUARD_MISMATCH: 'CONFLICT',
  PAYROLL_DUPLICATE_CREDIT: 'CONFLICT',
  PAYROLL_NOT_ELIGIBLE: 'CONFLICT',
  PAYROLL_PERIOD_ALREADY_CLOSED: 'CONFLICT',
  PAYROLL_PERIOD_NOT_CLOSED: 'CONFLICT',
  BLOCKED_TIME_OFF_GRID: 'VALIDATION_FAILED',
  FOLLOW_UP_DAY_CLOSED: 'VALIDATION_FAILED',
  FOLLOW_UP_NOT_DECIDABLE: 'CONFLICT',
  FOLLOW_UP_TIME_OFF_GRID: 'VALIDATION_FAILED',
  SCHEDULE_EXCEPTION_DUPLICATED: 'VALIDATION_FAILED',
  SCHEDULE_INTERVALS_OVERLAP: 'VALIDATION_FAILED',
  SCHEDULE_ORPHANS_APPOINTMENTS: 'CONFLICT',
  SCHEDULE_VERSION_CONFLICT: 'CONFLICT',
  SCHEDULE_WEEKDAY_DUPLICATED: 'VALIDATION_FAILED',
  SLOT_NOT_FOUND: 'NOT_FOUND',
  SLOT_UNAVAILABLE: 'CONFLICT',
  TRANSITION_NOT_ALLOWED: 'CONFLICT'
};

export const HTTP_STATUS_BY_API_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  AUTHENTICATION_REQUIRED: 401,
  AUTHORIZATION_DENIED: 403,
  NOT_FOUND: 404,
  POLICY_ACCEPTANCE_REQUIRED: 428,
  CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Fixed, generic messages. They never name a resource, so they cannot leak who
 * or what the request was about, and they never widen with a domain string.
 */
export const SAFE_MESSAGE_BY_API_CODE: Record<ApiErrorCode, string> = {
  VALIDATION_FAILED: '輸入內容不正確，請檢查後再試。',
  AUTHENTICATION_REQUIRED: '請先登入後再操作。',
  AUTHORIZATION_DENIED: '您沒有執行這項操作的權限。',
  NOT_FOUND: '找不到指定的資料。',
  POLICY_ACCEPTANCE_REQUIRED: '需要先完成經核准的隱私告知流程才能繼續。',
  CONFLICT: '資料狀態已變更，請重新整理後再試。',
  IDEMPOTENCY_MISMATCH: '這個請求代碼已用於不同的內容，請以新的請求重試。',
  RATE_LIMITED: '操作過於頻繁，請稍後再試。',
  INTERNAL_ERROR: '系統發生非預期錯誤，請稍後再試。',
  SERVICE_UNAVAILABLE: '服務暫時無法使用，請稍後再試。'
};

const OPAQUE_CORRELATION = /^[A-Za-z0-9_-]{1,128}$/;

export interface MappedApiError {
  readonly status: number;
  readonly body: ApiErrorResponse;
  /**
   * Response headers this failure requires. Kept beside the status rather than
   * left to each controller: `Retry-After` is part of what a 429 or 503 *means*,
   * so a controller that forgets it produces a technically valid but unusable
   * response, and nothing would catch that.
   */
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * RFC 9110 allows Retry-After as either a delay in seconds or an HTTP date.
 * Seconds is the right choice here: it needs no clock agreement between server
 * and client, and the limiter already computes a duration rather than a moment.
 */
function retryAfterHeader(error: unknown): Record<string, string> {
  const seconds =
    error instanceof RateLimitedError ||
    error instanceof ServiceUnavailableError
      ? error.retryAfterSeconds
      : undefined;
  if (seconds === undefined || !Number.isFinite(seconds)) return {};
  // 至少 1 秒：Retry-After: 0 等於邀請客戶端立刻重打，那就不是退避。
  return { 'Retry-After': String(Math.max(1, Math.ceil(seconds))) };
}

function classify(error: unknown): ApiErrorCode {
  if (error instanceof ZodError) return 'VALIDATION_FAILED';
  if (error instanceof PlatformError) return error.apiCode;
  if (error instanceof DomainError) {
    return DOMAIN_TO_API_CODE[error.code] ?? 'INTERNAL_ERROR';
  }
  return 'INTERNAL_ERROR';
}

/**
 * A correlation id is server-generated and opaque by construction. This guards
 * the boundary anyway: if a malformed value ever reached here it must not be
 * echoed, because the response body is shown to the client.
 */
function safeCorrelationId(value: string): string {
  return OPAQUE_CORRELATION.test(value) ? value : 'unknown';
}

export function mapErrorToApiResponse(
  error: unknown,
  correlationId: string
): MappedApiError {
  const code = classify(error);
  return {
    status: HTTP_STATUS_BY_API_CODE[code] ?? 500,
    headers: retryAfterHeader(error),
    body: {
      error: {
        code,
        message:
          SAFE_MESSAGE_BY_API_CODE[code] ??
          SAFE_MESSAGE_BY_API_CODE.INTERNAL_ERROR,
        correlationId: safeCorrelationId(correlationId)
      }
    }
  };
}
