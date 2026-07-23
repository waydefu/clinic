import { describe, expect, it } from 'vitest';

import { AuditEventV2Schema } from './audit.js';

const EVENT = {
  eventId: 'audit_appointment_001_confirmed',
  occurredAt: '2026-07-23T15:00:00.000Z',
  actorId: 'actor_001',
  actorRole: 'test_front_desk',
  action: 'appointment_confirmed',
  resourceType: 'appointment',
  resourceId: 'appointment_001',
  before: null,
  after: {
    status: 'confirmed',
    slotId: 'slot_001'
  },
  reasonCode: null,
  result: 'succeeded',
  correlationId: 'corr_001',
  source: 'api',
  policyVersion: null,
  schemaVersion: 2
} as const;

describe('AuditEventV2Schema', () => {
  it('accepts the complete v2 envelope', () => {
    expect(AuditEventV2Schema.parse(EVENT)).toEqual(EVENT);
  });

  it.each([
    ['patient name', { fullName: 'Synthetic Patient' }],
    ['phone number', { mobileE164: '+15555550123' }],
    ['patient identifier', { patientId: 'patient_001' }],
    ['free text', { notes: 'Do not copy this into audit.' }]
  ])('rejects %s in before/after state', (_caseName, privateField) => {
    expect(
      AuditEventV2Schema.safeParse({
        ...EVENT,
        after: { ...EVENT.after, ...privateField }
      }).success
    ).toBe(false);
  });

  it('rejects incomplete or legacy audit envelopes', () => {
    const { correlationId: _missing, ...withoutCorrelation } = EVENT;
    expect(AuditEventV2Schema.safeParse(withoutCorrelation).success).toBe(
      false
    );
    expect(
      AuditEventV2Schema.safeParse({ ...EVENT, schemaVersion: 1 }).success
    ).toBe(false);
  });
});
