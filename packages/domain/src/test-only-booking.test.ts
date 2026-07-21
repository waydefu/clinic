import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  completeTestOnlyAppointment,
  createTestOnlyBookingState,
  requestTestOnlyCancellation,
  reserveTestOnlyAppointment,
  type ReserveTestOnlyAppointmentCommand,
  type TestOnlyBookingPolicy
} from './test-only-booking.js';

const policy: TestOnlyBookingPolicy = {
  policyVersion: 'privacy-v1',
  serviceId: 'service_test_consult',
  allowedCreateActorRoles: ['test_patient', 'test_front_desk'],
  allowedCancellationActorRoles: ['test_patient', 'test_front_desk'],
  allowedCompletionActorRoles: [
    'test_front_desk',
    'test_clinic_admin',
    'test_system'
  ]
};

const bookingCommand: ReserveTestOnlyAppointmentCommand = {
  idempotencyKey: 'booking_test_key_0001',
  appointmentId: 'appointment_test_001',
  patientId: 'patient_test_001',
  slotId: 'slot_test_001',
  serviceId: 'service_test_consult',
  actor: { id: 'actor_test_patient_001', role: 'test_patient' },
  requestedAt: '2026-08-01T08:00:00Z',
  privacyAcceptance: {
    policyVersion: 'privacy-v1',
    acceptedAt: '2026-08-01T08:00:00Z'
  }
};

function state() {
  return createTestOnlyBookingState([
    {
      id: 'slot_test_001',
      startsAt: '2026-08-02T10:00:00Z',
      endsAt: '2026-08-02T10:30:00Z'
    },
    {
      id: 'slot_test_002',
      startsAt: '2026-08-02T10:30:00Z',
      endsAt: '2026-08-02T11:00:00Z'
    }
  ]);
}

