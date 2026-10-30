import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  loadC1ConfigContract,
  redactConfigForLogs
} from './c1-config-contract.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const contract = loadC1ConfigContract();
const CLASSES = new Set([
  'NON_SECRET_CONFIG',
  'SECRET_REFERENCE',
  'RUNTIME_DERIVED',
  'FORBIDDEN_TO_STORE_IN_REPO'
]);
const LOGGABLE = new Set(['NON_SECRET_CONFIG', 'RUNTIME_DERIVED']);

// shortcut: static text scan of literal names. It sees process.env['X'],
// env['X'], environment['X'], env.X and the CAL-PILOT import CLI's
// required('X'); a name built at run time is invisible. Move to a TypeScript
// AST scan if a read ever builds its name dynamically.
const ENV_READ =
  /(?:process\.env|\benv|\benvironment)\s*(?:\[\s*'([A-Za-z_][A-Za-z0-9_]*)'\s*\]|\.([A-Za-z_][A-Za-z0-9_]*))|\brequired\(\s*'([A-Z][A-Z0-9_]+)'\s*\)/g;

function envNamesRead(source) {
  return new Set(
    [...source.matchAll(ENV_READ)].map(
      (match) => match[1] ?? match[2] ?? match[3]
    )
  );
}

function runtimeSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSources(path);
    return /\.ts$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe('environment inventory (B-45): code -> contract, no values read', () => {
  it('finds each supported read form and ignores lookalikes', () => {
    const names = envNamesRead(
      [
        "process.env['A_ONE']",
        "env['B_TWO']",
        "environment['C_THREE']",
        'env.D_FOUR',
        "required('E_FIVE')",
        "envelope.NOT_ENV; const developmentMode = 'NOT_ENV_TOO'"
      ].join('\n')
    );
    expect([...names].sort()).toEqual([
      'A_ONE',
      'B_TWO',
      'C_THREE',
      'D_FOUR',
      'E_FIVE'
    ]);
  });

  it('lists every variable apps/api and apps/worker read, each with a class', () => {
    const read = new Map();
    for (const directory of ['apps/api/src', 'apps/worker/src']) {
      for (const path of runtimeSources(join(root, directory))) {
        for (const name of envNamesRead(readFileSync(path, 'utf8'))) {
          read.set(name, path);
        }
      }
    }
    // Guards against the scanner silently seeing nothing.
    expect(read.has('GOOGLE_CLOUD_PROJECT')).toBe(true);
    expect(read.has('GOOGLE_CALENDAR_ID')).toBe(true);

    const classOf = new Map(
      contract.entries.map((entry) => [entry.name, entry.class])
    );
    const unlisted = [...read.keys()].filter((name) => !classOf.has(name));
    expect(unlisted.sort()).toEqual([]);
    const unclassified = [...read.keys()].filter(
      (name) => !CLASSES.has(classOf.get(name))
    );
    expect(unclassified.sort()).toEqual([]);
  });

  it('keeps the API always-required list (read by name at run time) in the contract', () => {
    const source = readFileSync(
      join(root, 'apps/api/src/platform/runtime/c1-required-config.ts'),
      'utf8'
    );
    const list = /API_CLOUD_ALWAYS_REQUIRED_ENV = \[([^\]]*)\]/.exec(source);
    expect(list).not.toBeNull();
    const names = [...list[1].matchAll(/'([A-Z0-9_]+)'/g)].map(
      (match) => match[1]
    );
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) {
      const entry = contract.entries.find((item) => item.name === name);
      expect(entry, name).toBeDefined();
      expect(entry.cloudRequired, name).toBe(true);
      expect(entry.requiredFor, name).toContain('api');
    }
  });
});

describe('log redaction follows the contract class (E1-15)', () => {
  it.each(contract.entries.map((entry) => [entry.name, entry.class]))(
    '%s (%s) with a fake value',
    (name, cls) => {
      const fake = `fake-value-for-${name}`;
      const out = redactConfigForLogs({ [name]: fake }, contract);
      expect(CLASSES.has(cls)).toBe(true);
      if (LOGGABLE.has(cls)) {
        expect(out[name]).toBe(fake);
      } else {
        expect(out[name]).toBe('[redacted]');
        expect(JSON.stringify(out)).not.toContain(fake);
      }
    }
  );

  it('redacts GOOGLE_CALENDAR_ID, which the old name pattern missed', () => {
    expect(
      redactConfigForLogs({ GOOGLE_CALENDAR_ID: 'fake-calendar-id' }, contract)
    ).toEqual({ GOOGLE_CALENDAR_ID: '[redacted]' });
  });

  it('redacts a name the contract does not list, whatever it looks like', () => {
    expect(
      redactConfigForLogs(
        { UNLISTED_PLAIN_NAME: 'fake-a', UNLISTED_SERVICE: 'fake-b' },
        contract
      )
    ).toEqual({
      UNLISTED_PLAIN_NAME: '[redacted]',
      UNLISTED_SERVICE: '[redacted]'
    });
  });

  it('keeps a secret-looking name when the contract says it is not secret', () => {
    const custom = {
      entries: [{ name: 'LOOKS_LIKE_A_TOKEN', class: 'NON_SECRET_CONFIG' }]
    };
    expect(redactConfigForLogs({ LOOKS_LIKE_A_TOKEN: 'fake' }, custom)).toEqual(
      { LOOKS_LIKE_A_TOKEN: 'fake' }
    );
  });
});
