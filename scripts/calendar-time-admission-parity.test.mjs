import { describe, expect, it } from 'vitest';

import * as browser from '../apps/web/public/vendor/domain/index.js';
import * as domain from '../packages/domain/src/index.ts';
import { sanitizeSourceEvent } from '../apps/worker/src/pilot/pilot-sanitizer.ts';

const malformed = [
  'Jan 02 2030 Z',
  '2030-01-02',
  '2030-01-02 01:00:00Z',
  '2030-01-02T01:00:00',
  '2030-02-30T01:00:00Z',
  '2030-02-30T01:00:00+08:00',
  '2030-01-02T24:00:00Z',
  '2030-01-02T24:00:00+08:00'
];
const valid = [
  '2030-01-02T12:00:00Z',
  '2030-01-02T12:00:00+00:00',
  '2030-01-02T12:00:00+08:00',
  '2030-01-02T12:00:00-07:00',
  '2030-01-02T12:00:00.123456789+08:00',
  '2030-01-02t12:00:00z'
];
const busy = (startsAt, endsAt) => ({
  summary: '[忙碌] 會議',
  start: { dateTime: startsAt },
  end: { dateTime: endsAt }
});

describe.each([
  { name: 'domain', rules: domain },
  { name: 'browser', rules: browser }
])('$name external Calendar datetime admission', ({ rules }) => {
  describe.each(['start', 'end'])('%s boundary', (field) => {
    it.each(malformed)(
      'rejects malformed RFC3339 projection input %s',
      (value) => {
        const startsAt = field === 'start' ? value : '2029-01-01T00:00:00Z';
        const endsAt = field === 'end' ? value : '2030-12-31T23:59:59Z';
        expect(
          rules.extractCalendarEventRange(busy(startsAt, endsAt))
        ).toBeUndefined();
      }
    );
    it.each(malformed)('rejects malformed RFC3339 entry input %s', (value) => {
      const startsAt = field === 'start' ? value : '2029-01-01T00:00:00Z';
      const endsAt = field === 'end' ? value : '2030-12-31T23:59:59Z';
      expect(
        rules.parseCalendarEntry(busy(startsAt, endsAt), new Set())
      ).toMatchObject({
        ok: false,
        errors: expect.arrayContaining(['time_invalid'])
      });
    });
  });
  it.each(valid)(
    'preserves valid explicit offset normalization %s',
    (startsAt) => {
      const endsAt = '2030-12-31T23:59:59Z';
      const expected = {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString()
      };
      const input = busy(startsAt, endsAt);
      expect(rules.extractCalendarEventRange(input)).toEqual(expected);
      expect(rules.parseCalendarEntry(input, new Set())).toMatchObject({
        ok: true,
        kind: 'busy',
        ...expected
      });
    }
  );
  it('preserves the separate real-calendar all-day path', () => {
    expect(
      rules.parseCalendarEntry(
        {
          summary: '[忙碌] 休假',
          start: { date: '2030-01-02' },
          end: { date: '2030-01-03' }
        },
        new Set()
      )
    ).toMatchObject({ ok: true, kind: 'busy', allDay: true });
  });
});

const options = {
  pseudonymKey: 'synthetic-time-guard-not-a-real-secret',
  windowStart: new Date('2029-01-01T00:00:00Z'),
  windowEnd: new Date('2031-01-01T00:00:00Z')
};
describe('worker external Calendar datetime admission', () => {
  describe.each(['start', 'end'])('%s boundary', (field) => {
    it.each(malformed)('rejects malformed RFC3339 worker input %s', (value) => {
      const source = {
        id: 'synthetic_time_guard',
        start: { dateTime: field === 'start' ? value : '2029-01-01T00:00:00Z' },
        ...(field === 'end' ? { end: { dateTime: value } } : {})
      };
      expect(sanitizeSourceEvent(source, options)).toEqual({
        ok: false,
        reason: 'malformed_time'
      });
    });
  });
  it.each(valid)(
    'preserves valid worker offset normalization %s',
    (startsAt) => {
      const endsAt = new Date(Date.parse(startsAt) + 30 * 60_000).toISOString();
      expect(
        sanitizeSourceEvent(
          {
            id: 'synthetic_time_guard',
            start: { dateTime: startsAt },
            end: { dateTime: endsAt }
          },
          options
        )
      ).toMatchObject({
        ok: true,
        event: { startsAt: new Date(startsAt).toISOString() }
      });
    }
  );
});
