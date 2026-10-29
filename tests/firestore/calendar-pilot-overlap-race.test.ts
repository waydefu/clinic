import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreCalendarPilotRepository } from '../../apps/api/src/firestore/calendar-pilot.repository.js';
import { ConflictError } from '../../apps/api/src/platform/errors/api-error.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const projectId = LOCAL_FIREBASE_PROJECT_ID;

const NOW = '2026-09-06T08:00:00.000Z';
// Thursday 2026-09-10, 13:00 Asia/Taipei: inside clinic hours, on the
// 30-minute grid. Both racers use the identical interval (full overlap).
const FIRST_START = '2026-09-10T05:00:00.000Z';

const PILOT_COLLECTIONS = [
  'calendar_pilot_configuration',
  'calendar_pilot_sources',
  'calendar_pilot_candidates',
  'calendar_pilot_mirrors',
  'calendar_pilot_patients',
  'calendar_pilot_projections',
  'calendar_pilot_availability_blocks',
  'calendar_pilot_appointments',
  'calendar_pilot_patient_guards',
  'calendar_pilot_idempotency',
  'calendar_pilot_audit_events',
  'calendar_pilot_outbox'
] as const;

let app: App;
let db: Firestore;
let repository: FirestoreCalendarPilotRepository;

async function wipe(): Promise<void> {
  for (const collection of PILOT_COLLECTIONS) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seed(): Promise<void> {
  await db.collection('calendar_pilot_configuration').doc('active').set({
    activeSourceId: 'calendar_source_primary',
    version: 1,
    expiresAt: '2026-11-28T04:51:37Z',
    health: 'healthy',
    lastSuccessfulSyncAt: NOW,
    nextScheduledSyncAt: '2026-09-06T08:05:00.000Z',
    inboundEnabled: true,
    outboundEnabled: true
  });
  await Promise.all(
    ['A17', 'A18'].map((patientCode) =>
      db.collection('calendar_pilot_patients').doc(patientCode).set({
        enabled: true
      })
    )
  );
}

function createCommand(overrides: {
  readonly idempotencyKey: string;
  readonly patientCode: string;
  readonly bookingKind?: 'initial' | 'follow_up';
  readonly startsAt?: string;
}) {
  return {
    idempotencyKey: overrides.idempotencyKey,
    expectedVersion: 0 as const,
    patientCode: overrides.patientCode,
    bookingKind: overrides.bookingKind ?? ('initial' as const),
    serviceId: 'service_snoring' as const,
    startsAt: overrides.startsAt ?? FIRST_START,
    actorId: 'actor_overlap_probe',
    occurredAt: NOW
  };
}

beforeAll(() => {
  app = initializeApp({ projectId }, `pilot-overlap-${Date.now()}`);
  db = getFirestore(app);
  repository = new FirestoreCalendarPilotRepository(db);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await seed();
});

describe('CAL-PILOT overlapping creation race', () => {
  it('keeps stored-only fields out of query results without rewriting records', async () => {
    await repository.createSyntheticAppointment(
      createCommand({
        idempotencyKey: 'public_query_fields',
        patientCode: 'A17'
      })
    );
    const appointments = await db
      .collection('calendar_pilot_appointments')
      .get();
    expect(appointments.size).toBe(1);
    const appointment = appointments.docs[0]!;
    await appointment.ref.update({ syntheticInternalOnly: 'synthetic marker' });
    const appointmentBefore = (await appointment.ref.get()).data();
    const candidate = db
      .collection('calendar_pilot_candidates')
      .doc('synthetic_candidate');
    await candidate.set({
      candidateId: candidate.id,
      kind: 'create_block',
      status: 'pending',
      displayLabel: 'Synthetic busy',
      startsAt: FIRST_START,
      endsAt: '2026-09-10T05:30:00.000Z',
      sourceVersion: 1,
      expectedVersion: 0,
      validationErrors: [],
      createdAt: NOW,
      before: null,
      mirrorId: 'synthetic_mirror',
      expectedEtag: 'synthetic_etag',
      sourceId: 'calendar_source_primary',
      parsed: {
        ok: true,
        kind: 'busy',
        busyReason: 'other',
        displayLabel: 'Synthetic busy',
        startsAt: FIRST_START,
        endsAt: '2026-09-10T05:30:00.000Z'
      },
      syntheticInternalOnly: 'synthetic marker'
    });
    const candidateBefore = (await candidate.get()).data();
    const outboxBefore = (await db.collection('calendar_pilot_outbox').get())
      .size;

    const publicAppointments = await repository.listSyntheticAppointments();
    const publicCandidates = await repository.listCandidates();
    expect(publicAppointments).toMatchObject([
      { appointmentId: appointment.id, patientCode: 'A17', version: 1 }
    ]);
    expect(publicCandidates).toMatchObject([
      { candidateId: candidate.id, kind: 'create_block' }
    ]);
    expect(publicAppointments[0]).not.toHaveProperty('syntheticInternalOnly');
    expect(publicCandidates[0]).not.toHaveProperty('syntheticInternalOnly');
    expect(publicCandidates[0]).not.toHaveProperty('parsed');
    expect((await appointment.ref.get()).data()).toEqual(appointmentBefore);
    expect((await candidate.get()).data()).toEqual(candidateBefore);
    expect((await db.collection('calendar_pilot_outbox').get()).size).toBe(
      outboxBefore
    );
  });

  it('rejects an unreadable overlap before any appointment or outbox write', async () => {
    const block = {
      kind: 'busy',
      startsAt: FIRST_START,
      endsAt: '2026-02-30T06:00:00Z',
      displayLabel: 'Synthetic unreadable busy'
    };
    const ref = db
      .collection('calendar_pilot_availability_blocks')
      .doc('bad_block');
    await ref.set(block);
    await expect(
      repository.createSyntheticAppointment(
        createCommand({
          idempotencyKey: 'unreadable_overlap',
          patientCode: 'A17'
        })
      )
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
    for (const collection of [
      'calendar_pilot_appointments',
      'calendar_pilot_projections',
      'calendar_pilot_patient_guards',
      'calendar_pilot_outbox',
      'calendar_pilot_idempotency',
      'calendar_pilot_audit_events'
    ])
      expect((await db.collection(collection).get()).size).toBe(0);
    expect((await ref.get()).data()).toEqual(block);
  });

  it('lets exactly one of two concurrent same-kind overlapping creates win', async () => {
    const attempts = [
      repository.createSyntheticAppointment(
        createCommand({ idempotencyKey: 'overlap_race_a', patientCode: 'A17' })
      ),
      repository.createSyntheticAppointment(
        createCommand({
          idempotencyKey: 'overlap_race_b',
          patientCode: 'A18'
        })
      )
    ];

    const settled = await Promise.allSettled(attempts);
    const won = settled.filter((entry) => entry.status === 'fulfilled');
    const lost = settled.filter((entry) => entry.status === 'rejected');

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(
      lost.every(
        (entry) =>
          entry.status === 'rejected' && entry.reason instanceof ConflictError
      )
    ).toBe(true);

    const appointments = await db
      .collection('calendar_pilot_appointments')
      .get();
    expect(appointments.size).toBe(1);
    const blocks = await db
      .collection('calendar_pilot_availability_blocks')
      .get();
    expect(blocks.size).toBe(1);
  });

  it('lets overlapping creates of different booking kinds both succeed', async () => {
    const first = await repository.createSyntheticAppointment(
      createCommand({ idempotencyKey: 'overlap_kinds_a', patientCode: 'A17' })
    );
    const second = await repository.createSyntheticAppointment(
      createCommand({
        idempotencyKey: 'overlap_kinds_b',
        patientCode: 'A18',
        bookingKind: 'follow_up',
        // follow_up lives on the :15 grid; still overlaps 05:15–05:30.
        startsAt: '2026-09-10T05:15:00.000Z'
      })
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    const appointments = await db
      .collection('calendar_pilot_appointments')
      .get();
    expect(appointments.size).toBe(2);
  });
});
