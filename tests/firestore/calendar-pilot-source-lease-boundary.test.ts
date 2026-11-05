import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreCalendarPilotRepository } from '../../apps/api/src/firestore/calendar-pilot.repository.js';
import { ConflictError } from '../../apps/api/src/platform/errors/api-error.js';
import { FirestoreCalendarSyncRepository } from '../../apps/worker/src/calendar-sync/firestore-calendar-sync.repository.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const NOW = '2026-09-01T00:00:00.000Z';
const COLLECTIONS = [
  'calendar_pilot_configuration',
  'calendar_pilot_sources',
  'calendar_pilot_preflights',
  'calendar_pilot_idempotency',
  'calendar_pilot_outbox',
  'calendar_pilot_audit_events'
] as const;

let app: App;
let db: Firestore;
let api: FirestoreCalendarPilotRepository;
let worker: FirestoreCalendarSyncRepository;

const command = {
  sourceId: 'source_b',
  expectedVersion: 1,
  preflightId: 'preflight_b',
  idempotencyKey: 'source-change-test',
  actorId: 'actor_test',
  occurredAt: NOW
};
const workerCommand = {
  sourceId: 'source_b',
  expectedVersion: 1,
  preflightId: 'preflight_b',
  activatedAt: NOW
};

function configuration() {
  return db.collection('calendar_pilot_configuration').doc('active');
}

async function wipe() {
  for (const collection of COLLECTIONS) {
    const docs = await db.collection(collection).listDocuments();
    await Promise.all(docs.map((doc) => doc.delete()));
  }
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `source-lease-boundary-${Date.now()}`
  );
  db = getFirestore(app);
  api = new FirestoreCalendarPilotRepository(db);
  worker = new FirestoreCalendarSyncRepository(db, 'p'.repeat(64));
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await configuration().set({
    activeSourceId: 'source_a',
    previousSourceId: 'source_b',
    version: 1,
    expiresAt: '2026-09-02T00:00:00.000Z',
    health: 'healthy',
    inboundEnabled: true,
    outboundEnabled: true
  });
  await db.collection('calendar_pilot_sources').doc('source_a').set({
    displayName: 'Source A',
    enabled: true
  });
  await db.collection('calendar_pilot_sources').doc('source_b').set({
    displayName: 'Source B',
    enabled: true
  });
  await db.collection('calendar_pilot_preflights').doc('preflight_b').set({
    preflightId: 'preflight_b',
    sourceId: 'source_b',
    expectedVersion: 1,
    status: 'passed',
    readable: true,
    writable: true,
    scannedEvents: 0,
    validEvents: 0,
    invalidEvents: 0,
    completedAt: NOW,
    expiresAt: '2026-09-02T00:00:00.000Z'
  });
});

describe('CAL-PILOT source switch and worker lease', () => {
  it.each([
    {
      workerLeaseOwner: 'worker_old',
      workerLeaseExpiresAt: '2026-08-31T23:59:00.000Z'
    },
    { workerLeaseOwner: 'worker_old', workerLeaseExpiresAt: null },
    { workerLeaseOwner: null, workerLeaseExpiresAt: 'invalid' }
  ])(
    'denies both writers while an owner or deadline is retained %#',
    async (lease: {
      workerLeaseOwner: string | null;
      workerLeaseExpiresAt: string | null;
    }) => {
      await configuration().update(lease);
      await expect(api.activateSource(command)).rejects.toBeInstanceOf(
        ConflictError
      );
      await expect(api.rollbackSource(command)).rejects.toBeInstanceOf(
        ConflictError
      );
      await expect(worker.activate(workerCommand)).rejects.toThrow(
        'worker lease is held'
      );
      expect((await configuration().get()).data()).toMatchObject({
        activeSourceId: 'source_a',
        version: 1,
        ...lease
      });
      expect((await db.collection('calendar_pilot_outbox').get()).empty).toBe(
        true
      );
      expect(
        (await db.collection('calendar_pilot_audit_events').get()).empty
      ).toBe(true);
    }
  );

  it('allows an unleased source change and preserves completed idempotent replay', async () => {
    const first = await api.activateSource(command);
    expect(first.version).toBe(2);
    await configuration().update({
      workerLeaseOwner: 'worker_new',
      workerLeaseExpiresAt: '2026-09-01T00:01:00.000Z'
    });
    await expect(api.activateSource(command)).resolves.toEqual(first);
    expect((await configuration().get()).data()).toMatchObject({
      activeSourceId: 'source_b',
      version: 2,
      workerLeaseOwner: 'worker_new'
    });
  });

  it('allows the worker source switch only without a retained lease', async () => {
    await expect(worker.activate(workerCommand)).resolves.toMatchObject({
      activeSourceId: 'source_b',
      previousSourceId: 'source_a',
      version: 2
    });
  });
});
