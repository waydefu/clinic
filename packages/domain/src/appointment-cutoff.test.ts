import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  assertSlotMeetsEarliestLead,
  EARLIEST_BOOKING_LEAD_MS,
  isWithinSelfCancelWindow,
  selfCancelCutoffAt
} from './appointment-rules.js';

describe('selfCancelCutoffAt', () => {
  it('resolves to 10:00 Asia/Taipei on the appointment day', () => {
    expect(selfCancelCutoffAt('2030-01-02T04:00:00.000Z')).toBe(
      '2030-01-02T02:00:00.000Z'
    );
  });

  it('rejects an unparseable appointment start', () => {
    expect(() => selfCancelCutoffAt('not-a-time')).toThrow(/parseable/);
  });
});

describe('isWithinSelfCancelWindow', () => {
  it('allows 09:59 and denies 10:00 on the appointment day', () => {
    const startsAt = '2030-01-02T04:00:00.000Z';
    expect(
      isWithinSelfCancelWindow(startsAt, Date.parse('2030-01-02T01:59:00.000Z'))
    ).toBe(true);
    expect(
      isWithinSelfCancelWindow(startsAt, Date.parse('2030-01-02T02:00:00.000Z'))
    ).toBe(false);
  });

  it('fails closed on non-finite now', () => {
    expect(
      isWithinSelfCancelWindow('2030-01-02T04:00:00.000Z', Number.NaN)
    ).toBe(false);
  });
});

describe('assertSlotMeetsEarliestLead', () => {
  const requestedAt = '2026-07-21T09:00:00.000Z';
  const exactlyTwoHours = '2026-07-21T11:00:00.000Z';
  const oneHour = '2026-07-21T10:00:00.000Z';

  it('allows a slot at exactly now+2 hours', () => {
    expect(() =>
      assertSlotMeetsEarliestLead(exactlyTwoHours, requestedAt)
    ).not.toThrow();
    expect(EARLIEST_BOOKING_LEAD_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('rejects a slot sooner than now+2 hours', () => {
    expect(() => assertSlotMeetsEarliestLead(oneHour, requestedAt)).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'SLOT_UNAVAILABLE'
      })
    );
  });

  it('rejects an unparseable slot start', () => {
    expect(() =>
      assertSlotMeetsEarliestLead('not-a-time', requestedAt)
    ).toThrow(/parseable/);
  });
});
