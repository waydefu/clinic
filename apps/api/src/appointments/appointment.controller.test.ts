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
      replayed: false,
      startsAt: '2026-07-25T04:00:00.000Z'
    }),
  reschedule: () =>
    Promise.resolve({
      appointmentId: 'appointment_harness_001',
      replayed: false,
      startsAt: '2026-07-25T04:30:00.000Z'
    }),
  transition: (request) =>
    Promise.resolve({
      appointmentId: 'appointment_harness_001',
      replayed: false,
      status:
        request.transition === 'complete'
          ? 'completed'
          : request.transition === 'no_show'
            ? 'no_show'
            : 'cancelled'
    }),
  recordFollowUp: () =>
    Promise.resolve({
      appointmentId: 'appointment_harness_001',
      replayed: false,
      decision: 'required' as const,
      dueAt: '2030-01-02T04:15:00.000Z'
    }),
  deleteAppointment: () =>
    Promise.resolve({
      appointmentId: 'appointment_harness_001',
      replayed: false,
      auditEventId: 'audit_appointment_harness_001_deleted_key'
    }),
  read: () =>
    Promise.resolve(
      ownerPatientId === undefined
        ? undefined
        : {
            appointmentId: 'appointment_harness_001',
            patientId: ownerPatientId,
            slotId: 'slot_001',
            bookingKind: 'initial',
            status: 'confirmed',
            startsAt: '2026-07-25T04:00:00.000Z'
          }
    ),
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

  it('rejects a staff create that names no on-behalf patient with 401', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: CREATE_BODY,
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBe(401);
  });

  it('lets a manager create on behalf of an opaque patient id', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: {
        ...CREATE_BODY,
        onBehalfPatientId: 'patient_opaque_002'
      },
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.json()).toEqual({
      appointmentId: 'appointment_harness_001',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z',
      endsAt: '2026-07-25T04:30:00.000Z'
    });
  });

  it('rejects a patient creating on behalf of another patient with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: {
        ...CREATE_BODY,
        onBehalfPatientId: 'patient_opaque_002'
      },
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    expect(response.statusCode).toBe(403);
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
      payload: {
        idempotencyKey: 'delete_request_0001',
        reasonCode: 'created_in_error'
      },
      headers: actorHeaders('front_desk')
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a manager delete with 2xx', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/delete',
      payload: {
        idempotencyKey: 'delete_request_0001',
        reasonCode: 'created_in_error'
      },
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.json()).toEqual({
      appointmentId: 'appointment_harness_001',
      deleted: true,
      auditEventId: 'audit_appointment_harness_001_deleted_key'
    });
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
      status: 'confirmed',
      startsAt: '2026-07-25T04:30:00.000Z',
      endsAt: '2026-07-25T05:00:00.000Z'
    });
  });

  it('rejects a patient querying another patient resource with 403', async () => {
    ownerPatientId = 'patient_002';
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'GET',
      url: '/v1/bookings/appointment_harness_001',
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a manager query with 2xx', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'GET',
      url: '/v1/bookings/appointment_harness_001',
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.json()).toEqual({
      appointmentId: 'appointment_harness_001',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z',
      endsAt: '2026-07-25T04:30:00.000Z'
    });
  });

  it('rejects a physician cancel with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/cancel',
      payload: { idempotencyKey: 'cancel_request_0001' },
      headers: actorHeaders('physician')
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a manager cancel with 2xx', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/cancel',
      payload: { idempotencyKey: 'cancel_request_0001' },
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.json()).toEqual({
      appointmentId: 'appointment_harness_001',
      status: 'cancelled'
    });
  });

  it('rejects a patient complete with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/complete',
      payload: { idempotencyKey: 'complete_request_0001' },
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a physician complete with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/complete',
      payload: { idempotencyKey: 'complete_request_0001' },
      headers: actorHeaders('physician')
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets front desk complete with 2xx', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/complete',
      payload: { idempotencyKey: 'complete_request_0001' },
      headers: actorHeaders('front_desk')
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.json()).toEqual({
      appointmentId: 'appointment_harness_001',
      status: 'completed'
    });
  });

  it('lets a manager record no-show with 2xx', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/no-show',
      payload: { idempotencyKey: 'no_show_request_0001' },
      headers: actorHeaders('manager')
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.json()).toEqual({
      appointmentId: 'appointment_harness_001',
      status: 'no_show'
    });
  });

  it('rejects a patient follow-up with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/follow-up',
      payload: {
        idempotencyKey: 'follow_up_request_0001',
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      },
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a physician follow-up with 403', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/follow-up',
      payload: {
        idempotencyKey: 'follow_up_request_0001',
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      },
      headers: actorHeaders('physician')
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets front desk record follow-up with 2xx', async () => {
    const harness = await startHarness();
    const response = await harness.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/follow-up',
      payload: {
        idempotencyKey: 'follow_up_request_0001',
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      },
      headers: actorHeaders('front_desk')
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(response.statusCode).toBeLessThan(300);
    expect(response.json()).toEqual({
      appointmentId: 'appointment_harness_001',
      decision: 'required',
      dueAt: '2030-01-02T04:15:00.000Z'
    });
  });
});

