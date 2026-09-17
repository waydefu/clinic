import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * BD-06 is a side-effect-free termination checklist contract. It records
 * evidence needed for an orderly return and closure review, but it never
 * exports, deletes, revokes, or mutates production data.
 */
export type BusinessTerminationState =
  | 'active'
  | 'termination_pending'
  | 'returned'
  | 'controlled_retention'
  | 'manual_close_review';

export type BusinessTerminationOperation =
  | 'open_notice'
  | 'record_return'
  | 'start_controlled_retention'
  | 'request_manual_close_review';

export interface BusinessTerminationPolicy {
  /** The caller supplies the approved minimum notice period. */
  readonly minimumNoticeDays: number;
  /** The caller supplies the approved controlled-copy retention period. */
  readonly controlledCopyRetentionDays: number;
}

export interface BusinessTerminationAuthorizationProof {
  readonly scopeId: string;
  readonly requestId: string;
  readonly authorizationReference: string;
  readonly reauthenticationReference: string;
  readonly authorized: boolean;
  readonly reauthenticated: boolean;
}

export interface BusinessTerminationPlan {
  readonly operation: BusinessTerminationOperation;
  readonly terminationId: string;
  readonly requestId: string;
  readonly resultingState: BusinessTerminationState;
  readonly noticeStartedAt: string | null;
  readonly noticeDueAt: string | null;
  readonly noticeExceptionReference: string | null;
  readonly returnManifestReference: string | null;
  readonly recipientConfirmationReference: string | null;
  readonly returnCompletedAt: string | null;
  readonly controlledRetentionUntil: string | null;
  readonly activeDataTreatment: 'return_once';
  readonly controlledCopyTreatment: 'retain_until_policy_expiry';
  readonly backupTreatment: 'unchanged_separate_process';
  readonly auditTreatment: 'retain_separate_policy';
  readonly deletion: 'manual_review_only';
  readonly idempotency: 'new_operation' | 'already_applied';
}

const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

function assertOpaque(value: string, fieldName: string): void {
  if (!OPAQUE_IDENTIFIER.test(value)) {
    throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
  }
}

function assertPolicy(policy: BusinessTerminationPolicy): void {
  if (
    !Number.isInteger(policy.minimumNoticeDays) ||
    policy.minimumNoticeDays < 1
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'minimumNoticeDays must be a positive integer.'
    );
  }
  if (
    !Number.isInteger(policy.controlledCopyRetentionDays) ||
    policy.controlledCopyRetentionDays < 1
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'controlledCopyRetentionDays must be a positive integer.'
    );
  }
}

function addUtcDays(isoUtc: string, days: number): string {
  return new Date(
    Date.parse(isoUtc) + days * 24 * 60 * 60 * 1000
  ).toISOString();
}

function assertProof(proof: BusinessTerminationAuthorizationProof): void {
  if (!proof.authorized || !proof.reauthenticated) {
    throw new DomainError(
      'DELEGATION_NOT_AUTHORIZED',
      'termination authorization and re-authentication are required.'
    );
  }
  assertOpaque(proof.scopeId, 'termination.scopeId');
  assertOpaque(proof.requestId, 'termination.requestId');
  assertOpaque(
    proof.authorizationReference,
    'termination.authorizationReference'
  );
  assertOpaque(
    proof.reauthenticationReference,
    'termination.reauthenticationReference'
  );
}

function assertNotice(input: {
  readonly noticeStartedAt: string | null;
  readonly noticeDueAt: string | null;
  readonly policy: BusinessTerminationPolicy;
}): { noticeStartedAt: string; noticeDueAt: string } {
  const noticeStartedAt = input.noticeStartedAt;
  const noticeDueAt = input.noticeDueAt;
  if (noticeStartedAt === null || noticeDueAt === null) {
    throw new DomainError(
      'INVALID_VALUE',
      'termination notice must retain both start and due timestamps.'
    );
  }
  assertUtcTimestamp(noticeStartedAt, 'noticeStartedAt');
  assertUtcTimestamp(noticeDueAt, 'noticeDueAt');
  const expectedDueAt = addUtcDays(
    noticeStartedAt,
    input.policy.minimumNoticeDays
  );
  if (noticeDueAt !== expectedDueAt) {
    throw new DomainError(
      'INVALID_VALUE',
      'noticeDueAt does not match the original notice boundary.'
    );
  }
  return {
    noticeStartedAt,
    noticeDueAt
  };
}

