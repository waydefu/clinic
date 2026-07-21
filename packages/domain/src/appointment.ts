import { DomainError } from './errors.js';

export type AppointmentStatus =
  | 'confirmed'
  | 'cancellation_requested'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type CompletionActorRole = 'clinic_admin' | 'front_desk' | 'system';

export interface Appointment {
  readonly id: string;
  readonly patientId: string;
  readonly slotId: string;
  readonly status: AppointmentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface AvailabilitySlot {
  readonly id: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reservationId?: string;
}

export interface ReservedSlot extends AvailabilitySlot {
  readonly reservationId: string;
}

export function reserveSlot(
  slot: AvailabilitySlot,
  appointmentId: string
): ReservedSlot {
  assertIdentifier(appointmentId, 'appointmentId');
  assertTimestampRange(slot.startsAt, slot.endsAt, 'slot');

  if (slot.reservationId !== undefined) {
    throw new DomainError(
      'SLOT_UNAVAILABLE',
      'A reserved slot cannot be reserved again.'
    );
  }

  return { ...slot, reservationId: appointmentId };
}

/**
 * The product owner will set a cancellation rule per service.  This function
 * deliberately receives the resolved cutoff rather than embedding a clinic
 * policy value in source code.
 */
export function requestCancellation(
  appointment: Appointment,
  requestedAt: string,
  cancellationCutoffAt: string
): Appointment {
  assertUtcTimestamp(requestedAt, 'requestedAt');
  assertUtcTimestamp(cancellationCutoffAt, 'cancellationCutoffAt');

  if (appointment.status !== 'confirmed') {
    throw new DomainError(
      'APPOINTMENT_NOT_CANCELLABLE',
      'Only a confirmed appointment can request cancellation.'
    );
  }

  if (Date.parse(requestedAt) > Date.parse(cancellationCutoffAt)) {
    throw new DomainError(
      'CANCELLATION_WINDOW_CLOSED',
      'The supplied cancellation cutoff has passed.'
    );
  }

  return {
    ...appointment,
    status: 'cancellation_requested',
    updatedAt: requestedAt
  };
}

export function markAppointmentCompleted(
  appointment: Appointment,
  actorRole: CompletionActorRole,
  completedAt: string
): Appointment {
  assertUtcTimestamp(completedAt, 'completedAt');

  if (appointment.status !== 'confirmed') {
    throw new DomainError(
      'APPOINTMENT_NOT_CONFIRMABLE',
      'Only a confirmed appointment can be marked completed.'
    );
  }

  if (!['clinic_admin', 'front_desk', 'system'].includes(actorRole)) {
    throw new DomainError(
      'COMPLETION_NOT_AUTHORIZED',
      'The actor role cannot mark an appointment as completed.'
    );
  }

  return {
    ...appointment,
    status: 'completed',
    completedAt,
    updatedAt: completedAt
  };
}

export function assertUtcTimestamp(value: string, fieldName: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid UTC ISO-8601 timestamp.`
    );
  }
}

function assertTimestampRange(
  startsAt: string,
  endsAt: string,
  fieldName: string
): void {
  assertUtcTimestamp(startsAt, `${fieldName}.startsAt`);
  assertUtcTimestamp(endsAt, `${fieldName}.endsAt`);

  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must end after it starts.`
    );
  }
}

function assertIdentifier(value: string, fieldName: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}
