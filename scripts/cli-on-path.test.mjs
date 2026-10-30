import { basename, dirname, extname } from 'node:path';
import { describe, expect, it } from 'vitest';

import { hasCli, terraformCliStatus } from './cli-on-path.mjs';

// E2-04: PATH was split on ':' and only X_OK was checked, so on Windows
// ("C:/tools;D:/bin", gcloud.cmd) no CLI was ever found. PATH, the platform and
// the file system are all fake here, so both rules are proved on any host.
const EXECUTABLES = new Set([
  'bin one/gcloud',
  'C:/tools/terraform.CMD',
  'C:/tools/firebase.exe',
  'C:/tools/bare'
]);
const access = (path) => {
  if (!EXECUTABLES.has(path.replaceAll('\\', '/'))) throw new Error('ENOENT');
};

describe('PATH scan on a POSIX-style platform', () => {
  const posix = (PATH) => ({ env: { PATH }, platform: 'linux', access });

  it('splits on ":" and finds a command in a later directory', () => {
    expect(hasCli('gcloud', posix('missing:bin one'))).toBe(true);
  });

  it('does not treat ";" as a delimiter or add extensions', () => {
    expect(hasCli('gcloud', posix('missing;bin one'))).toBe(false);
    expect(hasCli('terraform', posix('C:/tools'))).toBe(false);
  });

  it('reports a missing command and an empty PATH as absent', () => {
    expect(hasCli('nothing-here', posix('missing:bin one'))).toBe(false);
    expect(hasCli('gcloud', { env: {}, platform: 'linux', access })).toBe(
      false
    );
  });
});

describe('PATH scan on win32', () => {
  const win32 = (PATH, env = {}) => ({
    env: { PATH, PATHEXT: '.EXE;.CMD', ...env },
    platform: 'win32',
    access
  });

  it('splits on ";" so a drive-letter directory survives', () => {
    expect(hasCli('terraform', win32('D:/bin;C:/tools'))).toBe(true);
    expect(hasCli('terraform', win32('D:/bin:C:/tools'))).toBe(false);
  });

  it('appends each PATHEXT extension, in either case', () => {
    expect(hasCli('terraform', win32('C:/tools'))).toBe(true);
    expect(hasCli('firebase', win32('C:/tools'))).toBe(true);
  });

  it('does not accept a bare name without a PATHEXT extension', () => {
    expect(hasCli('bare', win32('C:/tools'))).toBe(false);
    expect(hasCli('gcloud', win32('bin one'))).toBe(false);
  });

  it('falls back to the default PATHEXT and to a "Path" variable', () => {
    expect(
      hasCli('firebase', {
        env: { Path: 'C:/tools' },
        platform: 'win32',
        access
      })
    ).toBe(true);
  });
});

describe('terraformCliStatus', () => {
  it('reports the three CLIs from the same fake PATH', () => {
    expect(
      terraformCliStatus({
        env: { PATH: 'bin one;C:/tools', PATHEXT: '.EXE;.CMD' },
        platform: 'win32',
        access
      })
    ).toEqual({ gcloud: false, terraform: true, firebase: true });
    expect(
      terraformCliStatus({
        env: { PATH: 'bin one' },
        platform: 'linux',
        access
      })
    ).toEqual({ gcloud: true, terraform: false, firebase: false });
  });
});

describe('default file-system probe', () => {
  it('finds the running node binary and not a made-up name', () => {
    const env = {
      PATH: dirname(process.execPath),
      PATHEXT: process.env.PATHEXT
    };
    const node = basename(process.execPath, extname(process.execPath));
    expect(hasCli(node, { env, platform: process.platform })).toBe(true);
    expect(
      hasCli('definitely-not-a-real-cli-name', {
        env,
        platform: process.platform
      })
    ).toBe(false);
  });
});
