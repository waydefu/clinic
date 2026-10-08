import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertEffectiveAptBounds,
  prioritizeUbuntuMirrors
} from './prepare-ci-apt.mjs';

const imageMirrors = [
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1',
  'https://archive.ubuntu.com/ubuntu/\tpriority:2',
  'https://security.ubuntu.com/ubuntu/\tpriority:3',
  ''
].join('\n');

describe('CI Ubuntu mirror preparation', () => {
  it('promotes the existing HTTPS archives over the repeatedly stalled mirror', () => {
    const ranked = prioritizeUbuntuMirrors(imageMirrors)
      .trim()
      .split('\n')
      .map((line) => line.split(/\s+priority:/))
      .sort((a, b) => Number(a[1]) - Number(b[1]));
    expect(ranked.map(([url]) => url)).toEqual([
      'https://archive.ubuntu.com/ubuntu/',
      'https://security.ubuntu.com/ubuntu/',
      'http://azure.archive.ubuntu.com/ubuntu/'
    ]);
  });

  it('does not introduce repositories and is safe to apply twice', () => {
    const once = prioritizeUbuntuMirrors(imageMirrors);
    expect(prioritizeUbuntuMirrors(once)).toBe(once);
    expect(once.match(/https?:\/\/\S+/g)?.sort()).toEqual(
      imageMirrors.match(/https?:\/\/\S+/g)?.sort()
    );
  });

  it.each([
    '',
    'http://azure.archive.ubuntu.com/ubuntu/ priority:1\n',
    `${imageMirrors}https://unknown.invalid/ubuntu/ priority:4\n`,
    `${imageMirrors}https://archive.ubuntu.com/ubuntu/ priority:5\n`,
    imageMirrors.replace('priority:2', 'priority:wrong')
  ])(
    'fails before changing an unsupported or ambiguous mirror list',
    (input) => {
      expect(() => prioritizeUbuntuMirrors(input)).toThrow(/mirror list/);
    }
  );
});

describe('effective APT bounds', () => {
  const bounded = [
    'Acquire::Retries "1";',
    'Acquire::http::Timeout "15";',
    'Acquire::https::Timeout "15";'
  ].join('\n');

  it('accepts values from apt-config rather than trusting the file contents', () => {
    expect(() => assertEffectiveAptBounds(bounded)).not.toThrow();
  });

  it.each([
    bounded.replace('Acquire::Retries', 'APT::Acquire::Retries'),
    bounded.replace('Retries "1"', 'Retries "10"'),
    bounded.replace('http::Timeout "15"', 'http::Timeout "30"'),
    bounded.replace('Acquire::https::Timeout "15";', ''),
    `${bounded}\nAcquire::Retries "3";`
  ])(
    'rejects a wrong key, overridden value, missing value or ambiguity',
    (dump) => {
      expect(() => assertEffectiveAptBounds(dump)).toThrow(
        /APT acquire bounds/
      );
    }
  );

  it('refuses local CLI mutation outside GitHub Actions', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./prepare-ci-apt.mjs', import.meta.url))],
      { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false' } }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GitHub Actions');
  });

  it.skipIf(process.platform !== 'linux')(
    'checks the real APT parser namespace',
    () => {
      const fixture = mkdtempSync(path.join(tmpdir(), 'clinic-ci-apt-'));
      try {
        mkdirSync(path.join(fixture, 'parts'));
        writeFileSync(path.join(fixture, 'empty.conf'), '');
        const dump = (retriesKey) =>
          execFileSync(
            'apt-config',
            [
              '-o',
              `Dir::Etc::parts=${path.join(fixture, 'parts')}`,
              '-o',
              `Dir::Etc::main=${path.join(fixture, 'empty.conf')}`,
              '-o',
              `${retriesKey}=1`,
              '-o',
              'Acquire::http::Timeout=15',
              '-o',
              'Acquire::https::Timeout=15',
              'dump'
            ],
            { encoding: 'utf8' }
          );
        expect(() =>
          assertEffectiveAptBounds(dump('Acquire::Retries'))
        ).not.toThrow();
        expect(() =>
          assertEffectiveAptBounds(dump('APT::Acquire::Retries'))
        ).toThrow();
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    }
  );
});
