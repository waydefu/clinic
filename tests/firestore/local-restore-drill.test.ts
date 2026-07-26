import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentData,
  type Firestore
} from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import {
  createAppointmentIdempotency,
  transitionAppointmentIdempotency
} from '../../apps/api/src/idempotency/appointment-idempotency.js';
import type { BookingRequest } from '@beauessence/domain';

const emulatorHost = process.env['FIRESTORE_EMULATOR_HOST'];
const projectId = 'beauessence-appointment-local';
const restoreDatabaseId = 'restore-drill';

let app: App;
let source: Firestore;
let restored: Firestore;

type LogicalSnapshot = Record<
  string,
  readonly { readonly id: string; readonly data: DocumentData }[]
>;

function bookingRequest(input: {
  appointmentId: string;
  slotId: string;
  patientId: string;
  key: string;
  correlationId: string;
}): BookingRequest {
  const actorId = 'actor_restore_drill';
  return {
    appointmentId: input.appointmentId,
    slotId: input.slotId,
    patientId: input.patientId,
    bookingKind: 'initial',
    itemId: 'service_restore_drill',
    audit: {
      actorId,
      actorRole: 'test_operator',
      correlationId: input.correlationId,
      source: 'api',
      reasonCode: 'local_restore_drill',
      policyVersion: null
    },
    requestedAt: '2026-07-26T08:00:00.000Z',
    idempotency: createAppointmentIdempotency({
      key: input.key,
      actorId,
      patientId: input.patientId,
      slotId: input.slotId,
      bookingKind: 'initial',
      itemId: 'service_restore_drill'
    })
  };
}

async function wipe(db: Firestore): Promise<void> {
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
          documents.docs
            .map((document) => ({
              id: document.id,
              data: document.data()
            }))
            .sort((left, right) => left.id.localeCompare(right.id))
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

beforeAll(() => {
  if (emulatorHost === undefined) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run this suite through pnpm test:rules.'
    );
  }
  app = initializeApp({ projectId }, `local-restore-${Date.now()}`);
  source = getFirestore(app);
  restored = getFirestore(app, restoreDatabaseId);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe(source);
  await wipe(restored);
});

describe('local logical restore drill', () => {
  it('restores a clean database and verifies data, audit, idempotency, outbox and a new command', async () => {
    const sourceRepository = new FirestoreBookingRepository(source);
    const firstRequest = bookingRequest({
      appointmentId: 'appointment_restore_001',
      slotId: 'slot_restore_001',
      patientId: 'patient_restore_001',
      key: 'restore-create-001',
      correlationId: 'corr_restore_001'
    });

    await Promise.all([
      source.collection(COLLECTIONS.slots).doc('slot_restore_001').set({
        kind: 'initial',
        startsAt: '2030-01-02T04:00:00.000Z'
      }),
      source.collection(COLLECTIONS.slots).doc('slot_restore_002').set({
        kind: 'initial',
        startsAt: '2030-01-02T04:30:00.000Z'
      }),
      source.collection(COLLECTIONS.slots).doc('slot_restore_003').set({
        kind: 'initial',
        startsAt: '2030-01-02T05:00:00.000Z'
      })
    ]);
    await sourceRepository.reserve(firstRequest);

    const beforeIncident = await takeLogicalSnapshot(source);
    await wipe(source);
    expect((await source.collection(COLLECTIONS.appointments).get()).size).toBe(
      0
    );

    // The drill restores to a separate named Emulator database, preserving the
    // emptied source as the incident scene.
    await restoreLogicalSnapshot(restored, beforeIncident);
    const afterRestore = await takeLogicalSnapshot(restored);

    // V1 / V2: collection counts and every sampled field are identical.
    expect(afterRestore).toEqual(beforeIncident);

    // V3: the audit trail preceding the restore point remains present and
    // correlated to the command that created the appointment.
    const audits = await restored.collection(COLLECTIONS.auditEvents).get();
    expect(audits.docs.map((document) => document.data())).toEqual([
      expect.objectContaining({
        resourceId: 'appointment_restore_001',
        correlationId: 'corr_restore_001',
        action: 'appointment_confirmed'
      })
    ]);

    // V4: outbox and idempotency records moved with the source of truth. The
    // original request replays instead of producing a duplicate.
    expect((await restored.collection(COLLECTIONS.outboxJobs).get()).size).toBe(
      1
    );
    expect(
      (await restored.collection(COLLECTIONS.idempotencyKeys).get()).size
    ).toBe(1);
    const restoredRepository = new FirestoreBookingRepository(restored);
    await expect(restoredRepository.reserve(firstRequest)).resolves.toEqual({
      appointmentId: 'appointment_restore_001',
      replayed: true
    });

    // V5: the restored database accepts a new booking and a terminal command
    // through the real repository transaction path.
    const secondRequest = bookingRequest({
      appointmentId: 'appointment_restore_002',
      slotId: 'slot_restore_002',
      patientId: 'patient_restore_002',
      key: 'restore-create-002',
      correlationId: 'corr_restore_002'
    });
    await restoredRepository.reserve(secondRequest);
    await restoredRepository.transition({
      appointmentId: secondRequest.appointmentId,
      transition: 'complete',
      audit: {
        actorId: 'actor_restore_drill',
        actorRole: 'test_operator',
        correlationId: 'corr_restore_complete_002',
        source: 'api',
        reasonCode: 'local_restore_drill',
        policyVersion: null
      },
      requestedAt: '2026-07-26T08:30:00.000Z',
      idempotency: transitionAppointmentIdempotency({
        key: 'restore-complete-002',
        actorId: 'actor_restore_drill',
        appointmentId: secondRequest.appointmentId,
        transition: 'complete'
      })
    });
    expect(
      (
        await restored
          .collection(COLLECTIONS.appointments)
          .doc(secondRequest.appointmentId)
          .get()
      ).data()
    ).toMatchObject({ status: 'completed' });

    const thirdRequest = bookingRequest({
      appointmentId: 'appointment_restore_003',
      slotId: 'slot_restore_003',
      patientId: 'patient_restore_003',
      key: 'restore-create-003',
      correlationId: 'corr_restore_003'
    });
    await restoredRepository.reserve(thirdRequest);
    await restoredRepository.transition({
      appointmentId: thirdRequest.appointmentId,
      transition: 'cancel',
      audit: {
        actorId: 'actor_restore_drill',
        actorRole: 'test_operator',
        correlationId: 'corr_restore_cancel_003',
        source: 'api',
        reasonCode: 'local_restore_drill',
        policyVersion: null
      },
      requestedAt: '2026-07-26T08:45:00.000Z',
      idempotency: transitionAppointmentIdempotency({
        key: 'restore-cancel-003',
        actorId: 'actor_restore_drill',
        appointmentId: thirdRequest.appointmentId,
        transition: 'cancel'
      })
    });
    expect(
      (
        await restored
          .collection(COLLECTIONS.appointments)
          .doc(thirdRequest.appointmentId)
          .get()
      ).data()
    ).toMatchObject({ status: 'cancelled' });
    expect(
      (
        await restored
          .collection(COLLECTIONS.slots)
          .doc(thirdRequest.slotId)
          .get()
      ).data()
    ).toMatchObject({ reservationId: null });

    // The incident scene remains untouched while validation runs elsewhere.
    expect((await source.collection(COLLECTIONS.appointments).get()).size).toBe(
      0
    );
  });
});
