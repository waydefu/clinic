import { NotFoundException } from '@nestjs/common';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type Firestore
} from 'firebase-admin/firestore';
import {
  resolveApprovedBusinessDeliveryPolicy,
  type BookingRequest
} from '@beauessence/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import {
  FirestoreBusinessRetentionRepository,
  RETENTION_COLLECTIONS,
  type ConfirmArchivedIdentityCommand
} from '../../apps/api/src/firestore/business-delivery-retention.repository.js';
import { createAppointmentIdempotency } from '../../apps/api/src/idempotency/appointment-idempotency.js';
import {
  FirestorePatientDirectory,
  opaqueLookupIdentity,
  PATIENT_COLLECTIONS
} from '../../apps/api/src/patients/patient-directory.js';
import { ConflictError } from '../../apps/api/src/platform/errors/api-error.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

// CP-05 stage 2b: a manager confirms that a flagged provisional patient is the
// archived patient who returned. Synthetic data only; the whole relink is one
// transaction, nothing is deleted, and every stale input fails closed.
requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const MANAGER_REF = 'c'.repeat(64);
const PHONE = '0900000601';
const NAME = '合成患者乙';
const ARCHIVE_AT = '2029-12-10T09:00:00.000Z';
const REQUESTED_AT = '2029-12-15T09:00:00.000Z';
const CONFIRM_NOW = '2029-12-20T00:00:00.000Z';
const SLOT_ID = 'slot_20300102_1200';
const OTHER_SLOT_ID = 'slot_20300102_1230';
const OLD_ID = 'patient_relink_archived_old';
const PENDING_ID = 'patient_relink_pending_new';
const OLD_APPOINTMENT_ID = 'appointment_relink_old';
const NEW_APPOINTMENT_ID = 'appointment_relink_new';
const SECOND_APPOINTMENT_ID = 'appointment_relink_second';
const CONFIRM_KEY = 'confirm-identity-key-0001';

let app: App;
let db: Firestore;
let bookings: FirestoreBookingRepository;
let retention: FirestoreBusinessRetentionRepository;
let directory: FirestorePatientDirectory;

const identity = {
  name: NAME,
  phone: PHONE,
  birthDate: '--02-29',
  nationality: 'domestic' as const,
  privacyConsent: true as const
};
const LOOKUP_ID = opaqueLookupIdentity(PHONE, identity.birthDate);

function confirmCommand(
  overrides: Partial<ConfirmArchivedIdentityCommand> = {}
): ConfirmArchivedIdentityCommand {
  return {
    idempotencyKey: CONFIRM_KEY,
    patientId: OLD_ID,
    provisionalPatientId: PENDING_ID,
    reasonCode: 'duplicate_record',
    actorRef: MANAGER_REF,
    now: CONFIRM_NOW,
    scope: 'internal_synthetic',
    policy: POLICY,
    ...overrides
  };
}

function bookingRequest(input: {
  readonly patientId: string;
  readonly appointmentId: string;
  readonly slotId?: string;
  readonly idempotencyKey: string;
}): BookingRequest {
  const request: Omit<BookingRequest, 'idempotency'> = {
    appointmentId: input.appointmentId,
    slotId: input.slotId ?? SLOT_ID,
    patientId: input.patientId,
    bookingKind: 'initial',
    itemId: 'service_snoring',
    audit: {
      actorId: 'actor_front_desk_001',
      actorRole: 'test_front_desk',
      correlationId: `corr_${input.idempotencyKey}`,
      source: 'api',
      reasonCode: null,
      policyVersion: null
    },
    requestedAt: REQUESTED_AT
  };
  return {
    ...request,
    idempotency: createAppointmentIdempotency({
      key: input.idempotencyKey,
      actorId: request.audit.actorId,
      patientId: request.patientId,
      slotId: request.slotId,
      bookingKind: request.bookingKind,
      itemId: request.itemId
    })
  };
}

