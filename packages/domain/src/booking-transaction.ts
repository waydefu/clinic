import { DomainError } from './errors.js';

/**
 * The I/O-free core of the booking write path.
 *
 * A Firestore transaction may be retried by the server at any time, so the
 * decision of *what to write* must be a pure function of the data that was
 * read. This module produces that decision; the repository is only allowed to
 * apply it. Nothing here may perform I/O, read a clock, generate an id or call
 * an external service — those all belong to the caller, and an external call
 * inside a transaction is forbidden outright (ADR-0002).
 */

export type BookingKind = 'initial' | 'follow_up';

/** 同一人同時只能有一筆未結束的預約。 */
export const ACTIVE_BOOKING_LIMIT = 1;
export const ACTIVE_BOOKING_STATUSES: readonly string[] = [
  'confirmed',
  'cancellation_requested'
];

export interface SlotSnapshot {
  readonly id: string;
  readonly kind: BookingKind;
  readonly startsAt: string;
  readonly reservationId?: string;
}

export interface BookingRequest {
  readonly appointmentId: string;
  readonly slotId: string;
  readonly patientId: string;
  readonly bookingKind: BookingKind;
  readonly itemId: string;
  readonly actorId: string;
  readonly requestedAt: string;
  readonly idempotencyKey: string;
}

export interface PlannedAppointment {
  readonly id: string;
  readonly slotId: string;
  readonly startsAt: string;
  readonly patientId: string;
  readonly bookingKind: BookingKind;
  readonly itemId: string;
  readonly status: 'confirmed';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlannedAuditEvent {
  readonly id: string;
  readonly action: 'appointment_confirmed';
  readonly appointmentId: string;
  readonly actorId: string;
  readonly occurredAt: string;
}

export interface PlannedOutboxJob {
  readonly id: string;
  readonly type: 'calendar_projection_requested';
  readonly appointmentId: string;
  readonly appointmentStatus: 'confirmed';
  readonly idempotencyKey: string;
  readonly status: 'pending';
  readonly attempts: 0;
  readonly createdAt: string;
}

export interface PlannedIdempotencyRecord {
  readonly key: string;
  readonly appointmentId: string;
  readonly recordedAt: string;
}

export interface BookingPlan {
  readonly appointment: PlannedAppointment;
  readonly slotReservation: {
    readonly slotId: string;
    readonly reservationId: string;
  };
  readonly auditEvent: PlannedAuditEvent;
  readonly outboxJob: PlannedOutboxJob;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

function assertIdentifier(value: string, fieldName: string): void {
  if (!/^[A-Za-z0-9_:-]{1,128}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}

function assertUtcTimestamp(value: string, fieldName: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid UTC ISO-8601 timestamp.`
    );
  }
}

/**
 * Decides the complete set of writes for one reservation.
 *
 * `activeBookingCount` is the number of the patient's own not-yet-finished
 * appointments, counted from data read inside the same transaction. Counting
 * it outside would reintroduce the race the transaction exists to prevent.
 */
export function planBooking(
  request: BookingRequest,
  slot: SlotSnapshot | undefined,
  activeBookingCount: number
): BookingPlan {
  assertIdentifier(request.appointmentId, 'appointmentId');
  assertIdentifier(request.patientId, 'patientId');
  assertIdentifier(request.idempotencyKey, 'idempotencyKey');
  assertUtcTimestamp(request.requestedAt, 'requestedAt');

  if (slot === undefined) {
    throw new DomainError('SLOT_UNAVAILABLE', 'The slot does not exist.');
  }
  if (slot.id !== request.slotId) {
    throw new DomainError(
      'INVALID_VALUE',
      'The slot does not match the request.'
    );
  }
  if (slot.reservationId !== undefined) {
    throw new DomainError(
      'SLOT_UNAVAILABLE',
      'A reserved slot cannot be reserved again.'
    );
  }
  if (slot.kind !== request.bookingKind) {
    throw new DomainError(
      'BOOKING_KIND_MISMATCH',
      'The slot belongs to a different booking kind.'
    );
  }
  if (activeBookingCount >= ACTIVE_BOOKING_LIMIT) {
    throw new DomainError(
      'DUPLICATE_ACTIVE_BOOKING',
      'The patient already has an active booking.'
    );
  }

  const appointment: PlannedAppointment = {
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
