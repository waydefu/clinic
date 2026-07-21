import { describe, expect, it } from 'vitest';

import {
  ApiErrorResponseSchema,
  CreateAppointmentRequestSchema,
  HealthResponseSchema
} from './index.js';

describe('v1 API contracts', () => {
  it('rejects unbounded free text in a booking request', () => {
    const result = CreateAppointmentRequestSchema.safeParse({
      idempotencyKey: 'booking_request_0001',
      slotId: 'slot-001',
      serviceId: 'service-001',
      patient: {
        fullName: 'Example Patient',
        mobileE164: '+15555550123',
        notes: 'This field must not be collected.'
      },
      privacyAcceptance: {
        policyVersion: 'privacy-v1',
        acceptedAt: '2026-07-20T09:00:00.000Z'
      }
    });

    expect(result.success).toBe(false);
  });

  it('keeps health and errors in stable structured envelopes', () => {
    expect(HealthResponseSchema.parse({ service: 'api', status: 'ok' })).toEqual({
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
