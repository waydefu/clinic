import 'reflect-metadata';

import {
  deleteApp,
  getApp,
  getApps,
  initializeApp,
  type App
} from 'firebase-admin/app';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import {
  getFirestore,
  type DocumentData,
  type Firestore
} from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication
} from '@nestjs/platform-fastify';

import { INTERNAL_TEST_PRIVACY_POLICY_VERSION } from '@beauessence/contracts';

import {
  CALENDAR_PILOT_COOKIE,
  CalendarPilotSessionService
} from '../auth/calendar-pilot-session.js';
import { COLLECTIONS } from '../firestore/booking.repository.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../../../packages/config/src/index.js';
import { InMemoryCalendar } from '../../../worker/src/calendar-port.js';
import { createInternalTestOutboxRuntime } from '../../../worker/src/internal-test-outbox-runtime.js';
import { InternalTestBookingModule } from './internal-test-booking.module.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const projectId = LOCAL_FIREBASE_PROJECT_ID;
const NOW = '2029-12-15T09:00:00.000Z';
const SLOT_ID = 'slot_20300102_1200';
const EXPIRES_AT = '2099-01-01T00:00:00.000Z';
const MANAGER_EMAIL = 'manager@example.com';
const MANAGER_UID = 'pilot_user_001';
const PATIENT_EMAIL = 'patient@example.com';
const PATIENT_UID = 'patient_001';

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

interface FakeAccount {
  uid: string;
  email: string;
  totp: boolean;
  disabled: boolean;
  refreshTokensRevoked: boolean;
}

/**
 * Deterministic in-memory Firebase Auth stand-in. No network, no real
 * accounts: cookie/id-token strings map to accounts created per test.
 */
class FakeAuth {
  private accounts = new Map<string, FakeAccount>();
  private idTokens = new Map<string, string>();
  private sessionCookies = new Map<string, string>();
  private minted = 0;

  addAccount(account: FakeAccount): void {
    this.accounts.set(account.uid, account);
  }

  mintIdToken(uid: string): string {
    const token = `id_token_${uid}_${this.minted}`;
    this.minted += 1;
    this.idTokens.set(token, uid);
    return token;
  }

  private decodedFor(uid: string): DecodedIdToken {
    const account = this.accounts.get(uid);
    if (account === undefined) throw new Error(`unknown account ${uid}`);
    return {
      uid,
      email: account.email,
      email_verified: true,
      firebase: {
        sign_in_second_factor: account.totp ? 'totp' : undefined
      }
    } as unknown as DecodedIdToken;
  }

  verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    const uid = this.idTokens.get(idToken);
    if (uid === undefined) return Promise.reject(new Error('invalid token'));
    return Promise.resolve(this.decodedFor(uid));
  }

  verifySessionCookie(
    cookieValue: string,
    checkRevoked: boolean
  ): Promise<DecodedIdToken> {
    const uid = this.sessionCookies.get(cookieValue);
    if (uid === undefined) return Promise.reject(new Error('invalid cookie'));
    const account = this.accounts.get(uid);
    if (account === undefined)
      return Promise.reject(new Error('invalid cookie'));
    if (checkRevoked && account.refreshTokensRevoked)
      return Promise.reject(new Error('revoked'));
    return Promise.resolve(this.decodedFor(uid));
  }

  getUser(uid: string): Promise<{ disabled: boolean }> {
    const account = this.accounts.get(uid);
    if (account === undefined)
      return Promise.reject(new Error(`unknown user ${uid}`));
    return Promise.resolve({ disabled: account.disabled });
  }

  createSessionCookie(): Promise<string> {
    const cookie = `session_cookie_${this.minted}`;
    this.minted += 1;
    return Promise.resolve(cookie);
  }

  linkSessionCookie(cookieValue: string, uid: string): void {
    this.sessionCookies.set(cookieValue, uid);
  }
}

let nowUtc = NOW;
const clock = { nowUtc: () => nowUtc };

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

type LogicalSnapshot = Record<
  string,
  readonly { readonly id: string; readonly data: DocumentData }[]
>;

