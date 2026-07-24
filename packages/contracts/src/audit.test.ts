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

  it('enforces case-assignment resource and state branches', () => {
    const assigned = {
      ...EVENT,
      eventId: 'audit_case_001',
      action: 'case_manager_assigned',
      resourceType: 'case',
      resourceId: 'patient_001',
      before: null,
      after: {
        managerId: 'manager_alpha',
        activeFrom: '2026-07-01T00:00:00.000Z',
        activeUntil: null
      }
    } as const;
    const reassigned = {
      ...assigned,
      eventId: 'audit_case_002',
      action: 'case_manager_reassigned',
      before: {
        managerId: 'manager_alpha',
        activeFrom: '2026-07-01T00:00:00.000Z',
        activeUntil: '2026-07-20T00:00:00.000Z'
      }
    } as const;

    expect(AuditEventV2Schema.safeParse(assigned).success).toBe(true);
    expect(AuditEventV2Schema.safeParse(reassigned).success).toBe(true);
    // A first assignment cannot carry a before state.
    expect(
      AuditEventV2Schema.safeParse({ ...assigned, before: reassigned.before })
        .success
    ).toBe(false);
    // The case resource type is mandatory for these actions.
    expect(
      AuditEventV2Schema.safeParse({ ...assigned, resourceType: 'appointment' })
        .success
    ).toBe(false);
    // No patient contact field may ride along in the state.
    expect(
      AuditEventV2Schema.safeParse({
        ...assigned,
        after: { ...assigned.after, fullName: '王小明' }
      }).success
    ).toBe(false);
  });

  it('enforces payroll close and adjustment branches', () => {
    const closed = {
      ...EVENT,
      eventId: 'audit_payroll_close_001',
      action: 'payroll_period_closed',
      resourceType: 'payroll',
      resourceId: 'payroll_manager_alpha_2026-08',
      before: { payrollPeriod: '2026-08', status: 'open', creditCount: 2 },
      after: { payrollPeriod: '2026-08', status: 'locked', creditCount: 2 }
    } as const;
    const adjusted = {
      ...closed,
      eventId: 'audit_payroll_adjust_001',
      action: 'payroll_adjustment_recorded',
      before: { payrollPeriod: '2026-08', status: 'locked', creditCount: 2 },
      after: { payrollPeriod: '2026-08', status: 'locked', creditCount: 3 },
      reasonCode: 'late_completion'
    } as const;

    expect(AuditEventV2Schema.safeParse(closed).success).toBe(true);
    expect(AuditEventV2Schema.safeParse(adjusted).success).toBe(true);
    // A close must move open -> locked.
    expect(
      AuditEventV2Schema.safeParse({
        ...closed,
        before: { payrollPeriod: '2026-08', status: 'locked', creditCount: 2 }
      }).success
    ).toBe(false);
    // An adjustment must carry a reason.
    expect(
      AuditEventV2Schema.safeParse({ ...adjusted, reasonCode: null }).success
    ).toBe(false);
  });

  it('requires payroll evidence to be continuous, not merely well-shaped', () => {
    const closed = {
      ...EVENT,
      eventId: 'audit_payroll_close_002',
      action: 'payroll_period_closed',
      resourceType: 'payroll',
      resourceId: 'payroll_manager_alpha_2026-08',
      before: { payrollPeriod: '2026-08', status: 'open', creditCount: 2 },
      after: { payrollPeriod: '2026-08', status: 'locked', creditCount: 2 }
    } as const;
    const adjusted = {
      ...closed,
      eventId: 'audit_payroll_adjust_002',
      action: 'payroll_adjustment_recorded',
      before: { payrollPeriod: '2026-08', status: 'locked', creditCount: 2 },
      after: { payrollPeriod: '2026-08', status: 'locked', creditCount: 3 },
      reasonCode: 'late_completion'
    } as const;

    // 一個事件只能描述一個薪資期間。前後期間不同的話，這筆證據講的是兩件事。
    expect(
      AuditEventV2Schema.safeParse({
        ...closed,
        after: { payrollPeriod: '2026-09', status: 'locked', creditCount: 2 }
      }).success
    ).toBe(false);
    expect(
      AuditEventV2Schema.safeParse({
        ...adjusted,
        after: { payrollPeriod: '2026-09', status: 'locked', creditCount: 3 }
      }).success
    ).toBe(false);

    // 關帳是把總數凍結，不是改變它。
    expect(
      AuditEventV2Schema.safeParse({
        ...closed,
        after: { payrollPeriod: '2026-08', status: 'locked', creditCount: 5 }
      }).success
    ).toBe(false);

    // 反過來，沒有改變總數的 adjustment 沒有存在的理由。
    expect(
      AuditEventV2Schema.safeParse({
        ...adjusted,
        after: { payrollPeriod: '2026-08', status: 'locked', creditCount: 2 }
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
