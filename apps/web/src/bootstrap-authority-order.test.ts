import { afterEach, describe, expect, it, vi } from 'vitest';
import * as authority from '../public/modules/pilot-google-totp-session.js';
import * as hydration from '../public/modules/hydrate-staff.js';
import { bootStaffWorkbench } from '../public/modules/workspace-tabs.js';
import { OPERATIONAL_ROLES } from '@beauessence/domain';
const actorId = 'opaque_authoritative_staff',
  actorRole = OPERATIONAL_ROLES[0];
type WorkbenchState = {
  workspace: {
    authenticated: boolean;
    currentAccountId?: string | null;
    accounts: unknown[];
  };
  session: {
    authenticated: boolean;
    account: { id: string } | null;
    permissions: unknown[];
  };
};
function harness() {
  const values: Record<string, string> = {
    calPilotCsrf: 'opaque_csrf',
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
  const initial: WorkbenchState = {
    workspace: { authenticated: false, accounts: [] },
    session: { authenticated: false, account: null, permissions: [] }
  };
  let state: WorkbenchState | undefined;
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('window', {
    location: { hash: '' },
    addEventListener: vi.fn()
  });
  vi.stubGlobal('document', {
    documentElement: { dataset: { calendarSessionMode: 'server' } }
  });
  // The owning bootstrap module receives the workbench's real state accessors.
  const boot = () =>
    bootStaffWorkbench({
      getState: () => state,
      setState: (next: WorkbenchState) => {
        state = next;
      },
      setClient: vi.fn(),
      setServerAuthority: vi.fn(),
      loadStaffServerAuthority: () => Promise.resolve(hydration),
      resolveApiClient: () =>
        Promise.resolve({ request: () => Promise.resolve(initial) }),
      enforceRoleDomBoundary: vi.fn(),
      render: vi.fn(),
      initWorkspaceTabs: vi.fn(),
      message: vi.fn(),
      elements: { 'login-account': { focus: vi.fn() } },
      activateBusinessView: vi.fn()
    });
  return { storage, boot, read: () => state };
}
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('staff bootstrap and server revalidation', () => {
  it('clears workbench authority when revalidation rejects a stale CSRF', async () => {
    const h = harness();
    const validCsrf = 'valid-valid-valid-valid';
    const invalidCsrf = 'invalid-invalid-invalid-invalid';
    h.storage.setItem('calPilotCsrf', validCsrf);
    const fetchImpl = vi.fn(
      (_url: string, request: { headers: Record<string, string> }) =>
        Promise.resolve({
          ok: request.headers['X-CSRF-Token'] === validCsrf,
          json: () => Promise.resolve({ actorId, actorRole })
        })
    );
    // Start the exact owning bootstrap while no verified principal exists.
    await h.boot();
    expect(h.read()?.session.authenticated).toBe(false);
    await authority.verifyCalendarPilotClientSession(actorId, {
      storage: h.storage,
      fetchImpl
    });
    expect(h.read()?.session.authenticated).toBe(true);
    expect(h.read()?.session.account?.id).toBe(actorId);
    expect(h.read()?.session.permissions.length).toBeGreaterThan(0);
    expect(h.read()?.workspace.currentAccountId).toBe(actorId);

    h.storage.setItem('calPilotCsrf', invalidCsrf);
    expect(h.read()?.session.authenticated).toBe(true);
    await authority.verifyCalendarPilotClientSession(actorId, {
      storage: h.storage,
      fetchImpl
    });
    expect(fetchImpl).toHaveBeenLastCalledWith('/v1/calendar-session/me', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-CSRF-Token': invalidCsrf }
    });
    expect(h.storage.getItem('calPilotCsrf')).toBeNull();
    expect(h.storage.getItem('calPilotRole')).toBeNull();
    expect(h.read()?.workspace.authenticated).toBe(false);
    expect(h.read()?.workspace.currentAccountId).toBeNull();
    expect(h.read()?.session).toEqual({
      authenticated: false,
      account: null,
      permissions: []
    });
  });
});
