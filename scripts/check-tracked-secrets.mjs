import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 這支腳本決定「版控裡有沒有混進密鑰」，是 `check:supply-chain` 的第一道。
// 判斷邏輯全部匯出且不碰檔案系統，因為它自己曾經在髒工作區崩潰，把「有人刪了
// 檔案」誤報成「掃描失敗」——一個會假紅燈的 gate，最後會被當成雜訊繞過。

export const forbiddenCredentialPath = [
  /(^|\/)\.env($|\.)/i,
  /\.(key|p12|pfx|pem)$/i,
  /(^|\/)[^/]*(credential|service[-_]?account|secret)[^/]*\.json$/i
];

export const tokenPatterns = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g]
];

export function isAllowedExamplePath(filePath) {
  return /(^|\/)\.env\.example$/i.test(filePath);
}

export function hasPrivateKeyMaterial(content) {
  const blocks = content.matchAll(
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g
  );
  for (const block of blocks) {
    const encodedBody = (block[1] ?? '').replace(/[^A-Za-z0-9+/=]/g, '');
    // Short fake fixtures and documentation placeholders stay testable;
    // real PEM keys are substantially longer.
    if (encodedBody.length >= 256) return true;
  }
  return false;
}

export function inspectPath(normalizedPath) {
  if (
    !isAllowedExamplePath(normalizedPath) &&
    forbiddenCredentialPath.some((pattern) => pattern.test(normalizedPath))
  )
    return `${normalizedPath}: credential-like file path`;
  return null;
}

export function inspectContent(normalizedPath, content) {
  const findings = [];
  if (hasPrivateKeyMaterial(content))
    findings.push(`${normalizedPath}: private key material`);
  for (const [label, pattern] of tokenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${normalizedPath}: ${label}`);
  }
  return findings;
}

/**
 * @param tracked Repository-relative paths from `git ls-files`.
 * @param readSource (path) => string | null. Returning null means the file is
 *   tracked but absent from the working tree, which is a deletion that has not
 *   been committed yet — not a scan failure.
 */
export function scanTrackedFiles({ tracked, readSource }) {
  const findings = [];
  const deletedInWorktree = [];

  for (const filePath of tracked) {
    const normalizedPath = filePath.replaceAll(path.sep, '/');
    const source = readSource(filePath);
    if (source === null) {
      deletedInWorktree.push(normalizedPath);
      continue;
    }

    const pathFinding = inspectPath(normalizedPath);
    if (pathFinding !== null) {
      findings.push(pathFinding);
      continue;
    }

    findings.push(...inspectContent(normalizedPath, source));
  }

  return {
    findings,
    deletedInWorktree,
    scanned: tracked.length - deletedInWorktree.length
  };
}

export function renderPassLine({ scanned, deletedInWorktree }) {
  const skipped =
    deletedInWorktree.length > 0
      ? `，跳過 ${deletedInWorktree.length} 個工作區已刪除的檔案（${deletedInWorktree.join('、')}）`
      : '';
  return `Tracked-secret check passed (${scanned} tracked files${skipped}).`;
}

async function main() {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8'
  })
    .split('\0')
    .filter(Boolean);

  const sources = new Map(
    await Promise.all(
      tracked.map(async (filePath) => [
        filePath,
        existsSync(filePath) ? await readFile(filePath, 'utf8') : null
      ])
    )
  );

  const result = scanTrackedFiles({
    tracked,
    readSource: (filePath) => sources.get(filePath) ?? null
  });

  if (result.findings.length > 0) {
    console.error('Tracked-secret check failed:');
    for (const finding of result.findings) console.error(`- ${finding}`);
    process.exitCode = 1;
  } else {
    console.log(renderPassLine(result));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
