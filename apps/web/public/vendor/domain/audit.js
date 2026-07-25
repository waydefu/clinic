import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';
export const AUDIT_SCHEMA_VERSION = 2;
function assertOpaqueIdentifier(value, fieldName) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be an opaque identifier.`);
    }
}
function assertAuditEventId(value) {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', 'audit.eventId must be an opaque audit identifier.');
    }
}
function assertNullableOpaqueIdentifier(value, fieldName) {
    if (value !== null)
        assertOpaqueIdentifier(value, fieldName);
}
/**
 * Produces the strict, privacy-minimised v2 event written in the same
 * transaction as its appointment mutation.
 */
export function planAuditEvent(input) {
    assertAuditEventId(input.eventId);
    assertOpaqueIdentifier(input.resourceId, 'audit.resourceId');
    assertOpaqueIdentifier(input.context.actorId, 'audit.actorId');
    assertOpaqueIdentifier(input.context.actorRole, 'audit.actorRole');
    assertOpaqueIdentifier(input.context.correlationId, 'audit.correlationId');
    assertNullableOpaqueIdentifier(input.context.reasonCode, 'audit.reasonCode');
    assertNullableOpaqueIdentifier(input.context.policyVersion, 'audit.policyVersion');
    assertUtcTimestamp(input.occurredAt, 'audit.occurredAt');
    return {
        eventId: input.eventId,
        occurredAt: input.occurredAt,
        actorId: input.context.actorId,
        actorRole: input.context.actorRole,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: input.before,
        after: input.after,
        reasonCode: input.context.reasonCode,
        result: 'succeeded',
        correlationId: input.context.correlationId,
        source: input.context.source,
        policyVersion: input.context.policyVersion,
        schemaVersion: AUDIT_SCHEMA_VERSION
    };
}
