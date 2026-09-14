import { describe, expect, it } from 'vitest';

import {
  InMemoryWorkerMetrics,
  attemptFailRate10m,
  NOOP_WORKER_METRICS,
  type CalendarAttemptMetric
} from './worker-observability.js';

function attempt(
  result: CalendarAttemptMetric['result']
): CalendarAttemptMetric {
  return {
    destination: 'calendar',
    action: 'upsert',
    result,
    retryable: result === 'retried' ? true : null,
    attempt: 1,
    latencyMs: 5
  };
}

describe('InMemoryWorkerMetrics', () => {
  it('computes a 10-minute fail rate without identifiers', () => {
    const now = 1_000_000;
    const metrics = new InMemoryWorkerMetrics(() => now);
    metrics.recordCalendarAttempt(attempt('completed'));
    metrics.recordCalendarAttempt(attempt('retried'));
    metrics.recordCalendarAttempt(attempt('dead_lettered'));
    metrics.recordCalendarAttempt(attempt('superseded'));
    expect(metrics.attemptFailRate10m()).toBeCloseTo(2 / 3);
    expect(attemptFailRate10m(metrics)).toBeCloseTo(2 / 3);
    expect(JSON.stringify(metrics)).not.toMatch(
      /appointment_|patient_|corr_|nationalId/
    );
  });

  it('drops attempts older than ten minutes', () => {
    let now = 0;
    const metrics = new InMemoryWorkerMetrics(() => now);
    metrics.recordCalendarAttempt(attempt('dead_lettered'));
    now = 10 * 60 * 1000 + 1;
    metrics.recordCalendarAttempt(attempt('completed'));
    expect(metrics.attemptFailRate10m()).toBe(0);
  });

  it('keeps NOOP metrics at a zero fail rate', () => {
    expect(attemptFailRate10m(NOOP_WORKER_METRICS)).toBe(0);
  });
});
