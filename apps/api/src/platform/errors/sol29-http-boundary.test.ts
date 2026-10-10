import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import { DomainError, OPERATIONAL_ROLES } from '@beauessence/domain';
import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  AppointmentController
} from '../../appointments/appointment.controller.js';
import { AppModule } from '../../app.module.js';
import { CalendarPilotModule } from '../../calendar/calendar-pilot.module.js';
import { CalendarPilotController } from '../../calendar/calendar-pilot.controller.js';
import { CalendarPilotSessionGuard } from '../../auth/calendar-pilot.guard.js';
import {
  CALENDAR_PILOT_APPLICATION,
  CALENDAR_PILOT_SESSIONS
} from '../../calendar/calendar-pilot.tokens.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS
} from '../../internal-test-booking/internal-test-booking.tokens.js';
import { WP_B2_RATE_LIMITER } from '../runtime/wp-b2-rate-limiter.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

let app: NestFastifyApplication | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
});
const get = vi.fn(async (id: string) => {
  if (id === 'opaque_domain')
    return Promise.reject(
      new DomainError('INVALID_VALUE', 'opaque_private_message')
    );
  if (id === 'opaque_unexpected')
    return Promise.reject(new Error('opaque_private_message'));
  return Promise.resolve({ appointmentId: id });
});
const authenticate = vi.fn(async () =>
  Promise.resolve({
    actorId: 'anonymous',
    actorRole: OPERATIONAL_ROLES[4]
  })
);
const limit = vi.fn(async () => Promise.resolve(undefined));

async function boot() {
  vi.stubEnv('CALENDAR_PILOT_ENABLED', 'true');
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'beauessence-clinic-stg-c1a01');
  @Module({
    controllers: [AppointmentController, CalendarPilotController],
    providers: [
      { provide: APPOINTMENT_APPLICATION, useValue: { get } },
      { provide: APPOINTMENT_AUTHENTICATOR, useValue: { authenticate } },
      {
        provide: INTERNAL_TEST_BOOKING_CLOCK,
        useValue: { nowUtc: () => '2026-10-01T00:00:00.000Z' }
      },
      {
        provide: INTERNAL_TEST_BOOKING_SETTINGS,
        useValue: {
          enabled: true,
          expiresAtUtc: '2026-10-02T00:00:00.000Z',
          projectId: 'beauessence-clinic-stg-c1a01',
          emulatorHost: undefined
        }
      },
      { provide: WP_B2_RATE_LIMITER, useValue: { assertRequest: limit } },
      {
        provide: CALENDAR_PILOT_APPLICATION,
        useValue: { sourcePreflight: get }
      },
      {
        provide: CALENDAR_PILOT_SESSIONS,
        useValue: {
          authenticate: async () =>
            Promise.resolve({
              actorId: 'opaque_staff',
              actorRole: OPERATIONAL_ROLES[0]
            })
        }
      },
      {
        provide: CalendarPilotSessionGuard,
        useValue: { canActivate: () => true }
      },
      { provide: APP_FILTER, useClass: ApiExceptionFilter }
    ]
  })
  class Harness {}
  app = await NestFactory.create<NestFastifyApplication>(
    Harness,
    new FastifyAdapter({ logger: false }),
    { logger: false, abortOnError: false }
  );
  app.setGlobalPrefix('v1');
  await app.init();
  return app;
}

describe('SOL29 opaque route wire boundary and root filter ownership', () => {
  it('owns exactly one global filter at the root independent of Calendar', () => {
    const providers: Array<{ provide?: unknown }> = Reflect.getMetadata(
      'providers',
      AppModule
    );
    const feature: Array<{ provide?: unknown }> = Reflect.getMetadata(
      'providers',
      CalendarPilotModule
    );
    expect(
      providers.filter((provider) => provider.provide === APP_FILTER)
    ).toHaveLength(1);
    expect(
      feature.filter((provider) => provider.provide === APP_FILTER)
    ).toHaveLength(0);
  });
  it('maps malformed booking IDs to a safe 400 after auth and quota', async () => {
    const server = await boot();
    get.mockClear();
    authenticate.mockClear();
    limit.mockClear();
    const response = await server.inject({
      method: 'GET',
      url: '/v1/bookings/opaque%24bad'
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
    expect(response.body).not.toContain('opaque$bad');
    expect(get).not.toHaveBeenCalled();
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
  });
  it('retains valid IDs, typed errors and unexpected 500 without private message', async () => {
    const server = await boot();
    expect((await server.inject('/v1/bookings/opaque_valid')).statusCode).toBe(
      200
    );
    expect((await server.inject('/v1/bookings/opaque_domain')).statusCode).toBe(
      400
    );
    const unexpected = await server.inject('/v1/bookings/opaque_unexpected');
    expect(unexpected.statusCode).toBe(500);
    expect(unexpected.body).not.toContain('opaque_private_message');
  });
  it('maps malformed Calendar path IDs to a safe 400 without application mutation', async () => {
    const server = await boot();
    get.mockClear();
    const response = await server.inject({
      url: '/v1/calendar/sources/preflights/opaque%24bad',
      headers: { cookie: '__session=opaque_cookie' }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
    expect(response.body).not.toContain('opaque$bad');
    expect(get).not.toHaveBeenCalled();
    expect(
      (
        await server.inject({
          url: '/v1/calendar/sources/preflights/opaque_valid',
          headers: { cookie: '__session=opaque_cookie' }
        })
      ).statusCode
    ).toBe(200);
  });
});
