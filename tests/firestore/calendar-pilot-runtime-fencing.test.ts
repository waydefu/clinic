import { createHash } from 'node:crypto';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { syntheticOpenMaintenanceControl } from '../helpers/synthetic-maintenance.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  CalendarPilotRuntime,
  C1_SYNTHETIC_CALENDAR_SOURCE_ID
} from '../../apps/worker/src/calendar-sync/calendar-pilot-runtime.js';
import { FirestoreCalendarSyncRepository } from '../../apps/worker/src/calendar-sync/firestore-calendar-sync.repository.js';
import { CalendarSyncEngine } from '../../apps/worker/src/calendar-sync/sync-engine.js';
import { GoogleCalendarEventReader } from '../../apps/worker/src/calendar-sync/google-sync-client.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

// No token provider or Calendar request may reach a real service in this suite.
const providers = vi.hoisted(() => ({
  beforeToken: (): void | Promise<void> => {}
}));
vi.mock('../../apps/worker/src/google-calendar.js', () => ({
  createCloudAdcTokenProvider: () => async () => {
    await providers.beforeToken();
    return 'test';
  },
  createServiceAccountTokenProvider: () => {
    throw new Error(
      'Service-account authentication is not allowed in this test.'
    );
  }
}));
requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const NOW = '2026-09-01T00:00:00.000Z';
const DEADLINE = '2026-09-01T00:04:00.000Z';
const SYNTHETIC_ETAG = '"synthetic-etag"';
const SOURCE = C1_SYNTHETIC_CALENDAR_SOURCE_ID;
const CONFIG = 'calendar_pilot_configuration';
const OUTBOX = 'calendar_pilot_outbox';
const collections = [
  CONFIG,
  OUTBOX,
  'calendar_pilot_sources',
  'calendar_pilot_preflights',
  'calendar_pilot_patients',
  'calendar_pilot_audit_events'
];
const environment = {
  CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
  GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
  CALENDAR_PILOT_PSEUDONYM_KEY: 'p'.repeat(32),
  GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
  GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
};
let app: App;
let db: Firestore;
let clock: string;
const now = () => clock;
const configuration = () => db.collection(CONFIG).doc('active');
const state = async (id: string) =>
  (await db.collection(OUTBOX).doc(id).get()).data();
const dispatch = vi.fn<typeof fetch>();
let afterDispatch: () => void | Promise<void>;
let restoreEngine = () => {};
let engineCallCount = () => 0;
let mutationFailure:
  | {
      readonly method: 'PATCH' | 'DELETE';
      readonly status?: number;
      readonly unknown?: boolean;
    }
  | undefined;

function requestsForEvent(eventId: string) {
  return dispatch.mock.calls.filter(([url]) => {
    const target =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    return new URL(target).pathname.endsWith(`/events/${eventId}`);
  });
}

async function wipe(): Promise<void> {
  for (const collection of collections) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}
async function seedJob(id: string, kind = 'calendar_projection_delete') {
  await db.collection(OUTBOX).doc(id).set({
    kind,
    status: 'pending',
    sourceId: SOURCE,
    localRecordId: id,
    generation: 1,
    attemptCount: 0,
    createdAt: NOW
  });
}
function run() {
  return new CalendarPilotRuntime(
    db,
    environment,
    now,
    syntheticOpenMaintenanceControl()
  ).run(NOW);
}

function reconcile() {
  return new CalendarPilotRuntime(
    db,
    {
      ...environment,
      CALENDAR_PILOT_WORKER_SERVICE_ACCOUNT_EMAIL: 'worker@synthetic.invalid'
    },
    now,
    syntheticOpenMaintenanceControl()
  ).runReconciliationRound();
}

