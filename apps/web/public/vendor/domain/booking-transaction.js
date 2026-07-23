import { assertSlotBookable, assertWithinActiveBookingLimit } from './appointment-rules.js';
import { planAuditEvent } from './audit.js';
import { calendarEventIdForAppointment } from './calendar-event-id.js';
import { DomainError } from './errors.js';
import { assertIdempotencyContext, planIdempotencyRecord } from './idempotency.js';
/** 同一人同時只能有一筆未結束的預約。 */
export const ACTIVE_BOOKING_LIMIT = 1;
export const ACTIVE_BOOKING_STATUSES = [
    'confirmed',
    'cancellation_requested'
];
function assertIdentifier(value, fieldName) {
    if (!/^[A-Za-z0-9_:-]{1,128}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be an opaque identifier.`);
    }
}
function assertUtcTimestamp(value, fieldName) {
    if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
        throw new DomainError('INVALID_TIMESTAMP', `${fieldName} must be a valid UTC ISO-8601 timestamp.`);
    }
}
/**
 * Decides the complete set of writes for one reservation.
 *
 * `patientBookingGuard` is read from the patient's fixed guard document inside
 * the same transaction. Every booking for one patient therefore contends on
 * the same document even when requests target different slots.
 */
export function planBooking(request, slot, patientBookingGuard) {
    assertIdentifier(request.appointmentId, 'appointmentId');
    assertIdentifier(request.patientId, 'patientId');
    assertUtcTimestamp(request.requestedAt, 'requestedAt');
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    // The slot/request-id mismatch is specific to this write path (the caller
    // passed a slot that is not the one it named), so it stays here. The booking
    // rules themselves come from the shared assertions.
    if (slot !== undefined && slot.id !== request.slotId) {
        throw new DomainError('INVALID_VALUE', 'The slot does not match the request.');
    }
    assertSlotBookable(slot, request.bookingKind);
    assertWithinActiveBookingLimit(patientBookingGuard === undefined ? 0 : 1);
    const appointment = {
        id: request.appointmentId,
        slotId: slot.id,
        startsAt: slot.startsAt,
        patientId: request.patientId,
        bookingKind: request.bookingKind,
        itemId: request.itemId,
        status: 'confirmed',
        createdAt: request.requestedAt,
        updatedAt: request.requestedAt
    };
    const auditEvent = planAuditEvent({
        eventId: `audit_${request.appointmentId}_confirmed`,
        occurredAt: request.requestedAt,
        action: 'appointment_confirmed',
        resourceId: request.appointmentId,
        before: null,
        after: {
            status: 'confirmed',
            slotId: slot.id
        },
        context: request.audit
    });
    return {
        appointment,
        slotReservation: {
            slotId: slot.id,
            reservationId: request.appointmentId
        },
        patientBookingGuard: {
            activeAppointmentId: request.appointmentId,
            status: 'confirmed',
            updatedAt: request.requestedAt
        },
        auditEvent,
        // The Calendar projection is only ever an intent recorded in the same
        // transaction. The worker performs the external effect afterwards.
        outboxJob: {
            id: `outbox_${request.appointmentId}_confirmed`,
            type: 'calendar_projection_requested',
            appointmentId: request.appointmentId,
            correlationId: request.audit.correlationId,
            causationId: auditEvent.eventId,
            appointmentStatus: 'confirmed',
            // Calendar event ID 有嚴格字元限制，鍵一律由 calendar-event-id.ts 產生。
            // 一筆預約一個事件：後續的改期、到診、取消都指向同一個 ID。
            idempotencyKey: calendarEventIdForAppointment(request.appointmentId),
            status: 'pending',
            attempts: 0,
            createdAt: request.requestedAt
        },
        idempotencyRecord: planIdempotencyRecord(request.idempotency, request.appointmentId, request.requestedAt)
    };
}
