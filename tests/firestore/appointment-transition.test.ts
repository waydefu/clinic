import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  COLLECTIONS,
  FirestoreBookingRepository
} from '../../apps/api/src/firestore/booking.repository.js';
import {
  rescheduleAppointmentIdempotency,
  transitionAppointmentIdempotency
} from '../../apps/api/src/idempotency/appointment-idempotency.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';
import { AuditEventV2Schema } from '../../packages/contracts/src/audit.js';
import type { AppointmentTransition } from '@beauessence/domain';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const projectId = LOCAL_FIREBASE_PROJECT_ID;

let app: App;
let db: Firestore;
let repository: FirestoreBookingRepository;

const NOW = '2026-07-21T09:00:00.000Z';
const SLOT_A = 'slot_20300102_1200';
const SLOT_B = 'slot_20300102_1230';
const FOLLOW_UP_SLOT = 'slot_20300102_1215';
const APPOINTMENT = 'appointment_001';

async function wipe(): Promise<void> {
  for (const collection of Object.values(COLLECTIONS)) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seed(): Promise<void> {
  await db.collection(COLLECTIONS.slots).doc(SLOT_A).set({
    kind: 'initial',
    startsAt: '2030-01-02T04:00:00.000Z',
    reservationId: APPOINTMENT
  });
  await db
    .collection(COLLECTIONS.slots)
    .doc(SLOT_B)
    .set({ kind: 'initial', startsAt: '2030-01-02T04:30:00.000Z' });
  await db
    .collection(COLLECTIONS.slots)
    .doc(FOLLOW_UP_SLOT)
    .set({ kind: 'follow_up', startsAt: '2030-01-02T04:15:00.000Z' });
  await db.collection(COLLECTIONS.appointments).doc(APPOINTMENT).set({
    slotId: SLOT_A,
    startsAt: '2030-01-02T04:00:00.000Z',
    patientId: 'patient_001',
    bookingKind: 'initial',
    status: 'confirmed'
  });
  await db.collection(COLLECTIONS.patientBookingGuards).doc('patient_001').set({
    activeAppointmentId: APPOINTMENT,
    status: 'confirmed',
    updatedAt: '2026-07-21T08:00:00.000Z'
  });
}

const transition = (
  kind: AppointmentTransition,
  key = `idem_${kind}`
): Promise<{ appointmentId: string; replayed: boolean }> =>
  repository.transition({
    appointmentId: APPOINTMENT,
    transition: kind,
    audit: {
      actorId: 'actor_front_desk_001',
      actorRole: 'test_front_desk',
      correlationId: `corr_${key}`,
      source: 'api',
      reasonCode: 'test_operator_action',
      policyVersion: null
    },
    requestedAt: NOW,
    idempotency: transitionAppointmentIdempotency({
      key,
      actorId: 'actor_front_desk_001',
      appointmentId: APPOINTMENT,
      transition: kind
    })
  });

const appointmentState = async () =>
  (await db.collection(COLLECTIONS.appointments).doc(APPOINTMENT).get()).data();
const slotState = async (id: string) =>
  (await db.collection(COLLECTIONS.slots).doc(id).get()).data();
const patientGuardState = async () =>
  await db
    .collection(COLLECTIONS.patientBookingGuards)
    .doc('patient_001')
    .get();

beforeAll(() => {
  app = initializeApp({ projectId }, `transition-${Date.now()}`);
  db = getFirestore(app);
  repository = new FirestoreBookingRepository(db);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await seed();
});

describe('appointment transitions in a Firestore transaction', () => {
  it('cancels and returns the slot to the pool', async () => {
    await transition('cancel');

    expect((await appointmentState())?.['status']).toBe('cancelled');
    expect((await slotState(SLOT_A))?.['reservationId']).toBeNull();
    expect((await patientGuardState()).exists).toBe(false);
  });

  it('marks no_show and returns the slot to the pool', async () => {
    await transition('no_show');

    expect((await appointmentState())?.['status']).toBe('no_show');
    expect((await slotState(SLOT_A))?.['reservationId']).toBeNull();
    expect((await patientGuardState()).exists).toBe(false);
  });

  // 完成到診是已經發生的事實，時段不該被別人搶走。
  it('keeps the slot reserved when the visit is completed', async () => {
    await transition('complete');

    const appointment = await appointmentState();
    expect(appointment?.['status']).toBe('completed');
    expect(appointment?.['completedAt']).toBe(NOW);
    expect((await slotState(SLOT_A))?.['reservationId']).toBe(APPOINTMENT);
    expect((await patientGuardState()).exists).toBe(false);
  });

  it('keeps the slot reserved while a cancellation is only requested', async () => {
    await transition('request_cancellation');

    expect((await appointmentState())?.['status']).toBe(
      'cancellation_requested'
    );
    expect((await slotState(SLOT_A))?.['reservationId']).toBe(APPOINTMENT);
    expect((await patientGuardState()).data()).toMatchObject({
      activeAppointmentId: APPOINTMENT,
      status: 'cancellation_requested',
      updatedAt: NOW
    });
  });

  it('writes an audit event and an outbox job with every transition', async () => {
    await transition('cancel');

    const audits = await db.collection(COLLECTIONS.auditEvents).get();
    const outbox = await db.collection(COLLECTIONS.outboxJobs).get();
    expect(audits.size).toBe(1);
    expect(AuditEventV2Schema.parse(audits.docs[0]?.data())).toEqual({
      eventId: 'audit_appointment_001_cancelled',
      occurredAt: NOW,
      actorId: 'actor_front_desk_001',
      actorRole: 'test_front_desk',
      action: 'appointment_cancelled',
      resourceType: 'appointment',
      resourceId: APPOINTMENT,
      before: {
        status: 'confirmed',
        slotId: SLOT_A
      },
      after: {
        status: 'cancelled',
        slotId: SLOT_A
      },
      reasonCode: 'test_operator_action',
      result: 'succeeded',
      correlationId: 'corr_idem_cancel',
      source: 'api',
      policyVersion: null,
      schemaVersion: 2
    });
    expect(outbox.size).toBe(1);
    expect(outbox.docs[0]?.data()).toMatchObject({
      appointmentStatus: 'cancelled',
      correlationId: 'corr_idem_cancel',
      causationId: 'audit_appointment_001_cancelled',
      status: 'pending',
      attempts: 0
    });
  });

  it('replays an idempotency key instead of transitioning twice', async () => {
    const first = await transition('cancel');
    const second = await transition('cancel');

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect((await db.collection(COLLECTIONS.auditEvents).get()).size).toBe(1);
  });

  it('rejects the same transition-scoped key when the command changes', async () => {
    await transition('cancel', 'idem_transition_shared');

    await expect(
      transition('complete', 'idem_transition_shared')
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    expect((await appointmentState())?.['status']).toBe('cancelled');
    expect((await db.collection(COLLECTIONS.auditEvents).get()).size).toBe(1);
  });

  it('rejects a transition the state machine does not allow, writing nothing', async () => {
    await transition('cancel');

    await expect(
      transition('complete', 'idem_complete_after_cancel')
    ).rejects.toThrow(/cannot be complete/i);

    expect((await appointmentState())?.['status']).toBe('cancelled');
    expect((await db.collection(COLLECTIONS.outboxJobs).get()).size).toBe(1);
  });

  it('lets only one of many concurrent cancellations win', async () => {
    const attempts = Array.from({ length: 6 }, (_, index) =>
      transition('cancel', `idem_race_${index}`)
    );
    const settled = await Promise.allSettled(attempts);

    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.collection(COLLECTIONS.auditEvents).get()).size).toBe(1);
  });

  it('never deletes a guard that points at another appointment', async () => {
    await db
      .collection(COLLECTIONS.patientBookingGuards)
      .doc('patient_001')
      .update({ activeAppointmentId: 'appointment_newer' });

    await expect(transition('cancel')).rejects.toThrow(/guard/i);
    expect((await patientGuardState()).data()?.['activeAppointmentId']).toBe(
      'appointment_newer'
    );
    expect((await appointmentState())?.['status']).toBe('confirmed');
  });
});

