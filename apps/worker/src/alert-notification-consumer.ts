/**
 * SOL-NOTIFICATION / B-08: source-only consumer decision for the
 * `c1-application-alerts` Pub/Sub topic.
 * Design: docs/plans/2026-10-30-sol-notification-design.md.
 *
 * Pure decision plus ports. No Pub/Sub client, no provider SDK, no timers:
 * real delivery and the subscription wiring stay external and unapproved.
 * Tests use fakes only.
 */

export type AlertState = 'open' | 'closed';

/** The only fields that may leave this module. Nothing free-text, nothing PII. */
export interface AlertNotice {
  readonly incidentId: string;
  readonly state: AlertState;
  /** Display name of the WP-B4 policy; allowlisted, never message text. */
  readonly policy: string;
}

export interface AlertSenderPort {
  /** Throws on failure; AlertSendError(false) is dead-lettered at once. */
  send(notice: AlertNotice, dedupeKey: string): Promise<void>;
}

export interface AlertDedupePort {
  /** Atomic: true if this call recorded the key first, false if already seen. */
  claim(dedupeKey: string): Promise<boolean>;
  /** Called when send fails so a redelivery may try again. */
  release(dedupeKey: string): Promise<void>;
}

export class AlertSendError extends Error {
  constructor(readonly retryable: boolean) {
    super('alert send failed');
  }
}

/** Matches the policy display names in infra/terraform/wp-b4-alerting/main.tf. */
export const ALERT_POLICY_ALLOWLIST: ReadonlySet<string> = new Set([
  'WP-B4 API 5xx burst',
  'WP-B4 durable booking write failure',
  'WP-B4 Firestore transaction failure',
  'WP-B4 backup failure',
  'WP-B4 outbox dead-letter',
  'WP-B4 auth failure spike',
  'WP-B4 authorization denial spike',
  'WP-B4 excessive outbox age',
  'WP-B4 IAM SetIamPolicy'
]);

/**
 * Pub/Sub meaning: sent and duplicate are acked; retry is nacked so the
 * subscription retry policy redelivers; dead_letter and rejected_malformed
 * are acked here and recorded for the operator (or forwarded to the DLQ topic).
 */
export type ConsumeOutcome =
  'sent' | 'duplicate' | 'rejected_malformed' | 'retry' | 'dead_letter';

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Allowlist projection of a Cloud Monitoring Pub/Sub payload. Every other
 * field (summary, resource labels, documentation, URLs) is dropped, so a
 * stray label can never reach a sender. Returns null on any shape surprise.
 */
export function projectAlert(raw: string): AlertNotice | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const incident = (parsed as { incident?: unknown } | null)?.incident;
  if (incident === null || typeof incident !== 'object') return null;
  const { incident_id, policy_name, state } = incident as Record<
    string,
    unknown
  >;
  if (typeof incident_id !== 'string' || !ID_PATTERN.test(incident_id))
    return null;
  if (
    typeof policy_name !== 'string' ||
    !ALERT_POLICY_ALLOWLIST.has(policy_name)
  )
    return null;
  if (state !== 'open' && state !== 'closed') return null;
  return { incidentId: incident_id, state, policy: policy_name };
}

/** One delivery per incident transition; redelivery of the same pair is a duplicate. */
export function alertDedupeKey(notice: AlertNotice): string {
  return `${notice.incidentId}:${notice.state}`;
}

export async function consumeAlertMessage(
  raw: string,
  sender: AlertSenderPort,
  dedupe: AlertDedupePort
): Promise<ConsumeOutcome> {
  const notice = projectAlert(raw);
  // Malformed never succeeds on retry: do not loop.
  if (notice === null) return 'rejected_malformed';
  const key = alertDedupeKey(notice);
  if (!(await dedupe.claim(key))) return 'duplicate';
  try {
    await sender.send(notice, key);
    return 'sent';
  } catch (error) {
    await dedupe.release(key);
    return error instanceof AlertSendError && !error.retryable
      ? 'dead_letter'
      : 'retry';
  }
}
