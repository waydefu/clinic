import { createHash } from 'node:crypto';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentSnapshot,
  type Firestore,
  type Transaction
} from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CalendarPilotLeaseConfigurationRecordSchema,
  parseCalendarPilotRecord
} from '../../packages/contracts/src/index.js';
import { formatSyntheticAppointmentTitle } from '../../packages/domain/src/index.js';

import {
  FirestoreCalendarPilotReconciliationAdapter,
  type CalendarPilotReconcileExpectation
} from '../../apps/worker/src/calendar-sync/calendar-pilot-reconcile-adapter.js';
import { GoogleCalendarSyncError } from '../../apps/worker/src/calendar-sync/google-sync-client.js';
import { FirestoreCalendarPilotFullScanPort } from '../../apps/worker/src/calendar-sync/calendar-pilot-full-scan-adapter.js';
import { runCalendarPilotFullScanRound, type CalendarPilotFullScanState } from '../../apps/worker/src/calendar-sync/calendar-pilot-full-scan.js';
import {
  planCalendarPilotReconciliation,
  runCalendarPilotReconciliation,
  type ReconcileEvent,
  type ReconcileSnapshot
} from '../../apps/worker/src/calendar-sync/calendar-pilot-reconciler.js';
import { assertCalendarPilotWorkerLease } from '../../apps/worker/src/calendar-sync/calendar-pilot-worker-lease.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const NOW = '2026-11-06T00:00:00.000Z';
const LINK_A = 'synthetic_reconcile_link_a';
const LINK_B = 'synthetic_reconcile_link_b';
const JOB_A = 'synthetic_reconcile_job_a';
const JOB_B = 'synthetic_reconcile_job_b';
const MIRROR_A = 'synthetic_reconcile_mirror_a';
const TEST_CONFLICTS = 'calendar_pilot_reconcile_test_conflicts';
const lease = {
  owner: 'synthetic_reconcile_owner',
  generation: 1,
  now: () => NOW
};

let app: App;
let db: Firestore;
const configuration = () =>
  db.collection('calendar_pilot_configuration').doc('active');
const appointment = (id = LINK_A) =>
  db.collection('calendar_pilot_appointments').doc(id);
const mirror = (id = MIRROR_A) =>
  db.collection('calendar_pilot_mirrors').doc(id);
const job = (id = JOB_A) => db.collection('calendar_pilot_outbox').doc(id);

async function clearFixtures(): Promise<void> {
  await Promise.all([
    configuration().delete(),
    appointment(LINK_A).delete(),
    appointment(LINK_B).delete(),
    mirror(MIRROR_A).delete(),
    db.collection('calendar_pilot_mirrors').doc('synthetic_other_mirror').delete(),
    job(JOB_A).delete(),
    job(JOB_B).delete(),
    db.collection(TEST_CONFLICTS).doc(LINK_A).delete(),
    db.collection(TEST_CONFLICTS).doc(LINK_B).delete()
  ]);
}

async function seedAppointment(id = LINK_A): Promise<void> {
  await appointment(id).set({
    appointmentId: id,
    patientCode: 'A17',
    bookingKind: 'initial',
    serviceId: 'service_snoring',
    startsAt: '2026-11-06T01:00:00.000Z',
    endsAt: '2026-11-06T01:30:00.000Z',
    status: 'confirmed',
    version: 1
  });
}

async function seedJob(id = JOB_A, linkId = LINK_A, extra = {}): Promise<void> {
  await job(id).set({
    kind: 'calendar_projection_upsert',
    status: 'failed',
    lastErrorCode: 'needs_reconcile',
    localRecordId: linkId,
    generation: 1,
    leaseOwner: null,
    leaseExpiresAt: null,
    ...extra
  });
}

