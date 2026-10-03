import { calendarEventIdForAppointment, calendarEventIdForFollowUp } from './calendar-event-id.js';
import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';
const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
function assertOpaque(value, fieldName) {
    if (!OPAQUE_IDENTIFIER.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
    }
}
function assertPolicy(policy) {
    if (!Number.isInteger(policy.recoverableDays) || policy.recoverableDays < 1) {
        throw new DomainError('INVALID_VALUE', 'recoverableDays must be a positive integer.');
    }
}
function addUtcDays(isoUtc, days) {
    return new Date(Date.parse(isoUtc) + days * 24 * 60 * 60 * 1000).toISOString();
}
function assertProof(proof, requireReauthentication) {
    if (!proof.authorized ||
        (requireReauthentication && !proof.reauthenticated)) {
        throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'retention authorization and required re-authentication are required.');
    }
    assertOpaque(proof.scopeId, 'retention.scopeId');
    assertOpaque(proof.requestId, 'retention.requestId');
    assertOpaque(proof.authorizationReference, 'retention.authorizationReference');
    if (proof.reauthenticated) {
        if (proof.reauthenticationReference === undefined) {
            throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'a re-authentication reference is required.');
        }
        assertOpaque(proof.reauthenticationReference, 'retention.reauthenticationReference');
    }
}
function archiveWindow(input) {
    assertUtcTimestamp(input.archivedAt, 'archivedAt');
    return addUtcDays(input.archivedAt, input.policy.recoverableDays);
}
function assertArchivedWindow(input) {
    if (input.archivedAt === null) {
        throw new DomainError('INVALID_VALUE', 'an archived resource must retain its original archivedAt.');
    }
    assertUtcTimestamp(input.archivedAt, 'archivedAt');
    const expectedUntil = archiveWindow({
        archivedAt: input.archivedAt,
        policy: input.policy
    });
    if (input.recoverableUntil !== expectedUntil) {
        throw new DomainError('INVALID_VALUE', 'recoverableUntil does not match the original archive boundary.');
    }
    assertUtcTimestamp(input.nowAt, 'nowAt');
}
/**
 * Plans one explicit retention operation. No operation is implicit: in
 * particular, an archive never schedules a permanent delete and a repeated
 * archive never extends the recovery window.
 */
