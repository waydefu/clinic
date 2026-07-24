import { describe, expect, it } from 'vitest';

import type { AuditContext } from './audit.js';
import { fromCalendarEventId, isCalendarEventId } from './calendar-event-id.js';
import { DomainError } from './errors.js';
import {
  planFollowUpDecision,
  taipeiInstant,
  type FollowUpSourceSnapshot
} from './follow-up.js';
import { TAIPEI_TIME_ZONE, type Schedule } from './schedule.js';

const NOW = '2026-07-24T09:00:00.000Z';

const schedule: Schedule = {
  timeZone: TAIPEI_TIME_ZONE,
  weeklyAvailability: [
    {
      weekday: 3,
      intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
    }
  ],
  dateExceptions: [],
  blockedTimes: { initial: ['13:00'], follow_up: ['13:15'] }
};

const appointment: FollowUpSourceSnapshot = {
  id: 'appointment_001',
  patientId: 'patient_001',
  status: 'completed'
};

const audit: AuditContext = {
  actorId: 'actor_admin_001',
  actorRole: 'test_admin',
  correlationId: 'corr_follow_up_001',
  source: 'api',
  reasonCode: null,
  policyVersion: null
};

const idempotency = {
  actorId: audit.actorId,
  scope: 'appointment:appointment_001:follow-up',
  requestHash: 'a'.repeat(64),
  recordId: 'b'.repeat(64)
};

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
  return 'NO_ERROR';
};

const decide = (
  request: {
    decision: 'required' | 'not_required';
    dueDate?: string;
    dueTime?: string;
  },
  source: FollowUpSourceSnapshot | undefined = appointment,
  existing?: { decision: 'required' | 'not_required'; dueAt: string | null }
) =>
  planFollowUpDecision(
    {
      appointmentId: appointment.id,
      ...request,
      audit,
      requestedAt: NOW,
      idempotency
    },
    source,
    schedule,
    existing
  );

describe('planFollowUpDecision', () => {
  it('resolves the Taipei target onto a UTC instant and plans the reminder', () => {
    // 2030-01-02 是週三；12:15 是當天第一個回診格。
    const plan = decide({
      decision: 'required',
      dueDate: '2030-01-02',
      dueTime: '12:15'
    });

    expect(plan.dueAt).toBe('2030-01-02T04:15:00.000Z');
    expect(plan.patientId).toBe('patient_001');
    expect(plan.outboxJob).toMatchObject({
      appointmentStatus: 'follow_up_required',
      followUpSourceId: appointment.id,
      startsAt: '2030-01-02T04:15:00.000Z',
      status: 'pending',
      attempts: 0
    });
  });

  // 回診提醒是與原就診分開的日曆事件，因此必須是另一把鑰匙——否則提醒會覆蓋
  // 掉就診本身的事件。
  it('keys the reminder to its own calendar event', () => {
    const key = decide({
      decision: 'required',
      dueDate: '2030-01-02',
      dueTime: '12:15'
    }).outboxJob.idempotencyKey;

    expect(isCalendarEventId(key)).toBe(true);
    expect(fromCalendarEventId(key)).toBe('calendar_followup_appointment_001');
  });

  // 改成「不需要」時，只刪掉本機紀錄不會讓日曆那一側的事件消失。
  it('cancels the reminder through the same key when it is no longer required', () => {
    const plan = decide({ decision: 'not_required' }, appointment, {
      decision: 'required',
      dueAt: '2030-01-02T04:15:00.000Z'
    });

    expect(plan.dueAt).toBeNull();
    expect(plan.outboxJob.appointmentStatus).toBe('follow_up_not_required');
    expect(plan.outboxJob.startsAt).toBeUndefined();
    expect(fromCalendarEventId(plan.outboxJob.idempotencyKey)).toBe(
      'calendar_followup_appointment_001'
    );
    expect(plan.auditEvent).toMatchObject({
      action: 'follow_up_decided',
      resourceType: 'appointment',
      before: { followUpStatus: 'required', dueAt: '2030-01-02T04:15:00.000Z' },
      after: { followUpStatus: 'not_required', dueAt: null }
    });
  });

  // 決定回診是「這次看完之後」的判斷；還沒到診就先決定等於在結果出來前寫結論。
  it('refuses a decision on a visit that has not completed', () => {
    for (const status of [
      'confirmed',
      'cancellation_requested',
      'cancelled',
      'no_show'
    ])
      expect(
        codeOf(() =>
          decide(
            { decision: 'required', dueDate: '2030-01-02', dueTime: '12:15' },
            { ...appointment, status }
          )
        )
      ).toBe('FOLLOW_UP_NOT_DECIDABLE');
    // 直接呼叫：`decide` 的預設參數會把顯式的 undefined 換成既有的預約。
    expect(
      codeOf(() =>
        planFollowUpDecision(
          {
            appointmentId: 'appointment_404',
            decision: 'not_required',
            audit,
            requestedAt: NOW,
            idempotency
          },
          undefined,
          schedule
        )
      )
    ).toBe('APPOINTMENT_NOT_FOUND');
  });

  // 目標時間必須是患者真的約得到的一格，否則提醒會落在休診時間。
  it('refuses a target the clinic could not actually book', () => {
    // 2030-01-06 是週日，未營業。
    expect(
      codeOf(() =>
        decide({
          decision: 'required',
          dueDate: '2030-01-06',
          dueTime: '12:15'
        })
      )
    ).toBe('FOLLOW_UP_DAY_CLOSED');
    // 13:15 是固定不開放；12:00 屬於初診網格，不是回診格。
    for (const dueTime of ['13:15', '12:00'])
      expect(
        codeOf(() =>
          decide({ decision: 'required', dueDate: '2030-01-02', dueTime })
        )
      ).toBe('FOLLOW_UP_TIME_OFF_GRID');
  });

  it('requires a complete target when required and none at all when not', () => {
    expect(
      codeOf(() => decide({ decision: 'required', dueDate: '2030-01-02' }))
    ).toBe('INVALID_VALUE');
    expect(codeOf(() => decide({ decision: 'required' }))).toBe(
      'INVALID_VALUE'
    );
    expect(
      codeOf(() => decide({ decision: 'not_required', dueDate: '2030-01-02' }))
    ).toBe('INVALID_VALUE');
  });

  it('converts Taipei wall-clock time without a daylight-saving shift', () => {
    // 台灣自 1979 年起無日光節約時間，夏冬都是 +08:00。
    expect(taipeiInstant('2030-01-02', '12:15')).toBe(
      '2030-01-02T04:15:00.000Z'
    );
    expect(taipeiInstant('2030-07-02', '12:15')).toBe(
      '2030-07-02T04:15:00.000Z'
    );
  });
});
