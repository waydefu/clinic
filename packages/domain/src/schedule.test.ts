import { describe, expect, it } from 'vitest';

import type { AuditContext } from './audit.js';
import type { SlotSnapshot } from './booking-transaction.js';
import { DomainError } from './errors.js';
import {
  assertScheduleValid,
  assertScheduleVersionMatches,
  followUpGridTimes,
  planSchedulePublication,
  planSlots,
  scheduleImpact,
  SLOT_MINUTE_MARKS,
  TAIPEI_TIME_ZONE,
  type Schedule
} from './schedule.js';

const NOW = '2026-07-24T09:00:00.000Z';

// 週三至週五 12:00–20:30，週六 10:00–18:00，週日至週二休診。
const schedule: Schedule = {
  timeZone: TAIPEI_TIME_ZONE,
  weeklyAvailability: [
    {
      weekday: 3,
      intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
    },
    {
      weekday: 4,
      intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
    },
    {
      weekday: 5,
      intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
    },
    {
      weekday: 6,
      intervals: [{ startLocalTime: '10:00', endLocalTime: '18:00' }]
    }
  ],
  dateExceptions: [],
  blockedTimes: {
    initial: ['13:00', '15:00', '17:00'],
    follow_up: ['13:15', '15:15', '17:15']
  }
};

const generation = { startDate: '2030-01-01', dayCount: 21 };

const audit: AuditContext = {
  actorId: 'actor_admin_001',
  actorRole: 'test_admin',
  correlationId: 'corr_schedule_001',
  source: 'api',
  reasonCode: null,
  policyVersion: null
};

const idempotency = {
  actorId: audit.actorId,
  scope: 'schedule:publish',
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

const localClock = (slot: SlotSnapshot) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TAIPEI_TIME_ZONE
  }).format(new Date(slot.startsAt));

describe('assertScheduleValid', () => {
  it('accepts the clinic schedule', () => {
    expect(() => assertScheduleValid(schedule)).not.toThrow();
  });

  it('rejects a schedule in another time zone', () => {
    expect(
      codeOf(() => assertScheduleValid({ ...schedule, timeZone: 'UTC' }))
    ).toBe('INVALID_VALUE');
  });

  it('rejects a duplicated weekday and a duplicated date exception', () => {
    expect(
      codeOf(() =>
        assertScheduleValid({
          ...schedule,
          weeklyAvailability: [
            ...schedule.weeklyAvailability,
            {
              weekday: 3,
              intervals: [{ startLocalTime: '09:00', endLocalTime: '10:00' }]
            }
          ]
        })
      )
    ).toBe('SCHEDULE_WEEKDAY_DUPLICATED');
    expect(
      codeOf(() =>
        assertScheduleValid({
          ...schedule,
          dateExceptions: [
            { date: '2030-01-02', kind: 'closed' },
            { date: '2030-01-02', kind: 'closed' }
          ]
        })
      )
    ).toBe('SCHEDULE_EXCEPTION_DUPLICATED');
  });

  it('rejects impossible local dates in exceptions and slot generation', () => {
    expect(
      codeOf(() =>
        assertScheduleValid({
          ...schedule,
          dateExceptions: [{ date: '2030-02-30', kind: 'closed' }]
        })
      )
    ).toBe('SCHEDULE_EXCEPTION_DUPLICATED');
    expect(
      codeOf(() =>
        planSlots(schedule, [], { startDate: '2030-02-30', dayCount: 1 })
      )
    ).toBe('INVALID_VALUE');
  });

  it('rejects overlapping intervals on the same day', () => {
    expect(
      codeOf(() =>
        assertScheduleValid({
          ...schedule,
          weeklyAvailability: [
            {
              weekday: 3,
              intervals: [
                { startLocalTime: '12:00', endLocalTime: '15:00' },
                { startLocalTime: '14:00', endLocalTime: '18:00' }
              ]
            }
          ]
        })
      )
    ).toBe('SCHEDULE_INTERVALS_OVERLAP');
  });

  // 擋一個不在該網格上的時間點永遠對應不到任何一格，設定者卻會以為自己擋掉了
  // 某個時段——那是無效設定，不是「剛好擋不到」。
  it('rejects a blocked time that is not on its own grid', () => {
    expect(
      codeOf(() =>
        assertScheduleValid({
          ...schedule,
          blockedTimes: { initial: ['13:15'], follow_up: [] }
        })
      )
    ).toBe('BLOCKED_TIME_OFF_GRID');
    expect(
      codeOf(() =>
        assertScheduleValid({
          ...schedule,
          blockedTimes: { initial: [], follow_up: ['13:00'] }
        })
      )
    ).toBe('BLOCKED_TIME_OFF_GRID');
  });
});