function assertReturnEvidence(input: {
  readonly returnManifestReference: string | null;
  readonly recipientConfirmationReference: string | null;
  readonly returnCompletedAt: string | null;
}): void {
  if (
    input.returnManifestReference === null ||
    input.recipientConfirmationReference === null ||
    input.returnCompletedAt === null
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'termination return requires a manifest, recipient confirmation, and completion timestamp.'
    );
  }
  assertOpaque(input.returnManifestReference, 'returnManifestReference');
  assertOpaque(
    input.recipientConfirmationReference,
    'recipientConfirmationReference'
  );
  assertUtcTimestamp(input.returnCompletedAt, 'returnCompletedAt');
}

function assertControlledRetention(input: {
  readonly returnCompletedAt: string | null;
  readonly controlledRetentionUntil: string | null;
  readonly policy: BusinessTerminationPolicy;
}): void {
  if (
    input.returnCompletedAt === null ||
    input.controlledRetentionUntil === null
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'controlled retention requires a completed return and expiry boundary.'
    );
  }
  assertUtcTimestamp(input.returnCompletedAt, 'returnCompletedAt');
  assertUtcTimestamp(
    input.controlledRetentionUntil,
    'controlledRetentionUntil'
  );
  const expectedUntil = addUtcDays(
    input.returnCompletedAt,
    input.policy.controlledCopyRetentionDays
  );
  if (input.controlledRetentionUntil !== expectedUntil) {
    throw new DomainError(
      'INVALID_VALUE',
      'controlledRetentionUntil does not match the original retention boundary.'
    );
  }
}

function basePlan(input: {
  readonly operation: BusinessTerminationOperation;
  readonly terminationId: string;
  readonly requestId: string;
  readonly resultingState: BusinessTerminationState;
  readonly noticeStartedAt: string | null;
  readonly noticeDueAt: string | null;
  readonly noticeExceptionReference: string | null;
  readonly returnManifestReference: string | null;
  readonly recipientConfirmationReference: string | null;
  readonly returnCompletedAt: string | null;
  readonly controlledRetentionUntil: string | null;
  readonly idempotency: 'new_operation' | 'already_applied';
}): BusinessTerminationPlan {
  return {
    ...input,
    activeDataTreatment: 'return_once',
    controlledCopyTreatment: 'retain_until_policy_expiry',
    backupTreatment: 'unchanged_separate_process',
    auditTreatment: 'retain_separate_policy',
    deletion: 'manual_review_only'
  };
}

/**
 * Plans one explicit termination step. Policy values are injected by the
 * caller, repeated steps preserve their original boundaries, and the final
 * result is only a manual closure review—never an automatic deletion.
 */
