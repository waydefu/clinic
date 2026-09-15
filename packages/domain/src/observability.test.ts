import { describe, expect, it } from 'vitest';

import { MAX_ATTEMPTS } from './outbox.js';
import {
  AUTH_SPIKE_ALERT_THRESHOLD,
  AUTHZ_SPIKE_ALERT_THRESHOLD,
  BOOKING_WRITE_FAILURE_ALERT_THRESHOLD,
  CANDIDATE_BACKLOG_ALERT_THRESHOLD,
  FORBIDDEN_LOG_KEYS,
  FORBIDDEN_METRIC_LABELS,
  HTTP_5XX_ALERT_THRESHOLD,
  HUMAN_NOTIFICATION_PATH,
  HUMAN_NOTIFICATION_PATH_STATUS,
  INTERNAL_PREPRODUCTION_COMPLETE,
  MAX_CANDIDATE_BACKLOG,
  MAX_STRUCTURED_LOGS_PER_MINUTE,
  OUTBOX_AGE_ALERT_SECONDS,
  PRODUCTION_CALENDAR_INBOUND,
  PUBLIC_PRODUCTION_LAUNCH,
  WP_B4_IMMEDIATE_ALERTS,
  assertSafeMetricLabels,
  candidateBacklogExceeded,
  evaluateAlertThreshold,
  evaluateFailClosedApiSurface,
  evaluateOperationalHealth,
  evaluatePublicBookingGateOpen,
  firingImmediateAlerts,
  renderWeekdayOperationalSummary,
  sanitizeStructuredLog
} from './observability.js';

const HEALTHY_INPUT = {
  processAlive: true,
  firestore: 'ok' as const,
  calendarAdapter: 'ok' as const,
  requiredConfigPresent: true,
  bookingGateEnabled: true,
  outboxDeadLetterCount: 0,
  outboxOldestAgeSeconds: 0,
  candidateBacklog: 0,
  calendarSyncStale: false,
  calendarGoneRecoveryNeeded: false,
  backupFailed: false,
  iamAlertIntegrated: true,
  workerDegraded: false
};

describe('WP-B4 alert catalog', () => {
  it('covers every signed immediate class with owner thresholds or stricter', () => {
    const ids = WP_B4_IMMEDIATE_ALERTS.map((policy) => policy.id);
    expect(ids).toEqual([
      'api_outage_or_5xx_burst',
      'durable_booking_write_failure',
      'persistent_firestore_transaction_failure',
      'backup_failure',
      'outbox_dead_letter',
      'excessive_outbox_age',
      'iam_setiampolicy',
      'auth_failure_spike',
      'authz_denial_spike'
    ]);
    expect(HTTP_5XX_ALERT_THRESHOLD).toBe(3);
    expect(BOOKING_WRITE_FAILURE_ALERT_THRESHOLD).toBe(3);
    expect(AUTH_SPIKE_ALERT_THRESHOLD).toBe(10);
    expect(AUTHZ_SPIKE_ALERT_THRESHOLD).toBe(10);
    expect(OUTBOX_AGE_ALERT_SECONDS).toBe(60);
    for (const policy of WP_B4_IMMEDIATE_ALERTS) {
      expect(policy.notificationPath).toEqual([
        'alert_policy',
        'notification_channel',
        'human_email'
      ]);
      expect(policy.windowMs).toBe(5 * 60 * 1000);
    }
  });

  it('fires 5xx, booking, auth, authz, dead-letter and outbox-age thresholds', () => {
    const fiveXx = WP_B4_IMMEDIATE_ALERTS.find(
      (policy) => policy.id === 'api_outage_or_5xx_burst'
    );
    const booking = WP_B4_IMMEDIATE_ALERTS.find(
      (policy) => policy.id === 'durable_booking_write_failure'
    );
    const auth = WP_B4_IMMEDIATE_ALERTS.find(
      (policy) => policy.id === 'auth_failure_spike'
    );
    const authz = WP_B4_IMMEDIATE_ALERTS.find(
      (policy) => policy.id === 'authz_denial_spike'
    );
    const deadLetter = WP_B4_IMMEDIATE_ALERTS.find(
      (policy) => policy.id === 'outbox_dead_letter'
    );
    const age = WP_B4_IMMEDIATE_ALERTS.find(
      (policy) => policy.id === 'excessive_outbox_age'
    );
    expect(fiveXx && evaluateAlertThreshold(fiveXx, 3)).toBe(true);
    expect(fiveXx && evaluateAlertThreshold(fiveXx, 2)).toBe(false);
    expect(booking && evaluateAlertThreshold(booking, 3)).toBe(true);
    expect(auth && evaluateAlertThreshold(auth, 10)).toBe(true);
    expect(authz && evaluateAlertThreshold(authz, 9)).toBe(false);
    expect(deadLetter && evaluateAlertThreshold(deadLetter, 1)).toBe(true);
    expect(age && evaluateAlertThreshold(age, 60)).toBe(true);
  });

  it('keeps the human path implemented but not proven', () => {
    expect(HUMAN_NOTIFICATION_PATH.status).toBe(HUMAN_NOTIFICATION_PATH_STATUS);
    expect(HUMAN_NOTIFICATION_PATH.proven).toBe(false);
    expect(HUMAN_NOTIFICATION_PATH.recipientSource).toContain('never_in_repo');
  });
});