const COLLECTION_NAMES = [
  ...Object.values(COLLECTIONS),
  PATIENT_COLLECTIONS.patients,
  PATIENT_COLLECTIONS.lookupIndex,
  PATIENT_COLLECTIONS.returnSessions,
  RETENTION_COLLECTIONS.log
];

async function snapshotAll(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  for (const collection of COLLECTION_NAMES) {
    const snapshot = await db.collection(collection).get();
    state[collection] = Object.fromEntries(
      snapshot.docs.map((document) => [document.id, document.data()])
    );
  }
  return state;
}

async function wipe(): Promise<void> {
  for (const collection of COLLECTION_NAMES) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seedSlots(): Promise<void> {
  await db.collection(COLLECTIONS.slots).doc(SLOT_ID).set({
    kind: 'initial',
    startsAt: '2030-01-02T04:00:00.000Z'
  });
  await db.collection(COLLECTIONS.slots).doc(OTHER_SLOT_ID).set({
    kind: 'initial',
    startsAt: '2030-01-02T04:30:00.000Z'
  });
}

/** An archived patient with one old completed visit, as the archive job leaves it. */
async function seedArchivedOld(): Promise<void> {
  await directory.resolveFromIntake(
    identity,
    '2027-12-10T09:00:00.000Z',
    () => OLD_ID
  );
  await db.collection(COLLECTIONS.appointments).doc(OLD_APPOINTMENT_ID).set({
    patientId: OLD_ID,
    slotId: 'slot_20281201_1200',
    bookingKind: 'initial',
    status: 'completed',
    startsAt: '2028-12-01T04:00:00.000Z'
  });
  await retention.archive({
    idempotencyKey: 'archive-relink-old-0001',
    patientId: OLD_ID,
    actorRef: MANAGER_REF,
    now: ARCHIVE_AT,
    scope: 'internal_synthetic',
    policy: POLICY
  });
}

/** Archived old record plus a flagged provisional record with one booking. */
async function seedFlagged(): Promise<void> {
  await seedArchivedOld();
  const prepared = await directory.prepareIntake(
    identity,
    REQUESTED_AT,
    () => PENDING_ID
  );
  await bookings.reserve(
    bookingRequest({
      patientId: PENDING_ID,
      appointmentId: NEW_APPOINTMENT_ID,
      idempotencyKey: 'booking-relink-new-0001'
    }),
    prepared
  );
}

function patientDoc(id: string) {
  return db.collection(PATIENT_COLLECTIONS.patients).doc(id);
}

async function patientData(id: string): Promise<Record<string, unknown>> {
  const snapshot = await patientDoc(id).get();
  expect(snapshot.exists).toBe(true);
  return snapshot.data() ?? {};
}

async function appointmentData(id: string): Promise<Record<string, unknown>> {
  return (
    (await db.collection(COLLECTIONS.appointments).doc(id).get()).data() ?? {}
  );
}

/** A confirm that must fail closed: error type and byte-identical state. */
async function expectRejectedUnchanged(
  command: ConfirmArchivedIdentityCommand,
  error: new () => Error = ConflictError
): Promise<void> {
  const before = await snapshotAll();
  await expect(
    retention.confirmArchivedIdentity(command)
  ).rejects.toBeInstanceOf(error);
  expect(await snapshotAll()).toEqual(before);
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `patient-identity-relink-${Date.now()}`
  );
  db = getFirestore(app);
  bookings = new FirestoreBookingRepository(db);
  retention = new FirestoreBusinessRetentionRepository(db);
  directory = new FirestorePatientDirectory(db);
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await seedSlots();
});

