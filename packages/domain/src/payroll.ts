import { assertUtcTimestamp, type Appointment } from './appointment.js';
import { DomainError } from './errors.js';

export const UNIQUE_PATIENT_COMPLETED_METRIC = 'unique_patient_completed';
export const TAIPEI_TIME_ZONE = 'Asia/Taipei';

export interface ActiveCaseAssignment {
  readonly patientId: string;
  readonly managerId: string;
  readonly activeFrom: string;
  readonly activeUntil?: string;
}

export interface PayrollCreditInput {
  readonly appointment: Appointment;
  readonly assignment: ActiveCaseAssignment;
  readonly metricCode?: typeof UNIQUE_PATIENT_COMPLETED_METRIC;
  readonly ruleVersion: string;
}

export interface PayrollCredit {
  readonly id: string;
  readonly managerId: string;
  readonly patientId: string;
  readonly appointmentId: string;
  readonly payrollPeriod: string;
  readonly metricCode: typeof UNIQUE_PATIENT_COMPLETED_METRIC;
  readonly ruleVersion: string;
}

export interface PayrollRuleWorkloadBreakdown {
  readonly metricCode: typeof UNIQUE_PATIENT_COMPLETED_METRIC;
  readonly ruleVersion: string;
  readonly creditCount: number;
  readonly uniquePatientCount: number;
}

/**
 * A non-monetary, read-only workload summary. The headline total counts each
 * patient once per manager and Taipei month; its breakdown preserves the
 * metric/rule-version detail required for a later approved payroll review.
 */
export interface MonthlyManagerWorkload {
  readonly managerId: string;
  readonly payrollPeriod: string;
  readonly creditCount: number;
  readonly uniquePatientCount: number;
  readonly ruleBreakdown: readonly PayrollRuleWorkloadBreakdown[];
}

/**
 * Produces the deterministic uniqueness key used by a Firestore transaction.
 * The caller must create this document atomically and treat an existing key as
 * an idempotent duplicate, never as a second payable patient.
 */
export function createPayrollCredit(input: PayrollCreditInput): PayrollCredit {
  const { appointment, assignment } = input;
  const metricCode = input.metricCode ?? UNIQUE_PATIENT_COMPLETED_METRIC;

  if (
    appointment.status !== 'completed' ||
    appointment.completedAt === undefined
  ) {
    throw new DomainError(
      'PAYROLL_NOT_ELIGIBLE',
      'Only a completed appointment may create a payroll credit.'
    );
  }

  assertUtcTimestamp(appointment.completedAt, 'appointment.completedAt');
  assertAssignmentCoversCompletion(assignment, appointment);
  assertRuleVersion(input.ruleVersion);

  const payrollPeriod = taipeiPayrollPeriod(appointment.completedAt);
  const id = payrollCreditId({
    managerId: assignment.managerId,
    patientId: appointment.patientId,
    payrollPeriod,
    metricCode,
    ruleVersion: input.ruleVersion
  });

  return {
    id,
    managerId: assignment.managerId,
    patientId: appointment.patientId,
    appointmentId: appointment.id,
    payrollPeriod,
    metricCode,
    ruleVersion: input.ruleVersion
  };
}

export function summarizeMonthlyManagerWorkload(
  credits: readonly PayrollCredit[]
): readonly MonthlyManagerWorkload[] {
  const creditIds = new Set<string>();
  const workloads = new Map<
    string,
    {
      readonly managerId: string;
      readonly payrollPeriod: string;
      readonly patientIds: Set<string>;
      readonly ruleBreakdowns: Map<
        string,
        {
          readonly metricCode: typeof UNIQUE_PATIENT_COMPLETED_METRIC;
          readonly ruleVersion: string;
          readonly creditIds: Set<string>;
          readonly patientIds: Set<string>;
        }
      >;
    }
  >();

  for (const credit of credits) {
    assertStoredPayrollCredit(credit);
    if (creditIds.has(credit.id)) {
      throw new DomainError(
        'PAYROLL_DUPLICATE_CREDIT',
        'The workload report received the same payroll credit more than once.'
      );
    }
    creditIds.add(credit.id);

    const workloadKey = `${credit.managerId}|${credit.payrollPeriod}`;
    const workload = workloads.get(workloadKey) ?? {
      managerId: credit.managerId,
      payrollPeriod: credit.payrollPeriod,
      patientIds: new Set<string>(),
      ruleBreakdowns: new Map()
    };
    workloads.set(workloadKey, workload);
    workload.patientIds.add(credit.patientId);

    const ruleKey = `${credit.metricCode}|${credit.ruleVersion}`;
    const ruleBreakdown = workload.ruleBreakdowns.get(ruleKey) ?? {
      metricCode: credit.metricCode,
      ruleVersion: credit.ruleVersion,
      creditIds: new Set<string>(),
      patientIds: new Set<string>()
    };
    workload.ruleBreakdowns.set(ruleKey, ruleBreakdown);
    ruleBreakdown.creditIds.add(credit.id);
    ruleBreakdown.patientIds.add(credit.patientId);
  }

  return [...workloads.values()]
    .map((workload) => ({
      managerId: workload.managerId,
      payrollPeriod: workload.payrollPeriod,
      creditCount: [...workload.ruleBreakdowns.values()].reduce(
        (total, breakdown) => total + breakdown.creditIds.size,
        0
      ),
      uniquePatientCount: workload.patientIds.size,
      ruleBreakdown: [...workload.ruleBreakdowns.values()]
        .map((breakdown) => ({
          metricCode: breakdown.metricCode,
          ruleVersion: breakdown.ruleVersion,
          creditCount: breakdown.creditIds.size,
          uniquePatientCount: breakdown.patientIds.size
        }))
        .sort(compareRuleBreakdowns)
    }))
    .sort(compareMonthlyManagerWorkloads);
}

