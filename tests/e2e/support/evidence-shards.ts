import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Playwright 各 worker 共用：分片檔名慣例與寫入。
//
// 同一支 spec 會分散到多個 worker 行程，各 worker 只能看到自己跑的測試，
// 因此測試只寫自己的分片（`web-<kind>-<sha>--<slug>.json`），完整性驗證交給
// CI 的 `scripts/merge-web-evidence.mjs`。不要在 spec 裡寫跨測試的 afterAll
// 斷言——那會因 worker 只看到局部資料而誤報缺件。

let cachedSha: string | undefined;

export function evidenceHeadSha(): string {
  if (cachedSha === undefined) {
    const fromCi = process.env['GITHUB_SHA'];
    cachedSha =
      fromCi !== undefined && fromCi !== ''
        ? fromCi
        : execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
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

export function writeEvidenceShard(
  kind: 'web-performance' | 'web-accessibility',
  slug: string,
  payload: unknown
): void {
  const sha = evidenceHeadSha();
  const dir = join(__dirname, '..', '..', 'output', 'evidence', 'shards');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${kind}-${sha}--${slug}.json`),
    `${JSON.stringify(payload, null, 2)}\n`
  );
}
