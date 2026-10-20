import { describe, expect, it } from 'vitest';

import {
  BusinessMonthSchema,
  LocalDateSchema,
  LocalTimeSchema,
  MonthDaySchema,
  RecordFollowUpRequestSchema,
  TimeIntervalSchema
} from './index.js';

const consumers = [
  {
    name: 'common primitive',
    accepts: (time: string) => LocalTimeSchema.safeParse(time).success
  },
  {
    name: 'schedule interval start',
    accepts: (time: string) =>
      TimeIntervalSchema.safeParse({
        startLocalTime: time,
        endLocalTime: '23:59'
      }).success
  },
  {
    name: 'schedule interval end',
    accepts: (time: string) =>
      TimeIntervalSchema.safeParse({
        startLocalTime: '00:00',
        endLocalTime: time
      }).success
  },
  {
    name: 'follow-up target',
    accepts: (time: string) =>
      RecordFollowUpRequestSchema.safeParse({
        idempotencyKey: 'synthetic_time_0001',
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: time
      }).success
  }
];

describe.each(consumers)(
  '$name uses the shared HH:MM boundary',
  ({ accepts }) => {
    it.each(['00:00', '00:01', '12:30', '23:59'])('accepts %s', (time) => {
      expect(accepts(time)).toBe(true);
    });

    it.each([
      '24:00',
      '25:00',
      '23:60',
      '00:60',
      '9:00',
      '09:0',
      '09:00:00',
      '09:00Z',
      ' 09:00',
      '09:00 ',
      '１２:００',
      ''
    ])('rejects %s without coercion', (time) => {
      expect(accepts(time)).toBe(false);
    });
  }
);

describe('independent date primitives retain their own semantics', () => {
  it('does not turn a business month into a calendar date or month-day', () => {
    expect(BusinessMonthSchema.safeParse('2030-01').success).toBe(true);
    expect(BusinessMonthSchema.safeParse('2030-13').success).toBe(false);
    expect(BusinessMonthSchema.safeParse('2030-01-02').success).toBe(false);
    expect(LocalDateSchema.safeParse('2030-01').success).toBe(false);
    expect(MonthDaySchema.safeParse('2030-01').success).toBe(false);
  });

  it('keeps real-calendar validation separate from the month-day wire shape', () => {
    expect(LocalDateSchema.safeParse('2028-02-29').success).toBe(true);
    expect(LocalDateSchema.safeParse('2030-02-30').success).toBe(false);
    expect(LocalDateSchema.safeParse('--02-29').success).toBe(false);
    expect(MonthDaySchema.safeParse('--02-29').success).toBe(true);
    // Calendar validity belongs to domain intake, not the yearless wire shape.
    expect(MonthDaySchema.safeParse('--02-30').success).toBe(true);
    expect(MonthDaySchema.safeParse('2028-02-29').success).toBe(false);
  });
});
