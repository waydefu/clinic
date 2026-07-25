import {
  planAuditEvent,
  type AuditCaseAssignmentState,
  type AuditContext,
  type AuditEventV2
} from './audit.js';
import { DomainError } from './errors.js';
import {
  assertIdempotencyContext,
  planIdempotencyRecord,
  type IdempotencyContext,
  type PlannedIdempotencyRecord
} from './idempotency.js';
import type { ActiveCaseAssignment } from './payroll.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * Who is the case manager for a patient, as pure rules.
 *
 * The browser (`modules/case-management.js`) modelled this as a single mutable
 * row per appointment that a reassignment overwrote in place. That is the one
 * thing a case history must never do: once payroll has credited a period, the
 * assignment that was in force at completion time has to stay recoverable. So
 * assignment here is effective-dated — a reassignment closes the current period
 * and opens a new one, and the closed period is returned for the caller to keep,
 * never mutated away.
 *
 * Patient-merge review is deliberately not modelled here. Merging two patient
 * records depends on the patient identity model that ADR-0005 keeps TBD behind
 * D-001～D-003/D-006; inventing a merge rule now would be guessing a gated
 * policy. This file owns only the assignment period invariant.
 */

/** 一段個管指派的有效期間。`activeUntil` 為 null 代表仍生效中。 */
export interface CaseAssignmentPeriod {
  readonly id: string;
  readonly patientId: string;
  readonly managerId: string;
  readonly activeFrom: string;
  readonly activeUntil: string | null;
}

export interface CaseAssignmentRequest {
  readonly patientId: string;
  readonly managerId: string;
  readonly audit: AuditContext;
  /** 指派生效並記錄的時間點（UTC）。同時是前一段期間的收尾時間。 */
  readonly requestedAt: string;
  readonly idempotency: IdempotencyContext;
}

export interface CaseAssignmentPlan {
  /** 被這次指派收尾的前一段期間；首次指派為 null。呼叫端必須保留它，不得刪除。 */
  readonly closedPeriod: CaseAssignmentPeriod | null;
  readonly openedPeriod: CaseAssignmentPeriod;
  readonly auditEvent: AuditEventV2;
  readonly idempotencyRecord: PlannedIdempotencyRecord;
}

function assertOpaqueIdentifier(value: string, fieldName: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}

function caseState(period: CaseAssignmentPeriod): AuditCaseAssignmentState {
  return {
    managerId: period.managerId,
    activeFrom: period.activeFrom,
    activeUntil: period.activeUntil
  };
}

/**
 * Plans an effective-dated case-manager assignment.
 *
 * `current` is the patient's open period, or undefined for a first assignment.
 * A reassignment closes `current` at `requestedAt` and opens a new period; a
 * request that would reopen at or before the current period's start is refused,
 * because that produces an overlapping or zero-length period a payroll credit
 * could then match to two managers at once.
 */
export function planCaseAssignment(
  request: CaseAssignmentRequest,
  current: CaseAssignmentPeriod | undefined
): CaseAssignmentPlan {
  assertOpaqueIdentifier(request.patientId, 'patientId');
  assertOpaqueIdentifier(request.managerId, 'managerId');
  assertUtcTimestamp(request.requestedAt, 'requestedAt');
  assertIdempotencyContext(request.idempotency, request.audit.actorId);

  let closedPeriod: CaseAssignmentPeriod | null = null;
  if (current !== undefined) {
    if (current.patientId !== request.patientId) {
      throw new DomainError(
        'INVALID_ASSIGNMENT',
        'The current assignment belongs to a different patient.'
      );
    }
    if (current.activeUntil !== null) {
      throw new DomainError(
        'INVALID_ASSIGNMENT',
        'The current assignment is already closed; there is nothing to supersede.'
      );
    }
    if (Date.parse(request.requestedAt) <= Date.parse(current.activeFrom)) {
      throw new DomainError(
        'INVALID_ASSIGNMENT',
        'A reassignment must take effect after the period it supersedes begins.'
      );
    }
    if (current.managerId === request.managerId) {
      throw new DomainError(
        'INVALID_ASSIGNMENT',
        'The patient is already assigned to this case manager.'
      );
    }
    closedPeriod = { ...current, activeUntil: request.requestedAt };
  }

  const openedPeriod: CaseAssignmentPeriod = {
    id: `case_${request.idempotency.recordId}`,
    patientId: request.patientId,
    managerId: request.managerId,
    activeFrom: request.requestedAt,
    activeUntil: null
  };

  const auditEvent = planAuditEvent({
    eventId: `audit_case_${request.idempotency.recordId}`,
    occurredAt: request.requestedAt,
    action:
      closedPeriod === null
        ? 'case_manager_assigned'
        : 'case_manager_reassigned',
    resourceType: 'case',
    resourceId: request.patientId,
    before: closedPeriod === null ? null : caseState(closedPeriod),
    after: caseState(openedPeriod),
    context: request.audit
  });

  return {
    closedPeriod,
    openedPeriod,
    auditEvent,
    idempotencyRecord: planIdempotencyRecord(
      request.idempotency,
      openedPeriod.id,
      request.requestedAt,
      'case_assignment'
    )
  };
}

/**
 * Narrows an effective-dated period to the shape payroll credits consume. An
 * open period simply omits `activeUntil`, which is exactly the "still active"
 * case `assertAssignmentCoversCompletion` expects.
 */
export function toActiveCaseAssignment(
  period: CaseAssignmentPeriod
): ActiveCaseAssignment {
  return {
    patientId: period.patientId,
    managerId: period.managerId,
    activeFrom: period.activeFrom,
    ...(period.activeUntil === null ? {} : { activeUntil: period.activeUntil })
  };
}

/**
 * A patient's assignment history is consistent when its periods are contiguous,
 * never overlap, and at most one is open. This is the invariant a reassignment
 * preserves; a merge or a hand-edited history that broke it would let two
 * managers claim the same completion.
 */
export function assertConsistentAssignmentHistory(
  periods: readonly CaseAssignmentPeriod[]
): void {
  const ordered = [...periods].sort(
    (left, right) => Date.parse(left.activeFrom) - Date.parse(right.activeFrom)
  );
  for (const [index, period] of ordered.entries()) {
    assertUtcTimestamp(period.activeFrom, 'period.activeFrom');
    const isLast = index === ordered.length - 1;
    if (period.activeUntil === null) {
      if (!isLast) {
        throw new DomainError(
          'INVALID_ASSIGNMENT',
          'Only the most recent assignment period may stay open.'
        );
      }
      continue;
    }
    assertUtcTimestamp(period.activeUntil, 'period.activeUntil');
    if (Date.parse(period.activeUntil) <= Date.parse(period.activeFrom)) {
      throw new DomainError(
        'INVALID_ASSIGNMENT',
        'An assignment period must end after it begins.'
      );
    }
    const next = ordered[index + 1];
    if (
      next !== undefined &&
      Date.parse(next.activeFrom) < Date.parse(period.activeUntil)
    ) {
      throw new DomainError(
        'INVALID_ASSIGNMENT',
        'Assignment periods for a patient must not overlap.'
      );
    }
  }
}
