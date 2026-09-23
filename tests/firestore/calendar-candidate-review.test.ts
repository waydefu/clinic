import { createHash } from 'node:crypto';

import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreCalendarPilotRepository } from '../../apps/api/src/firestore/calendar-pilot.repository.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const NOW = '2026-09-24T03:00:00.000Z';
const SOURCE_ID = 'calendar_source_synthetic';
const CANDIDATE_ID = 'candidate_update_001';
const MIRROR_ID = 'mirror_update_001';
const APPOINTMENT_ID = 'appointment_001';
const COLLECTIONS = [
  'calendar_pilot_configuration',
  'calendar_pilot_candidates',
  'calendar_pilot_mirrors',
  'calendar_pilot_appointments',
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

async function seedUpdateCandidate(): Promise<void> {
  await db.collection('calendar_pilot_configuration').doc('active').set({
    activeSourceId: SOURCE_ID,
    version: 1,
    expiresAt: '2026-11-28T04:51:37Z',
    health: 'healthy',
    lastSuccessfulSyncAt: NOW,
    nextScheduledSyncAt: '2026-09-24T03:05:00.000Z',
    inboundEnabled: true,
    outboundEnabled: true
  });
  await db.collection('calendar_pilot_appointments').doc(APPOINTMENT_ID).set({
    appointmentId: APPOINTMENT_ID,
    patientCode: 'A17',
    bookingKind: 'initial',
    serviceId: 'service_snoring',
    startsAt: '2030-01-02T04:00:00.000Z',
    endsAt: '2030-01-02T04:30:00.000Z',
    status: 'confirmed',
    version: 1
  });
  await db
    .collection('calendar_pilot_mirrors')
    .doc(MIRROR_ID)
    .set({
      sourceId: SOURCE_ID,
      externalEventId: 'linked_external_event_77',
      etag: '"etag-001"',
      linkId: APPOINTMENT_ID,
      parsed: {
        ok: true,
        kind: 'appointment',
        patientCode: 'A17',
        bookingKind: 'initial',
        serviceId: 'service_snoring',
        displayLabel: 'A17，初診，止鼾',
        startsAt: '2030-01-02T04:30:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      }
    });
  await db
    .collection('calendar_pilot_candidates')
    .doc(CANDIDATE_ID)
    .set({
      candidateId: CANDIDATE_ID,
      kind: 'update_appointment',
      status: 'pending',
      displayLabel: 'A17，初診，止鼾',
      startsAt: '2030-01-02T04:30:00.000Z',
      endsAt: '2030-01-02T05:00:00.000Z',
      sourceId: SOURCE_ID,
      sourceVersion: 1,
      expectedVersion: 1,
      validationErrors: [],
      createdAt: NOW,
      before: {
        kind: 'appointment',
        displayLabel: 'A17，初診，止鼾',
        startsAt: '2030-01-02T04:00:00.000Z',
        endsAt: '2030-01-02T04:30:00.000Z'
      },
      mirrorId: MIRROR_ID,
      expectedEtag: '"etag-001"',
      parsed: {
        ok: true,
        kind: 'appointment',
        patientCode: 'A17',
        bookingKind: 'initial',
        serviceId: 'service_snoring',
        displayLabel: 'A17，初診，止鼾',
        startsAt: '2030-01-02T04:30:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      },
      localRecordId: APPOINTMENT_ID
    });
}

function reviewCommand(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: CANDIDATE_ID,
    action: 'reject' as const,
    expectedVersion: 1,
    idempotencyKey: 'candidate_reject_update_0001',
    actorId: 'manager_001',
    actorRole: 'manager' as const,
    occurredAt: NOW,
    ...overrides
  };
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    'candidate-review'
  );
  db = getFirestore(app);
});

