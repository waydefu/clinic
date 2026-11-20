// 開發依賴高風險漏洞把關腳本（audit:all）。
//
// 為什麼不直接用 `pnpm audit --audit-level high`：
// 1. 正式出貨依賴由 `audit:prod`（`--prod --audit-level moderate`）嚴格把關；
//    本腳本即使單獨執行，也會額外對照 `--prod --audit-level high`，正式依賴只要有
//    high/critical 一律照擋，絕不因上游未出修補版而降級為警告。
// 2. 開發工具鏈（dev-only）的 high/critical 漏洞，如果上游根本還沒發布修補版
//    （例如 `patched_versions` 為 `<0.0.0`，或宣告了 `>=4.0.8` 但 npm registry 最高
//    只發到 `4.0.7`），直接擋下會把全體 PR 的 CI 卡死、逼人濫用 ignore。
// 3. 因此改採區分策略：
//    - 正式相依 high/critical → 一律擋（exit 1）
//    - 開發依賴 high/critical 且上游「已有」已發布修補版 → 照擋（exit 1），逼升級
//    - 開發依賴 high/critical 且上游「尚無」已發布修補版 → 不擋（exit 0），但印出
//      醒目警告清單（GHSA、套件、嚴重度、受影響路徑、patched_versions），不得靜默
//    - 查詢 npm registry 失敗、range 無法解析、或 `pnpm audit` 工具本身執行失敗 →
//      一律 fail-closed（exit 1），絕不製造假綠燈
//
// 三種工作區狀態行為（CONTRIBUTING.md #8）：
// - 乾淨工作區：透過 `pnpm audit` 讀取 `pnpm-lock.yaml` 並依上述規則判定。
// - 含刪除檔案的髒工作區：本腳本不掃描其他追蹤檔案，刪除無關檔案不會導致崩潰；
//   若 `pnpm-lock.yaml` 缺失導致 `pnpm audit` 失敗，會優雅回傳非 0（fail-closed）。
// - 全新 clone（尚未安裝 `node_modules`）：僅使用 Node.js 內建模組與 `fetch`，不依賴
//   任何第三方 npm 套件，可直接執行。
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);
const NO_PATCH_MARKERS = new Set([
  '<0.0.0',
  'none',
  'n/a',
  '-',
  'null',
  'undefined',
  'no'
]);
const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';
const DEFAULT_REGISTRY_TIMEOUT_MS = 15_000;

const SEMVER_PATTERN =
  /^[v=]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;
const PARTIAL_VERSION_PATTERN =
  /^[v=]?(\d+|x|X|\*)(?:\.(\d+|x|X|\*)(?:\.(\d+|x|X|\*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?)?)?$/u;

function parsePrerelease(raw) {
  if (raw === undefined) return [];
  const parts = raw.split('.');
  const parsed = [];
  for (const part of parts) {
    if (part.length === 0) return null;
    if (/^\d+$/u.test(part)) {
      if (part.length > 1 && part.startsWith('0')) return null;
      parsed.push(Number(part));
    } else if (/^[0-9A-Za-z-]+$/u.test(part)) {
      parsed.push(part);
    } else {
      return null;
    }
  }
  return parsed;
}

export function parseSemver(raw) {
  if (typeof raw !== 'string') return null;
  const match = SEMVER_PATTERN.exec(raw.trim());
  if (match === null) return null;
  const prerelease = parsePrerelease(match[4]);
  if (prerelease === null) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease
  };
}

export function compareSemver(a, b) {
  const left = typeof a === 'string' ? parseSemver(a) : a;
  const right = typeof b === 'string' ? parseSemver(b) : b;
  if (left === null || right === null) {
    throw new RangeError('Cannot compare invalid semver values');
  }
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;

  const leftPre = left.prerelease;
  const rightPre = right.prerelease;
  if (leftPre.length === 0 && rightPre.length === 0) return 0;
  if (leftPre.length === 0) return 1;
  if (rightPre.length === 0) return -1;

  const limit = Math.min(leftPre.length, rightPre.length);
  for (let i = 0; i < limit; i += 1) {
    const l = leftPre[i];
    const r = rightPre[i];
    if (l === r) continue;
    const lNum = typeof l === 'number';
    const rNum = typeof r === 'number';
    if (lNum && !rNum) return -1;
    if (!lNum && rNum) return 1;
    return l < r ? -1 : 1;
  }
  if (leftPre.length === rightPre.length) return 0;
  return leftPre.length < rightPre.length ? -1 : 1;
}

