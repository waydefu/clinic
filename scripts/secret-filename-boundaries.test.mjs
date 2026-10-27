import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const gitignore = readFileSync(new URL('.gitignore', root), 'utf8');
const cloud = readFileSync(new URL('.gcloudignore', root), 'utf8');
const policy = JSON.parse(
  readFileSync(new URL('.claude/settings.json', root), 'utf8')
);
const roots = [];
afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const extensions = [
  'pem',
  'key',
  'p12',
  'pfx',
  'crt',
  'cer',
  'der',
  'jks',
  'keystore'
];
const filenames = [
  '.env',
  '.env.production',
  'secrets/non-secret.fixture.txt',
  'cal-pilot-keys/non-secret.fixture.txt',
  ...extensions.map((extension) => `synthetic.${extension}`)
];

describe('filename boundaries without reading any credential content', () => {
  it('uses real Git ignore semantics for root/nested fixtures and public examples', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'synthetic-ignore-'));
    roots.push(directory);
    expect(spawnSync('git', ['init', '--quiet', directory]).status).toBe(0);
    writeFileSync(path.join(directory, '.gitignore'), gitignore);
    for (const filename of filenames) {
      for (const prefix of ['', 'nested/deeper/']) {
        const result = spawnSync(
          'git',
          [
            '-c',
            'core.excludesFile=',
            'check-ignore',
            '--no-index',
            '--quiet',
            '--',
            prefix + filename
          ],
          { cwd: directory }
        );
        expect(result.status, prefix + filename).toBe(0);
      }
    }
    for (const filename of [
      '.env.example',
      'nested/.env.example',
      'nested/public.txt'
    ]) {
      expect(
        spawnSync(
          'git',
          [
            '-c',
            'core.excludesFile=',
            'check-ignore',
            '--no-index',
            '--quiet',
            '--',
            filename
          ],
          { cwd: directory }
        ).status
      ).toBe(1);
    }
  });

  it('does not exclude harmless directory fixtures when repository rules are absent', () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), 'synthetic-ignore-control-')
    );
    roots.push(directory);
    expect(spawnSync('git', ['init', '--quiet', directory]).status).toBe(0);
    writeFileSync(path.join(directory, '.gitignore'), '');
    for (const filename of [
      'secrets/non-secret.fixture.txt',
      'cal-pilot-keys/non-secret.fixture.txt'
    ]) {
      for (const prefix of ['', 'nested/deeper/']) {
        const result = spawnSync(
          'git',
          [
            '-c',
            'core.excludesFile=',
            'check-ignore',
            '--no-index',
            '--quiet',
            '--',
            prefix + filename
          ],
          { cwd: directory }
        );
        expect(result.status, prefix + filename).toBe(1);
      }
    }
  });

  it('declares cloud-upload root and nested exclusions (not a gcloud runtime proof)', () => {
    const lines = cloud.split(/\r?\n/);
    for (const extension of extensions)
      expect(lines).toContain(`**/*.${extension}`);
    for (const entry of [
      '.env',
      '.env.*',
      '**/.env',
      '**/.env.*',
      '**/secrets/**',
      '**/*credential*.json',
      '**/*service-account*.json',
      '**/*service_account*.json'
    ]) {
      expect(lines).toContain(entry);
    }
    expect(lines).not.toContain('!**/.env.example');
  });

  it('declares Read/Edit/Write denies for all file kinds (not agent-engine proof)', () => {
    const patterns = [
      '**/.env*',
      '**/secrets/**',
      '**/service-account*.json',
      '**/service_account*.json',
      '**/*credential*.json',
      ...extensions.map((extension) => `**/*.${extension}`)
    ];
    for (const operation of ['Read', 'Edit', 'Write']) {
      for (const pattern of patterns)
        expect(policy.permissions.deny).toContain(`${operation}(${pattern})`);
    }
    // Strengthening file denies must not switch off pre-existing hooks or asks.
    expect(policy.permissions.ask).toContain('Bash(pnpm install*)');
    expect(policy.hooks.PreToolUse[0].hooks[0].args).toContain(
      '${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-commands.mjs'
    );
  });
});
