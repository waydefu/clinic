// 稽核例外治理閘門。
//
// `pnpm audit` 只會印出「1 high (1 ignored)」——被忽略的是哪一筆、誰批准的、什麼
// 時候到期，全部看不到。那讓任何人加一行 `ignoreGhsas` 就能讓高風險漏洞從 gate 上
// 消失，而且沒有人會發現。
//
// 這支腳本要求兩份清單雙向一致：`pnpm-workspace.yaml` 的 `auditConfig.ignoreGhsas`
// 與 `security/audit-exceptions.json`。任何未登記、欄位不全或已過期的例外都會擋下
// CI；每一筆例外都會逐條印出，包含核准狀態與到期日。
//
// 尚未核准的例外**不會**因此變綠又被忽略：它每一次執行都會被印成 pending，並且
// 仍受到期日約束。到期而未核准就轉為紅燈。
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const WORKSPACE_FILE = path.join(repositoryRoot, 'pnpm-workspace.yaml');
const REGISTRY_FILE = path.join(
  repositoryRoot,
  'security',
  'audit-exceptions.json'
);

const REQUIRED_FIELDS = [
  'ghsa',
  'package',
  'severity',
  'approvalId',
  'approvalStatus',
  'expiresOn',
  'scope',
  'reason',
  'releaseCondition'
];

const GHSA_PATTERN = /^GHSA(?:-[0-9a-z]{4}){3}$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const AUDIT_CONFIG_LINE = /^(auditConfig|'auditConfig'|"auditConfig")\s*:(.*)$/u;
const AUDIT_KEY_LINE = /^([A-Za-z0-9_-]+|'[^']+'|"[^"]+")\s*:(.*)$/u;
const UNSUPPORTED_SCALAR_SYNTAX = /^[\[{|>!&*]|[\s#[\]{},]/u;

function isValidCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

export function formatUtcDate(clock = new Date()) {
  const date = clock instanceof Date ? clock : new Date(clock);
  if (Number.isNaN(date.getTime())) throw new Error('無效的 UTC 時間');
  return date.toISOString().slice(0, 10);
}

function stripInlineComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/u.test(raw[i - 1]))) {
      return raw.slice(0, i).trimEnd();
    }
  }
  return raw.trimEnd();
}

function parseScalarToken(raw, lineNumber) {
  const trimmed = stripInlineComment(raw).trim();
  const prefix = `auditConfig.ignoreGhsas 第 ${lineNumber} 行`;
  if (trimmed.length === 0) throw new Error(`${prefix}缺少項目值`);
  const first = trimmed[0];
  if (first === "'" || first === '"') {
    if (trimmed.length < 2 || trimmed[trimmed.length - 1] !== first)
      throw new Error(`${prefix}不支援的引號格式`);
    const inner = trimmed.slice(1, -1);
    if (inner.includes(first) || inner.trim().length === 0)
      throw new Error(`${prefix}不支援的引號格式`);
    return inner;
  }
  if (UNSUPPORTED_SCALAR_SYNTAX.test(trimmed))
    throw new Error(`${prefix}不支援的 YAML 格式：${trimmed}`);
  return trimmed;
}