function isWildcard(segment) {
  return (
    segment === undefined ||
    segment === 'x' ||
    segment === 'X' ||
    segment === '*'
  );
}

function parsePartialVersion(raw) {
  const match = PARTIAL_VERSION_PATTERN.exec(raw.trim());
  if (match === null) return null;

  const majorWild = isWildcard(match[1]);
  const minorWild = majorWild || isWildcard(match[2]);
  const patchWild = minorWild || isWildcard(match[3]);

  if (majorWild && (match[2] !== undefined || match[3] !== undefined)) {
    // Allow forms like x.x or *.*.* only when trailing parts are also wildcards.
    if (!isWildcard(match[2]) || !isWildcard(match[3])) return null;
  }
  if (minorWild && match[3] !== undefined && !isWildcard(match[3])) {
    return null;
  }
  if (patchWild && match[4] !== undefined) return null;

  const prerelease = parsePrerelease(match[4]);
  if (prerelease === null) return null;

  return {
    major: majorWild ? null : Number(match[1]),
    minor: minorWild ? null : Number(match[2]),
    patch: patchWild ? null : Number(match[3]),
    prerelease
  };
}

function makeVersion(major, minor, patch, prerelease = []) {
  return { major, minor, patch, prerelease };
}

function expandComparator(operator, partial) {
  const { major, minor, patch, prerelease } = partial;

  if (major === null) {
    // `*` / `x` matches every non-prerelease version.
    if (operator === '<' || operator === '>') return [];
    return [{ op: '>=', version: makeVersion(0, 0, 0), syntheticUpper: false }];
  }

  if (operator === '^') {
    const lower = makeVersion(major, minor ?? 0, patch ?? 0, prerelease);
    let upper;
    if (major > 0) {
      upper = makeVersion(major + 1, 0, 0, [0]);
    } else if (minor !== null && minor > 0) {
      upper = makeVersion(0, minor + 1, 0, [0]);
    } else if (minor === null) {
      upper = makeVersion(1, 0, 0, [0]);
    } else if (patch !== null) {
      upper = makeVersion(0, 0, patch + 1, [0]);
    } else {
      upper = makeVersion(0, 1, 0, [0]);
    }
    return [
      { op: '>=', version: lower, syntheticUpper: false },
      { op: '<', version: upper, syntheticUpper: true }
    ];
  }

  if (operator === '~') {
    const lower = makeVersion(major, minor ?? 0, patch ?? 0, prerelease);
    const upper =
      minor === null
        ? makeVersion(major + 1, 0, 0, [0])
        : makeVersion(major, minor + 1, 0, [0]);
    return [
      { op: '>=', version: lower, syntheticUpper: false },
      { op: '<', version: upper, syntheticUpper: true }
    ];
  }

  if (minor === null) {
    if (operator === '' || operator === '=') {
      return [
        {
          op: '>=',
          version: makeVersion(major, 0, 0),
          syntheticUpper: false
        },
        {
          op: '<',
          version: makeVersion(major + 1, 0, 0, [0]),
          syntheticUpper: true
        }
      ];
    }
    if (operator === '>=') {
      return [
        { op: '>=', version: makeVersion(major, 0, 0), syntheticUpper: false }
      ];
    }
    if (operator === '>') {
      return [
        {
          op: '>=',
          version: makeVersion(major + 1, 0, 0),
          syntheticUpper: false
        }
      ];
    }
    if (operator === '<=') {
      return [
        {
          op: '<',
          version: makeVersion(major + 1, 0, 0, [0]),
          syntheticUpper: true
        }
      ];
    }
    if (operator === '<') {
      return [
        {
          op: '<',
          version: makeVersion(major, 0, 0, [0]),
          syntheticUpper: true
        }
      ];
    }
  }

  if (patch === null) {
    if (operator === '' || operator === '=') {
      return [
        {
          op: '>=',
          version: makeVersion(major, minor, 0),
          syntheticUpper: false
        },
        {
          op: '<',
          version: makeVersion(major, minor + 1, 0, [0]),
          syntheticUpper: true
        }
      ];
    }
    if (operator === '>=') {
      return [
        {
          op: '>=',
          version: makeVersion(major, minor, 0),
          syntheticUpper: false
        }
      ];
    }
    if (operator === '>') {
      return [
        {
          op: '>=',
          version: makeVersion(major, minor + 1, 0),
          syntheticUpper: false
        }
      ];
    }
    if (operator === '<=') {
      return [
        {
          op: '<',
          version: makeVersion(major, minor + 1, 0, [0]),
          syntheticUpper: true
        }
      ];
    }
    if (operator === '<') {
      return [
        {
          op: '<',
          version: makeVersion(major, minor, 0, [0]),
          syntheticUpper: true
        }
      ];
    }
  }

  return [
    {
      op: operator === '' ? '=' : operator,
      version: makeVersion(major, minor, patch, prerelease),
      syntheticUpper: false
    }
  ];
}