async function seedMirror(): Promise<void> {
  await mirror().set({
    sourceId: 'source_a',
    externalEventId: 'synthetic_original_event',
    etag: '"mirror-v1"',
    linkId: LINK_A,
    parsed: {
      ok: true,
      kind: 'appointment',
      patientCode: 'A17',
      bookingKind: 'initial',
      serviceId: 'service_snoring',
      displayLabel: 'A17，初診，止鼾',
      startsAt: '2026-11-06T01:00:00.000Z',
      endsAt: '2026-11-06T01:30:00.000Z'
    }
  });
}

function sameSnapshot(before: DocumentSnapshot, after: DocumentSnapshot): boolean {
  return (
    before.ref.path === after.ref.path &&
    before.exists === after.exists &&
    (!before.exists ||
      (before.updateTime !== undefined &&
        after.updateTime !== undefined &&
        before.updateTime.isEqual(after.updateTime)))
  );
}

async function compareInTransaction(
  transaction: Transaction,
  expected: CalendarPilotReconcileExpectation
): Promise<boolean> {
  const configurationSnapshot = await transaction.get(expected.configuration.ref);
  const appointmentSnapshot = await transaction.get(expected.appointment.ref);
  const mirrorQuery = db
    .collection('calendar_pilot_mirrors')
    .where('sourceId', '==', expected.sourceId)
    .where('linkId', '==', expected.appointment.id)
    .limit(2);
  const mirrors = await transaction.get(mirrorQuery);
  const jobs = await transaction.get(db.collection('calendar_pilot_outbox')
    .where('localRecordId', '==', expected.appointment.id).limit(100));
  const record = parseCalendarPilotRecord(
    CalendarPilotLeaseConfigurationRecordSchema,
    configurationSnapshot.data()
  );
  assertCalendarPilotWorkerLease(record, lease);
  return (
    record['activeSourceId'] === expected.sourceId &&
    sameSnapshot(expected.configuration, configurationSnapshot) &&
    sameSnapshot(expected.appointment, appointmentSnapshot) &&
    mirrors.size === expected.mirrors.length &&
    expected.mirrors.every((before) =>
      mirrors.docs.some((after) => sameSnapshot(before, after))
    ) &&
    jobs.size < 100 && expected.jobs.length === jobs.size &&
    expected.jobs.every((before) => jobs.docs.some((after: DocumentSnapshot) => sameSnapshot(before, after)))
  );
}

function callbacks() {
  return {
    compareBeforeApply: (expected: CalendarPilotReconcileExpectation) =>
      db.runTransaction((transaction) =>
        compareInTransaction(transaction, expected)
      ),
    recordConflict: async (
      snapshot: ReconcileSnapshot,
      expected: CalendarPilotReconcileExpectation
    ) => {
      await db.runTransaction(async (transaction) => {
        if (!(await compareInTransaction(transaction, expected)))
          throw new Error('Synthetic conflict record lost its lease or CAS.');
        transaction.create(
          db.collection(TEST_CONFLICTS).doc(snapshot.linkId),
          { linkId: snapshot.linkId, recordedAt: NOW }
        );
      });
    }
  };
}

function makeAdapter(input: {
  readonly reader: {
    listReconciliationEvents: (
      linkId: string,
      pageToken?: string
    ) => Promise<{
      readonly events: readonly ReconcileEvent[];
      readonly nextPageToken?: string;
    }>;
    getReconciliationOriginal: (
      eventId: string,
      linkId: string
    ) => Promise<ReconcileEvent | undefined>;
  };
  readonly writes?: string[];
  readonly writer?: ConstructorParameters<typeof FirestoreCalendarPilotReconciliationAdapter>[0]['writer'];
  readonly cursor?: string;
  readonly deadline?: number;
}) {
  const writes = input.writes ?? [];
  return new FirestoreCalendarPilotReconciliationAdapter({
    db,
    lease,
    sourceId: 'source_a',
    workerServiceAccount: 'worker@synthetic.invalid',
    reader: input.reader,
    writer: input.writer ?? {
      upsert: () => {
        writes.push('upsert');
        return Promise.resolve();
      },
      update: () => {
        writes.push('update');
        return Promise.resolve();
      },
      removeWithEtag: (id) => {
        writes.push(`delete:${id}`);
        return Promise.resolve();
      }
    },
    deadline: input.deadline ?? 100,
    now: () => 0,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...callbacks()
  });
}

