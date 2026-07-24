import { assertUtcTimestamp, type Appointment } from './appointment.js';
import {
  planAuditEvent,
  type AuditContext,
  type AuditEventV2,
  type AuditPayrollState
} from './audit.js';
import { DomainError } from './errors.js';
import {
  assertIdempotencyContext,
  planIdempotencyRecord,
  type IdempotencyContext,
  type PlannedIdempotencyRecord
} from './idempotency.js';
// 診所的時區只定義一次，在排班網格那一側；薪資期間必須用同一個，否則跨月的
// 到診會被算進不同的月份。
import { TAIPEI_TIME_ZONE } from './schedule.js';

export const UNIQUE_PATIENT_COMPLETED_METRIC = 'unique_patient_completed';

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

/**
 * 彙總過程的中間狀態。抽成具名型別是必要的，不只是為了可讀性：先前把它們
 * 寫成行內型別，`?? { ... ruleBreakdowns: new Map() }` 這個 fallback 裡的
 * `new Map()` 會被推導成 `Map<any, any>`，聯集之後整條薪資彙總鏈的型別保護
 * 就全部失效了。
 */
interface RuleBreakdownAccumulator {
  readonly metricCode: typeof UNIQUE_PATIENT_COMPLETED_METRIC;
  readonly ruleVersion: string;
  readonly creditIds: Set<string>;
  readonly patientIds: Set<string>;
}

interface WorkloadAccumulator {
  readonly managerId: string;
  readonly payrollPeriod: string;
  readonly patientIds: Set<string>;
  readonly ruleBreakdowns: Map<string, RuleBreakdownAccumulator>;
}

