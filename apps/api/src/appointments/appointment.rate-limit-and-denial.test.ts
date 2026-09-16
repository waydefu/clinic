import 'reflect-metadata';

import { afterEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import { IDENTIFIED_WRITE_LIMIT } from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type { CandidateRole } from '../platform/authorization/rbac.js';
import { createRbacAppointmentPolicy } from '../platform/authorization/rbac-appointment-policy.js';
import {
  AuthenticationRequiredError,
  DisabledAccountError
} from '../platform/errors/api-error.js';
import {
  ApiExceptionFilter,
  DENIED_AUDIT_APPEND_HEADER
} from '../platform/errors/api-exception.filter.js';
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
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS
} from '../internal-test-booking/internal-test-booking.tokens.js';
import { InMemoryDeniedAccessAuditSink } from '../platform/authorization/denied-access-audit.port.js';
import { DENIED_AUTHORIZATION_AUDIT } from '../platform/authorization/denied-access-audit.port.js';
import type { DeniedAuthorizationAuditPort } from '../platform/authorization/denied-access-audit.port.js';
import { InMemoryDurableRateLimitStore } from '../platform/runtime/durable-rate-limit-store.js';
import {
  WP_B2_RATE_LIMITER,
  WpB2RateLimiter
} from '../platform/runtime/wp-b2-rate-limiter.js';

const OPEN_INTERNAL_TEST_SETTINGS = {
  enabled: true,
  expiresAtUtc: '2029-12-01T00:00:00.000Z',
  projectId: 'beauessence-clinic-stg-c1a01',
  emulatorHost: '127.0.0.1:8080'
};

