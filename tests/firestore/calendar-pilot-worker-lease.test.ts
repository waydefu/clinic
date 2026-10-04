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

/** A retried (backed-off) or fresh pending job; omit `nextAttemptAt` for the legacy shape. */
async function seedPending(
  id: string,
  options: {
    readonly nextAttemptAt?: unknown;
    readonly createdAt?: string;
  } = {}
): Promise<void> {
  await db
    .collection(OUTBOX)
    .doc(id)
    .set({
      kind: 'calendar_projection_restore',
      status: 'pending',
      mirrorId: `mirror_${id}`,
      generation: 1,
      createdAt: options.createdAt ?? '2026-08-31T23:55:00.000Z',
      attemptCount: options.nextAttemptAt === undefined ? 0 : 1,
      ...(options.nextAttemptAt === undefined
        ? {}
        : { nextAttemptAt: options.nextAttemptAt })
    });
}

const jobState = async (id: string) =>
  (await db.collection(OUTBOX).doc(id).get()).data();

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

// AUD-10: a retried job carries `nextAttemptAt` (the runtime writes it on every
// retryable failure). Claiming must honour it exactly like the main outbox:
// a pending job is due when `nextAttemptAt` is absent (legacy shape, the
// `isDue` convention in packages/domain/src/outbox.ts) or `<= now`.
describe('CAL-PILOT job claiming honours nextAttemptAt (AUD-10)', () => {
  const FUTURE = '2026-09-01T00:00:10.000Z';
  const PAST = '2026-08-31T23:59:50.000Z';

  it('does not claim a pending job whose backoff has not elapsed', async () => {
    await seedPending('backing_off', { nextAttemptAt: FUTURE });

    await expect(
      claimCalendarPilotJobs(db, 'worker_early', NOW)
    ).resolves.toHaveLength(0);
    expect(await jobState('backing_off')).toMatchObject({
      status: 'pending',
      nextAttemptAt: FUTURE
    });
    expect(await jobState('backing_off')).not.toHaveProperty('leaseOwner');
  });

  it('claims a pending job once its backoff has elapsed, including exactly at the boundary', async () => {
    await seedPending('due_past', { nextAttemptAt: PAST });
    await seedPending('due_now', { nextAttemptAt: NOW });

    const claimed = await claimCalendarPilotJobs(db, 'worker_due', NOW);

    expect(claimed.map((document) => document.id).sort()).toEqual([
      'due_now',
      'due_past'
    ]);
    expect(await jobState('due_past')).toMatchObject({
      status: 'processing',
      leaseOwner: 'worker_due'
    });
  });

  it('treats a pending job without nextAttemptAt as immediately due', async () => {
    await seedPending('legacy_shape');

    const claimed = await claimCalendarPilotJobs(db, 'worker_legacy', NOW);

    expect(claimed.map((document) => document.id)).toEqual(['legacy_shape']);
  });

  it('fails closed when nextAttemptAt is present but unreadable', async () => {
    await seedPending('garbled_string', { nextAttemptAt: 'not-a-timestamp' });
    await seedPending('garbled_number', { nextAttemptAt: 12345 });

    await expect(
      claimCalendarPilotJobs(db, 'worker_garbled', NOW)
    ).resolves.toHaveLength(0);
    expect((await jobState('garbled_string'))?.['status']).toBe('pending');
    expect((await jobState('garbled_number'))?.['status']).toBe('pending');
  });

  it('is not starved by a full page of older jobs that are still backing off', async () => {
    for (let index = 0; index < 20; index += 1)
      await seedPending(`backoff_${String(index).padStart(2, '0')}`, {
        nextAttemptAt: FUTURE,
        createdAt: `2026-08-31T23:50:${String(index).padStart(2, '0')}.000Z`
      });
    await seedPending('due_behind', { createdAt: '2026-08-31T23:58:00.000Z' });

    const claimed = await claimCalendarPilotJobs(db, 'worker_behind', NOW, 1);

    expect(claimed.map((document) => document.id)).toEqual(['due_behind']);
    expect((await jobState('backoff_00'))?.['status']).toBe('pending');
    expect((await jobState('backoff_19'))?.['status']).toBe('pending');
  });

  it('lets only one of two concurrent claimers take a due job', async () => {
    await seedPending('contended', { nextAttemptAt: PAST });

    const [first, second] = await Promise.all([
      claimCalendarPilotJobs(db, 'worker_one', NOW),
      claimCalendarPilotJobs(db, 'worker_two', NOW)
    ]);

    expect(first.length + second.length).toBe(1);
    expect((await jobState('contended'))?.['leaseOwner']).toMatch(
      /^worker_(one|two)$/u
    );
  });

  it('lets only one of two concurrent claimers see a job whose backoff elapses between runs', async () => {
    await seedPending('later', { nextAttemptAt: FUTURE });

    const early = await Promise.all([
      claimCalendarPilotJobs(db, 'worker_one', NOW),
      claimCalendarPilotJobs(db, 'worker_two', NOW)
    ]);
    expect(early.flat()).toHaveLength(0);

    const due = await Promise.all([
      claimCalendarPilotJobs(db, 'worker_one', '2026-09-01T00:00:11.000Z'),
      claimCalendarPilotJobs(db, 'worker_two', '2026-09-01T00:00:11.000Z')
    ]);
    expect(due.flat()).toHaveLength(1);
  });
});
