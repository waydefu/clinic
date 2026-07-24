import { planAuditEvent } from './audit.js';
import { DomainError } from './errors.js';
import { assertIdempotencyContext, planIdempotencyRecord } from './idempotency.js';
function assertUtcTimestamp(value, fieldName) {
    if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
        throw new DomainError('INVALID_TIMESTAMP', `${fieldName} must be a valid UTC ISO-8601 timestamp.`);
    }
}
function assertOpaqueIdentifier(value, fieldName) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be an opaque identifier.`);
    }
}
function caseState(period) {
    return {
        managerId: period.managerId,
        activeFrom: period.activeFrom,
        activeUntil: period.activeUntil
    };
}
/**
 * Plans an effective-dated case-manager assignment.
 *
 * `current` is the patient's open period, or undefined for a first assignment.
 * A reassignment closes `current` at `requestedAt` and opens a new period; a
 * request that would reopen at or before the current period's start is refused,
 * because that produces an overlapping or zero-length period a payroll credit
 * could then match to two managers at once.
 */
export function planCaseAssignment(request, current) {
    assertOpaqueIdentifier(request.patientId, 'patientId');
    assertOpaqueIdentifier(request.managerId, 'managerId');
    assertUtcTimestamp(request.requestedAt, 'requestedAt');
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    let closedPeriod = null;
    if (current !== undefined) {
        if (current.patientId !== request.patientId) {
            throw new DomainError('INVALID_ASSIGNMENT', 'The current assignment belongs to a different patient.');
        }
        if (current.activeUntil !== null) {
            throw new DomainError('INVALID_ASSIGNMENT', 'The current assignment is already closed; there is nothing to supersede.');
        }
        if (Date.parse(request.requestedAt) <= Date.parse(current.activeFrom)) {
            throw new DomainError('INVALID_ASSIGNMENT', 'A reassignment must take effect after the period it supersedes begins.');
        }
        if (current.managerId === request.managerId) {
            throw new DomainError('INVALID_ASSIGNMENT', 'The patient is already assigned to this case manager.');
        }
        closedPeriod = { ...current, activeUntil: request.requestedAt };
    }
    const openedPeriod = {
        id: `case_${request.idempotency.recordId}`,
        patientId: request.patientId,
        managerId: request.managerId,
        activeFrom: request.requestedAt,
        activeUntil: null
    };
    const auditEvent = planAuditEvent({
        eventId: `audit_case_${request.idempotency.recordId}`,
        occurredAt: request.requestedAt,
        action: closedPeriod === null
            ? 'case_manager_assigned'
            : 'case_manager_reassigned',
        resourceType: 'case',
        resourceId: request.patientId,
        before: closedPeriod === null ? null : caseState(closedPeriod),
        after: caseState(openedPeriod),
        context: request.audit
    });
    return {
        closedPeriod,
        openedPeriod,
        auditEvent,
        idempotencyRecord: planIdempotencyRecord(request.idempotency, openedPeriod.id, request.requestedAt, 'case_assignment')
    };
}
/**
 * Narrows an effective-dated period to the shape payroll credits consume. An
 * open period simply omits `activeUntil`, which is exactly the "still active"
 * case `assertAssignmentCoversCompletion` expects.
 */
export function toActiveCaseAssignment(period) {
    return {
        patientId: period.patientId,
        managerId: period.managerId,
        activeFrom: period.activeFrom,
        ...(period.activeUntil === null ? {} : { activeUntil: period.activeUntil })
    };
}
/**
 * A patient's assignment history is consistent when its periods are contiguous,
 * never overlap, and at most one is open. This is the invariant a reassignment
 * preserves; a merge or a hand-edited history that broke it would let two
 * managers claim the same completion.
 */
export function assertConsistentAssignmentHistory(periods) {
    const ordered = [...periods].sort((left, right) => Date.parse(left.activeFrom) - Date.parse(right.activeFrom));
    for (const [index, period] of ordered.entries()) {
        assertUtcTimestamp(period.activeFrom, 'period.activeFrom');
        const isLast = index === ordered.length - 1;
        if (period.activeUntil === null) {
            if (!isLast) {
                throw new DomainError('INVALID_ASSIGNMENT', 'Only the most recent assignment period may stay open.');
            }
            continue;
        }
        assertUtcTimestamp(period.activeUntil, 'period.activeUntil');
        if (Date.parse(period.activeUntil) <= Date.parse(period.activeFrom)) {
            throw new DomainError('INVALID_ASSIGNMENT', 'An assignment period must end after it begins.');
        }
        const next = ordered[index + 1];
        if (next !== undefined &&
            Date.parse(next.activeFrom) < Date.parse(period.activeUntil)) {
            throw new DomainError('INVALID_ASSIGNMENT', 'Assignment periods for a patient must not overlap.');
        }
    }
}
