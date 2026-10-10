import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { OPERATIONAL_ROLES } from '@beauessence/domain';
import {
  CALENDAR_PILOT_AUTH_OUTCOME,
  beginCalendarPilotLogout,
  clearCalendarPilotClientAuthState,
  isCalendarPilotLogoutInProgress,
  calendarPilotAuthenticationGeneration,
  verifyCalendarPilotClientSession
} from '../public/modules/pilot-google-totp-session.js';

const source = readFileSync(
  new URL('./calendar-pilot-entry.js', import.meta.url),
  'utf8'
);
const start = source.indexOf('async function boot()');
const end = source.indexOf('\nvoid boot();', start);
const actorId = 'synthetic_actor_001';
const actorRole = OPERATIONAL_ROLES[0];

type ResponseStub = {
  ok: boolean;
  status?: number;
  json: () => Promise<object>;
};

function harness(response: ResponseStub | Error) {
  const values: Record<string, string> = {
    calPilotCsrf: 'synthetic_csrf',
    calPilotRole: actorRole
  };
  const storage = {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    removeItem: (key: string) => {
      delete values[key];
    }
  };
  const handoff = vi.fn(() => Promise.resolve());
  const render = vi.fn(() => Promise.resolve());
  const fetch = vi.fn((url: string) => {
    if (url.endsWith('/client-config'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve(response);
  });
  const showLogin = vi.fn();
  const classList = { add: vi.fn(), remove: vi.fn() };
  const window = new EventTarget();
  const boot = runInNewContext(
    `let csrfToken, auth, root; ${source.slice(start, end)}; boot`,
    {
      API: '/v1',
      location: { pathname: '/staff', search: '', reload: vi.fn() },
      sessionStorage: storage,
      window,
      Event,
      fetch,
      document: {
        documentElement: { classList },
        createElement: () => ({}),
        body: { append: vi.fn() }
      },
      isPublicBookingPath: () => false,
      wantsCalendarPilotOverlay: () => false,
      isCalendarPilotLogoutInProgress,
      calendarPilotAuthenticationGeneration,
      verifyCalendarPilotClientSession: (uid: string) =>
        verifyCalendarPilotClientSession(uid, { storage, fetchImpl: fetch }),
      clearCalendarPilotClientAuthState,
      CALENDAR_PILOT_AUTH_OUTCOME,
      getAuth: () => ({ currentUser: { uid: actorId } }),
      calendarPilotFirebaseApp: () => ({}),
      firstAuthStateChanged: () => Promise.resolve(null),
      onAuthStateChanged: vi.fn(),
      registerCalendarPilotReauthenticationBridge: vi.fn(),
      freshIdToken: vi.fn(),
      bootStatusView: vi.fn(),
      failPendingReauthentication: vi.fn(),
      handoffToStaffWorkbench: handoff,
      renderApplication: render,
      completeGoogleSignIn: () =>
        Promise.resolve({
          outcome: CALENDAR_PILOT_AUTH_OUTCOME.NOT_AUTHENTICATED
        }),
      showLogin
    }
  );
  return { boot, storage, fetch, handoff, render, showLogin };
}

describe('Calendar boot requires authoritative server identity', () => {
  it('verified matching staff session reaches the existing workbench handoff', async () => {
    const run = harness({
      ok: true,
      json: () =>
        Promise.resolve({ actorId, actorRole, csrfToken: 'synthetic_csrf' })
    });
    await run.boot();
    expect(run.fetch).toHaveBeenCalledWith(
      '/v1/calendar-session/me',
      expect.objectContaining({ credentials: 'same-origin' })
    );
    expect(run.handoff).toHaveBeenCalledOnce();
  });

  it.each<[string, ResponseStub | Error]>([
    [
      'server denial',
      { ok: false, status: 401, json: () => Promise.resolve({}) }
    ],
    ['network failure', new Error('Synthetic network failure')],
    ['missing identity', { ok: true, json: () => Promise.resolve({}) }],
    [
      'wrong UID',
      {
        ok: true,
        json: () =>
          Promise.resolve({
            actorId: 'synthetic_other_actor',
            actorRole,
            csrfToken: 'synthetic_csrf'
          })
      }
    ],
    [
      'wrong role cache',
      {
        ok: true,
        json: () =>
          Promise.resolve({
            actorId,
            actorRole: OPERATIONAL_ROLES[1],
            csrfToken: 'synthetic_csrf'
          })
      }
    ]
  ])(
    '%s never hands cached identity to workbench',
    async (_label, response) => {
      const run = harness(response);
      await run.boot();
      expect(run.handoff).not.toHaveBeenCalled();
      expect(run.storage.getItem('calPilotCsrf')).toBeNull();
      expect(run.storage.getItem('calPilotRole')).toBeNull();
      expect(run.showLogin).toHaveBeenCalledOnce();
    }
  );

  it('logout while a session-related fetch is pending prevents late handoff', async () => {
    const run = harness({ ok: false, json: () => Promise.resolve({}) });
    let finish!: (response: ResponseStub) => void;
    run.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = run.boot();
    beginCalendarPilotLogout(run.storage);
    clearCalendarPilotClientAuthState(run.storage);
    finish({ ok: true, json: () => Promise.resolve({}) });
    await pending;
    expect(run.handoff).not.toHaveBeenCalled();
    expect(run.render).not.toHaveBeenCalled();
    expect(run.storage.getItem('calPilotCsrf')).toBeNull();
  });
  it('late denied verification cannot clear a newer server-bound principal', async () => {
    const run = harness({
      ok: true,
      json: () => Promise.resolve({ actorId, actorRole })
    });
    let finish!: (response: ResponseStub) => void;
    const oldRequest = verifyCalendarPilotClientSession(actorId, {
      storage: run.storage,
      fetchImpl: () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    });
    clearCalendarPilotClientAuthState(run.storage);
    run.storage.setItem('calPilotCsrf', 'opaque_new_csrf');
    run.storage.setItem('calPilotRole', actorRole);
    await verifyCalendarPilotClientSession(actorId, {
      storage: run.storage,
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ actorId, actorRole })
        })
    });
    finish({ ok: false, json: () => Promise.resolve({}) });
    await oldRequest;
    expect(run.storage.getItem('calPilotCsrf')).toBe('opaque_new_csrf');
  });
  it('server cookie authority survives absence of an SDK IndexedDB cache', async () => {
    const run = harness({
      ok: true,
      json: () => Promise.resolve({ actorId, actorRole })
    });
    const principal = await verifyCalendarPilotClientSession(undefined, {
      storage: run.storage,
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ actorId, actorRole })
        })
    });
    expect(principal).toMatchObject({ actorId, actorRole });
  });
  it('a known client UID mismatch is denied rather than rebound', async () => {
    const run = harness({
      ok: true,
      json: () => Promise.resolve({ actorId, actorRole })
    });
    await expect(
      verifyCalendarPilotClientSession('opaque_different_uid', {
        storage: run.storage,
        fetchImpl: () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ actorId, actorRole })
          })
      })
    ).resolves.toBeUndefined();
    expect(run.storage.getItem('calPilotCsrf')).toBeNull();
  });
});
