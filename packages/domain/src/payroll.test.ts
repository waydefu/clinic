import { describe, expect, it } from 'vitest';

import {
  DomainError,
  createPayrollCredit,
  planPayrollAdjustment,
  payrollTotalAfterAdjustments,
  type PayrollAdjustment,
  planPayrollPeriodClose,
  summarizeMonthlyManagerWorkload,
  taipeiPayrollPeriod,
  type AuditContext,
  type IdempotencyContext,
  type PayrollCredit,
  type PayrollPeriodCloseRequest
} from './index.js';

const completedAppointment = {
  id: 'appointment-001',
  patientId: 'patient-001',
  slotId: 'slot-001',
  status: 'completed' as const,
  createdAt: '2026-07-31T15:00:00.000Z',
  updatedAt: '2026-07-31T16:30:00.000Z',
  completedAt: '2026-07-31T16:30:00.000Z'
};

describe('monthly case-manager payroll credit', () => {
  it('uses Asia/Taipei at the UTC month boundary', () => {
    expect(taipeiPayrollPeriod(completedAppointment.completedAt)).toBe(
      '2026-08'
    );
  });

  it('uses a deterministic one-patient, one-manager, one-period key', () => {
    const credit = createPayrollCredit({
      appointment: completedAppointment,
      assignment: {
        patientId: 'patient-001',
        managerId: 'manager-001',
        activeFrom: '2026-07-01T00:00:00.000Z'
      },
      ruleVersion: 'v1'
    });

    expect(credit.id).toBe(
      'manager-001|patient-001|2026-08|unique_patient_completed|v1'
    );
  });

  it('never grants a credit from a non-completed appointment', () => {
    expect(() =>
      createPayrollCredit({
        appointment: {
          ...completedAppointment,
          status: 'confirmed',
          completedAt: undefined
        },
        assignment: {
          patientId: 'patient-001',
          managerId: 'manager-001',
          activeFrom: '2026-07-01T00:00:00.000Z'
        },
        ruleVersion: 'v1'
      })
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'PAYROLL_NOT_ELIGIBLE'
      })
    );
  });

  it('reports distinct patients per manager/month and preserves rule versions', () => {
    const first = createPayrollCredit({
      appointment: completedAppointment,
      assignment: {
        patientId: 'patient-001',
        managerId: 'manager-001',
        activeFrom: '2026-07-01T00:00:00.000Z'
      },
      ruleVersion: 'v1'
    });
    const second = createPayrollCredit({
      appointment: {
        ...completedAppointment,
        id: 'appointment-002',
        patientId: 'patient-002'
      },
      assignment: {
        patientId: 'patient-002',
        managerId: 'manager-001',
        activeFrom: '2026-07-01T00:00:00.000Z'
      },
      ruleVersion: 'v1'
    });
    const revisedRule = createPayrollCredit({
      appointment: {
        ...completedAppointment,
        id: 'appointment-003',
        patientId: 'patient-001'
      },
      assignment: {
        patientId: 'patient-001',
        managerId: 'manager-001',
        activeFrom: '2026-07-01T00:00:00.000Z'
      },
      ruleVersion: 'v2'
    });

    expect(
      summarizeMonthlyManagerWorkload([first, second, revisedRule])
    ).toEqual([
      {
        managerId: 'manager-001',
        payrollPeriod: '2026-08',
        creditCount: 3,
        uniquePatientCount: 2,
        ruleBreakdown: [
          {
            metricCode: 'unique_patient_completed',
            ruleVersion: 'v1',
            creditCount: 2,
            uniquePatientCount: 2
          },
          {
            metricCode: 'unique_patient_completed',
            ruleVersion: 'v2',
            creditCount: 1,
            uniquePatientCount: 1
          }
        ]
      }
    ]);
  });

  it('rejects duplicate payroll credits instead of inflating a workload count', () => {
    const credit = createPayrollCredit({
      appointment: completedAppointment,
      assignment: {
        patientId: 'patient-001',
        managerId: 'manager-001',
        activeFrom: '2026-07-01T00:00:00.000Z'
      },
      ruleVersion: 'v1'
    });

    expect(() => summarizeMonthlyManagerWorkload([credit, credit])).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'PAYROLL_DUPLICATE_CREDIT'
      })
    );
  });
});

const HASH_A = 'c'.repeat(64);
const HASH_B = 'd'.repeat(64);

function creditFor(patientId: string): PayrollCredit {
  return createPayrollCredit({
    appointment: {
      ...completedAppointment,
      id: `appt_${patientId}`,
      patientId
    },
    assignment: {
      patientId,
      managerId: 'manager-001',
      activeFrom: '2026-07-01T00:00:00.000Z'
    },
    ruleVersion: 'v1'
  });
}

const CLOSE_AUDIT: AuditContext = {
  actorId: 'actor_finance',
  actorRole: 'test_finance_owner',
  correlationId: 'corr_payroll_1',
  source: 'api',
  reasonCode: null,
  policyVersion: null
};

