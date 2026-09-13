import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  internalTestSlotGeneration,
  listPublishedGrid,
  parsePublishedScheduleSnapshot,
  resolvePublishedSlot
} from './published-schedule.js';
import { TAIPEI_TIME_ZONE, type Schedule } from './schedule.js';

const NOW = '2026-07-24T09:00:00.000Z';

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

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
  return 'NO_ERROR';
};

describe('internalTestSlotGeneration', () => {
  it('uses the Taipei calendar date, not the UTC date prefix', () => {
    expect(internalTestSlotGeneration('2029-12-15T16:30:00.000Z')).toEqual({
      startDate: '2029-12-16',
      dayCount: 32
    });
  });

  it('counts inclusive days to the last bookable date', () => {
    expect(
      internalTestSlotGeneration('2026-09-05T16:00:00.000Z').dayCount
    ).toBe(31);
    expect(
      internalTestSlotGeneration('2031-01-30T16:00:00.000Z').dayCount
    ).toBe(29);
    expect(
      internalTestSlotGeneration('2032-01-30T16:00:00.000Z').dayCount
    ).toBe(30);
  });
});

describe('parsePublishedScheduleSnapshot', () => {
  it('reads a published grid and refuses a missing body', () => {
    expect(
      parsePublishedScheduleSnapshot({
        schemaVersion: 1,
        publishedVersion: 2,
        publishedAt: NOW,
        schedule
      })
    ).toEqual({
      publishedVersion: 2,
      publishedAt: NOW,
      schedule
    });
    expect(parsePublishedScheduleSnapshot({ publishedVersion: 0 })).toEqual({
      publishedVersion: 0,
      publishedAt: null,
      schedule: null
    });
    expect(
      codeOf(() =>
        parsePublishedScheduleSnapshot({
          publishedVersion: 1,
          publishedAt: NOW
        })
      )
    ).toBe('INVALID_VALUE');
  });
});

describe('resolvePublishedSlot and listPublishedGrid', () => {
  it('materialises an unoccupied grid slot and keeps a reservation overlay', () => {
    const resolved = resolvePublishedSlot(
      schedule,
      'slot_20300102_1200',
      undefined,
      '2029-12-15T09:00:00.000Z'
    );
    expect(resolved).toMatchObject({
      id: 'slot_20300102_1200',
      kind: 'initial',
      startsAt: '2030-01-02T04:00:00.000Z'
    });
    expect(
      resolvePublishedSlot(
        schedule,
        'slot_20300102_1200',
        { ...resolved, reservationId: 'appointment_001' },
        '2029-12-15T09:00:00.000Z'
      ).reservationId
    ).toBe('appointment_001');
    expect(
      codeOf(() =>
        resolvePublishedSlot(
          schedule,
          'slot_20300106_1200',
          undefined,
          '2029-12-15T09:00:00.000Z'
        )
      )
    ).toBe('SLOT_UNAVAILABLE');
  });

  it('hides free slots inside the two-hour lead and keeps occupied ones', () => {
    const listed = listPublishedGrid(
      schedule,
      [
        {
          id: 'slot_20300102_1230',
          kind: 'initial',
          startsAt: '2030-01-02T04:30:00.000Z',
          reservationId: 'appointment_001'
        }
      ],
      '2030-01-02T03:00:00.000Z',
      'initial'
    );
    expect(listed.some((slot) => slot.id === 'slot_20300102_1200')).toBe(false);
    expect(listed.some((slot) => slot.id === 'slot_20300102_1230')).toBe(true);
  });
});
