import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
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
  type ArchivePatientCommand,
  type RestorePatientCommand
} from '../../apps/api/src/firestore/business-delivery-retention.repository.js';
import {
  createAppointmentIdempotency,
  rescheduleAppointmentIdempotency
} from '../../apps/api/src/idempotency/appointment-idempotency.js';
import {
  FirestorePatientDirectory,
  PATIENT_COLLECTIONS
} from '../../apps/api/src/patients/patient-directory.js';
import { ConflictError } from '../../apps/api/src/platform/errors/api-error.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

// AUD-07 (partial): booking creation resolves the patient in one transaction
// and creates the appointment in another. If the patient is archived in
// between, the create transaction itself must refuse; otherwise the new
// appointment is attached to an archived patient without `patientArchived`
// and shows up in staff lists and exports.
requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const ACTOR_REF = 'b'.repeat(64);
// Booking time is far before the archive time so the archive's "future
// confirmed appointment" refusal never applies to the appointments below.
const REQUESTED_AT = '2029-12-15T09:00:00.000Z';
const ARCHIVE_NOW = '2030-10-20T00:00:00.000Z';
const SLOT_ID = 'slot_20300102_1200';
const OTHER_SLOT_ID = 'slot_20300102_1230';
const FOLLOW_UP_SLOT_ID = 'slot_20300102_1215';

let app: App;
let db: Firestore;
let bookings: FirestoreBookingRepository;
let retention: FirestoreBusinessRetentionRepository;
let directory: FirestorePatientDirectory;

function intake(phone: string, name: string) {
  return {
    name,
    phone,
    birthDate: '--02-29',
    nationality: 'domestic' as const,
    privacyConsent: true as const
  };
}

function archiveCommand(
  patientId: string,
  idempotencyKey: string
): ArchivePatientCommand {
  return {
    idempotencyKey,
    patientId,
    actorRef: ACTOR_REF,
    now: ARCHIVE_NOW,
    scope: 'internal_synthetic',
    policy: POLICY
  };
}

function restoreCommand(
  patientId: string,
  idempotencyKey: string
): RestorePatientCommand {
  return archiveCommand(patientId, idempotencyKey);
}