describe('reschedule in a Firestore transaction', () => {
  const reschedule = (targetSlotId: string, key = 'idem_reschedule') =>
    repository.reschedule({
      appointmentId: APPOINTMENT,
      targetSlotId,
      audit: {
        actorId: 'actor_front_desk_001',
        actorRole: 'test_front_desk',
        correlationId: `corr_${key}`,
        source: 'api',
        reasonCode: 'test_operator_reschedule',
        policyVersion: null
      },
      requestedAt: NOW,
      idempotency: rescheduleAppointmentIdempotency({
        key,
        actorId: 'actor_front_desk_001',
        appointmentId: APPOINTMENT,
        targetSlotId
      })
    });

  it('releases the old slot and takes the new one atomically', async () => {
    await reschedule(SLOT_B);

    const appointment = await appointmentState();
    expect(appointment?.['slotId']).toBe(SLOT_B);
    expect(appointment?.['startsAt']).toBe('2030-01-02T04:30:00.000Z');
    expect(appointment?.['status']).toBe('confirmed');
    expect((await slotState(SLOT_A))?.['reservationId']).toBeNull();
    expect((await slotState(SLOT_B))?.['reservationId']).toBe(APPOINTMENT);
    expect((await patientGuardState()).data()).toMatchObject({
      activeAppointmentId: APPOINTMENT,
      status: 'confirmed',
      updatedAt: NOW
    });
    const audits = await db.collection(COLLECTIONS.auditEvents).get();
    expect(AuditEventV2Schema.parse(audits.docs[0]?.data())).toMatchObject({
      action: 'appointment_rescheduled',
      resourceId: APPOINTMENT,
      before: {
        status: 'confirmed',
        slotId: SLOT_A
      },
      after: {
        status: 'confirmed',
        slotId: SLOT_B
      },
      reasonCode: 'test_operator_reschedule',
      result: 'succeeded',
      correlationId: 'corr_idem_reschedule',
      schemaVersion: 2
    });
  });

  it('restores a requested cancellation to confirmed', async () => {
    await transition('request_cancellation');
    await reschedule(SLOT_B);

    expect((await appointmentState())?.['status']).toBe('confirmed');
  });

  it('refuses to move onto the other booking grid, writing nothing', async () => {
    await expect(reschedule(FOLLOW_UP_SLOT)).rejects.toThrow(/booking kind/i);

    expect((await appointmentState())?.['slotId']).toBe(SLOT_A);
    expect((await slotState(SLOT_A))?.['reservationId']).toBe(APPOINTMENT);
    expect(
      (await slotState(FOLLOW_UP_SLOT))?.['reservationId']
    ).toBeUndefined();
  });

  it('refuses a slot another appointment already holds', async () => {
    await db
      .collection(COLLECTIONS.slots)
      .doc(SLOT_B)
      .update({ reservationId: 'appointment_002' });

    await expect(reschedule(SLOT_B)).rejects.toThrow(/not available/i);
    expect((await appointmentState())?.['slotId']).toBe(SLOT_A);
  });

  it('never leaves both slots held when reschedules race', async () => {
    const attempts = Array.from({ length: 5 }, (_, index) =>
      reschedule(SLOT_B, `idem_race_${index}`)
    );
    const settled = await Promise.allSettled(attempts);

    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await slotState(SLOT_A))?.['reservationId']).toBeNull();
    expect((await slotState(SLOT_B))?.['reservationId']).toBe(APPOINTMENT);
  });

  it('replays an idempotency key instead of moving twice', async () => {
    const first = await reschedule(SLOT_B);
    const second = await reschedule(SLOT_B);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect((await db.collection(COLLECTIONS.auditEvents).get()).size).toBe(1);
  });

  it('rejects the same reschedule-scoped key for another target', async () => {
    await reschedule(SLOT_B, 'idem_reschedule_shared');

    await expect(
      reschedule(FOLLOW_UP_SLOT, 'idem_reschedule_shared')
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

    expect((await appointmentState())?.['slotId']).toBe(SLOT_B);
    expect((await db.collection(COLLECTIONS.auditEvents).get()).size).toBe(1);
  });

  it('allows the same raw key in transition and reschedule scopes', async () => {
    await transition('request_cancellation', 'idem_cross_scope');
    const result = await reschedule(SLOT_B, 'idem_cross_scope');

    expect(result.replayed).toBe(false);
    expect((await db.collection(COLLECTIONS.idempotencyKeys).get()).size).toBe(
      2
    );
  });
});
