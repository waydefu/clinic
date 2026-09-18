import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, stagingRequest, storageKey } from '../public/store.js';
import { completeGoogleSignIn } from '../public/modules/pilot-google-totp-session.js';

vi.mock('firebase/app', () => ({
  getApps: () => [{ name: 'calendar-pilot' }]
}));
vi.mock('firebase/auth', async (importOriginal) =>
  Object.assign({}, await importOriginal(), { getAuth: () => ({}) })
);
vi.mock(
  '../public/modules/pilot-google-totp-session.js',
  async (importOriginal) =>
    Object.assign({}, await importOriginal(), {
      completeGoogleSignIn: vi.fn()
    })
);

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
    const otpForm = { addEventListener: vi.fn() };
    const otpRegion = {
      hidden: true,
      innerHTML: '',
      querySelector: () => otpForm
    };
    const root = {
      innerHTML: '',
      querySelector(selector: string) {
        if (selector === '[data-otp-region]') {
          return this.innerHTML.includes('data-otp-region') ? otpRegion : null;
        }
        return { addEventListener: vi.fn() };
      }
    };
    vi.stubGlobal('location', {
      pathname: '/staff',
      search: '?calendarPilot=1'
    });
    vi.stubGlobal(
      'sessionStorage',
      storage({ calPilotCsrf: 'synthetic_csrf' })
    );
    vi.stubGlobal('document', {
      documentElement: { classList: { add() {} } },
      createElement: () => root,
      body: { append() {} }
    });
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: url.endsWith('/client-config'),
        json: () => Promise.resolve({ error: { code: 'CONFLICT' } })
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const promptFailure = vi.fn();
    vi.mocked(completeGoogleSignIn).mockImplementation(({ promptTotp }) => {
      // Exercise the real prompt against markup produced by the real boot flow.
      // No credentials are submitted and the OTP promise remains pending.
      void promptTotp().catch(promptFailure);
      return Promise.resolve({ outcome: 'not_authenticated' });
    });
    await import('./calendar-pilot-entry.js');
    await vi.waitFor(() => expect(completeGoogleSignIn).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/calendar/status',
      expect.anything()
    );
    expect(promptFailure).not.toHaveBeenCalled();
    expect(otpRegion.hidden).toBe(false);
    expect(otpForm.addEventListener).toHaveBeenCalledWith(
      'submit',
      expect.any(Function),
      { once: true }
    );
    expect(sessionStorage.getItem('calPilotCsrf')).toBeNull();
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
