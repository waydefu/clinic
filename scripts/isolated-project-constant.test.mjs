import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { C1_CALENDAR_SYNC_PROJECT } from './c1-calendar-sync-bootstrap.mjs';
import {
  ISOLATED_C1_FIREBASE_AUTH_DOMAIN,
  ISOLATED_C1_PROJECT_ID
} from './internal-test-c1-identity.mjs';
import {
  FORBIDDEN_STAGING_PROJECT,
  UNAPPLIED_PLACEHOLDER,
  ISOLATED_C1_PROJECT_PREFIX,
  isIsolatedC1ProjectId
} from './isolated-c1-project-id.mjs';

// E2-09: the isolated C1 project id has one source for scripts
// (internal-test-c1-identity.mjs). TypeScript runtime code cannot import it, so
// these tests pin every copy to that value instead. The CAL-PILOT project
// `beauessence-clinic-staging` is a different project: it is not folded into
// the isolated constant, and each script that names it must name it the same way.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), 'utf8');
const literalAfter = (source, pattern) => {
  const match = pattern.exec(source);
  expect(match, String(pattern)).not.toBeNull();
  return match[1];
};

describe('isolated C1 project constant', () => {
  it('is an isolated id and is not the CAL-PILOT or placeholder project', () => {
    expect(isIsolatedC1ProjectId(ISOLATED_C1_PROJECT_ID)).toBe(true);
    expect(isIsolatedC1ProjectId(FORBIDDEN_STAGING_PROJECT)).toBe(false);
    expect(isIsolatedC1ProjectId(UNAPPLIED_PLACEHOLDER)).toBe(false);
    expect(ISOLATED_C1_PROJECT_ID).not.toBe(FORBIDDEN_STAGING_PROJECT);
    expect(
      ISOLATED_C1_FIREBASE_AUTH_DOMAIN.startsWith(`${ISOLATED_C1_PROJECT_ID}--`)
    ).toBe(true);
  });

  it('is reused, not redefined, by the scripts that name it', () => {
    expect(C1_CALENDAR_SYNC_PROJECT).toBe(ISOLATED_C1_PROJECT_ID);
  });

  it('matches the TypeScript runtime copies', () => {
    expect(
      literalAfter(
        read('apps/api/src/platform/runtime/c1-firebase-auth-domain.ts'),
        /const ISOLATED_C1_PROJECT_ID = '([^']+)'/
      )
    ).toBe(ISOLATED_C1_PROJECT_ID);
    expect(
      literalAfter(
        read(
          'apps/api/src/internal-test-booking/internal-test-booking.gate.ts'
        ),
        /AUTHORIZED_PROJECTS = Object\.freeze\(\[\s*'([^']+)'/
      )
    ).toBe(ISOLATED_C1_PROJECT_ID);
    expect(
      literalAfter(
        read('apps/worker/src/calendar-sync/calendar-pilot-runtime.ts'),
        /C1_SYNTHETIC_PROJECT_ID = '([^']+)'/
      )
    ).toBe(ISOLATED_C1_PROJECT_ID);
  });
});

describe('CAL-PILOT project name is used consistently', () => {
  it.each([
    ['scripts/activate-cal-pilot.mjs', /projectId !== '([^']+)'/],
    [
      'scripts/migrate-cal-pilot-legacy-candidates.mjs',
      /APPROVED_PROJECT = '([^']+)'/
    ],
    [
      'apps/api/src/internal-test-booking/internal-test-booking.gate.ts',
      /FORBIDDEN_PROJECTS = Object\.freeze\(\[\s*'([^']+)'/
    ],
    [
      'apps/worker/src/internal-test-outbox-runtime.ts',
      /INTERNAL_TEST_OUTBOX_FORBIDDEN_PROJECTS = new Set\(\[\s*'([^']+)'/
    ],
    ['infra/terraform/cal-pilot/variables.tf', /default\s*=\s*"([^"]+)"/]
  ])('%s names the same CAL-PILOT project that C1 refuses', (path, pattern) => {
    expect(literalAfter(read(path), pattern)).toBe(FORBIDDEN_STAGING_PROJECT);
  });
});

describe('every isolated project token in runtime code', () => {
  it('is the shared id, the unapplied placeholder or the bare prefix', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1 << 28
    })
      .split('\0')
      .filter(
        (path) =>
          /^(scripts|apps|packages)\//.test(path) &&
          /\.(mjs|js|ts)$/.test(path) &&
          !/\.test\./.test(path)
      );
    expect(tracked.length).toBeGreaterThan(100);
    const allowed = new Set([
      ISOLATED_C1_PROJECT_ID,
      UNAPPLIED_PLACEHOLDER,
      ISOLATED_C1_PROJECT_PREFIX
    ]);
    const stray = [];
    for (const path of tracked) {
      const tokens =
        read(path).match(/beauessence-clinic-stg-[a-z0-9]*/g) ?? [];
      for (const token of tokens) {
        if (!allowed.has(token)) stray.push(`${path}: ${token}`);
      }
    }
    expect(stray).toEqual([]);
  });
});
