import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import {
  createAppointmentIdempotency,
  transitionAppointmentIdempotency
} from '../../apps/api/src/idempotency/appointment-idempotency.js';
import { AuditEventV2Schema } from '../../packages/contracts/src/audit.js';
import { IdempotencyRecordV1Schema } from '../../packages/contracts/src/idempotency.js';
import type { BookingRequest } from '@beauessence/domain';

// The Emulator is disposable and never holds real data. `emulators:exec` sets
// FIRESTORE_EMULATOR_HOST; refuse to run without it so this suite can never be
// pointed at a cloud project by accident.
const emulatorHost = process.env['FIRESTORE_EMULATOR_HOST'];
const projectId = 'beauessence-appointment-local';

let app: App;
let db: Firestore;
let repository: FirestoreBookingRepository;

const SLOT_ID = 'slot_20300102_1200';
const OTHER_SLOT_ID = 'slot_20300102_1230';
const PATIENT_RACE_SLOT_IDS = Array.from(
  { length: 8 },
  (_, index) => `slot_patient_race_${index}`
);

type BookingRequestOverrides = Partial<Omit<BookingRequest, 'idempotency'>> & {
  readonly idempotencyKey?: string;
};

function bookingRequest(
  overrides: BookingRequestOverrides = {}
): BookingRequest {
  const { idempotencyKey = 'idem_001', ...requestOverrides } = overrides;
  const request: Omit<BookingRequest, 'idempotency'> = {
    appointmentId: 'appointment_001',
    slotId: SLOT_ID,
    patientId: 'patient_001',
    bookingKind: 'initial',
    itemId: 'service_snoring',
    audit: {
      actorId: 'actor_front_desk_001',
      actorRole: 'test_front_desk',
      correlationId: 'corr_booking_001',
      source: 'api',
      reasonCode: null,
      policyVersion: null
    },
    requestedAt: '2026-07-21T09:00:00.000Z',
    ...requestOverrides
  };

  return {
    ...request,
    idempotency: createAppointmentIdempotency({
      key: idempotencyKey,
      actorId: request.audit.actorId,
      patientId: request.patientId,
      slotId: request.slotId,
      bookingKind: request.bookingKind,
      itemId: request.itemId
    })
  };
}

async function wipe(): Promise<void> {
  for (const collection of Object.values(COLLECTIONS)) {
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
  await db.collection(COLLECTIONS.slots).doc('slot_20300102_1215').set({
    kind: 'follow_up',
    startsAt: '2030-01-02T04:15:00.000Z'
  });
  await Promise.all(
    PATIENT_RACE_SLOT_IDS.map((slotId, index) =>
      db
        .collection(COLLECTIONS.slots)
        .doc(slotId)
        .set({
          kind: 'initial',
          startsAt: new Date(
            Date.parse('2030-01-02T05:00:00.000Z') + index * 30 * 60 * 1000
          ).toISOString()
        })
    )
  );
}

beforeAll(() => {
  if (emulatorHost === undefined)
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run this suite through pnpm test:rules.'
    );
  app = initializeApp({ projectId }, `booking-${Date.now()}`);
  db = getFirestore(app);
  repository = new FirestoreBookingRepository(db);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await seedSlots();
});

