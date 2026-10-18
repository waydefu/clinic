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

import { CalendarPilotRuntime } from '../../apps/worker/src/calendar-sync/calendar-pilot-runtime.js';
import { CalendarSyncEngine } from '../../apps/worker/src/calendar-sync/sync-engine.js';
import { GoogleCalendarEventReader } from '../../apps/worker/src/calendar-sync/google-sync-client.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

vi.mock('../../apps/worker/src/google-calendar.js', () => ({
  createCloudAdcTokenProvider: () => () => Promise.resolve('test'),
  createServiceAccountTokenProvider: () => () => Promise.resolve('test')
}));
requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const NOW = '2026-09-01T00:00:00.000Z';
const DEADLINE = '2026-09-01T00:04:00.000Z';
const PAGE_SIZE = 20; // Independent acceptance bound, not imported from the SUT.
const DATASET_SIZE = 45;
const JOB = 'activation_job';
const OUTBOX = 'calendar_pilot_outbox';
const CONFIG = 'calendar_pilot_configuration';
const APPOINTMENTS = 'calendar_pilot_appointments';
const RECEIPTS = 'activation_copy_pages';
const environment = {
  CALENDAR_PILOT_PSEUDONYM_KEY: 'p'.repeat(32),
  // Token factories above are test stubs: these are not credential material.
  CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON: '{}',
  CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON: '{}',
  CALENDAR_PILOT_SOURCE_MAP_JSON: JSON.stringify({
    active: { calendarId: 'active' },
    old: { calendarId: 'old' }
  })
};
interface Effect {
  readonly method: string;
  readonly calendar: string;
  readonly eventId: string;
}
let app: App;
let db: Firestore;
let clock: string;
let effects: Effect[];
let conflictOnInsert = false;
let afterEffect: (effect: Effect) => void | Promise<void>;
let engineCallCount = () => 0;
let restoreEngine = () => {};
const dispatch = vi.fn<typeof fetch>();
const now = () => clock;
const jobRef = () => db.collection(OUTBOX).doc(JOB);
const configuration = () => db.collection(CONFIG).doc('active');
const state = async () => (await jobRef().get()).data();
const tick = () => new CalendarPilotRuntime(db, environment, now).run(clock);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected a test record.');
  return value as Record<string, unknown>;
}
async function progress() {
  const value = (await state())?.['activationProgress'];
  return value === undefined ? undefined : record(value);
}
async function wipe() {
  for (const row of await jobRef().collection(RECEIPTS).listDocuments())
    await row.delete();
  for (const name of [
    OUTBOX,
    CONFIG,
    APPOINTMENTS,
    'calendar_pilot_patients',
    'calendar_pilot_sources'
  ]) {
    for (const row of await db.collection(name).listDocuments())
      await row.delete();
  }
}
async function runToPhase(phase: string) {
  for (let attempts = 0; attempts < 30; attempts += 1) {
    if ((await progress())?.['phase'] === phase) return;
    await tick();
    expect((await state())?.['status']).not.toBe('failed');
  }
  throw new Error(
    'Synthetic activation did not reach the requested phase within the bounded test.'
  );
}
async function finish() {
  for (let attempts = 0; attempts < 30; attempts += 1) {
    const before = effects.length;
    const summary = await tick();
    expect(effects.length - before).toBeLessThanOrEqual(PAGE_SIZE);
    if ((await state())?.['status'] === 'completed') return summary;
    expect((await state())?.['status']).not.toBe('failed');
    expect(summary.processedJobs).toBe(0);
    expect(await state()).not.toHaveProperty('completedAt');
  }
  throw new Error(
    'Synthetic activation did not finish within the bounded test.'
  );
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    'activation-progress'
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await wipe();
  clock = NOW;
  effects = [];
  conflictOnInsert = false;
  afterEffect = () => {};
  dispatch.mockReset();
  dispatch.mockImplementation(async (url, init) => {
    const target =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const parsed = new URL(target);
    expect(parsed.origin).toBe('https://www.googleapis.com');
    const path =
      /^\/calendar\/v3\/calendars\/(active|old)\/events(?:\/([^/]+))?$/.exec(
        parsed.pathname
      );
    if (path === null)
      throw new Error(
        'Unexpected Calendar test destination, no network fallback.'
      );
    const method = init?.method ?? 'GET';
    if (method !== 'POST' && method !== 'DELETE' && method !== 'PATCH')
      throw new Error('Unexpected Calendar test method.');
    const body =
      method === 'POST' && typeof init?.body === 'string'
        ? record(JSON.parse(init.body))
        : undefined;
    const eventId = method === 'POST' ? body?.['id'] : path[2];
    if (typeof eventId !== 'string')
      throw new Error('Missing synthetic projection identity.');
    const effect = { method, calendar: path[1]!, eventId };
    effects.push(effect);
    await afterEffect(effect);
    if (method === 'POST' && conflictOnInsert)
      return new Response(null, { status: 409 });
    return method === 'DELETE'
      ? new Response(null, { status: 204 })
      : Response.json({});
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
  engineCallCount = () => engine.mock.calls.length;
  restoreEngine = () => engine.mockRestore();
  await configuration().set({
    activeSourceId: 'active',
    previousSourceId: 'old',
    version: 1,
    expiresAt: '2026-09-02T00:00:00.000Z',
    inboundEnabled: true,
    outboundEnabled: true,
    health: 'healthy'
  });
  await jobRef().set({
    kind: 'calendar_source_activated',
    sourceId: 'active',
    previousSourceId: 'old',
    generation: 1,
    status: 'pending',
    createdAt: NOW,
    attemptCount: 0
  });
  await Promise.all(
    Array.from({ length: DATASET_SIZE }, (_, index) =>
      db
        .collection(APPOINTMENTS)
        .doc(`record_${String(index).padStart(3, '0')}`)
        .set({
          patientCode: 'A17',
          bookingKind: 'initial',
          serviceId: 'service_snoring',
          status: 'confirmed',
          startsAt: '2026-09-01T04:00:00.000Z',
          endsAt: '2026-09-01T04:30:00.000Z'
        })
    )
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

describe('bounded CAL-PILOT source activation', () => {
  it('reads source metadata without loading the entire patient-code collection for a partial activation', async () => {
    const collection = db.collection.bind(db);
    vi.spyOn(db, 'collection').mockImplementation((name) => {
      if (name === 'calendar_pilot_patients')
        throw new Error('Activation must not fan out into patient codes.');
      return collection(name);
    });
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 0,
      failedJobs: 0
    });
    expect((await state())?.['status']).toBe('pending');
    expect(effects).toHaveLength(0);
  });

  it('does not scan and dispatch the entire activation or complete it in one invocation', async () => {
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 0,
      failedJobs: 0
    });
    expect(engineCallCount()).toBe(0);
    expect(effects.length).toBeLessThanOrEqual(PAGE_SIZE);
    expect(effects.filter((effect) => effect.method === 'DELETE')).toHaveLength(
      0
    );
    expect((await state())?.['status']).toBe('pending');
    expect((await state())?.['attemptCount']).toBe(0);
    expect(await state()).not.toHaveProperty('completedAt');
  });

  it('bounds a page of upserts even when every insert needs the existing 409 PATCH fallback', async () => {
    await tick();
    conflictOnInsert = true;
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 0,
      failedJobs: 0
    });
    expect(effects.filter((effect) => effect.method === 'POST')).toHaveLength(
      PAGE_SIZE
    );
    expect(effects.filter((effect) => effect.method === 'PATCH')).toHaveLength(
      PAGE_SIZE
    );
    expect(effects).toHaveLength(2 * PAGE_SIZE);
    expect(effects.filter((effect) => effect.method === 'DELETE')).toHaveLength(
      0
    );
    expect((await state())?.['status']).toBe('pending');
    expect(engineCallCount()).toBe(0);
  });

  it.each(['copy target', 'cleanup source'])(
    'refuses to resume when a physical source mapping changes: %s',
    async (changed) => {
      if (changed === 'cleanup source') await runToPhase('cleanup');
      else await tick();
      effects = [];
      dispatch.mockClear();
      const input = {
        ...environment,
        CALENDAR_PILOT_SOURCE_MAP_JSON: JSON.stringify({
          active: {
            calendarId: changed === 'copy target' ? 'different' : 'active'
          },
          old: {
            calendarId: changed === 'cleanup source' ? 'different' : 'old'
          }
        })
      };
      await expect(
        new CalendarPilotRuntime(db, input, now).run(clock)
      ).resolves.toMatchObject({ processedJobs: 0, failedJobs: 1 });
      expect(dispatch).not.toHaveBeenCalled();
      expect(effects).toHaveLength(0);
    }
  );

  it('copies all tied-timestamp records before the first old-source removal, then completes the whole job', async () => {
    const summary = await finish();
    const copied = effects.filter((effect) => effect.method === 'POST');
    const removed = effects.filter((effect) => effect.method === 'DELETE');
    expect(copied).toHaveLength(DATASET_SIZE);
    expect(new Set(copied.map((effect) => effect.eventId)).size).toBe(
      DATASET_SIZE
    );
    expect(removed).toHaveLength(DATASET_SIZE);
    expect(effects.findIndex((effect) => effect.method === 'DELETE')).toBe(
      DATASET_SIZE
    );
    expect(copied.every((effect) => effect.calendar === 'active')).toBe(true);
    expect(removed.every((effect) => effect.calendar === 'old')).toBe(true);
    expect(new Set(removed.map((effect) => effect.eventId))).toEqual(
      new Set(copied.map((effect) => effect.eventId))
    );
    expect(summary).toMatchObject({ processedJobs: 1, failedJobs: 0 });
    expect(engineCallCount()).toBe(1);
    expect((await jobRef().collection(RECEIPTS).get()).empty).toBe(true);
    expect((await state())?.['attemptCount']).toBe(0);
  });

  it('retains copy ACKs and retry backoff without publishing inbound health before the activation finishes', async () => {
    await tick();
    const transport = dispatch.getMockImplementation();
    if (transport === undefined)
      throw new Error('Explicit Calendar test transport missing.');
    let inserts = 0;
    dispatch.mockImplementation((url, init) => {
      if (init?.method === 'POST' && ++inserts === 3)
        return Promise.resolve(new Response(null, { status: 503 }));
      return transport(url, init);
    });
    await db
      .collection('calendar_pilot_sources')
      .doc('active')
      .set({ syncToken: 'test' });
    restoreEngine();
    vi.spyOn(
      GoogleCalendarEventReader.prototype,
      'listEvents'
    ).mockResolvedValue({ events: [], nextSyncToken: 'test-next' });
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 0,
      failedJobs: 0
    });
    const retained = await progress();
    const acknowledged = effects
      .filter((effect) => effect.method === 'POST')
      .map((effect) => effect.eventId);
    expect(acknowledged).toHaveLength(2);
    expect(retained?.['pendingCopyIds']).toHaveLength(2);
    expect(await state()).toMatchObject({
      status: 'pending',
      attemptCount: 1,
      nextAttemptAt: '2026-09-01T00:00:20.000Z',
      leaseOwner: null,
      leaseExpiresAt: null
    });
    expect(await state()).not.toHaveProperty('completedAt');
    expect((await configuration().get()).data()).not.toHaveProperty(
      'lastSuccessfulSyncAt'
    );
    const before = dispatch.mock.calls.length;
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 0,
      failedJobs: 0
    });
    expect(dispatch).toHaveBeenCalledTimes(before);
    expect(await progress()).toEqual(retained);
    expect((await configuration().get()).data()).not.toHaveProperty(
      'lastSuccessfulSyncAt'
    );
    clock = '2026-09-01T00:00:20.000Z';
    await finish();
    expect((await state())?.['attemptCount']).toBe(1);
    for (const id of acknowledged)
      expect(
        effects.filter(
          (effect) => effect.method === 'POST' && effect.eventId === id
        )
      ).toHaveLength(1);
    expect((await configuration().get()).data()?.['lastSuccessfulSyncAt']).toBe(
      clock
    );
  });

  it('allows inbound with no activation records at generation zero', async () => {
    await jobRef().delete();
    await configuration().update({ version: 0 });
    const summary = await tick();
    expect(summary).toHaveProperty('sync');
    expect(engineCallCount()).toBe(1);
    expect(effects).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
    expect(await state()).toBeUndefined();
    expect((await configuration().get()).data()?.['version']).toBe(0);
  });

  it('does not poll inbound on a later invocation while the current activation is in backoff', async () => {
    await tick();
    await jobRef().update({
      attemptCount: 1,
      nextAttemptAt: '2026-09-01T00:00:20.000Z'
    });
    const summary = await tick();
    expect(summary).not.toHaveProperty('sync');
    expect(engineCallCount()).toBe(0);
    expect((await state())?.['status']).toBe('pending');
    expect(effects).toHaveLength(0);
  });

  it.each(['processing', 'failed'])(
    'does not poll inbound merely because an unfinished current activation is not claimable: %s',
    async (status) => {
      await tick();
      await jobRef().update({
        status,
        leaseOwner: status === 'processing' ? 'prior_worker' : null,
        leaseExpiresAt: status === 'processing' ? DEADLINE : null
      });
      const summary = await tick();
      expect(summary).not.toHaveProperty('sync');
      expect(engineCallCount()).toBe(0);
      expect((await state())?.['status']).toBe(status);
      expect(effects).toHaveLength(0);
    }
  );

  it.each(['completed', 'superseded'])(
    'does not block normal inbound for a terminal legacy activation: %s',
    async (status) => {
      await jobRef().update({ status });
      const summary = await tick();
      expect(summary).toHaveProperty('sync');
      expect(engineCallCount()).toBe(1);
      expect(effects).toHaveLength(0);
    }
  );

  it.each(['calendar_projection_delete', 'calendar_source_preflight'])(
    'does not treat a failed unrelated job as an unfinished activation: %s',
    async (kind) => {
      await jobRef().update({ kind, status: 'failed' });
      const summary = await tick();
      expect(summary).toHaveProperty('sync');
      expect(engineCallCount()).toBe(1);
      expect(effects).toHaveLength(0);
    }
  );

  it('does not block the current generation for a failed prior-generation activation', async () => {
    await jobRef().update({ generation: 0, status: 'failed' });
    const summary = await tick();
    expect(summary).toHaveProperty('sync');
    expect(engineCallCount()).toBe(1);
    expect(effects).toHaveLength(0);
  });

  it('fails closed on an unknown current activation status', async () => {
    await jobRef().update({ status: 'unknown' });
    const summary = await tick();
    expect(summary).not.toHaveProperty('sync');
    expect(engineCallCount()).toBe(0);
    expect(effects).toHaveLength(0);
  });

  it('fails closed on duplicate current-generation activations instead of trusting one limited result', async () => {
    await jobRef().update({ status: 'completed' });
    await db.collection(OUTBOX).doc('duplicate_activation').set({
      kind: 'calendar_source_activated',
      sourceId: 'active',
      previousSourceId: 'old',
      generation: 1,
      status: 'completed',
      createdAt: NOW,
      attemptCount: 0
    });
    const summary = await tick();
    expect(summary).not.toHaveProperty('sync');
    expect(engineCallCount()).toBe(0);
    expect(effects).toHaveLength(0);
  });

  it('resumes after copy interruption without replaying the checkpointed prefix', async () => {
    await tick(); // Persist the cutoff before any query/effect.
    let copies = 0;
    afterEffect = (effect) => {
      if (effect.method === 'POST' && ++copies === 5) clock = DEADLINE;
    };
    await expect(tick()).rejects.toThrow(/lease/iu);
    const acknowledged = effects.slice(0, -1).map((effect) => effect.eventId);
    expect(acknowledged).not.toHaveLength(0);
    expect((await progress())?.['pendingCopyIds']).toHaveLength(
      acknowledged.length
    );
    expect(effects.some((effect) => effect.method === 'DELETE')).toBe(false);
    afterEffect = () => {};
    await finish();
    for (const id of acknowledged)
      expect(
        effects.filter(
          (effect) => effect.method === 'POST' && effect.eventId === id
        )
      ).toHaveLength(1);
    expect(
      new Set(
        effects
          .filter((effect) => effect.method === 'POST')
          .map((effect) => effect.eventId)
      ).size
    ).toBe(DATASET_SIZE);
    expect((await progress())?.['cutoffAt']).toBe(NOW);
  });

  it('resumes cleanup after an ambiguous deletion without replaying acknowledged old-source removals', async () => {
    await runToPhase('cleanup');
    expect(effects.filter((effect) => effect.method === 'DELETE')).toHaveLength(
      0
    );
    const copies = effects.filter((effect) => effect.method === 'POST').length;
    let removals = 0;
    afterEffect = (effect) => {
      if (effect.method === 'DELETE' && ++removals === 3) clock = DEADLINE;
    };
    await expect(tick()).rejects.toThrow(/lease/iu);
    const acknowledged = effects
      .filter((effect) => effect.method === 'DELETE')
      .slice(0, -1)
      .map((effect) => effect.eventId);
    expect((await progress())?.['cleanupOffset']).toBe(acknowledged.length);
    afterEffect = () => {};
    await finish();
    expect(effects.filter((effect) => effect.method === 'POST')).toHaveLength(
      copies
    );
    for (const id of acknowledged)
      expect(
        effects.filter(
          (effect) => effect.method === 'DELETE' && effect.eventId === id
        )
      ).toHaveLength(1);
    expect(
      new Set(
        effects
          .filter((effect) => effect.method === 'DELETE')
          .map((effect) => effect.eventId)
      ).size
    ).toBe(DATASET_SIZE);
    expect((await jobRef().collection(RECEIPTS).get()).empty).toBe(true);
  });

  it('resumes using cursor values even when the last copied appointment document disappears', async () => {
    await tick();
    await tick();
    const cursor = record((await progress())?.['copyAfter']);
    expect(typeof cursor['localRecordId']).toBe('string');
    await db
      .collection(APPOINTMENTS)
      .doc(cursor['localRecordId'] as string)
      .delete();
    await finish();
    expect(
      new Set(
        effects
          .filter((effect) => effect.method === 'POST')
          .map((effect) => effect.eventId)
      ).size
    ).toBe(DATASET_SIZE);
    expect(effects.filter((effect) => effect.method === 'DELETE')).toHaveLength(
      DATASET_SIZE
    );
  });

  it.each(['missing', 'wrong_source', 'wrong_generation', 'oversized'])(
    'refuses old-source cleanup without a valid bounded copy receipt: %s',
    async (damage) => {
      await runToPhase('cleanup');
      const receipt = jobRef().collection(RECEIPTS).doc('0000000000000000');
      if (damage === 'missing') await receipt.delete();
      if (damage === 'wrong_source')
        await receipt.update({ sourceId: 'different' });
      if (damage === 'wrong_generation')
        await receipt.update({ generation: 2 });
      if (damage === 'oversized')
        await receipt.update({
          recordIds: Array.from({ length: 21 }, () => 'unacknowledged')
        });
      effects = [];
      await expect(tick()).resolves.toMatchObject({
        processedJobs: 0,
        failedJobs: 1
      });
      expect(effects).toHaveLength(0);
      expect((await state())?.['status']).toBe('failed');
    }
  );

  it('does not remove an old projection when the receipt has a different physical binding', async () => {
    await runToPhase('cleanup');
    await jobRef()
      .collection(RECEIPTS)
      .doc('0000000000000000')
      .update({ sourceBinding: '0'.repeat(64) });
    effects = [];
    dispatch.mockClear();
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 0,
      failedJobs: 1
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(effects).toHaveLength(0);
  });

  it('does not overwrite progress changed after the copy request but before checkpoint staging', async () => {
    await tick();
    const changedCutoff = '2026-08-31T00:00:00.000Z';
    afterEffect = async () => {
      await jobRef().update({
        activationProgress: { ...(await progress()), cutoffAt: changedCutoff }
      });
    };
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 0,
      failedJobs: 1
    });
    expect(effects).toHaveLength(1);
    expect(effects[0]?.method).toBe('POST');
    expect((await progress())?.['cutoffAt']).toBe(changedCutoff);
    expect((await progress())?.['copyAfter']).toBeNull();
    expect((await jobRef().collection(RECEIPTS).get()).empty).toBe(true);
  });

  it('rejects corrupt persisted progress without dispatching', async () => {
    await jobRef().update({ activationProgress: { version: 2 } });
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 0,
      failedJobs: 1
    });
    expect(effects).toHaveLength(0);
    expect((await state())?.['status']).toBe('failed');
  });

  it('does not clean up after source generation changes during a copy', async () => {
    await tick();
    afterEffect = async () => {
      await configuration().update({ version: 2 });
    };
    await expect(tick()).rejects.toThrow(/lease/iu);
    expect(effects.filter((effect) => effect.method === 'DELETE')).toHaveLength(
      0
    );
    afterEffect = () => {};
    // A new global owner cannot reclaim the old job's still-valid lease.
    clock = DEADLINE;
    await expect(tick()).resolves.toMatchObject({
      processedJobs: 1,
      failedJobs: 0
    });
    expect((await state())?.['status']).toBe('superseded');
    expect(effects).toHaveLength(1);
  });

  it('keeps generation zero valid throughout paged copy and cleanup', async () => {
    await configuration().update({ version: 0 });
    await jobRef().update({ generation: 0 });
    await finish();
    expect((await progress())?.['generation']).toBe(0);
    expect(effects.filter((effect) => effect.method === 'POST')).toHaveLength(
      DATASET_SIZE
    );
    expect(effects.filter((effect) => effect.method === 'DELETE')).toHaveLength(
      DATASET_SIZE
    );
  });

  it.each(['logical', 'physical'])(
    'does not remove the active Calendar as its own previous source: %s',
    async (alias) => {
      let input = environment;
      if (alias === 'logical')
        await jobRef().update({ previousSourceId: 'active' });
      else
        input = {
          ...environment,
          CALENDAR_PILOT_SOURCE_MAP_JSON: JSON.stringify({
            active: { calendarId: 'active' },
            old: { calendarId: 'active' }
          })
        };
      await expect(
        new CalendarPilotRuntime(db, input, now).run(clock)
      ).resolves.toMatchObject({ processedJobs: 1, failedJobs: 0 });
      expect((await state())?.['status']).toBe('superseded');
      expect(effects).toHaveLength(0);
    }
  );

  it.each([0, PAGE_SIZE])(
    'finishes an empty or exactly full final copy page without omissions: %i',
    async (count) => {
      const rows = await db.collection(APPOINTMENTS).get();
      await Promise.all(
        rows.docs.slice(count).map((document) => document.ref.delete())
      );
      await finish();
      expect(effects.filter((effect) => effect.method === 'POST')).toHaveLength(
        count
      );
      expect(
        effects.filter((effect) => effect.method === 'DELETE')
      ).toHaveLength(count);
      expect((await jobRef().collection(RECEIPTS).get()).empty).toBe(true);
    }
  );
});
