import { afterEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import type { OperationalHealthInput } from '@beauessence/domain';

import { HealthController } from './health.controller.js';
import { createApplication } from './main.js';
import { ApiExceptionFilter } from './platform/errors/api-exception.filter.js';
import {
  OPERATIONAL_HEALTH_PROBE,
  StaticOperationalHealthProbe
} from './platform/runtime/operational-health.js';

const BASE: OperationalHealthInput = {
  processAlive: true,
  firestore: 'ok',
  calendarAdapter: 'ok',
  requiredConfigPresent: true,
  bookingGateEnabled: false,
  outboxDeadLetterCount: 0,
  outboxOldestAgeSeconds: 0,
  candidateBacklog: 0,
  calendarSyncStale: false,
  calendarGoneRecoveryNeeded: false,
  backupFailed: false,
  iamAlertIntegrated: true,
  workerDegraded: false
};

async function boot(
  input: OperationalHealthInput
): Promise<NestFastifyApplication> {
  @Module({
    controllers: [HealthController],
    providers: [
      {
        provide: OPERATIONAL_HEALTH_PROBE,
        useValue: new StaticOperationalHealthProbe(input)
      },
      { provide: APP_FILTER, useClass: ApiExceptionFilter }
    ]
  })
  class HealthTestModule {}

  const app = await NestFactory.create<NestFastifyApplication>(
    HealthTestModule,
    new FastifyAdapter({ logger: false }),
    { logger: false }
  );
  app.setGlobalPrefix('v1');
  await app.init();
  return app;
}

describe('GET /v1/health', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns the versioned API health contract', async () => {
    app = await createApplication();
    await app.init();

    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: 'api', status: 'ok' });
  });

  it('refuses POST /v1/bookings while the IP-001 internal-test gate is closed', async () => {
    app = await createApplication();
    await app.init();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/bookings'
    });

    expect(response.statusCode).toBe(503);
  });
});

describe('liveness, readiness and operational health', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('keeps live 200 and ready 200 when only dead-letter is present', async () => {
    app = await boot({ ...BASE, outboxDeadLetterCount: 1 });
    const live = await app.inject({ method: 'GET', url: '/v1/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/v1/health/ready' });
    const operational = await app.inject({
      method: 'GET',
      url: '/v1/health/operational'
    });
    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(operational.statusCode).toBe(200);
    expect(operational.json()).toMatchObject({
      service: 'api',
      status: 'degraded',
      liveness: 'alive',
      readiness: 'ready'
    });
    expect(operational.json().firingAlerts).toContain('outbox_dead_letter');
  });

  it('returns 503 on ready when Firestore is unavailable', async () => {
    app = await boot({ ...BASE, firestore: 'unavailable' });
    const live = await app.inject({ method: 'GET', url: '/v1/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/v1/health/ready' });
    const operational = await app.inject({
      method: 'GET',
      url: '/v1/health/operational'
    });
    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
    expect(operational.statusCode).toBe(200);
    expect(operational.json().status).toBe('unhealthy');
  });

  it('degrades on Calendar unavailability, stale sync and missing IAM integration', async () => {
    app = await boot({
      ...BASE,
      calendarAdapter: 'unavailable',
      calendarSyncStale: true,
      calendarGoneRecoveryNeeded: true,
      iamAlertIntegrated: false,
      workerDegraded: true
    });
    const ready = await app.inject({ method: 'GET', url: '/v1/health/ready' });
    const operational = await app.inject({
      method: 'GET',
      url: '/v1/health/operational'
    });
    expect(ready.statusCode).toBe(200);
    expect(operational.json().status).toBe('degraded');
  });

  it('returns 503 on ready when required config is missing', async () => {
    app = await boot({ ...BASE, requiredConfigPresent: false });
    const ready = await app.inject({ method: 'GET', url: '/v1/health/ready' });
    expect(ready.statusCode).toBe(503);
  });

  it('reports a disabled booking gate without failing readiness', async () => {
    app = await boot({ ...BASE, bookingGateEnabled: false });
    const ready = await app.inject({ method: 'GET', url: '/v1/health/ready' });
    const operational = await app.inject({
      method: 'GET',
      url: '/v1/health/operational'
    });
    expect(ready.statusCode).toBe(200);
    expect(operational.json().status).toBe('healthy');
    expect(
      operational
        .json()
        .checks.find((check: { id: string }) => check.id === 'booking_gate')
        ?.status
    ).toBe('disabled');
  });
});
