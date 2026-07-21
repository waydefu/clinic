import { describe, expect, it } from 'vitest';

import {
  DomainError,
  createPayrollCredit,
  summarizeMonthlyManagerWorkload,
  taipeiPayrollPeriod
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
    expect(taipeiPayrollPeriod(completedAppointment.completedAt)).toBe('2026-08');
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
        appointment: { ...completedAppointment, status: 'confirmed', completedAt: undefined },
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
      appointment: { ...completedAppointment, id: 'appointment-002', patientId: 'patient-002' },
      assignment: {
        patientId: 'patient-002',
        managerId: 'manager-001',
        activeFrom: '2026-07-01T00:00:00.000Z'
      },
      ruleVersion: 'v1'
    });
    const revisedRule = createPayrollCredit({
      appointment: { ...completedAppointment, id: 'appointment-003', patientId: 'patient-001' },
      assignment: {
        patientId: 'patient-001',
        managerId: 'manager-001',
        activeFrom: '2026-07-01T00:00:00.000Z'
      },
      ruleVersion: 'v2'
    });

    expect(summarizeMonthlyManagerWorkload([first, second, revisedRule])).toEqual([
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
