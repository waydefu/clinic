import { describe, expect, it } from 'vitest';
import {
  CreateAppointmentRequestSchema,
  GetAppointmentResponseSchema
} from './appointments.js';

describe('identity-review request authority', () => {
  const command = {
    idempotencyKey: 'identity-synthetic-key-001',
    slotId: 'slot_identity_001',
    serviceId: 'service_identity_001',
    bookingKind: 'initial'
  };
  it.each(['identityReviewRequired', 'pendingArchivedPatientIds'])(
    'rejects a client-provided private flag or candidate list: %s',
    (field) => {
      expect(CreateAppointmentRequestSchema.safeParse(command).success).toBe(
        true
      );
      expect(
        CreateAppointmentRequestSchema.safeParse({
          ...command,
          [field]:
            field === 'identityReviewRequired'
              ? true
              : ['patient_archived_synthetic']
        }).success
      ).toBe(false);
    }
  );
});

const BASE = {
  appointmentId: 'appointment_identity_synthetic',
  status: 'confirmed',
  startsAt: '2030-01-02T04:00:00.000Z',
  endsAt: '2030-01-02T04:30:00.000Z'
};

describe('staff-only pending identity-review response flag', () => {
  it('accepts the true attention flag without changing older responses', () => {
    expect(
      GetAppointmentResponseSchema.parse({
        ...BASE,
        identityReviewRequired: true
      })
    ).toHaveProperty('identityReviewRequired', true);
    expect(GetAppointmentResponseSchema.parse(BASE)).not.toHaveProperty(
      'identityReviewRequired'
    );
  });

  it.each([false, 'true', 1, null])(
    'rejects values other than the server-owned true flag: %s',
    (identityReviewRequired) => {
      expect(
        GetAppointmentResponseSchema.safeParse({
          ...BASE,
          identityReviewRequired
        }).success
      ).toBe(false);
    }
  );

  it.each(['pendingArchivedPatientIds', 'archivedPatientIds'])(
    'rejects private archived candidate references: %s',
    (field) => {
      expect(
        GetAppointmentResponseSchema.safeParse({
          ...BASE,
          [field]: ['patient_archived_synthetic']
        }).success
      ).toBe(false);
    }
  );
});
