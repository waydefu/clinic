import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPERATIONAL_ROLES } from '@beauessence/domain';
import {
  evaluateC1FirebaseAuthDomain,
  inspectC1FirebaseAuthDomainSource,
  ISOLATED_C1_FIREBASE_AUTH_DOMAIN
} from '../../../scripts/c1-firebase-auth-domain.mjs';
import {
  beginCalendarPilotLogout,
  shouldHydrateCalendarPilotWorkbench,
  teardownCalendarPilotSessions
} from '../public/modules/pilot-google-totp-session.js';
import { taipeiDate } from '../public/modules/taipei-time.js';
import { weekStartOf } from '../public/modules/week-view.js';

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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('authoritative staff session prerequisites', () => {
  it('a cached CSRF and role remain hints until the authoritative server read', () => {
    expect(
      shouldHydrateCalendarPilotWorkbench(
        storage({
          calPilotCsrf: 'synthetic_csrf',
          calPilotRole: OPERATIONAL_ROLES[0]
        })
      )
    ).toBe(false);
  });
  it('logout blocks cached hydration while teardown is pending and clears identity', async () => {
    const session = storage({
      calPilotCsrf: 'synthetic_csrf',
      calPilotRole: OPERATIONAL_ROLES[0]
    });
    let finish!: () => void;
    const pending = teardownCalendarPilotSessions({
      storage: session,
      deleteServerSession: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      signOut: async () => {}
    });
    expect(shouldHydrateCalendarPilotWorkbench(session)).toBe(false);
    expect(session.getItem('calPilotCsrf')).toBeNull();
    finish();
    await pending;
    expect(shouldHydrateCalendarPilotWorkbench(session)).toBe(false);
  });
  it('the explicit logout guard denies even forged cache fields', () => {
    const session = storage({
      calPilotCsrf: 'synthetic_csrf',
      calPilotRole: OPERATIONAL_ROLES[0]
    });
    beginCalendarPilotLogout(session);
    expect(shouldHydrateCalendarPilotWorkbench(session)).toBe(false);
  });
});

describe('synthetic hint mode isolation at the real loader', () => {
  const source = readFileSync(
    new URL('../public/calendar-pilot-entry.js', import.meta.url),
    'utf8'
  );
  async function load(hostname: string, values: Record<string, string> = {}) {
    const classes = new Set<string>();
    let finish!: (value: object) => void;
    const fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = runInNewContext(`(async () => {${source}\n})()`, {
      location: {
        hostname,
        protocol: 'http:',
        port: '3100',
        pathname: '/staff',
        search: ''
      },
      sessionStorage: storage(values),
      fetch,
      document: {
        documentElement: {
          classList: { add: (name: string) => classes.add(name) }
        },
        head: { append: vi.fn() }
      }
    });
    return Promise.resolve({ classes, pending, fetch, finish });
  }
  it('preserves the local prototype fallback only after the server probe fails', async () => {
    const run = await load('127.0.0.1');
    expect(run.classes.has('synthetic-workbench-ready')).toBe(false);
    run.finish({ ok: false });
    await run.pending;
    expect(run.classes.has('synthetic-workbench-ready')).toBe(true);
  });
  it('does not expose local credential hints when a remote server probe fails', async () => {
    const run = await load('unapproved.example');
    expect(run.classes.has('synthetic-workbench-ready')).toBe(false);
    run.finish({ ok: false });
    await run.pending;
    expect(run.classes.has('synthetic-workbench-ready')).toBe(false);
  });
  it('forged cache cannot bypass the initial server probe', async () => {
    const run = await load('unapproved.example', {
      calPilotCsrf: 'synthetic_forged_csrf'
    });
    expect(run.fetch).toHaveBeenCalledOnce();
    expect(run.classes.has('synthetic-workbench-ready')).toBe(false);
    run.finish({ ok: false });
    await run.pending;
  });
});

describe('existing workbench calendar anchor counter-evidence', () => {
  const source = readFileSync(
    new URL('../public/admin-bootstrap.js', import.meta.url),
    'utf8'
  );
  const start = source.indexOf(
    '  if (weekStart === undefined) {',
    source.indexOf('function renderWeek()')
  );
  const end = source.indexOf('\n  //', start);
  function select(state: object, prior?: string) {
    return runInNewContext(
      `let weekStart=prior; ${source.slice(start, end)}; weekStart`,
      { state, prior, weekStartOf, taipeiDate, Date }
    );
  }
  it('retains the intentionally dated local fixture week and future slot week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T16:30:00Z'));
    expect(
      select({
        appointments: [{ startsAt: '2026-07-08T01:00:00Z' }],
        slots: []
      })
    ).toBe('2026-07-06');
    expect(
      select({
        appointments: [],
        slots: [{ startsAt: '2026-11-18T01:00:00Z' }]
      })
    ).toBe('2026-11-16');
  });
  it('no rows use Taipei today across UTC midnight, and explicit navigation survives rerender', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T16:30:00Z'));
    expect(select({ appointments: [], slots: [] })).toBe('2026-10-12');
    expect(
      select(
        { appointments: [{ startsAt: '2026-07-08T01:00:00Z' }], slots: [] },
        '2026-10-19'
      )
    ).toBe('2026-10-19');
  });
});

