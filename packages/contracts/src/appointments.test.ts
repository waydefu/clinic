import { describe, expect, it } from 'vitest';

import {
  ApiErrorResponseSchema,
  CreateAppointmentRequestSchema,
  HealthResponseSchema
} from './index.js';

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
});