const CREATE_BODY = {
  idempotencyKey: 'booking_request_0001',
  slotId: 'slot_001',
  serviceId: 'service_consult',
  bookingKind: 'initial' as const,
  onBehalfPatientId: 'patient_001'
};

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
      return Promise.reject(new DisabledAccountError());
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
  transition: () =>
    Promise.resolve({
      appointmentId: 'appointment_harness_001',
      replayed: false,
      status: 'arrived'
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
    Promise.resolve({
      appointmentId: 'appointment_harness_001',
      patientId: 'patient_001',
      slotId: 'slot_001',
      bookingKind: 'initial',
      status: 'confirmed',
      startsAt: '2026-07-25T04:00:00.000Z'
    }),
  patientIdOf: () => Promise.resolve('patient_001')
};

function createHarnessModule(
  limiter: WpB2RateLimiter,
  denials: DeniedAuthorizationAuditPort
) {
  @Module({
    controllers: [AppointmentController],
    providers: [
      {
        provide: APP_FILTER,
        useFactory: (sink: DeniedAuthorizationAuditPort) =>
          new ApiExceptionFilter(sink),
        inject: [DENIED_AUTHORIZATION_AUDIT]
      },
      { provide: DENIED_AUTHORIZATION_AUDIT, useValue: denials },
      { provide: WP_B2_RATE_LIMITER, useValue: limiter },
      { provide: APPOINTMENT_AUTHENTICATOR, useValue: harnessAuthenticator },
      {
        provide: APPOINTMENT_AUTHORIZATION,
        useValue: createRbacAppointmentPolicy(
          (context) => context.actorRole as CandidateRole
        )
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
      },
      {
        provide: INTERNAL_TEST_BOOKING_SETTINGS,
        useValue: OPEN_INTERNAL_TEST_SETTINGS
      },
      {
        provide: INTERNAL_TEST_BOOKING_CLOCK,
        useValue: { nowUtc: () => '2026-07-23T14:30:00.000Z' }
      }
    ]
  })
  class Harness {}
  return Harness;
}

describe('WP-B2 limiter and durable denial audit', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(
    limiter: WpB2RateLimiter,
    denials: DeniedAuthorizationAuditPort
  ): Promise<NestFastifyApplication> {
    const instance = await NestFactory.create<NestFastifyApplication>(
      createHarnessModule(limiter, denials),
      new FastifyAdapter({ logger: false, trustProxy: 1 }),
      { logger: false }
    );
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    app = instance;
    return instance;
  }

  it('keeps identified writers on separate counters', async () => {
    const denials = new InMemoryDeniedAccessAuditSink();
    const limiter = new WpB2RateLimiter(new InMemoryDurableRateLimitStore(), {
      now: () => 1_000
    });
    const harness = await start(limiter, denials);
    const limitedActor = {
      'x-test-actor-id': 'staff_front_001',
      'x-test-role': 'front_desk'
    };
    for (let i = 0; i < IDENTIFIED_WRITE_LIMIT; i += 1) {
      const ok = await harness.inject({
        method: 'POST',
        url: '/v1/bookings',
        headers: limitedActor,
        payload: { ...CREATE_BODY, idempotencyKey: `booking_request_${i}` }
      });
      expect(ok.statusCode).toBeLessThan(300);
    }
    const limited = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: limitedActor,
      payload: { ...CREATE_BODY, idempotencyKey: 'booking_request_over' }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toEqual(
      expect.stringMatching(/^\d+$/)
    );
    const other = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: {
        'x-test-actor-id': 'staff_front_002',
        'x-test-role': 'front_desk'
      },
      payload: { ...CREATE_BODY, idempotencyKey: 'booking_request_other' }
    });
    expect(other.statusCode).toBeLessThan(300);
    expect(denials.list()).toHaveLength(0);
  });

  it('writes one durable denial for authentication and authorization failures without secrets', async () => {
    const denials = new InMemoryDeniedAccessAuditSink();
    const limiter = new WpB2RateLimiter(new InMemoryDurableRateLimitStore(), {
      now: () => 1_000
    });
    const harness = await start(limiter, denials);
    const missing = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: CREATE_BODY
    });
    expect(missing.statusCode).toBe(401);
    const denied = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: {
        'x-test-actor-id': 'patient_other',
        'x-test-role': 'patient',
        'x-test-patient-id': 'patient_other'
      },
      payload: CREATE_BODY
    });
    expect(denied.statusCode).toBe(403);
    const serialized = JSON.stringify(denials.list());
    expect(serialized).not.toMatch(/password|token|totp|0912|1990-05-20/i);
    expect(denials.list()).toHaveLength(2);
    const disabled = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: {
        'x-test-actor-id': 'staff_disabled',
        'x-test-role': 'front_desk',
        'x-test-account': 'suspended'
      },
      payload: CREATE_BODY
    });
    expect(disabled.statusCode).toBe(401);
    expect(denials.list()).toHaveLength(3);
    expect(
      denials
        .list()
        .some((event) => event.reasonCategory === 'account_disabled')
    ).toBe(true);
    expect(denials.list().every((event) => event.outcome === 'denied')).toBe(
      true
    );
    expect(denied.headers[DENIED_AUDIT_APPEND_HEADER]).toBe('recorded');
    expect(missing.headers[DENIED_AUDIT_APPEND_HEADER]).toBe('recorded');
  });

  it('keeps 403 when the durable sink is unavailable', async () => {
    const denials: DeniedAuthorizationAuditPort = {
      record: () => Promise.reject(new Error('storage unavailable'))
    };
    const limiter = new WpB2RateLimiter(new InMemoryDurableRateLimitStore(), {
      now: () => 1_000
    });
    const harness = await start(limiter, denials);
    const denied = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: {
        'x-test-actor-id': 'patient_other',
        'x-test-role': 'patient',
        'x-test-patient-id': 'patient_other',
        'x-event-id': 'client_supplied_event'
      },
      payload: CREATE_BODY
    });
    expect(denied.statusCode).toBe(403);
    expect(JSON.parse(denied.body)).toMatchObject({
      error: { code: 'AUTHORIZATION_DENIED' }
    });
    expect(denied.headers[DENIED_AUDIT_APPEND_HEADER]).toBe('failed');
    expect(denied.body).not.toMatch(
      /storage unavailable|client_supplied_event/i
    );
  });
});