function parseComparatorSet(rawSet) {
  const trimmed = rawSet.trim();
  if (trimmed.length === 0) return null;

  // 支援 hyphen range（例如 `1.2.3 - 2.3.4`）。
  const hyphenParts = trimmed.split(/\s+-\s+/u);
  if (hyphenParts.length > 2) return null;
  if (hyphenParts.length === 2) {
    const low = parsePartialVersion(hyphenParts[0]);
    const high = parsePartialVersion(hyphenParts[1]);
    if (low === null || high === null) return null;
    return [...expandComparator('>=', low), ...expandComparator('<=', high)];
  }

  const normalized = trimmed.replace(/([<>]=?|[=~^])\s+/gu, '$1');
  const tokens = normalized.split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return null;

  const comparators = [];
  for (const token of tokens) {
    const match = /^(>=|<=|>|<|=|\^|~)?(.+)$/u.exec(token);
    if (match === null) return null;
    const operator = match[1] ?? '';
    const partial = parsePartialVersion(match[2]);
    if (partial === null) return null;
    comparators.push(...expandComparator(operator, partial));
  }
  return comparators;
}

export function parseSemverRange(rawRange) {
  if (typeof rawRange !== 'string') return null;
  const trimmed = rawRange.trim();
  if (trimmed.length === 0) return null;
  const sets = trimmed.split('||');
  const parsedSets = [];
  for (const set of sets) {
    const parsed = parseComparatorSet(set);
    if (parsed === null || parsed.length === 0) return null;
    parsedSets.push(parsed);
  }
  return parsedSets;
}

function testComparator(candidate, comparator) {
  const cmp = compareSemver(candidate, comparator.version);
  switch (comparator.op) {
    case '=':
      return cmp === 0;
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    default:
      return false;
  }
}

function satisfiesComparatorSet(candidate, comparators) {
  for (const comparator of comparators) {
    if (!testComparator(candidate, comparator)) return false;
  }
  if (candidate.prerelease.length === 0) return true;

  // 遵循 npm semver 預設行為：除非 comparator set 明確宣告相同 [major, minor, patch]
  // 的 prerelease，否則 prerelease 版本（例如 4.0.8-alpha.0）不算滿足 >=4.0.8。
  return comparators.some(
    (comparator) =>
      !comparator.syntheticUpper &&
      comparator.version.prerelease.length > 0 &&
      comparator.version.major === candidate.major &&
      comparator.version.minor === candidate.minor &&
      comparator.version.patch === candidate.patch
  );
}

export function hasDeclaredPatch(patchedVersions) {
  if (typeof patchedVersions !== 'string') return false;
  const trimmed = patchedVersions.trim();
  if (trimmed.length === 0) return false;
  const normalized = trimmed.toLowerCase().replace(/\s+/gu, '');
  return !NO_PATCH_MARKERS.has(normalized);
}

export function satisfiesPatchedRange(version, patchedVersions) {
  const parsedVersion = parseSemver(version);
  if (parsedVersion === null) return false;
  const parsedRange = parseSemverRange(patchedVersions);
  if (parsedRange === null) return false;
  return parsedRange.some((set) => satisfiesComparatorSet(parsedVersion, set));
}

