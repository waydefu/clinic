import {
  type Appointment,
  type AppointmentStatus,
  type AvailabilitySlot,
  type CompletionActorRole,
  markAppointmentCompleted,
  requestCancellation,
  reserveSlot
} from './appointment.js';
import { DomainError } from './errors.js';

/**
 * A pure, in-memory model for the documented synthetic-only Phase 1 profile.
 * It is not a repository, Firestore transaction, API route or production
 * policy. The caller must pass the policy values explicitly so test defaults
 * cannot silently become clinic configuration.
 */
export type TestOnlyActorRole =
  | 'test_patient'
  | 'test_front_desk'
  | 'test_clinic_admin'
  | 'test_system';

export interface TestOnlyActor {
  readonly id: string;
  readonly role: TestOnlyActorRole;
}

export interface TestOnlyBookingPolicy {
  readonly policyVersion: string;
  readonly serviceId: string;
  readonly allowedCreateActorRoles: readonly TestOnlyActorRole[];
  readonly allowedCancellationActorRoles: readonly TestOnlyActorRole[];
  readonly allowedCompletionActorRoles: readonly TestOnlyActorRole[];
}

export interface TestOnlyAppointment extends Appointment {
  readonly serviceId: string;
  readonly privacyPolicyVersion: string;
}

export interface TestOnlyAuditEvent {
  readonly id: string;
  readonly action:
    | 'appointment_confirmed'
    | 'cancellation_requested'
    | 'appointment_completed';
  readonly actorId: string;
  readonly appointmentId: string;
  readonly occurredAt: string;
}

/**
 * The payload deliberately contains no patient/contact/medical data. A worker
 * could later consume this only after real Calendar decisions are approved.
 */
export interface TestOnlyOutboxJob {
  readonly id: string;
  readonly type: 'calendar_projection_requested';
  readonly appointmentId: string;
  readonly appointmentStatus: AppointmentStatus;
  readonly idempotencyKey: string;
}

export interface TestOnlyAppointmentResponse {
  readonly appointmentId: string;
  readonly status:
    | 'confirmed'
    | 'cancellation_requested'
    | 'completed';
  readonly startsAt: string;
  readonly endsAt: string;
}

interface TestOnlyIdempotencyRecord {
  readonly fingerprint: string;
  readonly response: TestOnlyAppointmentResponse;
}

export interface TestOnlyBookingState {
  readonly slotsById: Readonly<Record<string, AvailabilitySlot>>;
  readonly appointmentsById: Readonly<Record<string, TestOnlyAppointment>>;
  readonly idempotencyByKey: Readonly<
    Record<string, TestOnlyIdempotencyRecord | undefined>
  >;
  readonly auditEvents: readonly TestOnlyAuditEvent[];
  readonly outboxJobs: readonly TestOnlyOutboxJob[];
}

export interface ReserveTestOnlyAppointmentCommand {
  readonly idempotencyKey: string;
  readonly appointmentId: string;
  readonly patientId: string;
  readonly slotId: string;
  readonly serviceId: string;
  readonly actor: TestOnlyActor;
  readonly requestedAt: string;
  readonly privacyAcceptance: {
    readonly policyVersion: string;
    readonly acceptedAt: string;
  };
}

export interface RequestTestOnlyCancellationCommand {
  readonly idempotencyKey: string;
  readonly appointmentId: string;
  readonly actor: TestOnlyActor;
  readonly requestedAt: string;
  readonly cancellationCutoffAt: string;
}

export interface CompleteTestOnlyAppointmentCommand {
  readonly idempotencyKey: string;
  readonly appointmentId: string;
  readonly actor: TestOnlyActor;
  readonly completedAt: string;
}

export interface TestOnlyCommandResult {
  readonly state: TestOnlyBookingState;
  readonly response: TestOnlyAppointmentResponse;
  readonly replayed: boolean;
}

export function createTestOnlyBookingState(
  slots: readonly AvailabilitySlot[]
): TestOnlyBookingState {
  const slotsById: Record<string, AvailabilitySlot> = {};

  for (const slot of slots) {
    assertOpaqueIdentifier(slot.id, 'slot.id');
    assertUtcTimestamp(slot.startsAt, 'slot.startsAt');
    assertUtcTimestamp(slot.endsAt, 'slot.endsAt');
    if (slotsById[slot.id] !== undefined) {
      throw new DomainError('INVALID_VALUE', 'Test-only slot IDs must be unique.');
    }
    slotsById[slot.id] = { ...slot };
  }

  return {
    slotsById,
    appointmentsById: {},
    idempotencyByKey: {},
    auditEvents: [],
    outboxJobs: []
  };
}

