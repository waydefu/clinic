import { describe, expect, it } from 'vitest';

import * as browser from '../apps/web/public/vendor/domain/index.js';
import * as domain from '../packages/domain/src/index.ts';

const now = '2030-01-02T00:00:00.000Z';
const startsAt = '2030-01-02T12:00:00.000Z';
const rejected = [
  '2030-01-02',
  '2030-01-02 01:00:00Z',
  '2030-01-02T01:00:00',
  '2030-01-02T01:00:00z',
  '2030-01-02T01:00:00+00:00',
  '2030-01-02T01:00:00+08:00',
  '2030-02-30T01:00:00Z',
  '2030-01-02T24:00:00Z',
  'not-a-time'
];
const probes = [
  {
    name: 'self-cancellation cutoff',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.selfCancelCutoffAt(value)
  },
  {
    name: 'self-cancellation window start',
    code: 'INVALID_VALUE',
    run: (rules, value) =>
      rules.isWithinSelfCancelWindow(value, Date.parse(now))
  },
  {
    name: 'cancellation appointment start',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.assertWithinSelfCancelWindow(value, now)
  },
  {
    name: 'reschedule appointment start',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.assertWithinSelfRescheduleWindow(value, now)
  },
  {
    name: 'cancellation request time',
    code: 'CANCELLATION_WINDOW_CLOSED',
    run: (rules, value) => rules.assertWithinSelfCancelWindow(startsAt, value)
  },
  {
    name: 'reschedule request time',
    code: 'CANCELLATION_WINDOW_CLOSED',
    run: (rules, value) =>
      rules.assertWithinSelfRescheduleWindow(startsAt, value)
  },
  {
    name: 'earliest-lead slot start',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.assertSlotMeetsEarliestLead(value, now)
  },
  {
    name: 'earliest-lead request time',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.assertSlotMeetsEarliestLead(startsAt, value)
  },
  {
    name: 'Taipei calendar conversion',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.taipeiCalendarDate(value)
  },
  {
    name: 'past-slot start',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.assertSlotNotInPast(value, now)
  },
  {
    name: 'past-slot request time',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.assertSlotNotInPast(startsAt, value)
  },
  {
    name: 'booking-horizon slot start',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.assertSlotWithinBookingHorizon(value, now)
  },
  {
    name: 'booking-horizon request time',
    code: 'INVALID_VALUE',
    run: (rules, value) => rules.assertSlotWithinBookingHorizon(startsAt, value)
  }
];

describe.each([
  { name: 'domain', rules: domain },
  { name: 'browser', rules: browser }
])('$name UTC temporal admission', ({ rules }) => {
  describe.each(probes)('$name', ({ run, code }) => {
    it.each(rejected)('rejects %s before date normalization', (value) => {
      expect(() => run(rules, value)).toThrow(
        expect.objectContaining({ code })
      );
    });
  });

  it.each([
    '2030-01-02T12:00:00Z',
    '2030-01-02T12:00:00.123Z',
    '2030-01-02T12:00:00.123456Z',
    '2030-01-02T12:00:00.123456789Z'
  ])('preserves valid UTC precision for %s', (value) => {
    expect(rules.selfCancelCutoffAt(value)).toBe('2030-01-02T02:00:00.000Z');
    expect(rules.taipeiCalendarDate(value)).toBe('2030-01-02');
    expect(rules.isWithinSelfCancelWindow(value, Date.parse(now))).toBe(true);
    expect(() => rules.assertWithinSelfCancelWindow(value, now)).not.toThrow();
    expect(() =>
      rules.assertWithinSelfRescheduleWindow(value, now)
    ).not.toThrow();
    expect(() => rules.assertSlotMeetsEarliestLead(value, now)).not.toThrow();
    expect(() => rules.assertSlotNotInPast(value, now)).not.toThrow();
    expect(() =>
      rules.assertSlotWithinBookingHorizon(value, now)
    ).not.toThrow();
  });

  it('keeps non-finite cancellation clocks denied', () => {
    expect(rules.isWithinSelfCancelWindow(startsAt, Number.NaN)).toBe(false);
  });
});
