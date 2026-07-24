import { describe, expect, it } from 'vitest';

import {
  ClosePayrollPeriodRequestSchema,
  PayrollPeriodSnapshotSchema,
  RecordPayrollAdjustmentRequestSchema
} from './payroll.js';

describe('ClosePayrollPeriodRequestSchema', () => {
  it('accepts a manager, a YYYY-MM period and an idempotency key', () => {
    expect(
      ClosePayrollPeriodRequestSchema.parse({
        idempotencyKey: 'payroll-close-key-0001',
        managerId: 'manager_alpha',
        payrollPeriod: '2026-08'
      })
    ).toEqual({
      idempotencyKey: 'payroll-close-key-0001',
      managerId: 'manager_alpha',
      payrollPeriod: '2026-08'
    });
  });

  it.each([
    ['a 13th month', '2026-13'],
    ['a zero month', '2026-00'],
    ['a day-level date', '2026-08-01'],
    ['free text', 'August 2026']
  ])('rejects %s as a payroll period', (_caseName, payrollPeriod) => {
    expect(
      ClosePayrollPeriodRequestSchema.safeParse({
        idempotencyKey: 'payroll-close-key-0001',
        managerId: 'manager_alpha',
        payrollPeriod
      }).success
    ).toBe(false);
  });
});

describe('RecordPayrollAdjustmentRequestSchema', () => {
  it('accepts a non-zero signed delta and a closed-list reason', () => {
    expect(
      RecordPayrollAdjustmentRequestSchema.safeParse({
        idempotencyKey: 'payroll-adjust-key-0001',
        managerId: 'manager_alpha',
        payrollPeriod: '2026-08',
        delta: -2,
        reasonCode: 'disputed_credit'
      }).success
    ).toBe(true);
  });

  it('rejects a zero delta, a fractional delta and free-text reasons', () => {
    const base = {
      idempotencyKey: 'payroll-adjust-key-0001',
      managerId: 'manager_alpha',
      payrollPeriod: '2026-08',
      reasonCode: 'correction' as const
    };
    expect(
      RecordPayrollAdjustmentRequestSchema.safeParse({ ...base, delta: 0 })
        .success
    ).toBe(false);
    expect(
      RecordPayrollAdjustmentRequestSchema.safeParse({ ...base, delta: 1.5 })
        .success
    ).toBe(false);
    expect(
      RecordPayrollAdjustmentRequestSchema.safeParse({
        ...base,
        delta: 1,
        reasonCode: 'because I said so'
      }).success
    ).toBe(false);
  });
});

describe('PayrollPeriodSnapshotSchema', () => {
  it('is always locked and carries a nullable adjustment time', () => {
    expect(
      PayrollPeriodSnapshotSchema.safeParse({
        managerId: 'manager_alpha',
        payrollPeriod: '2026-08',
        status: 'locked',
        creditCount: 3,
        closedAt: '2026-09-01T00:00:00.000Z',
        lastAdjustedAt: null
      }).success
    ).toBe(true);
    expect(
      PayrollPeriodSnapshotSchema.safeParse({
        managerId: 'manager_alpha',
        payrollPeriod: '2026-08',
        status: 'open',
        creditCount: 3,
        closedAt: '2026-09-01T00:00:00.000Z',
        lastAdjustedAt: null
      }).success
    ).toBe(false);
  });
});
