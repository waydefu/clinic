import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  assertSlotNotInPast,
  assertSlotWithinBookingHorizon,
  bookingHorizonEndExclusive,
  taipeiCalendarDate
} from './booking-horizon.js';

describe('bookingHorizonEndExclusive', () => {
  it('ends the day after the same date next month', () => {
    expect(bookingHorizonEndExclusive('2026-09-06')).toBe('2026-10-07');
  });

  it('clamps January 31 to the end of February in a common year', () => {
    expect(bookingHorizonEndExclusive('2031-01-31')).toBe('2031-03-01');
  });

  it('clamps January 31 to February 29 in a leap year', () => {
    expect(bookingHorizonEndExclusive('2032-01-31')).toBe('2032-03-01');
  });

  it('clamps March 31 to April 30', () => {
    expect(bookingHorizonEndExclusive('2031-03-31')).toBe('2031-05-01');
  });

  it('rolls over the year boundary', () => {
    expect(bookingHorizonEndExclusive('2026-12-15')).toBe('2027-01-16');
  });

  it('keeps short-month starts inside the next month', () => {
    expect(bookingHorizonEndExclusive('2031-02-28')).toBe('2031-03-29');
  });

  it('rejects non-calendar input', () => {
    expect(() => bookingHorizonEndExclusive('2031-02-30')).toThrow(
      /calendar date/
    );
    expect(() => bookingHorizonEndExclusive('not-a-date')).toThrow(
      /calendar date/
    );
  });
});

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
  }
  return 'NO_ERROR';
};

describe('taipeiCalendarDate', () => {
  it('converts a UTC instant to the Asia/Taipei calendar date', () => {
    expect(taipeiCalendarDate('2029-12-15T09:00:00.000Z')).toBe('2029-12-15');
    expect(taipeiCalendarDate('2029-12-15T16:30:00.000Z')).toBe('2029-12-16');
  });
});

describe('assertSlotNotInPast', () => {
  it('accepts a slot at or after the request instant', () => {
    expect(() =>
      assertSlotNotInPast(
        '2029-12-15T09:00:00.000Z',
        '2029-12-15T09:00:00.000Z'
      )
    ).not.toThrow();
  });

  it('rejects a slot that has already started', () => {
    expect(
      codeOf(() =>
        assertSlotNotInPast(
          '2029-12-15T08:00:00.000Z',
          '2029-12-15T09:00:00.000Z'
        )
      )
    ).toBe('SLOT_UNAVAILABLE');
  });
});

describe('assertSlotWithinBookingHorizon', () => {
  const requestedAt = '2029-12-15T09:00:00.000Z';

  it('accepts the last bookable Taipei date', () => {
    expect(() =>
      assertSlotWithinBookingHorizon('2030-01-15T04:00:00.000Z', requestedAt)
    ).not.toThrow();
  });

  it('rejects the exclusive horizon end and later dates', () => {
    expect(
      codeOf(() =>
        assertSlotWithinBookingHorizon('2030-01-16T04:00:00.000Z', requestedAt)
      )
    ).toBe('SLOT_UNAVAILABLE');
    expect(
      codeOf(() =>
        assertSlotWithinBookingHorizon(
          '2030-01-02T04:00:00.000Z',
          '2026-07-21T09:00:00.000Z'
        )
      )
    ).toBe('SLOT_UNAVAILABLE');
  });
});
