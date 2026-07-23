import { createHash } from 'node:crypto';

import type {
  AppointmentTransition,
  BookingKind,
  IdempotencyContext
} from '@beauessence/domain';

const CREATE_SCOPE = 'appointment:create';

function sha256(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function contextFor(
  key: string,
  actorId: string,
  scope: string,
  requestParts: readonly string[]
): IdempotencyContext {
  return {
    actorId,
    scope,
    requestHash: sha256(['appointment-request-v1', scope, ...requestParts]),
    recordId: sha256(['idempotency-record-v1', actorId, scope, key])
  };
}

export function createAppointmentIdempotency(input: {
  readonly key: string;
  readonly actorId: string;
  readonly patientId: string;
  readonly slotId: string;
  readonly bookingKind: BookingKind;
  readonly itemId: string;
}): IdempotencyContext {
  return contextFor(input.key, input.actorId, CREATE_SCOPE, [
    input.patientId,
    input.slotId,
    input.bookingKind,
    input.itemId
  ]);
}

export function transitionAppointmentIdempotency(input: {
  readonly key: string;
  readonly actorId: string;
  readonly appointmentId: string;
  readonly transition: AppointmentTransition;
}): IdempotencyContext {
  const scope = `appointment:${input.appointmentId}:transition`;
  return contextFor(input.key, input.actorId, scope, [
    input.appointmentId,
    input.transition
  ]);
}

export function rescheduleAppointmentIdempotency(input: {
  readonly key: string;
  readonly actorId: string;
  readonly appointmentId: string;
  readonly targetSlotId: string;
}): IdempotencyContext {
  const scope = `appointment:${input.appointmentId}:reschedule`;
  return contextFor(input.key, input.actorId, scope, [
    input.appointmentId,
    input.targetSlotId
  ]);
}
