import 'reflect-metadata';

import {
  deleteApp,
  getApp,
  getApps,
  initializeApp,
  type App
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';

import { INTERNAL_TEST_PRIVACY_POLICY_VERSION } from '@beauessence/contracts';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import {
  type AppointmentAuthenticator,
  type AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import { COLLECTIONS } from '../firestore/booking.repository.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import type { CandidateRole } from '../platform/authorization/rbac.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../../../packages/config/src/index.js';
import { InMemoryCalendar } from '../../../worker/src/calendar-port.js';
import { OutboxProcessor } from '../../../worker/src/outbox-processor.js';
import { InternalTestBookingModule } from './internal-test-booking.module.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const projectId = LOCAL_FIREBASE_PROJECT_ID;
const NOW = '2029-12-15T09:00:00.000Z';
const SLOT_ID = 'slot_20300102_1200';
const EXPIRES_AT = '2099-01-01T00:00:00.000Z';

const PUBLISH_BODY = {
  idempotencyKey: 'schedule_publish_0010',
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
  idempotencyKey: 'booking-idempotency-0010',
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

function actorHeaders(
  role: CandidateRole,
  extras: Record<string, string> = {}
): Record<string, string> {
  return {
    'x-test-actor-id': `actor_${role}_composing_001`,
    'x-test-role': role,
    ...extras
  };
}

let nowUtc = NOW;
const clock = { nowUtc: () => nowUtc };

/**
 * Boots the production InternalTestBookingModule against the Firestore
 * emulator. Lives under `apps/api` so `@nestjs/*` resolves. Gate env is
 * set so IP-001 settings stay on — unlike the occupancy harness, which
 * omits them.
 */
@Module({
  imports: [
    InternalTestBookingModule.register({
      clock,
      authenticator: harnessAuthenticator
    })
  ]
})
class InternalTestBookingComposingModule {}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('InternalTestBookingModule composing HTTP occupancy', () => {
  let firebaseApp: App;
  let db: Firestore;
  let nestApp: NestFastifyApplication | undefined;
  const previousEnv = {
    enabled: process.env['INTERNAL_TEST_BOOKING_ENABLED'],
    expires: process.env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC']
  };

  beforeAll(async () => {
    process.env['INTERNAL_TEST_BOOKING_ENABLED'] = 'true';
    process.env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'] = EXPIRES_AT;
    firebaseApp = getApps().some((app) => app.name === '[DEFAULT]')
      ? getApp()
      : initializeApp({ projectId });
    db = getFirestore(firebaseApp);
    const instance = await NestFactory.create<NestFastifyApplication>(
      InternalTestBookingComposingModule,
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
    if (firebaseApp.name === '[DEFAULT]') await deleteApp(firebaseApp);
    restoreEnv('INTERNAL_TEST_BOOKING_ENABLED', previousEnv.enabled);
    restoreEnv('INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC', previousEnv.expires);
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

  it('opens the IP-001 gate to authentication, not an unauthenticated write', async () => {
    const unauthenticated = await requireHarness().inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: CREATE_BODY
    });
    expect(unauthenticated.statusCode).toBe(401);
  });

  it('publishes, books, stamps privacy-v1, and projects calendar outbox in memory', async () => {
    const harness = requireHarness();

    const published = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: actorHeaders('manager'),
      payload: PUBLISH_BODY
    });
    expect(published.statusCode).toBe(201);

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
    const createdBody = JSON.parse(created.payload) as {
      appointmentId: string;
      status: string;
      startsAt: string;
      endsAt: string;
    };
    expect(createdBody).toMatchObject({
      status: 'confirmed',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z'
    });
    expect(createdBody.appointmentId).toMatch(/^[0-9a-f]{32}$/);

    const slot = await db.collection(COLLECTIONS.slots).doc(SLOT_ID).get();
    expect(slot.data()?.['reservationId']).toBe(createdBody.appointmentId);

    const audits = await db.collection(COLLECTIONS.auditEvents).get();
    const confirmed = audits.docs
      .map((document) => document.data())
      .find((event) => event['action'] === 'appointment_confirmed');
    expect(confirmed).toMatchObject({
      policyVersion: INTERNAL_TEST_PRIVACY_POLICY_VERSION,
      occurredAt: NOW,
      actorRole: 'patient'
    });

    const jobs = await db.collection(COLLECTIONS.outboxJobs).get();
    expect(jobs.size).toBe(1);
    const job = jobs.docs[0]?.data();
    expect(job).toMatchObject({
      type: 'calendar_projection_requested',
      appointmentId: createdBody.appointmentId,
      appointmentStatus: 'confirmed',
      status: 'pending'
    });
    expect(job).not.toHaveProperty('patientName');
    expect(job).not.toHaveProperty('nationalId');

    const calendar = new InMemoryCalendar();
    const processor = new OutboxProcessor(db, calendar, undefined, () => 0.5);
    await expect(processor.processDue(NOW)).resolves.toMatchObject({
      claimed: 1,
      completed: 1
    });
    const [event] = [...calendar.events.values()];
    expect(event).toMatchObject({
      appointmentId: createdBody.appointmentId,
      appointmentStatus: 'confirmed',
      bookingKind: 'initial',
      startsAt: '2030-01-02T04:00:00.000Z'
    });
    expect(event).not.toHaveProperty('patientName');
    expect(event).not.toHaveProperty('nationalId');
  });
});
