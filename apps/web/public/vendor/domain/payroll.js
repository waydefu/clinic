import { assertUtcTimestamp } from './appointment.js';
import { planAuditEvent } from './audit.js';
import { DomainError } from './errors.js';
import { assertIdempotencyContext, planIdempotencyRecord } from './idempotency.js';
// 診所的時區只定義一次，在排班網格那一側；薪資期間必須用同一個，否則跨月的
// 到診會被算進不同的月份。
import { TAIPEI_TIME_ZONE } from './schedule.js';
export const UNIQUE_PATIENT_COMPLETED_METRIC = 'unique_patient_completed';
/**
 * Produces the deterministic uniqueness key used by a Firestore transaction.
 * The caller must create this document atomically and treat an existing key as
 * an idempotent duplicate, never as a second payable patient.
 */
export function createPayrollCredit(input) {
    const { appointment, assignment } = input;
    const metricCode = input.metricCode ?? UNIQUE_PATIENT_COMPLETED_METRIC;
    if (appointment.status !== 'completed' ||
        appointment.completedAt === undefined) {
        throw new DomainError('PAYROLL_NOT_ELIGIBLE', 'Only a completed appointment may create a payroll credit.');
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
export function summarizeMonthlyManagerWorkload(credits) {
    const creditIds = new Set();
    const workloads = new Map();
    for (const credit of credits) {
        assertStoredPayrollCredit(credit);
        if (creditIds.has(credit.id)) {
            throw new DomainError('PAYROLL_DUPLICATE_CREDIT', 'The workload report received the same payroll credit more than once.');
        }
        creditIds.add(credit.id);
        const workloadKey = `${credit.managerId}|${credit.payrollPeriod}`;
        const workload = workloads.get(workloadKey) ?? {
            managerId: credit.managerId,
            payrollPeriod: credit.payrollPeriod,
            patientIds: new Set(),
            ruleBreakdowns: new Map()
        };
        workloads.set(workloadKey, workload);
        workload.patientIds.add(credit.patientId);
        const ruleKey = `${credit.metricCode}|${credit.ruleVersion}`;
        const ruleBreakdown = workload.ruleBreakdowns.get(ruleKey) ?? {
            metricCode: credit.metricCode,
            ruleVersion: credit.ruleVersion,
            creditIds: new Set(),
            patientIds: new Set()
        };
        workload.ruleBreakdowns.set(ruleKey, ruleBreakdown);
        ruleBreakdown.creditIds.add(credit.id);
        ruleBreakdown.patientIds.add(credit.patientId);
    }
    return [...workloads.values()]
        .map((workload) => ({
        managerId: workload.managerId,
        payrollPeriod: workload.payrollPeriod,
        creditCount: [...workload.ruleBreakdowns.values()].reduce((total, breakdown) => total + breakdown.creditIds.size, 0),
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
export function taipeiPayrollPeriod(completedAt) {
    assertUtcTimestamp(completedAt, 'completedAt');
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TAIPEI_TIME_ZONE,
        year: 'numeric',
        month: '2-digit'
    }).formatToParts(new Date(completedAt));
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (year === undefined || month === undefined) {
        throw new DomainError('INVALID_TIMESTAMP', 'Unable to calculate the Asia/Taipei payroll period.');
    }
    return `${year}-${month}`;
}
function assertAssignmentCoversCompletion(assignment, appointment) {
    if (assignment.patientId !== appointment.patientId) {
        throw new DomainError('INVALID_ASSIGNMENT', 'The case assignment belongs to a different patient.');
    }
    assertOpaqueIdentifier(assignment.managerId, 'assignment.managerId');
    assertUtcTimestamp(assignment.activeFrom, 'assignment.activeFrom');
    if (assignment.activeUntil !== undefined) {
        assertUtcTimestamp(assignment.activeUntil, 'assignment.activeUntil');
    }
    const completedAt = Date.parse(appointment.completedAt);
    if (Date.parse(assignment.activeFrom) > completedAt ||
        (assignment.activeUntil !== undefined &&
            Date.parse(assignment.activeUntil) <= completedAt)) {
        throw new DomainError('INVALID_ASSIGNMENT', 'The case assignment was not active at completion time.');
    }
}
function assertRuleVersion(ruleVersion) {
    if (!/^v[1-9][0-9]*$/.test(ruleVersion)) {
        throw new DomainError('INVALID_VALUE', 'ruleVersion must use the stable form v1, v2, and so on.');
    }
}
function assertStoredPayrollCredit(credit) {
    assertOpaqueIdentifier(credit.managerId, 'credit.managerId');
    assertOpaqueIdentifier(credit.patientId, 'credit.patientId');
    assertOpaqueIdentifier(credit.appointmentId, 'credit.appointmentId');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(credit.payrollPeriod)) {
        throw new DomainError('INVALID_VALUE', 'credit.payrollPeriod must use the YYYY-MM Taipei-period format.');
    }
    assertRuleVersion(credit.ruleVersion);
    const expectedId = payrollCreditId(credit);
    if (credit.id !== expectedId) {
        throw new DomainError('INVALID_VALUE', 'credit.id does not match its deterministic payroll uniqueness key.');
    }
}
function payrollCreditId(input) {
    return [
        input.managerId,
        input.patientId,
        input.payrollPeriod,
        input.metricCode,
        input.ruleVersion
    ].join('|');
}
function compareMonthlyManagerWorkloads(left, right) {
    return (left.payrollPeriod.localeCompare(right.payrollPeriod) ||
        left.managerId.localeCompare(right.managerId));
}
function compareRuleBreakdowns(left, right) {
    return (left.metricCode.localeCompare(right.metricCode) ||
        left.ruleVersion.localeCompare(right.ruleVersion));
}
function assertOpaqueIdentifier(value, fieldName) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new DomainError('INVALID_VALUE', `${fieldName} must be an opaque identifier.`);
    }
}
const PAYROLL_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
function assertPayrollPeriod(value) {
    if (!PAYROLL_PERIOD_PATTERN.test(value)) {
        throw new DomainError('INVALID_VALUE', 'payrollPeriod must use the YYYY-MM Taipei-period format.');
    }
}
function assertCloseUtcTimestamp(value, fieldName) {
    if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
        throw new DomainError('INVALID_TIMESTAMP', `${fieldName} must be a valid UTC ISO-8601 timestamp.`);
    }
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
export function payrollTotalAfterAdjustments(snapshot, adjustments) {
    const ordered = [...adjustments].sort((a, b) => a.sequence - b.sequence);
    let total = snapshot.creditCount;
    for (const [index, adjustment] of ordered.entries()) {
        if (adjustment.periodId !== snapshot.id ||
            adjustment.managerId !== snapshot.managerId ||
            adjustment.payrollPeriod !== snapshot.payrollPeriod) {
            throw new DomainError('INVALID_VALUE', 'The adjustment ledger contains an entry from another payroll period.');
        }
        if (adjustment.sequence !== index + 1) {
            throw new DomainError('INVALID_VALUE', 'The adjustment ledger is not a gapless sequence.');
        }
        total += adjustment.delta;
        if (adjustment.resultingCreditCount !== total) {
            throw new DomainError('INVALID_VALUE', 'The adjustment ledger does not agree with its own running total.');
        }
    }
    return total;
}
function payrollPeriodId(managerId, payrollPeriod) {
    return `payroll_${managerId}_${payrollPeriod}`;
}
function payrollState(payrollPeriod, status, creditCount) {
    return { payrollPeriod, status, creditCount };
}
/**
 * Counts the unique credits for one manager and period. Credits that belong to
 * a different manager or period are ignored rather than trusted, so a caller
 * passing the whole ledger closes only the intended slice.
 */
function countManagerPeriodCredits(credits, managerId, payrollPeriod) {
    const ids = new Set();
    for (const credit of credits) {
        if (credit.managerId !== managerId ||
            credit.payrollPeriod !== payrollPeriod) {
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
export function planPayrollPeriodClose(request, credits, current) {
    assertOpaqueIdentifier(request.managerId, 'managerId');
    assertPayrollPeriod(request.payrollPeriod);
    assertCloseUtcTimestamp(request.requestedAt, 'requestedAt');
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    if (current !== undefined) {
        throw new DomainError('PAYROLL_PERIOD_ALREADY_CLOSED', `The payroll period ${request.payrollPeriod} is already closed.`);
    }
    const creditCount = countManagerPeriodCredits(credits, request.managerId, request.payrollPeriod);
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
        idempotencyRecord: planIdempotencyRecord(request.idempotency, id, request.requestedAt, 'payroll_period')
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
export function planPayrollAdjustment(request, closed, adjustments = []) {
    assertOpaqueIdentifier(request.managerId, 'managerId');
    assertPayrollPeriod(request.payrollPeriod);
    assertCloseUtcTimestamp(request.requestedAt, 'requestedAt');
    assertIdempotencyContext(request.idempotency, request.audit.actorId);
    if (closed === undefined || closed.status !== 'locked') {
        throw new DomainError('PAYROLL_PERIOD_NOT_CLOSED', 'Only a closed payroll period can carry an adjustment.');
    }
    if (closed.managerId !== request.managerId ||
        closed.payrollPeriod !== request.payrollPeriod) {
        throw new DomainError('INVALID_VALUE', 'The adjustment does not match the closed period it targets.');
    }
    if (request.audit.reasonCode === null) {
        throw new DomainError('INVALID_VALUE', 'A payroll adjustment requires a reason code.');
    }
    if (!Number.isInteger(request.delta) || request.delta === 0) {
        throw new DomainError('INVALID_VALUE', 'A payroll adjustment delta must be a non-zero whole number.');
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
        throw new DomainError('INVALID_TIMESTAMP', 'A payroll adjustment cannot predate the close it amends.');
    }
    if (latest !== undefined && requestedAt < Date.parse(latest.recordedAt)) {
        throw new DomainError('INVALID_TIMESTAMP', 'A payroll adjustment cannot predate the previous adjustment.');
    }
    const resultingCreditCount = previousCount + request.delta;
    if (resultingCreditCount < 0) {
        throw new DomainError('INVALID_VALUE', 'A payroll adjustment must not drive the credit count below zero.');
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
            after: payrollState(request.payrollPeriod, 'locked', resultingCreditCount),
            context: request.audit
        }),
        idempotencyRecord: planIdempotencyRecord(request.idempotency, closed.id, request.requestedAt, 'payroll_period')
    };
}
