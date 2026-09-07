import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Playwright 各 worker 共用：分片檔名慣例與寫入。
//
// 同一支 spec 會分散到多個 worker 行程，各 worker 只能看到自己跑的測試，
// 因此測試只寫自己的分片（`web-<kind>-<sha>--<slug>.json`），完整性驗證交給
// CI 的 `scripts/merge-web-evidence.mjs`。不要在 spec 裡寫跨測試的 afterAll
// 斷言——那會因 worker 只看到局部資料而誤報缺件。

let cachedSha: string | undefined;

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function gitHeadSha(): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    shell: false
  });
  if (result.error !== undefined) {
    throw new Error(
      `evidence shard: git rev-parse failed: ${result.error.message}`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `evidence shard: git rev-parse exited ${String(result.status)}`
    );
  }
  const sha = result.stdout.trim();
  if (!SHA_PATTERN.test(sha)) {
    throw new Error('evidence shard: git rev-parse returned malformed SHA');
  }
  return sha;
}

export function evidenceHeadSha(): string {
  if (cachedSha === undefined) {
    const fromCi = process.env['GITHUB_SHA'];
    cachedSha = fromCi !== undefined && fromCi !== '' ? fromCi : gitHeadSha();
  }
  return cachedSha;
}

export function evidenceSlug(...parts: string[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 分片目錄：repo-root 的 `output/evidence/shards/`，與
 * `scripts/merge-web-evidence.mjs` 的讀取端一致。
 *
 * `fromSupportDir` 預設是本檔所在的 `tests/e2e/support`（Playwright 轉 CommonJS
 * 執行時 `__dirname` 可用）；匯出參數是為了讓回歸測試在不依賴 `__dirname`
 * 的環境下也能證明寫入端與讀取端同目錄。
 */
export function resolveShardDir(fromSupportDir: string = __dirname): string {
  return join(fromSupportDir, '..', '..', '..', 'output', 'evidence', 'shards');
}

export function writeEvidenceShard(
  kind: 'web-performance' | 'web-accessibility',
  slug: string,
  payload: unknown
): void {
  const sha = evidenceHeadSha();
  const dir = resolveShardDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${kind}-${sha}--${slug}.json`),
    `${JSON.stringify(payload, null, 2)}\n`
  );
}
