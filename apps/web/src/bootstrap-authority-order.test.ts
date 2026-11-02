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
describe('independent staff bootstraps share authoritative principal regardless of ordering', () => {
  it('rehydrates after delayed /me and clears authority on denial', async () => {
    const h = harness();
    // Start the exact owning bootstrap while no verified principal exists.
    await h.boot();
    expect(h.read()?.session.authenticated).toBe(false);
    await authority.verifyCalendarPilotClientSession(actorId, {
      storage: h.storage,
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ actorId, actorRole })
        })
    });
    expect(h.read()?.session.authenticated).toBe(true);
    expect(h.read()?.session.account?.id).toBe(actorId);
    expect(h.read()?.session.permissions.length).toBeGreaterThan(0);
    expect(h.read()?.workspace.currentAccountId).toBe(actorId);

    await authority.verifyCalendarPilotClientSession(actorId, {
      storage: h.storage,
      fetchImpl: () =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
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
