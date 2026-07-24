import { describe, expect, it } from 'vitest';

import {
  ClosePayrollPeriodRequestSchema,
  PayrollAdjustmentSchema,
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
  const snapshot = {
    managerId: 'manager_alpha',
    payrollPeriod: '2026-08',
    status: 'locked',
    creditCount: 3,
    closedAt: '2026-09-01T00:00:00.000Z'
  };

  it('is always locked', () => {
    expect(PayrollPeriodSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      PayrollPeriodSnapshotSchema.safeParse({ ...snapshot, status: 'open' })
        .success
    ).toBe(false);
  });

  it('refuses a mutable adjustment field on the frozen snapshot', () => {
    // 快照是寫一次就不再改的紀錄。`lastAdjustedAt` 這種欄位一旦存在，就等於邀請
    // 別人去改它——先前的 adjustment 規劃程式正是這樣把簽核過的總數覆寫掉的。
    expect(
      PayrollPeriodSnapshotSchema.safeParse({
        ...snapshot,
        lastAdjustedAt: '2026-09-05T00:00:00.000Z'
      }).success
    ).toBe(false);
  });
});

describe('PayrollAdjustmentSchema', () => {
  const adjustment = {
    periodId: 'payroll_manager_alpha_2026-08',
    managerId: 'manager_alpha',
    payrollPeriod: '2026-08',
    sequence: 1,
    delta: -1,
    reasonCode: 'correction',
    recordedAt: '2026-09-05T00:00:00.000Z',
    resultingCreditCount: 2
  };

  it('accepts a signed non-zero delta with a running total', () => {
    expect(PayrollAdjustmentSchema.safeParse(adjustment).success).toBe(true);
  });

  it('refuses a no-op delta, an unnumbered entry, or a negative total', () => {
    expect(
      PayrollAdjustmentSchema.safeParse({ ...adjustment, delta: 0 }).success
    ).toBe(false);
    expect(
      PayrollAdjustmentSchema.safeParse({ ...adjustment, sequence: 0 }).success
    ).toBe(false);
    expect(
      PayrollAdjustmentSchema.safeParse({
        ...adjustment,
        resultingCreditCount: -1
      }).success
    ).toBe(false);
  });
});
