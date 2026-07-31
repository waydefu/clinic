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
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

// 只解析 `auditConfig.ignoreGhsas` 這一段的清單項目。刻意不引入 YAML 解析器：
// 這裡要讀的結構固定且極小，而多一個相依就多一個供應鏈風險——在一支專門用來
// 管理供應鏈例外的腳本裡尤其不划算。
export function parseIgnoredAdvisories(workspaceYaml) {
  const lines = workspaceYaml.split(/\r?\n/u);
  const ignored = [];
  let inAuditConfig = false;
  let inIgnoreList = false;

  for (const line of lines) {
    if (/^\S/u.test(line)) inAuditConfig = /^auditConfig\s*:/u.test(line);
    if (!inAuditConfig) {
      inIgnoreList = false;
      continue;
    }
    if (/^\s{2}ignoreGhsas\s*:/u.test(line)) {
      inIgnoreList = true;
      continue;
    }
    if (inIgnoreList) {
      const item = /^\s{4}-\s*(\S+)\s*$/u.exec(line);
      if (item === null) {
        if (line.trim().length > 0) inIgnoreList = false;
        continue;
      }
      ignored.push(item[1].replace(/^['"]|['"]$/gu, ''));
    }
  }

  return ignored;
}

export function reviewAuditExceptions({ ignored, registry, today }) {
  const problems = [];
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

  for (const ghsa of ignored) {
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

    if (!DATE_PATTERN.test(String(entry.expiresOn ?? ''))) {
      problems.push(`${ghsa}: expiresOn 必須是 YYYY-MM-DD`);
    } else if (entry.expiresOn < today) {
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
      !DATE_PATTERN.test(String(entry.approvedOn ?? ''))
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
    today: new Date().toISOString().slice(0, 10)
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
