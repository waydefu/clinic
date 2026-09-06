import { describe, expect, it } from 'vitest';

import { bookingHorizonEndExclusive } from './booking-horizon.js';

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
