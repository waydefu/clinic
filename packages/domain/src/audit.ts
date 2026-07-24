import type { AppointmentStatusValue } from './appointment-rules.js';
import { DomainError } from './errors.js';

export const AUDIT_SCHEMA_VERSION = 2 as const;

export type AuditAction =
  | 'appointment_confirmed'
  | 'cancellation_requested'
  | 'appointment_cancelled'
  | 'appointment_completed'
  | 'appointment_no_show'
  | 'appointment_rescheduled'
  /**
   * Deleting a record removes it from the operational view; the audit event is
   * the only remaining trace, so it must survive the resource it describes.
   * `after` is null for this action — there is no post-state to record.
   */
  | 'appointment_deleted';

export type AuditSource = 'api' | 'system' | 'worker';

export interface AuditContext {
  readonly actorId: string;
  /**
   * Opaque server-verified role identifier. D-006 still owns the real role
   * values and permissions; the domain does not guess them.
   */
  readonly actorRole: string;
  readonly correlationId: string;
  readonly source: AuditSource;
  readonly reasonCode: string | null;
  readonly policyVersion: string | null;
}

export interface AuditAppointmentState {
  readonly status: AppointmentStatusValue;
  readonly slotId: string;
}

export interface AuditEventV2 {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly action: AuditAction;
  readonly resourceType: 'appointment';
  readonly resourceId: string;
  readonly before: AuditAppointmentState | null;
  readonly after: AuditAppointmentState | null;
  readonly reasonCode: string | null;
  readonly result: 'succeeded' | 'denied' | 'failed';
  readonly correlationId: string;
  readonly source: AuditSource;
  readonly policyVersion: string | null;
  readonly schemaVersion: typeof AUDIT_SCHEMA_VERSION;
}

interface PlanAuditEventInput {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly action: AuditAction;
  readonly resourceId: string;
  readonly before: AuditAppointmentState | null;
  readonly after: AuditAppointmentState | null;
  readonly context: AuditContext;
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
      'audit.eventId must be an opaque audit identifier.'
    );
  }
}

function assertNullableOpaqueIdentifier(
  value: string | null,
  fieldName: string
): void {
  if (value !== null) assertOpaqueIdentifier(value, fieldName);
}

function assertUtcTimestamp(value: string): void {
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      'audit.occurredAt must be a valid UTC ISO-8601 timestamp.'
    );
  }
}

/**
 * Produces the strict, privacy-minimised v2 event written in the same
 * transaction as its appointment mutation.
 */
export function planAuditEvent(input: PlanAuditEventInput): AuditEventV2 {
  assertAuditEventId(input.eventId);
  assertOpaqueIdentifier(input.resourceId, 'audit.resourceId');
  assertOpaqueIdentifier(input.context.actorId, 'audit.actorId');
  assertOpaqueIdentifier(input.context.actorRole, 'audit.actorRole');
  assertOpaqueIdentifier(input.context.correlationId, 'audit.correlationId');
  assertNullableOpaqueIdentifier(input.context.reasonCode, 'audit.reasonCode');
  assertNullableOpaqueIdentifier(
    input.context.policyVersion,
    'audit.policyVersion'
  );
  assertUtcTimestamp(input.occurredAt);

  return {
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    actorId: input.context.actorId,
    actorRole: input.context.actorRole,
    action: input.action,
    resourceType: 'appointment',
    resourceId: input.resourceId,
    before: input.before,
    after: input.after,
    reasonCode: input.context.reasonCode,
    result: 'succeeded',
    correlationId: input.context.correlationId,
    source: input.context.source,
    policyVersion: input.context.policyVersion,
    schemaVersion: AUDIT_SCHEMA_VERSION
  };
}
