import { describe, expect, it } from 'vitest';

import * as browser from '../apps/web/public/vendor/domain/index.js';
import * as domain from '../packages/domain/src/index.ts';

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

describe.each([
  { name: 'domain', rules: domain },
  { name: 'browser', rules: browser }
])('$name UTC grid and stored export timestamps', ({ rules }) => {
  it.each(rejected)('keeps %s off the internal booking grid', (value) => {
    expect(rules.isOnBookingKindGrid(value, 'initial')).toBe(false);
  });

  it.each(rejected)('does not invent an export time from %s', (value) => {
    expect(rules.toBusinessExportRow({ startsAt: value }).startsAt).toBeNull();
  });

  it.each([
    '2030-01-02T04:00:00Z',
    '2030-01-02T04:00:00.123Z',
    '2030-01-02T04:00:00.123456Z',
    '2030-01-02T04:00:00.123456789Z'
  ])('keeps valid UTC precision and Taipei display for %s', (value) => {
    expect(rules.isOnBookingKindGrid(value, 'initial')).toBe(true);
    expect(rules.toBusinessExportRow({ startsAt: value }).startsAt).toBe(
      '2030-01-02 12:00'
    );
  });

  it('preserves provider RFC3339 offset normalization at its separate boundary', () => {
    expect(
      rules.extractCalendarEventRange({
        start: { dateTime: '2026-09-02T14:00:00+08:00' },
        end: { dateTime: '2026-09-02T14:30:00+08:00' }
      })
    ).toEqual({
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T06:30:00.000Z'
    });
  });
});
