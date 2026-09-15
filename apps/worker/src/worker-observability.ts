import type { CalendarAction } from './calendar-port.js';

export type WorkerAttemptResult =
  | 'completed'
  | 'retried'
  | 'dead_lettered'
  /** The lease moved to another worker before settlement; nothing was written. */
  | 'superseded';

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

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * Process-local rolling window for internal-test `/health` SLO. Labels stay
 * low-cardinality: no appointment, patient, or correlation ids.
 */
export class InMemoryWorkerMetrics implements WorkerMetricsPort {
  private readonly attempts: {
    readonly atMs: number;
    readonly failed: boolean;
  }[] = [];
  private lastSnapshot: WorkerQueueSnapshotMetric | undefined;

  public constructor(private readonly nowMs: () => number = Date.now) {}

  public recordCalendarAttempt(metric: CalendarAttemptMetric): void {
    if (metric.result === 'superseded') return;
    const atMs = this.nowMs();
    this.attempts.push({
      atMs,
      failed: metric.result !== 'completed'
    });
    const cutoff = atMs - TEN_MINUTES_MS;
    while (this.attempts[0] !== undefined && this.attempts[0].atMs < cutoff) {
      this.attempts.shift();
    }
  }

  public recordBatch(_metric: WorkerBatchMetric): void {
    return;
  }

  public recordQueueSnapshot(metric: WorkerQueueSnapshotMetric): void {
    this.lastSnapshot = metric;
  }

  public lastQueueSnapshot(): WorkerQueueSnapshotMetric | undefined {
    return this.lastSnapshot;
  }

  public attemptFailRate10m(): number {
    const cutoff = this.nowMs() - TEN_MINUTES_MS;
    let total = 0;
    let failed = 0;
    for (const attempt of this.attempts) {
      if (attempt.atMs < cutoff) continue;
      total += 1;
      if (attempt.failed) failed += 1;
    }
    return total === 0 ? 0 : failed / total;
  }
}

export function attemptFailRate10m(metrics: WorkerMetricsPort): number {
  return metrics instanceof InMemoryWorkerMetrics
    ? metrics.attemptFailRate10m()
    : 0;
}
