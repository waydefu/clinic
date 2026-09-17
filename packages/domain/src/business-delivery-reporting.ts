import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * BD-05 is an aggregation contract, not a mailer or a billing calculator.
 * Events are classified before aggregation so maintenance and test activity
 * cannot be reported as real usage. The result contains counts only.
 */
export type BusinessReportScope = 'internal_synthetic' | 'production';
export type BusinessReportEventClass = 'runtime' | 'maintenance' | 'test';
export type BusinessReportEventKind =
  | 'staff_login'
  | 'booking_created'
  | 'major_incident'
  | 'backup_success'
  | 'backup_failure';
export type BusinessReportCompleteness = 'complete' | 'partial' | 'unknown';
export type BusinessUsageClassification =
  'used' | 'unused' | 'insufficient_evidence';

export interface BusinessReportEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly eventClass: BusinessReportEventClass;
  readonly kind: BusinessReportEventKind;
  /** Required only for runtime staff_login; must be opaque when supplied. */
  readonly actorId?: string;
}

export interface MonthlyBusinessReport {
  readonly scope: BusinessReportScope;
  readonly month: string;
  readonly timeZone: 'Asia/Taipei';
  readonly completeness: BusinessReportCompleteness;
  readonly uniqueStaffUsers: number;
  readonly bookingCreatedCount: number;
  readonly majorIncidentCount: number;
  readonly backupSuccessCount: number;
  readonly backupFailureCount: number;
  readonly usageClassification: BusinessUsageClassification;
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;

function assertOpaque(value: string, fieldName: string): void {
  if (!OPAQUE_IDENTIFIER.test(value)) {
    throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
  }
}

function assertMonth(value: string): void {
  const match = MONTH_PATTERN.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new DomainError('INVALID_VALUE', 'month must be YYYY-MM.');
  }
}

function taipeiMonth(occurredAt: string): string {
  assertUtcTimestamp(occurredAt, 'occurredAt');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date(occurredAt));
}

function eventFingerprint(event: BusinessReportEvent): string {
  return JSON.stringify([
    event.occurredAt,
    event.eventClass,
    event.kind,
    event.actorId ?? null
  ]);
}

/**
 * Aggregates one Taipei calendar month. Duplicate event IDs are idempotent;
 * reusing an ID for different content fails closed instead of double-counting.
 * A non-complete source never becomes "unused" merely because no rows arrived.
 */
export function summarizeMonthlyBusinessUsage(input: {
  readonly scope: BusinessReportScope;
  readonly month: string;
  readonly events: readonly BusinessReportEvent[];
  readonly completeness: BusinessReportCompleteness;
}): MonthlyBusinessReport {
  assertMonth(input.month);
  const seen = new Map<string, string>();
  const staffIds = new Set<string>();
  let bookingCreatedCount = 0;
  let majorIncidentCount = 0;
  let backupSuccessCount = 0;
  let backupFailureCount = 0;

  for (const event of input.events) {
    assertOpaque(event.eventId, 'eventId');
    const fingerprint = eventFingerprint(event);
    const previous = seen.get(event.eventId);
    if (previous !== undefined) {
      if (previous !== fingerprint) {
        throw new DomainError(
          'INVALID_VALUE',
          'an eventId cannot describe two different events.'
        );
      }
      continue;
    }
    seen.set(event.eventId, fingerprint);
    if (taipeiMonth(event.occurredAt) !== input.month) continue;
    if (event.eventClass !== 'runtime') continue;

    if (event.kind === 'staff_login') {
      if (event.actorId === undefined) {
        throw new DomainError(
          'INVALID_VALUE',
          'a runtime staff_login requires an opaque actorId.'
        );
      }
      assertOpaque(event.actorId, 'actorId');
      staffIds.add(event.actorId);
    } else if (event.kind === 'booking_created') {
      bookingCreatedCount += 1;
    } else if (event.kind === 'major_incident') {
      majorIncidentCount += 1;
    } else if (event.kind === 'backup_success') {
      backupSuccessCount += 1;
    } else if (event.kind === 'backup_failure') {
      backupFailureCount += 1;
    }
  }

  const used = staffIds.size > 0 || bookingCreatedCount > 0;
  const usageClassification: BusinessUsageClassification =
    input.completeness === 'complete'
      ? used
        ? 'used'
        : 'unused'
      : 'insufficient_evidence';

  return {
    scope: input.scope,
    month: input.month,
    timeZone: 'Asia/Taipei',
    completeness: input.completeness,
    uniqueStaffUsers: staffIds.size,
    bookingCreatedCount,
    majorIncidentCount,
    backupSuccessCount,
    backupFailureCount,
    usageClassification
  };
}
