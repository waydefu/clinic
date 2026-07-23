import type { CalendarAction } from './calendar-port.js';

export type WorkerAttemptResult = 'completed' | 'retried' | 'dead_lettered';

/**
 * Low-cardinality metric for one external attempt. Identifiers deliberately do
 * not appear here; correlation and causation belong to trace context, not
 * metric labels.
 */
export interface CalendarAttemptMetric {
  readonly destination: 'calendar';
  readonly action: CalendarAction;
  readonly result: WorkerAttemptResult;
  readonly retryable: boolean | null;
  readonly attempt: number;
  readonly latencyMs: number;
}

export interface WorkerBatchMetric {
  readonly claimed: number;
  readonly completed: number;
  readonly retried: number;
  readonly deadLettered: number;
  readonly durationMs: number;
}

/**
 * A future runner may obtain this from an aggregation query or platform
 * monitoring. The processor does not scan the whole queue merely for metrics.
 */
export interface WorkerQueueSnapshotMetric {
  readonly pending: number;
  readonly inProgress: number;
  readonly deadLettered: number;
  readonly oldestPendingAgeSeconds: number;
}

export interface WorkerMetricsPort {
  recordCalendarAttempt(metric: CalendarAttemptMetric): void;
  recordBatch(metric: WorkerBatchMetric): void;
  recordQueueSnapshot(metric: WorkerQueueSnapshotMetric): void;
}

export const NOOP_WORKER_METRICS: WorkerMetricsPort = {
  recordCalendarAttempt: () => undefined,
  recordBatch: () => undefined,
  recordQueueSnapshot: () => undefined
};
