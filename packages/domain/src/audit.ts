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
  | 'appointment_deleted'
  | 'follow_up_decided'
  /** Resource is the schedule, not an appointment; state is version + slot count. */
  | 'schedule_published';

export type AuditSource = 'api' | 'system' | 'worker';

/**
 * What the event is about. Audit v2 originally modelled appointments only;
 * publishing a schedule is the first non-appointment write that has to be
 * explainable after the fact, so the resource is now named rather than assumed.
 */
export type AuditResourceType = 'appointment' | 'schedule';

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

/** 排班發布的前後狀態。版本與時段數足以說明「改了什麼規模」，且不含任何患者資料。 */
export interface AuditScheduleState {
  readonly version: number;
  readonly slotCount: number;
}

/** 回診決定的前後狀態。`dueAt` 是 UTC 時間點，不需要也不得帶入病患資訊。 */
export interface AuditFollowUpState {
  readonly followUpStatus: 'required' | 'not_required';
  readonly dueAt: string | null;
}

/**
 * 稽核只記錄足以解釋一次變更的最小狀態。三種形狀都刻意窄——姓名、電話、
 * 身分證、備註都沒有欄位可以放進來，因此 PII 不可能經由稽核外流。
 */
export type AuditResourceState =
  AuditAppointmentState | AuditScheduleState | AuditFollowUpState;

export interface AuditEventV2 {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly action: AuditAction;
  readonly resourceType: AuditResourceType;
  readonly resourceId: string;
  readonly before: AuditResourceState | null;
  readonly after: AuditResourceState | null;
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
  readonly resourceType: AuditResourceType;
  readonly resourceId: string;
  readonly before: AuditResourceState | null;
  readonly after: AuditResourceState | null;
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
    resourceType: input.resourceType,
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
