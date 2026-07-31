import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const forbiddenCredentialPath = [
  /(^|\/)\.env($|\.)/i,
  /\.(key|p12|pfx|pem)$/i,
  /(^|\/)[^/]*(credential|service[-_]?account|secret)[^/]*\.json$/i
];

const tokenPatterns = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g]
];

function isAllowedExamplePath(filePath) {
  return /(^|\/)\.env\.example$/i.test(filePath);
}

function hasPrivateKeyMaterial(content) {
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

const tracked = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8'
})
  .split('\0')
  .filter(Boolean);

// `git ls-files` 讀的是 index，會列出「已在版控、但工作區已刪除」的檔案。
// 掃描的對象是工作區內容，所以這些檔案沒有可掃的內容，直接讀會 ENOENT 讓
// 整個 gate 崩掉——那會把「工作區有刪檔」誤報成掃描失敗。這裡明確跳過並回報
// 數量，不靜默略過：跳過的檔案數必須看得見，才不會有人以為它們掃過了。
const deletedInWorktree = [];
const findings = [];
for (const filePath of tracked) {
  const normalizedPath = filePath.replaceAll(path.sep, '/');
  if (!existsSync(filePath)) {
    deletedInWorktree.push(normalizedPath);
    continue;
  }
  if (
    !isAllowedExamplePath(normalizedPath) &&
    forbiddenCredentialPath.some((pattern) => pattern.test(normalizedPath))
  ) {
    findings.push(`${normalizedPath}: credential-like file path`);
    continue;
  }

  const content = await readFile(filePath, 'utf8');
  if (hasPrivateKeyMaterial(content)) {
    findings.push(`${normalizedPath}: private key material`);
  }
  for (const [label, pattern] of tokenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${normalizedPath}: ${label}`);
  }
}

if (findings.length > 0) {
  console.error('Tracked-secret check failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  const scanned = tracked.length - deletedInWorktree.length;
  const skipped =
    deletedInWorktree.length > 0
      ? `，跳過 ${deletedInWorktree.length} 個工作區已刪除的檔案（${deletedInWorktree.join('、')}）`
      : '';
  console.log(
    `Tracked-secret check passed (${scanned} tracked files${skipped}).`
  );
}
