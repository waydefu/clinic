import { describe, expect, it } from 'vitest';
import {
  hasPrivateKeyMaterial,
  inspectPath,
  isAllowedExamplePath,
  renderPassLine,
  scanTrackedFiles
} from './check-tracked-secrets.mjs';

function scan(files) {
  const sources = new Map(files);
  return scanTrackedFiles({
    tracked: [...sources.keys()],
    readSource: (filePath) => sources.get(filePath) ?? null
  });
}

function pem(bodyLength) {
  return [
    '-----BEGIN PRIVATE KEY-----',
    'A'.repeat(bodyLength),
    '-----END PRIVATE KEY-----'
  ].join('\n');
}

describe('credential-like paths', () => {
  it.each([
    '.env',
    '.env.production',
    'config/.env.local',
    'certs/server.key',
    'certs/server.pem',
    'certs/bundle.p12',
    'certs/bundle.pfx',
    'infra/service-account.json',
    'infra/service_account.json',
    'infra/gcp-credentials.json',
    'infra/app-secret.json'
  ])('rejects %s', (filePath) => {
    expect(inspectPath(filePath)).toBe(
      `${filePath}: credential-like file path`
    );
  });

  it.each([
    '.env.example',
    'docs/.env.example',
    'apps/web/server.mjs',
    'security/audit-exceptions.json',
    'package.json'
  ])('allows %s', (filePath) => {
    expect(inspectPath(filePath)).toBeNull();
  });

  it('treats .env.example as documentation, not a credential', () => {
    expect(isAllowedExamplePath('.env.example')).toBe(true);
    expect(isAllowedExamplePath('.env')).toBe(false);
  });
});

describe('private key material', () => {
  it('flags a key long enough to be real', () => {
    expect(hasPrivateKeyMaterial(pem(300))).toBe(true);
  });

  // 文件與測試 fixture 需要放得下短的假金鑰，否則作者會改成不寫測試。
  it('ignores a short placeholder', () => {
    expect(hasPrivateKeyMaterial(pem(20))).toBe(false);
  });

  it.each(['RSA ', 'EC ', 'DSA ', 'OPENSSH ', 'ENCRYPTED ', ''])(
    'recognises the %s key header variant',
    (variant) => {
      const text = [
        `-----BEGIN ${variant}PRIVATE KEY-----`,
        'B'.repeat(300),
        `-----END ${variant}PRIVATE KEY-----`
      ].join('\n');
      expect(hasPrivateKeyMaterial(text)).toBe(true);
    }
  );

  it('ignores prose that merely mentions a private key', () => {
    expect(
      hasPrivateKeyMaterial('Never commit a PRIVATE KEY to this repository.')
    ).toBe(false);
  });
});

describe('token patterns', () => {
  it.each([
    ['AWS access key', `AKIA${'A'.repeat(16)}`],
    ['Google API key', `AIza${'a'.repeat(35)}`],
    ['GitHub token', `ghp_${'a'.repeat(30)}`],
    ['Slack token', `xoxb-${'a'.repeat(20)}`]
  ])('detects a %s', (label, token) => {
    const result = scan([['apps/web/app.js', `const t = "${token}";`]]);
    expect(result.findings).toEqual([`apps/web/app.js: ${label}`]);
  });

  // 這些 pattern 帶 /g，會保留 lastIndex。忘了歸零時，第二個檔案會被漏掉。
  it('detects the same token in consecutive files', () => {
    const token = `AKIA${'A'.repeat(16)}`;
    const result = scan([
      ['a.js', token],
      ['b.js', token]
    ]);

    expect(result.findings).toEqual([
      'a.js: AWS access key',
      'b.js: AWS access key'
    ]);
  });

  it('passes a clean file', () => {
    const result = scan([['apps/web/app.js', 'const greeting = "hello";']]);
    expect(result.findings).toEqual([]);
  });
});

describe('working-tree deletions', () => {
  // 這正是這支腳本曾經整個崩潰的情境：`git ls-files` 讀 index，會列出已刪除的
  // 檔案，直接讀就 ENOENT，把本機刪檔誤報成掃描失敗。
  it('skips a tracked file that no longer exists instead of failing', () => {
    const result = scanTrackedFiles({
      tracked: ['kept.js', 'removed.js'],
      readSource: (filePath) => (filePath === 'kept.js' ? 'const a = 1;' : null)
    });

    expect(result.findings).toEqual([]);
    expect(result.deletedInWorktree).toEqual(['removed.js']);
    expect(result.scanned).toBe(1);
  });

  it('names the skipped files so they are never silently unscanned', () => {
    expect(
      renderPassLine({ scanned: 5, deletedInWorktree: ['a.yml', 'b.mjs'] })
    ).toBe(
      'Tracked-secret check passed (5 tracked files，跳過 2 個工作區已刪除的檔案（a.yml、b.mjs）).'
    );
  });

  it('says nothing about skipping when the tree is clean', () => {
    expect(renderPassLine({ scanned: 5, deletedInWorktree: [] })).toBe(
      'Tracked-secret check passed (5 tracked files).'
    );
  });

  it('still reports a credential path even when other files were deleted', () => {
    const result = scanTrackedFiles({
      tracked: ['gone.js', 'infra/service-account.json'],
      readSource: (filePath) => (filePath === 'gone.js' ? null : '{}')
    });

    expect(result.findings).toEqual([
      'infra/service-account.json: credential-like file path'
    ]);
  });
});
