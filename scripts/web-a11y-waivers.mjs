// WEB-P0-03：expiring waiver 與 axe artifact 驗證（純函式，可單元測試）。
//
// -matching 是窄的：rule＋route＋state＋selector 四者全對才算命中。
// 「全站忽略 color-contrast」或「整頁 /clinic 不看」這種豁免寫不出來——
// validateWaivers 要求四個 scope 欄位齊全，matchWaiver 逐字比對。
//
// 豁免是債，不是資產：過期、未知 rule、從未命中（stale）全部 fail closed。
// 零豁免的空 registry 是合法常態，不為跑測試而發明豁免。

export const WAIVER_SCHEMA_VERSION = 1;

/** finding 的處置：PASS（本模組不產 PASS，只定義）／VIOLATION／WAIVED。 */
export const DISPOSITIONS = ['PASS', 'VIOLATION', 'WAIVED', 'NOT_APPLICABLE'];

export const SHA_PATTERN = /^[0-9a-f]{40}$/;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time);
}

/**
 * 驗證豁免 registry 的形狀與時效，回傳失敗字串（空陣列＝通過）。
 *
 * @param registry { schemaVersion, waivers: [...] }，來自
 *   apps/web/accessibility-waivers.json。
 * @param today 'YYYY-MM-DD'（UTC 日期字串，呼叫端注入以便測試）。
 */
export function validateWaivers(registry, { today }) {
  const failures = [];
  if (registry?.schemaVersion !== WAIVER_SCHEMA_VERSION) {
    failures.push(
      `waiver registry 的 schemaVersion 必須是 ${WAIVER_SCHEMA_VERSION}。`
    );
  }
  const waivers = registry?.waivers;
  if (!Array.isArray(waivers)) {
    failures.push('waiver registry 缺少 waivers 陣列。');
    return failures;
  }
  const seenIds = new Set();
  for (const [index, waiver] of waivers.entries()) {
    const where = `waivers[${index}]${waiver?.id ? `(${waiver.id})` : ''}`;
    for (const field of [
      'id',
      'rule',
      'route',
      'state',
      'selector',
      'rationale',
      'owner',
      'created',
      'expires'
    ]) {
      const value = waiver?.[field];
      if (typeof value !== 'string' || value.trim() === '') {
        failures.push(`${where} 缺少 ${field}（豁免不得有空欄位）。`);
      }
    }
    if (typeof waiver?.id === 'string') {
      if (seenIds.has(waiver.id))
        failures.push(`重複的 waiver id：${waiver.id}。`);
      seenIds.add(waiver.id);
    }
    if (typeof waiver?.route === 'string' && !waiver.route.startsWith('/')) {
      failures.push(`${where} 的 route 必須是 / 開頭的對外路由。`);
    }
    if (!isValidDate(waiver?.created)) {
      failures.push(`${where} 的 created 不是合法 YYYY-MM-DD 日期。`);
    }
    if (!isValidDate(waiver?.expires)) {
      failures.push(`${where} 的 expires 不是合法 YYYY-MM-DD 日期。`);
    } else if (typeof today === 'string' && waiver.expires < today) {
      failures.push(`${where} 已於 ${waiver.expires} 過期：到期豁免即失效。`);
    }
  }
  return failures;
}

/** finding 的 selector 正規形：axe node.target 陣列的 JSON 字串。 */
export function targetKey(target) {
  return JSON.stringify(target ?? []);
}

/**
 * 窄匹配：四者全對才命中。回傳命中的 waiver，未命中回傳 undefined。
 */
export function matchWaiver(waivers, finding) {
  return waivers.find(
    (waiver) =>
      waiver.rule === finding.rule &&
      waiver.route === finding.route &&
      waiver.state === finding.state &&
      waiver.selector === finding.selector
  );
}

