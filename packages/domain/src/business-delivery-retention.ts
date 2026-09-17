import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * BD-03 models a retention operation, not an appointment cancellation. The
 * returned plan is intentionally side-effect free; persistence, projections,
 * backups, and audit append remain separate server transactions.
 */
export type RetainedResourceState =
  'active' | 'archived' | 'permanently_deleted';

export type RetentionOperation = 'archive' | 'restore' | 'permanent_delete';

export interface RetentionPolicy {
  /** Approved recoverable period in UTC calendar-day units. */
  readonly recoverableDays: number;
}

export interface RetentionAuthorizationProof {
  readonly scopeId: string;
  readonly requestId: string;
  readonly authorizationReference: string;
  readonly reauthenticationReference: string;
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

function assertProof(proof: RetentionAuthorizationProof): void {
  if (!proof.authorized || !proof.reauthenticated) {
    throw new DomainError(
      'DELEGATION_NOT_AUTHORIZED',
      'retention authorization and re-authentication are required.'
    );
  }
  assertOpaque(proof.scopeId, 'retention.scopeId');
  assertOpaque(proof.requestId, 'retention.requestId');
  assertOpaque(
    proof.authorizationReference,
    'retention.authorizationReference'
  );
  assertOpaque(
    proof.reauthenticationReference,
    'retention.reauthenticationReference'
  );
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
  assertProof(input.proof);
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
    if (input.state === 'permanently_deleted') {
      throw new DomainError(
        'INVALID_VALUE',
        'a permanently deleted resource cannot be revived.'
      );
    }
    if (input.state === 'archived') {
      assertArchivedWindow({
        archivedAt,
        recoverableUntil,
        nowAt: input.nowAt,
        policy: input.policy
      });
      return {
        ...base,
        operation: 'archive',
        resultingState: 'archived',
        archivedAt,
        recoverableUntil,
        dependencyCheck: 'not_required',
        idempotency: 'already_applied'
      };
    }
    const originalArchivedAt = input.nowAt;
    return {
      ...base,
      operation: 'archive',
      resultingState: 'archived',
      archivedAt: originalArchivedAt,
      recoverableUntil: archiveWindow({
        archivedAt: originalArchivedAt,
        policy: input.policy
      }),
      dependencyCheck: 'not_required',
      idempotency: 'new_operation'
    };
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
    if (Date.parse(input.nowAt) >= Date.parse(verifiedRecoverableUntil)) {
      throw new DomainError(
        'INVALID_VALUE',
        'the recovery window has expired.'
      );
    }
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