describe('planSlots', () => {
  it('puts each booking kind on its own minute grid', () => {
    for (const slot of planSlots(schedule, [], generation)) {
      const minute = Number(localClock(slot).slice(3));
      expect(SLOT_MINUTE_MARKS[slot.kind]).toContain(minute);
    }
  });

  it('opens Wednesday to Saturday only and drops the blocked commitments', () => {
    const slots = planSlots(schedule, [], generation);
    const on = (date: string) =>
      slots.filter((slot) => slot.id.startsWith(`slot_${date}_`));

    // 2030-01-06 週日、01-07 週一、01-08 週二
    for (const closed of ['20300106', '20300107', '20300108'])
      expect(on(closed)).toHaveLength(0);
    expect(
      on('20300102').filter((slot) => slot.kind === 'initial')
    ).toHaveLength(14);
    expect(
      on('20300102').filter((slot) => slot.kind === 'follow_up')
    ).toHaveLength(13);
    expect(on('20300102').map(localClock)).not.toContain('13:00');
    expect(on('20300102').map(localClock)).not.toContain('13:15');
  });

  // 兩個網格在時鐘上重疊是刻意的：諮詢師與醫師分線並行，回診不吃掉初診的格。
  it('keeps the overlapping initial and follow-up lines side by side', () => {
    const wednesday = planSlots(schedule, [], {
      startDate: '2030-01-02',
      dayCount: 1
    });
    expect(
      wednesday.filter((slot) => localClock(slot) === '14:00')
    ).toHaveLength(1);
    expect(
      wednesday.filter((slot) => localClock(slot) === '14:15')
    ).toHaveLength(1);
  });

  // 發布排班不得把已經成立的預約從它的那一格上抹掉。
  it('carries existing reservations onto the regenerated slots', () => {
    const existing = planSlots(schedule, [], generation).map((slot, index) =>
      index === 0 ? { ...slot, reservationId: 'appointment_001' } : slot
    );
    const republished = planSlots(schedule, existing, generation);
    expect(republished[0]?.reservationId).toBe('appointment_001');
    expect(republished[1]?.reservationId).toBeUndefined();
  });

  it('honours closed and extra-open date exceptions', () => {
    const closed = planSlots(
      { ...schedule, dateExceptions: [{ date: '2030-01-02', kind: 'closed' }] },
      [],
      { startDate: '2030-01-02', dayCount: 1 }
    );
    expect(closed).toHaveLength(0);

    // 2030-01-06 是週日，平常不開；加開例外讓它產生時段。
    const extra = planSlots(
      {
        ...schedule,
        dateExceptions: [
          {
            date: '2030-01-06',
            kind: 'extra_open',
            intervals: [{ startLocalTime: '10:00', endLocalTime: '12:00' }]
          }
        ]
      },
      [],
      { startDate: '2030-01-06', dayCount: 1 }
    );
    expect(extra.map(localClock)).toContain('10:00');
  });

  // 一格必須完整落在營業時間內：20:30 收班時 20:30 那一格會被切斷。
  it('never starts a slot that would run past closing time', () => {
    const wednesday = planSlots(schedule, [], {
      startDate: '2030-01-02',
      dayCount: 1
    });
    expect(wednesday.map(localClock)).toContain('20:00');
    expect(wednesday.map(localClock)).not.toContain('20:30');
  });
});