export function parseAuditJson({
  stdout,
  stderr,
  exitCode,
  spawnError,
  label
}) {
  const tag = label ?? 'pnpm audit';
  if (spawnError !== undefined && spawnError !== null) {
    const message =
      spawnError instanceof Error ? spawnError.message : String(spawnError);
    return { ok: false, error: `${tag} 執行失敗：${message}` };
  }

  if (typeof stdout !== 'string' || stdout.trim().length === 0) {
    const detail = typeof stderr === 'string' ? stderr.trim() : '';
    return {
      ok: false,
      error: `${tag} 沒有輸出 JSON（exit code ${exitCode ?? 'unknown'}${detail ? `；stderr: ${detail}` : ''}）`
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `${tag} 輸出不是合法 JSON（${message}）`
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: `${tag} 回傳的 JSON 根節點不是物件` };
  }

  if (parsed.error !== undefined && parsed.error !== null) {
    const errObj = parsed.error;
    const summary =
      typeof errObj === 'object'
        ? [errObj.code, errObj.summary ?? errObj.message]
            .filter(Boolean)
            .join(': ')
        : String(errObj);
    return {
      ok: false,
      error: `${tag} 回報掃描錯誤（${summary || 'unknown error'}）`
    };
  }

  if (
    parsed.advisories === undefined ||
    parsed.advisories === null ||
    typeof parsed.advisories !== 'object' ||
    Array.isArray(parsed.advisories)
  ) {
    return { ok: false, error: `${tag} JSON 缺少合法的 advisories 物件` };
  }

  if (exitCode !== 0 && Object.keys(parsed.advisories).length === 0) {
    const detail = typeof stderr === 'string' ? stderr.trim() : '';
    return {
      ok: false,
      error: `${tag} 以非零狀態碼退出（${exitCode}）但未回報任何 advisory，疑似掃描異常${detail ? `（stderr: ${detail}）` : ''}`
    };
  }

  return { ok: true, report: parsed };
}

function normalizeAdvisory(raw) {
  const paths = new Set();
  if (Array.isArray(raw?.findings)) {
    for (const finding of raw.findings) {
      if (!Array.isArray(finding?.paths)) continue;
      for (const entryPath of finding.paths) {
        if (typeof entryPath === 'string' && entryPath.trim().length > 0) {
          paths.add(entryPath.trim());
        }
      }
    }
  }

  const ghsa =
    typeof raw?.github_advisory_id === 'string' &&
    raw.github_advisory_id.trim().length > 0
      ? raw.github_advisory_id.trim()
      : null;
  const numericId =
    raw?.id !== undefined && raw?.id !== null ? String(raw.id) : null;
  const pkg =
    typeof raw?.module_name === 'string' && raw.module_name.trim().length > 0
      ? raw.module_name.trim()
      : 'unknown-package';

  return {
    id: ghsa ?? (numericId !== null ? `advisory-${numericId}` : 'unknown'),
    ghsa,
    numericId,
    package: pkg,
    severity: String(raw?.severity ?? '')
      .trim()
      .toLowerCase(),
    title: typeof raw?.title === 'string' ? raw.title.trim() : '',
    patchedVersions:
      typeof raw?.patched_versions === 'string'
        ? raw.patched_versions.trim()
        : (raw?.patched_versions ?? null),
    vulnerableVersions:
      typeof raw?.vulnerable_versions === 'string'
        ? raw.vulnerable_versions.trim()
        : null,
    url: typeof raw?.url === 'string' ? raw.url.trim() : null,
    paths: [...paths].sort()
  };
}

function extractHighCriticalAdvisories(report) {
  return Object.values(report?.advisories ?? {})
    .map(normalizeAdvisory)
    .filter((advisory) => BLOCKING_SEVERITIES.has(advisory.severity));
}

function advisoryIdentityKeys(advisory) {
  const keys = [];
  if (advisory.ghsa !== null)
    keys.push(`ghsa:${advisory.ghsa}::${advisory.package}`);
  if (advisory.numericId !== null) {
    keys.push(`id:${advisory.numericId}::${advisory.package}`);
  }
  if (keys.length === 0) {
    keys.push(`fallback:${advisory.package}::${advisory.title}`);
  }
  return keys;
}

function pickLatestPublishedVersion(versions) {
  const parsed = versions
    .map((raw) => ({ raw, semver: parseSemver(raw) }))
    .filter(
      (entry) => entry.semver !== null && entry.semver.prerelease.length === 0
    );
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => compareSemver(a.semver, b.semver));
  return parsed[parsed.length - 1].raw;
}

