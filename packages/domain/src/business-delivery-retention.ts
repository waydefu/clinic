import { OPEN_STATUSES } from './appointment-rules.js';
import {
  calendarEventIdForAppointment,
  calendarEventIdForFollowUp
} from './calendar-event-id.js';
import { DomainError } from './errors.js';
import { assertUtcTimestamp, isUtcIsoTimestamp } from './timestamp.js';

/**
 * BD-03 models a retention operation, not an appointment cancellation. The
 * returned plan is intentionally side-effect free; persistence, projections,
 * backups, and audit append remain separate server transactions.
 */
export type RetainedResourceState =
  'active' | 'archived' | 'permanently_deleted';

export type RetentionOperation = 'archive' | 'restore' | 'permanent_delete';

export interface RetentionPolicy {
  /** Legacy field: UTC days before manual deletion review, not a restore limit. */
  readonly recoverableDays: number;
}

export interface RetentionAuthorizationProof {
  readonly scopeId: string;
  readonly requestId: string;
  readonly authorizationReference: string;
  readonly reauthenticationReference?: string;
  readonly authorized: boolean;
  readonly reauthenticated: boolean;
}

export interface RetentionOperationPlan {
  readonly operation: RetentionOperation;
  readonly resourceId: string;
  readonly requestId: string;
  readonly resultingState: RetainedResourceState;
  readonly archivedAt: string | null;
  readonly recoverableUntil: string | null;
  readonly auditRequired: true;
  readonly backupTreatment: 'unchanged_separate_process';
  readonly dependencyCheck: 'not_required' | 'complete';
  readonly idempotency: 'new_operation' | 'already_applied';
}

const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

function assertOpaque(value: string, fieldName: string): void {
  if (!OPAQUE_IDENTIFIER.test(value)) {
    throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
  }
}

function assertPolicy(policy: RetentionPolicy): void {
  if (!Number.isInteger(policy.recoverableDays) || policy.recoverableDays < 1) {
    throw new DomainError(
      'INVALID_VALUE',
      'recoverableDays must be a positive integer.'
    );
  }
}

function addUtcDays(isoUtc: string, days: number): string {
  return new Date(
    Date.parse(isoUtc) + days * 24 * 60 * 60 * 1000
  ).toISOString();
}

function assertProof(
  proof: RetentionAuthorizationProof,
  requireReauthentication: boolean
): void {
  if (
    !proof.authorized ||
    (requireReauthentication && !proof.reauthenticated)
  ) {
    throw new DomainError(
      'DELEGATION_NOT_AUTHORIZED',
      'retention authorization and required re-authentication are required.'
    );
  }
  assertOpaque(proof.scopeId, 'retention.scopeId');
  assertOpaque(proof.requestId, 'retention.requestId');
  assertOpaque(
    proof.authorizationReference,
    'retention.authorizationReference'
  );
  if (proof.reauthenticated) {
    if (proof.reauthenticationReference === undefined) {
      throw new DomainError(
        'DELEGATION_NOT_AUTHORIZED',
        'a re-authentication reference is required.'
      );
    }
    assertOpaque(
      proof.reauthenticationReference,
      'retention.reauthenticationReference'
    );
  }
}

function archiveWindow(input: {
  readonly archivedAt: string;
  readonly policy: RetentionPolicy;
}): string {
  assertUtcTimestamp(input.archivedAt, 'archivedAt');
  return addUtcDays(input.archivedAt, input.policy.recoverableDays);
}

function assertArchivedWindow(input: {
  readonly archivedAt: string | null;
  readonly recoverableUntil: string | null;
  readonly nowAt: string;
  readonly policy: RetentionPolicy;
}): asserts input is {
  readonly archivedAt: string;
  readonly recoverableUntil: string;
  readonly nowAt: string;
  readonly policy: RetentionPolicy;
} {
  if (input.archivedAt === null) {
    throw new DomainError(
      'INVALID_VALUE',
      'an archived resource must retain its original archivedAt.'
    );
  }
  assertUtcTimestamp(input.archivedAt, 'archivedAt');
  const expectedUntil = archiveWindow({
    archivedAt: input.archivedAt,
    policy: input.policy
  });
  if (input.recoverableUntil !== expectedUntil) {
    throw new DomainError(
      'INVALID_VALUE',
      'recoverableUntil does not match the original archive boundary.'
    );
  }
  assertUtcTimestamp(input.nowAt, 'nowAt');
}

