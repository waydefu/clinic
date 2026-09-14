import 'reflect-metadata';

import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import {
  APPOINTMENT_APPLICATION,
  APPOINTMENT_AUTHENTICATOR,
  APPOINTMENT_AUTHORIZATION,
  AppointmentController,
  type AppointmentAuthenticator,
  type AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import { AppointmentApplicationService } from '../appointments/appointment.application-service.js';
import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../firestore/booking.repository.js';
import { FirestoreScheduleRepository } from '../firestore/schedule.repository.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import type { CandidateRole } from '../platform/authorization/rbac.js';
import {
  createRbacAppointmentPolicy,
  createScheduleAuthorizationPolicy
} from '../platform/authorization/rbac-appointment-policy.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../../../packages/config/src/index.js';
import { ScheduleApplicationService } from './schedule.application-service.js';
import {
  SCHEDULE_APPLICATION,
  ScheduleController
} from './schedule.controller.js';
import {
  INTERNAL_TEST_BOOKING_CLOCK,
  INTERNAL_TEST_BOOKING_SETTINGS
} from '../internal-test-booking/internal-test-booking.tokens.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const projectId = LOCAL_FIREBASE_PROJECT_ID;
const NOW = '2029-12-15T09:00:00.000Z';
const AFTER_SELF_CANCEL_CUTOFF = '2030-01-02T02:30:00.000Z';
const SLOT_ID = 'slot_20300102_1200';
const TARGET_SLOT_ID = 'slot_20300102_1230';
const APPOINTMENT_ID = 'appointment_http_occupancy_001';

const PUBLISH_BODY = {
  idempotencyKey: 'schedule_publish_0003',
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

const CREATE_BODY = {
  idempotencyKey: 'booking_http_occupancy_0001',
  slotId: SLOT_ID,
  serviceId: 'service_consult',
  bookingKind: 'initial'
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

function actorHeaders(
  role: CandidateRole,
  extras: Record<string, string> = {}
): Record<string, string> {
  return {
    'x-test-actor-id': `actor_${role}_occupancy_001`,
    'x-test-role': role,
    ...extras
  };
}

/**
 * Nest HTTP occupancy against the Firestore emulator. Lives under `apps/api`
 * so `@nestjs/*` and `reflect-metadata` resolve; `*.emulator.test.ts` is
 * excluded from `test:unit` and collected by `test:rules`. The IP-001 gate
 * is injected open with a fixed clock so missing settings cannot fail-open.
 */
function occupancyHarnessModule(
  db: Firestore,
  clock: { nowUtc: () => string }
) {
  @Module({
    controllers: [AppointmentController, ScheduleController],
    providers: [
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: APPOINTMENT_AUTHENTICATOR, useValue: harnessAuthenticator },
      {
        provide: APPOINTMENT_AUTHORIZATION,
        useValue: createRbacAppointmentPolicy(resolveRole)
      },
      {
        provide: APPOINTMENT_APPLICATION,
        inject: [APPOINTMENT_AUTHORIZATION],
        useFactory: (
          authorization: ReturnType<typeof createRbacAppointmentPolicy>
        ) =>
          new AppointmentApplicationService(
            new FirestoreBookingRepository(db),
            authorization,
            { next: () => APPOINTMENT_ID },
            clock,
            { next: () => 'corr_http_occupancy_001' }
          )
      },
      {
        provide: SCHEDULE_APPLICATION,
        useFactory: () =>
          new ScheduleApplicationService(
            new FirestoreScheduleRepository(db),
            createScheduleAuthorizationPolicy(resolveRole),
            clock,
            { next: () => 'corr_http_schedule_001' }
          )
      },
      {
        provide: INTERNAL_TEST_BOOKING_SETTINGS,
        useValue: {
          enabled: true,
          expiresAtUtc: '2099-01-01T00:00:00.000Z',
          projectId: 'beauessence-clinic-stg-c1a01',
          emulatorHost: '127.0.0.1:8080'
        }
      },
      {
        provide: INTERNAL_TEST_BOOKING_CLOCK,
        useValue: clock
      }
    ]
  })
  class OccupancyHttpHarnessModule {}

  return OccupancyHttpHarnessModule;
}

describe('Nest HTTP publish then lazy slot reservation', () => {
  let firebaseApp: App;
  let db: Firestore;
  let nestApp: NestFastifyApplication | undefined;
  let nowUtc = NOW;
  const clock = { nowUtc: () => nowUtc };

  beforeAll(async () => {
    firebaseApp = initializeApp({ projectId }, 'schedule-occupancy-http');
    db = getFirestore(firebaseApp);
    const instance = await NestFactory.create<NestFastifyApplication>(
      occupancyHarnessModule(db, clock),
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    nestApp = instance;
  });

  afterAll(async () => {
    await nestApp?.close();
    nestApp = undefined;
    await deleteApp(firebaseApp);
  });

  beforeEach(async () => {
    nowUtc = NOW;
    for (const collection of Object.values(COLLECTIONS)) {
      const documents = await db.collection(collection).listDocuments();
      await Promise.all(documents.map((document) => document.delete()));
    }
  });

  function requireHarness(): NestFastifyApplication {
    if (nestApp === undefined) throw new Error('Nest harness was not started.');
    return nestApp;
  }

  async function publishGrid(
    harness: NestFastifyApplication,
    idempotencyKey = PUBLISH_BODY.idempotencyKey
  ): Promise<void> {
    const published = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: actorHeaders('manager'),
      payload: { ...PUBLISH_BODY, idempotencyKey }
    });
    expect(published.statusCode).toBe(201);
  }

  async function bookPublishedSlot(
    harness: NestFastifyApplication,
    extras: Record<string, string> = {}
  ) {
    return harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: actorHeaders('patient', {
        'x-test-patient-id': extras['x-test-patient-id'] ?? 'patient_001'
      }),
      payload: {
        ...CREATE_BODY,
        ...(extras.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: extras.idempotencyKey })
      }
    });
  }

  it('publishes over HTTP, lists a grid slot with no slot document, then books it', async () => {
    const harness = requireHarness();

    const published = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: actorHeaders('manager'),
      payload: PUBLISH_BODY
    });
    expect(published.statusCode).toBe(201);
    const publishedBody = JSON.parse(published.payload) as {
      publishedVersion: number;
      publishedAt: string;
      slotCount: number;
    };
    expect(publishedBody.publishedVersion).toBe(1);
    expect(publishedBody.publishedAt).toBe(NOW);
    expect(publishedBody.slotCount).toBeGreaterThan(0);

    const listed = await harness.inject({
      method: 'GET',
      url: '/v1/slots?kind=initial',
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = JSON.parse(listed.payload) as {
      slots: Array<{ slotId: string; available: boolean }>;
    };
    expect(
      listedBody.slots.some((slot) => slot.slotId === SLOT_ID && slot.available)
    ).toBe(true);
    await expect(
      db.collection(COLLECTIONS.slots).doc(SLOT_ID).get()
    ).resolves.toMatchObject({ exists: false });

    const created = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' }),
      payload: CREATE_BODY
    });
    expect(created.statusCode).toBe(201);
    expect(JSON.parse(created.payload)).toEqual({
      appointmentId: APPOINTMENT_ID,
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z'
    });

    const slot = await db.collection(COLLECTIONS.slots).doc(SLOT_ID).get();
    expect(slot.data()?.['reservationId']).toBe(APPOINTMENT_ID);

    const queried = await harness.inject({
      method: 'GET',
      url: `/v1/bookings/${APPOINTMENT_ID}`,
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    expect(queried.statusCode).toBe(200);
    expect(JSON.parse(queried.payload)).toEqual({
      appointmentId: APPOINTMENT_ID,
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z'
    });
  });

  it('rejects a slot that is not on the published grid with 409', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0004');

    const created = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' }),
      payload: {
        idempotencyKey: 'booking_http_occupancy_offgrid_0001',
        slotId: 'slot_20300102_0000',
        serviceId: 'service_consult',
        bookingKind: 'initial'
      }
    });
    expect(created.statusCode).toBe(409);
    expect(JSON.parse(created.payload)).toMatchObject({
      error: { code: 'CONFLICT' }
    });
  });

  it('lets staff complete a published-grid booking over HTTP and refuses a patient', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0005');
    const created = await bookPublishedSlot(harness);
    expect(created.statusCode).toBe(201);

    const denied = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${APPOINTMENT_ID}/complete`,
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' }),
      payload: { idempotencyKey: 'booking-idempotency-0005' }
    });
    expect(denied.statusCode).toBe(403);

    const completed = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${APPOINTMENT_ID}/complete`,
      headers: actorHeaders('manager'),
      payload: { idempotencyKey: 'booking-idempotency-0006' }
    });
    expect(completed.statusCode).toBe(201);
    expect(JSON.parse(completed.payload)).toEqual({
      appointmentId: APPOINTMENT_ID,
      status: 'completed'
    });

    const queried = await harness.inject({
      method: 'GET',
      url: `/v1/bookings/${APPOINTMENT_ID}`,
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' })
    });
    expect(queried.statusCode).toBe(200);
    expect(JSON.parse(queried.payload)).toMatchObject({
      appointmentId: APPOINTMENT_ID,
      status: 'completed'
    });
  });

  it('rejects a second HTTP create on the occupied published slot with 409', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0006');
    const first = await bookPublishedSlot(harness);
    expect(first.statusCode).toBe(201);

    const second = await bookPublishedSlot(harness, {
      'x-test-patient-id': 'patient_002',
      idempotencyKey: 'booking-idempotency-0008'
    });
    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.payload)).toMatchObject({
      error: { code: 'CONFLICT' }
    });
  });

  it('lets a patient cancel a published-grid booking over HTTP and releases the slot', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0007');
    const created = await bookPublishedSlot(harness);
    expect(created.statusCode).toBe(201);

    const cancelled = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${APPOINTMENT_ID}/cancel`,
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' }),
      payload: { idempotencyKey: 'booking-idempotency-0010' }
    });
    expect(cancelled.statusCode).toBe(201);
    expect(JSON.parse(cancelled.payload)).toEqual({
      appointmentId: APPOINTMENT_ID,
      status: 'cancelled'
    });

    const slot = await db.collection(COLLECTIONS.slots).doc(SLOT_ID).get();
    expect(slot.data()?.['reservationId']).toBeUndefined();
  });

  it('lets a patient reschedule a published-grid booking onto another grid slot', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0008');
    const created = await bookPublishedSlot(harness);
    expect(created.statusCode).toBe(201);

    const rescheduled = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${APPOINTMENT_ID}/reschedule`,
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' }),
      payload: {
        idempotencyKey: 'booking-idempotency-0011',
        targetSlotId: TARGET_SLOT_ID
      }
    });
    expect(rescheduled.statusCode).toBe(201);
    expect(JSON.parse(rescheduled.payload)).toEqual({
      appointmentId: APPOINTMENT_ID,
      status: 'confirmed',
      startsAt: '2030-01-02T04:30:00.000Z',
      endsAt: '2030-01-02T05:00:00.000Z'
    });

    const released = await db.collection(COLLECTIONS.slots).doc(SLOT_ID).get();
    expect(released.data()?.['reservationId']).toBeUndefined();
    const reserved = await db
      .collection(COLLECTIONS.slots)
      .doc(TARGET_SLOT_ID)
      .get();
    expect(reserved.data()?.['reservationId']).toBe(APPOINTMENT_ID);
  });

  it('lets staff record no-show on a published-grid booking over HTTP', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0009');
    const created = await bookPublishedSlot(harness);
    expect(created.statusCode).toBe(201);

    const recorded = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${APPOINTMENT_ID}/no-show`,
      headers: actorHeaders('manager'),
      payload: { idempotencyKey: 'booking-idempotency-0012' }
    });
    expect(recorded.statusCode).toBe(201);
    expect(JSON.parse(recorded.payload)).toEqual({
      appointmentId: APPOINTMENT_ID,
      status: 'no_show'
    });
  });

  it('replays the same HTTP create idempotency key instead of booking twice', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0010');
    const first = await bookPublishedSlot(harness);
    const second = await bookPublishedSlot(harness);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(JSON.parse(second.payload)).toEqual(JSON.parse(first.payload));
    expect((await db.collection(COLLECTIONS.appointments).get()).size).toBe(1);
    expect((await db.collection(COLLECTIONS.slots).get()).size).toBe(1);
  });

  it('rejects a reused HTTP create key with different slot content', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0011');
    const first = await bookPublishedSlot(harness);
    expect(first.statusCode).toBe(201);

    const reused = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' }),
      payload: {
        ...CREATE_BODY,
        slotId: TARGET_SLOT_ID
      }
    });
    expect(reused.statusCode).toBe(409);
    expect(JSON.parse(reused.payload)).toMatchObject({
      error: { code: 'IDEMPOTENCY_MISMATCH' }
    });
    expect((await db.collection(COLLECTIONS.appointments).get()).size).toBe(1);
  });

  it('closes patient self-cancel after cutoff and still lets staff cancel', async () => {
    const harness = requireHarness();
    await publishGrid(harness, 'schedule_publish_0012');
    const created = await bookPublishedSlot(harness);
    expect(created.statusCode).toBe(201);

    nowUtc = AFTER_SELF_CANCEL_CUTOFF;
    const denied = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${APPOINTMENT_ID}/cancel`,
      headers: actorHeaders('patient', { 'x-test-patient-id': 'patient_001' }),
      payload: { idempotencyKey: 'booking-idempotency-0015' }
    });
    expect(denied.statusCode).toBe(409);
    expect(JSON.parse(denied.payload)).toMatchObject({
      error: { code: 'CONFLICT' }
    });

    const cancelled = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${APPOINTMENT_ID}/cancel`,
      headers: actorHeaders('manager'),
      payload: { idempotencyKey: 'booking-idempotency-0016' }
    });
    expect(cancelled.statusCode).toBe(201);
    expect(JSON.parse(cancelled.payload)).toEqual({
      appointmentId: APPOINTMENT_ID,
      status: 'cancelled'
    });
  });
});