export function taipeiPayrollPeriod(completedAt: string): string {
  assertUtcTimestamp(completedAt, 'completedAt');

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date(completedAt));

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;

  if (year === undefined || month === undefined) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      'Unable to calculate the Asia/Taipei payroll period.'
    );
  }

  return `${year}-${month}`;
}

function assertAssignmentCoversCompletion(
  assignment: ActiveCaseAssignment,
  appointment: Appointment
): void {
  if (assignment.patientId !== appointment.patientId) {
    throw new DomainError(
      'INVALID_ASSIGNMENT',
      'The case assignment belongs to a different patient.'
    );
  }

  assertOpaqueIdentifier(assignment.managerId, 'assignment.managerId');
  assertUtcTimestamp(assignment.activeFrom, 'assignment.activeFrom');
  if (assignment.activeUntil !== undefined) {
    assertUtcTimestamp(assignment.activeUntil, 'assignment.activeUntil');
  }

  const completedAt = Date.parse(appointment.completedAt as string);
  if (
    Date.parse(assignment.activeFrom) > completedAt ||
    (assignment.activeUntil !== undefined &&
      Date.parse(assignment.activeUntil) <= completedAt)
  ) {
    throw new DomainError(
      'INVALID_ASSIGNMENT',
      'The case assignment was not active at completion time.'
    );
  }
}

function assertRuleVersion(ruleVersion: string): void {
  if (!/^v[1-9][0-9]*$/.test(ruleVersion)) {
    throw new DomainError(
      'INVALID_VALUE',
      'ruleVersion must use the stable form v1, v2, and so on.'
    );
  }
}

function assertStoredPayrollCredit(credit: PayrollCredit): void {
  assertOpaqueIdentifier(credit.managerId, 'credit.managerId');
  assertOpaqueIdentifier(credit.patientId, 'credit.patientId');
  assertOpaqueIdentifier(credit.appointmentId, 'credit.appointmentId');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(credit.payrollPeriod)) {
    throw new DomainError(
      'INVALID_VALUE',
      'credit.payrollPeriod must use the YYYY-MM Taipei-period format.'
    );
  }
  assertRuleVersion(credit.ruleVersion);

  const expectedId = payrollCreditId(credit);
  if (credit.id !== expectedId) {
    throw new DomainError(
      'INVALID_VALUE',
      'credit.id does not match its deterministic payroll uniqueness key.'
    );
  }
}

function payrollCreditId(input: {
  readonly managerId: string;
  readonly patientId: string;
  readonly payrollPeriod: string;
  readonly metricCode: typeof UNIQUE_PATIENT_COMPLETED_METRIC;
  readonly ruleVersion: string;
}): string {
  return [
    input.managerId,
    input.patientId,
    input.payrollPeriod,
    input.metricCode,
    input.ruleVersion
  ].join('|');
}

function compareMonthlyManagerWorkloads(
  left: MonthlyManagerWorkload,
  right: MonthlyManagerWorkload
): number {
  return (
    left.payrollPeriod.localeCompare(right.payrollPeriod) ||
    left.managerId.localeCompare(right.managerId)
  );
}

function compareRuleBreakdowns(
  left: PayrollRuleWorkloadBreakdown,
  right: PayrollRuleWorkloadBreakdown
): number {
  return (
    left.metricCode.localeCompare(right.metricCode) ||
    left.ruleVersion.localeCompare(right.ruleVersion)
  );
}

function assertOpaqueIdentifier(value: string, fieldName: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}