export function summarizeMonthlyManagerWorkload(
  credits: readonly PayrollCredit[]
): readonly MonthlyManagerWorkload[] {
  const creditIds = new Set<string>();
  const workloads = new Map<string, WorkloadAccumulator>();

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
    const workload: WorkloadAccumulator = workloads.get(workloadKey) ?? {
      managerId: credit.managerId,
      payrollPeriod: credit.payrollPeriod,
      patientIds: new Set<string>(),
      ruleBreakdowns: new Map()
    };
    workloads.set(workloadKey, workload);
    workload.patientIds.add(credit.patientId);

    const ruleKey = `${credit.metricCode}|${credit.ruleVersion}`;
    const ruleBreakdown: RuleBreakdownAccumulator = workload.ruleBreakdowns.get(
      ruleKey
    ) ?? {
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

const PAYROLL_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertPayrollPeriod(value: string): void {
  if (!PAYROLL_PERIOD_PATTERN.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      'payrollPeriod must use the YYYY-MM Taipei-period format.'
    );
  }
}

function assertCloseUtcTimestamp(value: string, fieldName: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${fieldName} must be a valid UTC ISO-8601 timestamp.`
    );
  }
}

/**
 * A locked snapshot of one manager's payroll period.
 *
 * **This record is written once and never written again.** The month-close
 * specification is explicit: locking "建立不可修改快照", and an error found after
 * locking is corrected "以新 adjustment 修正，不變更原始 credit 或歷史匯出".
 * A snapshot that could be edited would defeat the only thing it exists for —
 * being able to say, later, exactly what was signed off and paid against.
 *
 * There is deliberately no `lastAdjustedAt` field. A mutable field on an
 * immutable record is an invitation: the previous version of this type had one,
 * and the adjustment planner duly spread the snapshot and overwrote both it and
 * `creditCount`. The current total lives in the adjustment ledger instead —
 * see `payrollTotalAfterAdjustments`.
 */
export interface PayrollPeriodSnapshot {
  readonly id: string;
  readonly managerId: string;
  readonly payrollPeriod: string;
  readonly status: 'locked';
  readonly creditCount: number;
  readonly closedAt: string;
}

/**
 * One append-only correction to a locked period. Adjustments never replace each
 * other and never touch the snapshot; the payable total is the snapshot plus
 * every adjustment in sequence, which is why each entry carries the total it
 * produced — a reader can reconstruct any point in the history without replaying
 * arithmetic, and a mismatch is detectable rather than silent.
 */
export interface PayrollAdjustment {
  readonly id: string;
  /** The locked snapshot this amends. */
  readonly periodId: string;
  readonly managerId: string;
  readonly payrollPeriod: string;
  /** 1-based position in the ledger for this period. */
  readonly sequence: number;
  readonly delta: number;
  readonly reasonCode: string;
  readonly recordedAt: string;
  readonly resultingCreditCount: number;
}

export interface PayrollPeriodCloseRequest {
  readonly managerId: string;
  readonly payrollPeriod: string;
  readonly audit: AuditContext;
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

export interface PayrollPeriodClosePlan {
  readonly snapshot: PayrollPeriodSnapshot;
  readonly auditEvent: AuditEventV2;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

export interface PayrollAdjustmentRequest {
  readonly managerId: string;
  readonly payrollPeriod: string;
  /** 對已鎖定 creditCount 的變動量；非零整數。`audit.reasonCode` 必填。 */
  readonly delta: number;
  readonly audit: AuditContext;
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

export interface PayrollAdjustmentPlan {
  readonly adjustment: PayrollAdjustment;
  readonly auditEvent: AuditEventV2;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

/**
 * The payable total for a locked period: the signed-off snapshot plus every
 * adjustment against it. Callers must not add `delta`s themselves — the ledger
 * is the authority, and reading it through one function is what stops a second,
 * subtly different total appearing in a report.
 *
 * The ledger is verified rather than trusted: entries must belong to this
 * period, be numbered 1..n without gaps, and carry the running total they
 * claim. A ledger that fails any of those is a corrupted audit trail, and
 * returning a plausible number from it would hide that.
 */
export function payrollTotalAfterAdjustments(
  snapshot: PayrollPeriodSnapshot,
  adjustments: readonly PayrollAdjustment[]
): number {
  const ordered = [...adjustments].sort((a, b) => a.sequence - b.sequence);
  let total = snapshot.creditCount;

  for (const [index, adjustment] of ordered.entries()) {
    if (
      adjustment.periodId !== snapshot.id ||
      adjustment.managerId !== snapshot.managerId ||
      adjustment.payrollPeriod !== snapshot.payrollPeriod
    ) {
      throw new DomainError(
        'INVALID_VALUE',
        'The adjustment ledger contains an entry from another payroll period.'
      );
    }
    if (adjustment.sequence !== index + 1) {
      throw new DomainError(
        'INVALID_VALUE',
        'The adjustment ledger is not a gapless sequence.'
      );
    }
    total += adjustment.delta;
    if (adjustment.resultingCreditCount !== total) {
      throw new DomainError(
        'INVALID_VALUE',
        'The adjustment ledger does not agree with its own running total.'
      );
    }
  }

  return total;
}

function payrollPeriodId(managerId: string, payrollPeriod: string): string {
  return `payroll_${managerId}_${payrollPeriod}`;
}

function payrollState(
  payrollPeriod: string,
  status: 'open' | 'locked',
  creditCount: number
): AuditPayrollState {
  return { payrollPeriod, status, creditCount };
}

/**
 * Counts the unique credits for one manager and period. Credits that belong to
 * a different manager or period are ignored rather than trusted, so a caller
 * passing the whole ledger closes only the intended slice.
 */
function countManagerPeriodCredits(
  credits: readonly PayrollCredit[],
  managerId: string,
  payrollPeriod: string
): number {
  const ids = new Set<string>();
  for (const credit of credits) {
    if (
      credit.managerId !== managerId ||
      credit.payrollPeriod !== payrollPeriod
    ) {
      continue;
    }
    assertStoredPayrollCredit(credit);
    ids.add(credit.id);
  }
  return ids.size;
}

/**
 * Plans a month close for one manager's period. `current` is the existing
 * snapshot if the period was already locked; closing an already-locked period
 * is a conflict, not a no-op, because a second close would silently replace the
 * signed-off total.
 */
export function planPayrollPeriodClose(
  request: PayrollPeriodCloseRequest,
  credits: readonly PayrollCredit[],
  current: PayrollPeriodSnapshot | undefined
): PayrollPeriodClosePlan {
  assertOpaqueIdentifier(request.managerId, 'managerId');
  assertPayrollPeriod(request.payrollPeriod);
  assertCloseUtcTimestamp(request.requestedAt, 'requestedAt');
  assertIdempotencyContext(request.idempotency, request.audit.actorId);

  if (current !== undefined) {
    throw new DomainError(
      'PAYROLL_PERIOD_ALREADY_CLOSED',
      `The payroll period ${request.payrollPeriod} is already closed.`
    );
  }

  const creditCount = countManagerPeriodCredits(
    credits,
    request.managerId,
    request.payrollPeriod
  );
  const id = payrollPeriodId(request.managerId, request.payrollPeriod);

  return {
    snapshot: {
      id,
      managerId: request.managerId,
      payrollPeriod: request.payrollPeriod,
      status: 'locked',
      creditCount,
      closedAt: request.requestedAt
    },
    auditEvent: planAuditEvent({
      eventId: `audit_payroll_close_${request.idempotency.recordId}`,
      occurredAt: request.requestedAt,
      action: 'payroll_period_closed',
      resourceType: 'payroll',
      resourceId: id,
      before: payrollState(request.payrollPeriod, 'open', creditCount),
      after: payrollState(request.payrollPeriod, 'locked', creditCount),
      context: request.audit
    }),
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      id,
      request.requestedAt,
      'payroll_period'
    )
  };
}

/**
 * Plans a reasoned adjustment to an already-closed period. It is refused unless
 * the period is locked and the audit context carries a reason, because an
 * adjustment is the only sanctioned way to change a signed-off total and the
 * reason outlives the number it explains.
 *
 * The plan produces a **new ledger entry**, never a modified snapshot. The
 * existing ledger has to be passed in: without it there is no way to know the
 * current total, no way to number the entry, and no way to refuse an adjustment
 * dated before one that is already recorded.
 */
export function planPayrollAdjustment(
  request: PayrollAdjustmentRequest,
  closed: PayrollPeriodSnapshot | undefined,
  adjustments: readonly PayrollAdjustment[] = []
): PayrollAdjustmentPlan {
  assertOpaqueIdentifier(request.managerId, 'managerId');
  assertPayrollPeriod(request.payrollPeriod);
  assertCloseUtcTimestamp(request.requestedAt, 'requestedAt');
  assertIdempotencyContext(request.idempotency, request.audit.actorId);

  if (closed === undefined || closed.status !== 'locked') {
    throw new DomainError(
      'PAYROLL_PERIOD_NOT_CLOSED',
      'Only a closed payroll period can carry an adjustment.'
    );
  }
  if (
    closed.managerId !== request.managerId ||
    closed.payrollPeriod !== request.payrollPeriod
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'The adjustment does not match the closed period it targets.'
    );
  }
  if (request.audit.reasonCode === null) {
    throw new DomainError(
      'INVALID_VALUE',
      'A payroll adjustment requires a reason code.'
    );
  }
  if (!Number.isInteger(request.delta) || request.delta === 0) {
    throw new DomainError(
      'INVALID_VALUE',
      'A payroll adjustment delta must be a non-zero whole number.'
    );
  }

  // Reads the ledger through the verifying accessor: a corrupted trail must
  // stop the write, not be extended by it.
  const previousCount = payrollTotalAfterAdjustments(closed, adjustments);
  const ordered = [...adjustments].sort((a, b) => a.sequence - b.sequence);
  const latest = ordered.at(-1);

  // Time only moves forward. Without this an adjustment can be dated before the
  // close it amends, or before an adjustment already in the ledger — and the
  // audit trail then reads as though the correction preceded the thing it
  // corrected.
  const requestedAt = Date.parse(request.requestedAt);
  if (requestedAt < Date.parse(closed.closedAt)) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      'A payroll adjustment cannot predate the close it amends.'
    );
  }
  if (latest !== undefined && requestedAt < Date.parse(latest.recordedAt)) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      'A payroll adjustment cannot predate the previous adjustment.'
    );
  }

  const resultingCreditCount = previousCount + request.delta;
  if (resultingCreditCount < 0) {
    throw new DomainError(
      'INVALID_VALUE',
      'A payroll adjustment must not drive the credit count below zero.'
    );
  }

  return {
    adjustment: {
      id: `payroll_adjustment_${request.idempotency.recordId}`,
      periodId: closed.id,
      managerId: closed.managerId,
      payrollPeriod: closed.payrollPeriod,
      sequence: ordered.length + 1,
      delta: request.delta,
      reasonCode: request.audit.reasonCode,
      recordedAt: request.requestedAt,
      resultingCreditCount
    },
    auditEvent: planAuditEvent({
      eventId: `audit_payroll_adjust_${request.idempotency.recordId}`,
      occurredAt: request.requestedAt,
      action: 'payroll_adjustment_recorded',
      resourceType: 'payroll',
      resourceId: closed.id,
      before: payrollState(request.payrollPeriod, 'locked', previousCount),
      after: payrollState(
        request.payrollPeriod,
        'locked',
        resultingCreditCount
      ),
      context: request.audit
    }),
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      closed.id,
      request.requestedAt,
      'payroll_period'
    )
  };
}