function bookingRequest(input: {
  readonly patientId: string;
  readonly appointmentId: string;
  readonly slotId?: string;
  readonly bookingKind?: 'initial' | 'follow_up';
  readonly idempotencyKey: string;
}): BookingRequest {
  const request: Omit<BookingRequest, 'idempotency'> = {
    appointmentId: input.appointmentId,
    slotId: input.slotId ?? SLOT_ID,
    patientId: input.patientId,
    bookingKind: input.bookingKind ?? 'initial',
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

/** Resolves a patient exactly the way the booking flow does before it books. */
async function resolvePatient(phone: string, id: string): Promise<string> {
  return directory.resolveFromIntake(
    intake(phone, '合成患者甲'),
    REQUESTED_AT,
    () => id
  );
}

async function snapshotBookingState(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  for (const collection of Object.values(COLLECTIONS)) {
    const snapshot = await db.collection(collection).get();
    state[collection] = Object.fromEntries(
      snapshot.docs.map((document) => [document.id, document.data()])
    );
  }
  return state;
}

async function wipe(): Promise<void> {
  for (const collection of [
    ...Object.values(COLLECTIONS),
    PATIENT_COLLECTIONS.patients,
    PATIENT_COLLECTIONS.lookupIndex,
    PATIENT_COLLECTIONS.returnSessions,
    RETENTION_COLLECTIONS.log
  ]) {
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
  await db.collection(COLLECTIONS.slots).doc(FOLLOW_UP_SLOT_ID).set({
    kind: 'follow_up',
    startsAt: '2030-01-02T04:15:00.000Z'
  });
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `booking-patient-archived-${Date.now()}`
  );
  db = getFirestore(app);
  bookings = new FirestoreBookingRepository(db);
  retention = new FirestoreBusinessRetentionRepository(db);
  directory = new FirestorePatientDirectory(db);
});

afterAll(async () => {
  // Emulator test files share a database; leave no synthetic patient data behind.
  await wipe();
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await seedSlots();
});

describe('booking create against an archived patient (AUD-07, partial)', () => {
  it('rejects a booking for a patient archived after it was resolved, and writes nothing', async () => {
    const patientId = await resolvePatient('0900000201', 'patient_arch_book_1');
    await retention.archive(archiveCommand(patientId, 'archive-key-book-0001'));
    const before = await snapshotBookingState();

    await expect(
      bookings.reserve(
        bookingRequest({
          patientId,
          appointmentId: 'appointment_arch_book_1',
          idempotencyKey: 'idem_arch_book_1'
        })
      )
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await snapshotBookingState()).toEqual(before);
    const appointments = await db.collection(COLLECTIONS.appointments).get();
    expect(appointments.size).toBe(0);
  });

  it('rejects a follow-up booking for an archived patient too, and writes nothing', async () => {
    const patientId = await resolvePatient('0900000202', 'patient_arch_book_2');
    await db.collection(COLLECTIONS.followUpState).doc(patientId).set({
      required: true,
      sourceAppointmentId: 'appointment_source_arch_2',
      sourceFollowUpId: 'follow_up_arch_2'
    });
    await retention.archive(archiveCommand(patientId, 'archive-key-book-0002'));
    const before = await snapshotBookingState();

    await expect(
      bookings.reserve(
        bookingRequest({
          patientId,
          appointmentId: 'appointment_arch_book_2',
          slotId: FOLLOW_UP_SLOT_ID,
          bookingKind: 'follow_up',
          idempotencyKey: 'idem_arch_book_2'
        })
      )
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await snapshotBookingState()).toEqual(before);
  });

  it('leaves booking unaffected for an active patient, before and after a restore', async () => {
    const patientId = await resolvePatient('0900000203', 'patient_arch_book_3');

    await expect(
      bookings.reserve(
        bookingRequest({
          patientId,
          appointmentId: 'appointment_arch_book_3a',
          idempotencyKey: 'idem_arch_book_3a'
        })
      )
    ).resolves.toMatchObject({
      appointmentId: 'appointment_arch_book_3a',
      replayed: false
    });

    // The completed appointment is past at archive time, so the archive is
    // allowed; restoring it must reopen booking.
    await retention.archive(archiveCommand(patientId, 'archive-key-book-0003'));
    await retention.restore(restoreCommand(patientId, 'restore-key-book-0003'));
    await expect(
      bookings.reserve(
        bookingRequest({
          patientId,
          appointmentId: 'appointment_arch_book_3b',
          slotId: OTHER_SLOT_ID,
          idempotencyKey: 'idem_arch_book_3b'
        })
      )
    ).resolves.toMatchObject({
      appointmentId: 'appointment_arch_book_3b',
      replayed: false
    });
    const appointments = await db.collection(COLLECTIONS.appointments).get();
    expect(appointments.size).toBe(2);
    for (const appointment of appointments.docs) {
      expect(appointment.data()['patientArchived']).toBeUndefined();
    }
  });

  it('keeps booking for a patient that has no patient record (legacy fixtures)', async () => {
    await expect(
      bookings.reserve(
        bookingRequest({
          patientId: 'patient_without_record',
          appointmentId: 'appointment_arch_book_4',
          idempotencyKey: 'idem_arch_book_4'
        })
      )
    ).resolves.toMatchObject({ replayed: false });
  });

  it('replays an already committed booking even after the patient is archived', async () => {
    const patientId = await resolvePatient('0900000204', 'patient_arch_book_5');
    const request = bookingRequest({
      patientId,
      appointmentId: 'appointment_arch_book_5',
      idempotencyKey: 'idem_arch_book_5'
    });
    await bookings.reserve(request);
    await retention.archive(archiveCommand(patientId, 'archive-key-book-0005'));

    await expect(bookings.reserve(request)).resolves.toMatchObject({
      appointmentId: 'appointment_arch_book_5',
      replayed: true
    });
    expect((await db.collection(COLLECTIONS.appointments).get()).size).toBe(1);
  });

  it('never leaves an unflagged appointment on a patient archived concurrently with a booking', async () => {
    for (let round = 0; round < 3; round += 1) {
      await wipe();
      await seedSlots();
      const patientId = await resolvePatient(
        `090000030${round}`,
        `patient_arch_race_${round}`
      );

      const [archived, booked] = await Promise.allSettled([
        retention.archive(
          archiveCommand(patientId, `archive-key-race-000${round}`)
        ),
        bookings.reserve(
          bookingRequest({
            patientId,
            appointmentId: `appointment_arch_race_${round}`,
            idempotencyKey: `idem_arch_race_${round}`
          })
        )
      ]);

      expect(archived.status).toBe('fulfilled');
      if (booked.status === 'rejected') {
        expect(booked.reason).toBeInstanceOf(ConflictError);
      }
      const patient = await db
        .collection(PATIENT_COLLECTIONS.patients)
        .doc(patientId)
        .get();
      expect(patient.data()?.['archivedAt']).toBeDefined();
      const appointments = await db
        .collection(COLLECTIONS.appointments)
        .where('patientId', '==', patientId)
        .get();
      for (const appointment of appointments.docs) {
        expect(appointment.data()['patientArchived']).toBe(true);
      }
    }
  });
});

// A past-dated confirmed appointment does not stop an archive (only a future
// confirmed or arrived one does), so it stays on the archived patient. Moving
// it to a future slot would give an archived patient a future appointment,
// which ADR-0010 item 7 forbids: archived patients stay out of booking flows.
describe('reschedule of an archived patient’s appointment (ADR-0010 item 7)', () => {
  function rescheduleRequest(input: {
    readonly appointmentId: string;
    readonly targetSlotId: string;
    readonly idempotencyKey: string;
    readonly expectedPatientId?: string;
  }) {
    return {
      appointmentId: input.appointmentId,
      targetSlotId: input.targetSlotId,
      ...(input.expectedPatientId === undefined
        ? {}
        : { expectedPatientId: input.expectedPatientId }),
      audit: {
        actorId: 'actor_front_desk_001',
        actorRole: 'test_front_desk',
        correlationId: `corr_${input.idempotencyKey}`,
        source: 'api' as const,
        reasonCode: null,
        policyVersion: null
      },
      requestedAt: REQUESTED_AT,
      idempotency: rescheduleAppointmentIdempotency({
        key: input.idempotencyKey,
        actorId: 'actor_front_desk_001',
        appointmentId: input.appointmentId,
        targetSlotId: input.targetSlotId
      })
    };
  }

  /** Books, then archives; the booking is past at archive time, so it stays. */
  async function archivedPatientWithPastConfirmedBooking(
    phone: string,
    patientId: string,
    appointmentId: string
  ): Promise<void> {
    await resolvePatient(phone, patientId);
    await bookings.reserve(
      bookingRequest({
        patientId,
        appointmentId,
        idempotencyKey: `idem_${appointmentId}`
      })
    );
    await retention.archive(
      archiveCommand(patientId, `archive-${appointmentId}`)
    );
    const appointment = await db
      .collection(COLLECTIONS.appointments)
      .doc(appointmentId)
      .get();
    // The archive flagged the row; it is still confirmed and still movable.
    expect(appointment.data()).toMatchObject({
      status: 'confirmed',
      patientArchived: true
    });
  }

  it('refuses to move it to a future slot, and writes nothing', async () => {
    await archivedPatientWithPastConfirmedBooking(
      '0900000401',
      'patient_arch_move_1',
      'appointment_arch_move_1'
    );
    const before = await snapshotBookingState();

    await expect(
      bookings.reschedule(
        rescheduleRequest({
          appointmentId: 'appointment_arch_move_1',
          targetSlotId: OTHER_SLOT_ID,
          idempotencyKey: 'idem_move_arch_1'
        })
      )
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await snapshotBookingState()).toEqual(before);
  });

  it('refuses the same move requested by the patient too', async () => {
    await archivedPatientWithPastConfirmedBooking(
      '0900000402',
      'patient_arch_move_2',
      'appointment_arch_move_2'
    );
    const before = await snapshotBookingState();

    await expect(
      bookings.reschedule(
        rescheduleRequest({
          appointmentId: 'appointment_arch_move_2',
          targetSlotId: OTHER_SLOT_ID,
          idempotencyKey: 'idem_move_arch_2',
          expectedPatientId: 'patient_arch_move_2'
        })
      )
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await snapshotBookingState()).toEqual(before);
  });

  it('keeps answering an unknown owner as not found instead of revealing the archive', async () => {
    await archivedPatientWithPastConfirmedBooking(
      '0900000403',
      'patient_arch_move_3',
      'appointment_arch_move_3'
    );

    await expect(
      bookings.reschedule(
        rescheduleRequest({
          appointmentId: 'appointment_arch_move_3',
          targetSlotId: OTHER_SLOT_ID,
          idempotencyKey: 'idem_move_arch_3',
          expectedPatientId: 'patient_someone_else'
        })
      )
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('replays a reschedule that committed before the archive', async () => {
    const patientId = await resolvePatient('0900000404', 'patient_arch_move_4');
    await bookings.reserve(
      bookingRequest({
        patientId,
        appointmentId: 'appointment_arch_move_4',
        idempotencyKey: 'idem_appointment_arch_move_4'
      })
    );
    const request = rescheduleRequest({
      appointmentId: 'appointment_arch_move_4',
      targetSlotId: OTHER_SLOT_ID,
      idempotencyKey: 'idem_move_arch_4'
    });
    await bookings.reschedule(request);
    await retention.archive(archiveCommand(patientId, 'archive-move-arch-4'));

    await expect(bookings.reschedule(request)).resolves.toMatchObject({
      appointmentId: 'appointment_arch_move_4',
      replayed: true
    });
  });

  it('still reschedules for an active patient, before and after a restore', async () => {
    const patientId = await resolvePatient('0900000405', 'patient_arch_move_5');
    await bookings.reserve(
      bookingRequest({
        patientId,
        appointmentId: 'appointment_arch_move_5',
        idempotencyKey: 'idem_appointment_arch_move_5'
      })
    );
    await expect(
      bookings.reschedule(
        rescheduleRequest({
          appointmentId: 'appointment_arch_move_5',
          targetSlotId: OTHER_SLOT_ID,
          idempotencyKey: 'idem_move_arch_5a'
        })
      )
    ).resolves.toMatchObject({ replayed: false });

    await retention.archive(archiveCommand(patientId, 'archive-move-arch-5'));
    await retention.restore(restoreCommand(patientId, 'restore-move-arch-5'));
    await expect(
      bookings.reschedule(
        rescheduleRequest({
          appointmentId: 'appointment_arch_move_5',
          targetSlotId: SLOT_ID,
          idempotencyKey: 'idem_move_arch_5b'
        })
      )
    ).resolves.toMatchObject({ replayed: false });
  });

  it('keeps rescheduling for a patient that has no patient record (legacy fixtures)', async () => {
    await bookings.reserve(
      bookingRequest({
        patientId: 'patient_without_record',
        appointmentId: 'appointment_arch_move_6',
        idempotencyKey: 'idem_appointment_arch_move_6'
      })
    );

    await expect(
      bookings.reschedule(
        rescheduleRequest({
          appointmentId: 'appointment_arch_move_6',
          targetSlotId: OTHER_SLOT_ID,
          idempotencyKey: 'idem_move_arch_6'
        })
      )
    ).resolves.toMatchObject({ replayed: false });
  });
});