/**
 * 把一次 axe 掃描的 violations 轉成 findings 並分類。
 *
 * @returns { results: [{rule, impact, tags, target, summary, disposition, waiverId?}],
 *   failures: 未豁免 finding 的 blocking 描述 }
 *
 * 注意：axe 掃描本身已用 withTags 限定 WCAG 2.x A／AA，這裡對 impact
 * 不再分級——moderate 也擋（WEB-P0-03 要的是完整 A／AA，不是只擋
 * serious／critical）。
 */
export function classifyFindings({ violations, route, state, waivers }) {
  const results = [];
  const failures = [];
  for (const violation of violations ?? []) {
    for (const node of violation.nodes ?? []) {
      const selector = targetKey(node.target);
      const matched = matchWaiver(waivers, {
        rule: violation.id,
        route,
        state,
        selector
      });
      const finding = {
        rule: violation.id,
        impact: violation.impact ?? 'unknown',
        tags: violation.tags ?? [],
        target: node.target ?? [],
        summary: String(node.failureSummary ?? '').slice(0, 500),
        disposition: matched === undefined ? 'VIOLATION' : 'WAIVED'
      };
      if (matched !== undefined) finding.waiverId = matched.id;
      else
        failures.push(
          `未豁免的 ${violation.id}（${violation.impact ?? 'unknown'}）於 ${route} [${state}] ${selector}`
        );
      results.push(finding);
    }
  }
  return { results, failures };
}

/**
 * 驗證 axe artifact 的完整性，回傳失敗字串。
 *
 * 檢查：head SHA；scans 覆蓋每一個期望的 route＋state；
 * 每條 finding 的處置合法；waiver 的 rule 必須出現在本輪實際評估過的
 * rule id 裡（未知 rule 即失敗）；每一張 waiver 至少命中一次
 * （stale 豁免即失敗——修掉的債要刪，不要留著）。
 */
export function validateA11yArtifact(
  artifact,
  { waivers, evaluatedRuleIds, expectedScans }
) {
  const failures = [];
  if (
    typeof artifact?.headSha !== 'string' ||
    !SHA_PATTERN.test(artifact.headSha)
  ) {
    failures.push('artifact 缺少合法的 head SHA（40 位 hex）。');
  }
  const scans = Array.isArray(artifact?.scans) ? artifact.scans : [];
  if (!Array.isArray(artifact?.scans)) {
    failures.push('artifact 缺少 scans 陣列。');
  }
  const seenScans = new Set(
    scans.map((scan) => `${scan?.route} [${scan?.state}]`)
  );
  for (const { route, state } of expectedScans ?? []) {
    if (!seenScans.has(`${route} [${state}]`)) {
      failures.push(`缺少 axe 掃描：${route} [${state}]（不得靜默跳過）。`);
    }
  }
  const evaluated = new Set(evaluatedRuleIds ?? []);
  for (const waiver of waivers ?? []) {
    if (!evaluated.has(waiver.rule)) {
      failures.push(
        `waiver ${waiver.id} 的 rule ${waiver.rule} 本輪未被評估：未知 rule。`
      );
    }
  }
  const matchedIds = new Set();
  for (const scan of scans) {
    for (const finding of scan?.findings ?? []) {
      if (!DISPOSITIONS.includes(finding?.disposition)) {
        failures.push(
          `${scan?.route} [${scan?.state}] 的 finding 處置 ${String(finding?.disposition)} 非法。`
        );
      }
      if (finding?.disposition === 'WAIVED') {
        if (typeof finding?.waiverId !== 'string') {
          failures.push(
            `${scan?.route} [${scan?.state}] 的 WAIVED finding 缺少 waiverId。`
          );
        } else matchedIds.add(finding.waiverId);
      }
    }
  }
  for (const waiver of waivers ?? []) {
    if (!matchedIds.has(waiver.id)) {
      failures.push(
        `waiver ${waiver.id} 本輪未命中任何 finding：stale 豁免必須刪除。`
      );
    }
  }
  return failures;
}
