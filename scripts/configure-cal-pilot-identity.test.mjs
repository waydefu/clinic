import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adc = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock('firebase-admin/app', () => ({
  getApps: () => [{ options: { credential: adc } }]
}));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'beauessence-clinic-staging');
  vi.stubEnv(
    'CALENDAR_PILOT_PREVIEW_DOMAIN',
    'beauessence-clinic-staging--cal-pilot-synthetic.web.app'
  );
  adc.getAccessToken
    .mockReset()
    .mockResolvedValue({ access_token: 'synthetic-not-a-credential' });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function load() {
  const state = { status: 'pending', error: undefined };
  const completion = import('./configure-cal-pilot-identity.mjs').then(
    () => {
      state.status = 'success';
    },
    (error) => {
      state.status = 'failure';
      state.error = error;
    }
  );
  return { state, completion };
}

async function startRequests() {
  await vi.waitFor(() => expect(adc.getAccessToken).toHaveBeenCalled(), {
    timeout: 1000,
    interval: 1
  });
  await Promise.resolve();
}

describe('Identity request deadline with synthetic ADC and HTTP only', () => {
  it('bounds an ignored fetch signal and never retries a mutation', async () => {
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    const { state, completion } = load();
    await startRequests();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.status).toBe('failure');
    expect(state.error.message).toMatch(/timed out/);
    await completion;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('includes response-body waiting in the same request deadline', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: () => new Promise(() => {})
    }));
    vi.stubGlobal('fetch', fetch);
    const { state, completion } = load();
    await startRequests();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.status).toBe('failure');
    await completion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch after a late credential reply', async () => {
    let release;
    adc.getAccessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { state, completion } = load();
    await startRequests();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.status).toBe('failure');
    await completion;
    release({ access_token: 'synthetic-late-not-a-credential' });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps successful initialization/configuration and provider verification', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ enabled: true })
    }));
    vi.stubGlobal('fetch', fetch);
    const { state, completion } = load();
    await startRequests();
    await completion;
    expect(state.status).toBe('success');
    expect(fetch.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual([
      'POST',
      'GET',
      'PATCH',
      'GET'
    ]);
    expect(
      fetch.mock.calls.every(([, init]) => init.signal instanceof AbortSignal)
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves HTTP rejection without retrying the initialization', async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { status: 'PERMISSION_DENIED' } })
    }));
    vi.stubGlobal('fetch', fetch);
    const { state, completion } = load();
    await startRequests();
    await completion;
    expect(state.status).toBe('failure');
    expect(state.error.message).toMatch(/403 PERMISSION_DENIED/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