function event(
  values: Partial<ReconcileEvent> & Pick<ReconcileEvent, 'id' | 'etag'>
): ReconcileEvent {
  return {
    id: values.id,
    etag: values.etag,
    linkId: values.linkId ?? LINK_A,
    status: values.status ?? 'confirmed',
    ...(values.linkMarker === undefined ? {} : { linkMarker: values.linkMarker }),
    ...(values.creatorEmail === undefined ? {} : { creatorEmail: values.creatorEmail }),
    ...(values.organizerEmail === undefined ? {} : { organizerEmail: values.organizerEmail }),
    ...(values.title === undefined ? {} : { title: values.title }),
    ...(values.startsAt === undefined ? {} : { startsAt: values.startsAt }),
    ...(values.endsAt === undefined ? {} : { endsAt: values.endsAt })
  };
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `reconcile-adapter-${Date.now()}`
  );
  db = getFirestore(app);
});

beforeEach(async () => {
  await clearFixtures();
  await configuration().set({
    activeSourceId: 'source_a',
    version: 1,
    expiresAt: '2026-11-07T00:00:00.000Z',
    inboundEnabled: true,
    outboundEnabled: true,
    workerLeaseOwner: lease.owner,
    workerLeaseExpiresAt: '2026-11-06T01:00:00.000Z'
  });
  await seedAppointment();
  await seedJob();
});

afterAll(async () => {
  await clearFixtures();
  await deleteApp(app);
});

