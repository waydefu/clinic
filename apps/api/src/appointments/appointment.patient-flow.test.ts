import 'reflect-metadata';

import { afterEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';
import {
  LOOKUP_FAILURE_THRESHOLD,
  RATE_LIMIT_POLICIES
} from '@beauessence/domain';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type { CandidateRole } from '../platform/authorization/rbac.js';
import { createRbacAppointmentPolicy } from '../platform/authorization/rbac-appointment-policy.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
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
import type {
  AppointmentRecord,
  AppointmentRepositoryPort
} from './appointment.repository-port.js';
import { ReturnLookupController } from '../internal-test-booking/return-lookup.controller.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS
} from '../internal-test-booking/internal-test-booking.tokens.js';
import { InMemoryDeniedAccessAuditSink } from '../platform/authorization/denied-access-audit.port.js';
import { DENIED_AUTHORIZATION_AUDIT } from '../platform/authorization/denied-access-audit.port.js';
import { InMemoryDurableRateLimitStore } from '../platform/runtime/durable-rate-limit-store.js';
import {
  WP_B2_RATE_LIMITER,
  WpB2RateLimiter
} from '../platform/runtime/wp-b2-rate-limiter.js';
import { InMemoryPatientDirectory } from '../patients/patient-directory.js';
import { DomainError } from '@beauessence/domain';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';

const OPEN_INTERNAL_TEST_SETTINGS = {
  enabled: true,
  expiresAtUtc: '2029-12-01T00:00:00.000Z',
  projectId: 'beauessence-clinic-stg-c1a01',
  emulatorHost: '127.0.0.1:8080'
};

const INTAKE = {
  name: '合成患者甲',
  phone: '0912000001',
  birthDate: '1990-01-15',
  nationalId: 'A123456789',
  privacyConsent: true as const
};

