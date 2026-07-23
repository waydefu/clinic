import { describe, expect, it } from 'vitest';

import {
  ApiErrorCodeSchema,
  ApiErrorResponseSchema,
  CreateAppointmentRequestSchema,
  HealthResponseSchema,
  RescheduleAppointmentRequestSchema,
  RescheduleAppointmentResponseSchema,
  STAFF_TRANSITION_TO_DOMAIN,
  StaffAppointmentTransitionSchema,
  TransitionAppointmentRequestSchema,
  TransitionAppointmentResponseSchema
} from './index.js';

const unapprovedFields: ReadonlyArray<[string, Record<string, unknown>]> = [
  ['unapproved email', { email: 'patient@example.test' }],
  ['patient profile', { patient: { fullName: 'Example Patient' } }],
  ['client actor', { actorId: 'front_desk_001' }],
  ['client role', { role: 'admin' }],
  ['client patient id', { patientId: 'patient_001' }],
  ['client time', { requestedAt: '2026-07-20T09:00:00.000Z' }],
  ['free text', { notes: 'This field must not be collected.' }]
];

describe('v1 API contracts', () => {
  it('accepts only the appointment command fields', () => {
    expect(
      CreateAppointmentRequestSchema.parse({
        idempotencyKey: 'booking_request_0001',
        slotId: 'slot-001',
        serviceId: 'service-001',
        bookingKind: 'initial'
      })
    ).toEqual({
      idempotencyKey: 'booking_request_0001',
      slotId: 'slot-001',
      serviceId: 'service-001',
      bookingKind: 'initial'
    });
  });

  it.each([
    ['unapproved email', { email: 'patient@example.test' }],
    ['patient profile', { patient: { fullName: 'Example Patient' } }],
    ['client actor', { actorId: 'front_desk_001' }],
    ['client role', { role: 'admin' }],
    ['client patient id', { patientId: 'patient_001' }],
    ['client time', { requestedAt: '2026-07-20T09:00:00.000Z' }],
    [
      'unapproved privacy decision',
      {
        privacyAcceptance: {
          policyVersion: 'privacy-v1',
          acceptedAt: '2026-07-20T09:00:00.000Z'
        }
      }
    ],
    ['free text', { notes: 'This field must not be collected.' }]
  ])('rejects %s in a booking command', (_caseName, extraField) => {
    const result = CreateAppointmentRequestSchema.safeParse({
      idempotencyKey: 'booking_request_0001',
      slotId: 'slot-001',
      serviceId: 'service-001',
      bookingKind: 'initial',
      ...extraField
    });

    expect(result.success).toBe(false);
  });

  it('keeps health and errors in stable structured envelopes', () => {
    expect(
      HealthResponseSchema.parse({ service: 'api', status: 'ok' })
    ).toEqual({
      service: 'api',
      status: 'ok'
    });
    expect(
      ApiErrorResponseSchema.parse({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request cannot be processed.',
          correlationId: 'corr-001'
        }
      }).error.code
    ).toBe('VALIDATION_FAILED');
  });

  it('inventories every reserved v1 error code', () => {
    expect(ApiErrorCodeSchema.options).toEqual([
      'AUTHENTICATION_REQUIRED',
      'AUTHORIZATION_DENIED',
      'CONFLICT',
      'IDEMPOTENCY_MISMATCH',
      'INTERNAL_ERROR',
      'NOT_FOUND',
      'POLICY_ACCEPTANCE_REQUIRED',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
      'VALIDATION_FAILED'
    ]);
  });
});

describe('staff appointment transition command', () => {
  const validKey = 'transition_request_0001';

  it.each([['confirm_cancellation'], ['complete'], ['no_show']] as const)(
    'accepts the %s action with only a key',
    (transition) => {
      expect(
        TransitionAppointmentRequestSchema.parse({
          idempotencyKey: validKey,
          transition
        })
      ).toEqual({ idempotencyKey: validKey, transition });
    }
  );

  it('does not accept the patient-only request_cancellation action', () => {
    expect(StaffAppointmentTransitionSchema.options).toEqual([
      'confirm_cancellation',
      'complete',
      'no_show'
    ]);
    expect(
      TransitionAppointmentRequestSchema.safeParse({
        idempotencyKey: validKey,
        transition: 'request_cancellation'
      }).success
    ).toBe(false);
  });

  it.each(unapprovedFields)(
    'rejects %s in a transition command',
    (_caseName, extraField) => {
      expect(
        TransitionAppointmentRequestSchema.safeParse({
          idempotencyKey: validKey,
          transition: 'complete',
          ...extraField
        }).success
      ).toBe(false);
    }
  );

  it('maps each wire transition to exactly one domain transition', () => {
    // The domain planner (planTransition) owns whether a transition is allowed;
    // this only pins the vocabulary so the wire word cannot drift. The mapped
    // values must be the non-create, non-patient domain transitions.
    expect(STAFF_TRANSITION_TO_DOMAIN).toEqual({
      confirm_cancellation: 'cancel',
      complete: 'complete',
      no_show: 'no_show'
    });
    expect(new Set(Object.values(STAFF_TRANSITION_TO_DOMAIN))).toEqual(
      new Set(['cancel', 'complete', 'no_show'])
    );
  });

  it('returns only a resulting terminal status', () => {
    expect(
      TransitionAppointmentResponseSchema.parse({
        appointmentId: 'appointment_001',
        status: 'completed'
      })
    ).toEqual({ appointmentId: 'appointment_001', status: 'completed' });
    expect(
      TransitionAppointmentResponseSchema.safeParse({
        appointmentId: 'appointment_001',
        status: 'confirmed'
      }).success
    ).toBe(false);
  });
});

describe('reschedule command', () => {
  const validKey = 'reschedule_request_0001';

  it('accepts only the idempotency key and the target slot', () => {
    expect(
      RescheduleAppointmentRequestSchema.parse({
        idempotencyKey: validKey,
        targetSlotId: 'slot-002'
      })
    ).toEqual({ idempotencyKey: validKey, targetSlotId: 'slot-002' });
  });

  it.each(unapprovedFields)(
    'rejects %s in a reschedule command',
    (_caseName, extraField) => {
      expect(
        RescheduleAppointmentRequestSchema.safeParse({
          idempotencyKey: validKey,
          targetSlotId: 'slot-002',
          ...extraField
        }).success
      ).toBe(false);
    }
  );

  it('keeps the appointment confirmed and returns authoritative times', () => {
    expect(
      RescheduleAppointmentResponseSchema.parse({
        appointmentId: 'appointment_001',
        status: 'confirmed',
        startsAt: '2030-01-02T04:00:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      }).status
    ).toBe('confirmed');
    expect(
      RescheduleAppointmentResponseSchema.safeParse({
        appointmentId: 'appointment_001',
        status: 'confirmed',
        startsAt: '2030-01-02T04:00:00.000Z'
      }).success
    ).toBe(false);
  });
});