describe('evaluateOperationalHealth', () => {
  it('reports healthy when process, config and probes are ok', () => {
    const result = evaluateOperationalHealth(HEALTHY_INPUT);
    expect(result.status).toBe('healthy');
    expect(result.liveness).toBe('alive');
    expect(result.readiness).toBe('ready');
  });

  it('keeps readiness ready for non-fatal backlog and Calendar unavailability', () => {
    const deadLetter = evaluateOperationalHealth({
      ...HEALTHY_INPUT,
      outboxDeadLetterCount: 1
    });
    expect(deadLetter.status).toBe('degraded');
    expect(deadLetter.readiness).toBe('ready');
    expect(deadLetter.firingAlerts).toContain('outbox_dead_letter');

    const calendar = evaluateOperationalHealth({
      ...HEALTHY_INPUT,
      calendarAdapter: 'unavailable',
      calendarSyncStale: true
    });
    expect(calendar.status).toBe('degraded');
    expect(calendar.readiness).toBe('ready');

    const gate = evaluateOperationalHealth({
      ...HEALTHY_INPUT,
      bookingGateEnabled: false
    });
    expect(gate.status).toBe('healthy');
    expect(gate.checks.find((item) => item.id === 'booking_gate')?.status).toBe(
      'disabled'
    );
  });

  it('marks DB unavailable and missing config as not ready and unhealthy', () => {
    const db = evaluateOperationalHealth({
      ...HEALTHY_INPUT,
      firestore: 'unavailable'
    });
    expect(db.status).toBe('unhealthy');
    expect(db.readiness).toBe('not_ready');

    const config = evaluateOperationalHealth({
      ...HEALTHY_INPUT,
      requiredConfigPresent: false
    });
    expect(config.status).toBe('unhealthy');
    expect(config.readiness).toBe('not_ready');
  });

  it('does not treat not_probed Firestore as unreadiness', () => {
    const result = evaluateOperationalHealth({
      ...HEALTHY_INPUT,
      firestore: 'not_probed',
      calendarAdapter: 'not_probed'
    });
    expect(result.readiness).toBe('ready');
    expect(result.status).toBe('healthy');
  });
});

describe('fail-closed completeness', () => {
  it('accepts 503 and rejects 404 as API-not-mounted', () => {
    expect(
      evaluateFailClosedApiSurface({
        method: 'POST',
        path: '/v1/bookings',
        status: 503
      })
    ).toMatchObject({ ok: true, reason: 'fail-closed' });
    expect(
      evaluateFailClosedApiSurface({
        method: 'POST',
        path: '/v1/bookings',
        status: 404
      }).ok
    ).toBe(false);
    expect(
      evaluateFailClosedApiSurface({
        method: 'POST',
        path: '/v1/bookings',
        status: 404
      }).reason
    ).toMatch(/api-not-mounted/);
    expect(
      evaluateFailClosedApiSurface({
        method: 'GET',
        path: '/v1/slots',
        status: 401
      }).ok
    ).toBe(true);
  });

  it('requires accountless create when the public booking gate is open', () => {
    expect(
      evaluatePublicBookingGateOpen({
        method: 'POST',
        path: '/v1/bookings',
        status: 201
      }).ok
    ).toBe(true);
    expect(
      evaluatePublicBookingGateOpen({
        method: 'POST',
        path: '/v1/bookings',
        status: 401
      }).ok
    ).toBe(false);
    expect(
      evaluatePublicBookingGateOpen({
        method: 'POST',
        path: '/v1/bookings',
        status: 404
      }).ok
    ).toBe(false);
  });
});

