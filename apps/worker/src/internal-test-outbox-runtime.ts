import type { Firestore } from 'firebase-admin/firestore';

import { InMemoryCalendar, type CalendarPort } from './calendar-port.js';
import {
  OUTBOX_COLLECTION,
  OutboxProcessor,
  type ProcessSummary
} from './outbox-processor.js';
import { evaluateOutboxSlo, type OutboxAlert } from './outbox-slo.js';
import {
  InMemoryWorkerMetrics,
  attemptFailRate10m,
  type WorkerMetricsPort,
  type WorkerQueueSnapshotMetric
} from './worker-observability.js';

export const INTERNAL_TEST_OUTBOX_FORBIDDEN_PROJECTS = new Set([
  'beauessence-clinic-staging'
]);

export type InternalTestOutboxExecution = 'emulator' | 'cloud';

export interface InternalTestOutboxDrain {
  readonly summary: ProcessSummary;
  readonly snapshot: WorkerQueueSnapshotMetric;
  readonly alerts: readonly OutboxAlert[];
  readonly attemptFailRate10m: number;
}

export interface InternalTestOutboxInspection {
  readonly snapshot: WorkerQueueSnapshotMetric;
  readonly alerts: readonly OutboxAlert[];
  readonly attemptFailRate10m: number;
}

export interface InternalTestOutboxRuntime {
  readonly calendar: CalendarPort;
  calendarReady(): Promise<void>;
  run(nowUtc?: string): Promise<InternalTestOutboxDrain>;
  inspect(nowUtc?: string): Promise<InternalTestOutboxInspection>;
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
  const metrics = options.metrics ?? new InMemoryWorkerMetrics();
  const processor = new OutboxProcessor(
    options.db,
    calendar,
    metrics,
    options.random ?? Math.random
  );
  let emptyStreak = 0;

  return {
    calendar,
    async calendarReady() {
      await calendar.ready();
    },
    async inspect(nowUtc = options.clock?.() ?? new Date().toISOString()) {
      const snapshot = await readOutboxQueueSnapshot(options.db, nowUtc);
      const failRate = attemptFailRate10m(metrics);
      logInternalTestOutboxSnapshot(snapshot);
      return {
        snapshot,
        attemptFailRate10m: failRate,
        alerts: evaluateOutboxSlo({
          attemptFailRate10m: failRate,
          consecutiveEmptyBatchesWithPending: emptyStreak,
          snapshot
        })
      };
    },
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
      logInternalTestOutboxSnapshot(snapshot);
      const failRate = attemptFailRate10m(metrics);
      return {
        summary,
        snapshot,
        attemptFailRate10m: failRate,
        alerts: evaluateOutboxSlo({
          attemptFailRate10m: failRate,
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
    collection.where('status', '==', 'dead_letter').get(),
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
): InternalTestOutboxExecution {
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
  const execution = (
    env['INTERNAL_TEST_OUTBOX_EXECUTION'] ?? 'emulator'
  ).trim();
  const emulatorHost = (env['FIRESTORE_EMULATOR_HOST'] ?? '').trim();
  if (execution === 'emulator') {
    if (emulatorHost === '') {
      throw new Error(
        'internal-test outbox emulator execution requires FIRESTORE_EMULATOR_HOST; it does not drain cloud Firestore into an in-memory calendar.'
      );
    }
    return 'emulator';
  }
  if (execution !== 'cloud') {
    throw new Error(
      'INTERNAL_TEST_OUTBOX_EXECUTION must be emulator or cloud.'
    );
  }
  if (emulatorHost !== '') {
    throw new Error(
      'internal-test outbox cloud execution refuses FIRESTORE_EMULATOR_HOST.'
    );
  }
  if (!/^beauessence-clinic-stg-[a-z0-9]{1,7}$/.test(projectId)) {
    throw new Error(
      'internal-test outbox cloud execution requires an isolated C1 project id.'
    );
  }
  const processing = (
    env['INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED'] ?? ''
  ).trim();
  if (processing !== 'true' && processing !== 'false') {
    throw new Error(
      'internal-test outbox cloud execution requires INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED=true|false.'
    );
  }
  const calendarMode = (env['GOOGLE_CALENDAR_INTEGRATION_MODE'] ?? '').trim();
  if (calendarMode === 'production') {
    throw new Error(
      'internal-test outbox refuses GOOGLE_CALENDAR_INTEGRATION_MODE=production.'
    );
  }
  if (calendarMode !== 'test') {
    throw new Error(
      'internal-test outbox cloud execution requires GOOGLE_CALENDAR_INTEGRATION_MODE=test.'
    );
  }
  const calendarAuth = (env['GOOGLE_CALENDAR_AUTH'] ?? '').trim();
  if (calendarAuth !== 'CLOUD_ADC') {
    throw new Error(
      'internal-test outbox cloud execution requires GOOGLE_CALENDAR_AUTH=CLOUD_ADC; user-managed service-account keys are not used.'
    );
  }
  if ((env['GOOGLE_CALENDAR_ID'] ?? '').trim() === '') {
    throw new Error(
      'internal-test outbox cloud execution requires GOOGLE_CALENDAR_ID; it will not drain cloud Firestore into an in-memory calendar.'
    );
  }
  if ((env['GOOGLE_SERVICE_ACCOUNT_JSON'] ?? '').trim() !== '') {
    throw new Error(
      'internal-test outbox cloud execution forbids GOOGLE_SERVICE_ACCOUNT_JSON; use attached Cloud Run ADC.'
    );
  }
  if ((env['GOOGLE_APPLICATION_CREDENTIALS'] ?? '').trim() !== '') {
    throw new Error(
      'internal-test outbox cloud execution forbids GOOGLE_APPLICATION_CREDENTIALS; do not mount a private key file.'
    );
  }
  const sourceSha = (env['INTERNAL_TEST_SOURCE_SHA'] ?? '').trim();
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
    throw new Error(
      'internal-test outbox cloud execution requires INTERNAL_TEST_SOURCE_SHA as a 40-character Git SHA.'
    );
  }
  return 'cloud';
}

export function isInternalTestOutboxProcessingEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (
    (env['INTERNAL_TEST_OUTBOX_EXECUTION'] ?? 'emulator').trim() !== 'cloud'
  ) {
    return true;
  }
  return env['INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED'] === 'true';
}

export function logInternalTestOutboxSnapshot(
  snapshot: WorkerQueueSnapshotMetric,
  write: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  }
): void {
  write(
    JSON.stringify({
      service: 'internal-test-outbox-worker',
      pending: snapshot.pending,
      inProgress: snapshot.inProgress,
      deadLettered: snapshot.deadLettered,
      oldestPendingAgeSeconds: snapshot.oldestPendingAgeSeconds,
      retryState: snapshot.deadLettered > 0 ? 'dead_lettered' : 'none'
    })
  );
}
