import { DomainError } from './errors.js';
/** 連續失敗達此次數即進入死信，改由人工處理。 */
export const MAX_ATTEMPTS = 6;
/** 指數退避的基數與上限，避免外部服務故障時把它打得更慘。 */
export const BASE_BACKOFF_SECONDS = 30;
export const MAX_BACKOFF_SECONDS = 3600;
function assertOpaqueTraceId(value, fieldName, maxLength) {
    if (typeof value !== 'string' ||
        value.length < 1 ||
        value.length > maxLength ||
        !/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be an opaque identifier.`);
    }
}
/** Runtime guard for persisted jobs before an external adapter is invoked. */
export function assertOutboxTraceContext(context) {
    assertOpaqueTraceId(context.correlationId, 'outbox.correlationId', 128);
    // Causation names the Audit v2 event, whose executable contract allows 512.
    assertOpaqueTraceId(context.causationId, 'outbox.causationId', 512);
}
export function backoffSeconds(attempts) {
    if (!Number.isInteger(attempts) || attempts < 1)
        throw new DomainError('INVALID_VALUE', 'attempts must be a positive integer.');
    const raw = BASE_BACKOFF_SECONDS * 2 ** (attempts - 1);
    return Math.min(raw, MAX_BACKOFF_SECONDS);
}
/**
 * Full-jitter delay for one retry.
 *
 * The caller supplies the random sample so this domain helper stays pure and
 * deterministic under test. A one-millisecond floor prevents an exact zero
 * sample from producing a tight retry loop; the worker also attempts each job
 * at most once per batch.
 */
export function fullJitterBackoffMilliseconds(attempts, sample) {
    if (!Number.isFinite(sample) || sample < 0 || sample > 1)
        throw new DomainError('INVALID_VALUE', 'full-jitter sample must be between 0 and 1.');
    return Math.max(1, Math.floor(backoffSeconds(attempts) * 1000 * sample));
}
/** 只有 pending 且已到重試時間的工作可被取用。 */
export function isDue(job, now) {
    if (job.status !== 'pending')
        return false;
    if (job.nextAttemptAt === undefined)
        return true;
    return Date.parse(job.nextAttemptAt) <= Date.parse(now);
}
export function planOutboxAttempt(job, outcome, now) {
    if (job.status === 'completed' || job.status === 'dead_letter') {
        throw new DomainError('INVALID_VALUE', 'A finished outbox job cannot be attempted again.');
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
    const nextAttemptAt = new Date(Date.parse(now) + backoffSeconds(attempts) * 1000).toISOString();
    return {
        status: 'pending',
        attempts,
        nextAttemptAt,
        lastError: outcome.reason,
        needsOperator: false
    };
}