describe('E1-14 executable policy evidence without private configuration', () => {
  it('the approved auth host passes and scheme/path/sibling/empty hosts are rejected', () => {
    expect(
      evaluateC1FirebaseAuthDomain(ISOLATED_C1_FIREBASE_AUTH_DOMAIN).ok
    ).toBe(true);
    for (const host of [
      '',
      `https://${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}`,
      `${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}/__/auth/handler`,
      'unapproved.web.app',
      'beauessence-clinic-staging.web.app',
      `${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}.unapproved.example`
    ]) {
      expect(evaluateC1FirebaseAuthDomain(host).ok).toBe(false);
    }
  });
  it('inert commented source cannot be accepted as executable auth policy', () => {
    const dir = mkdtempSync(
      join(process.env['TMPDIR'] ?? tmpdir(), 'clinic-synthetic-auth-policy-')
    );
    const write = (path: string, value: string) => {
      const target = join(dir, path);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, value);
    };
    // The generated fixture is the only recursively removed directory.
    if (
      !resolve(dir).startsWith(
        `${resolve(process.env['TMPDIR'] ?? tmpdir())}${sep}clinic-synthetic-auth-policy-`
      )
    )
      throw new Error('Synthetic fixture escaped its temporary root.');
    try {
      write(
        'infra/terraform/c1-internal-test-run/main.tf',
        '# value = var.firebase_auth_domain'
      );
      write(
        'infra/terraform/c1-internal-test-run/variables.tf',
        `# variable "firebase_auth_domain"\n# default     = ""\n# ${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}\n# firebaseapp.com beauessence-clinic-staging beauessence.com.tw :// *\n# Applying C1 internal-test Cloud Run requires firebase_auth_domain set to an authorized isolated Hosting host.`
      );
      write(
        'infra/terraform/c1-internal-test-run/terraform.tfvars.example',
        `# firebase_auth_domain = "${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}"`
      );
      write(
        'infra/terraform/c1-internal-test-run/noop.tftest.hcl',
        '# named_sha_without_auth_domain_is_rejected\n# firebaseapp_auth_domain_is_rejected\n# exact_apply_authority_sha = "not_granted"\n# firebase_auth_domain      = ""'
      );
      write(
        'apps/api/src/platform/runtime/c1-firebase-auth-domain.ts',
        `// ${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}\nexport const isAuthorizedC1FirebaseAuthDomain = () => true;`
      );
      write(
        'infra/config/c1-internal-test-config-contract.json',
        JSON.stringify({
          entries: [
            {
              name: 'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN',
              class: 'NON_SECRET_CONFIG',
              cloudRequired: true,
              requiredFor: ['api'],
              authorizedHosts: [ISOLATED_C1_FIREBASE_AUTH_DOMAIN]
            }
          ]
        })
      );
      expect(inspectC1FirebaseAuthDomainSource(dir).ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('business review retry counter-evidence', () => {
  it('failure releases the spinner and retry keeps payload/key but requests new reauthentication', async () => {
    const source = readFileSync(
      new URL('../public/modules/business-view.js', import.meta.url),
      'utf8'
    );
    const start = source.indexOf('  const runWrite = async (');
    const end = source.indexOf('\n\n  const headingRow', start);
    let fail!: (error: Error) => void;
    const api = vi.fn(
      (_path: string, _options: { body: object; reauthToken: string }) =>
        new Promise<unknown>((_, reject) => {
          fail = reject;
        })
    );
    const requestFreshIdToken = vi
      .fn()
      .mockResolvedValueOnce('synthetic_fresh_001')
      .mockResolvedValueOnce('synthetic_fresh_002');
    const clearKey = vi.fn();
    const setStatus = vi.fn();
    const runWrite = runInNewContext(
      `let activeController; ${source.slice(start, end)}; runWrite`,
      {
        AbortController,
        isViewActive: () => true,
        nextKey: () => 'synthetic_stable_key',
        target: new EventTarget(),
        requestFreshIdToken,
        api,
        clearKey,
        setStatus,
        reportError: (error: Error) => error.message,
        loadPendingDeletion: async () => {}
      }
    );
    const button = { disabled: false };
    const payload = { patientId: 'synthetic_patient_001' };
    const pending = runWrite(
      button,
      'synthetic_review',
      '/v1/business-delivery/synthetic',
      payload,
      { reauthenticate: true }
    );
    await vi.waitFor(() => expect(api).toHaveBeenCalledOnce());
    expect(button.disabled).toBe(true);
    await runWrite(
      button,
      'synthetic_review',
      '/v1/business-delivery/synthetic',
      payload,
      { reauthenticate: true }
    );
    expect(api).toHaveBeenCalledOnce();
    fail(new Error('Synthetic request rejection'));
    await expect(pending).resolves.toBe(false);
    expect(button.disabled).toBe(false);
    expect(clearKey).not.toHaveBeenCalled();
    api.mockResolvedValueOnce({ accepted: true });
    await runWrite(
      button,
      'synthetic_review',
      '/v1/business-delivery/synthetic',
      payload,
      { reauthenticate: true }
    );
    expect(requestFreshIdToken).toHaveBeenCalledTimes(2);
    expect(api.mock.calls[0]?.[1]?.body).toEqual(api.mock.calls[1]?.[1]?.body);
    expect(api.mock.calls[0]?.[1]?.reauthToken).toBe('synthetic_fresh_001');
    expect(api.mock.calls[1]?.[1]?.reauthToken).toBe('synthetic_fresh_002');
    expect(button.disabled).toBe(false);
    expect(payload).toEqual({ patientId: 'synthetic_patient_001' });
    expect(clearKey).toHaveBeenCalledOnce();
  });
});
