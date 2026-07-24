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

  // 刪除事件是那筆預約唯一留下來的東西：沒有後狀態，但必須留下刪除前的
  // 狀態與理由，否則稽核只知道「有東西被刪了」。
  it('carries a deletion as before-state plus reason, with no after-state', () => {
    const deletion = {
      ...EVENT,
      eventId: 'audit_appointment_001_deleted',
      action: 'appointment_deleted',
      before: { status: 'confirmed', slotId: 'slot_001' },
      after: null,
      reasonCode: 'duplicate_record'
    } as const;

    expect(AuditEventV2Schema.parse(deletion)).toEqual(deletion);
    expect(
      AuditEventV2Schema.safeParse({
        ...deletion,
        reasonCode: 'wrong patient 王小明'
      }).success
    ).toBe(false);
    expect(
      AuditEventV2Schema.safeParse({ ...deletion, reasonCode: null }).success
    ).toBe(false);
    expect(
      AuditEventV2Schema.safeParse({
        ...deletion,
        after: { status: 'cancelled', slotId: 'slot_001' }
      }).success
    ).toBe(false);
  });

  it('enforces action-specific resource and state branches', () => {
    const scheduleEvent = {
      ...EVENT,
      eventId: 'audit_schedule_v1',
      action: 'schedule_published',
      resourceType: 'schedule',
      resourceId: 'schedule',
      before: { version: 0, slotCount: 0 },
      after: { version: 1, slotCount: 12 }
    } as const;
    const followUpEvent = {
      ...EVENT,
      eventId: 'audit_appointment_001_follow_up',
      action: 'follow_up_decided',
      before: null,
      after: {
        followUpStatus: 'required',
        dueAt: '2030-01-02T04:15:00.000Z'
      }
    } as const;

    expect(AuditEventV2Schema.safeParse(scheduleEvent).success).toBe(true);
    expect(AuditEventV2Schema.safeParse(followUpEvent).success).toBe(true);
    expect(
      AuditEventV2Schema.safeParse({
        ...scheduleEvent,
        resourceType: 'appointment'
      }).success
    ).toBe(false);
    expect(
      AuditEventV2Schema.safeParse({
        ...scheduleEvent,
        after: EVENT.after
      }).success
    ).toBe(false);
    expect(
      AuditEventV2Schema.safeParse({
        ...followUpEvent,
        after: EVENT.after
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