const CLOSE_IDEMPOTENCY: IdempotencyContext = {
  actorId: 'actor_finance',
  scope: 'payroll:close',
  requestHash: HASH_A,
  recordId: HASH_B
};

function closeRequest(
  overrides: Partial<PayrollPeriodCloseRequest> = {}
): PayrollPeriodCloseRequest {
  return {
    managerId: 'manager-001',
    payrollPeriod: '2026-08',
    audit: CLOSE_AUDIT,
    requestedAt: '2026-09-01T00:00:00.000Z',
    idempotency: CLOSE_IDEMPOTENCY,
    ...overrides
  };
}

describe('payroll period close and adjustment', () => {
  it('locks a period with the unique credit count for that manager', () => {
    const plan = planPayrollPeriodClose(
      closeRequest(),
      [creditFor('patient-001'), creditFor('patient-002')],
      undefined
    );

    expect(plan.snapshot).toEqual({
      id: 'payroll_manager-001_2026-08',
      managerId: 'manager-001',
      payrollPeriod: '2026-08',
      status: 'locked',
      creditCount: 2,
      closedAt: '2026-09-01T00:00:00.000Z'
    });
    expect(plan.auditEvent.action).toBe('payroll_period_closed');
    expect(plan.auditEvent.resourceType).toBe('payroll');
    expect(plan.auditEvent.before).toEqual({
      payrollPeriod: '2026-08',
      status: 'open',
      creditCount: 2
    });
    expect(plan.auditEvent.after).toEqual({
      payrollPeriod: '2026-08',
      status: 'locked',
      creditCount: 2
    });
    expect(plan.idempotencyRecord.responseReference.resourceType).toBe(
      'payroll_period'
    );
  });

  it('ignores credits from other managers or periods when counting', () => {
    const otherManager = createPayrollCredit({
      appointment: {
        ...completedAppointment,
        id: 'appt_other',
        patientId: 'patient-003'
      },
      assignment: {
        patientId: 'patient-003',
        managerId: 'manager-002',
        activeFrom: '2026-07-01T00:00:00.000Z'
      },
      ruleVersion: 'v1'
    });
    const plan = planPayrollPeriodClose(
      closeRequest(),
      [creditFor('patient-001'), otherManager],
      undefined
    );
    expect(plan.snapshot.creditCount).toBe(1);
  });

  it('refuses to close a period that is already closed', () => {
    const first = planPayrollPeriodClose(
      closeRequest(),
      [creditFor('patient-001')],
      undefined
    );
    expect(() =>
      planPayrollPeriodClose(
        closeRequest(),
        [creditFor('patient-001')],
        first.snapshot
      )
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'PAYROLL_PERIOD_ALREADY_CLOSED'
      })
    );
  });

  it('records an adjustment as a ledger entry and leaves the snapshot untouched', () => {
    const closed = planPayrollPeriodClose(
      closeRequest(),
      [creditFor('patient-001'), creditFor('patient-002')],
      undefined
    ).snapshot;
    const frozen = structuredClone(closed);

    const plan = planPayrollAdjustment(
      {
        managerId: 'manager-001',
        payrollPeriod: '2026-08',
        delta: 1,
        audit: { ...CLOSE_AUDIT, reasonCode: 'late_completion' },
        requestedAt: '2026-09-05T00:00:00.000Z',
        idempotency: { ...CLOSE_IDEMPOTENCY, scope: 'payroll:adjust' }
      },
      closed
    );

    // 月結規格要求鎖定後「不變更原始 credit 或歷史匯出」。快照必須逐欄位維持
    // 原狀——先前的實作是 `{...closed, creditCount}`，寫回就覆寫了簽核過的總數。
    expect(closed).toEqual(frozen);
    expect(plan).not.toHaveProperty('snapshot');
    expect(plan.adjustment).toEqual({
      id: `payroll_adjustment_${HASH_B}`,
      periodId: 'payroll_manager-001_2026-08',
      managerId: 'manager-001',
      payrollPeriod: '2026-08',
      sequence: 1,
      delta: 1,
      reasonCode: 'late_completion',
      recordedAt: '2026-09-05T00:00:00.000Z',
      resultingCreditCount: 3
    });
    expect(payrollTotalAfterAdjustments(closed, [plan.adjustment])).toBe(3);
    expect(plan.auditEvent.action).toBe('payroll_adjustment_recorded');
    expect(plan.auditEvent.reasonCode).toBe('late_completion');
    expect(plan.auditEvent.before).toEqual({
      payrollPeriod: '2026-08',
      status: 'locked',
      creditCount: 2
    });
    expect(plan.auditEvent.after).toEqual({
      payrollPeriod: '2026-08',
      status: 'locked',
      creditCount: 3
    });
  });

  it('refuses an adjustment without a reason, on an open period, or below zero', () => {
    const closed = planPayrollPeriodClose(
      closeRequest(),
      [creditFor('patient-001')],
      undefined
    ).snapshot;

    expect(() =>
      planPayrollAdjustment(
        {
          managerId: 'manager-001',
          payrollPeriod: '2026-08',
          delta: 1,
          audit: CLOSE_AUDIT,
          requestedAt: '2026-09-05T00:00:00.000Z',
          idempotency: CLOSE_IDEMPOTENCY
        },
        closed
      )
    ).toThrow(/reason code/);

    expect(() =>
      planPayrollAdjustment(
        {
          managerId: 'manager-001',
          payrollPeriod: '2026-08',
          delta: 1,
          audit: { ...CLOSE_AUDIT, reasonCode: 'correction' },
          requestedAt: '2026-09-05T00:00:00.000Z',
          idempotency: CLOSE_IDEMPOTENCY
        },
        undefined
      )
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'PAYROLL_PERIOD_NOT_CLOSED'
      })
    );

    expect(() =>
      planPayrollAdjustment(
        {
          managerId: 'manager-001',
          payrollPeriod: '2026-08',
          delta: -5,
          audit: { ...CLOSE_AUDIT, reasonCode: 'correction' },
          requestedAt: '2026-09-05T00:00:00.000Z',
          idempotency: CLOSE_IDEMPOTENCY
        },
        closed
      )
    ).toThrow(/below zero/);
  });

  it('numbers successive adjustments and accumulates onto the running total', () => {
    const closed = planPayrollPeriodClose(
      closeRequest(),
      [creditFor('patient-001'), creditFor('patient-002')],
      undefined
    ).snapshot;

    const first = planPayrollAdjustment(
      {
        managerId: 'manager-001',
        payrollPeriod: '2026-08',
        delta: 2,
        audit: { ...CLOSE_AUDIT, reasonCode: 'late_completion' },
        requestedAt: '2026-09-05T00:00:00.000Z',
        idempotency: { ...CLOSE_IDEMPOTENCY, recordId: 'e'.repeat(64) }
      },
      closed
    ).adjustment;

    const second = planPayrollAdjustment(
      {
        managerId: 'manager-001',
        payrollPeriod: '2026-08',
        delta: -1,
        audit: { ...CLOSE_AUDIT, reasonCode: 'correction' },
        requestedAt: '2026-09-06T00:00:00.000Z',
        idempotency: { ...CLOSE_IDEMPOTENCY, recordId: 'f'.repeat(64) }
      },
      closed,
      [first]
    ).adjustment;

    expect(second.sequence).toBe(2);
    expect(second.resultingCreditCount).toBe(3);
    expect(payrollTotalAfterAdjustments(closed, [first, second])).toBe(3);
    // 每一筆都獨立存在，第二筆沒有取代第一筆。
    expect(first.resultingCreditCount).toBe(4);
  });

  it('refuses an adjustment dated before the close or before the previous one', () => {
    const closed = planPayrollPeriodClose(
      closeRequest(),
      [creditFor('patient-001')],
      undefined
    ).snapshot;
    const request = (requestedAt: string) => ({
      managerId: 'manager-001',
      payrollPeriod: '2026-08',
      delta: 1,
      audit: { ...CLOSE_AUDIT, reasonCode: 'correction' as const },
      requestedAt,
      idempotency: CLOSE_IDEMPOTENCY
    });

    expect(() =>
      planPayrollAdjustment(request('2026-08-31T00:00:00.000Z'), closed)
    ).toThrow(/predate the close/);

    const first = planPayrollAdjustment(
      request('2026-09-10T00:00:00.000Z'),
      closed
    ).adjustment;
    expect(() =>
      planPayrollAdjustment(request('2026-09-09T00:00:00.000Z'), closed, [
        first
      ])
    ).toThrow(/predate the previous adjustment/);
  });

  it('refuses to read a ledger that is corrupt rather than returning a plausible total', () => {
    const closed = planPayrollPeriodClose(
      closeRequest(),
      [creditFor('patient-001')],
      undefined
    ).snapshot;
    const entry: PayrollAdjustment = {
      id: 'payroll_adjustment_a',
      periodId: closed.id,
      managerId: 'manager-001',
      payrollPeriod: '2026-08',
      sequence: 1,
      delta: 1,
      reasonCode: 'correction',
      recordedAt: '2026-09-05T00:00:00.000Z',
      resultingCreditCount: 2
    };

    expect(() =>
      payrollTotalAfterAdjustments(closed, [
        { ...entry, payrollPeriod: '2026-07', periodId: 'payroll_other' }
      ])
    ).toThrow(/another payroll period/);
    expect(() =>
      payrollTotalAfterAdjustments(closed, [{ ...entry, sequence: 2 }])
    ).toThrow(/gapless/);
    expect(() =>
      payrollTotalAfterAdjustments(closed, [
        { ...entry, resultingCreditCount: 99 }
      ])
    ).toThrow(/running total/);
  });
});
