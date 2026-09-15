import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * Durable HTTP denial event. This is not appointment AuditEventV2: denials
 * have no before/after resource snapshot, and WP-P1 forbids copying tokens,
 * cookies, email, request bodies, phone, DOB or raw URLs into the record.
 */

export type DeniedAccessReasonCategory =
  | 'authentication_required'
  | 'authorization_denied'
  | 'account_disabled'
  | 'insufficient_permission'
  | 'cross_patient'
  | 'forbidden_modification';

export interface DeniedAccessAuditEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly outcome: 'denied';
  readonly reasonCategory: DeniedAccessReasonCategory;
  readonly correlationId: string;
  readonly environment: string;
}

export interface PlanDeniedAccessAuditInput {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly reasonCategory: DeniedAccessReasonCategory;
  readonly correlationId: string;
  readonly environment: string;
}

const OPAQUE = /^[A-Za-z0-9_-]{1,128}$/;
const EVENT_ID = /^[A-Za-z0-9_-]{1,512}$/;
const FORBIDDEN_SUBSTRINGS = [
  'password',
  'token',
  'session',
  'totp',
  'cookie',
  'authorization',
  'phone',
  'birth',
  'dob',
  'national'
];

function assertOpaque(value: string, fieldName: string): void {
  if (!OPAQUE.test(value)) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must be an opaque identifier.`
    );
  }
}

function assertSafeLabel(value: string, fieldName: string): void {
  assertOpaque(value, fieldName);
  const lower = value.toLowerCase();
  if (FORBIDDEN_SUBSTRINGS.some((part) => lower.includes(part))) {
    throw new DomainError(
      'INVALID_VALUE',
      `${fieldName} must not include secret or identity field names.`
    );
  }
}

export function planDeniedAccessAudit(
  input: PlanDeniedAccessAuditInput
): DeniedAccessAuditEvent {
  if (!EVENT_ID.test(input.eventId)) {
    throw new DomainError(
      'INVALID_VALUE',
      'deniedAccessAudit.eventId must be an opaque audit identifier.'
    );
  }
  assertUtcTimestamp(input.occurredAt, 'deniedAccessAudit.occurredAt');
  assertOpaque(input.actorId, 'deniedAccessAudit.actorId');
  assertSafeLabel(input.actorType, 'deniedAccessAudit.actorType');
  assertSafeLabel(input.action, 'deniedAccessAudit.action');
  assertSafeLabel(input.resourceType, 'deniedAccessAudit.resourceType');
  assertOpaque(input.correlationId, 'deniedAccessAudit.correlationId');
  assertSafeLabel(input.environment, 'deniedAccessAudit.environment');
  const resourceId =
    input.resourceId === undefined || input.resourceId === ''
      ? null
      : input.resourceId;
  if (resourceId !== null) {
    assertOpaque(resourceId, 'deniedAccessAudit.resourceId');
  }
  return {
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    actorId: input.actorId,
    actorType: input.actorType,
    action: input.action,
    resourceType: input.resourceType,
    resourceId,
    outcome: 'denied',
    reasonCategory: input.reasonCategory,
    correlationId: input.correlationId,
    environment: input.environment
  };
}
