import { DomainError } from './errors.js';

/**
 * Retry policy for the outbox, as a pure decision.
 *
 * The worker performs the external effect; this module decides what happens to
 * the job afterwards. Keeping the decision pure means a crashed or duplicated
 * worker cannot produce a different outcome from the same facts, and the policy
 * can be tested without a network, a clock or a calendar.
 *
 * ADR-0002: the external call never happens inside the Firestore transaction
 * that created the job. This is the other half of that rule — the effect is
 * retried here, not re-attempted inside a write transaction.
 */

export type OutboxStatus =
  'pending' | 'in_progress' | 'completed' | 'dead_letter';

/** 連續失敗達此次數即進入死信，改由人工處理。 */
export const MAX_ATTEMPTS = 6;

/** 指數退避的基數與上限，避免外部服務故障時把它打得更慘。 */
export const BASE_BACKOFF_SECONDS = 30;
export const MAX_BACKOFF_SECONDS = 3600;

export interface OutboxTraceContext {
  /** Opaque request trace propagated from the API boundary. */
  readonly correlationId: string;
  /** Opaque audit/business event that caused this external-effect intent. */
  readonly causationId: string;
}

export interface OutboxJob extends OutboxTraceContext {
  readonly id: string;
  readonly appointmentId: string;
  readonly appointmentStatus?: string;
  /** 存在時表示這是獨立的回診提醒投影，不是來源就診事件。 */
  readonly followUpSourceId?: string;
  readonly idempotencyKey: string;
  readonly status: OutboxStatus;
  readonly attempts: number;
  /**
   * 這筆工作最早可以被領取的時刻。
   *
   * 建立時就等於 `createdAt`（立即到期），而不是留空。worker 以
   * `nextAttemptAt <= now` 的範圍查詢挑出到期工作，而 Firestore 的範圍查詢
   * **不會回傳缺少該欄位的文件**——留空的工作會直接從佇列裡消失。
   *
   * 仍宣告為選填，是為了讓 `isDue` 能容忍任何早於這個約定寫入的文件；新的寫入
   * 路徑一律帶值。
   */
  readonly nextAttemptAt?: string;
  readonly lastError?: string;
  /**
   * 事件自己的起始時刻，用於投影不落在來源預約時間的情況——例如**回診提醒**
   * 落在回診目標日期，而非已完成就診的原時間。省略時 worker 退回讀來源預約。
   */
  readonly startsAt?: string;
}

function assertOpaqueTraceId(
  value: unknown,
  fieldName: string,
  maxLength: number
): void {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maxLength ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}

/** Runtime guard for persisted jobs before an external adapter is invoked. */
export function assertOutboxTraceContext(context: OutboxTraceContext): void {
  assertOpaqueTraceId(context.correlationId, 'outbox.correlationId', 128);
  // Causation names the Audit v2 event, whose executable contract allows 512.
  assertOpaqueTraceId(context.causationId, 'outbox.causationId', 512);
}

export type AttemptOutcome =
  | { readonly kind: 'succeeded' }
  | {
      readonly kind: 'failed';
      readonly reason: string;
      readonly retryable: boolean;
    };

export interface OutboxDecision {
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly nextAttemptAt?: string;
  readonly lastError?: string;
  /** 需要人工處理時為 true，後台待處理清單以此為準。 */
  readonly needsOperator: boolean;
}

export function backoffSeconds(attempts: number): number {
  if (attempts < 1)
    throw new DomainError('INVALID_VALUE', 'attempts must be >= 1.');
  const raw = BASE_BACKOFF_SECONDS * 2 ** (attempts - 1);
  return Math.min(raw, MAX_BACKOFF_SECONDS);
}

/** 只有 pending 且已到重試時間的工作可被取用。 */
export function isDue(job: OutboxJob, now: string): boolean {
  if (job.status !== 'pending') return false;
  if (job.nextAttemptAt === undefined) return true;
  return Date.parse(job.nextAttemptAt) <= Date.parse(now);
}

export function planOutboxAttempt(
  job: OutboxJob,
  outcome: AttemptOutcome,
  now: string
): OutboxDecision {
  if (job.status === 'completed' || job.status === 'dead_letter') {
    throw new DomainError(
      'INVALID_VALUE',
      'A finished outbox job cannot be attempted again.'
    );
  }

  const attempts = job.attempts + 1;

  if (outcome.kind === 'succeeded') {
    return { status: 'completed', attempts, needsOperator: false };
  }

  // 不可重試的錯誤（例如請求本身無效）直接進死信，不浪費退避週期。
  if (!outcome.retryable) {
    return {
      status: 'dead_letter',
      attempts,
      lastError: outcome.reason,
      needsOperator: true
    };
  }

  if (attempts >= MAX_ATTEMPTS) {
    return {
      status: 'dead_letter',
      attempts,
      lastError: outcome.reason,
      needsOperator: true
    };
  }

  const nextAttemptAt = new Date(
    Date.parse(now) + backoffSeconds(attempts) * 1000
  ).toISOString();

  return {
    status: 'pending',
    attempts,
    nextAttemptAt,
    lastError: outcome.reason,
    needsOperator: false
  };
}
