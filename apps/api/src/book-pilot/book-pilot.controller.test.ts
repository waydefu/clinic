import 'reflect-metadata';

import { afterEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import { AppointmentApplicationService } from '../appointments/appointment.application-service.js';
import type {
  AppointmentAuthenticator,
  AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import type { AppointmentAuthorizationPolicy } from '../appointments/appointment.policy.js';
import type { AppointmentRepositoryPort } from '../appointments/appointment.repository-port.js';
import { createApplication } from '../main.js';
import type { CandidateRole } from '../platform/authorization/rbac.js';
import { createRbacAppointmentPolicy } from '../platform/authorization/rbac-appointment-policy.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import { BookPilotController } from './book-pilot.controller.js';
import type { BookPilotSettings } from './book-pilot.gate.js';
import {
  BOOK_PILOT_APPLICATION,
  BOOK_PILOT_AUTHENTICATOR,
  BOOK_PILOT_AUTHORIZATION,
  BOOK_PILOT_CLOCK,
  BOOK_PILOT_SETTINGS
} from './book-pilot.tokens.js';

const CREATE_BODY = {
  idempotencyKey: 'booking_request_0001',
  slotId: 'slot_001',
  serviceId: 'service_consult',
  bookingKind: 'initial'
} as const;

const RESCHEDULE_BODY = {
  idempotencyKey: 'reschedule_request_0001',
  targetSlotId: 'slot_002'
} as const;

const OPEN_SETTINGS: BookPilotSettings = {
  enabled: true,
  expiresAtUtc: '2026-12-01T00:00:00.000Z'
};

const OPEN_NOW = '2026-09-09T00:00:00.000Z';

function header(
  request: AuthenticatableRequest,
  name: string
): string | undefined {
  const value = request.headers[name];
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

const harnessAuthenticator: AppointmentAuthenticator = {
  authenticate(request) {
    const actorId = header(request, 'x-test-actor-id');
    if (actorId === undefined) {
      return Promise.reject(new AuthenticationRequiredError());
    }
    if (header(request, 'x-test-account') === 'suspended') {
      return Promise.reject(new AuthenticationRequiredError());
    }
    const actorRole = header(request, 'x-test-role') ?? 'unknown';
    const verifiedPatientId = header(request, 'x-test-patient-id');
    const context: AuthenticationContext = {
      actorId,
      actorRole,
      ...(verifiedPatientId === undefined ? {} : { verifiedPatientId })
    };
    return Promise.resolve(context);
  }
};

function resolveRole(context: AuthenticationContext): CandidateRole {
  return context.actorRole as CandidateRole;
}

let ownerPatientId: string | undefined = 'patient_001';

const harnessRepository: AppointmentRepositoryPort = {
  reserve: () =>
    Promise.resolve({
      appointmentId: 'appointment_harness_001',
      replayed: false
    }),
  reschedule: () =>
    Promise.resolve({
      appointmentId: 'appointment_harness_001',
      replayed: false
    }),
  patientIdOf: () => Promise.resolve(ownerPatientId)
};

function actorHeaders(
  role: CandidateRole,
  extras: Record<string, string> = {}
): Record<string, string> {
  return {
    'x-test-actor-id': `actor_${role}_001`,
    'x-test-role': role,
    ...extras
  };
}

function harnessModule(
  settings: BookPilotSettings,
  nowUtc: string
): new () => unknown {
  @Module({
    controllers: [BookPilotController],
    providers: [
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: BOOK_PILOT_AUTHENTICATOR, useValue: harnessAuthenticator },
      {
        provide: BOOK_PILOT_AUTHORIZATION,
        useValue: createRbacAppointmentPolicy(resolveRole)
      },
      {
        provide: BOOK_PILOT_APPLICATION,
        useFactory: (authorization: AppointmentAuthorizationPolicy) =>
          new AppointmentApplicationService(
            harnessRepository,
            authorization,
            { next: () => 'appointment_harness_001' },
            { nowUtc: () => nowUtc },
            { next: () => 'corr_harness_001' }
          ),
        inject: [BOOK_PILOT_AUTHORIZATION]
      },
      { provide: BOOK_PILOT_SETTINGS, useValue: settings },
      { provide: BOOK_PILOT_CLOCK, useValue: { nowUtc: () => nowUtc } }
    ]
  })
  class BookPilotRbacHarnessModule {}
  return BookPilotRbacHarnessModule;
}

describe('isolated BookPilotController harness', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    ownerPatientId = 'patient_001';
  });

  async function startHarness(
    settings: BookPilotSettings = OPEN_SETTINGS,
    nowUtc = OPEN_NOW
  ): Promise<NestFastifyApplication> {
    const instance = await NestFactory.create<NestFastifyApplication>(
      harnessModule(settings, nowUtc),
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    app = instance;
    return instance;
  }

  it('rejects an anonymous create with 401 while the gate is open', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/book-pilot/bookings',
      payload: CREATE_BODY
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a physician reschedule with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/book-pilot/bookings/appointment_harness_001/reschedule',
      payload: RESCHEDULE_BODY,
      headers: actorHeaders('physician')
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a manager reschedule with 2xx while the gate is open', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/book-pilot/bookings/appointment_harness_001/reschedule',
      payload: RESCHEDULE_BODY,
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.json()).toEqual({
      appointmentId: 'appointment_harness_001',
      replayed: false
    });
  });

  it('refuses a manager create with 503 when the kill switch is off', async () => {
    const harness = await startHarness({
      enabled: false,
      expiresAtUtc: OPEN_SETTINGS.expiresAtUtc
    });
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/book-pilot/bookings',
      payload: CREATE_BODY,
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBe(503);
  });

  it('refuses a manager create with 503 after UTC expiry', async () => {
    const harness = await startHarness(
      OPEN_SETTINGS,
      '2026-12-01T00:00:00.000Z'
    );
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/book-pilot/bookings',
      payload: CREATE_BODY,
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBe(503);
  });
});

describe('production AppModule book-pilot write path', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('keeps POST /v1/bookings unrouted', async () => {
    app = await createApplication();
    await app.init();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: CREATE_BODY
    });
    expect(response.statusCode).toBe(404);
  });

  it('keeps POST /v1/book-pilot/bookings unrouted', async () => {
    app = await createApplication();
    await app.init();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/book-pilot/bookings',
      payload: CREATE_BODY
    });
    expect(response.statusCode).toBe(404);
  });
});
