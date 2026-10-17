import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ calls: [], deny: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  const tracked =
    (name) =>
    async (...args) => {
      io.calls.push(name);
      if (io.deny) {
        throw Object.assign(new Error('Synthetic inaccessible project input'), {
          code: 'ENOENT'
        });
      }
      return actual[name](...args);
    };
  return {
    ...actual,
    access: tracked('access'),
    readFile: tracked('readFile'),
    readdir: tracked('readdir')
  };
});

const root = fileURLToPath(new URL('../', import.meta.url));
const gatePath = fileURLToPath(
  new URL('./check-structure.mjs', import.meta.url)
);
let savedExitCode;
beforeEach(() => {
  savedExitCode = process.exitCode;
  io.calls = [];
  io.deny = false;
  vi.resetModules();
});
afterEach(() => {
  process.exitCode = savedExitCode;
  io.deny = false;
  vi.restoreAllMocks();
});

describe('structure gate module and container coverage', () => {
  it('imports helpers without project I/O, output or exit-code changes', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = process.exitCode;
    const module = await import('./check-structure.mjs');
    expect(module.requiredPaths.length).toBeGreaterThan(0);
    expect(
      module.findMissingPaths({ paths: ['synthetic'], isReadable: () => false })
    ).toEqual(['synthetic']);
    expect(io.calls).toEqual([]);
    expect(process.exitCode).toBe(before);
    expect(output).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('can import even when project input would be unreadable', async () => {
    io.deny = true;
    process.exitCode = 63;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const module = await import('./check-structure.mjs');
    expect(typeof module.reviewVerifyOrdering).toBe('function');
    expect(io.calls).toEqual([]);
    expect(process.exitCode).toBe(63);
  });

  it('covers the non-empty actual supported container Dockerfile inventory', async () => {
    const module = await import('./check-structure.mjs');
    const dockerfiles = (await readdir(join(root, 'containers')))
      .filter((file) => /(?:^Dockerfile(?:\..+)?$|\.Dockerfile$)/.test(file))
      .map((file) => `containers/${file}`)
      .sort();
    expect(dockerfiles.length).toBeGreaterThan(0);
    expect(dockerfiles).toContain('containers/api.Dockerfile');
    expect(dockerfiles).toContain('containers/worker.Dockerfile');
    expect(dockerfiles).toContain('containers/internal-test-outbox.Dockerfile');
    expect(
      dockerfiles.filter((file) => !module.requiredPaths.includes(file))
    ).toEqual([]);
    expect(module.requiredPaths).toContain(
      'scripts/check-structure-cli.test.mjs'
    );
  });

  it('still runs the trusted CLI and names missing Dockerfiles in a synthetic empty cwd', () => {
    // Hermes supplies its scratch path; standalone CI uses the platform test temp directory.
    const fixture = mkdtempSync(
      join(process.env.TMPDIR ?? tmpdir(), 'structure-empty-cli-')
    );
    try {
      const result = spawnSync(process.execPath, [gatePath], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 20000,
        windowsHide: true
      });
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.status).not.toBeNull();
      expect(result.stderr).toContain('Missing required project files:');
      for (const file of [
        'containers/api.Dockerfile',
        'containers/worker.Dockerfile',
        'containers/internal-test-outbox.Dockerfile'
      ]) {
        expect(result.stderr).toContain(`- ${file}`);
      }
      expect(result.stdout).not.toContain('Structure check passed');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
