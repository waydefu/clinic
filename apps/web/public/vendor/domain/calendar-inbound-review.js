import { isOnBookingKindGrid } from './calendar-projection.js';
import { isRole } from './roles.js';
/**
 * Clinic Calendar inbound review. Calendar never mutates Firestore until a
 * manager or front_desk approves a durable candidate against a fresh DB read.
 * `accepted` remains the public contract status (not a second "approved").
 */
export const CALENDAR_REVIEW_ROLES = ['manager', 'front_desk'];
export const CALENDAR_CANDIDATE_STATUSES = [
    'pending',
    'accepted',
    'rejected',
    'conflict',
    'superseded',
    'unmatched'
];
export const CALENDAR_INBOUND_AUDIT_ACTIONS = Object.freeze({
    detected: 'calendar_external_change_detected',
    candidateCreated: 'calendar_candidate_created',
    approved: 'calendar_candidate_accepted',
    rejected: 'calendar_candidate_rejected',
    superseded: 'calendar_candidate_superseded',
    unmatched: 'calendar_candidate_unmatched',
    goneRecovered: 'calendar_sync_token_410_recovered',
    mappingRepaired: 'calendar_mapping_repaired',
    projectionRestored: 'calendar_projection_restored'
});
export function canReviewCalendarCandidate(role) {
    return (role !== undefined &&
        isRole(role) &&
        CALENDAR_REVIEW_ROLES.includes(role));
}
export function assertCanReviewCalendarCandidate(role) {
    if (!canReviewCalendarCandidate(role)) {
        throw Object.assign(new Error('Calendar review is not authorized.'), {
            name: 'CalendarReviewDeniedError'
        });
    }
}
export function planCalendarInboundDetection(input) {
    if (input.selfProjectedEcho)
        return { action: 'skip_echo' };
    if (input.appointmentId === undefined ||
        input.liveAppointment === undefined ||
        input.logicalKind === 'follow_up_reminder') {
        return {
            action: 'candidate',
            status: 'unmatched',
            changeType: 'unmatched',
            changedFields: []
        };
    }
    if (input.eventCancelled) {
        return {
            action: 'candidate',
            status: 'pending',
            changeType: 'delete',
            appointmentId: input.appointmentId,
            changedFields: []
        };
    }
    const changedFields = [];
    if (input.proposedStartsAt !== undefined &&
        input.proposedStartsAt !== input.liveAppointment.startsAt)
        changedFields.push('startsAt', 'endsAt');
    if (changedFields.length === 0)
        return { action: 'skip_echo' };
    return {
        action: 'candidate',
        status: 'pending',
        changeType: 'reschedule',
        appointmentId: input.appointmentId,
        changedFields
    };
}
export function planCalendarCandidateReview(input) {
    if (!canReviewCalendarCandidate(input.role))
        return { outcome: 'denied', reason: 'role' };
    if (input.action === 'reject') {
        return {
            outcome: 'noop',
            nextStatus: 'rejected',
            restoreCalendar: input.candidate.appointmentId !== undefined,
            mutateAppointment: false,
            auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.rejected
        };
    }
    if (input.candidate.status !== 'pending' ||
        input.candidate.changeType === 'unmatched' ||
        input.candidate.appointmentId === undefined ||
        input.liveAppointment === undefined) {
        return {
            outcome: 'conflict',
            nextStatus: 'conflict',
            reason: 'unmatched',
            mutateAppointment: false,
            auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.superseded
        };
    }
    if (input.liveAppointment.appointmentId !== input.candidate.appointmentId ||
        (input.candidate.expectedStartsAt !== undefined &&
            input.liveAppointment.startsAt !== input.candidate.expectedStartsAt) ||
        (input.candidate.expectedStatus !== undefined &&
            input.liveAppointment.status !== input.candidate.expectedStatus)) {
        return {
            outcome: 'conflict',
            nextStatus: 'superseded',
            reason: 'stale',
            mutateAppointment: false,
            auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.superseded
        };
    }
    if (input.candidate.changeType === 'delete') {
        return {
            outcome: 'apply',
            command: 'cancel',
            nextStatus: 'accepted',
            mutateAppointment: true,
            auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.approved
        };
    }
    const proposedStartsAt = input.candidate.proposedStartsAt;
    if (proposedStartsAt === undefined) {
        return {
            outcome: 'conflict',
            nextStatus: 'conflict',
            reason: 'off_grid',
            mutateAppointment: false,
            auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.superseded
        };
    }
    if (!isOnBookingKindGrid(proposedStartsAt, input.liveAppointment.bookingKind)) {
        return {
            outcome: 'conflict',
            nextStatus: 'conflict',
            reason: 'off_grid',
            mutateAppointment: false,
            auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.superseded
        };
    }
    if (input.targetSlot === undefined ||
        input.targetSlot.startsAt !== proposedStartsAt ||
        input.targetSlot.kind !== input.liveAppointment.bookingKind) {
        return {
            outcome: 'conflict',
            nextStatus: 'conflict',
            reason: 'off_grid',
            mutateAppointment: false,
            auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.superseded
        };
    }
    if (input.targetSlot.reservationId !== undefined &&
        input.targetSlot.reservationId !== input.liveAppointment.appointmentId) {
        return {
            outcome: 'conflict',
            nextStatus: 'conflict',
            reason: 'slot_occupied',
            mutateAppointment: false,
            auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.superseded
        };
    }
    return {
        outcome: 'apply',
        command: 'reschedule',
        targetSlotId: input.targetSlot.id,
        nextStatus: 'accepted',
        mutateAppointment: true,
        auditAction: CALENDAR_INBOUND_AUDIT_ACTIONS.approved
    };
}
