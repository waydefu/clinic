import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
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
  return new CalendarPilotRuntime(db, environment, now).run(NOW);
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
  dispatch.mockReset();
  dispatch.mockImplementation(async (url) => {
    // Unexpected provider destinations are test failures, not a network fallback.
    const target =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    expect(target.startsWith('https://www.googleapis.com/calendar/v3/')).toBe(
      true
    );
    await afterDispatch();
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
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('retains retry backoff and does not count a requeued job as a terminal failure', async () => {
    dispatch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(run()).resolves.toMatchObject({
      processedJobs: 1,
      failedJobs: 0
    });
    expect(await state('job_a')).toMatchObject({
      status: 'pending',
      attemptCount: 1,
      nextAttemptAt: '2026-09-01T00:00:20.000Z',
      leaseOwner: null
    });
    expect((await state('job_b'))?.['status']).toBe('completed');
  });

  it('retains the fifth-attempt terminal failure limit', async () => {
    await db.collection(OUTBOX).doc('job_a').update({ attemptCount: 4 });
    dispatch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(run()).resolves.toMatchObject({
      processedJobs: 1,
      failedJobs: 1
    });
    expect(await state('job_a')).toMatchObject({
      status: 'failed',
      leaseOwner: null,
      lastErrorCode: 'calendar_api_error'
    });
    expect(await state('job_a')).not.toHaveProperty('nextAttemptAt');
  });

  it('lets a later owner recover both still-processing expired jobs', async () => {
    afterDispatch = () => {
      clock = DEADLINE;
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    const oldOwner = (await state('job_a'))?.['leaseOwner'];
    afterDispatch = () => {};
    await expect(
      new CalendarPilotRuntime(db, environment, now).run(clock)
    ).resolves.toMatchObject({ processedJobs: 2, failedJobs: 0 });
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
    expect(dispatch).toHaveBeenCalledTimes(2);
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
    expect(dispatch).toHaveBeenCalledTimes(1);
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
      providers.beforeToken = () => {
        changeAfterNextReply = true;
      };
      await expect(run()).rejects.toThrow(/lease/iu);
      // The closure rechecks the clock, not the database snapshot. One request
      // can cross this window; the post-response check prevents later work.
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect((await state('job_a'))?.['status']).toBe('processing');
      expect((await state('job_b'))?.['status']).toBe('processing');
      expect((await configuration().get()).data()).toMatchObject(change);
      expect(engineCallCount()).toBe(0);
    }
  );

  it('cannot complete or dispatch a later job after configuration expiry', async () => {
    await configuration().update({ expiresAt: '2026-09-01T00:00:01.000Z' });
    afterDispatch = () => {
      clock = '2026-09-01T00:00:01.000Z';
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((await state('job_a'))?.['status']).toBe('processing');
    expect((await configuration().get()).data()?.['expiresAt']).toBe(
      '2026-09-01T00:00:01.000Z'
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
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((await state('job_a'))?.['status']).toBe('processing');
    expect((await configuration().get()).data()?.['workerLeaseOwner']).toBe(
      'successor'
    );
  });

  it('cannot complete or keep dispatching after the current job is taken over', async () => {
    afterDispatch = async () => {
      await db
        .collection(OUTBOX)
        .doc('job_a')
        .update({ leaseOwner: 'successor' });
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(1);
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
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect((await state('job_a'))?.['status']).toBe('processing');
      expect(engineCallCount()).toBe(0);
    }
  );

  it('does not requeue an expired worker after a retryable provider failure', async () => {
    dispatch.mockImplementation(() => {
      clock = DEADLINE;
      return Promise.resolve(new Response(null, { status: 503 }));
    });
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(await state('job_a')).toMatchObject({
      status: 'processing',
      attemptCount: 0
    });
    expect(await state('job_a')).not.toHaveProperty('nextAttemptAt');
    expect(dispatch).toHaveBeenCalledTimes(1);
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
      if (dispatch.mock.calls.length === 3) clock = DEADLINE;
    };
    await expect(run()).rejects.toThrow(/lease/iu);
    expect(dispatch).toHaveBeenCalledTimes(3);
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