async function wipeCollections(db: Firestore): Promise<void> {
  for (const collection of Object.values(COLLECTIONS)) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function takeLogicalSnapshot(db: Firestore): Promise<LogicalSnapshot> {
  return Object.fromEntries(
    await Promise.all(
      Object.values(COLLECTIONS).map(async (collection) => {
        const documents = await db.collection(collection).get();
        return [
          collection,
          documents.docs.map((document) => ({
            id: document.id,
            data: document.data()
          }))
        ] as const;
      })
    )
  );
}

async function restoreLogicalSnapshot(
  db: Firestore,
  snapshot: LogicalSnapshot
): Promise<void> {
  const batch = db.batch();
  for (const [collection, documents] of Object.entries(snapshot)) {
    for (const document of documents) {
      batch.create(db.collection(collection).doc(document.id), document.data);
    }
  }
  await batch.commit();
}

function composingModule(auth: Auth, sessions: CalendarPilotSessionService) {
  @Module({
    imports: [
      InternalTestBookingModule.register({
        clock,
        auth,
        sessions
      })
    ]
  })
  class InternalTestBookingComposingModule {}

  return InternalTestBookingComposingModule;
}

describe('InternalTestBookingModule composing HTTP occupancy', () => {
  let firebaseApp: App;
  let db: Firestore;
  let nestApp: NestFastifyApplication | undefined;
  let fake: FakeAuth;
  let managerCookie: string;
  let managerCsrf: string;
  let patientToken: string;
  const previousEnv = {
    enabled: process.env['INTERNAL_TEST_BOOKING_ENABLED'],
    expires: process.env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'],
    managers: process.env['CALENDAR_PILOT_MANAGER_EMAILS']
  };

  beforeAll(async () => {
    process.env['INTERNAL_TEST_BOOKING_ENABLED'] = 'true';
    process.env['INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC'] = EXPIRES_AT;
    process.env['CALENDAR_PILOT_MANAGER_EMAILS'] = MANAGER_EMAIL;
    firebaseApp = getApps().some((app) => app.name === '[DEFAULT]')
      ? getApp()
      : initializeApp({ projectId });
    db = getFirestore(firebaseApp);
    fake = new FakeAuth();
    fake.addAccount({
      uid: MANAGER_UID,
      email: MANAGER_EMAIL,
      totp: true,
      disabled: false,
      refreshTokensRevoked: false
    });
    fake.addAccount({
      uid: PATIENT_UID,
      email: PATIENT_EMAIL,
      totp: false,
      disabled: false,
      refreshTokensRevoked: false
    });
    const sessions = new CalendarPilotSessionService(
      fake as unknown as Auth,
      db,
      process.env
    );
    const instance = await NestFactory.create<NestFastifyApplication>(
      composingModule(fake as unknown as Auth, sessions),
      new FastifyAdapter({ logger: false }),
      { logger: false }
    );
    instance.setGlobalPrefix('v1');
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    nestApp = instance;
    const created = await sessions.create(fake.mintIdToken(MANAGER_UID));
    fake.linkSessionCookie(created.cookieValue, MANAGER_UID);
    managerCookie = `${CALENDAR_PILOT_COOKIE}=${created.cookieValue}`;
    managerCsrf = created.csrfToken;
    patientToken = fake.mintIdToken(PATIENT_UID);
  });

  afterAll(async () => {
    await nestApp?.close();
    nestApp = undefined;
    if (firebaseApp.name === '[DEFAULT]') await deleteApp(firebaseApp);
    restoreEnv('INTERNAL_TEST_BOOKING_ENABLED', previousEnv.enabled);
    restoreEnv('INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC', previousEnv.expires);
    restoreEnv('CALENDAR_PILOT_MANAGER_EMAILS', previousEnv.managers);
  });

  beforeEach(async () => {
    nowUtc = NOW;
    await wipeCollections(db);
  });

  function requireHarness(): NestFastifyApplication {
    if (nestApp === undefined) throw new Error('Nest harness was not started.');
    return nestApp;
  }

  function managerHeaders(csrf = true): Record<string, string> {
    return {
      cookie: managerCookie,
      ...(csrf ? { 'x-csrf-token': managerCsrf } : {})
    };
  }

  function patientHeaders(): Record<string, string> {
    return { authorization: `Bearer ${patientToken}` };
  }

  it('opens the IP-001 gate to authentication, not an unauthenticated write', async () => {
    const unauthenticated = await requireHarness().inject({
      method: 'POST',
      url: '/v1/bookings',
      payload: CREATE_BODY
    });
    expect(unauthenticated.statusCode).toBe(401);
  });

  it('refuses a staff write that has the session cookie but no CSRF token', async () => {
    const published = await requireHarness().inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: managerHeaders(false),
      payload: PUBLISH_BODY
    });
    expect(published.statusCode).toBe(401);
  });

  it('publishes, books, stamps privacy-v1, and projects calendar outbox in memory', async () => {
    const harness = requireHarness();

    const published = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: managerHeaders(),
      payload: PUBLISH_BODY
    });
    expect(published.statusCode).toBe(201);

    const listed = await harness.inject({
      method: 'GET',
      url: '/v1/slots?kind=initial',
      headers: patientHeaders()
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
      headers: patientHeaders(),
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
      actorRole: 'patient',
      actorId: PATIENT_UID
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
    const outbox = createInternalTestOutboxRuntime({
      db,
      calendar,
      clock: () => NOW,
      random: () => 0.5
    });
    await expect(outbox.run()).resolves.toMatchObject({
      summary: { claimed: 1, completed: 1 },
      snapshot: { pending: 0, deadLettered: 0 },
      alerts: []
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

    const cancelled = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${createdBody.appointmentId}/cancel`,
      headers: patientHeaders(),
      payload: { idempotencyKey: 'booking-idempotency-0011' }
    });
    expect(cancelled.statusCode).toBe(201);
    await expect(outbox.run()).resolves.toMatchObject({
      summary: { claimed: 1, completed: 1 }
    });
    expect(calendar.events.size).toBe(0);
    expect(calendar.cancelCount).toBe(1);
  });

  it('serves the published grid and booking after a logical restore', async () => {
    const harness = requireHarness();
    const published = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: managerHeaders(),
      payload: {
        ...PUBLISH_BODY,
        idempotencyKey: 'schedule_publish_0011'
      }
    });
    expect(published.statusCode).toBe(201);

    const created = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: patientHeaders(),
      payload: {
        ...CREATE_BODY,
        idempotencyKey: 'booking-idempotency-0012'
      }
    });
    expect(created.statusCode).toBe(201);
    const createdBody = JSON.parse(created.payload) as {
      appointmentId: string;
      status: string;
      startsAt: string;
    };

    const beforeIncident = await takeLogicalSnapshot(db);
    await wipeCollections(db);
    expect((await db.collection(COLLECTIONS.appointments).get()).size).toBe(0);
    await restoreLogicalSnapshot(db, beforeIncident);

    const queried = await harness.inject({
      method: 'GET',
      url: `/v1/bookings/${createdBody.appointmentId}`,
      headers: patientHeaders()
    });
    expect(queried.statusCode).toBe(200);
    expect(JSON.parse(queried.payload)).toMatchObject({
      appointmentId: createdBody.appointmentId,
      status: 'confirmed',
      startsAt: createdBody.startsAt
    });

    const listed = await harness.inject({
      method: 'GET',
      url: '/v1/slots?kind=initial',
      headers: patientHeaders()
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = JSON.parse(listed.payload) as {
      slots: Array<{ slotId: string; available: boolean }>;
    };
    expect(
      listedBody.slots.some(
        (slot) => slot.slotId === SLOT_ID && slot.available === false
      )
    ).toBe(true);

    const calendar = new InMemoryCalendar();
    const outbox = createInternalTestOutboxRuntime({
      db,
      calendar,
      clock: () => NOW,
      random: () => 0.5
    });
    await expect(outbox.run()).resolves.toMatchObject({
      summary: { claimed: 1, completed: 1 }
    });
    expect([...calendar.events.values()][0]).toMatchObject({
      appointmentId: createdBody.appointmentId,
      appointmentStatus: 'confirmed'
    });
    expect([...calendar.events.values()][0]).not.toHaveProperty('patientName');
  });

  it('records a follow-up decision and projects the reminder outbox in memory', async () => {
    const harness = requireHarness();
    const published = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: managerHeaders(),
      payload: {
        ...PUBLISH_BODY,
        idempotencyKey: 'schedule_publish_0012'
      }
    });
    expect(published.statusCode).toBe(201);

    const created = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: patientHeaders(),
      payload: {
        ...CREATE_BODY,
        idempotencyKey: 'booking-idempotency-0013'
      }
    });
    expect(created.statusCode).toBe(201);
    const createdBody = JSON.parse(created.payload) as {
      appointmentId: string;
    };

    const completed = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${createdBody.appointmentId}/complete`,
      headers: managerHeaders(),
      payload: { idempotencyKey: 'complete-idempotency-0013' }
    });
    expect(completed.statusCode).toBe(201);

    const denied = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${createdBody.appointmentId}/follow-up`,
      headers: patientHeaders(),
      payload: {
        idempotencyKey: 'follow-up-idempotency-denied',
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      }
    });
    expect(denied.statusCode).toBe(403);

    const recorded = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${createdBody.appointmentId}/follow-up`,
      headers: managerHeaders(),
      payload: {
        idempotencyKey: 'follow-up-idempotency-0013',
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      }
    });
    expect(recorded.statusCode).toBe(201);
    expect(JSON.parse(recorded.payload)).toEqual({
      appointmentId: createdBody.appointmentId,
      decision: 'required',
      dueAt: '2030-01-02T04:15:00.000Z'
    });

    const replayed = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${createdBody.appointmentId}/follow-up`,
      headers: managerHeaders(),
      payload: {
        idempotencyKey: 'follow-up-idempotency-0013',
        decision: 'required',
        dueDate: '2030-01-02',
        dueTime: '12:15'
      }
    });
    expect(replayed.statusCode).toBe(201);
    expect(JSON.parse(replayed.payload)).toEqual({
      appointmentId: createdBody.appointmentId,
      decision: 'required',
      dueAt: '2030-01-02T04:15:00.000Z'
    });

    const followUp = await db
      .collection(COLLECTIONS.followUps)
      .doc(createdBody.appointmentId)
      .get();
    expect(followUp.data()).toMatchObject({
      decision: 'required',
      dueAt: '2030-01-02T04:15:00.000Z',
      patientId: PATIENT_UID
    });

    const audits = await db.collection(COLLECTIONS.auditEvents).get();
    expect(
      audits.docs.some(
        (document) => document.data()['action'] === 'follow_up_decided'
      )
    ).toBe(true);

    const calendar = new InMemoryCalendar();
    const outbox = createInternalTestOutboxRuntime({
      db,
      calendar,
      clock: () => NOW,
      random: () => 0.5
    });
    await outbox.run();
    expect(
      [...calendar.events.values()].some(
        (event) => event.appointmentStatus === 'follow_up_required'
      )
    ).toBe(true);
  });

  it('deletes a booking with a closed reason and projects the cancel outbox in memory', async () => {
    const harness = requireHarness();
    const published = await harness.inject({
      method: 'POST',
      url: '/v1/schedule/publish',
      headers: managerHeaders(),
      payload: {
        ...PUBLISH_BODY,
        idempotencyKey: 'schedule_publish_0013'
      }
    });
    expect(published.statusCode).toBe(201);

    const created = await harness.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: patientHeaders(),
      payload: {
        ...CREATE_BODY,
        idempotencyKey: 'booking-idempotency-0014'
      }
    });
    expect(created.statusCode).toBe(201);
    const createdBody = JSON.parse(created.payload) as {
      appointmentId: string;
    };

    const denied = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${createdBody.appointmentId}/delete`,
      headers: patientHeaders(),
      payload: {
        idempotencyKey: 'booking-idempotency-0015',
        reasonCode: 'created_in_error'
      }
    });
    expect(denied.statusCode).toBe(403);

    const deleted = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${createdBody.appointmentId}/delete`,
      headers: managerHeaders(),
      payload: {
        idempotencyKey: 'booking-idempotency-0016',
        reasonCode: 'created_in_error'
      }
    });
    expect(deleted.statusCode).toBe(201);
    const deletedBody = JSON.parse(deleted.payload) as {
      appointmentId: string;
      deleted: boolean;
      auditEventId: string;
    };
    expect(deletedBody).toMatchObject({
      appointmentId: createdBody.appointmentId,
      deleted: true
    });
    expect(deletedBody.auditEventId).toMatch(/^audit_/);

    const replayed = await harness.inject({
      method: 'POST',
      url: `/v1/bookings/${createdBody.appointmentId}/delete`,
      headers: managerHeaders(),
      payload: {
        idempotencyKey: 'booking-idempotency-0016',
        reasonCode: 'created_in_error'
      }
    });
    expect(replayed.statusCode).toBe(201);
    expect(JSON.parse(replayed.payload)).toEqual(deletedBody);

    const appointment = await db
      .collection(COLLECTIONS.appointments)
      .doc(createdBody.appointmentId)
      .get();
    expect(appointment.exists).toBe(false);

    const audits = await db.collection(COLLECTIONS.auditEvents).get();
    expect(
      audits.docs.some(
        (document) => document.data()['action'] === 'appointment_deleted'
      )
    ).toBe(true);

    const calendar = new InMemoryCalendar();
    const outbox = createInternalTestOutboxRuntime({
      db,
      calendar,
      clock: () => NOW,
      random: () => 0.5
    });
    await outbox.run();
    expect(calendar.cancelCount).toBeGreaterThanOrEqual(1);
    expect(
      [...calendar.events.values()].some(
        (event) => event.appointmentId === createdBody.appointmentId
      )
    ).toBe(false);
  });
});
