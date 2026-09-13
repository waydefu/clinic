import { describe, expect, it } from 'vitest';

import { evaluateOutboxSlo } from './outbox-slo.js';
import type { WorkerQueueSnapshotMetric } from './worker-observability.js';

const emptyQueue: WorkerQueueSnapshotMetric = {
  pending: 0,
  inProgress: 0,
  deadLettered: 0,
  oldestPendingAgeSeconds: 0
};

describe('evaluateOutboxSlo', () => {
  it('stays quiet on a healthy drain', () => {
    expect(
      evaluateOutboxSlo({
        attemptFailRate10m: 0.19,
        consecutiveEmptyBatchesWithPending: 2,
        snapshot: { ...emptyQueue, pending: 4, inProgress: 1 }
      })
    ).toEqual([]);
  });

  it('raises the documented weekday and immediate predicates', () => {
    expect(
      evaluateOutboxSlo({
        attemptFailRate10m: 0.21,
        consecutiveEmptyBatchesWithPending: 3,
        snapshot: {
          pending: 2,
          inProgress: 0,
          deadLettered: 1,
          oldestPendingAgeSeconds: 61
        }
      })
    ).toEqual([
      { code: 'calendar_attempt_fail_rate', severity: 'weekday' },
      { code: 'empty_batches_with_pending', severity: 'immediate' },
      { code: 'oldest_pending_age', severity: 'immediate' },
      { code: 'dead_letter_present', severity: 'immediate' }
    ]);
  });

  it('does not put identifiers into alert payloads', () => {
    const alerts = evaluateOutboxSlo({
      attemptFailRate10m: 1,
      consecutiveEmptyBatchesWithPending: 3,
      snapshot: {
        pending: 1,
        inProgress: 0,
        deadLettered: 1,
        oldestPendingAgeSeconds: 120
      }
    });
    expect(JSON.stringify(alerts)).not.toMatch(
      /appointment_|patient_|corr_|nationalId/
    );
  });
});
