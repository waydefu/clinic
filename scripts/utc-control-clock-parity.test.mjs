import { describe, expect, it } from 'vitest';

import * as browser from '../apps/web/public/vendor/domain/index.js';
import * as domain from '../packages/domain/src/index.ts';

const invalidTimes = [
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
const pending = {
  id: 'synthetic_utc_outbox',
  appointmentId: 'synthetic_utc_appointment',
  idempotencyKey: 'synthetic_utc_key',
  correlationId: 'synthetic_utc_correlation',
  causationId: 'synthetic_utc_causation',
  status: 'pending',
  attempts: 0
};
const snapshot = {
  id: 'synthetic_utc_payroll',
  managerId: 'synthetic_utc_manager',
  payrollPeriod: '2030-01',
  status: 'locked',
  creditCount: 1,
  closedAt: '2030-01-01T00:00:00.000Z'
};
const adjustment = {
  id: 'synthetic_utc_adjustment',
  periodId: snapshot.id,
  managerId: snapshot.managerId,
  payrollPeriod: snapshot.payrollPeriod,
  sequence: 1,
  delta: 1,
  reasonCode: 'SYNTHETIC_UTC_CORRECTION',
  recordedAt: '2030-01-02T04:00:00.000Z',
  resultingCreditCount: 2
};

describe.each([
  { name: 'domain', rules: domain },
  { name: 'browser', rules: browser }
])('$name UTC outbox clocks and payroll history', ({ rules }) => {
  it.each(invalidTimes)('keeps unscheduled work denied with clock %s', (value) => {
    expect(rules.isDue(pending, value)).toBe(false);
  });

  it.each(invalidTimes)('keeps scheduled work denied with clock %s', (value) => {
    expect(
      rules.isDue({ ...pending, nextAttemptAt: snapshot.closedAt }, value)
    ).toBe(false);
  });

  it.each(invalidTimes)('keeps malformed next-attempt %s denied', (value) => {
    expect(
      rules.isDue({ ...pending, nextAttemptAt: value }, '2030-04-01T00:00:00Z')
    ).toBe(false);
  });

  describe.each([
    { name: 'success', outcome: { kind: 'succeeded' }, attempts: 0 },
    { name: 'retry', outcome: { kind: 'failed', reason: 'synthetic', retryable: true }, attempts: 0 },
    { name: 'non-retryable', outcome: { kind: 'failed', reason: 'synthetic', retryable: false }, attempts: 0 },
    { name: 'exhausted', outcome: { kind: 'failed', reason: 'synthetic', retryable: true }, attempts: rules.MAX_ATTEMPTS - 1 }
  ])('$name attempt', ({ outcome, attempts }) => {
    it.each(invalidTimes)('rejects invalid clock %s without a decision', (value) => {
      expect(() =>
        rules.planOutboxAttempt({ ...pending, attempts }, outcome, value)
      ).toThrow(expect.objectContaining({ code: 'INVALID_TIMESTAMP' }));
    });
  });

  it.each(invalidTimes)('refuses corrupted closed-at %s', (value) => {
    expect(() =>
      rules.payrollTotalAfterAdjustments({ ...snapshot, closedAt: value }, [])
    ).toThrow(expect.objectContaining({ code: 'INVALID_TIMESTAMP' }));
  });

  it.each(invalidTimes)('refuses corrupted recorded-at %s', (value) => {
    expect(() =>
      rules.payrollTotalAfterAdjustments(snapshot, [{ ...adjustment, recordedAt: value }])
    ).toThrow(expect.objectContaining({ code: 'INVALID_TIMESTAMP' }));
  });

  it.each([
    '2030-01-02T04:00:00Z',
    '2030-01-02T04:00:00.123Z',
    '2030-01-02T04:00:00.123456Z',
    '2030-01-02T04:00:00.123456789Z'
  ])('preserves valid UTC precision for %s', (value) => {
    expect(rules.isDue(pending, value)).toBe(true);
    expect(rules.planOutboxAttempt(pending, { kind: 'succeeded' }, value)).toMatchObject({ status: 'completed', attempts: 1 });
    const retry = rules.planOutboxAttempt(pending, { kind: 'failed', reason: 'synthetic', retryable: true }, value);
    expect(Date.parse(retry.nextAttemptAt) - Date.parse(value)).toBe(rules.BASE_BACKOFF_SECONDS * 1000);
    expect(rules.payrollTotalAfterAdjustments({ ...snapshot, closedAt: value }, [])).toBe(1);
    expect(rules.payrollTotalAfterAdjustments(snapshot, [{ ...adjustment, recordedAt: value }])).toBe(2);
  });
});