beforeEach(async () => {
  await wipe();
  await seedUpdateCandidate();
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('Calendar candidate rejection transaction', () => {
  it('rejects an update and queues an ETag guarded restore for the linked appointment', async () => {
    const repository = new FirestoreCalendarPilotRepository(db);
    const response = await repository.reviewCandidate(reviewCommand());

    expect(response.candidate).toMatchObject({
      candidateId: CANDIDATE_ID,
      kind: 'update_appointment',
      status: 'rejected',
      expectedVersion: 2
    });
    const outbox = await db.collection('calendar_pilot_outbox').get();
    expect(outbox.size).toBe(1);
    expect(outbox.docs[0]?.data()).toMatchObject({
      kind: 'calendar_projection_restore',
      writeMode: 'update_existing',
      restoreSource: 'confirmed_appointment',
      localRecordId: APPOINTMENT_ID,
      mirrorId: MIRROR_ID,
      expectedEtag: '"etag-001"',
      generation: 1,
      status: 'pending'
    });
    expect(
      (await db.collection('calendar_pilot_audit_events').get()).size
    ).toBe(1);
  });

  it('replays the same request before stale candidate checks without duplicate writes', async () => {
    const repository = new FirestoreCalendarPilotRepository(db);
    const first = await repository.reviewCandidate(reviewCommand());
    const replay = await repository.reviewCandidate(
      reviewCommand({ occurredAt: '2026-09-24T03:01:00.000Z' })
    );

    expect(replay).toEqual(first);
    expect((await db.collection('calendar_pilot_outbox').get()).size).toBe(1);
    expect(
      (await db.collection('calendar_pilot_audit_events').get()).size
    ).toBe(1);
  });

  it('accepts exact retries of legacy idempotency records and rejects a changed request', async () => {
    const repository = new FirestoreCalendarPilotRepository(db);
    const first = await repository.reviewCandidate(reviewCommand());
    const legacyFingerprint = createHash('sha256')
      .update(JSON.stringify({ candidateId: CANDIDATE_ID, action: 'reject' }))
      .digest('hex');
    const idempotencyId = createHash('sha256')
      .update('manager_001:candidate_reject_update_0001')
      .digest('hex')
      .slice(0, 40);
    await db
      .collection('calendar_pilot_idempotency')
      .doc(idempotencyId)
      .update({ fingerprint: legacyFingerprint });

    await expect(repository.reviewCandidate(reviewCommand())).resolves.toEqual(
      first
    );
    await expect(
      repository.reviewCandidate(reviewCommand({ expectedVersion: 2 }))
    ).rejects.toThrow();
    expect((await db.collection('calendar_pilot_outbox').get()).size).toBe(1);
    expect(
      (await db.collection('calendar_pilot_audit_events').get()).size
    ).toBe(1);
  });

  it.each([
    'missing appointment',
    'cancelled appointment',
    'mismatched mirror link',
    'stale mirror ETag'
  ])('fails closed for %s without partial writes', async (scenario) => {
    if (scenario === 'missing appointment')
      await db
        .collection('calendar_pilot_appointments')
        .doc(APPOINTMENT_ID)
        .delete();
    if (scenario === 'cancelled appointment')
      await db
        .collection('calendar_pilot_appointments')
        .doc(APPOINTMENT_ID)
        .update({ status: 'cancelled' });
    if (scenario === 'mismatched mirror link')
      await db
        .collection('calendar_pilot_mirrors')
        .doc(MIRROR_ID)
        .update({ linkId: 'another_appointment' });
    if (scenario === 'stale mirror ETag')
      await db
        .collection('calendar_pilot_mirrors')
        .doc(MIRROR_ID)
        .update({ etag: '"etag-002"' });

    const repository = new FirestoreCalendarPilotRepository(db);
    await expect(repository.reviewCandidate(reviewCommand())).rejects.toThrow();
    expect(
      (
        await db.collection('calendar_pilot_candidates').doc(CANDIDATE_ID).get()
      ).data()?.['status']
    ).toBe('pending');
    expect((await db.collection('calendar_pilot_outbox').get()).empty).toBe(
      true
    );
    expect(
      (await db.collection('calendar_pilot_audit_events').get()).empty
    ).toBe(true);
  });

  it('does not queue a restore when rejecting an unmatched event', async () => {
    await db
      .collection('calendar_pilot_candidates')
      .doc(CANDIDATE_ID)
      .set({
        candidateId: CANDIDATE_ID,
        kind: 'unmatched',
        status: 'unmatched',
        displayLabel: '未對應事件',
        startsAt: null,
        endsAt: null,
        sourceId: SOURCE_ID,
        sourceVersion: 1,
        expectedVersion: 1,
        validationErrors: ['unmatched_event'],
        createdAt: NOW,
        before: null,
        mirrorId: MIRROR_ID,
        expectedEtag: '"etag-001"',
        parsed: { ok: false, errors: ['unmatched_event'] }
      });

    const repository = new FirestoreCalendarPilotRepository(db);
    const response = await repository.reviewCandidate(reviewCommand());
    expect(response.candidate.status).toBe('rejected');
    expect((await db.collection('calendar_pilot_outbox').get()).empty).toBe(
      true
    );
  });
});