describe('Firestore CAL-PILOT reconciliation adapter', () => {
  it.each(['proven', 'missing_creator', 'another_original'] as const)(
    'honors ownership and every mirror original: %s', async (scenario: 'proven' | 'missing_creator' | 'another_original') => {
    const hasCreator = scenario !== 'missing_creator';
    await seedMirror();
    const title = formatSyntheticAppointmentTitle({
      patientCode: 'A17',
      bookingKind: 'initial',
      serviceId: 'service_snoring'
    });
    const original = event({
      id: 'synthetic_original_event',
      etag: '"original-v1"',
      title,
      startsAt: '2026-11-06T01:00:00.000Z',
      endsAt: '2026-11-06T01:30:00.000Z'
    });
    const projectionId = `calpilot${createHash('sha256')
      .update(LINK_A)
      .digest('hex')
      .slice(0, 40)}`;
    const duplicate = event({
      id: projectionId,
      etag: '"projection-v1"',
      linkMarker: LINK_A,
      ...(hasCreator ? { creatorEmail: 'worker@synthetic.invalid' } : {}),
      title,
      startsAt: '2026-11-06T01:00:00.000Z',
      endsAt: '2026-11-06T01:30:00.000Z'
    });
    const pageTokens: Array<string | undefined> = [];
    const writes: string[] = [];
    const adapter = makeAdapter({
      writes,
      reader: {
        listReconciliationEvents: (_linkId, pageToken) => {
          pageTokens.push(pageToken);
          return Promise.resolve(
            pageToken === undefined
              ? { events: [original], nextPageToken: 'page_2' }
              : { events: [duplicate] }
          );
        },
        getReconciliationOriginal: (id) =>
          Promise.resolve(id === original.id ? original : undefined)
      }
    });

    expect(await adapter.scan(10)).toEqual([LINK_A]);
    const snapshot = await adapter.read(LINK_A);
    if (scenario === 'another_original') {
      await db.collection('calendar_pilot_mirrors').doc('synthetic_other_mirror').set({
        sourceId: 'source_a', linkId: LINK_B, externalEventId: projectionId
      });
    }
    const action = planCalendarPilotReconciliation(snapshot);
    if (hasCreator) {
      expect(action).toEqual({ kind: 'delete', id: projectionId, etag: '"projection-v1"' });
      if (action.kind !== 'delete') throw new Error('Expected conditional deletion.');
      if (scenario === 'another_original')
        await expect(adapter.apply(LINK_A, action)).rejects.toThrow('mirror original');
      else await adapter.apply(LINK_A, action);
    } else {
      expect(action).toEqual({ kind: 'conflict' });
      await adapter.recordConflict(snapshot);
    }

    expect(pageTokens).toEqual([undefined, 'page_2']);
    expect(writes).toEqual(scenario === 'proven' ? [`delete:${projectionId}`] : []);
    expect(adapter.scanCursor).toBe(JOB_A);
    expect((await job().get()).data()).toMatchObject({
      status: 'failed',
      lastErrorCode: 'needs_reconcile'
    });
  });

  it('settles a failed job only when current appointment and original mirror are a no-op', async () => {
    await seedMirror();
    const title = formatSyntheticAppointmentTitle({
      patientCode: 'A17',
      bookingKind: 'initial',
      serviceId: 'service_snoring'
    });
    const original = event({
      id: 'synthetic_original_event',
      etag: '"original-v1"',
      title,
      startsAt: '2026-11-06T01:00:00.000Z',
      endsAt: '2026-11-06T01:30:00.000Z'
    });
    const writes: string[] = [];
    const adapter = makeAdapter({
      writes,
      reader: {
        listReconciliationEvents: () => Promise.resolve({ events: [original] }),
        getReconciliationOriginal: () => Promise.resolve(original)
      }
    });

    expect(
      await runCalendarPilotReconciliation(adapter, {
        maxItems: 10,
        deadline: 100,
        now: () => 0
      })
    ).toEqual({ processed: 1, converged: 0, conflicts: 0, blocked: 0 });
    expect(writes).toEqual([]);
    expect((await job().get()).data()).toMatchObject({
      status: 'completed',
      lastErrorCode: null,
      leaseOwner: null
    });
  });

  it('settles all unchanged failed jobs even when the link was found by a full scan', async () => {
    await seedMirror();
    await seedJob(JOB_B);
    const original = event({
      id: 'synthetic_original_event',
      etag: '"original-v1"',
      title: formatSyntheticAppointmentTitle({
        patientCode: 'A17', bookingKind: 'initial', serviceId: 'service_snoring'
      }),
      startsAt: '2026-11-06T01:00:00.000Z',
      endsAt: '2026-11-06T01:30:00.000Z'
    });
    const adapter = makeAdapter({
      reader: {
        listReconciliationEvents: () => Promise.resolve({ events: [original] }),
        getReconciliationOriginal: () => Promise.resolve(original)
      }
    });
    const snapshot = await adapter.read(LINK_A);
    expect(planCalendarPilotReconciliation(snapshot)).toEqual({ kind: 'no-op' });
    expect(await adapter.settleIfUnchanged(snapshot)).toBe(true);
    expect((await job(JOB_A).get()).data()?.['status']).toBe('completed');
    expect((await job(JOB_B).get()).data()?.['status']).toBe('completed');
  });

  it('records unknown ownership under the injected lease callback and never writes', async () => {
    const writes: string[] = [];
    const deterministicId = `calpilot${createHash('sha256')
      .update(LINK_A)
      .digest('hex')
      .slice(0, 40)}`;
    const unknown = event({
      id: deterministicId,
      etag: '"unknown-v1"',
      linkId: 'synthetic_other_link',
      title: 'not our projection',
      startsAt: '2026-11-06T01:00:00.000Z',
      endsAt: '2026-11-06T01:30:00.000Z'
    });
    const adapter = makeAdapter({
      writes,
      reader: {
        listReconciliationEvents: () => Promise.resolve({ events: [unknown] }),
        getReconciliationOriginal: () => Promise.resolve(undefined)
      }
    });

    expect(
      await runCalendarPilotReconciliation(adapter, {
        maxItems: 10,
        deadline: 100,
        now: () => 0
      })
    ).toEqual({ processed: 1, converged: 0, conflicts: 1, blocked: 0 });
    expect((await db.collection(TEST_CONFLICTS).doc(LINK_A).get()).exists).toBe(
      true
    );
    expect(writes).toEqual([]);
    expect((await job().get()).data()).toMatchObject({
      status: 'failed',
      lastErrorCode: 'needs_reconcile'
    });
  });

  it('blocks an existing job owner and refuses an apply after the Firestore CAS changes', async () => {
    await seedJob(JOB_A, LINK_A, {
      leaseOwner: 'synthetic_stuck_owner',
      leaseExpiresAt: '2026-11-06T00:30:00.000Z'
    });
    const reader = {
      listReconciliationEvents: vi.fn(() => Promise.resolve({ events: [] })),
      getReconciliationOriginal: vi.fn(() => Promise.resolve(undefined))
    };
    const blocked = makeAdapter({ reader });
    expect(
      await runCalendarPilotReconciliation(blocked, {
        maxItems: 10,
        deadline: 100,
        now: () => 0
      })
    ).toEqual({ processed: 1, converged: 0, conflicts: 0, blocked: 1 });
    expect(reader.listReconciliationEvents).not.toHaveBeenCalled();
    expect(reader.getReconciliationOriginal).not.toHaveBeenCalled();

    await seedJob(JOB_A, LINK_A);
    await seedMirror();
    const staleOriginal = event({
      id: 'synthetic_original_event',
      etag: '"original-v1"',
      title: 'stale synthetic title',
      startsAt: '2026-11-06T01:00:00.000Z',
      endsAt: '2026-11-06T01:30:00.000Z'
    });
    const readerWithOriginal = {
      listReconciliationEvents: () =>
        Promise.resolve({ events: [staleOriginal] }),
      getReconciliationOriginal: () => Promise.resolve(staleOriginal)
    };
    const writes: string[] = [];
    const adapter = makeAdapter({ writes, reader: readerWithOriginal });
    expect(await adapter.scan(10)).toEqual([LINK_A]);
    const snapshot = await adapter.read(LINK_A);
    const action = planCalendarPilotReconciliation(snapshot);
    expect(action.kind).toBe('patch');
    await appointment().update({ startsAt: '2026-11-06T02:00:00.000Z' });
    if (action.kind === 'insert' || action.kind === 'patch' || action.kind === 'delete')
      await expect(adapter.apply(LINK_A, action)).rejects.toThrow(
        'Calendar reconciliation changed before apply.'
      );
    expect(writes).toEqual([]);
  });

  it.each([412, 503])('records needs_reconcile without retry after provider %i', async (status: number) => {
    await seedMirror();
    const original = event({ id: 'synthetic_original_event', etag: '"original-v1"',
      title: 'synthetic outdated title', startsAt: '2026-11-06T01:00:00.000Z',
      endsAt: '2026-11-06T01:30:00.000Z' });
    const update = vi.fn(() => Promise.reject(new GoogleCalendarSyncError('synthetic provider error', status, true)));
    const adapter = makeAdapter({
      reader: { listReconciliationEvents: () => Promise.resolve({ events: [] }),
        getReconciliationOriginal: () => Promise.resolve(original) },
      writer: { upsert: () => Promise.resolve(), update, removeWithEtag: () => Promise.resolve() }
    });
    const snapshot = await adapter.read(LINK_A);
    const action = planCalendarPilotReconciliation(snapshot);
    if (action.kind !== 'patch') throw new Error('Expected conditional patch.');
    const before = await db.collection('calendar_pilot_outbox').where('localRecordId', '==', LINK_A).get();
    const previousIds = new Set(before.docs.map((document: DocumentSnapshot) => document.id));
    let created: DocumentSnapshot[] = [];
    try {
      await expect(adapter.apply(LINK_A, action)).rejects.toThrow('synthetic provider error');
      const after = await db.collection('calendar_pilot_outbox').where('localRecordId', '==', LINK_A).get();
      created = after.docs.filter((document: DocumentSnapshot) => !previousIds.has(document.id));
      expect(update).toHaveBeenCalledTimes(1);
      expect(created).toHaveLength(1);
      expect(created[0]?.data()).toMatchObject({ status: 'failed', lastErrorCode: 'needs_reconcile',
        localRecordId: LINK_A, generation: lease.generation });
    } finally {
      await Promise.all(created.map((document) => document.ref.delete()));
    }
  });

  it('fully scans a completed job and a second complete pass is a no-op', async () => {
    await seedMirror();
    await seedJob(JOB_A, LINK_A, { status: 'completed', lastErrorCode: null });
    const title = formatSyntheticAppointmentTitle({
      patientCode: 'A17', bookingKind: 'initial', serviceId: 'service_snoring'
    });
    const original = event({ id: 'synthetic_original_event', etag: '"original-v1"', title,
      startsAt: '2026-11-06T01:00:00.000Z', endsAt: '2026-11-06T01:30:00.000Z' });
    const duplicateId = `calpilot${createHash('sha256').update(LINK_A).digest('hex').slice(0, 40)}`;
    const duplicate = event({ ...original, id: duplicateId, etag: '"duplicate-v1"',
      linkMarker: LINK_A, creatorEmail: 'worker@synthetic.invalid' });
    const writes: string[] = [];
    const reconciler = makeAdapter({ writes, reader: {
      listReconciliationEvents: () => Promise.resolve({ events: writes.length === 0 ? [duplicate] : [] }),
      getReconciliationOriginal: () => Promise.resolve(original)
    } });
    const conflicts: string[] = [];
    const port = new FirestoreCalendarPilotFullScanPort({
      db, lease, sourceId: 'source_a', reconciler,
      recordUnattributedConflict: (id) => { conflicts.push(id); return Promise.resolve(); },
      reader: { listWholeCalendarInventory: (_limit, token) => Promise.resolve(token === undefined
        ? { events: [{ id: original.id, recurring: false }], nextPageToken: 'page_2' }
        : { events: writes.length === 0 ? [{ id: duplicateId, linkId: LINK_A, recurring: false }] : [] }) }
    });
    const options = { scope: 'synthetic-source-v1', maxItems: 2, deadline: 100, now: () => 0 };
    async function fullPass(): Promise<boolean> {
      let state: CalendarPilotFullScanState | undefined;
      for (let i = 0; i < 100; i += 1) {
        const result = await runCalendarPilotFullScanRound(port, options, state);
        if (result.state.phase !== 'complete') expect(result.converged).toBe(false);
        state = result.state;
        if (state.phase === 'complete') return result.converged;
      }
      throw new Error('Synthetic full scan did not complete.');
    }
    expect(await fullPass()).toBe(false);
    expect(writes).toEqual([`delete:${duplicateId}`]);
    expect(await fullPass()).toBe(true);
    expect(writes).toEqual([`delete:${duplicateId}`]);
    expect(conflicts).toEqual([]);
  });

  it('resumes bounded scans from its opaque document cursor', async () => {
    await seedJob(JOB_A, LINK_A);
    await seedAppointment(LINK_B);
    await seedJob(JOB_B, LINK_B);
    const adapter = makeAdapter({
      reader: {
        listReconciliationEvents: () => Promise.resolve({ events: [] }),
        getReconciliationOriginal: () => Promise.resolve(undefined)
      }
    });

    expect(await adapter.scan(1)).toEqual([LINK_A]);
    expect(adapter.scanCursor).toBe(JOB_A);
    expect(await adapter.scan(1)).toEqual([LINK_B]);
    expect(adapter.scanCursor).toBe(JOB_B);
    expect(await adapter.scan(1)).toEqual([]);
    expect(adapter.scanCursor).toBeUndefined();
  });
});