describe('manager-confirmed archived identity restore and relink', () => {
  it('restores the archived record, moves the bookings and retires the provisional record in one step', async () => {
    await seedFlagged();
    await db
      .collection(PATIENT_COLLECTIONS.returnSessions)
      .doc('rs_relink_pending')
      .set({
        patientId: PENDING_ID,
        createdAt: REQUESTED_AT,
        expiresAt: '2030-12-31T00:00:00.000Z'
      });
    await expect(
      directory.readReturnSession('rs_relink_pending', CONFIRM_NOW)
    ).resolves.toBe(PENDING_ID);

    await expect(
      retention.confirmArchivedIdentity(confirmCommand())
    ).resolves.toEqual({
      patientId: OLD_ID,
      provisionalPatientId: PENDING_ID,
      state: 'active'
    });

    const restored = await patientData(OLD_ID);
    expect(restored).toMatchObject({ name: NAME, updatedAt: CONFIRM_NOW });
    for (const field of ['archivedAt', 'archivedByRef', 'restorableUntil']) {
      expect(restored).not.toHaveProperty(field);
    }
    const retired = await patientData(PENDING_ID);
    expect(retired).toMatchObject({
      archivedAt: CONFIRM_NOW,
      archivedByRef: MANAGER_REF,
      retiredIntoPatientId: OLD_ID
    });
    for (const field of [
      'identityReviewRequired',
      'pendingArchivedPatientIds'
    ]) {
      expect(retired).not.toHaveProperty(field);
    }

    expect(await appointmentData(NEW_APPOINTMENT_ID)).toMatchObject({
      patientId: OLD_ID
    });
    expect(await appointmentData(NEW_APPOINTMENT_ID)).not.toHaveProperty(
      'identityReviewRequired'
    );
    expect(await appointmentData(OLD_APPOINTMENT_ID)).not.toHaveProperty(
      'patientArchived'
    );
    // The booking guard follows the bookings; nothing is left under the old id.
    const guards = db.collection(COLLECTIONS.patientBookingGuards);
    expect((await guards.doc(OLD_ID).get()).data()).toMatchObject({
      activeAppointmentIds: [NEW_APPOINTMENT_ID]
    });
    expect((await guards.doc(PENDING_ID).get()).exists).toBe(false);
    expect(
      (
        await db
          .collection(PATIENT_COLLECTIONS.lookupIndex)
          .doc(LOOKUP_ID)
          .get()
      ).data()?.['patientIds']
    ).toEqual([OLD_ID]);

    // Audit: manager actor and reason, opaque ids only, no contact or name.
    const logs = await db.collection(RETENTION_COLLECTIONS.log).get();
    const entry = logs.docs.find((document) =>
      document.id.startsWith('confirm_identity_')
    );
    expect(entry?.data()).toMatchObject({
      action: 'confirm_identity',
      patientId: OLD_ID,
      actorRef: MANAGER_REF,
      reasonCode: 'duplicate_record',
      at: CONFIRM_NOW,
      result: {
        patientId: OLD_ID,
        provisionalPatientId: PENDING_ID,
        state: 'active'
      }
    });
    const logJson = JSON.stringify(entry?.data());
    expect(logJson).not.toContain(NAME);
    expect(logJson).not.toContain(PHONE);
    // Nothing is deleted, and no archive reference reaches the outbox.
    expect((await patientDoc(PENDING_ID).get()).exists).toBe(true);
    const outbox = JSON.stringify(
      (await db.collection(COLLECTIONS.outboxJobs).get()).docs.map((document) =>
        document.data()
      )
    );
    expect(outbox).not.toContain(OLD_ID);
    expect(outbox).not.toContain(PENDING_ID);

    // Staff list and patient-side reads follow the restored record only.
    const listed = await directory.listClinic(10);
    expect(listed.map((row) => row.appointmentId)).toEqual([
      OLD_APPOINTMENT_ID,
      NEW_APPOINTMENT_ID
    ]);
    expect(JSON.stringify(listed)).not.toContain('identityReviewRequired');
    expect(
      (await directory.listByPatient(OLD_ID, 10)).map(
        (row) => row.appointmentId
      )
    ).toEqual([OLD_APPOINTMENT_ID, NEW_APPOINTMENT_ID]);
    expect(await directory.listByPatient(PENDING_ID, 10)).toEqual([]);
    // The old provisional return session no longer authorizes anything.
    await expect(
      directory.readReturnSession('rs_relink_pending', CONFIRM_NOW)
    ).resolves.toBeUndefined();

    // A later booking by the same person reuses the restored record, unflagged.
    const next = await directory.prepareIntake(identity, REQUESTED_AT, () => {
      throw new Error('must not allocate another identity');
    });
    expect(next.patientId).toBe(OLD_ID);
    await bookings.reserve(
      bookingRequest({
        patientId: OLD_ID,
        appointmentId: SECOND_APPOINTMENT_ID,
        slotId: OTHER_SLOT_ID,
        idempotencyKey: 'booking-relink-second-0001'
      }),
      next
    );
    expect(await appointmentData(SECOND_APPOINTMENT_ID)).not.toHaveProperty(
      'identityReviewRequired'
    );
  });

  it('keeps another patient out of the restored history', async () => {
    await seedFlagged();
    await directory.resolveFromIntake(
      { ...identity, phone: '0900000699', name: '合成患者丙' },
      REQUESTED_AT,
      () => 'patient_relink_unrelated'
    );
    await db
      .collection(PATIENT_COLLECTIONS.returnSessions)
      .doc('rs_relink_unrelated')
      .set({
        patientId: 'patient_relink_unrelated',
        createdAt: REQUESTED_AT,
        expiresAt: '2030-12-31T00:00:00.000Z'
      });
    await retention.confirmArchivedIdentity(confirmCommand());
    await expect(
      directory.readReturnSession('rs_relink_unrelated', CONFIRM_NOW)
    ).resolves.toBe('patient_relink_unrelated');
    expect(
      await directory.listByPatient('patient_relink_unrelated', 10)
    ).toEqual([]);
  });

  it('replays the same command once and rejects reused or repeated keys', async () => {
    await seedFlagged();
    const first = await retention.confirmArchivedIdentity(confirmCommand());
    const after = await snapshotAll();
    await expect(
      retention.confirmArchivedIdentity(confirmCommand())
    ).resolves.toEqual(first);
    expect(await snapshotAll()).toEqual(after);
    const logs = await db.collection(RETENTION_COLLECTIONS.log).get();
    expect(
      logs.docs.filter((document) =>
        document.id.startsWith('confirm_identity_')
      )
    ).toHaveLength(1);
    // Same key, different content: refused. New key after completion: refused.
    await expect(
      retention.confirmArchivedIdentity(confirmCommand({ reasonCode: 'other' }))
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      retention.confirmArchivedIdentity(
        confirmCommand({ idempotencyKey: 'confirm-identity-key-0002' })
      )
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await snapshotAll()).toEqual(after);
  });

  it('does not bypass the existing refusal of a second active identity', async () => {
    await seedFlagged();
    await expect(
      retention.restore({
        idempotencyKey: 'restore-relink-old-0001',
        patientId: OLD_ID,
        actorRef: MANAGER_REF,
        now: CONFIRM_NOW,
        scope: 'internal_synthetic',
        policy: POLICY
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await patientData(OLD_ID)).toHaveProperty('archivedAt');
  });

  it('never restores the retired provisional record', async () => {
    await seedFlagged();
    await retention.confirmArchivedIdentity(confirmCommand());
    await expect(
      retention.restore({
        idempotencyKey: 'restore-relink-retired-1',
        patientId: PENDING_ID,
        actorRef: MANAGER_REF,
        now: CONFIRM_NOW,
        scope: 'internal_synthetic',
        policy: POLICY
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await patientData(PENDING_ID)).toHaveProperty(
      'retiredIntoPatientId',
      OLD_ID
    );
  });

  it('moves follow-up records and the follow-up state with the bookings', async () => {
    await seedFlagged();
    await db.collection(COLLECTIONS.followUps).doc(NEW_APPOINTMENT_ID).set({
      schemaVersion: 1,
      appointmentId: NEW_APPOINTMENT_ID,
      patientId: PENDING_ID,
      decision: 'required',
      dueAt: null,
      decidedAt: REQUESTED_AT
    });
    await db.collection(COLLECTIONS.followUpState).doc(PENDING_ID).set({
      required: true,
      sourceAppointmentId: NEW_APPOINTMENT_ID,
      updatedAt: REQUESTED_AT
    });
    await retention.confirmArchivedIdentity(confirmCommand());
    expect(
      (
        await db.collection(COLLECTIONS.followUps).doc(NEW_APPOINTMENT_ID).get()
      ).data()
    ).toMatchObject({ patientId: OLD_ID });
    const states = db.collection(COLLECTIONS.followUpState);
    expect((await states.doc(OLD_ID).get()).data()).toMatchObject({
      required: true,
      sourceAppointmentId: NEW_APPOINTMENT_ID
    });
    expect((await states.doc(PENDING_ID).get()).exists).toBe(false);
  });
});

describe('stale or unsafe confirmations fail closed and change nothing', () => {
  it('refuses a candidate that was permanently deleted after the review', async () => {
    await seedFlagged();
    await retention.permanentlyDelete({
      idempotencyKey: 'delete-relink-old-0001',
      patientId: OLD_ID,
      actorRef: MANAGER_REF,
      now: '2030-02-01T00:00:00.000Z',
      scope: 'internal_synthetic',
      policy: POLICY,
      reasonCode: 'other'
    });
    await expectRejectedUnchanged(confirmCommand());
    await expect(retention.identityCandidates(PENDING_ID)).resolves.toEqual({
      patientId: PENDING_ID,
      candidates: []
    });
  });

  it('refuses a candidate that was restored by another path', async () => {
    await seedFlagged();
    await patientDoc(OLD_ID).update({
      archivedAt: FieldValue.delete(),
      archivedByRef: FieldValue.delete(),
      restorableUntil: FieldValue.delete()
    });
    await expectRejectedUnchanged(confirmCommand());
  });

  it('refuses a candidate under legal hold', async () => {
    await seedFlagged();
    await retention.setLegalHold({
      idempotencyKey: 'hold-relink-old-00001',
      patientId: OLD_ID,
      actorRef: MANAGER_REF,
      now: CONFIRM_NOW,
      scope: 'internal_synthetic',
      policy: POLICY,
      hold: true,
      reasonCode: 'other'
    });
    await expectRejectedUnchanged(confirmCommand());
  });

  it('refuses an archived record the front desk never flagged', async () => {
    await seedFlagged();
    await directory.resolveFromIntake(
      { ...identity, phone: '0900000698', name: '合成患者丁' },
      '2027-12-10T09:00:00.000Z',
      () => 'patient_relink_other_archived'
    );
    await retention.archive({
      idempotencyKey: 'archive-relink-other-001',
      patientId: 'patient_relink_other_archived',
      actorRef: MANAGER_REF,
      now: ARCHIVE_AT,
      scope: 'internal_synthetic',
      policy: POLICY
    });
    await expectRejectedUnchanged(
      confirmCommand({ patientId: 'patient_relink_other_archived' })
    );
  });

  it('refuses a candidate whose stored contact no longer matches the key', async () => {
    await seedFlagged();
    await patientDoc(OLD_ID).update({ phoneDigits: '0900000602' });
    await expectRejectedUnchanged(confirmCommand());
  });

  it('refuses when another active identity holds the same key', async () => {
    await seedFlagged();
    await patientDoc('patient_relink_third').set({
      patientId: 'patient_relink_third',
      name: '合成患者戊',
      phoneDigits: PHONE,
      birthMonthDay: identity.birthDate
    });
    await db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(LOOKUP_ID)
      .update({
        patientIds: FieldValue.arrayUnion('patient_relink_third')
      });
    await expectRejectedUnchanged(confirmCommand());
  });

  it('refuses when the merged booking guard would exceed the active limit', async () => {
    await seedFlagged();
    await db
      .collection(COLLECTIONS.patientBookingGuards)
      .doc(OLD_ID)
      .set({
        activeAppointmentIds: ['appointment_relink_a', 'appointment_relink_b'],
        updatedAt: REQUESTED_AT
      });
    await expectRejectedUnchanged(confirmCommand());
  });

  it('refuses to merge two follow-up states', async () => {
    await seedFlagged();
    for (const id of [OLD_ID, PENDING_ID]) {
      await db.collection(COLLECTIONS.followUpState).doc(id).set({
        required: true,
        updatedAt: REQUESTED_AT
      });
    }
    await expectRejectedUnchanged(confirmCommand());
  });

  it('refuses a provisional record that is not flagged', async () => {
    await seedFlagged();
    await patientDoc(PENDING_ID).update({
      identityReviewRequired: FieldValue.delete()
    });
    await expectRejectedUnchanged(confirmCommand());
  });

  it('refuses the same record as both sides and an unknown provisional record', async () => {
    await seedFlagged();
    await expectRejectedUnchanged(
      confirmCommand({ provisionalPatientId: OLD_ID })
    );
    await expectRejectedUnchanged(
      confirmCommand({ provisionalPatientId: 'patient_relink_missing' }),
      NotFoundException
    );
  });
});

describe('identity candidates for the manager', () => {
  it('lists only opaque ids, dates and the hold flag for a flagged record', async () => {
    await seedFlagged();
    const result = await retention.identityCandidates(PENDING_ID);
    expect(result).toEqual({
      patientId: PENDING_ID,
      candidates: [
        { patientId: OLD_ID, archivedAt: ARCHIVE_AT, legalHold: false }
      ]
    });
    expect(JSON.stringify(result)).not.toContain(NAME);
    expect(JSON.stringify(result)).not.toContain(PHONE);
  });

  it('answers not found for an unflagged, retired or unknown record', async () => {
    await seedFlagged();
    await expect(
      retention.identityCandidates('patient_relink_missing')
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(retention.identityCandidates(OLD_ID)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await retention.confirmArchivedIdentity(confirmCommand());
    await expect(
      retention.identityCandidates(PENDING_ID)
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('races around the confirmation', () => {
  it('lets exactly one of two concurrent confirmations win', async () => {
    await seedFlagged();
    const results = await Promise.allSettled([
      retention.confirmArchivedIdentity(confirmCommand()),
      retention.confirmArchivedIdentity(
        confirmCommand({ idempotencyKey: 'confirm-identity-key-0002' })
      )
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(
      rejected !== undefined && rejected.status === 'rejected'
        ? rejected.reason
        : undefined
    ).toBeInstanceOf(ConflictError);
    const logs = await db.collection(RETENTION_COLLECTIONS.log).get();
    expect(
      logs.docs.filter((document) =>
        document.id.startsWith('confirm_identity_')
      )
    ).toHaveLength(1);
    expect(await appointmentData(NEW_APPOINTMENT_ID)).toMatchObject({
      patientId: OLD_ID
    });
  });

  it('never leaves a booking on the retired record when a new booking races the confirmation', async () => {
    await seedFlagged();
    const [confirmed, booked] = await Promise.allSettled([
      retention.confirmArchivedIdentity(confirmCommand()),
      bookings.reserve(
        bookingRequest({
          patientId: PENDING_ID,
          appointmentId: SECOND_APPOINTMENT_ID,
          slotId: OTHER_SLOT_ID,
          idempotencyKey: 'booking-relink-race-0001'
        })
      )
    ]);
    expect(confirmed.status).toBe('fulfilled');
    const appointments = await db.collection(COLLECTIONS.appointments).get();
    expect(
      appointments.docs.filter((doc) => doc.data()['patientId'] === PENDING_ID)
    ).toEqual([]);
    if (booked.status === 'fulfilled') {
      // Committed first: the confirmation then moved it too.
      expect(await appointmentData(SECOND_APPOINTMENT_ID)).toMatchObject({
        patientId: OLD_ID
      });
      expect(
        (
          await db
            .collection(COLLECTIONS.patientBookingGuards)
            .doc(OLD_ID)
            .get()
        ).data()?.['activeAppointmentIds']
      ).toHaveLength(2);
    } else {
      expect(booked.reason).toBeInstanceOf(ConflictError);
      expect(
        (
          await db
            .collection(COLLECTIONS.appointments)
            .doc(SECOND_APPOINTMENT_ID)
            .get()
        ).exists
      ).toBe(false);
    }
  });

  it('is atomic when a legal hold races the confirmation', async () => {
    await seedFlagged();
    const [confirmed] = await Promise.allSettled([
      retention.confirmArchivedIdentity(confirmCommand()),
      retention.setLegalHold({
        idempotencyKey: 'hold-relink-race-0001',
        patientId: OLD_ID,
        actorRef: MANAGER_REF,
        now: CONFIRM_NOW,
        scope: 'internal_synthetic',
        policy: POLICY,
        hold: true,
        reasonCode: 'other'
      })
    ]);
    const old = await patientData(OLD_ID);
    const retired = await patientData(PENDING_ID);
    expect(old['legalHold']).toBe(true);
    // Either both halves happened or neither did.
    expect(old['archivedAt'] === undefined).toBe(
      retired['retiredIntoPatientId'] === OLD_ID
    );
    expect(confirmed.status === 'fulfilled').toBe(
      retired['retiredIntoPatientId'] === OLD_ID
    );
  });

  it('answers a concurrent plain restore with a refusal and still relinks', async () => {
    await seedFlagged();
    const [confirmed, restored] = await Promise.allSettled([
      retention.confirmArchivedIdentity(confirmCommand()),
      retention.restore({
        idempotencyKey: 'restore-relink-race-0001',
        patientId: OLD_ID,
        actorRef: MANAGER_REF,
        now: CONFIRM_NOW,
        scope: 'internal_synthetic',
        policy: POLICY
      })
    ]);
    expect(confirmed.status).toBe('fulfilled');
    expect(restored.status).toBe('rejected');
    expect(await patientData(PENDING_ID)).toHaveProperty(
      'retiredIntoPatientId',
      OLD_ID
    );
  });

  it('lets the expiry job run before the confirmation and refuses to archive the relinked patient after it', async () => {
    await seedFlagged();
    // The job meets an already archived record: an idempotent no-op.
    await expect(
      retention.archiveExpiredPatient({
        idempotencyKey: 'auto-relink-before-0001',
        patientId: OLD_ID,
        now: '2033-01-01T00:00:00.000Z',
        scope: 'internal_synthetic',
        policy: POLICY
      })
    ).resolves.toMatchObject({ patientId: OLD_ID, state: 'archived' });
    await retention.confirmArchivedIdentity(confirmCommand());
    // The relinked booking (2030-01-02) is not two years old at this time.
    await expect(
      retention.archiveExpiredPatient({
        idempotencyKey: 'auto-relink-after-00001',
        patientId: OLD_ID,
        now: '2030-10-20T00:00:00.000Z',
        scope: 'internal_synthetic',
        policy: POLICY
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await patientData(OLD_ID)).not.toHaveProperty('archivedAt');
  });

  it('leaves the retired record to the existing manual deletion review', async () => {
    await seedFlagged();
    await retention.confirmArchivedIdentity(confirmCommand());
    await expect(
      retention.pendingDeletion('2030-02-01T00:00:00.000Z')
    ).resolves.toMatchObject({
      patients: [{ patientId: PENDING_ID, legalHold: false }]
    });
  });
});