describe('booking write path in a Firestore transaction', () => {
  it('writes the appointment, slot reservation, audit event and outbox job together', async () => {
    const request = bookingRequest();
    const result = await repository.reserve(request);
    expect(result).toEqual({
      appointmentId: 'appointment_001',
      replayed: false
    });

    const appointment = await db
      .collection(COLLECTIONS.appointments)
      .doc('appointment_001')
      .get();
    const slot = await db.collection(COLLECTIONS.slots).doc(SLOT_ID).get();
    const patientGuard = await db
      .collection(COLLECTIONS.patientBookingGuards)
      .doc('patient_001')
      .get();
    const audits = await db.collection(COLLECTIONS.auditEvents).get();
    const outbox = await db.collection(COLLECTIONS.outboxJobs).get();
    const idempotency = await db
      .collection(COLLECTIONS.idempotencyKeys)
      .doc(request.idempotency.recordId)
      .get();

    expect(appointment.data()).toMatchObject({
      status: 'confirmed',
      patientId: 'patient_001',
      startsAt: '2030-01-02T04:00:00.000Z'
    });
    expect(slot.data()?.['reservationId']).toBe('appointment_001');
    expect(patientGuard.data()).toEqual({
      activeAppointmentId: 'appointment_001',
      status: 'confirmed',
      updatedAt: '2026-07-21T09:00:00.000Z'
    });
    expect(audits.size).toBe(1);
    expect(AuditEventV2Schema.parse(audits.docs[0]?.data())).toEqual({
      eventId: 'audit_appointment_001_confirmed',
      occurredAt: '2026-07-21T09:00:00.000Z',
      actorId: 'actor_front_desk_001',
      actorRole: 'test_front_desk',
      action: 'appointment_confirmed',
      resourceType: 'appointment',
      resourceId: 'appointment_001',
      before: null,
      after: {
        status: 'confirmed',
        slotId: SLOT_ID
      },
      reasonCode: null,
      result: 'succeeded',
      correlationId: 'corr_booking_001',
      source: 'api',
      policyVersion: null,
      schemaVersion: 2
    });
    expect(outbox.size).toBe(1);
    expect(outbox.docs[0]?.data()).toMatchObject({
      type: 'calendar_projection_requested',
      correlationId: 'corr_booking_001',
      causationId: 'audit_appointment_001_confirmed',
      status: 'pending',
      attempts: 0
    });
    expect(IdempotencyRecordV1Schema.parse(idempotency.data())).toEqual({
      actorId: 'actor_front_desk_001',
      scope: 'appointment:create',
      requestHash: request.idempotency.requestHash,
      responseReference: {
        resourceType: 'appointment',
        resourceId: 'appointment_001'
      },
      recordedAt: '2026-07-21T09:00:00.000Z',
      schemaVersion: 1
    });
    expect(idempotency.data()).not.toHaveProperty('key');
  });

  it('allows only one of many concurrent reservations of the same slot', async () => {
    const attempts = Array.from({ length: 8 }, (_, index) =>
      repository.reserve(
        bookingRequest({
          appointmentId: `appointment_${String(index).padStart(3, '0')}`,
          patientId: `patient_${String(index).padStart(3, '0')}`,
          idempotencyKey: `idem_${index}`
        })
      )
    );

    const settled = await Promise.allSettled(attempts);
    const won = settled.filter((entry) => entry.status === 'fulfilled');
    const lost = settled.filter((entry) => entry.status === 'rejected');

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(7);

    const appointments = await db.collection(COLLECTIONS.appointments).get();
    expect(appointments.size).toBe(1);

    // Nothing partial may survive a losing attempt.
    const outbox = await db.collection(COLLECTIONS.outboxJobs).get();
    const audits = await db.collection(COLLECTIONS.auditEvents).get();
    const patientGuards = await db
      .collection(COLLECTIONS.patientBookingGuards)
      .get();
    expect(outbox.size).toBe(1);
    expect(audits.size).toBe(1);
    expect(patientGuards.size).toBe(1);
  });

  it('allows only one concurrent booking by the same patient across different slots', async () => {
    const attempts = PATIENT_RACE_SLOT_IDS.map((slotId, index) =>
      repository.reserve(
        bookingRequest({
          appointmentId: `appointment_patient_race_${index}`,
          slotId,
          idempotencyKey: `idem_patient_race_${index}`
        })
      )
    );

    const settled = await Promise.allSettled(attempts);
    expect(
      settled.filter((entry) => entry.status === 'fulfilled')
    ).toHaveLength(1);
    expect(settled.filter((entry) => entry.status === 'rejected')).toHaveLength(
      7
    );

    const appointments = await db.collection(COLLECTIONS.appointments).get();
    const patientGuards = await db
      .collection(COLLECTIONS.patientBookingGuards)
      .get();
    const audits = await db.collection(COLLECTIONS.auditEvents).get();
    const outbox = await db.collection(COLLECTIONS.outboxJobs).get();
    const idempotencyKeys = await db
      .collection(COLLECTIONS.idempotencyKeys)
      .get();
    const reservedRaceSlots = (
      await Promise.all(
        PATIENT_RACE_SLOT_IDS.map((slotId) =>
          db.collection(COLLECTIONS.slots).doc(slotId).get()
        )
      )
    ).filter((slot) => slot.data()?.['reservationId'] !== undefined);

    expect(appointments.size).toBe(1);
    expect(patientGuards.size).toBe(1);
    expect(patientGuards.docs[0]?.data()?.['activeAppointmentId']).toBe(
      appointments.docs[0]?.id
    );
    expect(audits.size).toBe(1);
    expect(outbox.size).toBe(1);
    expect(idempotencyKeys.size).toBe(1);
    expect(reservedRaceSlots).toHaveLength(1);
  });

  it('replays the same idempotency key instead of booking twice', async () => {
    const first = await repository.reserve(bookingRequest());
    const second = await repository.reserve(bookingRequest());

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.appointmentId).toBe(first.appointmentId);

    const appointments = await db.collection(COLLECTIONS.appointments).get();
    const outbox = await db.collection(COLLECTIONS.outboxJobs).get();
    expect(appointments.size).toBe(1);
    expect(outbox.size).toBe(1);
  });

  it('rejects the same scoped key when request content changes', async () => {
    await repository.reserve(bookingRequest());

    await expect(
      repository.reserve(
        bookingRequest({
          appointmentId: 'appointment_002',
          slotId: OTHER_SLOT_ID
        })
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    expect((await db.collection(COLLECTIONS.appointments).get()).size).toBe(1);
    expect((await db.collection(COLLECTIONS.idempotencyKeys).get()).size).toBe(
      1
    );
  });

  it('scopes the same raw key independently for another actor', async () => {
    await repository.reserve(bookingRequest());

    const second = await repository.reserve(
      bookingRequest({
        appointmentId: 'appointment_002',
        slotId: OTHER_SLOT_ID,
        patientId: 'patient_002',
        audit: {
          actorId: 'actor_front_desk_002',
          actorRole: 'test_front_desk',
          correlationId: 'corr_booking_002',
          source: 'api',
          reasonCode: null,
          policyVersion: null
        }
      })
    );

    expect(second).toEqual({
      appointmentId: 'appointment_002',
      replayed: false
    });
    expect((await db.collection(COLLECTIONS.idempotencyKeys).get()).size).toBe(
      2
    );
  });

  it('never overwrites an existing audit event and rolls back every sibling write', async () => {
    const auditRef = db
      .collection(COLLECTIONS.auditEvents)
      .doc('audit_appointment_001_confirmed');
    await auditRef.set({ sentinel: 'existing_append_only_event' });

    await expect(repository.reserve(bookingRequest())).rejects.toThrow();

    expect((await auditRef.get()).data()).toEqual({
      sentinel: 'existing_append_only_event'
    });
    expect((await db.collection(COLLECTIONS.appointments).get()).size).toBe(0);
    expect(
      (await db.collection(COLLECTIONS.patientBookingGuards).get()).size
    ).toBe(0);
    expect((await db.collection(COLLECTIONS.outboxJobs).get()).size).toBe(0);
    expect((await db.collection(COLLECTIONS.idempotencyKeys).get()).size).toBe(
      0
    );
    expect(
      (await db.collection(COLLECTIONS.slots).doc(SLOT_ID).get()).data()?.[
        'reservationId'
      ]
    ).toBeUndefined();
  });

  it('rejects a second active booking by the same patient', async () => {
    await repository.reserve(bookingRequest());

    await expect(
      repository.reserve(
        bookingRequest({
          appointmentId: 'appointment_002',
          slotId: OTHER_SLOT_ID,
          idempotencyKey: 'idem_002'
        })
      )
    ).rejects.toThrow(/active booking/i);

    const appointments = await db.collection(COLLECTIONS.appointments).get();
    expect(appointments.size).toBe(1);
    expect(
      (await db.collection(COLLECTIONS.patientBookingGuards).get()).size
    ).toBe(1);
  });

  it('lets the patient book again once the first visit is finished', async () => {
    await repository.reserve(bookingRequest());
    await repository.transition({
      appointmentId: 'appointment_001',
      transition: 'complete',
      audit: {
        actorId: 'actor_front_desk_001',
        actorRole: 'test_front_desk',
        correlationId: 'corr_complete_001',
        source: 'api',
        reasonCode: 'test_visit_completed',
        policyVersion: null
      },
      requestedAt: '2026-07-21T10:00:00.000Z',
      idempotency: transitionAppointmentIdempotency({
        key: 'idem_complete_001',
        actorId: 'actor_front_desk_001',
        appointmentId: 'appointment_001',
        transition: 'complete'
      })
    });

    expect(
      await db
        .collection(COLLECTIONS.patientBookingGuards)
        .doc('patient_001')
        .get()
    ).toMatchObject({ exists: false });

    const second = await repository.reserve(
      bookingRequest({
        appointmentId: 'appointment_002',
        slotId: OTHER_SLOT_ID,
        idempotencyKey: 'idem_002'
      })
    );

    expect(second.replayed).toBe(false);
    const appointments = await db.collection(COLLECTIONS.appointments).get();
    expect(appointments.size).toBe(2);
    expect(
      (
        await db
          .collection(COLLECTIONS.patientBookingGuards)
          .doc('patient_001')
          .get()
      ).data()?.['activeAppointmentId']
    ).toBe('appointment_002');
  });

  it('rejects a slot from the other booking grid and writes nothing', async () => {
    await expect(
      repository.reserve(bookingRequest({ slotId: 'slot_20300102_1215' }))
    ).rejects.toThrow(/booking kind/i);

    const appointments = await db.collection(COLLECTIONS.appointments).get();
    const outbox = await db.collection(COLLECTIONS.outboxJobs).get();
    expect(appointments.size).toBe(0);
    expect(outbox.size).toBe(0);
  });

  it('rejects an unknown slot and writes nothing', async () => {
    await expect(
      repository.reserve(bookingRequest({ slotId: 'slot_does_not_exist' }))
    ).rejects.toThrow(/slot/i);

    const appointments = await db.collection(COLLECTIONS.appointments).get();
    expect(appointments.size).toBe(0);
  });
});