export function planBusinessTerminationOperation(input: {
  readonly operation: BusinessTerminationOperation;
  readonly terminationId: string;
  readonly requestId: string;
  readonly state: BusinessTerminationState;
  readonly nowAt: string;
  readonly noticeStartedAt?: string | null;
  readonly noticeDueAt?: string | null;
  readonly noticeExceptionReference?: string | null;
  readonly returnManifestReference?: string | null;
  readonly recipientConfirmationReference?: string | null;
  readonly returnCompletedAt?: string | null;
  readonly controlledRetentionUntil?: string | null;
  readonly backupDispositionConfirmed?: boolean;
  readonly auditDispositionConfirmed?: boolean;
  readonly policy: BusinessTerminationPolicy;
  readonly proof: BusinessTerminationAuthorizationProof;
}): BusinessTerminationPlan {
  assertOpaque(input.terminationId, 'termination.terminationId');
  assertOpaque(input.requestId, 'termination.requestId');
  assertUtcTimestamp(input.nowAt, 'nowAt');
  assertPolicy(input.policy);
  assertProof(input.proof);
  if (input.proof.requestId !== input.requestId) {
    throw new DomainError(
      'INVALID_VALUE',
      'termination request references must agree.'
    );
  }

  const noticeStartedAt = input.noticeStartedAt ?? null;
  const noticeDueAt = input.noticeDueAt ?? null;
  const noticeExceptionReference = input.noticeExceptionReference ?? null;
  const returnManifestReference = input.returnManifestReference ?? null;
  const recipientConfirmationReference =
    input.recipientConfirmationReference ?? null;
  const returnCompletedAt = input.returnCompletedAt ?? null;
  const controlledRetentionUntil = input.controlledRetentionUntil ?? null;

  if (noticeExceptionReference !== null) {
    assertOpaque(noticeExceptionReference, 'noticeExceptionReference');
  }

  const common = {
    terminationId: input.terminationId,
    requestId: input.requestId,
    noticeStartedAt,
    noticeDueAt,
    noticeExceptionReference,
    returnManifestReference,
    recipientConfirmationReference,
    returnCompletedAt,
    controlledRetentionUntil
  } as const;

  if (input.operation === 'open_notice') {
    if (input.state === 'active') {
      const originalNoticeStartedAt = input.nowAt;
      return basePlan({
        ...common,
        operation: 'open_notice',
        resultingState: 'termination_pending',
        noticeStartedAt: originalNoticeStartedAt,
        noticeDueAt: addUtcDays(
          originalNoticeStartedAt,
          input.policy.minimumNoticeDays
        ),
        idempotency: 'new_operation'
      });
    }
    if (input.state === 'termination_pending') {
      assertNotice({ noticeStartedAt, noticeDueAt, policy: input.policy });
      return basePlan({
        ...common,
        operation: 'open_notice',
        resultingState: 'termination_pending',
        idempotency: 'already_applied'
      });
    }
    throw new DomainError(
      'INVALID_VALUE',
      'a termination notice cannot be reopened after return processing.'
    );
  }

  if (input.state === 'active') {
    throw new DomainError(
      'INVALID_VALUE',
      `${input.operation} requires an opened termination notice.`
    );
  }
  const verifiedNotice = assertNotice({
    noticeStartedAt,
    noticeDueAt,
    policy: input.policy
  });

  if (input.operation === 'record_return') {
    if (input.state === 'termination_pending') {
      if (
        Date.parse(input.nowAt) < Date.parse(verifiedNotice.noticeDueAt) &&
        noticeExceptionReference === null
      ) {
        throw new DomainError(
          'INVALID_VALUE',
          'minimum notice period has not elapsed and no approved exception reference was supplied.'
        );
      }
      const completedAt = returnCompletedAt ?? input.nowAt;
      assertReturnEvidence({
        returnManifestReference,
        recipientConfirmationReference,
        returnCompletedAt: completedAt
      });
      if (
        Date.parse(completedAt) < Date.parse(verifiedNotice.noticeStartedAt)
      ) {
        throw new DomainError(
          'INVALID_TIMESTAMP',
          'returnCompletedAt cannot precede noticeStartedAt.'
        );
      }
      return basePlan({
        ...common,
        operation: 'record_return',
        resultingState: 'returned',
        returnCompletedAt: completedAt,
        idempotency: 'new_operation'
      });
    }
    if (input.state === 'returned') {
      assertReturnEvidence({
        returnManifestReference,
        recipientConfirmationReference,
        returnCompletedAt
      });
      return basePlan({
        ...common,
        operation: 'record_return',
        resultingState: 'returned',
        idempotency: 'already_applied'
      });
    }
    throw new DomainError(
      'INVALID_VALUE',
      'return can only be recorded before controlled retention begins.'
    );
  }

  assertReturnEvidence({
    returnManifestReference,
    recipientConfirmationReference,
    returnCompletedAt
  });
  const verifiedReturnCompletedAt = returnCompletedAt;
  if (verifiedReturnCompletedAt === null) {
    throw new DomainError(
      'INVALID_VALUE',
      'termination return completion evidence is required.'
    );
  }

  if (input.operation === 'start_controlled_retention') {
    if (input.state === 'returned') {
      const retentionUntil =
        controlledRetentionUntil ??
        addUtcDays(
          verifiedReturnCompletedAt,
          input.policy.controlledCopyRetentionDays
        );
      assertControlledRetention({
        returnCompletedAt: verifiedReturnCompletedAt,
        controlledRetentionUntil: retentionUntil,
        policy: input.policy
      });
      return basePlan({
        ...common,
        operation: 'start_controlled_retention',
        resultingState: 'controlled_retention',
        controlledRetentionUntil: retentionUntil,
        idempotency: 'new_operation'
      });
    }
    if (input.state === 'controlled_retention') {
      assertControlledRetention({
        returnCompletedAt,
        controlledRetentionUntil,
        policy: input.policy
      });
      return basePlan({
        ...common,
        operation: 'start_controlled_retention',
        resultingState: 'controlled_retention',
        idempotency: 'already_applied'
      });
    }
    throw new DomainError(
      'INVALID_VALUE',
      'controlled retention requires a completed return.'
    );
  }

  if (
    input.state !== 'controlled_retention' &&
    input.state !== 'manual_close_review'
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'manual closure review requires controlled retention.'
    );
  }
  assertControlledRetention({
    returnCompletedAt: verifiedReturnCompletedAt,
    controlledRetentionUntil,
    policy: input.policy
  });
  if (
    controlledRetentionUntil === null ||
    Date.parse(input.nowAt) < Date.parse(controlledRetentionUntil)
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'controlled retention has not expired.'
    );
  }
  if (
    input.backupDispositionConfirmed !== true ||
    input.auditDispositionConfirmed !== true
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'backup and audit disposition evidence is required before manual closure review.'
    );
  }
  return basePlan({
    ...common,
    operation: 'request_manual_close_review',
    resultingState: 'manual_close_review',
    idempotency:
      input.state === 'manual_close_review'
        ? 'already_applied'
        : 'new_operation'
  });
}
