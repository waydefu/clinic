import { assertSlotBookable, assertWithinActiveBookingLimit } from './appointment-rules.js';
import { calendarEventIdForStatus } from './calendar-event-id.js';
import { DomainError } from './errors.js';
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
 * `activeBookingCount` is the number of the patient's own not-yet-finished
 * appointments, counted from data read inside the same transaction. Counting
 * it outside would reintroduce the race the transaction exists to prevent.
 */
export function planBooking(request, slot, activeBookingCount) {
    assertIdentifier(request.appointmentId, 'appointmentId');
    assertIdentifier(request.patientId, 'patientId');
    assertIdentifier(request.idempotencyKey, 'idempotencyKey');
    assertUtcTimestamp(request.requestedAt, 'requestedAt');
    // The slot/request-id mismatch is specific to this write path (the caller
    // passed a slot that is not the one it named), so it stays here. The booking
    // rules themselves come from the shared assertions.
    if (slot !== undefined && slot.id !== request.slotId) {
        throw new DomainError('INVALID_VALUE', 'The slot does not match the request.');
    }
    assertSlotBookable(slot, request.bookingKind);
    assertWithinActiveBookingLimit(activeBookingCount);
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
    return {
        appointment,
        slotReservation: {
            slotId: slot.id,
            reservationId: request.appointmentId
        },
        auditEvent: {
            id: `audit_${request.appointmentId}_confirmed`,
            action: 'appointment_confirmed',
            appointmentId: request.appointmentId,
            actorId: request.actorId,
            occurredAt: request.requestedAt
        },
        // The Calendar projection is only ever an intent recorded in the same
        // transaction. The worker performs the external effect afterwards.
        outboxJob: {
            id: `outbox_${request.appointmentId}_confirmed`,
            type: 'calendar_projection_requested',
            appointmentId: request.appointmentId,
            appointmentStatus: 'confirmed',
            // Calendar event ID 有嚴格字元限制，鍵一律由 calendar-event-id.ts 產生。
            idempotencyKey: calendarEventIdForStatus(request.appointmentId, 'confirmed'),
            status: 'pending',
            attempts: 0,
            createdAt: request.requestedAt
        },
        idempotencyRecord: {
            key: request.idempotencyKey,
            appointmentId: request.appointmentId,
            recordedAt: request.requestedAt
        }
    };
}
