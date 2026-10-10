import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authority from '../public/modules/pilot-google-totp-session.js';
import * as hydration from '../public/modules/hydrate-staff.js';
import { OPERATIONAL_ROLES } from '@beauessence/domain';
const actorId = 'opaque_authoritative_staff',
  actorRole = OPERATIONAL_ROLES[0];
const source = readFileSync(
  new URL('../public/admin-bootstrap.js', import.meta.url),
  'utf8'
);
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
  const rendered: boolean[] = [];
  const initial = {
    workspace: { authenticated: false, accounts: [] },
    session: { authenticated: false, account: null, permissions: [] }
  };
  const start = source.lastIndexOf('\ntry {') + 1;
  if (start <= 0) throw new Error('Owning bootstrap boundary missing.');
  const script = `let client, state, serverAuthority; ${source.slice(start)}; return () => state;`;
  const run = runInNewContext(`(async()=>{${script}})`, {
    loadStaffServerAuthority: () => Promise.resolve(hydration),
    ...authority,
    ...hydration,
    sessionStorage: storage,
    resolveApiClient: () =>
      Promise.resolve({ request: () => Promise.resolve(initial) }),
    isInternalTestBookingEnabled: () => true,
    enforceRoleDomBoundary: vi.fn(),
    initWorkspaceTabs: vi.fn(),
    elements: { 'login-account': { focus: vi.fn() } },
    window: { location: { hash: '' }, addEventListener: vi.fn() },
    document: {
      documentElement: { dataset: { calendarSessionMode: 'server' } }
    },
    message: vi.fn(),
    // The source's render closure sees its actual resulting state.
    render: () => {
      rendered.push(Boolean(run.read?.()?.session?.authenticated));
    },
    onState: (state: unknown) => state
  });
  return {
    storage,
    rendered,
    run: Object.assign(run, {
      read: undefined as (() => typeof initial) | undefined
    })
  };
}
beforeEach(() => {
  vi.unstubAllGlobals();
});
describe('independent staff bootstraps share authoritative principal regardless of ordering', () => {
  it('rehydrates when /state finishes before delayed /me', async () => {
    const h = harness();
    vi.stubGlobal('sessionStorage', h.storage);
    // Start the exact owning bootstrap while no verified principal exists.
    const read = await h.run();
    h.run.read = read;
    expect(read().session.authenticated).toBe(false);
    await authority.verifyCalendarPilotClientSession(actorId, {
      storage: h.storage,
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ actorId, actorRole })
        })
    });
    expect(read().session.authenticated).toBe(true);
    expect(read().session.account?.id).toBe(actorId);
  });
});