function unwrapOptionalQuotes(token) {
  if (
    token.length >= 2 &&
    ((token[0] === "'" && token[token.length - 1] === "'") ||
      (token[0] === '"' && token[token.length - 1] === '"'))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

// 只解析 `auditConfig.ignoreGhsas` 這一段的 block list，遇到任何不支援的 YAML
// 形狀（flow 清單、未知鍵、重複鍵、異常縮排、tab 或未閉合引號）一律 fail closed。
// 刻意不引入外部 YAML 解析器：多一個相依就多一個供應鏈風險。
export function parseIgnoredAdvisories(workspaceYaml) {
  if (typeof workspaceYaml !== 'string')
    throw new Error('pnpm-workspace.yaml 內容必須是字串');
  const lines = workspaceYaml.split(/\r?\n/u);
  const ignored = [];
  let inAuditConfig = false;
  let inIgnoreList = false;
  let seenAuditConfig = false;
  let seenIgnoreGhsas = false;
  let auditConfigLine = 0;
  let ignoreGhsasLine = 0;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNumber = idx + 1;
    const line = lines[idx];
    if (/^\s*$/u.test(line) || /^\s*#/u.test(line)) continue;

    if (!/^\s/u.test(line)) {
      const content = stripInlineComment(line);
      const topMatch = AUDIT_CONFIG_LINE.exec(content);
      if (topMatch !== null) {
        if (seenAuditConfig)
          throw new Error(
            `pnpm-workspace.yaml 第 ${lineNumber} 行出現重複的 auditConfig 區段`
          );
        if (topMatch[2].trim().length > 0)
          throw new Error(`auditConfig 第 ${lineNumber} 行不支援行內值或 flow 格式`);
        seenAuditConfig = true;
        inAuditConfig = true;
        inIgnoreList = false;
        auditConfigLine = lineNumber;
        continue;
      }
      inAuditConfig = false;
      inIgnoreList = false;
      continue;
    }

    if (!inAuditConfig) continue;

    const leadingMatch = /^[ \t]+/u.exec(line);
    const leading = leadingMatch === null ? '' : leadingMatch[0];
    if (leading.includes('\t'))
      throw new Error(`auditConfig 第 ${lineNumber} 行不支援 tab 縮排`);

    const indent = leading.length;
    const body = stripInlineComment(line.slice(indent)).trim();

    if (indent === 2) {
      if (body.startsWith('-'))
        throw new Error(`auditConfig 第 ${lineNumber} 行清單項目必須縮排 4 格`);
      const keyMatch = AUDIT_KEY_LINE.exec(body);
      if (keyMatch === null)
        throw new Error(`auditConfig 第 ${lineNumber} 行不支援的設定格式`);
      const key = unwrapOptionalQuotes(keyMatch[1]);
      if (key !== 'ignoreGhsas')
        throw new Error(`auditConfig 第 ${lineNumber} 行不支援未知鍵 ${key}`);
      if (seenIgnoreGhsas)
        throw new Error(`auditConfig 第 ${lineNumber} 行出現重複的 ignoreGhsas 鍵`);
      if (keyMatch[2].trim().length > 0)
        throw new Error(
          `auditConfig.ignoreGhsas 第 ${lineNumber} 行不支援行內值或 flow 清單`
        );
      seenIgnoreGhsas = true;
      inIgnoreList = true;
      ignoreGhsasLine = lineNumber;
      continue;
    }

    if (indent === 4 && inIgnoreList) {
      const prefix = `auditConfig.ignoreGhsas 第 ${lineNumber} 行`;
      const itemMatch = /^-(?:\s+(.*))?$/u.exec(body);
      if (itemMatch === null)
        throw new Error(`${prefix}不支援的清單項目格式`);
      const value = parseScalarToken(itemMatch[1] ?? '', lineNumber);
      if (ignored.includes(value))
        throw new Error(`${prefix}出現重複項目 ${value}`);
      ignored.push(value);
      continue;
    }

    throw new Error(`auditConfig 第 ${lineNumber} 行不支援的縮排（${indent} 格）`);
  }

  if (seenAuditConfig && !seenIgnoreGhsas)
    throw new Error(`auditConfig 第 ${auditConfigLine} 行缺少 ignoreGhsas 鍵`);
  if (seenIgnoreGhsas && ignored.length === 0)
    throw new Error(`auditConfig.ignoreGhsas 第 ${ignoreGhsasLine} 行不可為空`);

  return ignored;
}

export function reviewAuditExceptions({ ignored, registry, today, now }) {
  const problems = [];
  const resolvedToday =
    today === undefined && now !== undefined ? formatUtcDate(now) : today;
  const todayValid = isValidCalendarDate(String(resolvedToday ?? ''));
  if (!todayValid) problems.push('today 必須是有效的 YYYY-MM-DD UTC 日期');

  const entries = Array.isArray(registry?.exceptions)
    ? registry.exceptions
    : [];

  if (!Array.isArray(registry?.exceptions))
    problems.push('security/audit-exceptions.json 缺少 exceptions 陣列');

  const byGhsa = new Map();
  for (const entry of entries) {
    if (byGhsa.has(entry?.ghsa))
      problems.push(`${entry.ghsa}: 登記表出現重複條目`);
    byGhsa.set(entry?.ghsa, entry);
  }

  const seenIgnored = new Set();
  for (const ghsa of ignored) {
    if (seenIgnored.has(ghsa)) {
      problems.push(`${ghsa}: auditConfig.ignoreGhsas 出現重複項目`);
      continue;
    }
    seenIgnored.add(ghsa);

    const entry = byGhsa.get(ghsa);
    if (entry === undefined) {
      problems.push(
        `${ghsa}: 已在 auditConfig.ignoreGhsas 忽略，但沒有登記在 security/audit-exceptions.json`
      );
      continue;
    }

    for (const field of REQUIRED_FIELDS)
      if (
        entry[field] === undefined ||
        entry[field] === null ||
        String(entry[field]).trim().length === 0
      )
        problems.push(`${ghsa}: 缺少必填欄位 ${field}`);

    if (!GHSA_PATTERN.test(String(entry.ghsa ?? '')))
      problems.push(`${entry.ghsa}: GHSA 識別碼格式不正確`);

    if (!isValidCalendarDate(String(entry.expiresOn ?? ''))) {
      problems.push(`${ghsa}: expiresOn 必須是 YYYY-MM-DD`);
    } else if (todayValid && entry.expiresOn < resolvedToday) {
      problems.push(
        `${ghsa}: 例外已於 ${entry.expiresOn} 到期（核准編號 ${entry.approvalId}，狀態 ${entry.approvalStatus}）。重新核准並延期，或移除忽略設定並修補相依。`
      );
    }

    if (!['approved', 'pending'].includes(String(entry.approvalStatus)))
      problems.push(
        `${ghsa}: approvalStatus 只能是 approved 或 pending，目前是 ${entry.approvalStatus}`
      );

    if (
      entry.approvalStatus === 'approved' &&
      !isValidCalendarDate(String(entry.approvedOn ?? ''))
    )
      problems.push(`${ghsa}: 標示為 approved 就必須填入 approvedOn 日期`);
  }

  for (const entry of entries)
    if (!ignored.includes(entry?.ghsa))
      problems.push(
        `${entry?.ghsa}: 已登記為例外，但 auditConfig.ignoreGhsas 沒有對應項目。移除過時的登記，或補回忽略設定。`
      );

  return {
    ok: problems.length === 0,
    problems,
    reviewed: ignored.map((ghsa) => byGhsa.get(ghsa)).filter(Boolean)
  };
}

export function renderReviewLines(reviewed) {
  return reviewed.map(
    (entry) =>
      `- ${entry.ghsa}（${entry.package}，${entry.severity}）｜核准編號 ${entry.approvalId}｜狀態 ${entry.approvalStatus}｜到期 ${entry.expiresOn}｜範圍 ${entry.scope}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [workspaceYaml, registryRaw] = await Promise.all([
    readFile(WORKSPACE_FILE, 'utf8'),
    readFile(REGISTRY_FILE, 'utf8')
  ]);
  const ignored = parseIgnoredAdvisories(workspaceYaml);
  const review = reviewAuditExceptions({
    ignored,
    registry: JSON.parse(registryRaw),
    today: formatUtcDate()
  });

  if (ignored.length === 0) {
    console.log('Audit-exception check passed (沒有任何被忽略的 advisory).');
  } else {
    console.log(`稽核例外共 ${ignored.length} 筆，逐條列出：`);
    for (const line of renderReviewLines(review.reviewed)) console.log(line);
  }

  if (!review.ok) {
    console.error('Audit-exception check failed:');
    for (const problem of review.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    const pending = review.reviewed.filter(
      (entry) => entry.approvalStatus === 'pending'
    );
    if (pending.length > 0)
      console.log(
        `注意：${pending.length} 筆例外的具名核准尚未完成（${pending
          .map((entry) => entry.approvalId)
          .join('、')}）。綠燈代表已設定忽略，不代表風險已被接受。`
      );
    console.log('Audit-exception check passed (登記、核准編號與到期日皆完整).');
  }
}