function header(
  request: AuthenticatableRequest,
  name: string
): string | undefined {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

describe('accountless booking and return lookup HTTP', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(options?: {
    patients?: InMemoryPatientDirectory;
    limiter?: WpB2RateLimiter;
  }): Promise<{
    harness: NestFastifyApplication;
    patients: InMemoryPatientDirectory;
  }> {
    const patients = options?.patients ?? new InMemoryPatientDirectory();
    const denials = new InMemoryDeniedAccessAuditSink();
    const limiter =
      options?.limiter ??
      new WpB2RateLimiter(new InMemoryDurableRateLimitStore(), {
        now: () => 1_000
      });
    const occupied = new Set<string>();
    const records = new Map<string, AppointmentRecord>();
    let n = 0;
    const repository: AppointmentRepositoryPort = {
      reserve: (request) => {
        if (occupied.has(request.slotId)) {
          return Promise.reject(
            new DomainError('SLOT_UNAVAILABLE', 'The slot is taken.')
          );
        }
        occupied.add(request.slotId);
        const record: AppointmentRecord = {
          appointmentId: request.appointmentId,
          patientId: request.patientId,
          slotId: request.slotId,
          bookingKind: request.bookingKind,
          status: 'confirmed',
          startsAt: '2026-07-25T04:00:00.000Z'
        };
        records.set(record.appointmentId, record);
        patients.appointments.push(record);
        return Promise.resolve({
          appointmentId: record.appointmentId,
          replayed: false,
          startsAt: record.startsAt
        });
      },
      reschedule: () =>
        Promise.resolve({
          appointmentId: 'appointment_unused',
          replayed: false,
          startsAt: '2026-07-25T04:30:00.000Z'
        }),
      transition: () =>
        Promise.resolve({
          appointmentId: 'appointment_unused',
          replayed: false,
          status: 'arrived'
        }),
      recordFollowUp: () =>
        Promise.resolve({
          appointmentId: 'appointment_unused',
          replayed: false,
          decision: 'required' as const,
          dueAt: '2030-01-02T04:15:00.000Z'
        }),
      deleteAppointment: () =>
        Promise.resolve({
          appointmentId: 'appointment_unused',
          replayed: false,
          auditEventId: 'audit_unused'
        }),
      read: (appointmentId) => Promise.resolve(records.get(appointmentId)),
      patientIdOf: (appointmentId) =>
        Promise.resolve(records.get(appointmentId)?.patientId)
    };
    const authenticator: AppointmentAuthenticator = {
      async authenticate(request) {
        const session = header(request, 'x-return-session');
        if (session !== undefined) {
          const patientId = await patients.readReturnSession(
            session,
            '2026-07-23T14:30:00.000Z'
          );
          if (patientId === undefined) throw new AuthenticationRequiredError();
          return {
            actorId: patientId,
            actorRole: 'patient',
            verifiedPatientId: patientId
          };
        }
        const actorId = header(request, 'x-test-actor-id');
        if (actorId === undefined) {
          return { actorId: 'anonymous', actorRole: 'patient' };
        }
        const actorRole = header(request, 'x-test-role') ?? 'front_desk';
        const verifiedPatientId = header(request, 'x-test-patient-id');
        const context: AuthenticationContext = {
          actorId,
          actorRole,
          ...(verifiedPatientId === undefined ? {} : { verifiedPatientId })
        };
        return context;
      }
    };

    @Module({
      controllers: [AppointmentController, ReturnLookupController],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: DENIED_AUTHORIZATION_AUDIT, useValue: denials },
        { provide: WP_B2_RATE_LIMITER, useValue: limiter },
        { provide: APPOINTMENT_AUTHENTICATOR, useValue: authenticator },
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
              repository,
              authorization,
              { next: () => `opaque_${++n}` },
              { nowUtc: () => '2026-07-23T14:30:00.000Z' },
              { next: () => 'corr_harness_001' },
              patients
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

    const instance = await NestFactory.create<NestFastifyApplication>(
      Harness,
      new FastifyAdapter({ logger: false, trustProxy: 1 }),
      { logger: false }
    );
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    app = instance;
    return { harness: instance, patients };
  }

  it('creates an accountless booking and reads it back from the server list', async () => {
    const { harness } = await start();
    const created = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: {
        idempotencyKey: 'booking_request_0001',
        slotId: 'slot_001',
        serviceId: 'service_consult',
        bookingKind: 'initial',
        intake: INTAKE
      }
    });
    expect(created.statusCode).toBeLessThan(300);
    const body = JSON.parse(created.body) as { appointmentId: string };
    const listed = await harness.inject({
      method: 'GET',
      url: '/v1/bookings?scope=clinic',
      headers: {
        'x-test-actor-id': 'staff_front_001',
        'x-test-role': 'front_desk'
      }
    });
    expect(listed.statusCode).toBe(200);
    expect(JSON.parse(listed.body)).toMatchObject({
      appointments: [
        {
          appointmentId: body.appointmentId,
          status: 'confirmed',
          slotId: 'slot_001'
        }
      ]
    });
  });

  it('rejects a schema-invalid create and a slot conflict', async () => {
    const { harness } = await start();
    const invalid = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: {
        idempotencyKey: 'booking_request_0001',
        slotId: 'slot_001',
        serviceId: 'service_consult',
        bookingKind: 'initial',
        patient: { name: 'must-not-be-accepted' }
      }
    });
    expect(invalid.statusCode).toBe(400);
    const first = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: {
        idempotencyKey: 'booking_request_0001',
        slotId: 'slot_001',
        serviceId: 'service_consult',
        bookingKind: 'initial',
        intake: INTAKE
      }
    });
    expect(first.statusCode).toBeLessThan(300);
    const conflict = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: {
        idempotencyKey: 'booking_request_0002',
        slotId: 'slot_001',
        serviceId: 'service_consult',
        bookingKind: 'initial',
        intake: { ...INTAKE, phone: '0912000002', nationalId: 'A123456780' }
      }
    });
    expect(conflict.statusCode).toBe(409);
  });

  it('rate-limits repeated invalid return lookups without enumerating', async () => {
    const shared = new Map();
    const store = new InMemoryDurableRateLimitStore(shared);
    const limiter = new WpB2RateLimiter(store, { now: () => 1_000 });
    const { harness } = await start({ limiter });
    for (let i = 0; i < LOOKUP_FAILURE_THRESHOLD; i += 1) {
      const miss = await harness.inject({
        method: 'POST',
        url: '/v1/return-lookup',
        payload: { phone: '0912000001', birthDate: '1990-01-15' }
      });
      expect(miss.statusCode).toBe(404);
      expect(miss.body).not.toMatch(/0912|1990-01-15|exists/i);
    }
    const locked = await harness.inject({
      method: 'POST',
      url: '/v1/return-lookup',
      payload: { phone: '0912000001', birthDate: '1990-01-15' }
    });
    expect(locked.statusCode).toBe(429);
    expect(locked.headers['retry-after']).toEqual(
      expect.stringMatching(/^\d+$/)
    );
    expect(shared.size).toBeGreaterThan(0);
    const persisted = [...shared.values()].find(
      (record) => record.lockedUntilMs !== null
    );
    expect(persisted?.lockedUntilMs).toBeGreaterThan(1_000);
    const lockedEntry = [...shared.entries()].find(
      ([, record]) => record.lockedUntilMs !== null
    );
    expect(lockedEntry).toBeDefined();
    const restarted = new InMemoryDurableRateLimitStore(shared);
    await expect(
      restarted.consume(
        lockedEntry?.[0] ?? '',
        RATE_LIMIT_POLICIES.lookup_or_auth_failure,
        1_000
      )
    ).resolves.toMatchObject({ allowed: false });
  });
});
