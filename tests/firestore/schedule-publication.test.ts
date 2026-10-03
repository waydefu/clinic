import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import {
  getFirestore,
  type Firestore,
  type Transaction
} from 'firebase-admin/firestore';
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

// AUD-02: a publication that carries no slot at all, issued while a booking for
// the previously published slot is being created. The two writers must never
// both succeed: that would leave a confirmed appointment on a slot that the
// published grid no longer contains.
const EMPTY_SCHEDULE: Schedule = {
  timeZone: 'Asia/Taipei',
  weeklyAvailability: [],
  dateExceptions: []
};

const SLOT_GENERATION = { startDate: '2029-12-15', dayCount: 32 };

function publishRequest(input: {
  readonly draft: Schedule;
  readonly expectedVersion: number;
  readonly key: string;
}) {
  return {
    draft: input.draft,
    expectedVersion: input.expectedVersion,
    slotGeneration: SLOT_GENERATION,
    audit,
    requestedAt: REQUESTED_AT,
    idempotency: publishScheduleIdempotency({
      key: input.key,
      actorId: audit.actorId,
      expectedVersion: input.expectedVersion,
      schedule: input.draft
    })
  };
}

function bookingRequest() {
  return {
    appointmentId: 'appointment_publish_race_001',
    slotId: SLOT_ID,
    patientId: 'patient_publish_race_001',
    bookingKind: 'initial' as const,
    itemId: 'service_consult',
    audit: { ...audit, correlationId: 'corr_booking_publish_race_001' },
    requestedAt: REQUESTED_AT,
    idempotency: createAppointmentIdempotency({
      key: 'booking_publish_race_0001',
      actorId: audit.actorId,
      patientId: 'patient_publish_race_001',
      slotId: SLOT_ID,
      bookingKind: 'initial',
      itemId: 'service_consult'
    })
  };
}

/**
 * A Firestore whose first transaction runs `beforeTransaction` before it
 * starts and `beforeCommit` after the update function has made all its reads
 * and buffered its writes, just before the SDK commits. Only the repository
 * under test receives it, so the concurrent writer keeps the real database.
 * These two hooks are the two places a booking can commit relative to a
 * publication without any scheduler luck.
 */
function interleavedFirestore(
  real: Firestore,
  hooks: {
    readonly beforeTransaction?: () => Promise<void>;
    readonly beforeCommit?: () => Promise<void>;
  }
): Firestore {
  let armed = true;
  return new Proxy(real, {
    get(target, property) {
      if (property === 'runTransaction') {
        return async (
          update: (transaction: Transaction) => Promise<unknown>,
          options?: unknown
        ) => {
          const first = armed;
          armed = false;
          if (first) await hooks.beforeTransaction?.();
          const run = target.runTransaction.bind(target) as (
            fn: (transaction: Transaction) => Promise<unknown>,
            transactionOptions?: unknown
          ) => Promise<unknown>;
          // The SDK reruns the update function when it retries an aborted
          // commit; the interleaved booking must only be started once.
          let interleaved = false;
          return run(async (transaction) => {
            const result = await update(transaction);
            if (first && !interleaved) {
              interleaved = true;
              await hooks.beforeCommit?.();
            }
            return result;
          }, options);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    }
  });
}

async function publishFirstSchedule(): Promise<void> {
  await schedules.publish(
    publishRequest({
      draft: schedule,
      expectedVersion: 0,
      key: 'schedule_publish_0201'
    })
  );
}

async function appointmentCount(): Promise<number> {
  return (await db.collection(COLLECTIONS.appointments).get()).size;
}

async function publishedVersion(): Promise<number> {
  return (await schedules.readPublished()).publishedVersion;
}

describe('publishing a schedule while a booking is created (AUD-02)', () => {
  beforeAll(() => {
    app = initializeApp({ projectId }, 'schedule-publication-race');
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

  it('refuses a publication that orphans a booking created after its first read', async () => {
    await publishFirstSchedule();
    const racing = new FirestoreScheduleRepository(
      interleavedFirestore(db, {
        beforeTransaction: async () => {
          await bookings.reserve(bookingRequest());
        }
      })
    );

    await expect(
      racing.publish(
        publishRequest({
          draft: EMPTY_SCHEDULE,
          expectedVersion: 1,
          key: 'schedule_publish_0202'
        })
      )
    ).rejects.toMatchObject({ code: 'SCHEDULE_ORPHANS_APPOINTMENTS' });

    expect(await appointmentCount()).toBe(1);
    expect(await publishedVersion()).toBe(1);
  });

  it('never lets a booking commit inside the publication transaction and both succeed', async () => {
    await publishFirstSchedule();
    let booking: Promise<unknown> | undefined;
    const racing = new FirestoreScheduleRepository(
      interleavedFirestore(db, {
        beforeCommit: async () => {
          // Start the booking while the publication holds its reads and has
          // buffered its writes, and give it a bounded window to commit. A transaction that pessimistically
          // blocks it is also a valid outcome, so do not wait forever.
          const started = bookings.reserve(bookingRequest());
          booking = started;
          await Promise.race([
            started.then(
              () => undefined,
              () => undefined
            ),
            new Promise((resolve) => setTimeout(resolve, 2_000))
          ]);
        }
      })
    );

    await racing
      .publish(
        publishRequest({
          draft: EMPTY_SCHEDULE,
          expectedVersion: 1,
          key: 'schedule_publish_0203'
        })
      )
      .then(
        () => undefined,
        () => undefined
      );
    await booking?.then(
      () => undefined,
      () => undefined
    );

    const bookingCommitted = (await appointmentCount()) === 1;
    const publicationCommitted = (await publishedVersion()) === 2;
    expect(booking).toBeDefined();
    expect(bookingCommitted && publicationCommitted).toBe(false);
    expect(bookingCommitted || publicationCommitted).toBe(true);
  });

  it('keeps one winner when a publication and a booking really race', async () => {
    for (let round = 0; round < 6; round += 1) {
      for (const collection of Object.values(COLLECTIONS)) {
        const documents = await db.collection(collection).listDocuments();
        await Promise.all(documents.map((document) => document.delete()));
      }
      await publishFirstSchedule();

      await Promise.allSettled([
        schedules.publish(
          publishRequest({
            draft: EMPTY_SCHEDULE,
            expectedVersion: 1,
            key: `schedule_publish_race_${round}_b`
          })
        ),
        bookings.reserve(bookingRequest())
      ]);

      const bookingCommitted = (await appointmentCount()) === 1;
      const publicationCommitted = (await publishedVersion()) === 2;
      expect(bookingCommitted && publicationCommitted).toBe(false);
    }
  });
});
