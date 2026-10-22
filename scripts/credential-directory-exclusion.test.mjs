import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { inspectPath, scanTrackedFiles } from './check-tracked-secrets.mjs';

const protectedPaths = [
  'cal-pilot-keys/synthetic-canary.json',
  'nested/cal-pilot-keys/synthetic-canary.json',
  'secrets/synthetic-canary.json',
  'nested/secrets/synthetic-canary.json'
];
const safePaths = [
  'package.json',
  'apps/web/config.json',
  '.env.example',
  'cal-pilot-keys-source/example.json'
];

describe('credential directory exclusions', () => {
  it('uses Git itself to exclude only credential-directory fixtures', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'clinic-ignore-fixture-'));
    try {
      const ignore = await readFile(new URL('../.gitignore', import.meta.url));
      await writeFile(path.join(root, '.gitignore'), ignore);
      const excludes = path.join(root, 'empty-excludes');
      await writeFile(excludes, '');
      execFileSync('git', ['init', '--quiet', '--template=', root]);
      const result = spawnSync(
        'git',
        [
          '-c',
          `core.excludesFile=${excludes}`,
          'check-ignore',
          '--no-index',
          '--stdin'
        ],
        {
          cwd: root,
          input: [...protectedPaths, ...safePaths].join('\n') + '\n',
          encoding: 'utf8'
        }
      );
      expect(result.error).toBeUndefined();
      expect([0, 1]).toContain(result.status);
      const ignored = new Set(result.stdout.split(/\r?\n/u).filter(Boolean));
      for (const name of protectedPaths) expect(ignored.has(name)).toBe(true);
      for (const name of safePaths) expect(ignored.has(name)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(protectedPaths)('blocks forced-tracked %s', (name) => {
    expect(inspectPath(name)).toBe(`${name}: credential-like file path`);
    const result = scanTrackedFiles({
      tracked: [name],
      readSource: () => ''
    });
    expect(result.findings).toEqual([`${name}: credential-like file path`]);
  });

  it.each(safePaths)('preserves safe source/config fixture %s', (name) => {
    expect(inspectPath(name)).toBeNull();
  });
});
