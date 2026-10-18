import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  calendarEventIdForAppointment,
  MAX_ATTEMPTS
} from '@beauessence/domain';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';
import {
  CalendarError,
  InMemoryCalendar
} from '../../apps/worker/src/calendar-port.js';
import {
  APPOINTMENTS_COLLECTION,
  LEASE_SECONDS,
  OUTBOX_COLLECTION,
  OutboxProcessor
} from '../../apps/worker/src/outbox-processor.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const NOW = '2026-07-21T09:00:00.000Z';
const jobId = 'synthetic_lease_job';
const appointmentId = 'synthetic_lease_appointment';
let app: App;
let db: Firestore;
let calendar: InMemoryCalendar;
const job = () => db.collection(OUTBOX_COLLECTION).doc(jobId);
const state = async () => (await job().get()).data();
const processor = (owner = 'synthetic_worker_a', target = calendar) =>
  new OutboxProcessor(
    db,
    target,
    undefined,
    () => 0.5,
    () => 0,
    owner
  );

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    'synthetic_outbox_lease_tests'
  );
  db = getFirestore(app);
});
afterAll(async () => {
  await deleteApp(app);
});
beforeEach(async () => {
  // The guard above and fresh emulator venue prevent access to nonlocal data.
  for (const name of [OUTBOX_COLLECTION, APPOINTMENTS_COLLECTION]) {
    const refs = await db.collection(name).listDocuments();
    await Promise.all(refs.map((ref) => ref.delete()));
  }
  calendar = new InMemoryCalendar();
  await db.collection(APPOINTMENTS_COLLECTION).doc(appointmentId).set({
    status: 'confirmed',
    startsAt: '2030-01-02T04:00:00.000Z',
    bookingKind: 'initial'
  });
  await job().set({
    schemaVersion: 1,
    appointmentId,
    correlationId: 'synthetic_correlation',
    causationId: 'synthetic_audit',
    idempotencyKey: calendarEventIdForAppointment(appointmentId),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: NOW
  });
});

function expectNoLease(record: Record<string, unknown> | undefined) {
  expect(record).toBeDefined();
  expect(Object.hasOwn(record!, 'leaseOwner')).toBe(false);
  // Existing settlement representation is null; no valid expiry remains.
  expect(record!['leaseExpiresAt']).toBeNull();
}

describe('Firestore persisted outbox lease ownership', () => {
  it.each(['success', 'permanent-failure', 'exhausted-retries'] as const)(
    'retires ownership after %s without resetting the fencing generation',
    async (scenario) => {
      if (scenario !== 'success')
        calendar.failNext(1, scenario === 'exhausted-retries');
      if (scenario === 'exhausted-retries')
        await job().update({ attempts: MAX_ATTEMPTS - 1 });
      const result = await processor().processDue(NOW, 1);
      const record = await state();
      expect(record!['status']).toBe(
        scenario === 'success' ? 'completed' : 'dead_letter'
      );
      expect(result).toMatchObject(
        scenario === 'success'
          ? { completed: 1, deadLettered: 0 }
          : { completed: 0, deadLettered: 1 }
      );
      expect(record!['generation']).toBe(1);
      expectNoLease(record);
    }
  );

  it('quarantines an unreadable expired claim without leaving its old owner or expiry', async () => {
    await job().update({
      status: 'in_progress',
      correlationId: 42,
      leaseOwner: 'synthetic_old_worker',
      leaseExpiresAt: '2026-07-21T08:00:00.000Z',
      generation: 4
    });
    const result = await processor().processDue(NOW, 1);
    const record = await state();
    expect(result.claimed).toBe(0);
    expect(record!['status']).toBe('dead_letter');
    expect(record!['generation']).toBe(4);
    expect(calendar.callCount).toBe(0);
    expectNoLease(record);
  });

  it('retires a retry lease and claims a fresh owner with a strictly higher generation', async () => {
    calendar.failNext(1, true);
    expect(await processor().processDue(NOW, 1)).toMatchObject({ retried: 1 });
    const pending = await state();
    expect(pending!['status']).toBe('pending');
    expect(pending!['generation']).toBe(1);
    expectNoLease(pending);
    const next = pending!['nextAttemptAt'];
    expect(typeof next).toBe('string');
    if (typeof next !== 'string')
      throw new Error('Missing synthetic retry instant.');
    expect(
      await processor('synthetic_worker_b').processDue(next, 1)
    ).toMatchObject({ completed: 1 });
    const completed = await state();
    expect(completed!['generation']).toBe(2);
    expectNoLease(completed);
  });

  it('clears legacy dead-letter ownership on explicit requeue without resetting generation', async () => {
    await job().update({
      status: 'dead_letter',
      leaseOwner: 'synthetic_old_worker',
      leaseExpiresAt: '2026-07-21T10:00:00.000Z',
      generation: 7
    });
    const worker = processor();
    expect(await worker.requeue(jobId, 'synthetic_operator', NOW)).toBe(true);
    const pending = await state();
    expect(pending!['status']).toBe('pending');
    expect(pending!['generation']).toBe(7);
    expect(Object.hasOwn(pending!, 'leaseOwner')).toBe(false);
    expect(Object.hasOwn(pending!, 'leaseExpiresAt')).toBe(false);
    expect(await worker.processDue(NOW, 1)).toMatchObject({ completed: 1 });
    expect((await state())!['generation']).toBe(8);
  });

  it('does not let a delayed stale owner replace a newer completed settlement with failure', async () => {
    let release: () => void = () => undefined;
    let notify: () => void = () => undefined;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const delayed = new InMemoryCalendar();
    delayed.project = async () => {
      notify();
      await paused;
      throw new CalendarError('Synthetic stale failure.', false);
    };
    const oldRun = processor('synthetic_worker_a', delayed).processDue(NOW, 1);
    try {
      await Promise.race([
        started,
        oldRun.then(() => {
          throw new Error('Synthetic worker never reached projection.');
        })
      ]);
      const claimed = await state();
      expect(claimed!['leaseOwner']).toBe('synthetic_worker_a');
      expect(claimed!['generation']).toBe(1);
      const afterExpiry = new Date(
        Date.parse(NOW) + (LEASE_SECONDS + 1) * 1000
      ).toISOString();
      expect(
        await processor('synthetic_worker_b').processDue(afterExpiry, 1)
      ).toMatchObject({ completed: 1 });
      const settled = await state();
      expect(settled!['status']).toBe('completed');
      expect(settled!['generation']).toBe(2);
      release();
      expect(await oldRun).toMatchObject({
        claimed: 1,
        completed: 0,
        deadLettered: 0,
        retried: 0
      });
      expect(await state()).toEqual(settled);
    } finally {
      release();
      await oldRun;
    }
  });
});
