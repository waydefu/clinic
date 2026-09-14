import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import { FirestoreScheduleRepository } from '../../apps/api/src/firestore/schedule.repository.js';
import { createAppointmentIdempotency } from '../../apps/api/src/idempotency/appointment-idempotency.js';
import { publishScheduleIdempotency } from '../../apps/api/src/idempotency/schedule-idempotency.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';
import type { Schedule } from '@beauessence/domain';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const projectId = LOCAL_FIREBASE_PROJECT_ID;

const REQUESTED_AT = '2029-12-15T09:00:00.000Z';
const SLOT_ID = 'slot_20300102_1200';

const schedule: Schedule = {
  timeZone: 'Asia/Taipei',
  weeklyAvailability: [
    {
      weekday: 3,
      intervals: [{ startLocalTime: '12:00', endLocalTime: '20:30' }]
    }
  ],
  dateExceptions: [],
  blockedTimes: { initial: ['13:00'], follow_up: ['13:15'] }
};

const audit = {
  actorId: 'actor_manager_001',
  actorRole: 'manager',
  correlationId: 'corr_schedule_firestore_001',
  source: 'api' as const,
  reasonCode: null,
  policyVersion: null
};

let app: App;
let db: Firestore;
let bookings: FirestoreBookingRepository;
let schedules: FirestoreScheduleRepository;

describe('published schedule then lazy slot reservation', () => {
  beforeAll(() => {
    app = initializeApp({ projectId }, 'schedule-publication');
    db = getFirestore(app);
    bookings = new FirestoreBookingRepository(db);
    schedules = new FirestoreScheduleRepository(db);
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    for (const collection of Object.values(COLLECTIONS)) {
      const documents = await db.collection(collection).listDocuments();
      await Promise.all(documents.map((document) => document.delete()));
    }
  });

  it('publishes the grid and books a slot that was never seeded', async () => {
    const published = await schedules.publish({
      draft: schedule,
      expectedVersion: 0,
      slotGeneration: {
        startDate: '2029-12-15',
        dayCount: 32
      },
      audit,
      requestedAt: REQUESTED_AT,
      idempotency: publishScheduleIdempotency({
        key: 'schedule_publish_firestore_0001',
        actorId: audit.actorId,
        expectedVersion: 0,
        schedule
      })
    });
    expect(published.publishedVersion).toBe(1);
    expect(published.slotCount).toBeGreaterThan(0);

    const replayed = await schedules.publish({
      draft: schedule,
      expectedVersion: 0,
      slotGeneration: {
        startDate: '2029-12-15',
        dayCount: 32
      },
      audit,
      requestedAt: REQUESTED_AT,
      idempotency: publishScheduleIdempotency({
        key: 'schedule_publish_firestore_0001',
        actorId: audit.actorId,
        expectedVersion: 0,
        schedule
      })
    });
    expect(replayed.replayed).toBe(true);
    expect(replayed.publishedVersion).toBe(1);

    await expect(
      db.collection(COLLECTIONS.slots).doc(SLOT_ID).get()
    ).resolves.toMatchObject({ exists: false });

    const reserved = await bookings.reserve({
      appointmentId: 'appointment_schedule_001',
      slotId: SLOT_ID,
      patientId: 'patient_schedule_001',
      bookingKind: 'initial',
      itemId: 'service_consult',
      audit: { ...audit, correlationId: 'corr_booking_schedule_001' },
      requestedAt: REQUESTED_AT,
      idempotency: createAppointmentIdempotency({
        key: 'booking_schedule_0001',
        actorId: audit.actorId,
        patientId: 'patient_schedule_001',
        slotId: SLOT_ID,
        bookingKind: 'initial',
        itemId: 'service_consult'
      })
    });
    expect(reserved).toMatchObject({
      appointmentId: 'appointment_schedule_001',
      replayed: false,
      startsAt: '2030-01-02T04:00:00.000Z'
    });
    const slot = await db.collection(COLLECTIONS.slots).doc(SLOT_ID).get();
    expect(slot.data()?.['reservationId']).toBe('appointment_schedule_001');
  });
});