type ArchiveStateInput = {
  readonly resourceId: string;
  readonly requestId: string;
  readonly state: RetainedResourceState;
  readonly nowAt: string;
  readonly archivedAt?: string | null;
  readonly recoverableUntil?: string | null;
  readonly policy: RetentionPolicy;
};

type ArchivePlan = RetentionOperationPlan & { readonly operation: 'archive' };

/** Shared state transition; each entry point validates its own authority first. */
function planArchiveState(input: ArchiveStateInput): ArchivePlan {
  if (input.state !== 'active' && input.state !== 'archived') {
    throw new DomainError(
      'INVALID_VALUE',
      'only an active or archived resource may be archived.'
    );
  }
  const base = {
    operation: 'archive' as const,
    resourceId: input.resourceId,
    requestId: input.requestId,
    resultingState: 'archived' as const,
    auditRequired: true as const,
    backupTreatment: 'unchanged_separate_process' as const,
    dependencyCheck: 'not_required' as const
  };
  if (input.state === 'archived') {
    const original = {
      archivedAt: input.archivedAt ?? null,
      recoverableUntil: input.recoverableUntil ?? null,
      nowAt: input.nowAt,
      policy: input.policy
    };
    assertArchivedWindow(original);
    return {
      ...base,
      archivedAt: original.archivedAt,
      recoverableUntil: original.recoverableUntil,
      idempotency: 'already_applied'
    };
  }
  return {
    ...base,
    archivedAt: input.nowAt,
    recoverableUntil: archiveWindow({
      archivedAt: input.nowAt,
      policy: input.policy
    }),
    idempotency: 'new_operation'
  };
}

/** Audit actor reference, not a login role or a grant to restore/delete. */
export const RETENTION_EXPIRY_SYSTEM_ACTOR_REF = 'system_retention_expiry';
export const RETENTION_EXPIRY_REASON_CODE = 'retention_expired';

/**
 * Archive-only system plan for the 2026-10-30 owner decision. Callers must read
 * all appointment dates, the patient state and legal hold in the same write
 * transaction. There is no human proof, re-authentication or delete operation.
 * UTC calendar anniversaries are used; leap day advances conservatively to
 * March 1 when the target year has no February 29.
 */
export function planExpiredPatientArchive(
  input: ArchiveStateInput & {
    readonly scopeId: string;
    readonly appointmentStartsAt: readonly unknown[];
    readonly legalHold: boolean;
  }
): ArchivePlan & {
  readonly actorRef: typeof RETENTION_EXPIRY_SYSTEM_ACTOR_REF;
  readonly reasonCode: typeof RETENTION_EXPIRY_REASON_CODE;
} {
  assertOpaque(input.scopeId, 'retention.scopeId');
  assertOpaque(input.resourceId, 'retention.resourceId');
  assertOpaque(input.requestId, 'retention.requestId');
  assertUtcTimestamp(input.nowAt, 'nowAt');
  assertPolicy(input.policy);
  if (input.state !== 'active' && input.state !== 'archived') {
    throw new DomainError(
      'INVALID_VALUE',
      'only an active or archived resource may be archived.'
    );
  }
  if (input.state === 'active') {
    if (input.legalHold !== false) {
      throw new DomainError(
        'DELEGATION_NOT_AUTHORIZED',
        'legal hold blocks automatic archive.'
      );
    }
    if (
      !Array.isArray(input.appointmentStartsAt) ||
      input.appointmentStartsAt.length === 0
    ) {
      throw new DomainError(
        'INVALID_VALUE',
        'automatic archive requires appointment history.'
      );
    }
    let latest = Number.NEGATIVE_INFINITY;
    for (const startsAt of input.appointmentStartsAt) {
      if (typeof startsAt !== 'string') {
        throw new DomainError(
          'INVALID_VALUE',
          'appointment startsAt must be UTC.'
        );
      }
      assertUtcTimestamp(startsAt, 'appointment.startsAt');
      latest = Math.max(latest, Date.parse(startsAt));
    }
    const expiresAt = new Date(latest);
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 2);
    if (Date.parse(input.nowAt) < expiresAt.getTime()) {
      throw new DomainError(
        'INVALID_VALUE',
        'the latest appointment has not reached two years.'
      );
    }
  }
  return {
    ...planArchiveState(input),
    actorRef: RETENTION_EXPIRY_SYSTEM_ACTOR_REF,
    reasonCode: RETENTION_EXPIRY_REASON_CODE
  };
}

/**
 * Plans one explicit retention operation. No operation is implicit: in
 * particular, an archive never schedules a permanent delete and a repeated
 * archive never extends the recovery window.
 */
