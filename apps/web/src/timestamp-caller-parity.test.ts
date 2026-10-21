import {
  OPERATIONAL_ROLES,
  parsePublishedScheduleSnapshot,
  planPayrollAdjustment,
  planPayrollPeriodClose,
  planSchedulePublication,
  TAIPEI_TIME_ZONE,
  type Schedule
} from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

import {
  parsePublishedScheduleSnapshot as browserRead,
  planPayrollAdjustment as browserAdjust,
  planPayrollPeriodClose as browserClose,
  planSchedulePublication as browserPublish
} from '../public/vendor/domain/index.js';

const baseline = '2026-09-01T00:00:00.000Z';
const audit = {
  actorId: 'synthetic_actor',
  actorRole: OPERATIONAL_ROLES[0],
  correlationId: 'synthetic_correlation',
  source: 'api' as const,
  reasonCode: 'synthetic_reason',
  policyVersion: null
};
const idempotency = {
  actorId: audit.actorId,
  scope: 'synthetic:timestamp',
  requestHash: 'a'.repeat(64),
  recordId: 'b'.repeat(64)
};
const schedule: Schedule = {
  timeZone: TAIPEI_TIME_ZONE,
  weeklyAvailability: [],
  dateExceptions: []
};
const payrollRequest = (requestedAt: string) => ({
  managerId: 'synthetic_manager',
  payrollPeriod: '2026-08',
  requestedAt,
  audit,
  idempotency
});

const runtimes = [
  {
    name: 'native domain',
    close: planPayrollPeriodClose,
    adjust: planPayrollAdjustment,
    publish: planSchedulePublication,
    read: parsePublishedScheduleSnapshot
  },
  {
    name: 'compiled browser vendor',
    close: browserClose,
    adjust: browserAdjust,
    publish: browserPublish,
    read: browserRead
  }
];

describe.each(runtimes)('$name UTC caller boundaries', (domain) => {
  const closed = domain.close(payrollRequest(baseline), [], undefined).snapshot;
  const callers = [
    {
      name: 'payroll close',
      field: 'requestedAt',
      run: (time: string) =>
        domain.close(payrollRequest(time), [], undefined).snapshot.closedAt
    },
    {
      name: 'payroll adjustment',
      field: 'requestedAt',
      run: (time: string) =>
        domain.adjust({ ...payrollRequest(time), delta: 1 }, closed, [])
          .adjustment.recordedAt
    },
    {
      name: 'schedule publication',
      field: 'requestedAt',
      run: (time: string) =>
        domain.publish(
          {
            draft: schedule,
            expectedVersion: 0,
            slotGeneration: { startDate: '2030-01-02', dayCount: 1 },
            requestedAt: time,
            audit,
            idempotency
          },
          { publishedVersion: 0, publishedAt: null },
          [],
          []
        ).publishedAt
    },
    {
      name: 'published snapshot reader',
      field: 'publishedAt',
      run: (time: string) =>
        domain.read({
          schemaVersion: 1,
          publishedVersion: 1,
          publishedAt: time,
          schedule
        }).publishedAt
    }
  ];

  describe.each(callers)('$name', ({ field, run }) => {
    it.each([
      '2026-09-02T00:00:00Z',
      '2026-09-02T00:00:00.000Z',
      '2026-09-02T23:59:59.123456789Z',
      '2028-02-29T23:59:59Z'
    ])('preserves approved UTC ISO precision: %s', (time) => {
      expect(run(time)).toBe(time);
    });

    it.each([
      'Sep 02 2026 Z',
      '2026-09-02T00:00:00',
      '2026-09-02T00:00:00+08:00',
      '2026-09-02T00:00Z',
      '2026-09-31T00:00:00Z',
      '2026-02-29T00:00:00Z',
      '2026-09-02T24:00:00Z',
      '2026-09-02T24:00:00.000Z',
      '2026-09-02T00:60:00Z',
      '2026-09-02T00:00:60Z',
      ''
    ])('rejects malformed timestamps at the owning boundary: %s', (time) => {
      expect(() => run(time)).toThrow(
        expect.objectContaining({
          code: 'INVALID_TIMESTAMP',
          message: `${field} must be a valid UTC ISO-8601 timestamp.`
        })
      );
    });
  });
});
