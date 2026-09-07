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
import { createRbacAppointmentPolicy } from '../platform/authorization/rbac-appointment-policy.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import { createApplication } from '../main.js';
import { AppointmentApplicationService } from './appointment.application-service.js';
import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  APPOINTMENT_AUTHORIZATION,
  AppointmentController,
  type AppointmentAuthenticator,
  type AuthenticatableRequest
} from './appointment.controller.js';
import type { AppointmentAuthorizationPolicy } from './appointment.policy.js';
import type { AppointmentRepositoryPort } from './appointment.repository-port.js';

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

@Module({
  controllers: [AppointmentController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APPOINTMENT_AUTHENTICATOR, useValue: harnessAuthenticator },
    {
      provide: APPOINTMENT_AUTHORIZATION,
      useValue: createRbacAppointmentPolicy(resolveRole)
    },
    {
      provide: APPOINTMENT_APPLICATION,
      useFactory: (authorization: AppointmentAuthorizationPolicy) =>
        new AppointmentApplicationService(
          harnessRepository,
          authorization,
          { next: () => 'appointment_harness_001' },
          { nowUtc: () => '2026-07-23T14:30:00.000Z' },
          { next: () => 'corr_harness_001' }
        ),
      inject: [APPOINTMENT_AUTHORIZATION]
    }
  ]
})
class AppointmentRbacHarnessModule {}

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

describe('unrouted AppointmentController RBAC harness', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    ownerPatientId = 'patient_001';
  });

  async function startHarness(): Promise<NestFastifyApplication> {
    const instance = await NestFactory.create<NestFastifyApplication>(
      AppointmentRbacHarnessModule,
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    app = instance;
    return instance;
  }

  it('rejects an anonymous create with 401', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: CREATE_BODY
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a suspended account with 401', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: CREATE_BODY,
      headers: actorHeaders('front_desk', { 'x-test-account': 'suspended' })
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a patient rescheduling another patient resource with 403', async () => {
    ownerPatientId = 'patient_002';
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/reschedule',
      payload: RESCHEDULE_BODY,
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a physician reschedule with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/reschedule',
      payload: RESCHEDULE_BODY,
      headers: actorHeaders('physician')
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a front-desk deletion with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/delete',
      headers: actorHeaders('front_desk')
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a manager reschedule with 2xx', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/reschedule',
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
});

describe('production AppModule booking write path', () => {
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
});