export function reserveTestOnlyAppointment(
  state: TestOnlyBookingState,
  policy: TestOnlyBookingPolicy,
  command: ReserveTestOnlyAppointmentCommand
): TestOnlyCommandResult {
  assertTestOnlyPolicy(policy);
  assertReservationCommand(command);
  assertActorAllowed(
    command.actor,
    policy.allowedCreateActorRoles,
    'The synthetic actor cannot create an appointment.'
  );

  if (command.serviceId !== policy.serviceId) {
    throw new DomainError(
      'INVALID_VALUE',
      'The synthetic request service does not match the supplied test policy.'
    );
  }
  if (command.privacyAcceptance.policyVersion !== policy.policyVersion) {
    throw new DomainError(
      'INVALID_VALUE',
      'The synthetic privacy policy version does not match the supplied test policy.'
    );
  }

  const fingerprint = reservationFingerprint(command);
  const replay = replayOrReject(state, command.idempotencyKey, fingerprint);
  if (replay !== undefined) return replay;

  if (state.appointmentsById[command.appointmentId] !== undefined) {
    throw new DomainError('INVALID_VALUE', 'The synthetic appointment ID already exists.');
  }

  const slot = state.slotsById[command.slotId];
  if (slot === undefined) {
    throw new DomainError('SLOT_NOT_FOUND', 'The synthetic slot does not exist.');
  }

  const reservedSlot = reserveSlot(slot, command.appointmentId);
  const appointment: TestOnlyAppointment = {
    id: command.appointmentId,
    patientId: command.patientId,
    slotId: command.slotId,
    serviceId: command.serviceId,
    privacyPolicyVersion: command.privacyAcceptance.policyVersion,
    status: 'confirmed',
    createdAt: command.requestedAt,
    updatedAt: command.requestedAt
  };
  const response = toResponse(appointment, reservedSlot);

  return withTransition(state, {
    idempotencyKey: command.idempotencyKey,
    fingerprint,
    response,
    updatedSlot: reservedSlot,
    appointment,
    auditEvent: {
      id: `audit_${command.appointmentId}_confirmed`,
      action: 'appointment_confirmed',
      actorId: command.actor.id,
      appointmentId: command.appointmentId,
      occurredAt: command.requestedAt
    },
    outboxJob: {
      id: `outbox_${command.appointmentId}_confirmed`,
      type: 'calendar_projection_requested',
      appointmentId: command.appointmentId,
      appointmentStatus: 'confirmed',
      idempotencyKey: command.idempotencyKey
    }
  });
}

export function requestTestOnlyCancellation(
  state: TestOnlyBookingState,
  policy: TestOnlyBookingPolicy,
  command: RequestTestOnlyCancellationCommand
): TestOnlyCommandResult {
  assertTestOnlyPolicy(policy);
  assertOpaqueIdentifier(command.appointmentId, 'appointmentId');
  assertIdempotencyKey(command.idempotencyKey);
  assertActor(command.actor);
  assertUtcTimestamp(command.requestedAt, 'requestedAt');
  assertUtcTimestamp(command.cancellationCutoffAt, 'cancellationCutoffAt');
  assertActorAllowed(
    command.actor,
    policy.allowedCancellationActorRoles,
    'The synthetic actor cannot request cancellation.'
  );

  const fingerprint = cancellationFingerprint(command);
  const replay = replayOrReject(state, command.idempotencyKey, fingerprint);
  if (replay !== undefined) return replay;

  const appointment = findAppointment(state, command.appointmentId);
  const slot = findSlot(state, appointment.slotId);
  const cancelledAppointment = requestCancellation(
    appointment,
    command.requestedAt,
    command.cancellationCutoffAt
  ) as TestOnlyAppointment;
  const response = toResponse(cancelledAppointment, slot);

  return withTransition(state, {
    idempotencyKey: command.idempotencyKey,
    fingerprint,
    response,
    appointment: cancelledAppointment,
    auditEvent: {
      id: `audit_${command.appointmentId}_cancellation_requested`,
      action: 'cancellation_requested',
      actorId: command.actor.id,
      appointmentId: command.appointmentId,
      occurredAt: command.requestedAt
    },
    outboxJob: {
      id: `outbox_${command.appointmentId}_cancellation_requested`,
      type: 'calendar_projection_requested',
      appointmentId: command.appointmentId,
      appointmentStatus: 'cancellation_requested',
      idempotencyKey: command.idempotencyKey
    }
  });
}