export function planRetentionOperation(input: {
  readonly operation: RetentionOperation;
  readonly resourceId: string;
  readonly requestId: string;
  readonly state: RetainedResourceState;
  readonly nowAt: string;
  readonly archivedAt?: string | null;
  readonly recoverableUntil?: string | null;
  readonly legalHold: boolean;
  readonly dependenciesReconciled?: boolean;
  readonly policy: RetentionPolicy;
  readonly proof: RetentionAuthorizationProof;
}): RetentionOperationPlan {
  assertOpaque(input.resourceId, 'retention.resourceId');
  assertOpaque(input.requestId, 'retention.requestId');
  assertUtcTimestamp(input.nowAt, 'nowAt');
  assertPolicy(input.policy);
  assertProof(
    input.proof,
    input.operation === 'archive' || input.operation === 'permanent_delete'
  );
  if (input.proof.requestId !== input.requestId) {
    throw new DomainError(
      'INVALID_VALUE',
      'retention request references must agree.'
    );
  }

  const archivedAt = input.archivedAt ?? null;
  const recoverableUntil = input.recoverableUntil ?? null;
  const base = {
    resourceId: input.resourceId,
    requestId: input.requestId,
    auditRequired: true as const,
    backupTreatment: 'unchanged_separate_process' as const
  };

  if (input.operation === 'archive') {
    return planArchiveState(input);
  }

  if (input.state !== 'archived') {
    if (
      input.operation === 'permanent_delete' &&
      input.state === 'permanently_deleted'
    ) {
      return {
        ...base,
        operation: 'permanent_delete',
        resultingState: 'permanently_deleted',
        archivedAt,
        recoverableUntil,
        dependencyCheck: 'complete',
        idempotency: 'already_applied'
      };
    }
    throw new DomainError(
      'INVALID_VALUE',
      `${input.operation} requires an archived resource.`
    );
  }

  const verifiedArchive = {
    archivedAt,
    recoverableUntil,
    nowAt: input.nowAt,
    policy: input.policy
  };
  assertArchivedWindow(verifiedArchive);
  const verifiedArchivedAt = verifiedArchive.archivedAt;
  const verifiedRecoverableUntil = verifiedArchive.recoverableUntil;

  if (input.operation === 'restore') {
    // 2026-10-30: the legacy boundary only opens manual deletion review.
    // An archived resource remains restorable until explicitly deleted.
    return {
      ...base,
      operation: 'restore',
      resultingState: 'active',
      archivedAt: null,
      recoverableUntil: null,
      dependencyCheck: 'not_required',
      idempotency: 'new_operation'
    };
  }

  if (input.legalHold) {
    throw new DomainError(
      'DELEGATION_NOT_AUTHORIZED',
      'legal hold blocks permanent deletion.'
    );
  }
  if (Date.parse(input.nowAt) < Date.parse(verifiedRecoverableUntil)) {
    throw new DomainError(
      'INVALID_VALUE',
      'permanent deletion is not eligible before the recovery window ends.'
    );
  }
  if (input.dependenciesReconciled !== true) {
    throw new DomainError(
      'INVALID_VALUE',
      'dependent records and projections must be reconciled first.'
    );
  }

  return {
    ...base,
    operation: 'permanent_delete',
    resultingState: 'permanently_deleted',
    archivedAt: verifiedArchivedAt,
    recoverableUntil: verifiedRecoverableUntil,
    dependencyCheck: 'complete',
    idempotency: 'new_operation'
  };
}

/** A patient appointment as seen by the retention transaction. */
export interface RetentionCalendarAppointment {
  readonly id: string;
  readonly status: string;
  /** Needed only to decide what a restore still has to re-add. */
  readonly startsAt?: unknown;
}

/** A stored follow-up decision (`follow_ups/{sourceAppointmentId}`). */
export interface RetentionCalendarFollowUp {
  readonly appointmentId: string;
  readonly decision: unknown;
  readonly dueAt: unknown;
}

export interface PlannedRetentionCalendarJob {
  readonly id: string;
  readonly type: 'calendar_projection_requested';
  readonly appointmentId: string;
  readonly followUpSourceId?: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly appointmentStatus: string;
  readonly startsAt?: string;
  readonly idempotencyKey: string;
  readonly status: 'pending';
  readonly attempts: 0;
  readonly createdAt: string;
  readonly nextAttemptAt: string;
  /** Present on archive and restore jobs; permanent delete uses `deleted`. */
  readonly retentionOperation?: 'archive' | 'restore';
  /** Archive episode marker; the worker ignores the job once it has moved on. */
  readonly retentionArchivedAt?: string;
}