describe('followUpGridTimes', () => {
  it('returns the bookable follow-up times for a trading day', () => {
    const wednesday = followUpGridTimes(schedule, '2030-01-02');
    expect(wednesday[0]).toBe('12:15');
    expect(wednesday).toContain('12:45');
    expect(wednesday).not.toContain('13:15');
  });

  it('returns nothing for a closed day or a malformed date', () => {
    expect(followUpGridTimes(schedule, '2030-01-06')).toEqual([]);
    expect(followUpGridTimes(schedule, 'not-a-date')).toEqual([]);
    expect(followUpGridTimes(schedule, undefined)).toEqual([]);
  });
});

describe('planSchedulePublication', () => {
  const publish = (
    overrides: {
      expectedVersion?: number;
      currentVersion?: number;
      draft?: Schedule;
      appointments?: { id: string; slotId: string; status: string }[];
    } = {}
  ) =>
    planSchedulePublication(
      {
        draft: overrides.draft ?? schedule,
        expectedVersion: overrides.expectedVersion ?? 1,
        slotGeneration: generation,
        audit,
        requestedAt: NOW,
        idempotency
      },
      {
        publishedVersion: overrides.currentVersion ?? 1,
        publishedAt: '2026-07-21T00:00:00.000Z'
      },
      [],
      overrides.appointments ?? []
    );

  it('bumps the version and records the change of scale in audit', () => {
    const plan = publish();
    expect(plan.publishedVersion).toBe(2);
    expect(plan.publishedAt).toBe(NOW);
    expect(plan.slots.length).toBeGreaterThan(0);
    expect(plan.auditEvent).toMatchObject({
      action: 'schedule_published',
      resourceType: 'schedule',
      resourceId: 'schedule',
      before: { version: 1, slotCount: 0 },
      after: { version: 2, slotCount: plan.slots.length },
      schemaVersion: 2
    });
    expect(plan.idempotencyRecord.responseReference).toEqual({
      resourceType: 'schedule',
      resourceId: 'schedule_v2'
    });
  });

  // 兩位管理者同時編輯：後發布的一方若直接覆蓋，前一位的變更會消失且雙方都
  // 不會發現。
  it('refuses to publish on top of a version somebody else already moved', () => {
    expect(
      codeOf(() => publish({ expectedVersion: 1, currentVersion: 2 }))
    ).toBe('SCHEDULE_VERSION_CONFLICT');
    expect(() =>
      publish({ expectedVersion: 2, currentVersion: 2 })
    ).not.toThrow();
  });

  // 患者手上不能留著一筆約在已經不存在的時段上的預約。
  it('refuses a publication that would orphan an open appointment', () => {
    const open = [
      {
        id: 'appointment_001',
        slotId: 'slot_20300102_1200',
        status: 'confirmed'
      }
    ];
    expect(
      codeOf(() =>
        publish({
          draft: { ...schedule, weeklyAvailability: [] },
          appointments: open
        })
      )
    ).toBe('SCHEDULE_ORPHANS_APPOINTMENTS');

    // 已結束的預約不再佔用時段，因此不擋發布。
    expect(() =>
      publish({
        draft: { ...schedule, weeklyAvailability: [] },
        appointments: [{ ...open[0]!, status: 'cancelled' }]
      })
    ).not.toThrow();
  });

  it('is a pure function of its inputs', () => {
    expect(publish()).toEqual(publish());
    expect(schedule.weeklyAvailability).toHaveLength(4);
  });
});

describe('scheduleImpact and assertScheduleVersionMatches', () => {
  it('lists only the open appointments whose slot disappeared', () => {
    const slots = planSlots(schedule, [], generation);
    const kept = slots[0]!.id;
    expect(
      scheduleImpact(
        [
          { id: 'a', slotId: kept, status: 'confirmed' },
          { id: 'b', slotId: 'slot_19990101_0900', status: 'confirmed' },
          { id: 'c', slotId: 'slot_19990101_0900', status: 'completed' }
        ],
        slots
      ).map((item) => item.id)
    ).toEqual(['b']);
  });

  it('accepts a matching version and rejects a stale one', () => {
    const current = { publishedVersion: 3, publishedAt: null };
    expect(() => assertScheduleVersionMatches(3, current)).not.toThrow();
    expect(codeOf(() => assertScheduleVersionMatches(2, current))).toBe(
      'SCHEDULE_VERSION_CONFLICT'
    );
  });
});
