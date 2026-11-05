import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedCalPilot } from '../../scripts/seed-cal-pilot.mjs';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

let app: App;
let db: Firestore;
const seedOptions = {
  projectId: 'beauessence-clinic-staging',
  expiresAt: '2026-09-02T00:00:00.000Z',
  now: '2026-09-01T00:00:00.000Z'
};
const collections = [
  'calendar_pilot_configuration',
  'calendar_pilot_sources',
  'calendar_pilot_patients'
] as const;

async function wipe(): Promise<void> {
  for (const collection of collections) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

beforeAll(() => {
  app = initializeApp({ projectId: LOCAL_FIREBASE_PROJECT_ID }, 'seed-admission');
  db = getFirestore(app);
});

beforeEach(wipe);
afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('CAL-PILOT bootstrap admission', () => {
  it('creates synthetic configuration and fixtures when no configuration exists', async () => {
    await seedCalPilot({ db, ...seedOptions });
    expect(
      (
        await db.collection('calendar_pilot_configuration').doc('active').get()
      ).data()
    ).toMatchObject({
      version: 1,
      workerLeaseOwner: null,
      workerLeaseExpiresAt: null,
      inboundEnabled: false,
      outboundEnabled: false
    });
    expect((await db.collection('calendar_pilot_sources').get()).size).toBe(2);
    expect((await db.collection('calendar_pilot_patients').get()).size).toBe(30);
  });

  it.each([
    {
      workerLeaseOwner: 'worker_old',
      workerLeaseExpiresAt: '2026-08-31T23:59:00.000Z'
    },
    { workerLeaseOwner: null, workerLeaseExpiresAt: null }
  ])(
    'rejects a repeated bootstrap without changing any existing documents %#',
    async (lease: {
      workerLeaseOwner: string | null;
      workerLeaseExpiresAt: string | null;
    }) => {
      const config = db.collection('calendar_pilot_configuration').doc('active');
      const source = db
        .collection('calendar_pilot_sources')
        .doc('calendar_source_primary');
      const patient = db.collection('calendar_pilot_patients').doc('A01');
      const existing = {
        version: 42,
        activeSourceId: 'synthetic_source',
        ...lease
      };
      await config.set(existing);
      await source.set({ sentinel: 'source_kept' });
      await patient.set({ sentinel: 'patient_kept' });

      await expect(seedCalPilot({ db, ...seedOptions })).rejects.toThrow();
      expect((await config.get()).data()).toEqual(existing);
      expect((await source.get()).data()).toEqual({ sentinel: 'source_kept' });
      expect((await patient.get()).data()).toEqual({ sentinel: 'patient_kept' });
      expect((await db.collection('calendar_pilot_sources').get()).size).toBe(1);
      expect((await db.collection('calendar_pilot_patients').get()).size).toBe(1);
    }
  );

  it('admits only one of two concurrent first bootstraps', async () => {
    const results = await Promise.allSettled([
      seedCalPilot({ db, ...seedOptions }),
      seedCalPilot({ db, ...seedOptions })
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
      1
    );
    expect((await db.collection('calendar_pilot_sources').get()).size).toBe(2);
    expect((await db.collection('calendar_pilot_patients').get()).size).toBe(30);
  });

  it('keeps project and expiry validation on the exported entry point', async () => {
    await expect(
      seedCalPilot({ db, ...seedOptions, projectId: 'other-project' })
    ).rejects.toThrow(/outside/iu);
    await expect(
      seedCalPilot({ db, ...seedOptions, expiresAt: 'invalid' })
    ).rejects.toThrow(/UTC/iu);
    expect((await db.collection('calendar_pilot_configuration').get()).empty).toBe(
      true
    );
  });
});
