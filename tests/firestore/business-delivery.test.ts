import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  DomainError,
  resolveApprovedBusinessDeliveryPolicy,
  type BookingRequest
} from '@beauessence/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import {
  FirestoreBusinessDeliveryRepository,
  MILESTONE_ACKNOWLEDGEMENT_LOG,
  type AcknowledgeMilestoneCommand
} from '../../apps/api/src/firestore/business-delivery.repository.js';
import {
  BUSINESS_DELIVERY_COLLECTIONS,
  FIRST_ELIGIBLE_USE_DOC,
  staffUsageCaptureGapDocumentId
} from '../../apps/api/src/business-delivery/usage-events.js';
import { CalendarPilotSessionService } from '../../apps/api/src/auth/calendar-pilot-session.js';
import { createAppointmentIdempotency } from '../../apps/api/src/idempotency/appointment-idempotency.js';
import { ConflictError } from '../../apps/api/src/platform/errors/api-error.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const SLOT_ID = 'slot_bd_20300102_1200';
const REQUESTED_AT = '2029-12-15T09:00:00.000Z';

let app: App;
let db: Firestore;
let bookings: FirestoreBookingRepository;
let repository: FirestoreBusinessDeliveryRepository;

function bookingRequest(
  overrides: { appointmentId?: string; idempotencyKey?: string } = {}
): BookingRequest {
  const request: Omit<BookingRequest, 'idempotency'> = {
    appointmentId: overrides.appointmentId ?? 'appointment_bd_001',
    slotId: SLOT_ID,
    patientId: 'patient_bd_001',
    bookingKind: 'initial',
    itemId: 'service_snoring',
    audit: {
      actorId: 'actor_bd_001',
      actorRole: 'test_front_desk',
      correlationId: 'corr_bd_001',
      source: 'api',
      reasonCode: null,
      policyVersion: null
    },
    requestedAt: REQUESTED_AT
  };
  return {
    ...request,
    idempotency: createAppointmentIdempotency({
      key: overrides.idempotencyKey ?? 'idem_bd_001',
      actorId: request.audit.actorId,
      patientId: request.patientId,
      slotId: request.slotId,
      bookingKind: request.bookingKind,
      itemId: request.itemId
    })
  };
}

function command(
  overrides: Partial<AcknowledgeMilestoneCommand> = {}
): AcknowledgeMilestoneCommand {
  return {
    milestoneId: 'formal_launch',
    idempotencyKey: 'ack-key-0000000001',
    expectedVersion: 0,
    evidenceRef: 'evidence_ref_01',
    launchDate: '2030-10-15',
    actorRef: 'a'.repeat(64),
    now: '2030-10-20T00:00:00.000Z',
    policy: POLICY,
    ...overrides
  };
}

async function wipe(): Promise<void> {
  for (const collection of [
    ...Object.values(COLLECTIONS),
    ...Object.values(BUSINESS_DELIVERY_COLLECTIONS),
    'calendar_pilot_sessions',
    MILESTONE_ACKNOWLEDGEMENT_LOG
  ]) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function usageEventCount(): Promise<number> {
  return (await db.collection(BUSINESS_DELIVERY_COLLECTIONS.usageEvents).get())
    .size;
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `business-delivery-${Date.now()}`
  );
  db = getFirestore(app);
  bookings = new FirestoreBookingRepository(db);
  repository = new FirestoreBusinessDeliveryRepository(db);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await db.collection(COLLECTIONS.slots).doc(SLOT_ID).set({
    kind: 'initial',
    startsAt: '2030-01-02T04:00:00.000Z'
  });
});

describe('booking_created ingress', () => {
  it('commits exactly one event with the booking and none on replay', async () => {
    const first = await bookings.reserve(bookingRequest());
    expect(first.replayed).toBe(false);
    const replay = await bookings.reserve(bookingRequest());
    expect(replay.replayed).toBe(true);

    const events = await db
      .collection(BUSINESS_DELIVERY_COLLECTIONS.usageEvents)
      .get();
    expect(events.docs.map((document) => document.data())).toEqual([
      {
        schemaVersion: 1,
        eventId: expect.stringMatching(/^bc_[a-f0-9]{48}$/),
        kind: 'booking_created',
        eventClass: 'runtime',
        occurredAt: REQUESTED_AT
      }
    ]);
  });

  it('writes no event when the booking is rejected', async () => {
    await bookings.reserve(bookingRequest());
    await expect(
      bookings.reserve(
        bookingRequest({
          appointmentId: 'appointment_bd_002',
          idempotencyKey: 'idem_bd_002'
        })
      )
    ).rejects.toBeInstanceOf(DomainError);
    expect(await usageEventCount()).toBe(1);
  });

  it('is read back by the report range query at the Taipei month boundary', async () => {
    await bookings.reserve(bookingRequest());
    // 2029-12-15T09:00Z is in the Taipei month 2029-12.
    expect(
      await repository.usageEventsBetween(
        '2029-11-30T16:00:00.000Z',
        '2029-12-31T16:00:00.000Z'
      )
    ).toHaveLength(1);
    expect(
      await repository.usageEventsBetween(
        '2029-12-31T16:00:00.000Z',
        '2030-01-31T16:00:00.000Z'
      )
    ).toEqual([]);
  });
});

