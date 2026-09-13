import { DomainError } from './errors.js';
import { isRole } from './roles.js';
import { assertUtcTimestamp } from './timestamp.js';
function assertOpaqueIdentifier(value, fieldName) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be an opaque identifier.`);
    }
}
function assertAuditEventId(value) {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', 'deniedDelegationAudit.eventId must be an opaque audit identifier.');
    }
}
export function planDeniedDelegationAudit(input) {
    assertAuditEventId(input.eventId);
    assertOpaqueIdentifier(input.actorId, 'deniedDelegationAudit.actorId');
    assertOpaqueIdentifier(input.correlationId, 'deniedDelegationAudit.correlationId');
    assertOpaqueIdentifier(input.permission, 'deniedDelegationAudit.permission');
    assertOpaqueIdentifier(input.reasonCode, 'deniedDelegationAudit.reasonCode');
    if (!isRole(input.actorRole)) {
        throw new DomainError('INVALID_VALUE', 'deniedDelegationAudit.actorRole must be a canonical role');
    }
    assertUtcTimestamp(input.occurredAt, 'deniedDelegationAudit.occurredAt');
    if (!Number.isInteger(input.failedAttempts) ||
        input.failedAttempts < 0 ||
        input.failedAttempts > 10) {
        throw new DomainError('INVALID_VALUE', 'deniedDelegationAudit.failedAttempts must be an integer from 0 to 10');
    }
    if (input.locked && input.failedAttempts < 1) {
        throw new DomainError('INVALID_VALUE', 'a locked denial must record at least one failed attempt');
    }
    return {
        eventId: input.eventId,
        occurredAt: input.occurredAt,
        actorId: input.actorId,
        actorRole: input.actorRole,
        permission: input.permission,
        result: 'denied',
        reasonCode: input.reasonCode,
        locked: input.locked,
        failedAttempts: input.failedAttempts,
        correlationId: input.correlationId,
        source: 'api'
    };
}