export async function fetchNpmPublishedVersions(
  packageName,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_REGISTRY_TIMEOUT_MS,
    registryUrl = DEFAULT_REGISTRY_URL
  } = {}
) {
  if (typeof packageName !== 'string' || packageName.trim().length === 0) {
    throw new Error('缺少套件名稱，無法查詢 npm registry');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('執行環境不支援 fetch');
  }

  const endpoint = `${registryUrl.replace(/\/+$/u, '')}/${encodeURIComponent(
    packageName.trim()
  )}`;
  const response = await fetchImpl(endpoint, {
    headers: {
      Accept: 'application/vnd.npm.install-v1+json'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(
      `npm registry 回應 HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
    );
  }

  const payload = await response.json();
  if (
    payload === null ||
    typeof payload !== 'object' ||
    payload.versions === null ||
    typeof payload.versions !== 'object' ||
    Array.isArray(payload.versions)
  ) {
    throw new Error('npm registry 回應格式缺少 versions 物件');
  }

  return Object.keys(payload.versions);
}

export async function classifyAdvisories({
  allReport,
  prodReport,
  fetchPublishedVersions = fetchNpmPublishedVersions
}) {
  const prodAdvisories = extractHighCriticalAdvisories(prodReport);
  const allAdvisories = extractHighCriticalAdvisories(allReport);

  const prodKeys = new Set();
  for (const advisory of prodAdvisories) {
    for (const key of advisoryIdentityKeys(advisory)) prodKeys.add(key);
  }

  // 合併清單：確保即使只有 prodReport 出現某筆 high/critical 也不會遺漏。
  const seenKeys = new Set();
  const combined = [];
  for (const advisory of [...allAdvisories, ...prodAdvisories]) {
    const keys = advisoryIdentityKeys(advisory);
    if (keys.some((key) => seenKeys.has(key))) continue;
    for (const key of keys) seenKeys.add(key);
    combined.push(advisory);
  }

  const publishedCache = new Map();
  async function lookupPublishedVersions(packageName) {
    if (!publishedCache.has(packageName)) {
      const promise = Promise.resolve()
        .then(() => fetchPublishedVersions(packageName))
        .then((versions) => {
          if (
            !Array.isArray(versions) ||
            versions.some((version) => typeof version !== 'string')
          ) {
            throw new Error('registry fetcher 必須回傳版本字串陣列');
          }
          return { ok: true, versions };
        })
        .catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }));
      publishedCache.set(packageName, promise);
    }
    return publishedCache.get(packageName);
  }

  const blocking = [];
  const warnings = [];

  for (const advisory of combined) {
    const isProd = advisoryIdentityKeys(advisory).some((key) =>
      prodKeys.has(key)
    );
    if (isProd) {
      blocking.push({
        ...advisory,
        scope: 'prod',
        reason: '正式相依（prod）的 high/critical 漏洞一律阻斷，不得降級為警告'
      });
      continue;
    }

    if (!hasDeclaredPatch(advisory.patchedVersions)) {
      warnings.push({
        ...advisory,
        scope: 'dev',
        reason: `上游尚未宣告修補版（patched_versions: ${advisory.patchedVersions ?? '無'}）`
      });
      continue;
    }

    if (parseSemverRange(advisory.patchedVersions) === null) {
      blocking.push({
        ...advisory,
        scope: 'dev',
        reason: `無法解析 patched_versions（${advisory.patchedVersions}），採 fail-closed 阻斷`
      });
      continue;
    }

    const lookup = await lookupPublishedVersions(advisory.package);
    if (!lookup.ok) {
      blocking.push({
        ...advisory,
        scope: 'dev',
        reason: `無法查詢 npm registry（${lookup.error}），採 fail-closed 阻斷`
      });
      continue;
    }

    const matching = lookup.versions
      .filter((version) =>
        satisfiesPatchedRange(version, advisory.patchedVersions)
      )
      .sort((a, b) => compareSemver(a, b));

    if (matching.length > 0) {
      blocking.push({
        ...advisory,
        scope: 'dev',
        matchingVersions: matching,
        reason: `上游已發布修補版（滿足 ${advisory.patchedVersions}，例如 ${matching[0]}），請升級或覆寫相依`
      });
    } else {
      const latest = pickLatestPublishedVersion(lookup.versions);
      warnings.push({
        ...advisory,
        scope: 'dev',
        latestPublished: latest,
        reason: `patched_versions 宣告 ${advisory.patchedVersions}，但 npm registry 尚無已發布版本滿足（目前最新穩定版：${latest ?? '無'}）`
      });
    }
  }

  return {
    ok: blocking.length === 0,
    blocking,
    warnings
  };
}

function formatAdvisoryLines(item) {
  const lines = [
    `- ${item.id}（套件：${item.package}｜嚴重度：${item.severity}｜範圍：${item.scope}）`,
    `  patched_versions：${item.patchedVersions ?? '無'}`,
    `  說明：${item.reason}`,
    `  受影響路徑：${item.paths.length > 0 ? item.paths.join(', ') : '（pnpm audit 未回報路徑）'}`
  ];
  if (item.url !== null) lines.push(`  連結：${item.url}`);
  return lines;
}

export function formatAuditReport({
  ok,
  blocking = [],
  warnings = [],
  toolErrors = []
}) {
  const stdoutLines = [];
  const stderrLines = [];

  if (toolErrors.length > 0) {
    stderrLines.push(
      '✖ Dev-fixable audit failed（掃描工具異常，採 fail-closed 阻斷）：'
    );
    for (const error of toolErrors) stderrLines.push(`- ${error}`);
    return { stdoutLines, stderrLines };
  }

  if (warnings.length > 0) {
    stderrLines.push(
      '========================================================================'
    );
    stderrLines.push(
      `⚠ 警告：以下 ${warnings.length} 筆 dev-only high/critical 漏洞上游尚未發布修補版（暫不阻斷 CI，待修補版發布後將自動轉為阻斷）：`
    );
    for (const warning of warnings) {
      stderrLines.push(...formatAdvisoryLines(warning));
    }
    stderrLines.push(
      '========================================================================'
    );
  }

  if (blocking.length > 0) {
    stderrLines.push(
      `✖ Dev-fixable audit failed（共 ${blocking.length} 筆阻斷漏洞）：`
    );
    for (const item of blocking) {
      stderrLines.push(...formatAdvisoryLines(item));
    }
  }

  if (ok) {
    if (warnings.length > 0) {
      stdoutLines.push(
        `Dev-fixable audit passed with ${warnings.length} unpatched dev-only warning(s)（0 筆正式相依或可修補的 dev high/critical 漏洞）.`
      );
    } else {
      stdoutLines.push(
        'Dev-fixable audit passed (0 high/critical advisories).'
      );
    }
  }

  return { stdoutLines, stderrLines };
}

export function runPnpmAudit(
  args,
  { cwd = repositoryRoot, spawnImpl = spawn, env = process.env } = {}
) {
  const npmExecPath = env['npm_execpath'];
  let command;
  let commandArgs;

  if (typeof npmExecPath === 'string' && /\.(?:c|m)?js$/iu.test(npmExecPath)) {
    command = process.execPath;
    commandArgs = [npmExecPath, 'audit', ...args];
  } else if (process.platform === 'win32') {
    command = env['ComSpec'] ?? 'cmd.exe';
    commandArgs = ['/d', '/s', '/c', 'corepack.cmd', 'pnpm', 'audit', ...args];
  } else {
    command = 'corepack';
    commandArgs = ['pnpm', 'audit', ...args];
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawnImpl(command, commandArgs, {
        cwd,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (spawnError) {
      finish({ stdout: '', stderr: '', exitCode: 1, spawnError });
      return;
    }

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', (spawnError) => {
      finish({ stdout, stderr, exitCode: 1, spawnError });
    });
    child.once('close', (code) => {
      finish({ stdout, stderr, exitCode: code ?? 1, spawnError: null });
    });
  });
}

export async function runAuditDevFixable({
  runAudit = runPnpmAudit,
  fetchPublishedVersions = fetchNpmPublishedVersions
} = {}) {
  const [allRaw, prodRaw] = await Promise.all([
    runAudit(['--audit-level', 'high', '--json']),
    runAudit(['--prod', '--audit-level', 'high', '--json'])
  ]);

  const parsedAll = parseAuditJson({
    ...allRaw,
    label: 'pnpm audit --audit-level high --json'
  });
  const parsedProd = parseAuditJson({
    ...prodRaw,
    label: 'pnpm audit --prod --audit-level high --json'
  });

  const toolErrors = [];
  if (!parsedAll.ok) toolErrors.push(parsedAll.error);
  if (!parsedProd.ok) toolErrors.push(parsedProd.error);

  if (toolErrors.length > 0) {
    const report = formatAuditReport({
      ok: false,
      blocking: [],
      warnings: [],
      toolErrors
    });
    return {
      ok: false,
      exitCode: 1,
      blocking: [],
      warnings: [],
      toolErrors,
      report
    };
  }

  const classification = await classifyAdvisories({
    allReport: parsedAll.report,
    prodReport: parsedProd.report,
    fetchPublishedVersions
  });
  const report = formatAuditReport({
    ...classification,
    toolErrors: []
  });

  return {
    ...classification,
    exitCode: classification.ok ? 0 : 1,
    toolErrors: [],
    report
  };
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const result = await runAuditDevFixable();
  for (const line of result.report.stderrLines) console.error(line);
  for (const line of result.report.stdoutLines) console.log(line);
  process.exitCode = result.exitCode;
}