describe('staff login capture gap', () => {
  it('atomically writes a session and reads back the Taipei-month gap marker', async () => {
    const email = 'staff.capture@example.test';
    const auth = {
      verifyIdToken: () =>
        Promise.resolve({
          uid: 'uid_capture_gap_fixture_01',
          email,
          email_verified: true,
          firebase: { sign_in_second_factor: 'totp' }
        }),
      getUser: () => Promise.resolve({ disabled: false }),
      createSessionCookie: () => Promise.resolve('capture_gap_cookie_fixture')
    };
    const sessions = new CalendarPilotSessionService(
      auth as never,
      db,
      {
        CALENDAR_PILOT_MANAGER_EMAILS: email,
        CALENDAR_PILOT_FRONT_DESK_EMAILS: ''
      },
      undefined,
      true
    );
    const now = '2030-09-30T16:00:00.000Z';
    await sessions.create('synthetic-id-token', now);

    const gapId = staffUsageCaptureGapDocumentId('2030-10');
    const gap = await db
      .collection(BUSINESS_DELIVERY_COLLECTIONS.milestones)
      .doc(gapId)
      .get();
    expect(gap.exists).toBe(true);
    expect(gap.data()).toEqual({
      schemaVersion: 1,
      month: '2030-10',
      firstObservedAt: now,
      reason: 'maintenance_allowlist_unready'
    });
    expect(await repository.hasStaffUsageCaptureGap('2030-10')).toBe(true);
    expect(await usageEventCount()).toBe(0);
    expect(
      (
        await db
          .collection(BUSINESS_DELIVERY_COLLECTIONS.milestones)
          .doc(FIRST_ELIGIBLE_USE_DOC)
          .get()
      ).exists
    ).toBe(false);
    expect((await db.collection('calendar_pilot_sessions').get()).size).toBe(1);
  });

  it('treats any existing capture-gap document as a gap, including malformed data', async () => {
    expect(await repository.hasStaffUsageCaptureGap('2030-10')).toBe(false);
    await db
      .collection(BUSINESS_DELIVERY_COLLECTIONS.milestones)
      .doc(staffUsageCaptureGapDocumentId('2030-10'))
      .set({ schemaVersion: 99 });
    expect(await repository.hasStaffUsageCaptureGap('2030-10')).toBe(true);
  });
});

describe('milestone acknowledgements', () => {
  it('starts empty', async () => {
    expect(await repository.milestoneState()).toEqual({
      revision: 0,
      acknowledgements: {}
    });
  });

  it('records a launch once with an append-only log entry', async () => {
    expect(await repository.acknowledge(command())).toEqual({
      revision: 1,
      replayed: false
    });
    expect(await repository.milestoneState()).toEqual({
      revision: 1,
      acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } }
    });
    const log = await db.collection(MILESTONE_ACKNOWLEDGEMENT_LOG).get();
    expect(log.size).toBe(1);
    expect(log.docs[0]!.data()).toMatchObject({
      milestoneId: 'formal_launch',
      revision: 1,
      evidenceRef: 'evidence_ref_01',
      acknowledgedAt: '2030-10-20T00:00:00.000Z',
      policyVersion: 'BD-POLICY-2026-09-29'
    });
  });

  it('replays the same request without a second write', async () => {
    await repository.acknowledge(command());
    expect(await repository.acknowledge(command())).toEqual({
      revision: 1,
      replayed: true
    });
    expect(
      (await db.collection(MILESTONE_ACKNOWLEDGEMENT_LOG).get()).size
    ).toBe(1);
  });

  it('rejects the same key with a different payload', async () => {
    await repository.acknowledge(command());
    await expect(
      repository.acknowledge(command({ evidenceRef: 'evidence_ref_02' }))
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a stale version and a second launch', async () => {
    await repository.acknowledge(command());
    await expect(
      repository.acknowledge(command({ idempotencyKey: 'ack-key-0000000002' }))
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      repository.acknowledge(
        command({ idempotencyKey: 'ack-key-0000000002', expectedVersion: 1 })
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('blocks the final payment until one formal month has passed', async () => {
    await repository.acknowledge(command());
    const payment = {
      milestoneId: 'final_payment' as const,
      idempotencyKey: 'ack-key-0000000003',
      expectedVersion: 1,
      evidenceRef: 'evidence_ref_03'
    };
    const { launchDate: _unused, ...withoutLaunch } = command();
    await expect(
      repository.acknowledge({
        ...withoutLaunch,
        ...payment,
        now: '2030-11-14T15:59:59.999Z'
      })
    ).rejects.toBeInstanceOf(DomainError);
    expect(
      await repository.acknowledge({
        ...withoutLaunch,
        ...payment,
        now: '2030-11-14T16:00:00.000Z'
      })
    ).toEqual({ revision: 2, replayed: false });
    expect((await repository.milestoneState()).acknowledgements).toEqual({
      formalLaunch: { launchDate: '2030-10-15' },
      finalPayment: { acknowledgedAt: '2030-11-14T16:00:00.000Z' }
    });
  });

  it('lets only one of two concurrent confirmations win', async () => {
    const results = await Promise.allSettled([
      repository.acknowledge(
        command({ idempotencyKey: 'ack-key-race-000001' })
      ),
      repository.acknowledge(command({ idempotencyKey: 'ack-key-race-000002' }))
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      (await db.collection(MILESTONE_ACKNOWLEDGEMENT_LOG).get()).size
    ).toBe(1);
  });
});
