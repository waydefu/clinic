import { DomainError } from './errors.js';
function assertSha256(value, fieldName) {
    if (!/^[a-f0-9]{64}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be a lowercase SHA-256 digest.`);
    }
}
function assertScope(value) {
    if (!/^[A-Za-z0-9_:-]{1,256}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', 'idempotency.scope must be an opaque operation scope.');
    }
}
export function assertIdempotencyContext(context, actorId) {
    if (context.actorId !== actorId) {
        throw new DomainError('INVALID_VALUE', 'The idempotency actor must match the authenticated audit actor.');
    }
    assertScope(context.scope);
    assertSha256(context.requestHash, 'idempotency.requestHash');
    assertSha256(context.recordId, 'idempotency.recordId');
}
export function planIdempotencyRecord(context, appointmentId, recordedAt) {
    return {
        actorId: context.actorId,
        scope: context.scope,
        requestHash: context.requestHash,
        responseReference: {
            resourceType: 'appointment',
            resourceId: appointmentId
        },
        recordedAt,
        schemaVersion: 1
    };
}
/**
 * Returns the original appointment for an exact replay and rejects key reuse
 * for different request content. The repository calls this before any other
 * transaction read or write.
 */
export function resolveIdempotencyReplay(record, context) {
    if (record.actorId !== context.actorId ||
        record.scope !== context.scope ||
        record.requestHash !== context.requestHash) {
        throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used for a different request.');
    }
    return record.responseReference.resourceId;
}
