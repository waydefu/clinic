import { assertSlotBookable, assertWithinActiveBookingLimit } from './appointment-rules.js';
import { planAuditEvent } from './audit.js';
import { calendarEventIdForAppointment } from './calendar-event-id.js';
import { DomainError } from './errors.js';
import { assertIdempotencyContext, planIdempotencyRecord } from './idempotency.js';
import { assertUtcTimestamp } from './timestamp.js';
/** 同一人同時最多兩筆未結束的預約。 */
export const ACTIVE_BOOKING_LIMIT = 2;
export const ACTIVE_BOOKING_STATUSES = [
    'confirmed',
    'cancellation_requested'
];
function assertIdentifier(value, fieldName) {
    if (!/^[A-Za-z0-9_:-]{1,128}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be an opaque identifier.`);
    }
}
function uniqueIdentifiers(values, fieldName) {
    const identifiers = [];
    const seen = new Set();
    for (const value of values) {
        if (typeof value !== 'string') {
            throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque identifiers.`);
        }
        assertIdentifier(value, fieldName);
        if (seen.has(value)) {
            throw new DomainError('INVALID_VALUE', `${fieldName} must not contain duplicates.`);
        }
        seen.add(value);
        identifiers.push(value);
    }
    return identifiers;
}
/**
 * Reads the canonical or legacy patient-guard document.
 *
 * New rows use `activeAppointmentIds`. Legacy rows use a single
 * `activeAppointmentId`. When both are present the array is the source of
 * truth so a partial write cannot double-count.
 */
export function parsePatientBookingGuard(data) {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        throw new DomainError('INVALID_VALUE', 'The patient booking guard is unreadable.');
    }
    const record = data;
    const updatedAt = record['updatedAt'];
    if (typeof updatedAt !== 'string') {
        throw new DomainError('INVALID_VALUE', 'The patient booking guard is unreadable.');
    }
    assertUtcTimestamp(updatedAt, 'updatedAt');
    const rawIds = record['activeAppointmentIds'];
    const ids = Array.isArray(rawIds) && rawIds.length > 0
        ? uniqueIdentifiers(rawIds, 'activeAppointmentIds')
        : typeof record['activeAppointmentId'] === 'string' &&
            record['activeAppointmentId'] !== ''
            ? uniqueIdentifiers([record['activeAppointmentId']], 'activeAppointmentId')
            : undefined;
    if (ids === undefined || ids.length === 0) {
        throw new DomainError('INVALID_VALUE', 'The patient booking guard is unreadable.');
    }
    return {
        activeAppointmentIds: ids,
        updatedAt
    };
}
export function patientBookingGuardHolds(guard, appointmentId) {
    return guard?.activeAppointmentIds.includes(appointmentId) === true;
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
    const activeIds = patientBookingGuard?.activeAppointmentIds ?? [];
    assertWithinActiveBookingLimit(activeIds.length);
    if (activeIds.includes(request.appointmentId)) {
        throw new DomainError('DUPLICATE_ACTIVE_BOOKING', 'The patient already has the maximum number of active bookings.');
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
    const auditEvent = planAuditEvent({
        eventId: `audit_${request.appointmentId}_confirmed_${request.idempotency.recordId}`,
        occurredAt: request.requestedAt,
        action: 'appointment_confirmed',
        resourceType: 'appointment',
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
            activeAppointmentIds: [...activeIds, request.appointmentId],
            updatedAt: request.requestedAt
        },
        auditEvent,
        // The Calendar projection is only ever an intent recorded in the same
        // transaction. The worker performs the external effect afterwards.
        outboxJob: {
            id: `outbox_${request.appointmentId}_confirmed_${request.idempotency.recordId}`,
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
            createdAt: request.requestedAt,
            nextAttemptAt: request.requestedAt
        },
        idempotencyRecord: planIdempotencyRecord(request.idempotency, request.appointmentId, request.requestedAt)
    };
}
