import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { claimCalendarPilotJobs } from '../../apps/worker/src/calendar-sync/calendar-pilot-runtime.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const NOW = '2026-09-01T00:00:00.000Z';
const EXPIRED = '2026-08-31T23:59:59.000Z';
const ACTIVE = '2026-09-01T00:03:00.000Z';
const OUTBOX = 'calendar_pilot_outbox';

let app: App;
let db: Firestore;

async function wipe(): Promise<void> {
  const documents = await db.collection(OUTBOX).listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
}

async function seed(
  id: string,
  status: 'pending' | 'processing',
  leaseExpiresAt?: string
): Promise<void> {
  await db
    .collection(OUTBOX)
    .doc(id)
    .set({
      kind: 'calendar_projection_restore',
      status,
      mirrorId: `mirror_${id}`,
      generation: 1,
      createdAt: '2026-08-31T23:55:00.000Z',
      attemptCount: 0,
      ...(leaseExpiresAt === undefined
        ? {}
        : { leaseOwner: 'crashed_worker', leaseExpiresAt })
    });
}

beforeAll(() => {
  app = initializeApp({ projectId: LOCAL_FIREBASE_PROJECT_ID }, 'pilot-lease');
  db = getFirestore(app);
});

beforeEach(wipe);

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('CAL-PILOT worker job lease recovery', () => {
  it('reclaims an expired processing job before pending work', async () => {
    await seed('expired', 'processing', EXPIRED);
    await seed('pending', 'pending');

    const claimed = await claimCalendarPilotJobs(db, 'worker_recovery', NOW, 1);

    expect(claimed.map((document) => document.id)).toEqual(['expired']);
    expect(
      (await db.collection(OUTBOX).doc('expired').get()).data()
    ).toMatchObject({
      status: 'processing',
      leaseOwner: 'worker_recovery',
      leaseExpiresAt: '2026-09-01T00:04:00.000Z'
    });
    expect(
      (await db.collection(OUTBOX).doc('pending').get()).data()?.['status']
    ).toBe('pending');
  });

  it('does not touch processing work whose lease is still active', async () => {
    await seed('active', 'processing', ACTIVE);

    await expect(
      claimCalendarPilotJobs(db, 'worker_other', NOW)
    ).resolves.toHaveLength(0);
    expect(
      (await db.collection(OUTBOX).doc('active').get()).data()
    ).toMatchObject({
      status: 'processing',
      leaseOwner: 'crashed_worker',
      leaseExpiresAt: ACTIVE
    });
  });

  it('allows only one worker to win a concurrent recovery race', async () => {
    await seed('expired', 'processing', EXPIRED);

    const [first, second] = await Promise.all([
      claimCalendarPilotJobs(db, 'worker_one', NOW),
      claimCalendarPilotJobs(db, 'worker_two', NOW)
    ]);

    expect(first.length + second.length).toBe(1);
    expect(
      (await db.collection(OUTBOX).doc('expired').get()).data()?.['leaseOwner']
    ).toMatch(/^worker_(one|two)$/u);
  });
});
