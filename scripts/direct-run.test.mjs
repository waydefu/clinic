import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { isDirectRun } from './direct-run.mjs';

const base = mkdtempSync(join(tmpdir(), 'direct-run-'));
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('isDirectRun', () => {
  const script = resolve(base, 'a folder', '診所 check.mjs');
  const url = pathToFileURL(script).href;

  it('matches the script Node was started with, whatever its path looks like', () => {
    expect(isDirectRun(url, script)).toBe(true);
    // The old comparison, `file://${argv[1]}`, is false for this path on every
    // host (spaces and non-ASCII need URL escaping; Windows also has "C:\").
    expect(url === `file://${script}`).toBe(false);
  });

  it('resolves a relative argv[1] against the working directory', () => {
    const relative = join('scripts', 'direct-run.mjs');
    expect(isDirectRun(pathToFileURL(resolve(relative)).href, relative)).toBe(
      true
    );
  });

  it('is false for another module, a missing argv[1] and an empty one', () => {
    expect(isDirectRun(url, resolve(base, 'other.mjs'))).toBe(false);
    expect(isDirectRun(url, undefined)).toBe(false);
    expect(isDirectRun(url, '')).toBe(false);
  });

  it('runs the main block only when started directly (real node process)', () => {
    const folder = join(base, 'run folder 診所');
    mkdirSync(folder);
    const helper = new URL('./direct-run.mjs', import.meta.url).href;
    const main = join(folder, 'main.mjs');
    writeFileSync(
      main,
      [
        `import { isDirectRun } from '${helper}';`,
        "export const loaded = 'loaded';",
        "if (isDirectRun(import.meta.url)) console.log('direct');"
      ].join('\n')
    );
    const importer = join(folder, 'importer.mjs');
    writeFileSync(
      importer,
      `import { loaded } from '${pathToFileURL(main).href}'; console.log(loaded);`
    );
    const run = (file) =>
      execFileSync(process.execPath, [file], { encoding: 'utf8' }).trim();
    expect(run(main)).toBe('direct');
    expect(run(importer)).toBe('loaded');
  });
});
