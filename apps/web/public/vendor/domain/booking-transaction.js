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
    if (slot === undefined) {
        throw new DomainError('SLOT_UNAVAILABLE', 'The slot does not exist.');
    }
    if (slot.id !== request.slotId) {
        throw new DomainError('INVALID_VALUE', 'The slot does not match the request.');
    }
    if (slot.reservationId !== undefined) {
        throw new DomainError('SLOT_UNAVAILABLE', 'A reserved slot cannot be reserved again.');
    }
    if (slot.kind !== request.bookingKind) {
        throw new DomainError('BOOKING_KIND_MISMATCH', 'The slot belongs to a different booking kind.');
    }
    if (activeBookingCount >= ACTIVE_BOOKING_LIMIT) {
        throw new DomainError('DUPLICATE_ACTIVE_BOOKING', 'The patient already has an active booking.');
    }
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
            idempotencyKey: `calendar_confirmed_${request.appointmentId}`,
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
