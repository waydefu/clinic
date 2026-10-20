import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  rmSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { inspectPath, scanRepository } from './check-tracked-secrets.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'synthetic-tracked-root-'));
  roots.push(root);
  mkdirSync(path.join(root, 'nested'));
  execFileSync('git', ['init', '--quiet', root]);
  for (const name of [
    'root.txt',
    'nested/child.txt',
    'removed.txt',
    '.env.fixture'
  ]) {
    writeFileSync(path.join(root, name), 'non-secret fixture text\n');
  }
  execFileSync(
    'git',
    [
      'add',
      '--',
      'root.txt',
      'nested/child.txt',
      'removed.txt',
      '.env.fixture'
    ],
    { cwd: root }
  );
  unlinkSync(path.join(root, 'removed.txt'));
  // Classify this filename without trying readFile on a directory (EISDIR).
  unlinkSync(path.join(root, '.env.fixture'));
  mkdirSync(path.join(root, '.env.fixture'));
  // An unreadable-as-file untracked path must never enter the scanner at all.
  mkdirSync(path.join(root, 'untracked.txt'));
  return root;
}

describe('tracked scanner native root boundary (only non-secret fixtures)', () => {
  it('returns the same full-root findings/counts from root and a nested cwd', async () => {
    const root = repository();
    const fromRoot = await scanRepository({ cwd: root });
    const fromNested = await scanRepository({ cwd: path.join(root, 'nested') });
    expect(fromNested).toEqual(fromRoot);
    expect(fromRoot.findings).toEqual([
      '.env.fixture: credential-like file path'
    ]);
    expect(fromRoot.deletedInWorktree).toEqual(['removed.txt']);
    expect(fromRoot.scanned).toBe(3);
  });

  it.each(['key', 'pem', 'p12', 'pfx', 'crt', 'cer', 'der', 'jks', 'keystore'])(
    'classifies nested %s paths without opening actual files',
    (extension) => {
      expect(inspectPath(`nested/synthetic.${extension}`)).not.toBeNull();
    }
  );

  it('keeps the explicit public Git example exception', () => {
    expect(inspectPath('nested/.env.example')).toBeNull();
    expect(inspectPath('nested/.env.production')).not.toBeNull();
  });
});
