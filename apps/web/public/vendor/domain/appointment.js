import { DomainError } from './errors.js';
export function reserveSlot(slot, appointmentId) {
    assertIdentifier(appointmentId, 'appointmentId');
    assertTimestampRange(slot.startsAt, slot.endsAt, 'slot');
    if (slot.reservationId !== undefined) {
        throw new DomainError('SLOT_UNAVAILABLE', 'A reserved slot cannot be reserved again.');
    }
    return { ...slot, reservationId: appointmentId };
}
/**
 * The product owner will set a cancellation rule per service.  This function
 * deliberately receives the resolved cutoff rather than embedding a clinic
 * policy value in source code.
 */
export function requestCancellation(appointment, requestedAt, cancellationCutoffAt) {
    assertUtcTimestamp(requestedAt, 'requestedAt');
    assertUtcTimestamp(cancellationCutoffAt, 'cancellationCutoffAt');
    if (appointment.status !== 'confirmed') {
        throw new DomainError('APPOINTMENT_NOT_CANCELLABLE', 'Only a confirmed appointment can request cancellation.');
    }
    if (Date.parse(requestedAt) > Date.parse(cancellationCutoffAt)) {
        throw new DomainError('CANCELLATION_WINDOW_CLOSED', 'The supplied cancellation cutoff has passed.');
    }
    return {
        ...appointment,
        status: 'cancellation_requested',
        updatedAt: requestedAt
    };
}
export function markAppointmentCompleted(appointment, actorRole, completedAt) {
    assertUtcTimestamp(completedAt, 'completedAt');
    if (appointment.status !== 'confirmed') {
        throw new DomainError('APPOINTMENT_NOT_CONFIRMABLE', 'Only a confirmed appointment can be marked completed.');
    }
    if (!['clinic_admin', 'front_desk', 'system'].includes(actorRole)) {
        throw new DomainError('COMPLETION_NOT_AUTHORIZED', 'The actor role cannot mark an appointment as completed.');
    }
    return {
        ...appointment,
        status: 'completed',
        completedAt,
        updatedAt: completedAt
    };
}
export function assertUtcTimestamp(value, fieldName) {
    if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
        throw new DomainError('INVALID_TIMESTAMP', `${fieldName} must be a valid UTC ISO-8601 timestamp.`);
    }
}
function assertTimestampRange(startsAt, endsAt, fieldName) {
    assertUtcTimestamp(startsAt, `${fieldName}.startsAt`);
    assertUtcTimestamp(endsAt, `${fieldName}.endsAt`);
    if (Date.parse(startsAt) >= Date.parse(endsAt)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must end after it starts.`);
    }
}
function assertIdentifier(value, fieldName) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be an opaque identifier.`);
    }
}
