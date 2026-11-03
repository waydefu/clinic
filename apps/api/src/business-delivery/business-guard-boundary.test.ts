import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import { OPERATIONAL_ROLES } from '@beauessence/domain';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CalendarPilotSessionGuard } from '../auth/calendar-pilot.guard.js';
import { CALENDAR_PILOT_SESSIONS } from '../calendar/calendar-pilot.tokens.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import { BusinessDeliveryController } from './business-delivery.controller.js';
import { BusinessExportController } from './business-export.controller.js';
import { BusinessRetentionController } from './business-retention.controller.js';
import { BusinessTerminationController } from './business-termination.controller.js';
import {
  BUSINESS_DELIVERY_APPLICATION,
  BUSINESS_EXPORT_APPLICATION,
  BUSINESS_RETENTION_APPLICATION,
  BUSINESS_TERMINATION_APPLICATION
} from './business-delivery.tokens.js';

const actor = { actorId: 'opaque_staff', actorRole: OPERATIONAL_ROLES[0] };
const authenticate = vi.fn(async () => ({
  ...actor,
  sessionId: 'opaque_session'
}));
const assertCsrf = vi.fn(async () => {});
const action = vi.fn(async (..._args: unknown[]) => ({ ok: true }));

@Module({
  controllers: [
    BusinessDeliveryController,
    BusinessExportController,
    BusinessRetentionController,
    BusinessTerminationController
  ],
  providers: [
    CalendarPilotSessionGuard,
    {
      provide: CALENDAR_PILOT_SESSIONS,
      useValue: { authenticate, assertCsrf }
    },
    {
      provide: BUSINESS_DELIVERY_APPLICATION,
      useValue: { milestones: action, acknowledge: action }
    },
    { provide: BUSINESS_EXPORT_APPLICATION, useValue: { get: action } },
    {
      provide: BUSINESS_RETENTION_APPLICATION,
      useValue: { identityCandidates: action }
    },
    { provide: BUSINESS_TERMINATION_APPLICATION, useValue: { get: action } },
    { provide: APP_FILTER, useClass: ApiExceptionFilter }
  ]
})
class Harness {}

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    Harness,
    new FastifyAdapter({ logger: false }),
    { logger: false, abortOnError: false }
  );
  app.setGlobalPrefix('v1');
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

const headers = { cookie: '__session=synthetic-session' };

describe('business routes require an authenticated session', () => {
  it.each([
    '/v1/business-delivery/milestones',
    '/v1/business-delivery/exports/synthetic',
    '/v1/business-delivery/retention/identity-candidates',
    '/v1/business-delivery/terminations/synthetic'
  ])(
    'passes the verified actor to %s and rejects a failed session',
    async (url: string) => {
      action.mockClear();
      authenticate.mockClear();
      const allowed = await app.inject({ method: 'GET', url, headers });
      expect(allowed.statusCode).toBe(200);
      expect(authenticate).toHaveBeenCalledWith('synthetic-session');
      expect(action).toHaveBeenCalledOnce();
      expect(action.mock.calls[0]).toContainEqual(actor);

      action.mockClear();
      authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
      const denied = await app.inject({ method: 'GET', url, headers });
      expect(denied.statusCode).toBe(401);
      expect(action).not.toHaveBeenCalled();
    }
  );

  it('requires CSRF before a business write reaches its service', async () => {
    const url = '/v1/business-delivery/milestones/synthetic/acknowledgements';
    action.mockClear();
    const denied = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: {}
    });
    expect(denied.statusCode).toBe(401);
    expect(action).not.toHaveBeenCalled();

    const allowed = await app.inject({
      method: 'POST',
      url,
      headers: { ...headers, 'x-csrf-token': 'synthetic-csrf' },
      payload: {}
    });
    expect(allowed.statusCode).toBe(201);
    expect(assertCsrf).toHaveBeenCalledWith('opaque_session', 'synthetic-csrf');
    expect(action.mock.calls[0]).toContainEqual(actor);

    action.mockClear();
    assertCsrf.mockRejectedValueOnce(new AuthenticationRequiredError());
    const invalid = await app.inject({
      method: 'POST',
      url,
      headers: { ...headers, 'x-csrf-token': 'invalid-csrf' },
      payload: {}
    });
    expect(invalid.statusCode).toBe(401);
    expect(assertCsrf).toHaveBeenCalledWith('opaque_session', 'invalid-csrf');
    expect(action).not.toHaveBeenCalled();
  });
});
