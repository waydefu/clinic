import { describe, expect, it } from 'vitest';
import {
  HTTP_5XX_ALERT_THRESHOLD,
  type OperationalHealthInput
} from '@beauessence/domain';

import { InMemoryApiMetrics, httpMetricFromRequest } from './api-metrics.js';

const HEALTH: OperationalHealthInput = {
  processAlive: true,
  firestore: 'ok',
  calendarAdapter: 'ok',
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

describe('InMemoryApiMetrics', () => {
  it('fires the 5xx threshold without using PII labels', () => {
    const metrics = new InMemoryApiMetrics(() => 1_000);
    for (let i = 0; i < HTTP_5XX_ALERT_THRESHOLD; i += 1) {
      metrics.recordHttp(
        httpMetricFromRequest({
          method: 'GET',
          path: '/v1/slots',
          status: 500,
          errorCode: 'INTERNAL_ERROR'
        })
      );
    }
    expect(metrics.counts().http5xx).toBe(3);
    expect(metrics.firingAlerts(HEALTH)).toContain('api_outage_or_5xx_burst');
  });

  it('counts booking write 5xx, auth, authz and dead-letter separately', () => {
    const metrics = new InMemoryApiMetrics(() => 1_000);
    metrics.recordHttp(
      httpMetricFromRequest({
        method: 'POST',
        path: '/v1/bookings',
        status: 500,
        errorCode: 'INTERNAL_ERROR'
      })
    );
    metrics.recordHttp(
      httpMetricFromRequest({
        method: 'POST',
        path: '/v1/bookings',
        status: 500,
        errorCode: 'INTERNAL_ERROR'
      })
    );
    metrics.recordHttp(
      httpMetricFromRequest({
        method: 'POST',
        path: '/v1/bookings',
        status: 500,
        errorCode: 'INTERNAL_ERROR'
      })
    );
    for (let i = 0; i < 10; i += 1) {
      metrics.recordHttp(
        httpMetricFromRequest({
          method: 'GET',
          path: '/v1/calendar-session/client-config',
          status: 401,
          errorCode: 'AUTHENTICATION_REQUIRED'
        })
      );
      metrics.recordHttp(
        httpMetricFromRequest({
          method: 'POST',
          path: '/v1/bookings/appointment_1/complete',
          status: 403,
          errorCode: 'AUTHORIZATION_DENIED'
        })
      );
    }
    expect(metrics.counts().bookingWriteFailure).toBe(3);
    expect(metrics.counts().authFailure).toBe(10);
    expect(metrics.counts().authzDenial).toBe(10);
    const alerts = metrics.firingAlerts({
      ...HEALTH,
      outboxDeadLetterCount: 1
    });
    expect(alerts).toEqual(
      expect.arrayContaining([
        'durable_booking_write_failure',
        'auth_failure_spike',
        'authz_denial_spike',
        'outbox_dead_letter'
      ])
    );
  });

  it('does not treat gate-closed 503 as a 5xx burst', () => {
    const metrics = new InMemoryApiMetrics(() => 1_000);
    for (let i = 0; i < 5; i += 1) {
      metrics.recordHttp(
        httpMetricFromRequest({
          method: 'POST',
          path: '/v1/bookings',
          status: 503,
          errorCode: 'SERVICE_UNAVAILABLE'
        })
      );
    }
    expect(metrics.counts().http5xx).toBe(0);
    expect(metrics.firingAlerts(HEALTH)).not.toContain(
      'api_outage_or_5xx_burst'
    );
  });
});
