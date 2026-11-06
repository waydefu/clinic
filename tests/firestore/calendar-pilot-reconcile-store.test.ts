import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  settleReconciledCalendarPilotJob,
  verifyReconciliationDocuments
} from '../../apps/worker/src/calendar-sync/calendar-pilot-reconcile-store.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const NOW = '2026-09-01T00:00:00.000Z';
const lease = {
  owner: 'synthetic_reconcile_owner',
  generation: 1,
  now: () => NOW
};
let app: App;
let db: Firestore;
const configuration = () =>
  db.collection('calendar_pilot_configuration').doc('active');
const appointment = () =>
  db.collection('calendar_pilot_appointments').doc('synthetic_reconcile_link');
const mirror = () =>
  db.collection('calendar_pilot_mirrors').doc('synthetic_reconcile_mirror');
const job = () =>
  db.collection('calendar_pilot_outbox').doc('synthetic_reconcile_job');

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `reconcile-store-${Date.now()}`
  );
  db = getFirestore(app);
});

beforeEach(async () => {
  await mirror().delete();
  await configuration().set({
    activeSourceId: 'source_a',
    version: 1,
    expiresAt: '2026-09-02T00:00:00.000Z',
    inboundEnabled: true,
    outboundEnabled: true,
    workerLeaseOwner: lease.owner,
    workerLeaseExpiresAt: '2026-09-01T01:00:00.000Z'
  });
  await appointment().set({ version: 1 });
  await job().set({
    kind: 'calendar_projection_upsert',
    status: 'failed',
    lastErrorCode: 'needs_reconcile',
    localRecordId: 'synthetic_reconcile_link',
    generation: 1
  });
});

afterAll(async () => {
  await appointment().delete();
  await mirror().delete();
  await job().delete();
  await configuration().delete();
  await deleteApp(app);
});

async function expected() {
  return {
    sourceId: 'source_a',
    appointment: await appointment().get(),
    mirrors: [],
    job: await job().get()
  };
}

describe('CAL-PILOT reconciled job settlement', () => {
  it('requires the appointment and mirror snapshot to remain current', async () => {
    const before = await expected();
    expect(await verifyReconciliationDocuments(db, lease, before)).toBe(true);
    await mirror().set({ sourceId: 'source_a', linkId: 'synthetic_reconcile_link' });
    expect(await verifyReconciliationDocuments(db, lease, before)).toBe(false);
  });

  it('settles a matching failed job under the current lease', async () => {
    expect(
      await settleReconciledCalendarPilotJob(db, lease, await expected())
    ).toBe(true);
    expect((await job().get()).data()).toMatchObject({
      status: 'completed',
      lastErrorCode: null
    });
  });

  it('does not settle when the authoritative appointment changes', async () => {
    const before = await expected();
    await appointment().update({ version: 2 });
    expect(await settleReconciledCalendarPilotJob(db, lease, before)).toBe(
      false
    );
    expect((await job().get()).data()).toMatchObject({
      status: 'failed',
      lastErrorCode: 'needs_reconcile'
    });
  });

  it('does not settle when a mirror appears after the decision', async () => {
    const before = await expected();
    await mirror().set({
      sourceId: 'source_a',
      linkId: 'synthetic_reconcile_link'
    });
    expect(await settleReconciledCalendarPilotJob(db, lease, before)).toBe(
      false
    );
    expect((await job().get()).data()).toMatchObject({
      status: 'failed',
      lastErrorCode: 'needs_reconcile'
    });
  });

  it('does not clear a failed job that still has an owner', async () => {
    await job().update({ leaseOwner: 'another_owner' });
    expect(
      await settleReconciledCalendarPilotJob(db, lease, await expected())
    ).toBe(false);
    expect((await job().get()).data()).toMatchObject({
      status: 'failed',
      leaseOwner: 'another_owner'
    });
  });

  it('fails closed if the lease owner changes', async () => {
    const before = await expected();
    await configuration().update({ workerLeaseOwner: 'another_owner' });
    await expect(
      settleReconciledCalendarPilotJob(db, lease, before)
    ).rejects.toThrow();
    expect((await job().get()).data()).toMatchObject({
      status: 'failed',
      lastErrorCode: 'needs_reconcile'
    });
  });
});