export function planRetentionOperation(input) {
    assertOpaque(input.resourceId, 'retention.resourceId');
    assertOpaque(input.requestId, 'retention.requestId');
    assertUtcTimestamp(input.nowAt, 'nowAt');
    assertPolicy(input.policy);
    assertProof(input.proof, input.operation === 'archive' || input.operation === 'permanent_delete');
    if (input.proof.requestId !== input.requestId) {
        throw new DomainError('INVALID_VALUE', 'retention request references must agree.');
    }
    const archivedAt = input.archivedAt ?? null;
    const recoverableUntil = input.recoverableUntil ?? null;
    const base = {
        resourceId: input.resourceId,
        requestId: input.requestId,
        auditRequired: true,
        backupTreatment: 'unchanged_separate_process'
    };
    if (input.operation === 'archive') {
        if (input.state === 'permanently_deleted') {
            throw new DomainError('INVALID_VALUE', 'a permanently deleted resource cannot be revived.');
        }
        if (input.state === 'archived') {
            assertArchivedWindow({
                archivedAt,
                recoverableUntil,
                nowAt: input.nowAt,
                policy: input.policy
            });
            return {
                ...base,
                operation: 'archive',
                resultingState: 'archived',
                archivedAt,
                recoverableUntil,
                dependencyCheck: 'not_required',
                idempotency: 'already_applied'
            };
        }
        const originalArchivedAt = input.nowAt;
        return {
            ...base,
            operation: 'archive',
            resultingState: 'archived',
            archivedAt: originalArchivedAt,
            recoverableUntil: archiveWindow({
                archivedAt: originalArchivedAt,
                policy: input.policy
            }),
            dependencyCheck: 'not_required',
            idempotency: 'new_operation'
        };
    }
    if (input.state !== 'archived') {
        if (input.operation === 'permanent_delete' &&
            input.state === 'permanently_deleted') {
            return {
                ...base,
                operation: 'permanent_delete',
                resultingState: 'permanently_deleted',
                archivedAt,
                recoverableUntil,
                dependencyCheck: 'complete',
                idempotency: 'already_applied'
            };
        }
        throw new DomainError('INVALID_VALUE', `${input.operation} requires an archived resource.`);
    }
    const verifiedArchive = {
        archivedAt,
        recoverableUntil,
        nowAt: input.nowAt,
        policy: input.policy
    };
    assertArchivedWindow(verifiedArchive);
    const verifiedArchivedAt = verifiedArchive.archivedAt;
    const verifiedRecoverableUntil = verifiedArchive.recoverableUntil;
    if (input.operation === 'restore') {
        if (Date.parse(input.nowAt) >= Date.parse(verifiedRecoverableUntil)) {
            throw new DomainError('INVALID_VALUE', 'the recovery window has expired.');
        }
        return {
            ...base,
            operation: 'restore',
            resultingState: 'active',
            archivedAt: null,
            recoverableUntil: null,
            dependencyCheck: 'not_required',
            idempotency: 'new_operation'
        };
    }
    if (input.legalHold) {
        throw new DomainError('DELEGATION_NOT_AUTHORIZED', 'legal hold blocks permanent deletion.');
    }
    if (Date.parse(input.nowAt) < Date.parse(verifiedRecoverableUntil)) {
        throw new DomainError('INVALID_VALUE', 'permanent deletion is not eligible before the recovery window ends.');
    }
    if (input.dependenciesReconciled !== true) {
        throw new DomainError('INVALID_VALUE', 'dependent records and projections must be reconciled first.');
    }
    return {
        ...base,
        operation: 'permanent_delete',
        resultingState: 'permanently_deleted',
        archivedAt: verifiedArchivedAt,
        recoverableUntil: verifiedRecoverableUntil,
        dependencyCheck: 'complete',
        idempotency: 'new_operation'
    };
}
const RETENTION_JOB_TAG = {
    archive: 'ret_archive',
    restore: 'ret_restore',
    permanent_delete: 'ret_delete'
};
/**
 * Calendar is a projection of the patient record (ADR-0002), and the
 * appointment calendar carries the approved name/phone/month-day title. A
 * retention operation therefore re-projects every event the patient can own:
 *
 * - archive / restore: re-upsert so the worker rebuilds the title from the
 *   now-archived (minimal summary) or restored (full title) patient record;
 * - permanent_delete: cancel (`events.delete`) every appointment event and
 *   every dated follow-up reminder before the records disappear.
 *
 * The jobs carry identifiers, statuses and times only — never PII. The worker
 * still reads the live appointment status for ordinary events, so a job for
 * an already-cancelled appointment stays a harmless idempotent cancel.
 */
export function planRetentionCalendarProjections(input) {
    assertOpaque(input.requestId, 'requestId');
    assertUtcTimestamp(input.at, 'at');
    const tag = RETENTION_JOB_TAG[input.operation];
    const deleting = input.operation === 'permanent_delete';
    const common = {
        type: 'calendar_projection_requested',
        correlationId: input.requestId,
        causationId: input.requestId,
        status: 'pending',
        attempts: 0,
        createdAt: input.at,
        nextAttemptAt: input.at
    };
    const appointmentJobs = input.appointments.map((appointment) => {
        assertOpaque(appointment.id, 'appointmentId');
        return {
            ...common,
            id: `outbox_${appointment.id}_${tag}_${input.requestId}`,
            appointmentId: appointment.id,
            appointmentStatus: deleting ? 'deleted' : appointment.status,
            idempotencyKey: calendarEventIdForAppointment(appointment.id)
        };
    });
    // Only a dated `required` decision has a reminder event on the calendar.
    const followUpJobs = input.followUps.flatMap((followUp) => {
        if (followUp.decision !== 'required' || typeof followUp.dueAt !== 'string')
            return [];
        assertOpaque(followUp.appointmentId, 'followUpSourceId');
        assertUtcTimestamp(followUp.dueAt, 'dueAt');
        return [
            {
                ...common,
                id: `outbox_followup_${followUp.appointmentId}_${tag}_${input.requestId}`,
                appointmentId: followUp.appointmentId,
                followUpSourceId: followUp.appointmentId,
                appointmentStatus: deleting
                    ? 'follow_up_not_required'
                    : 'follow_up_required',
                ...(deleting ? {} : { startsAt: followUp.dueAt }),
                idempotencyKey: calendarEventIdForFollowUp(followUp.appointmentId)
            }
        ];
    });
    return [...appointmentJobs, ...followUpJobs];
}
