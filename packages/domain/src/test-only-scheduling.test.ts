import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  createTestOnlySchedule,
  effectiveTestOnlyIntervals,
  type TestOnlySchedule
} from './test-only-scheduling.js';

const schedule: TestOnlySchedule = {
  timeZone: 'Asia/Taipei',
  weeklyAvailability: [
    {
      weekday: 1,
      intervals: [{ startLocalTime: '09:00', endLocalTime: '12:00' }]
    },
    {
      weekday: 2,
      intervals: [{ startLocalTime: '13:00', endLocalTime: '17:00' }]
    }
  ],
  dateExceptions: [
    { date: '2030-01-07', kind: 'closed', reasonCode: 'REST_DAY' },
    {
      date: '2030-01-08',
      kind: 'extra_open',
      reasonCode: 'EXTRA_SESSION',
      intervals: [{ startLocalTime: '18:00', endLocalTime: '20:00' }]
    }
  ]
};

function expectInvalid(operation: () => unknown): void {
  expect(operation).toThrow(DomainError);
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ code: 'INVALID_VALUE' });
  }
}

describe('test-only schedule rules', () => {
  it('sorts valid weekly rules and date exceptions without changing their meaning', () => {
    const result = createTestOnlySchedule(schedule);
    expect(result.weeklyAvailability.map((entry) => entry.weekday)).toEqual([
      1, 2
    ]);
    expect(result.dateExceptions.map((entry) => entry.date)).toEqual([
      '2030-01-07',
      '2030-01-08'
    ]);
  });

  it('uses weekly availability, closures, and explicit extra openings', () => {
    expect(effectiveTestOnlyIntervals(schedule, '2030-01-07')).toEqual([]);
    expect(effectiveTestOnlyIntervals(schedule, '2030-01-08')).toEqual([
      { startLocalTime: '13:00', endLocalTime: '17:00' },
      { startLocalTime: '18:00', endLocalTime: '20:00' }
    ]);
    expect(effectiveTestOnlyIntervals(schedule, '2030-01-14')).toEqual([
      { startLocalTime: '09:00', endLocalTime: '12:00' }
    ]);
  });

  it('rejects an invalid weekday, inverted time, overlapping windows and duplicate exceptions', () => {
    expectInvalid(() =>
      createTestOnlySchedule({
        ...schedule,
        weeklyAvailability: [
          {
            weekday: 7,
            intervals: [{ startLocalTime: '09:00', endLocalTime: '10:00' }]
          }
        ]
      })
    );
    expectInvalid(() =>
      createTestOnlySchedule({
        ...schedule,
        weeklyAvailability: [
          {
            weekday: 1,
            intervals: [{ startLocalTime: '10:00', endLocalTime: '09:00' }]
          }
        ]
      })
    );
    expectInvalid(() =>
      createTestOnlySchedule({
        ...schedule,
        weeklyAvailability: [
          {
            weekday: 1,
            intervals: [
              { startLocalTime: '09:00', endLocalTime: '11:00' },
              { startLocalTime: '10:00', endLocalTime: '12:00' }
            ]
          }
        ]
      })
    );
    expectInvalid(() =>
      createTestOnlySchedule({
        ...schedule,
        dateExceptions: [
          { date: '2030-01-07', kind: 'closed', reasonCode: 'REST_DAY' },
          { date: '2030-01-07', kind: 'closed', reasonCode: 'REST_DAY' }
        ]
      })
    );
  });
});