export function completeTestOnlyAppointment(
  state: TestOnlyBookingState,
  policy: TestOnlyBookingPolicy,
  command: CompleteTestOnlyAppointmentCommand
): TestOnlyCommandResult {
  assertTestOnlyPolicy(policy);
  assertOpaqueIdentifier(command.appointmentId, 'appointmentId');
  assertIdempotencyKey(command.idempotencyKey);
  assertActor(command.actor);
  assertUtcTimestamp(command.completedAt, 'completedAt');
  assertActorAllowed(
    command.actor,
    policy.allowedCompletionActorRoles,
    'The synthetic actor cannot complete an appointment.'
  );

  const completionActorRole = completionActorRoleFor(command.actor.role);
  if (completionActorRole === undefined) {
    throw new DomainError(
      'COMPLETION_NOT_AUTHORIZED',
      'The synthetic actor role cannot mark an appointment as completed.'
    );
  }

  const fingerprint = completionFingerprint(command);
  const replay = replayOrReject(state, command.idempotencyKey, fingerprint);
  if (replay !== undefined) return replay;

  const appointment = findAppointment(state, command.appointmentId);
  const slot = findSlot(state, appointment.slotId);
  const completedAppointment = markAppointmentCompleted(
    appointment,
    completionActorRole,
    command.completedAt
  ) as TestOnlyAppointment;
  const response = toResponse(completedAppointment, slot);

  return withTransition(state, {
    idempotencyKey: command.idempotencyKey,
    fingerprint,
    response,
    appointment: completedAppointment,
    auditEvent: {
      id: `audit_${command.appointmentId}_completed`,
      action: 'appointment_completed',
      actorId: command.actor.id,
      appointmentId: command.appointmentId,
      occurredAt: command.completedAt
    },
    outboxJob: {
      id: `outbox_${command.appointmentId}_completed`,
      type: 'calendar_projection_requested',
      appointmentId: command.appointmentId,
      appointmentStatus: 'completed',
      idempotencyKey: command.idempotencyKey
    }
  });
}

function withTransition(
  state: TestOnlyBookingState,
  transition: {
    readonly idempotencyKey: string;
    readonly fingerprint: string;
    readonly response: TestOnlyAppointmentResponse;
    readonly updatedSlot?: AvailabilitySlot;
    readonly appointment: TestOnlyAppointment;
    readonly auditEvent: TestOnlyAuditEvent;
    readonly outboxJob: TestOnlyOutboxJob;
  }
): TestOnlyCommandResult {
  const slotsById = transition.updatedSlot
    ? { ...state.slotsById, [transition.updatedSlot.id]: transition.updatedSlot }
    : state.slotsById;

  return {
    state: {
      slotsById,
      appointmentsById: {
        ...state.appointmentsById,
        [transition.appointment.id]: transition.appointment
      },
      idempotencyByKey: {
        ...state.idempotencyByKey,
        [transition.idempotencyKey]: {
          fingerprint: transition.fingerprint,
          response: transition.response
        }
      },
      auditEvents: [...state.auditEvents, transition.auditEvent],
      outboxJobs: [...state.outboxJobs, transition.outboxJob]
    },
    response: transition.response,
    replayed: false
  };
}

function replayOrReject(
  state: TestOnlyBookingState,
  idempotencyKey: string,
  fingerprint: string
): TestOnlyCommandResult | undefined {
  const existing = state.idempotencyByKey[idempotencyKey];
  if (existing === undefined) return undefined;
  if (existing.fingerprint !== fingerprint) {
    throw new DomainError(
      'IDEMPOTENCY_KEY_REUSED',
      'The idempotency key was already used for a different synthetic command.'
    );
  }
  return { state, response: existing.response, replayed: true };
}

