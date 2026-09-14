import type { WorkerQueueSnapshotMetric } from './worker-observability.js';

/**
 * Pure alert predicates from the 2026-07-24 worker runtime plan §5.
 * Labels stay low-cardinality: no appointment, patient, or event ids.
 */
export const CALENDAR_ATTEMPT_FAIL_RATE_ALERT = 0.2;
export const EMPTY_BATCH_STREAK_ALERT = 3;
export const OLDEST_PENDING_AGE_ALERT_SECONDS = 60;

export type OutboxAlertSeverity = 'weekday' | 'immediate';

export type OutboxAlertCode =
  | 'calendar_attempt_fail_rate'
  | 'empty_batches_with_pending'
  | 'oldest_pending_age'
  | 'dead_letter_present';

export interface OutboxAlert {
  readonly code: OutboxAlertCode;
  readonly severity: OutboxAlertSeverity;
}

export interface OutboxSloInput {
  readonly attemptFailRate10m: number;
  readonly consecutiveEmptyBatchesWithPending: number;
  readonly snapshot: WorkerQueueSnapshotMetric;
}

export function evaluateOutboxSlo(input: OutboxSloInput): OutboxAlert[] {
  const alerts: OutboxAlert[] = [];
  if (input.attemptFailRate10m > CALENDAR_ATTEMPT_FAIL_RATE_ALERT) {
    alerts.push({
      code: 'calendar_attempt_fail_rate',
      severity: 'weekday'
    });
  }
  if (
    input.consecutiveEmptyBatchesWithPending >= EMPTY_BATCH_STREAK_ALERT &&
    input.snapshot.pending > 0
  ) {
    alerts.push({
      code: 'empty_batches_with_pending',
      severity: 'immediate'
    });
  }
  if (
    input.snapshot.oldestPendingAgeSeconds > OLDEST_PENDING_AGE_ALERT_SECONDS
  ) {
    alerts.push({
      code: 'oldest_pending_age',
      severity: 'immediate'
    });
  }
  if (input.snapshot.deadLettered > 0) {
    alerts.push({
      code: 'dead_letter_present',
      severity: 'immediate'
    });
  }
  return alerts;
}
