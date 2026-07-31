import { describe, expect, it } from 'vitest';

import {
  BASE_BACKOFF_SECONDS,
  MAX_ATTEMPTS,
  MAX_BACKOFF_SECONDS,
  assertOutboxTraceContext,
  backoffSeconds,
  fullJitterBackoffMilliseconds,
  isDue,
  planOutboxAttempt,
  type OutboxJob,
  type OutboxTraceContext
} from './outbox.js';
import { calendarEventIdForAppointment } from './calendar-event-id.js';

const job: OutboxJob = {
  id: 'outbox_001',
  appointmentId: 'appointment_001',
  correlationId: 'corr_outbox_001',
  causationId: 'audit_appointment_001_confirmed',
  idempotencyKey: calendarEventIdForAppointment('appointment_001'),
  status: 'pending',
  attempts: 0
};

const NOW = '2026-07-21T09:00:00.000Z';

describe('outbox trace context', () => {
  it('requires opaque correlation and causation identifiers', () => {
    expect(() => assertOutboxTraceContext(job)).not.toThrow();
    expect(() =>
      assertOutboxTraceContext({ ...job, correlationId: '' })
    ).toThrow(/correlationId/);
    expect(() =>
      assertOutboxTraceContext({ ...job, causationId: 'patient/name' })
    ).toThrow(/causationId/);
    expect(() =>
      assertOutboxTraceContext({ ...job, causationId: 'a'.repeat(512) })
    ).not.toThrow();
    expect(() =>
      assertOutboxTraceContext({ ...job, causationId: 'a'.repeat(513) })
    ).toThrow(/causationId/);
    expect(() => assertOutboxTraceContext({} as OutboxTraceContext)).toThrow(
      /correlationId/
    );
  });
});

describe('backoffSeconds', () => {
  it('doubles each attempt from the base', () => {
    expect(backoffSeconds(1)).toBe(BASE_BACKOFF_SECONDS);
    expect(backoffSeconds(2)).toBe(BASE_BACKOFF_SECONDS * 2);
    expect(backoffSeconds(3)).toBe(BASE_BACKOFF_SECONDS * 4);
  });

  it('never exceeds the cap, so an outage is not made worse', () => {
    expect(backoffSeconds(20)).toBe(MAX_BACKOFF_SECONDS);
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    'rejects an invalid attempt count (%s)',
    (attempts) => {
      expect(() => backoffSeconds(attempts)).toThrow(/positive integer/u);
    }
  );
});

describe('fullJitterBackoffMilliseconds', () => {
  it('maps an injected sample across the current exponential cap', () => {
    expect(fullJitterBackoffMilliseconds(1, 0)).toBe(1);
    expect(fullJitterBackoffMilliseconds(1, 0.5)).toBe(
      (BASE_BACKOFF_SECONDS * 1000) / 2
    );
    expect(fullJitterBackoffMilliseconds(1, 1)).toBe(
      BASE_BACKOFF_SECONDS * 1000
    );
    expect(fullJitterBackoffMilliseconds(20, 1)).toBe(
      MAX_BACKOFF_SECONDS * 1000
    );
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid random sample (%s)',
    (sample) => {
      expect(() => fullJitterBackoffMilliseconds(1, sample)).toThrow(
        /between 0 and 1/u
      );
    }
  );
});

describe('isDue', () => {
  it('is due when no attempt has been scheduled yet', () => {
    expect(isDue(job, NOW)).toBe(true);
  });

  it('is not due before its scheduled retry', () => {
    expect(
      isDue({ ...job, nextAttemptAt: '2026-07-21T09:30:00.000Z' }, NOW)
    ).toBe(false);
  });

  it('is due once the scheduled retry has passed', () => {
    expect(
      isDue({ ...job, nextAttemptAt: '2026-07-21T08:30:00.000Z' }, NOW)
    ).toBe(true);
  });

  it('ignores finished work', () => {
    expect(isDue({ ...job, status: 'completed' }, NOW)).toBe(false);
    expect(isDue({ ...job, status: 'dead_letter' }, NOW)).toBe(false);
  });
});

describe('planOutboxAttempt', () => {
  it('completes on success', () => {
    const decision = planOutboxAttempt(job, { kind: 'succeeded' }, NOW);
    expect(decision).toMatchObject({
      status: 'completed',
      attempts: 1,
      needsOperator: false
    });
  });

  it('schedules a backed-off retry on a retryable failure', () => {
    const decision = planOutboxAttempt(
      job,
      { kind: 'failed', reason: 'timeout', retryable: true },
      NOW
    );
    expect(decision.status).toBe('pending');
    expect(decision.attempts).toBe(1);
    expect(decision.lastError).toBe('timeout');
    expect(decision.needsOperator).toBe(false);
    expect(Date.parse(decision.nextAttemptAt!) - Date.parse(NOW)).toBe(
      BASE_BACKOFF_SECONDS * 1000
    );
  });

  it('dead-letters a non-retryable failure immediately', () => {
    const decision = planOutboxAttempt(
      job,
      { kind: 'failed', reason: 'invalid request', retryable: false },
      NOW
    );
    expect(decision).toMatchObject({
      status: 'dead_letter',
      attempts: 1,
      needsOperator: true
    });
    expect(decision.nextAttemptAt).toBeUndefined();
  });

  it('dead-letters once the attempt ceiling is reached', () => {
    const exhausted = { ...job, attempts: MAX_ATTEMPTS - 1 };
    const decision = planOutboxAttempt(
      exhausted,
      { kind: 'failed', reason: '503', retryable: true },
      NOW
    );
    expect(decision.status).toBe('dead_letter');
    expect(decision.attempts).toBe(MAX_ATTEMPTS);
    expect(decision.needsOperator).toBe(true);
  });

  it('keeps retrying right up to the ceiling', () => {
    const almost = { ...job, attempts: MAX_ATTEMPTS - 2 };
    expect(
      planOutboxAttempt(
        almost,
        { kind: 'failed', reason: '503', retryable: true },
        NOW
      ).status
    ).toBe('pending');
  });

  it('refuses to reattempt finished work', () => {
    for (const status of ['completed', 'dead_letter'] as const) {
      expect(() =>
        planOutboxAttempt({ ...job, status }, { kind: 'succeeded' }, NOW)
      ).toThrow(/cannot be attempted again/i);
    }
  });
});