describe('structured logs and metric labels', () => {
  it('rejects phone, DOB, token and cookie fields', () => {
    expect(() =>
      sanitizeStructuredLog({
        timestamp: '2026-09-15T00:00:00.000Z',
        environment: 'internal_test',
        service: 'api',
        correlationId: 'corr_001',
        operation: 'POST_v1_bookings',
        result: 'error',
        errorCode: 'SERVICE_UNAVAILABLE',
        durationMs: 12,
        retryState: 'none',
        phone: '0912345678'
      } as never)
    ).toThrow(/phone/);
    expect(() => assertSafeMetricLabels({ sessionId: 'abc' })).toThrow();
    expect(() =>
      assertSafeMetricLabels({ routeFamily: 'public_booking' })
    ).not.toThrow();
    for (const key of ['phone', 'dob', 'token', 'cookie']) {
      expect(FORBIDDEN_LOG_KEYS).toContain(key);
    }
    expect(FORBIDDEN_METRIC_LABELS).toContain('sessionId');
  });

  it('keeps a stable error code and opaque correlation id', () => {
    const log = sanitizeStructuredLog({
      timestamp: '2026-09-15T00:00:00.000Z',
      environment: 'internal_test',
      service: 'api',
      correlationId: 'corr_req_0001',
      operation: 'POST_v1_bookings',
      result: 'error',
      errorCode: 'RATE_LIMITED',
      durationMs: 8,
      retryState: 'none'
    });
    expect(log.errorCode).toBe('RATE_LIMITED');
    expect(log.correlationId).toBe('corr_req_0001');
  });
});

describe('weekday summary and cost guards', () => {
  it('renders a PII-free weekday payload without claiming email delivery', () => {
    const summary = renderWeekdayOperationalSummary({
      environment: 'internal_test',
      generatedAt: '2026-09-15T00:00:00.000Z',
      rateLimited: 2,
      authDenials: 1,
      authzDenials: 0,
      retries: 4,
      recoveries: 1,
      outboxBacklog: 0,
      calendarCandidateBacklog: 3,
      apiP95Ms: 120,
      resourceCostSignal: 'budget_pubsub_only'
    });
    expect(summary.synthetic).toBe(true);
    expect(JSON.stringify(summary)).not.toMatch(/09\d{8}/);
    expect(summary.kind).toBe('weekday_operational_summary');
  });

  it('caps candidate backlog and keeps outbox max attempts', () => {
    expect(candidateBacklogExceeded(MAX_CANDIDATE_BACKLOG)).toBe(true);
    expect(
      candidateBacklogExceeded(CANDIDATE_BACKLOG_ALERT_THRESHOLD - 1)
    ).toBe(false);
    expect(MAX_ATTEMPTS).toBe(6);
    expect(MAX_STRUCTURED_LOGS_PER_MINUTE).toBeGreaterThan(0);
  });
});

describe('stage verdict constants', () => {
  it('does not claim internal-preproduction complete or production Calendar inbound', () => {
    expect(INTERNAL_PREPRODUCTION_COMPLETE).toBe('FAIL');
    expect(PUBLIC_PRODUCTION_LAUNCH).toBe('DEFERRED');
    expect(PRODUCTION_CALENDAR_INBOUND).toBe('GO_LIVE_DEFERRED');
  });
});

describe('synthetic alert routing', () => {
  it('routes generated signals through the catalog without proving human delivery', () => {
    const firing = firingImmediateAlerts(HEALTHY_INPUT, {
      http5xx: 3,
      bookingWriteFailure: 3,
      bookingTransactionFailure: 0,
      authFailure: 10,
      authzDenial: 10,
      returnLookupRateLimited: 0,
      deadLetter: 0,
      outboxOldestAgeSeconds: 0,
      backupFailure: 0,
      iamSetIamPolicy: 0
    });
    expect(firing).toEqual(
      expect.arrayContaining([
        'api_outage_or_5xx_burst',
        'durable_booking_write_failure',
        'auth_failure_spike',
        'authz_denial_spike'
      ])
    );
    expect(HUMAN_NOTIFICATION_PATH.proven).toBe(false);
  });
});
