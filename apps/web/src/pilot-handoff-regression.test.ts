import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, stagingRequest, storageKey } from '../public/store.js';

function storage(values: Record<string, string> = {}) {
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    removeItem: (key: string) => {
      delete values[key];
    }
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('pilot handoff regressions', () => {
  it('restores the OTP region after a cached calendar render fails', async () => {
    const source = readFileSync(
      new URL('./calendar-pilot-entry.js', import.meta.url),
      'utf8'
    );
    let otpPresent = false;
    const completeGoogleSignIn = vi.fn(() => {
      expect(otpPresent).toBe(true);
      return Promise.resolve({ outcome: 'not_authenticated' });
    });
    const showLogin = vi.fn();
    await runInNewContext(
      source.slice(
        source.indexOf('async function boot()'),
        source.lastIndexOf('void boot();')
      ) + '\nboot();',
      {
        isPublicBookingPath: () => false,
        isCalendarPilotLogoutInProgress: () => false,
        location: { pathname: '/staff', search: '?calendarPilot=1' },
        sessionStorage: storage({ calPilotCsrf: 'synthetic_csrf' }),
        fetch: () =>
          Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
        API: '/v1',
        wantsCalendarPilotOverlay: () => true,
        document: {
          documentElement: { classList: { add() {} } },
          createElement: () => ({}),
          body: { append() {} }
        },
        getAuth: () => ({}),
        calendarPilotFirebaseApp: () => ({}),
        bootStatusView: () => {
          otpPresent = true;
        },
        renderApplication: () => {
          otpPresent = false;
          return Promise.reject(new Error('synthetic conflict'));
        },
        clearCalendarPilotClientAuthState() {},
        completeGoogleSignIn,
        showLogin,
        CALENDAR_PILOT_AUTH_OUTCOME: {
          AUTHENTICATED: 'authenticated',
          NEEDS_REAUTHENTICATION: 'needs_reauthentication'
        }
      }
    );
    expect(completeGoogleSignIn).toHaveBeenCalledOnce();
    expect(showLogin).toHaveBeenCalledWith();
  });

  it.each(['manager', 'front_desk', 'missing'])(
    'handles %s draft edits without persisting a login',
    async (role) => {
      const local = storage();
      vi.stubGlobal('localStorage', local);
      vi.stubGlobal(
        'sessionStorage',
        storage(
          role === 'missing'
            ? {}
            : { calPilotCsrf: 'synthetic_csrf', calPilotRole: role }
        )
      );
      const state = initialState();
      state.workspace.authenticated = false;
      local.setItem(storageKey, JSON.stringify(state));
      const draft = structuredClone(state.scheduleDraft);
      draft.blockedTimes.initial = ['13:00'];
      const request = stagingRequest('/schedule/draft', {
        method: 'POST',
        body: JSON.stringify(draft)
      });
      if (role === 'manager') {
        const result = await request;
        expect(result.scheduleDraft.blockedTimes.initial).toEqual(['13:00']);
        expect(result.session.authenticated).toBe(true);
        expect(
          JSON.parse(local.getItem(storageKey)!).workspace.authenticated
        ).toBe(false);
        // Bootstrap flags authorize local drafts only, not local publication.
        await expect(
          stagingRequest('/schedule/publish', { method: 'POST' })
        ).rejects.toThrow();
        const discarded = await stagingRequest('/schedule/discard', {
          method: 'POST'
        });
        expect(discarded.scheduleDraft).toEqual(state.schedule);
        expect(discarded.session.authenticated).toBe(true);
        expect(
          JSON.parse(local.getItem(storageKey)!).workspace.authenticated
        ).toBe(false);
        sessionStorage.removeItem('calPilotCsrf');
        await expect(
          stagingRequest('/schedule/discard', { method: 'POST' })
        ).rejects.toThrow();
      } else {
        await expect(request).rejects.toThrow();
        expect(JSON.parse(local.getItem(storageKey)!).scheduleDraft).toEqual(
          state.scheduleDraft
        );
      }
    }
  );
});
