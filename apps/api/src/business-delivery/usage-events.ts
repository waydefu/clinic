import { createHash, randomUUID } from 'node:crypto';

/**
 * CP-03 usage ingress (ADR-0008). Classified events share a Firestore
 * transaction with the login or booking they describe. An unclassifiable
 * staff login writes a monthly capture-gap marker in the session transaction.
 * Failed transactions persist neither. Records carry no email, UID, name,
 * phone or birth value: staff are represented by a SHA-256 reference of the
 * Firebase UID, used only to count distinct users.
 */
export const BUSINESS_DELIVERY_COLLECTIONS = {
  usageEvents: 'bd_usage_events',
  milestones: 'bd_milestones'
} as const;

/** Document in `bd_milestones` holding the first runtime staff login. */
export const FIRST_ELIGIBLE_USE_DOC = 'first_eligible_use';
/** Prefix for a server-only monthly staff-usage capture gap marker. */
export const STAFF_USAGE_CAPTURE_GAP_PREFIX = 'staff_usage_capture_gap_';
/** Document in `bd_milestones` holding owner confirmations. */
export const MILESTONE_ACKNOWLEDGEMENTS_DOC = 'acknowledgements';

export function staffUsageCaptureGapDocumentId(month: string): string {
  return `${STAFF_USAGE_CAPTURE_GAP_PREFIX}${month}`;
}

export type UsageEventKind = 'staff_login' | 'booking_created';
export type UsageEventClass = 'runtime' | 'maintenance';

const MAINTENANCE_EMAIL_ADDRESS =
  /^[A-Z0-9!#$%&'*+/?=^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/?=^_`{|}~-]+)*@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

export interface UsageEventRecordV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly kind: UsageEventKind;
  readonly eventClass: UsageEventClass;
  readonly occurredAt: string;
  /** Present only for staff_login: sha256(uid), never the UID itself. */
  readonly actorRef?: string;
}

function splitEmails(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item !== '')
  );
}

/** Whether the configured comma-separated maintenance identities can be used safely. */
export function hasValidMaintenanceEmailAllowlist(
  value: string | undefined
): boolean {
  if (value === undefined || value.trim() === '') return false;
  const emails = value.split(',').map((item) => item.trim());
  return (
    emails.length > 0 &&
    emails.every((email) => MAINTENANCE_EMAIL_ADDRESS.test(email))
  );
}

export function actorRefForUid(uid: string): string {
  return createHash('sha256').update(uid).digest('hex');
}

/**
 * Maintenance and developer accounts are listed by configuration
 * (`BUSINESS_DELIVERY_MAINTENANCE_EMAILS`) and classified at login time, so a
 * later configuration change cannot silently rewrite history.
 */
export function staffLoginUsageEvent(input: {
  readonly uid: string;
  readonly email: string | undefined;
  readonly occurredAt: string;
  readonly environment: NodeJS.ProcessEnv;
}): UsageEventRecordV1 | undefined {
  const maintenanceAllowlist =
    input.environment['BUSINESS_DELIVERY_MAINTENANCE_EMAILS'];
  // Without a complete allowlist, staff cannot be safely classified as
  // runtime or maintenance. Let session creation proceed without emitting an
  // event or starting the first-use milestone.
  if (!hasValidMaintenanceEmailAllowlist(maintenanceAllowlist))
    return undefined;

  const maintenance = splitEmails(maintenanceAllowlist);
  const email = (input.email ?? '').trim().toLowerCase();
  return {
    schemaVersion: 1,
    eventId: `sl_${randomUUID().replaceAll('-', '')}`,
    kind: 'staff_login',
    eventClass: maintenance.has(email) ? 'maintenance' : 'runtime',
    occurredAt: input.occurredAt,
    actorRef: actorRefForUid(input.uid)
  };
}

/** One event per appointment; replays never reach the write, so no duplicates. */
export function bookingCreatedUsageEvent(input: {
  readonly appointmentId: string;
  readonly occurredAt: string;
}): UsageEventRecordV1 {
  return {
    schemaVersion: 1,
    // Deterministic and bounded: appointment IDs may be up to 128 characters.
    eventId: `bc_${createHash('sha256').update(input.appointmentId).digest('hex').slice(0, 48)}`,
    kind: 'booking_created',
    eventClass: 'runtime',
    occurredAt: input.occurredAt
  };
}
