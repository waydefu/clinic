import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CalendarPilotApplicationService } from '../../apps/api/src/calendar/calendar-pilot.application-service.js';
import { ClinicCalendarReviewApplicationService } from '../../apps/api/src/calendar/clinic-calendar-review.application-service.js';
import {
  COLLECTIONS as BOOKING_COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import { FirestoreCalendarPilotRepository } from '../../apps/api/src/firestore/calendar-pilot.repository.js';
import { FirestoreClinicCalendarCandidateStore } from '../../apps/api/src/firestore/clinic-calendar-review.repository.js';
import { rescheduleAppointmentIdempotency } from '../../apps/api/src/idempotency/appointment-idempotency.js';
import { ConflictError } from '../../apps/api/src/platform/errors/api-error.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

// The review clock sits inside the booking horizon of the 2030 slots below and
// is not the wall clock, so these tests do not depend on when they run.
const NOW = '2029-12-15T09:00:00.000Z';
const APPOINTMENT_ID = 'appointment_001';
const CANDIDATE_ID = 'candidate_clinic_001';
const SLOT_FROM = 'slot_20300102_1200';
const SLOT_TO = 'slot_20300102_1230';
const SLOT_OTHER = 'slot_20300102_1300';
const FROM_STARTS_AT = '2030-01-02T04:00:00.000Z';
const TO_STARTS_AT = '2030-01-02T04:30:00.000Z';
const OTHER_STARTS_AT = '2030-01-02T05:00:00.000Z';
const PILOT_COLLECTIONS = [
  'calendar_pilot_configuration',
  'calendar_pilot_candidates',
  'calendar_pilot_idempotency',
  'calendar_pilot_audit_events',
  'calendar_pilot_outbox'
] as const;
const MANAGER = { actorId: 'manager_001', actorRole: 'manager' as const };
const FRONT_DESK = {
  actorId: 'front_desk_001',
  actorRole: 'front_desk' as const
};

let app: App;
let db: Firestore;

function reviewService(firestore: Firestore) {
  return new ClinicCalendarReviewApplicationService(
    new FirestoreClinicCalendarCandidateStore(
      firestore,
      new FirestoreBookingRepository(firestore)
    ),
    () => NOW
  );
}

function review(
  service: ClinicCalendarReviewApplicationService,
  action: 'accept' | 'reject',
  idempotencyKey: string,
  authentication: typeof MANAGER | typeof FRONT_DESK = MANAGER,
  expectedVersion = 1
) {
  return service.tryReview({
    candidateId: CANDIDATE_ID,
    action,
    command: { idempotencyKey, expectedVersion },
    authentication
  });
}

/**
 * Lets a test run a rival request exactly at a transaction boundary of the
 * review under test, so the interleaving is deterministic instead of a race.
 */
function withTransactionBoundaryHooks(
  raw: Firestore,
  hooks: {
    readonly beforeFirstTransaction?: () => Promise<void>;
    readonly afterFirstTransaction?: () => Promise<void>;
  }
): Firestore {
  let started = 0;
  return new Proxy(raw, {
    get(target, property) {
      if (property === 'runTransaction') {
        return async (
          ...args: Parameters<Firestore['runTransaction']>
        ): Promise<unknown> => {
          const isFirst = started === 0;
          started += 1;
          if (isFirst) await hooks.beforeFirstTransaction?.();
          const result = await target.runTransaction(...args);
          if (isFirst) await hooks.afterFirstTransaction?.();
          return result;
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    }
  });
}

async function wipe(): Promise<void> {
  for (const collection of [
    ...Object.values(BOOKING_COLLECTIONS),
    ...PILOT_COLLECTIONS
  ]) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seed(): Promise<void> {
  await db.collection(BOOKING_COLLECTIONS.slots).doc(SLOT_FROM).set({
    kind: 'initial',
    startsAt: FROM_STARTS_AT,
    reservationId: APPOINTMENT_ID
  });
  await db
    .collection(BOOKING_COLLECTIONS.slots)
    .doc(SLOT_TO)
    .set({ kind: 'initial', startsAt: TO_STARTS_AT });
  await db
    .collection(BOOKING_COLLECTIONS.slots)
    .doc(SLOT_OTHER)
    .set({ kind: 'initial', startsAt: OTHER_STARTS_AT });
  await db
    .collection(BOOKING_COLLECTIONS.appointments)
    .doc(APPOINTMENT_ID)
    .set({
      slotId: SLOT_FROM,
      startsAt: FROM_STARTS_AT,
      patientId: 'patient_001',
      bookingKind: 'initial',
      status: 'confirmed'
    });
  await db
    .collection(BOOKING_COLLECTIONS.patientBookingGuards)
    .doc('patient_001')
    .set({
      activeAppointmentId: APPOINTMENT_ID,
      status: 'confirmed',
      updatedAt: '2029-12-01T08:00:00.000Z'
    });
  await db
    .collection('calendar_pilot_candidates')
    .doc(CANDIDATE_ID)
    .set({
      candidateId: CANDIDATE_ID,
      kind: 'update_appointment',
      status: 'pending',
      displayLabel: '合成診所預約',
      startsAt: TO_STARTS_AT,
      endsAt: '2030-01-02T05:00:00.000Z',
      sourceId: 'calendar_source_synthetic',
      sourceVersion: 1,
      expectedVersion: 1,
      validationErrors: [],
      createdAt: '2029-12-01T08:00:00.000Z',
      before: {
        kind: 'appointment',
        displayLabel: '合成診所預約',
        startsAt: FROM_STARTS_AT,
        endsAt: TO_STARTS_AT
      },
      appointmentId: APPOINTMENT_ID,
      localRecordId: APPOINTMENT_ID,
      changedFields: ['startsAt', 'endsAt']
    });
}

async function snapshot() {
  const [candidate, appointment, from, to, other, audits] = await Promise.all([
    db.collection('calendar_pilot_candidates').doc(CANDIDATE_ID).get(),
    db.collection(BOOKING_COLLECTIONS.appointments).doc(APPOINTMENT_ID).get(),
    db.collection(BOOKING_COLLECTIONS.slots).doc(SLOT_FROM).get(),
    db.collection(BOOKING_COLLECTIONS.slots).doc(SLOT_TO).get(),
    db.collection(BOOKING_COLLECTIONS.slots).doc(SLOT_OTHER).get(),
    db.collection('calendar_pilot_audit_events').get()
  ]);
  return {
    candidate: candidate.data(),
    appointment: appointment.data(),
    reservation: {
      from: from.data()?.['reservationId'],
      to: to.data()?.['reservationId'],
      other: other.data()?.['reservationId']
    },
    candidateAuditCount: audits.size
  };
}

/** The decision either happened completely or not at all. */
async function expectAllOrNothing(): Promise<
  Awaited<ReturnType<typeof snapshot>>
> {
  const state = await snapshot();
  const status = state.candidate?.['status'];
  const version = state.candidate?.['expectedVersion'];
  // Exactly one version bump and one audit event per decided candidate.
  expect(version).toBe(2);
  expect(state.candidateAuditCount).toBe(1);
  if (status === 'accepted') {
    expect(state.appointment).toMatchObject({
      slotId: SLOT_TO,
      startsAt: TO_STARTS_AT
    });
    expect(state.reservation).toEqual({
      from: undefined,
      to: APPOINTMENT_ID,
      other: undefined
    });
  } else {
    // A rejected or superseded candidate must leave the appointment alone.
    expect(state.appointment?.['startsAt']).not.toBe(TO_STARTS_AT);
    expect(state.reservation.to).toBeUndefined();
  }
  return state;
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `clinic-review-atomicity-${Date.now()}`
  );
  db = getFirestore(app);
});

beforeEach(async () => {
  await wipe();
  await seed();
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('clinic Calendar review commits the whole decision or nothing (AUD-03)', () => {
  it('does not leave a moved appointment behind when a reject wins between the steps of an approval', async () => {
    const rival = reviewService(db);
    let rivalOutcome: unknown;
    const approving = reviewService(
      withTransactionBoundaryHooks(db, {
        afterFirstTransaction: async () => {
          // A second reviewer rejects the same candidate right after the first
          // transaction of the approval committed.
          rivalOutcome = await review(
            rival,
            'reject',
            'rival_reject_0001',
            FRONT_DESK
          ).then(
            (response) => response,
            (error: unknown) => error
          );
        }
      })
    );

    const outcome = await review(approving, 'accept', 'approve_0001').then(
      (response) => response,
      (error: unknown) => error
    );

    const state = await expectAllOrNothing();
    // The rival either decided the candidate or reported that it was too late.
    if (rivalOutcome instanceof Error)
      expect(rivalOutcome).toBeInstanceOf(ConflictError);
    // Whoever lost reported it instead of leaving a half-applied decision.
    if (state.candidate?.['status'] === 'accepted') {
      expect(outcome).toMatchObject({ candidate: { status: 'accepted' } });
    } else {
      expect(outcome).toBeInstanceOf(ConflictError);
    }
  });

  it('does not overwrite an appointment that changed after the candidate was read', async () => {
    const rival = new FirestoreBookingRepository(db);
    const approving = reviewService(
      withTransactionBoundaryHooks(db, {
        beforeFirstTransaction: async () => {
          // Another staff member moves the appointment to a third slot.
          await rival.reschedule({
            appointmentId: APPOINTMENT_ID,
            targetSlotId: SLOT_OTHER,
            audit: {
              actorId: 'front_desk_002',
              actorRole: 'front_desk',
              correlationId: 'corr_rival_move',
              source: 'api',
              reasonCode: null,
              policyVersion: null
            },
            requestedAt: NOW,
            idempotency: rescheduleAppointmentIdempotency({
              key: 'rival_move_0001',
              actorId: 'front_desk_002',
              appointmentId: APPOINTMENT_ID,
              targetSlotId: SLOT_OTHER
            })
          });
        }
      })
    );

    const response = await review(approving, 'accept', 'approve_0002');

    const state = await snapshot();
    expect(response?.candidate.status).toBe('superseded');
    expect(state.appointment).toMatchObject({
      slotId: SLOT_OTHER,
      startsAt: OTHER_STARTS_AT
    });
    expect(state.reservation).toEqual({
      from: undefined,
      to: undefined,
      other: APPOINTMENT_ID
    });
    expect(state.candidate).toMatchObject({
      status: 'superseded',
      expectedVersion: 2
    });
    expect(state.candidateAuditCount).toBe(1);
  });

  it('keeps every concurrent approve and reject all-or-nothing', async () => {
    for (let round = 0; round < 6; round += 1) {
      if (round > 0) {
        await wipe();
        await seed();
      }
      const approve = reviewService(db);
      const reject = reviewService(db);
      const outcomes = await Promise.allSettled([
        review(approve, 'accept', `race_approve_${round}`),
        review(reject, 'reject', `race_reject_${round}`, FRONT_DESK)
      ]);

      await expectAllOrNothing();
      // Exactly one of the two requests was decided; the other saw a conflict.
      expect(
        outcomes.filter(({ status }) => status === 'fulfilled')
      ).toHaveLength(1);
      for (const outcome of outcomes)
        if (outcome.status === 'rejected')
          expect(outcome.reason).toBeInstanceOf(ConflictError);
    }
  });
});

async function writeCounts() {
  const [appointmentAudits, outbox, candidateAudits] = await Promise.all([
    db.collection(BOOKING_COLLECTIONS.auditEvents).get(),
    db.collection(BOOKING_COLLECTIONS.outboxJobs).get(),
    db.collection('calendar_pilot_audit_events').get()
  ]);
  return {
    appointmentAudits: appointmentAudits.size,
    // Appointment projection jobs and the Calendar restore job of a rejection.
    outboxJobs: outbox.size,
    candidateAudits: candidateAudits.size
  };
}

describe('clinic Calendar review replays the original result for the same key (AUD-09)', () => {
  it('answers a retried approval with the first result and writes nothing again', async () => {
    const service = reviewService(db);
    const first = await review(service, 'accept', 'approve_replay_0001');
    const written = await writeCounts();
    const state = await snapshot();

    const replay = await review(service, 'accept', 'approve_replay_0001');

    expect(first?.candidate).toMatchObject({
      status: 'accepted',
      expectedVersion: 2
    });
    expect(replay).toEqual(first);
    expect(await writeCounts()).toEqual(written);
    expect(await snapshot()).toEqual(state);
  });

  it('answers a retried rejection with the first result and queues one restore', async () => {
    const service = reviewService(db);
    const first = await review(service, 'reject', 'reject_replay_0001');
    const written = await writeCounts();

    const replay = await review(service, 'reject', 'reject_replay_0001');

    expect(first?.candidate).toMatchObject({
      status: 'rejected',
      expectedVersion: 2
    });
    expect(replay).toEqual(first);
    expect(written).toEqual({
      appointmentAudits: 0,
      outboxJobs: 1,
      candidateAudits: 1
    });
    expect(await writeCounts()).toEqual(written);
  });

  it('replays a decision that found the candidate stale instead of re-deciding it', async () => {
    await db
      .collection(BOOKING_COLLECTIONS.appointments)
      .doc(APPOINTMENT_ID)
      .update({ slotId: SLOT_OTHER, startsAt: OTHER_STARTS_AT });
    const service = reviewService(db);
    const first = await review(service, 'accept', 'stale_replay_0001');
    const replay = await review(service, 'accept', 'stale_replay_0001');

    expect(first?.candidate.status).toBe('superseded');
    expect(replay).toEqual(first);
    expect((await writeCounts()).candidateAudits).toBe(1);
  });

  it('rejects the same key reused for different content', async () => {
    const service = reviewService(db);
    const original = await db
      .collection('calendar_pilot_candidates')
      .doc(CANDIDATE_ID)
      .get();
    await db
      .collection('calendar_pilot_candidates')
      .doc('candidate_clinic_002')
      .set({ ...original.data(), candidateId: 'candidate_clinic_002' });
    await review(service, 'accept', 'reused_key_0001');
    const written = await writeCounts();
    const state = await snapshot();

    await expect(
      review(service, 'reject', 'reused_key_0001')
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      review(service, 'accept', 'reused_key_0001', MANAGER, 2)
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.tryReview({
        candidateId: 'candidate_clinic_002',
        action: 'accept',
        command: { idempotencyKey: 'reused_key_0001', expectedVersion: 1 },
        authentication: MANAGER
      })
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await writeCounts()).toEqual(written);
    expect(await snapshot()).toEqual(state);
  });

  it('still reports a genuinely stale version as a conflict', async () => {
    const service = reviewService(db);
    await review(service, 'accept', 'decided_0001');
    const written = await writeCounts();

    // A new key against the already decided candidate is not a retry.
    await expect(
      review(service, 'accept', 'decided_0002')
    ).rejects.toBeInstanceOf(ConflictError);
    // Another reviewer cannot borrow the first reviewer's key to read the result.
    await expect(
      review(service, 'accept', 'decided_0001', FRONT_DESK)
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await writeCounts()).toEqual(written);
  });

  it('reports a wrong first-time version without writing anything', async () => {
    const service = reviewService(db);
    const state = await snapshot();

    await expect(
      review(service, 'accept', 'wrong_version_0001', MANAGER, 9)
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await snapshot()).toEqual(state);
    expect(await writeCounts()).toEqual({
      appointmentAudits: 0,
      outboxJobs: 0,
      candidateAudits: 0
    });
  });

  it('replays a retried rejection of an unmatched Calendar event', async () => {
    await db
      .collection('calendar_pilot_candidates')
      .doc(CANDIDATE_ID)
      .set({
        candidateId: CANDIDATE_ID,
        kind: 'unmatched',
        status: 'unmatched',
        displayLabel: '合成未對應事件',
        startsAt: null,
        endsAt: null,
        sourceId: 'calendar_source_synthetic',
        sourceVersion: 1,
        expectedVersion: 1,
        validationErrors: ['time_missing'],
        createdAt: '2029-12-01T08:00:00.000Z',
        before: null
      });
    const service = reviewService(db);

    const first = await review(service, 'reject', 'unmatched_replay_0001');
    const replay = await review(service, 'reject', 'unmatched_replay_0001');

    expect(first?.candidate).toMatchObject({
      status: 'rejected',
      expectedVersion: 2
    });
    expect(replay).toEqual(first);
    expect((await writeCounts()).candidateAudits).toBe(1);
  });

  it('keeps the CAL-PILOT replay able to answer a clinic decision once the appointment row is gone', async () => {
    // The clinic path records its result with the CAL-PILOT key and
    // fingerprint scheme, so the replay branch of either path answers it.
    await db.collection('calendar_pilot_configuration').doc('active').set({
      activeSourceId: 'calendar_source_synthetic',
      version: 1,
      expiresAt: '2031-01-01T00:00:00.000Z',
      health: 'healthy',
      lastSuccessfulSyncAt: NOW,
      nextScheduledSyncAt: NOW,
      inboundEnabled: true,
      outboundEnabled: true
    });
    const service = new CalendarPilotApplicationService(
      new FirestoreCalendarPilotRepository(db),
      { nowUtc: () => NOW },
      reviewService(db)
    );
    const request = { idempotencyKey: 'cross_path_0001', expectedVersion: 1 };

    const first = await service.reviewCandidate(
      CANDIDATE_ID,
      'accept',
      request,
      MANAGER
    );
    await db
      .collection(BOOKING_COLLECTIONS.appointments)
      .doc(APPOINTMENT_ID)
      .delete();
    const replay = await service.reviewCandidate(
      CANDIDATE_ID,
      'accept',
      request,
      MANAGER
    );

    expect(first.candidate.status).toBe('accepted');
    expect(replay).toEqual(first);
  });
});