function expectDomainError(
  operation: () => unknown,
  code: DomainError['code']
) {
  try {
    operation();
    throw new Error(`Expected domain error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code });
  }
}

describe('test-only booking workflow', () => {
  it('reserves once and writes only opaque audit and outbox data', () => {
    const result = reserveTestOnlyAppointment(state(), policy, bookingCommand);

    expect(result.replayed).toBe(false);
    expect(result.response).toEqual({
      appointmentId: 'appointment_test_001',
      status: 'confirmed',
      startsAt: '2026-08-02T10:00:00Z',
      endsAt: '2026-08-02T10:30:00Z'
    });
    expect(result.state.slotsById.slot_test_001?.reservationId).toBe(
      'appointment_test_001'
    );
    expect(result.state.auditEvents).toEqual([
      {
        id: 'audit_appointment_test_001_confirmed',
        action: 'appointment_confirmed',
        actorId: 'actor_test_patient_001',
        appointmentId: 'appointment_test_001',
        occurredAt: '2026-08-01T08:00:00Z'
      }
    ]);
    expect(result.state.outboxJobs).toEqual([
      {
        id: 'outbox_appointment_test_001_confirmed',
        type: 'calendar_projection_requested',
        appointmentId: 'appointment_test_001',
        appointmentStatus: 'confirmed',
        idempotencyKey: 'booking_test_key_0001'
      }
    ]);
    expect('patientId' in result.state.outboxJobs[0]).toBe(false);
  });

  it('replays an identical booking idempotency key without another write', () => {
    const first = reserveTestOnlyAppointment(state(), policy, bookingCommand);
    const replay = reserveTestOnlyAppointment(
      first.state,
      policy,
      bookingCommand
    );

    expect(replay.replayed).toBe(true);
    expect(replay.response).toEqual(first.response);
    expect(replay.state).toBe(first.state);
    expect(replay.state.auditEvents).toHaveLength(1);
    expect(replay.state.outboxJobs).toHaveLength(1);
  });

  it('rejects a reused idempotency key whose request is different', () => {
    const conflictingCommand: ReserveTestOnlyAppointmentCommand = {
      ...bookingCommand,
      slotId: 'slot_test_002'
    };

    expect(() =>
      reserveTestOnlyAppointment(state(), policy, conflictingCommand)
    ).not.toThrow();

    const first = reserveTestOnlyAppointment(state(), policy, bookingCommand);
    expectDomainError(
      () => reserveTestOnlyAppointment(first.state, policy, conflictingCommand),
      'IDEMPOTENCY_KEY_REUSED'
    );
  });

  it('rejects a second reservation of the same slot', () => {
    const first = reserveTestOnlyAppointment(state(), policy, bookingCommand);
    const conflictingCommand: ReserveTestOnlyAppointmentCommand = {
      ...bookingCommand,
      idempotencyKey: 'booking_test_key_0002',
      appointmentId: 'appointment_test_002',
      patientId: 'patient_test_002'
    };

    expectDomainError(
      () => reserveTestOnlyAppointment(first.state, policy, conflictingCommand),
      'SLOT_UNAVAILABLE'
    );
  });

  it('enforces the supplied cancellation cutoff and records a cancellation once', () => {
    const booked = reserveTestOnlyAppointment(state(), policy, bookingCommand);
    const cancellation = requestTestOnlyCancellation(booked.state, policy, {
      idempotencyKey: 'cancel_test_key_0001',
      appointmentId: 'appointment_test_001',
      actor: { id: 'actor_test_patient_001', role: 'test_patient' },
      requestedAt: '2026-08-01T09:00:00Z',
      cancellationCutoffAt: '2026-08-01T10:00:00Z'
    });

    expect(cancellation.response.status).toBe('cancellation_requested');
    expect(cancellation.state.auditEvents).toHaveLength(2);
    expect(cancellation.state.outboxJobs).toHaveLength(2);

    const replay = requestTestOnlyCancellation(cancellation.state, policy, {
      idempotencyKey: 'cancel_test_key_0001',
      appointmentId: 'appointment_test_001',
      actor: { id: 'actor_test_patient_001', role: 'test_patient' },
      requestedAt: '2026-08-01T09:30:00Z',
      cancellationCutoffAt: '2026-08-01T10:00:00Z'
    });
    expect(replay.replayed).toBe(true);
    expect(replay.state.auditEvents).toHaveLength(2);

    expectDomainError(
      () =>
        requestTestOnlyCancellation(booked.state, policy, {
          idempotencyKey: 'cancel_test_key_0002',
          appointmentId: 'appointment_test_001',
          actor: { id: 'actor_test_patient_001', role: 'test_patient' },
          requestedAt: '2026-08-01T10:00:01Z',
          cancellationCutoffAt: '2026-08-01T10:00:00Z'
        }),
      'CANCELLATION_WINDOW_CLOSED'
    );
  });

  it('requires an authorised role to complete an appointment and audits success', () => {
    const booked = reserveTestOnlyAppointment(state(), policy, bookingCommand);

    expectDomainError(
      () =>
        completeTestOnlyAppointment(booked.state, policy, {
          idempotencyKey: 'complete_test_key_0001',
          appointmentId: 'appointment_test_001',
          actor: { id: 'actor_test_patient_001', role: 'test_patient' },
          completedAt: '2026-08-02T10:31:00Z'
        }),
      'COMPLETION_NOT_AUTHORIZED'
    );

    const completed = completeTestOnlyAppointment(booked.state, policy, {
      idempotencyKey: 'complete_test_key_0002',
      appointmentId: 'appointment_test_001',
      actor: { id: 'actor_test_front_desk_001', role: 'test_front_desk' },
      completedAt: '2026-08-02T10:31:00Z'
    });

    expect(completed.response.status).toBe('completed');
    expect(completed.state.auditEvents.at(-1)).toEqual({
      id: 'audit_appointment_test_001_completed',
      action: 'appointment_completed',
      actorId: 'actor_test_front_desk_001',
      appointmentId: 'appointment_test_001',
      occurredAt: '2026-08-02T10:31:00Z'
    });
  });
});
