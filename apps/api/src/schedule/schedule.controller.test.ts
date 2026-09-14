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
import type { CandidateRole } from '../platform/authorization/rbac.js';
import { createScheduleAuthorizationPolicy } from '../platform/authorization/rbac-appointment-policy.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import {
  APPOINTMENT_AUTHENTICATOR,
  type AppointmentAuthenticator,
  type AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import { ScheduleApplicationService } from './schedule.application-service.js';
import {
  SCHEDULE_APPLICATION,
  ScheduleController
} from './schedule.controller.js';
import type { ScheduleRepositoryPort } from './schedule.repository-port.js';

const PUBLISH_BODY = {
  idempotencyKey: 'schedule_publish_0001',
  expectedVersion: 0,
  schedule: {
    timeZone: 'Asia/Taipei',
    weeklyAvailability: [
      {
        weekday: 3,
        intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
      }
    ],
    dateExceptions: []
  }
} as const;

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

const harnessRepository: ScheduleRepositoryPort = {
  publish: () =>
    Promise.resolve({
      publishedVersion: 1,
      publishedAt: '2029-12-15T09:00:00.000Z',
      slotCount: 4,
      replayed: false
    }),
  readPublished: () =>
    Promise.resolve({
      publishedVersion: 0,
      publishedAt: null,
      schedule: null
    }),
  listOccupiedSlots: () => Promise.resolve([])
};

@Module({
  controllers: [ScheduleController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APPOINTMENT_AUTHENTICATOR, useValue: harnessAuthenticator },
    {
      provide: SCHEDULE_APPLICATION,
      useFactory: () =>
        new ScheduleApplicationService(
          harnessRepository,
          createScheduleAuthorizationPolicy(resolveRole),
          { nowUtc: () => '2029-12-15T09:00:00.000Z' },
          { next: () => 'corr_schedule_harness_001' }
        )
    }
  ]
})
class ScheduleRbacHarnessModule {}

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

describe('ScheduleController RBAC harness', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function startHarness(): Promise<NestFastifyApplication> {
    const instance = await NestFactory.create<NestFastifyApplication>(
      ScheduleRbacHarnessModule,
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    app = instance;
    return instance;
  }

  it('rejects anonymous slot list with 401', async () => {
    const harness = await startHarness();
    const response = await harness.inject({ method: 'GET', url: '/v1/slots' });
    expect(response.statusCode).toBe(401);
  });

  it('lets a patient list slots and refuses a physician', async () => {
    const harness = await startHarness();
    const patient = await harness.inject({
      method: 'GET',
      url: '/v1/slots?kind=initial',
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    const physician = await harness.inject({
      method: 'GET',
      url: '/v1/slots',
      headers: actorHeaders('physician')
    });
    expect(patient.statusCode).toBe(200);
    expect(JSON.parse(patient.payload)).toEqual({ slots: [] });
    expect(physician.statusCode).toBe(403);
  });

  it('lets a manager publish and refuses a patient publish', async () => {
    const harness = await startHarness();
    const manager = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: actorHeaders('manager'),
      payload: PUBLISH_BODY
    });
    const patient = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' }),
      payload: PUBLISH_BODY
    });
    const frontDesk = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: actorHeaders('front_desk'),
      payload: PUBLISH_BODY
    });
    expect(manager.statusCode).toBe(201);
    expect(JSON.parse(manager.payload)).toEqual({
      publishedVersion: 1,
      publishedAt: '2029-12-15T09:00:00.000Z',
      slotCount: 4
    });
    expect(patient.statusCode).toBe(403);
    expect(frontDesk.statusCode).toBe(403);
  });
});