async function completeReconciliation() {
  for (let i = 0; i < 20; i += 1) {
    const result = await reconcile();
    if ('state' in result && result.state?.phase === 'complete') return result;
    expect(result.converged).toBe(false);
  }
  throw new Error('Synthetic reconciliation did not complete.');
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    'runtime-fencing'
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await wipe();
  clock = NOW;
  providers.beforeToken = () => {};
  afterDispatch = () => {};
  mutationFailure = undefined;
  dispatch.mockReset();
  dispatch.mockImplementation(async (url, init) => {
    // Unexpected provider destinations are test failures, not a network fallback.
    const target =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    expect(target.startsWith('https://www.googleapis.com/calendar/v3/')).toBe(
      true
    );
    const method = init?.method ?? 'GET';
    if (method === 'GET' && new URL(target).pathname.includes('/events/')) {
      const eventId = new URL(target).pathname.split('/').at(-1);
      const linkId =
        ['job_a', 'job_b'].find(
          (id) =>
            eventId ===
            `calpilot${createHash('sha256').update(id).digest('hex').slice(0, 40)}`
        ) ??
        (eventId?.startsWith('calpilotpreflight')
          ? `preflight_${eventId.slice('calpilotpreflight'.length)}`
          : undefined);
      if (linkId === undefined) throw new Error('Unknown synthetic event.');
      return Response.json({
        id: eventId,
        etag: SYNTHETIC_ETAG,
        status: 'confirmed',
        summary: 'Synthetic event',
        start: { dateTime: '2026-09-01T04:00:00.000Z' },
        end: { dateTime: '2026-09-01T04:30:00.000Z' },
        extendedProperties: { private: { beauessenceLinkId: linkId } }
      });
    }
    if (method === 'PATCH' || method === 'DELETE')
      expect(new Headers(init?.headers).get('If-Match')).toBe(SYNTHETIC_ETAG);
    await afterDispatch();
    const failure = mutationFailure;
    if (failure !== undefined && failure.method === method) {
      mutationFailure = undefined;
      if (failure.unknown)
        throw new Error('synthetic mutation outcome unknown');
      return new Response(null, { status: failure.status });
    }
    return Response.json({ items: [] });
  });
  vi.stubGlobal('fetch', dispatch);
  const engine = vi
    .spyOn(CalendarSyncEngine.prototype, 'run')
    .mockResolvedValue({
      mode: 'full',
      pages: 0,
      seen: 0,
      candidates: 0,
      skipped: 0,
      rebuiltAfterExpiredToken: false,
      completedAt: NOW
    });
  restoreEngine = () => engine.mockRestore();
  engineCallCount = () => engine.mock.calls.length;
  await configuration().set({
    activeSourceId: SOURCE,
    version: 1,
    expiresAt: '2026-09-02T00:00:00.000Z',
    inboundEnabled: true,
    outboundEnabled: true,
    health: 'healthy'
  });
  await db
    .collection('calendar_pilot_sources')
    .doc(SOURCE)
    .set({ syncToken: 'test' });
  await seedJob('job_a');
  await seedJob('job_b');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('CAL-PILOT dispatch and completion use live lease state', () => {
  it('reports a stuck reconciliation owner without touching the provider', async () => {
    await configuration().update({
      workerLeaseOwner: 'synthetic_previous_owner',
      workerLeaseExpiresAt: '2026-08-31T23:59:59.000Z'
    });
    const runtime = new CalendarPilotRuntime(
      db,
      {
        ...environment,
        CALENDAR_PILOT_WORKER_SERVICE_ACCOUNT_EMAIL: 'worker@synthetic.invalid'
      },
      now,
      syntheticOpenMaintenanceControl()
    );
    await expect(runtime.runReconciliationRound()).resolves.toMatchObject({
      acquired: false,
      blocked: 'owner_present',
      converged: false
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect((await configuration().get()).data()?.['workerLeaseOwner']).toBe(
      'synthetic_previous_owner'
    );
  });

  it('runs two independent synthetic full scans without provider mutations', async () => {
    await db.collection(OUTBOX).doc('job_a').delete();
    await db.collection(OUTBOX).doc('job_b').delete();
    const runtime = () =>
      new CalendarPilotRuntime(
        db,
        {
          ...environment,
          CALENDAR_PILOT_WORKER_SERVICE_ACCOUNT_EMAIL:
            'worker@synthetic.invalid'
        },
        now,
        syntheticOpenMaintenanceControl()
      );
    async function fullPass() {
      for (let i = 0; i < 10; i += 1) {
        const result = await runtime().runReconciliationRound();
        expect(result.acquired).toBe(true);
        if (!('state' in result) || result.state === undefined)
          throw new Error('Expected synthetic scan state.');
        const next = result.state;
        if (next.phase === 'complete') return result;
        expect(result.converged).toBe(false);
      }
      throw new Error('Synthetic scan did not complete.');
    }
    expect(await fullPass()).toMatchObject({ acquired: true, converged: true });
    expect(await fullPass()).toMatchObject({ acquired: true, converged: true });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(
      dispatch.mock.calls.every(
        (call: [RequestInfo | URL, RequestInit?]) => call[1]?.method === 'GET'
      )
    ).toBe(true);
  });
  it('resumes a saved page after restart and resets an invalid page token', async () => {
    const tokens: (string | null)[] = [];
    dispatch.mockImplementation((url: RequestInfo | URL) => {
      const target =
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      const token = new URL(target).searchParams.get('pageToken');
      tokens.push(token);
      return Promise.resolve(
        token === 'next'
          ? new Response(null, { status: 410 })
          : Response.json(
              tokens.length === 1
                ? { items: [], nextPageToken: 'next' }
                : { items: [] }
            )
      );
    });
    const runtime = () =>
      new CalendarPilotRuntime(
        db,
        {
          ...environment,
          CALENDAR_PILOT_WORKER_SERVICE_ACCOUNT_EMAIL:
            'worker@synthetic.invalid'
        },
        now,
        syntheticOpenMaintenanceControl()
      );
    expect(await runtime().runReconciliationRound()).toMatchObject({
      converged: false
    });
    expect(
      (await configuration().get()).data()?.['reconciliationScan']
    ).toMatchObject({
      startedAt: NOW,
      inFlight: null,
      state: { pageToken: 'next' }
    });
    expect(await runtime().runReconciliationRound()).toMatchObject({
      blocked: 'page_token_expired',
      converged: false
    });
    expect(
      (await configuration().get()).data()?.['reconciliationScan']
    ).toMatchObject({ state: null, inFlight: null });
    expect(await runtime().runReconciliationRound()).toMatchObject({
      converged: false
    });
    expect(tokens).toEqual([null, 'next', null]);
    expect(await completeReconciliation()).toMatchObject({ converged: false });
    const conflicts = await db
      .collection('calendar_pilot_audit_events')
      .where('action', '==', 'calendar_reconciliation_conflict')
      .get();
    expect(conflicts.size).toBeGreaterThan(0);
  });

  it('discards an expired cursor without reporting convergence', async () => {
    const tokens: (string | null)[] = [];
    dispatch.mockImplementation((url: RequestInfo | URL) => {
      const target =
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      tokens.push(new URL(target).searchParams.get('pageToken'));
      return Promise.resolve(
        Response.json(
          tokens.length === 1
            ? { items: [], nextPageToken: 'next' }
            : { items: [] }
        )
      );
    });
    const runtime = () =>
      new CalendarPilotRuntime(
        db,
        {
          ...environment,
          CALENDAR_PILOT_WORKER_SERVICE_ACCOUNT_EMAIL:
            'worker@synthetic.invalid'
        },
        now,
        syntheticOpenMaintenanceControl()
      );
    await runtime().runReconciliationRound();
    await configuration().update({
      'reconciliationScan.startedAt': '2026-08-30T00:00:00.000Z'
    });
    expect(await runtime().runReconciliationRound()).toMatchObject({
      converged: false
    });
    expect(tokens).toEqual([null, null]);
    expect(await completeReconciliation()).toMatchObject({ converged: false });
    const conflicts = await db
      .collection('calendar_pilot_audit_events')
      .where('action', '==', 'calendar_reconciliation_conflict')
      .get();
    expect(conflicts.size).toBeGreaterThan(0);
  });

  it('rejects a checkpoint changed after its lease-protected read', async () => {
    dispatch.mockImplementation(async () => {
      await configuration().update({
        'reconciliationScan.state': { changed: true }
      });
      return Response.json({ items: [] });
    });
    const runtime = new CalendarPilotRuntime(
      db,
      {
        ...environment,
        CALENDAR_PILOT_WORKER_SERVICE_ACCOUNT_EMAIL: 'worker@synthetic.invalid'
      },
      now,
      syntheticOpenMaintenanceControl()
    );
    await expect(runtime.runReconciliationRound()).rejects.toThrow();
    expect(
      (await configuration().get()).data()?.['reconciliationScan']
    ).toMatchObject({ state: { changed: true } });
  });

  it('does not reclaim an expired owner without proof it stopped', async () => {
    await configuration().update({
      workerLeaseOwner: 'previous-worker',
      workerLeaseExpiresAt: '2026-08-31T23:59:59.000Z'
    });

    await expect(run()).resolves.toMatchObject({ acquired: false });
    expect(dispatch).not.toHaveBeenCalled();
    expect((await configuration().get()).data()).toMatchObject({
      workerLeaseOwner: 'previous-worker'
    });
    expect(await state('job_a')).toMatchObject({ status: 'pending' });
  });

  it('keeps the owner after an unknown transport outcome and denies takeover', async () => {
    dispatch.mockRejectedValue(new Error('synthetic transport failure'));

    await expect(run()).rejects.toThrow(/lease/iu);
    const quarantined = (await configuration().get()).data();
    expect(quarantined?.['workerLeaseOwner']).toEqual(expect.any(String));
    expect(await state('job_a')).toMatchObject({
      status: 'failed',
      lastErrorCode: 'needs_reconcile'
    });
    expect(dispatch).toHaveBeenCalledTimes(1);

    clock = '2026-09-01T00:05:00.000Z';
    const successor = new CalendarPilotRuntime(
      db,
      environment,
      now,
      syntheticOpenMaintenanceControl()
    );
    await expect(successor.run(clock)).resolves.toMatchObject({
      acquired: false
    });
    expect((await configuration().get()).data()).toMatchObject({
      workerLeaseOwner: quarantined?.['workerLeaseOwner']
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not start cleanup after an uncertain preflight write', async () => {
    await db.collection(OUTBOX).doc('job_b').delete();
    await seedJob('job_a', 'calendar_source_preflight');
    dispatch
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockRejectedValueOnce(new Error('synthetic transport failure'));

    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(dispatch.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(await state('job_a')).toMatchObject({
      status: 'failed',
      lastErrorCode: 'needs_reconcile'
    });
    expect((await configuration().get()).data()?.['workerLeaseOwner']).toEqual(
      expect.any(String)
    );
  });

  it('denies a second transport while the first is in flight', async () => {
    await configuration().update({
      workerLeaseOwner: 'worker_a',
      workerLeaseExpiresAt: DEADLINE
    });
    let release = () => {};
    let started = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      started = resolve;
    });
    dispatch.mockImplementationOnce(async () => {
      started();
      await barrier;
      const eventId = `calpilot${createHash('sha256')
        .update('job_a')
        .digest('hex')
        .slice(0, 40)}`;
      return Response.json({
        id: eventId,
        etag: SYNTHETIC_ETAG,
        status: 'confirmed',
        summary: 'Synthetic event',
        start: { dateTime: '2026-09-01T04:00:00.000Z' },
        end: { dateTime: '2026-09-01T04:30:00.000Z' },
        extendedProperties: { private: { beauessenceLinkId: 'job_a' } }
      });
    });
    const runtime = new CalendarPilotRuntime(
      db,
      environment,
      now,
      syntheticOpenMaintenanceControl()
    );
    const guarded = runtime['guardedFetch']({
      owner: 'worker_a',
      generation: 1,
      now,
      dispatch: { pending: 0 },
      timing: { wall: Date.parse(now()), monotonic: performance.now() }
    });
    const url =
      'https://www.googleapis.com/calendar/v3/calendars/synthetic-calendar-id/events';
    const first = guarded(url);
    try {
      await Promise.race([
        reached,
        first.then(() => {
          throw new Error('The first transport did not reach the barrier.');
        })
      ]);
      await expect(guarded(url)).rejects.toThrow(/lease/iu);
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
    await expect(first).resolves.toMatchObject({ status: 200 });
    await expect(guarded(url)).resolves.toMatchObject({ status: 200 });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent complete runs behind the global lease', async () => {
    let releaseToken = () => {};
    let signalToken = () => {};
    const tokenReached = new Promise<void>((resolve) => {
      signalToken = resolve;
    });
    const tokenBarrier = new Promise<void>((resolve) => {
      releaseToken = resolve;
    });
    let tokenProviderCalls = 0;
    providers.beforeToken = () => {
      tokenProviderCalls += 1;
      if (tokenProviderCalls === 1) {
        signalToken();
        return tokenBarrier;
      }
    };

    const ownerRun = run();
    let competingRun: ReturnType<typeof run> | undefined;
    try {
      await Promise.race([
        tokenReached,
        ownerRun.then(() => {
          throw new Error(
            'The owner run completed before reaching the token barrier.'
          );
        })
      ]);
      const configurationBefore = (await configuration().get()).data();
      const jobABefore = await state('job_a');
      const jobBBefore = await state('job_b');
      const owner = configurationBefore?.['workerLeaseOwner'];
      expect(owner).toEqual(expect.any(String));
      expect(jobABefore).toMatchObject({
        status: 'processing',
        leaseOwner: owner
      });
      expect(jobBBefore).toMatchObject({
        status: 'processing',
        leaseOwner: owner
      });

      competingRun = run();
      await expect(competingRun).resolves.toMatchObject({
        acquired: false,
        processedJobs: 0,
        failedJobs: 0
      });
      expect(tokenProviderCalls).toBe(1);
      expect(dispatch).not.toHaveBeenCalled();
      expect(engineCallCount()).toBe(0);
      expect((await configuration().get()).data()).toEqual(configurationBefore);
      expect(await state('job_a')).toEqual(jobABefore);
      expect(await state('job_b')).toEqual(jobBBefore);

      releaseToken();
      await expect(ownerRun).resolves.toMatchObject({
        acquired: true,
        processedJobs: 2,
        failedJobs: 0
      });
      expect(dispatch).toHaveBeenCalledTimes(4);
      expect(engineCallCount()).toBe(1);
      expect(await state('job_a')).toMatchObject({
        status: 'completed',
        leaseOwner: null
      });
      expect(await state('job_b')).toMatchObject({
        status: 'completed',
        leaseOwner: null
      });
    } finally {
      releaseToken();
      await Promise.allSettled([ownerRun, competingRun]);
    }
  });

  it.each([
    { kind: 'unknown' },
    { generation: 1.5 },
    { attemptCount: -1 },
    { schemaVersion: 2 }
  ])(
    'rejects unreadable outbox data before claiming or dispatching',
    async (invalid: Record<string, unknown>) => {
      await db.collection(OUTBOX).doc('job_a').update(invalid);
      await expect(run()).rejects.toThrow('Unreadable CAL-PILOT record.');
      expect(dispatch).not.toHaveBeenCalled();
      expect(engineCallCount()).toBe(0);
      expect((await state('job_a'))?.['status']).toBe('pending');
      expect((await state('job_b'))?.['status']).toBe('pending');
      expect(
        (await configuration().get()).data()?.['workerLeaseOwner']
      ).toBeNull();
    }
  );

  it('disables a malformed configuration clock before acquiring a lease', async () => {
    await configuration().update({ expiresAt: 'Sep 2 2026 Z' });
    await expect(run()).resolves.toMatchObject({ acquired: false });
    expect(dispatch).not.toHaveBeenCalled();
    expect((await state('job_a'))?.['status']).toBe('pending');
    expect((await configuration().get()).data()).toMatchObject({
      inboundEnabled: false,
      outboundEnabled: false,
      health: 'expired'
    });
  });

  it('preserves valid generation zero rather than imposing a new positive-only policy', async () => {
    await configuration().update({ version: 0 });
    for (const id of ['job_a', 'job_b'])
      await db.collection(OUTBOX).doc(id).update({ generation: 0 });
    await expect(run()).resolves.toMatchObject({
      acquired: true,
      processedJobs: 2,
      failedJobs: 0
    });
    expect(dispatch).toHaveBeenCalledTimes(4);
  });

  it.each([
    { name: '412 precondition failure', status: 412, leaseRetained: false },
    { name: '503 retryable response', status: 503, leaseRetained: true },
    { name: 'unknown transport outcome', unknown: true, leaseRetained: true }
  ])(
    'quarantines a conditional DELETE on $name without retrying other jobs',
    async ({
      status,
      unknown,
      leaseRetained
    }: {
      status?: number;
      unknown?: boolean;
      leaseRetained: boolean;
    }) => {
      mutationFailure = {
        method: 'DELETE',
        ...(status === undefined ? {} : { status }),
        ...(unknown === true ? { unknown: true } : {})
      };
      await expect(run()).rejects.toThrow(/lease/iu);
      expect(await state('job_a')).toMatchObject({
        status: 'failed',
        lastErrorCode: 'needs_reconcile',
        attemptCount: 0,
        leaseOwner: null
      });
      expect((await state('job_b'))?.['status']).toBe('processing');
      const owner = (await configuration().get()).data()?.['workerLeaseOwner'];
      if (leaseRetained) expect(owner).toEqual(expect.any(String));
      else expect(owner).toBeNull();
      const eventId = `calpilot${createHash('sha256').update('job_a').digest('hex').slice(0, 40)}`;
      const requests = requestsForEvent(eventId);
      expect(requests.map(([, init]) => init?.method)).toEqual([
        'GET',
        'DELETE'
      ]);
      expect(new Headers(requests[1]?.[1]?.headers).get('If-Match')).toBe(
        SYNTHETIC_ETAG
      );
      expect(dispatch).toHaveBeenCalledTimes(2);
      if (leaseRetained) {
        await expect(reconcile()).resolves.toMatchObject({
          acquired: false,
          blocked: 'owner_present',
          converged: false
        });
        expect(dispatch).toHaveBeenCalledTimes(2);
      } else {
        expect(await completeReconciliation()).toMatchObject({
          converged: false
        });
        const conflicts = await db
          .collection('calendar_pilot_audit_events')
          .where('action', '==', 'calendar_reconciliation_conflict')
          .get();
        expect(conflicts.size).toBeGreaterThan(0);
      }
    }
  );

  it('does not retry a provider error even after earlier attempts', async () => {
    await db.collection(OUTBOX).doc('job_a').update({ attemptCount: 4 });
    mutationFailure = { method: 'DELETE', status: 503 };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(await state('job_a')).toMatchObject({
      status: 'failed',
      leaseOwner: null,
      lastErrorCode: 'needs_reconcile',
      attemptCount: 4
    });
    expect(await state('job_a')).not.toHaveProperty('nextAttemptAt');
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('recovers expired jobs only after simulated stub isolation', async () => {
    afterDispatch = () => {
      clock = DEADLINE;
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    const oldOwner = (await state('job_a'))?.['leaseOwner'];
    afterDispatch = () => {};
    const successor = new CalendarPilotRuntime(
      db,
      environment,
      now,
      syntheticOpenMaintenanceControl()
    );
    await expect(successor.run(clock)).resolves.toMatchObject({
      acquired: false
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    // Test-only: the awaited stub has settled; this is not a real recovery path.
    await configuration().update({
      workerLeaseOwner: null,
      workerLeaseExpiresAt: null
    });
    await expect(successor.run(clock)).resolves.toMatchObject({
      processedJobs: 2,
      failedJobs: 0
    });
    expect(oldOwner).toEqual(expect.any(String));
    expect(await state('job_a')).toMatchObject({
      status: 'completed',
      leaseOwner: null
    });
    expect(await state('job_b')).toMatchObject({
      status: 'completed',
      leaseOwner: null
    });
  });

  it('passes the live lease context into the actual inbound engine repository', async () => {
    await db.collection(OUTBOX).doc('job_a').delete();
    await db.collection(OUTBOX).doc('job_b').delete();
    restoreEngine();
    vi.spyOn(
      GoogleCalendarEventReader.prototype,
      'listEvents'
    ).mockImplementation(() => {
      clock = DEADLINE;
      return Promise.resolve({ events: [], nextSyncToken: 'test' });
    });
    await expect(run()).rejects.toThrow(/lease/iu);
    expect((await configuration().get()).data()).not.toHaveProperty(
      'lastSuccessfulSyncAt'
    );
    expect((await configuration().get()).data()?.['health']).toBe('syncing');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('completes two jobs while configuration and both leases remain valid', async () => {
    await expect(run()).resolves.toMatchObject({
      acquired: true,
      processedJobs: 2,
      failedJobs: 0
    });
    expect(dispatch).toHaveBeenCalledTimes(4);
    expect(await state('job_a')).toMatchObject({
      status: 'completed',
      completedAt: NOW,
      leaseOwner: null
    });
    expect(await state('job_b')).toMatchObject({
      status: 'completed',
      leaseExpiresAt: null
    });
    expect(
      (await configuration().get()).data()?.['workerLeaseOwner']
    ).toBeNull();
  });

  it('stops exactly at the four-minute deadline after a delayed provider response', async () => {
    afterDispatch = () => {
      clock = DEADLINE;
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(await state('job_a')).toMatchObject({
      status: 'processing',
      leaseExpiresAt: DEADLINE
    });
    expect(await state('job_b')).toMatchObject({ status: 'processing' });
    expect(engineCallCount()).toBe(0);
  });

  it('does not dispatch after a slow token acquisition outlives the lease', async () => {
    providers.beforeToken = () => {
      clock = DEADLINE;
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).not.toHaveBeenCalled();
    expect((await state('job_a'))?.['status']).toBe('processing');
  });

  it('checks the clock again when a lease transaction reply arrives after the deadline', async () => {
    let delayNextReply = false;
    const transaction = db.runTransaction.bind(db);
    vi.spyOn(db, 'runTransaction').mockImplementation(
      async (update, options) => {
        const result = await transaction(update, options);
        if (delayNextReply) {
          delayNextReply = false;
          clock = DEADLINE;
        }
        return result;
      }
    );
    providers.beforeToken = () => {
      delayNextReply = true;
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).not.toHaveBeenCalled();
    expect((await state('job_a'))?.['status']).toBe('processing');
  });

  it.each([
    { name: 'owner', change: { workerLeaseOwner: 'successor' } },
    { name: 'generation', change: { version: 2 } }
  ])(
    'documents the non-atomic snapshot-to-dispatch window: $name',
    async ({ change }) => {
      let changeAfterNextReply = false;
      const transaction = db.runTransaction.bind(db);
      vi.spyOn(db, 'runTransaction').mockImplementation(
        async (update, options) => {
          const result = await transaction(update, options);
          if (changeAfterNextReply) {
            changeAfterNextReply = false;
            await configuration().update(change);
          }
          return result;
        }
      );
      let tokenCalls = 0;
      providers.beforeToken = () => {
        tokenCalls += 1;
        if (tokenCalls === 2) changeAfterNextReply = true;
      };
      await expect(run()).rejects.toThrow(/lease/iu);
      // The closure rechecks the clock, not the database snapshot. One request
      // can cross this window; the post-response check prevents later work.
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[1]?.[1]?.method).toBe('DELETE');
      expect((await state('job_a'))?.['status']).toBe('processing');
      expect((await state('job_b'))?.['status']).toBe('processing');
      expect((await configuration().get()).data()).toMatchObject(change);
      expect(engineCallCount()).toBe(0);
    }
  );

  it('cannot complete or dispatch a later job after configuration expiry', async () => {
    await configuration().update({ expiresAt: '2026-09-01T00:00:10.000Z' });
    afterDispatch = () => {
      clock = '2026-09-01T00:00:10.000Z';
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect((await state('job_a'))?.['status']).toBe('processing');
    expect((await configuration().get()).data()?.['expiresAt']).toBe(
      '2026-09-01T00:00:10.000Z'
    );
  });

  it('does not overwrite a successor global owner even when the job owner still matches', async () => {
    afterDispatch = async () => {
      await configuration().update({
        workerLeaseOwner: 'successor',
        workerLeaseExpiresAt: '2026-09-01T00:05:00.000Z'
      });
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect((await state('job_a'))?.['status']).toBe('processing');
    expect((await configuration().get()).data()?.['workerLeaseOwner']).toBe(
      'successor'
    );
    await expect(reconcile()).resolves.toMatchObject({
      acquired: false,
      blocked: 'owner_present',
      converged: false
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('cannot complete or keep dispatching after the current job is taken over', async () => {
    afterDispatch = async () => {
      await db
        .collection(OUTBOX)
        .doc('job_a')
        .update({ leaseOwner: 'successor' });
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(await state('job_a')).toMatchObject({
      status: 'processing',
      leaseOwner: 'successor'
    });
  });

  it.each([
    { inboundEnabled: false },
    { outboundEnabled: false },
    { version: 2 }
  ])(
    'stops without terminal writes after admission or source generation changes: %j',
    async (change) => {
      afterDispatch = async () => {
        await configuration().update(change);
      };
      await expect(run()).rejects.toThrow(/lease/iu);
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect((await state('job_a'))?.['status']).toBe('processing');
      expect(engineCallCount()).toBe(0);
    }
  );

  it('does not requeue an expired worker after a retryable provider failure', async () => {
    mutationFailure = { method: 'DELETE', status: 503 };
    afterDispatch = () => {
      clock = DEADLINE;
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(await state('job_a')).toMatchObject({
      status: 'processing',
      attemptCount: 0
    });
    expect(await state('job_a')).not.toHaveProperty('nextAttemptAt');
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each([NOW, 'not-a-timestamp'])(
    'never acquires expired or unreadable configuration: %s',
    async (expiresAt) => {
      await configuration().update({ expiresAt });
      await expect(run()).resolves.toMatchObject({
        acquired: false,
        processedJobs: 0
      });
      expect(dispatch).not.toHaveBeenCalled();
      expect((await state('job_a'))?.['status']).toBe('pending');
    }
  );

  it('does not persist a passed preflight after a delayed cleanup crosses the deadline', async () => {
    await db.collection(OUTBOX).doc('job_b').delete();
    await seedJob('job_a', 'calendar_source_preflight');
    afterDispatch = () => {
      if (dispatch.mock.calls.length === 4) clock = DEADLINE;
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(4);
    expect(
      (await db.collection('calendar_pilot_preflights').doc('job_a').get())
        .exists
    ).toBe(false);
    expect((await state('job_a'))?.['status']).toBe('processing');
  });
});

describe('inbound persistence is fenced in the configuration-reading transaction', () => {
  const worker = { owner: 'worker', generation: 1, now };
  async function ownConfiguration() {
    await configuration().update({
      workerLeaseOwner: worker.owner,
      workerLeaseExpiresAt: DEADLINE
    });
    return new FirestoreCalendarSyncRepository(db, 'p'.repeat(32), worker);
  }
  const commit = {
    sourceId: SOURCE,
    expectedSourceVersion: 1,
    mutations: [],
    completedAt: NOW,
    fullSync: true
  };

  it('allows a current worker commit', async () => {
    const repository = await ownConfiguration();
    await expect(repository.commitSync(commit)).resolves.toBeUndefined();
    expect((await configuration().get()).data()?.['health']).toBe('healthy');
  });

  it.each(['owner', 'deadline', 'configuration', 'disabled'])(
    'rejects a stale inbound commit: %s',
    async (reason) => {
      const repository = await ownConfiguration();
      if (reason === 'owner')
        await configuration().update({ workerLeaseOwner: 'successor' });
      if (reason === 'deadline') clock = DEADLINE;
      if (reason === 'configuration')
        await configuration().update({ expiresAt: NOW });
      if (reason === 'disabled')
        await configuration().update({ inboundEnabled: false });
      await expect(repository.commitSync(commit)).rejects.toThrow(/lease/iu);
      expect((await configuration().get()).data()).not.toHaveProperty(
        'lastSuccessfulSyncAt'
      );
    }
  );

  it('cannot clear a token or write an audit after ownership changes', async () => {
    const repository = await ownConfiguration();
    await configuration().update({ workerLeaseOwner: 'successor' });
    await expect(repository.clearSyncToken(SOURCE, 1, NOW)).rejects.toThrow(
      /lease/iu
    );
    expect(
      (
        await db.collection('calendar_pilot_sources').doc(SOURCE).get()
      ).data()?.['syncToken']
    ).toBe('test');
    expect(
      (await db.collection('calendar_pilot_audit_events').get()).empty
    ).toBe(true);
  });
});
