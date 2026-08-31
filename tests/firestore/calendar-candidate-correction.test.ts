import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreCalendarPilotRepository } from '../../apps/api/src/firestore/calendar-pilot.repository.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const NOW = '2026-09-01T00:00:00.000Z';
const CANDIDATE_ID = 'candidate_invalid_001';
const MIRROR_ID = 'mirror_invalid_001';
const COLLECTIONS = [
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

async function wipe(): Promise<void> {
  for (const collection of COLLECTIONS) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seedInvalidCandidate(overrides: Record<string, unknown> = {}) {
  await db.collection('calendar_pilot_configuration').doc('active').set({
    activeSourceId: 'calendar_source_primary',
    version: 1,
    expiresAt: '2026-11-28T04:51:37Z',
    health: 'healthy',
    lastSuccessfulSyncAt: NOW,
    nextScheduledSyncAt: '2026-09-01T00:05:00.000Z',
    inboundEnabled: true,
    outboundEnabled: true
  });
  await db.collection('calendar_pilot_patients').doc('A17').set({
    enabled: true
  });
  await db
    .collection('calendar_pilot_mirrors')
    .doc(MIRROR_ID)
    .set({
      externalEventId: 'original_google_event_id',
      localDirty: false,
      parsed: { ok: false, errors: ['title_format_invalid'] }
    });
  await db
    .collection('calendar_pilot_candidates')
    .doc(CANDIDATE_ID)
    .set({
      candidateId: CANDIDATE_ID,
      kind: 'invalid_format',
      status: 'pending',
      displayLabel: '格式需修正',
      startsAt: null,
      endsAt: null,
      sourceVersion: 1,
      sourceId: 'calendar_source_primary',
      expectedVersion: 0,
      validationErrors: ['title_format_invalid'],
      createdAt: NOW,
      before: null,
      mirrorId: MIRROR_ID,
      parsed: { ok: false, errors: ['title_format_invalid'] },
      ...overrides
    });
}

function appointmentCommand(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: CANDIDATE_ID,
    kind: 'appointment' as const,
    idempotencyKey: 'candidate_correction_0001',
    expectedVersion: 0,
    patientCode: 'A17',
    bookingKind: 'initial' as const,
    serviceId: 'service_snoring' as const,
    startsAt: '2026-09-02T06:00:00.000Z',
    actorId: 'manager_001',
    actorRole: 'manager' as const,
    occurredAt: NOW,
    ...overrides
  };
}

beforeAll(() => {
  app = initializeApp({ projectId: LOCAL_FIREBASE_PROJECT_ID }, 'correction');
  db = getFirestore(app);
});

beforeEach(async () => {
  await wipe();
  await seedInvalidCandidate();
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('controlled Calendar candidate correction transaction', () => {
  it('atomically accepts an appointment and queues an update to the same event', async () => {
    const repository = new FirestoreCalendarPilotRepository(db);
    const response = await repository.correctCandidate(appointmentCommand());

    expect(response.candidate).toMatchObject({
      candidateId: CANDIDATE_ID,
      kind: 'create_appointment',
      status: 'accepted',
      displayLabel: 'A17，初診，止鼾',
      expectedVersion: 1,
      validationErrors: []
    });
    expect(JSON.stringify(response)).not.toContain('original_google_event_id');
    expect(JSON.stringify(response)).not.toContain('calendar_source_primary');
    const projectionId = response.projection?.projectionId;
    expect(projectionId).toEqual(expect.any(String));
    expect(
      (
        await db.collection('calendar_pilot_mirrors').doc(MIRROR_ID).get()
      ).data()
    ).toMatchObject({
      externalEventId: 'original_google_event_id',
      linkId: projectionId,
      localDirty: false,
      parsed: {
        ok: true,
        kind: 'appointment',
        patientCode: 'A17'
      }
    });
    expect(
      (await db.collection('calendar_pilot_outbox').get()).docs[0]?.data()
    ).toMatchObject({
      kind: 'calendar_projection_restore',
      writeMode: 'update_existing',
      mirrorId: MIRROR_ID,
      generation: 1,
      status: 'pending'
    });
    expect((await db.collection('calendar_pilot_projections').get()).size).toBe(
      1
    );
    expect(
      (await db.collection('calendar_pilot_availability_blocks').get()).size
    ).toBe(1);
    expect(
      (await db.collection('calendar_pilot_appointments').get()).size
    ).toBe(1);
    expect(
      (await db.collection('calendar_pilot_patient_guards').get()).size
    ).toBe(1);
    expect(
      (await db.collection('calendar_pilot_audit_events').get()).size
    ).toBe(1);
    expect((await db.collection('calendar_pilot_idempotency').get()).size).toBe(
      1
    );
  });

  it('replays idempotently without duplicating any transaction artifacts', async () => {
    const repository = new FirestoreCalendarPilotRepository(db);
    const first = await repository.correctCandidate(appointmentCommand());
    const replay = await repository.correctCandidate(
      appointmentCommand({ occurredAt: '2026-09-01T00:01:00.000Z' })
    );
    expect(replay).toEqual(first);
    expect((await db.collection('calendar_pilot_outbox').get()).size).toBe(1);
    expect(
      (await db.collection('calendar_pilot_audit_events').get()).size
    ).toBe(1);
  });

  it('preserves all-day and cross-day busy ranges', async () => {
    const repository = new FirestoreCalendarPilotRepository(db);
    const response = await repository.correctCandidate({
      candidateId: CANDIDATE_ID,
      kind: 'busy',
      busyReason: 'leave',
      timeRange: {
        kind: 'all_day',
        startDate: '2026-09-02',
        endDate: '2026-09-04'
      },
      idempotencyKey: 'candidate_busy_correction_0001',
      expectedVersion: 0,
      actorId: 'front_001',
      actorRole: 'front_desk',
      occurredAt: NOW
    });
    expect(response.projection).toMatchObject({
      kind: 'busy',
      busyReason: 'leave',
      startsAt: '2026-09-01T16:00:00.000Z',
      endsAt: '2026-09-03T16:00:00.000Z'
    });
    expect(
      (
        await db.collection('calendar_pilot_mirrors').doc(MIRROR_ID).get()
      ).data()?.['parsed']
    ).toMatchObject({
      allDay: true,
      startDate: '2026-09-02',
      endDate: '2026-09-04'
    });
  });

  it('fails closed on version, generation, overlap and patient duplication with zero partial writes', async () => {
    const scenarios = [
      'version',
      'generation',
      'overlap',
      'duplicate'
    ] as const;
    for (const scenario of scenarios) {
      await wipe();
      await seedInvalidCandidate(
        scenario === 'generation' ? { sourceVersion: 2 } : {}
      );
      if (scenario === 'overlap')
        await db
          .collection('calendar_pilot_availability_blocks')
          .doc('busy')
          .set({
            kind: 'busy',
            bookingKind: null,
            startsAt: '2026-09-02T05:45:00.000Z',
            endsAt: '2026-09-02T06:15:00.000Z',
            displayLabel: '忙碌：會議',
            sourceVersion: 1
          });
      if (scenario === 'duplicate')
        await db.collection('calendar_pilot_patient_guards').doc('A17').set({
          recordId: 'another_appointment'
        });

      const repository = new FirestoreCalendarPilotRepository(db);
      await expect(
        repository.correctCandidate(
          appointmentCommand(
            scenario === 'version' ? { expectedVersion: 1 } : {}
          )
        )
      ).rejects.toThrow();
      expect(
        (
          await db
            .collection('calendar_pilot_candidates')
            .doc(CANDIDATE_ID)
            .get()
        ).data()?.['status']
      ).toBe('pending');
      expect(
        (await db.collection('calendar_pilot_projections').get()).empty
      ).toBe(true);
      expect((await db.collection('calendar_pilot_outbox').get()).empty).toBe(
        true
      );
      expect(
        (await db.collection('calendar_pilot_audit_events').get()).empty
      ).toBe(true);
    }
  });

  it('never returns server-only source or mirror identifiers from candidate listing', async () => {
    const repository = new FirestoreCalendarPilotRepository(db);
    const candidates = await repository.listCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).not.toHaveProperty('sourceId');
    expect(candidates[0]).not.toHaveProperty('mirrorId');
    expect(candidates[0]).not.toHaveProperty('parsed');
  });
});
