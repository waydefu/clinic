import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import {
  HealthResponseSchema,
  OperationalHealthResponseSchema
} from '@beauessence/contracts';
import { HealthController } from '../../health.controller.js';
import { ApiExceptionFilter } from '../errors/api-exception.filter.js';
import { OPERATIONAL_HEALTH_PROBE } from '../runtime/operational-health.js';

const healthy = {
  status: 'healthy',
  liveness: 'alive',
  readiness: 'ready',
  checks: [{ id: 'synthetic', status: 'ok' }],
  firingAlerts: []
};
const evaluation = vi.hoisted((): { value: Record<string, unknown> } => ({
  value: {}
}));
type DomainModule = typeof import('@beauessence/domain');
vi.mock('@beauessence/domain', async (importOriginal) => {
  const actual = await importOriginal<DomainModule>();
  return {
    ...actual,
    evaluateOperationalHealth: () => evaluation.value
  };
});
let app: NestFastifyApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});
async function inject(url: string) {
  if (app === undefined) {
    @Module({
      controllers: [HealthController],
      providers: [
        {
          provide: OPERATIONAL_HEALTH_PROBE,
          useValue: { snapshot: () => ({}) }
        },
        { provide: APP_FILTER, useClass: ApiExceptionFilter }
      ]
    })
    class Harness {}
    app = await NestFactory.create<NestFastifyApplication>(
      Harness,
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    app.setGlobalPrefix('v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }
  return app.inject({ method: 'GET', url });
}

describe('declared health response admission', () => {
  it.each(['/v1/health', '/v1/health/live', '/v1/health/ready'])(
    'preserves %s contract',
    async (url) => {
      evaluation.value = healthy;
      const response = await inject(url);
      expect(response.statusCode).toBe(200);
      expect(HealthResponseSchema.safeParse(response.json()).success).toBe(
        true
      );
    }
  );
  it('preserves the full operational health contract', async () => {
    evaluation.value = healthy;
    const response = await inject('/v1/health/operational');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ service: 'api', ...healthy });
    expect(
      OperationalHealthResponseSchema.safeParse(response.json()).success
    ).toBe(true);
  });
  it.each(['status', 'nested-extra'])(
    'rejects malformed %s application output without leaking payload',
    async (kind) => {
      evaluation.value =
        kind === 'status'
          ? { ...healthy, status: 'SYNTHETIC_PRIVATE_CANARY' }
          : {
              ...healthy,
              checks: [
                {
                  id: 'synthetic',
                  status: 'ok',
                  private: 'SYNTHETIC_PRIVATE_CANARY'
                }
              ]
            };
      const response = await inject('/v1/health/operational');
      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        error: { code: 'INTERNAL_ERROR' }
      });
      expect(response.payload).not.toContain('SYNTHETIC_PRIVATE_CANARY');
      expect(response.payload).not.toContain('issues');
    }
  );
  it('keeps readiness refusal as 503 before response admission', async () => {
    evaluation.value = {
      ...healthy,
      status: 'unhealthy',
      readiness: 'not_ready'
    };
    const response = await inject('/v1/health/ready');
    expect(response.statusCode).toBe(503);
  });
});