function findAppointment(
  state: TestOnlyBookingState,
  appointmentId: string
): TestOnlyAppointment {
  const appointment = state.appointmentsById[appointmentId];
  if (appointment === undefined) {
    throw new DomainError('INVALID_VALUE', 'The synthetic appointment does not exist.');
  }
  return appointment;
}

function findSlot(state: TestOnlyBookingState, slotId: string): AvailabilitySlot {
  const slot = state.slotsById[slotId];
  if (slot === undefined) {
    throw new DomainError('SLOT_NOT_FOUND', 'The synthetic slot does not exist.');
  }
  return slot;
}

function toResponse(
  appointment: TestOnlyAppointment,
  slot: AvailabilitySlot
): TestOnlyAppointmentResponse {
  if (
    appointment.status !== 'confirmed' &&
    appointment.status !== 'cancellation_requested' &&
    appointment.status !== 'completed'
  ) {
    throw new DomainError('INVALID_VALUE', 'The synthetic status cannot be returned.');
  }
  return {
    appointmentId: appointment.id,
    status: appointment.status,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt
  };
}

function assertTestOnlyPolicy(policy: TestOnlyBookingPolicy): void {
  assertOpaqueIdentifier(policy.serviceId, 'policy.serviceId');
  if (!/^privacy-v[1-9][0-9]*$/.test(policy.policyVersion)) {
    throw new DomainError(
      'INVALID_VALUE',
      'The synthetic policy version must use the privacy-vN format.'
    );
  }
}

function assertReservationCommand(
  command: ReserveTestOnlyAppointmentCommand
): void {
  assertIdempotencyKey(command.idempotencyKey);
  assertOpaqueIdentifier(command.appointmentId, 'appointmentId');
  assertOpaqueIdentifier(command.patientId, 'patientId');
  assertOpaqueIdentifier(command.slotId, 'slotId');
  assertOpaqueIdentifier(command.serviceId, 'serviceId');
  assertActor(command.actor);
  assertUtcTimestamp(command.requestedAt, 'requestedAt');
  assertUtcTimestamp(command.privacyAcceptance.acceptedAt, 'privacyAcceptance.acceptedAt');
}

function assertActor(actor: TestOnlyActor): void {
  assertOpaqueIdentifier(actor.id, 'actor.id');
}

function assertActorAllowed(
  actor: TestOnlyActor,
  allowedRoles: readonly TestOnlyActorRole[],
  message: string
): void {
  if (!allowedRoles.includes(actor.role)) {
    throw new DomainError('COMPLETION_NOT_AUTHORIZED', message);
  }
}

function completionActorRoleFor(
  role: TestOnlyActorRole
): CompletionActorRole | undefined {
  switch (role) {
    case 'test_front_desk':
      return 'front_desk';
    case 'test_clinic_admin':
      return 'clinic_admin';
    case 'test_system':
      return 'system';
    case 'test_patient':
      return undefined;
  }
}

function reservationFingerprint(command: ReserveTestOnlyAppointmentCommand): string {
  return JSON.stringify({
    operation: 'reserve',
    appointmentId: command.appointmentId,
    patientId: command.patientId,
    slotId: command.slotId,
    serviceId: command.serviceId,
    actorId: command.actor.id,
    actorRole: command.actor.role,
    policyVersion: command.privacyAcceptance.policyVersion,
    acceptedAt: command.privacyAcceptance.acceptedAt
  });
}

function cancellationFingerprint(
  command: RequestTestOnlyCancellationCommand
): string {
  return JSON.stringify({
    operation: 'cancel',
    appointmentId: command.appointmentId,
    actorId: command.actor.id,
    actorRole: command.actor.role,
    cancellationCutoffAt: command.cancellationCutoffAt
  });
}

function completionFingerprint(command: CompleteTestOnlyAppointmentCommand): string {
  return JSON.stringify({
    operation: 'complete',
    appointmentId: command.appointmentId,
    actorId: command.actor.id,
    actorRole: command.actor.role,
    completedAt: command.completedAt
  });
}

function assertIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      'The synthetic idempotency key must be an opaque 16-128 character value.'
    );
  }
}

function assertOpaqueIdentifier(value: string, fieldName: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
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
