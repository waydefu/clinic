import type { Firestore } from 'firebase-admin/firestore';

import { InMemoryCalendar, type CalendarPort } from './calendar-port.js';
import {
  OUTBOX_COLLECTION,
  OutboxProcessor,
  type ProcessSummary
} from './outbox-processor.js';
import { evaluateOutboxSlo, type OutboxAlert } from './outbox-slo.js';
import {
  NOOP_WORKER_METRICS,
  type WorkerMetricsPort,
  type WorkerQueueSnapshotMetric
} from './worker-observability.js';

export const INTERNAL_TEST_OUTBOX_FORBIDDEN_PROJECTS = new Set([
  'beauessence-clinic-staging'
]);

export interface InternalTestOutboxDrain {
  readonly summary: ProcessSummary;
  readonly snapshot: WorkerQueueSnapshotMetric;
  readonly alerts: readonly OutboxAlert[];
}

export interface InternalTestOutboxRuntime {
  readonly calendar: CalendarPort;
  run(nowUtc?: string): Promise<InternalTestOutboxDrain>;
}

export interface InternalTestOutboxRuntimeOptions {
  readonly db: Firestore;
  readonly calendar?: CalendarPort;
  readonly metrics?: WorkerMetricsPort;
  readonly clock?: () => string;
  readonly random?: () => number;
}

/**
 * IP-001 internal-test drain. Calendar stays an injectable projection
 * (InMemoryCalendar by default). This entry must not import the Google
 * Calendar adapter — production Calendar remains D-009/D-016.
 */
export function createInternalTestOutboxRuntime(
  options: InternalTestOutboxRuntimeOptions
): InternalTestOutboxRuntime {
  const calendar = options.calendar ?? new InMemoryCalendar();
  const metrics = options.metrics ?? NOOP_WORKER_METRICS;
  const processor = new OutboxProcessor(
    options.db,
    calendar,
    metrics,
    options.random ?? Math.random
  );
  let emptyStreak = 0;

  return {
    calendar,
    async run(nowUtc = options.clock?.() ?? new Date().toISOString()) {
      const summary = await processor.processDue(nowUtc);
      const snapshot = await readOutboxQueueSnapshot(options.db, nowUtc);
      try {
        metrics.recordQueueSnapshot(snapshot);
      } catch {
        // Metrics must not change delivery, matching OutboxProcessor.
      }
      if (summary.completed === 0 && snapshot.pending > 0) emptyStreak += 1;
      else emptyStreak = 0;
      return {
        summary,
        snapshot,
        alerts: evaluateOutboxSlo({
          attemptFailRate10m: 0,
          consecutiveEmptyBatchesWithPending: emptyStreak,
          snapshot
        })
      };
    }
  };
}

export async function readOutboxQueueSnapshot(
  db: Firestore,
  nowUtc: string
): Promise<WorkerQueueSnapshotMetric> {
  const collection = db.collection(OUTBOX_COLLECTION);
  const [pending, inProgress, deadLettered, oldestDue] = await Promise.all([
    collection.where('status', '==', 'pending').get(),
    collection.where('status', '==', 'in_progress').get(),
    collection.where('status', '==', 'dead_lettered').get(),
    collection
      .where('status', '==', 'pending')
      .where('nextAttemptAt', '<=', nowUtc)
      .orderBy('nextAttemptAt')
      .limit(1)
      .get()
  ]);
  const oldestRecord = oldestDue.docs[0]?.data();
  const oldest =
    oldestRecord !== undefined &&
    typeof oldestRecord['nextAttemptAt'] === 'string'
      ? oldestRecord['nextAttemptAt']
      : undefined;
  const oldestMs = oldest === undefined ? Number.NaN : Date.parse(oldest);
  const nowMs = Date.parse(nowUtc);
  const oldestPendingAgeSeconds =
    Number.isFinite(oldestMs) && Number.isFinite(nowMs)
      ? Math.max(0, Math.floor((nowMs - oldestMs) / 1000))
      : 0;
  return {
    pending: pending.size,
    inProgress: inProgress.size,
    deadLettered: deadLettered.size,
    oldestPendingAgeSeconds
  };
}

export function assertInternalTestOutboxBootAllowed(
  env: NodeJS.ProcessEnv = process.env
): void {
  const projectId = (
    env['GOOGLE_CLOUD_PROJECT'] ??
    env['GCLOUD_PROJECT'] ??
    env['GCLOUD_PROJECT_ID'] ??
    ''
  ).trim();
  if (INTERNAL_TEST_OUTBOX_FORBIDDEN_PROJECTS.has(projectId)) {
    throw new Error(
      'internal-test outbox refuses the forbidden staging project.'
    );
  }
  if ((env['FIRESTORE_EMULATOR_HOST'] ?? '').trim() === '') {
    throw new Error(
      'internal-test outbox requires FIRESTORE_EMULATOR_HOST; it does not drain cloud Firestore into an in-memory calendar.'
    );
  }
}