const RETENTION_JOB_TAG: Readonly<Record<RetentionOperation, string>> = {
  archive: 'ret_archive',
  restore: 'ret_restore',
  permanent_delete: 'ret_delete'
};

function isStillAhead(value: unknown, at: string): value is string {
  return (
    typeof value === 'string' &&
    isUtcIsoTimestamp(value) &&
    Date.parse(value) >= Date.parse(at)
  );
}

/**
 * Calendar is a projection of the patient record (ADR-0002). An archived
 * patient is "no longer used", so the dedicated appointment calendar must not
 * carry that patient at all, de-identified or not:
 *
 * - archive: remove (`events.delete`) every appointment event and every dated
 *   follow-up reminder. The operational records stay; only the projection
 *   goes. The worker re-reads the latest archive state before it deletes, and
 *   `archivedAt` names the archive episode so a delayed job cannot act on a
 *   later one;
 * - restore: re-add only what this return still needs. An appointment that is
 *   still open and starts at or after `at`, and a dated reminder due at or
 *   after `at`. Visits from before the archive are never rebuilt. The worker
 *   re-checks live status, so a cancelled booking stays cancelled;
 * - permanent_delete: cancel every appointment event and dated reminder
 *   before the records disappear.
 *
 * The jobs carry identifiers, statuses and times only, never PII.
 */
export function planRetentionCalendarProjections(input: {
  readonly operation: RetentionOperation;
  readonly requestId: string;
  readonly at: string;
  /** Required for `archive`: the `archivedAt` written to the patient. */
  readonly archivedAt?: string;
  readonly appointments: readonly RetentionCalendarAppointment[];
  readonly followUps: readonly RetentionCalendarFollowUp[];
}): readonly PlannedRetentionCalendarJob[] {
  assertOpaque(input.requestId, 'requestId');
  assertUtcTimestamp(input.at, 'at');
  const tag = RETENTION_JOB_TAG[input.operation];
  const deleting = input.operation === 'permanent_delete';
  const archiving = input.operation === 'archive';
  const restoring = input.operation === 'restore';
  if (archiving) {
    if (input.archivedAt === undefined) {
      throw new DomainError('INVALID_VALUE', 'archivedAt is required.');
    }
    assertUtcTimestamp(input.archivedAt, 'archivedAt');
  }
  const common = {
    type: 'calendar_projection_requested' as const,
    correlationId: input.requestId,
    causationId: input.requestId,
    status: 'pending' as const,
    attempts: 0 as const,
    createdAt: input.at,
    nextAttemptAt: input.at,
    ...(archiving && input.archivedAt !== undefined
      ? {
          retentionOperation: 'archive' as const,
          retentionArchivedAt: input.archivedAt
        }
      : {}),
    ...(restoring ? { retentionOperation: 'restore' as const } : {})
  };

  const appointmentJobs = input.appointments.flatMap((appointment) => {
    assertOpaque(appointment.id, 'appointmentId');
    if (
      restoring &&
      !(
        (OPEN_STATUSES as readonly string[]).includes(appointment.status) &&
        isStillAhead(appointment.startsAt, input.at)
      )
    ) {
      return [];
    }
    return [
      {
        ...common,
        id: `outbox_${appointment.id}_${tag}_${input.requestId}`,
        appointmentId: appointment.id,
        appointmentStatus: deleting ? 'deleted' : appointment.status,
        idempotencyKey: calendarEventIdForAppointment(appointment.id)
      }
    ];
  });

  // Only a dated `required` decision has a reminder event on the calendar.
  const followUpJobs = input.followUps.flatMap((followUp) => {
    if (followUp.decision !== 'required' || typeof followUp.dueAt !== 'string')
      return [];
    assertOpaque(followUp.appointmentId, 'followUpSourceId');
    assertUtcTimestamp(followUp.dueAt, 'dueAt');
    if (restoring && !isStillAhead(followUp.dueAt, input.at)) return [];
    const removing = deleting || archiving;
    return [
      {
        ...common,
        id: `outbox_followup_${followUp.appointmentId}_${tag}_${input.requestId}`,
        appointmentId: followUp.appointmentId,
        followUpSourceId: followUp.appointmentId,
        appointmentStatus: removing
          ? 'follow_up_not_required'
          : 'follow_up_required',
        ...(removing ? {} : { startsAt: followUp.dueAt }),
        idempotencyKey: calendarEventIdForFollowUp(followUp.appointmentId)
      }
    ];
  });

  return [...appointmentJobs, ...followUpJobs];
}
