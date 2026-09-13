import { DomainError } from './errors.js';
import type { Role } from './roles.js';
import { isRole } from './roles.js';
import { assertUtcTimestamp } from './timestamp.js';
import type { DelegationDenialReason } from './delegated-authorization-common.js';

/**
 * Denied-event shape for delegated authorization. This is not appointment
 * AuditEventV2: a secret guess has no before/after resource state, and the
 * appointment mutation audit still belongs in the same transaction as the
 * write (C5). D-006 requires lockouts and denials to produce audit without
 * ever recording the secret, salt, hash or which authorization id was tried.
 */
export type DeniedDelegationAuditReason =
  DelegationDenialReason | 'verification_locked';

export interface DeniedDelegationAuditEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly permission: string;
  readonly result: 'denied';
  readonly reasonCode: DeniedDelegationAuditReason;
  readonly locked: boolean;
  readonly failedAttempts: number;
  readonly correlationId: string;
  readonly source: 'api';
}

export interface PlanDeniedDelegationAuditInput {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly permission: string;
  readonly reasonCode: DeniedDelegationAuditReason;
  readonly locked: boolean;
  readonly failedAttempts: number;
  readonly correlationId: string;
}

function assertOpaqueIdentifier(value: string, fieldName: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}

function assertAuditEventId(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      'deniedDelegationAudit.eventId must be an opaque audit identifier.'
    );
  }
}

export function planDeniedDelegationAudit(
  input: PlanDeniedDelegationAuditInput
): DeniedDelegationAuditEvent {
  assertAuditEventId(input.eventId);
  assertOpaqueIdentifier(input.actorId, 'deniedDelegationAudit.actorId');
  assertOpaqueIdentifier(
    input.correlationId,
    'deniedDelegationAudit.correlationId'
  );
  assertOpaqueIdentifier(input.permission, 'deniedDelegationAudit.permission');
  assertOpaqueIdentifier(input.reasonCode, 'deniedDelegationAudit.reasonCode');
  if (!isRole(input.actorRole)) {
    throw new DomainError(
      'INVALID_VALUE',
      'deniedDelegationAudit.actorRole must be a canonical role'
    );
  }
  assertUtcTimestamp(input.occurredAt, 'deniedDelegationAudit.occurredAt');
  if (
    !Number.isInteger(input.failedAttempts) ||
    input.failedAttempts < 0 ||
    input.failedAttempts > 10
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'deniedDelegationAudit.failedAttempts must be an integer from 0 to 10'
    );
  }
  if (input.locked && input.failedAttempts < 1) {
    throw new DomainError(
      'INVALID_VALUE',
      'a locked denial must record at least one failed attempt'
    );
  }

  return {
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    actorRole: input.actorRole,
    permission: input.permission,
    result: 'denied',
    reasonCode: input.reasonCode,
    locked: input.locked,
    failedAttempts: input.failedAttempts,
    correlationId: input.correlationId,
    source: 'api'
  };
}