describe('production AppModule booking write path', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('refuses POST /v1/bookings while the IP-001 internal-test gate is closed', async () => {
    app = await createApplication();
    await app.init();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: CREATE_BODY
    });
    expect(response.statusCode).toBe(503);
  });

  it('refuses GET and cancel while the IP-001 internal-test gate is closed', async () => {
    app = await createApplication();
    await app.init();
    const getResponse = await app.inject({
      method: 'GET',
      url: '/v1/bookings/appointment_harness_001'
    });
    const cancelResponse = await app.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/cancel',
      payload: { idempotencyKey: 'cancel_request_0001' }
    });
    expect(getResponse.statusCode).toBe(503);
    expect(cancelResponse.statusCode).toBe(503);
  });

  it('refuses reschedule while the IP-001 internal-test gate is closed', async () => {
    app = await createApplication();
    await app.init();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/reschedule',
      payload: RESCHEDULE_BODY
    });
    expect(response.statusCode).toBe(503);
  });

  it('refuses complete, no-show and delete while the IP-001 internal-test gate is closed', async () => {
    app = await createApplication();
    await app.init();
    const completeResponse = await app.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/complete',
      payload: { idempotencyKey: 'complete_request_0001' }
    });
    const noShowResponse = await app.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/no-show',
      payload: { idempotencyKey: 'no_show_request_0001' }
    });
    const deleteResponse = await app.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/delete',
      payload: {
        idempotencyKey: 'delete_request_0001',
        reasonCode: 'created_in_error'
      }
    });
    expect(completeResponse.statusCode).toBe(503);
    expect(noShowResponse.statusCode).toBe(503);
    expect(deleteResponse.statusCode).toBe(503);
  });

  it('refuses follow-up while the IP-001 internal-test gate is closed', async () => {
    app = await createApplication();
    await app.init();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/bookings/appointment_harness_001/follow-up',
      payload: {
        idempotencyKey: 'follow_up_request_0001',
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      }
    });
    expect(response.statusCode).toBe(503);
  });

  it('refuses schedule publish and slot list while the gate is closed', async () => {
    app = await createApplication();
    await app.init();
    const slots = await app.inject({ method: 'GET', url: '/v1/slots' });
    const schedule = await app.inject({ method: 'GET', url: '/v1/schedule' });
    const publish = await app.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      payload: {
        idempotencyKey: 'schedule_publish_0001',
        expectedVersion: 0,
        schedule: {
          timeZone: 'Asia/Taipei',
          weeklyAvailability: [],
          dateExceptions: []
        }
      }
    });
    expect(slots.statusCode).toBe(503);
    expect(schedule.statusCode).toBe(503);
    expect(publish.statusCode).toBe(503);
  });

  it('opens the isolated-test gate to authentication, not a write', async () => {
    const previous = {
      enabled: process.env['INTERNAL_TEST_BOOKING_ENABLED'],
      expires: process.env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'],
      project: process.env['GOOGLE_CLOUD_PROJECT'],
      emulator: process.env['FIRESTORE_EMULATOR_HOST']
    };
    process.env['INTERNAL_TEST_BOOKING_ENABLED'] = 'true';
    process.env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'] =
      '2099-01-01T00:00:00.000Z';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'beauessence-clinic-stg-c1a01';
    delete process.env['FIRESTORE_EMULATOR_HOST'];
    try {
      app = await createApplication();
      await app.init();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/bookings',
        payload: CREATE_BODY
      });
      expect(response.statusCode).toBe(401);
      const complete = await app.inject({
        method: 'POST',
        url: '/v1/bookings/appointment_harness_001/complete',
        payload: { idempotencyKey: 'complete_request_0001' }
      });
      expect(complete.statusCode).toBe(401);
      const slots = await app.inject({ method: 'GET', url: '/v1/slots' });
      expect(slots.statusCode).toBe(401);
    } finally {
      restoreInternalTestEnv(previous);
    }
  });

  it('keeps forbidden staging closed even when the kill switch is on', async () => {
    const previous = {
      enabled: process.env['INTERNAL_TEST_BOOKING_ENABLED'],
      expires: process.env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'],
      project: process.env['GOOGLE_CLOUD_PROJECT'],
      emulator: process.env['FIRESTORE_EMULATOR_HOST']
    };
    process.env['INTERNAL_TEST_BOOKING_ENABLED'] = 'true';
    process.env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'] =
      '2099-01-01T00:00:00.000Z';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'beauessence-clinic-staging';
    delete process.env['FIRESTORE_EMULATOR_HOST'];
    try {
      app = await createApplication();
      await app.init();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/bookings',
        payload: CREATE_BODY
      });
      expect(response.statusCode).toBe(503);
    } finally {
      restoreInternalTestEnv(previous);
    }
  });
});

function restoreInternalTestEnv(previous: {
  readonly enabled: string | undefined;
  readonly expires: string | undefined;
  readonly project: string | undefined;
  readonly emulator: string | undefined;
}): void {
  restoreEnv('INTERNAL_TEST_BOOKING_ENABLED', previous.enabled);
  restoreEnv('INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC', previous.expires);
  restoreEnv('GOOGLE_CLOUD_PROJECT', previous.project);
  restoreEnv('FIRESTORE_EMULATOR_HOST', previous.emulator);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
