import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import ts from 'typescript';

// 對外頁面清單的一致性守衛（2026-07-27，自動檢查缺口 F-4）。
//
// public-pages.json 是「哪些頁面存在、如何路由、跑哪些掃描」的權威清單；本機
// server、Firebase Hosting 與效能預算仍各有自己的格式。這支腳本做 schema 驗證
// 與雙向集合比對：不只找「manifest 有、抄本漏了」，也找「抄本多出 manifest
// 無法解釋的舊路由」。共享 clinic shell 與 entry-file redirect 必須在 manifest
// 明列，不能靠檢查器猜例外。

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFile(join(root, ...parts), 'utf8');

export const SCAN_SPECS = {
  axe: 'tests/e2e/accessibility.spec.ts',
  responsive: 'tests/e2e/responsive.spec.ts',
  affordance: 'tests/e2e/affordance.spec.ts',
  'mobile-layout': 'tests/e2e/mobile-layout.spec.ts'
};

const SCAN_EXECUTORS = {
  axe: 'scan',
  responsive: 'horizontalOverflow',
  affordance: 'affordanceReport',
  'mobile-layout': 'pageOverflow'
};

const PAGE_KEYS = [
  'route',
  'entry',
  'audience',
  'indexable',
  'scans',
  'note',
  'routing'
];
const ROUTING_KINDS = new Set(['root', 'exact', 'shared-shell', 'hosting-404']);
const ROUTE_PATTERN =
  /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
const ENTRY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/;
const DATA_SOURCE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRoute = (value) =>
  typeof value === 'string' && ROUTE_PATTERN.test(value);
const isEntry = (value) =>
  typeof value === 'string' && ENTRY_PATTERN.test(value);
const isEntryPath = (value) =>
  typeof value === 'string' && value.startsWith('/') && isEntry(value.slice(1));
const isWildcardRoute = (value) =>
  typeof value === 'string' &&
  value.endsWith('/**') &&
  isRoute(value.slice(0, -3));

function validateKeys(value, required, allowed, label, failures) {
  for (const key of required) {
    if (!hasOwn(value, key)) failures.push(`${label} 少了 ${key} 欄位。`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      failures.push(`${label} 有未知欄位 ${key}；疑似拼字錯誤或未建模設定。`);
  }
}

function validateEntryRedirect(value, label, failures) {
  if (value === null) return null;
  if (!isRecord(value)) {
    failures.push(`${label}.entryRedirect 必須是 null 或 { "status": 301 }。`);
    return null;
  }
  validateKeys(
    value,
    ['status'],
    ['status'],
    `${label}.entryRedirect`,
    failures
  );
  if (value.status !== 301) {
    failures.push(
      `${label}.entryRedirect.status 必須是 301；其他 redirect 必須另行建模。`
    );
    return null;
  }
  return { status: 301 };
}

function validateRouting(value, page, label, failures) {
  if (!isRecord(value)) {
    failures.push(`${label}.routing 必須是 object。`);
    return null;
  }

  const kind = value.kind;
  const allowed =
    kind === 'shared-shell'
      ? ['kind', 'entryRedirect', 'dataRoutes', 'hostingWildcard']
      : ['kind', 'entryRedirect'];
  validateKeys(
    value,
    ['kind', 'entryRedirect'],
    allowed,
    `${label}.routing`,
    failures
  );

  if (typeof kind !== 'string' || !ROUTING_KINDS.has(kind)) {
    failures.push(
      `${label}.routing.kind 必須是 root、exact、shared-shell 或 hosting-404。`
    );
    return null;
  }

  const entryRedirect = validateEntryRedirect(
    value.entryRedirect,
    `${label}.routing`,
    failures
  );

  if (kind === 'root') {
    if (page.route !== '/' || page.entry !== 'index.html')
      failures.push(`${label} 的 root routing 只允許 / → index.html。`);
    if (value.entryRedirect !== null)
      failures.push(`${label} 的 root routing 不得宣告 entry redirect。`);
  }

  if (kind === 'hosting-404') {
    if (page.route !== '/404' || page.entry !== '404.html')
      failures.push(`${label} 的 hosting-404 routing 只允許 /404 → 404.html。`);
    if (value.entryRedirect !== null)
      failures.push(
        `${label} 的 hosting-404 routing 不得宣告 entry redirect。`
      );
  }

  if (kind === 'exact' || kind === 'shared-shell') {
    if (page.route === '/' || page.route === '/404')
      failures.push(`${label} 的 ${kind} routing 不能用於 ${page.route}。`);
    if (entryRedirect === null)
      failures.push(
        `${label} 會進 PRETTY_PATHS，因此必須明列 301 entryRedirect。`
      );
  }

  if (kind === 'shared-shell') {
    validateKeys(
      value,
      ['kind', 'entryRedirect', 'dataRoutes', 'hostingWildcard'],
      allowed,
      `${label}.routing`,
      failures
    );
    if (
      typeof value.dataRoutes !== 'string' ||
      !DATA_SOURCE_PATTERN.test(value.dataRoutes)
    )
      failures.push(
        `${label}.routing.dataRoutes 必須是大寫 export 名稱，例如 CLINIC_ROUTES。`
      );
    if (
      typeof value.hostingWildcard !== 'string' ||
      !isWildcardRoute(value.hostingWildcard)
    )
      failures.push(`${label}.routing.hostingWildcard 必須是合法的 /** 路徑。`);
    else if (value.hostingWildcard !== `${page.route}/**`)
      failures.push(
        `${label}.routing.hostingWildcard 必須是 ${page.route}/**，不能涵蓋其他 namespace。`
      );
  }

  return {
    kind,
    entryRedirect,
    dataRoutes:
      kind === 'shared-shell' && typeof value.dataRoutes === 'string'
        ? value.dataRoutes
        : null,
    hostingWildcard:
      kind === 'shared-shell' && typeof value.hostingWildcard === 'string'
        ? value.hostingWildcard
        : null
  };
}

function validateInventory(inventory, failures) {
  if (!isRecord(inventory)) {
    failures.push('public-pages.json 頂層必須是 object。');
    return [];
  }
  validateKeys(
    inventory,
    ['why', 'pages'],
    ['why', 'pages'],
    'public-pages.json',
    failures
  );

  if (typeof inventory.why !== 'string' || inventory.why.trim() === '')
    failures.push('public-pages.json 的 why 必須是非空字串。');
  if (!Array.isArray(inventory.pages) || inventory.pages.length === 0) {
    failures.push('public-pages.json 的 pages 必須是非空 array。');
    return [];
  }

  const pages = [];
  const routes = new Map();
  const entries = new Map();

  for (const [index, value] of inventory.pages.entries()) {
    const fallbackLabel = `public-pages.json pages[${index}]`;
    if (!isRecord(value)) {
      failures.push(`${fallbackLabel} 必須是 object。`);
      continue;
    }
    const label =
      typeof value.route === 'string'
        ? `public-pages.json ${value.route}`
        : fallbackLabel;
    validateKeys(value, PAGE_KEYS, PAGE_KEYS, label, failures);

    const routeValid = isRoute(value.route);
    if (!routeValid)
      failures.push(
        `${label}.route 必須是小寫、無 query/hash/glob/trailing slash 的絕對路徑。`
      );
    const entryValid = isEntry(value.entry);
    if (!entryValid)
      failures.push(
        `${label}.entry 必須是單一小寫 kebab-case .html 檔名，不能含目錄或 traversal。`
      );
    if (!['staff', 'public'].includes(value.audience))
      failures.push(`${label}.audience 必須是 staff 或 public。`);
    if (typeof value.indexable !== 'boolean')
      failures.push(`${label}.indexable 必須是 boolean。`);
    if (!Array.isArray(value.scans)) {
      failures.push(`${label}.scans 必須是 array。`);
    } else {
      const seenScans = new Set();
      for (const scan of value.scans) {
        if (typeof scan !== 'string' || scan.trim() === '') {
          failures.push(`${label}.scans 只能包含非空字串。`);
          continue;
        }
        if (seenScans.has(scan))
          failures.push(`${label}.scans 重複宣告 ${scan}。`);
        seenScans.add(scan);
        if (!hasOwn(SCAN_SPECS, scan))
          failures.push(`${label} 宣告了未知的掃描 '${scan}'。`);
      }
    }
    if (typeof value.note !== 'string' || value.note.trim() === '')
      failures.push(`${label}.note 必須是非空字串。`);

    if (routeValid) {
      const previous = routes.get(value.route);
      if (previous !== undefined)
        failures.push(
          `${label}.route 與 pages[${previous}] 重複；route 必須唯一。`
        );
      else routes.set(value.route, index);
    }
    if (entryValid) {
      const previous = entries.get(value.entry);
      if (previous !== undefined)
        failures.push(
          `${label}.entry 與 pages[${previous}] 重複；共用 entry 必須用一筆 shared-shell 建模。`
        );
      else entries.set(value.entry, index);
    }

    const routing = validateRouting(value.routing, value, label, failures);
    if (routeValid && entryValid && routing !== null)
      pages.push({
        route: value.route,
        entry: value.entry,
        indexable: value.indexable === true,
        scans: Array.isArray(value.scans) ? value.scans : [],
        routing
      });
  }

  return pages;
}

function valuesOfSources(sources) {
  if (sources instanceof Map) return [...sources.entries()];
  if (isRecord(sources)) return Object.entries(sources);
  return [];
}

function dataSourceValue(sources, key) {
  if (sources instanceof Map) return sources.get(key);
  return isRecord(sources) ? sources[key] : undefined;
}

function addExpectedMapping(map, route, entry, source, failures) {
  const previous = map.get(route);
  if (previous !== undefined && previous.entry !== entry)
    failures.push(
      `${route} 同時被 ${previous.source} 與 ${source} 指向不同 entry。`
    );
  else if (previous === undefined) map.set(route, { entry, source });
}

function buildExpectedRouting(pages, dataRouteSources, failures) {
  const serverMappings = new Map();
  const rewrites = new Map();
  const redirects = new Map();
  const usedDataSources = new Set();
  const dataRoutes = new Set();

  if (!(dataRouteSources instanceof Map) && !isRecord(dataRouteSources))
    failures.push('dataRouteSources 必須是 object 或 Map。');

  for (const page of pages) {
    const { kind } = page.routing;
    if (kind === 'exact')
      addExpectedMapping(
        serverMappings,
        page.route,
        page.entry,
        `manifest ${page.route}`,
        failures
      );

    if (kind === 'exact' || kind === 'shared-shell')
      rewrites.set(page.route, `/${page.entry}`);

    if (page.routing.entryRedirect !== null)
      redirects.set(`/${page.entry}`, {
        destination: page.route,
        type: page.routing.entryRedirect.status
      });

    if (kind !== 'shared-shell') continue;

    const sourceName = page.routing.dataRoutes;
    if (sourceName === null) continue;
    usedDataSources.add(sourceName);
    const routes = dataSourceValue(dataRouteSources, sourceName);
    if (!Array.isArray(routes) || routes.length === 0) {
      failures.push(
        `${page.route} 宣告 dataRoutes=${sourceName}，但注入值不是非空 array。`
      );
      continue;
    }

    const seen = new Set();
    for (const [index, route] of routes.entries()) {
      const routeLabel = `${sourceName}[${index}]`;
      if (!isRoute(route)) {
        failures.push(`${routeLabel} 不是合法 public route。`);
        continue;
      }
      if (seen.has(route)) {
        failures.push(`${sourceName} 重複宣告 ${route}。`);
        continue;
      }
      seen.add(route);
      dataRoutes.add(route);
      if (route !== page.route && !route.startsWith(`${page.route}/`)) {
        failures.push(
          `${routeLabel}=${route} 超出 shared shell namespace ${page.route}/**。`
        );
        continue;
      }
      addExpectedMapping(
        serverMappings,
        route,
        page.entry,
        `${sourceName}`,
        failures
      );
    }
    if (!seen.has(page.route))
      failures.push(
        `${sourceName} 少了 shared shell canonical route ${page.route}。`
      );

    if (page.routing.hostingWildcard !== null)
      rewrites.set(page.routing.hostingWildcard, `/${page.entry}`);
  }

  for (const [name] of valuesOfSources(dataRouteSources)) {
    if (!usedDataSources.has(name))
      failures.push(
        `dataRouteSources.${name} 沒有被任何 shared-shell manifest entry 使用。`
      );
  }

  return {
    serverMappings,
    rewrites,
    redirects,
    dataRouteCount: dataRoutes.size
  };
}

export function extractPrettyPaths(serverSource) {
  const failures = [];
  const mappings = [];
  if (typeof serverSource !== 'string') {
    failures.push('apps/web/server.mjs 來源必須是字串。');
    return { failures, mappings };
  }

  const declaration =
    /const\s+PRETTY_PATHS\s*=\s*new\s+Map\s*\(\s*\[([\s\S]*?)\]\s*\)\s*;/.exec(
      serverSource
    );
  if (declaration === null) {
    failures.push(
      'apps/web/server.mjs 讀不到 const PRETTY_PATHS = new Map([...])；路由守衛已失效。'
    );
    return { failures, mappings };
  }

  const body = declaration[1];
  const pairPattern = /\[\s*(['"])([^'"\\]+)\1\s*,\s*(['"])([^'"\\]+)\3\s*\]/g;
  for (const match of body.matchAll(pairPattern))
    mappings.push({ route: match[2], entry: match[4] });

  const residue = body
    .replace(pairPattern, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '')
    .replace(/[\s,]/g, '');
  if (residue !== '')
    failures.push(
      `apps/web/server.mjs 的 PRETTY_PATHS 含無法安全解析的內容：${residue.slice(0, 80)}。`
    );
  if (mappings.length === 0)
    failures.push('apps/web/server.mjs 的 PRETTY_PATHS 不得為空。');

  return { failures, mappings };
}

function compareServerMappings(expected, redirects, actual, failures) {
  const actualByRoute = new Map();
  const firstRouteByEntry = new Map();
  for (const [index, mapping] of actual.entries()) {
    const label = `apps/web/server.mjs PRETTY_PATHS[${index}]`;
    if (!isRoute(mapping.route))
      failures.push(`${label} 的 route '${mapping.route}' 格式非法。`);
    if (!isEntry(mapping.entry))
      failures.push(`${label} 的 entry '${mapping.entry}' 格式非法。`);
    if (actualByRoute.has(mapping.route))
      failures.push(
        `apps/web/server.mjs 的 PRETTY_PATHS 重複宣告 ${mapping.route}。`
      );
    else actualByRoute.set(mapping.route, mapping.entry);
    if (!firstRouteByEntry.has(mapping.entry))
      firstRouteByEntry.set(mapping.entry, mapping.route);
  }

  for (const [route, expectedMapping] of expected) {
    const actualEntry = actualByRoute.get(route);
    if (actualEntry === undefined)
      failures.push(
        `apps/web/server.mjs 的 PRETTY_PATHS 少了 ${route} → ${expectedMapping.entry}。`
      );
    else if (actualEntry !== expectedMapping.entry)
      failures.push(
        `apps/web/server.mjs 的 PRETTY_PATHS 把 ${route} 指向 ${actualEntry}；manifest 要求 ${expectedMapping.entry}。`
      );
  }
  for (const [route, entry] of actualByRoute) {
    if (!expected.has(route))
      failures.push(
        `apps/web/server.mjs 的 PRETTY_PATHS 多出未由 manifest 解釋的 ${route} → ${entry}。`
      );
  }

  // server 以第一個擁有該 entry 的 PRETTY_PATH 產生 /entry.html redirect。
  // shared shell 因此不只要「集合相同」，canonical route 還必須排在 aliases 前面。
  for (const [entryPath, rule] of redirects) {
    const entry = entryPath.slice(1);
    const firstRoute = firstRouteByEntry.get(entry);
    if (firstRoute !== undefined && firstRoute !== rule.destination)
      failures.push(
        `apps/web/server.mjs 會把 ${entryPath} redirect 到第一筆 ${firstRoute}；manifest 要求 canonical ${rule.destination}。`
      );
  }
}

function firebaseRules(firebase, name, failures) {
  if (!isRecord(firebase) || !isRecord(firebase.hosting)) {
    failures.push('firebase.json.hosting 必須是 object。');
    return [];
  }
  const value = firebase.hosting[name];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    failures.push(`firebase.json hosting.${name} 必須是 array。`);
    return [];
  }
  return value;
}

function compareFirebaseRewrites(expected, rules, failures) {
  const actual = new Map();
  for (const [index, value] of rules.entries()) {
    const label = `firebase.json rewrites[${index}]`;
    if (!isRecord(value)) {
      failures.push(`${label} 必須是 object。`);
      continue;
    }
    validateKeys(
      value,
      ['source', 'destination'],
      ['source', 'destination'],
      label,
      failures
    );
    if (!isRoute(value.source) && !isWildcardRoute(value.source))
      failures.push(`${label}.source 必須是合法 route 或 /** route。`);
    if (!isEntryPath(value.destination))
      failures.push(`${label}.destination 必須是 /<kebab-case>.html。`);
    if (typeof value.source !== 'string') continue;
    if (actual.has(value.source))
      failures.push(`firebase.json rewrites 重複宣告 ${value.source}。`);
    else actual.set(value.source, value.destination);
  }

  for (const [source, destination] of expected) {
    const actualDestination = actual.get(source);
    if (actualDestination === undefined)
      failures.push(`firebase.json rewrites 少了 ${source} → ${destination}。`);
    else if (actualDestination !== destination)
      failures.push(
        `firebase.json rewrite ${source} 指向 ${actualDestination}；manifest 要求 ${destination}。`
      );
  }
  for (const [source, destination] of actual) {
    if (!expected.has(source))
      failures.push(
        `firebase.json rewrites 多出未由 manifest 解釋的 ${source} → ${destination}。`
      );
  }
}

function compareFirebaseRedirects(expected, rules, failures) {
  const actual = new Map();
  for (const [index, value] of rules.entries()) {
    const label = `firebase.json redirects[${index}]`;
    if (!isRecord(value)) {
      failures.push(`${label} 必須是 object。`);
      continue;
    }
    validateKeys(
      value,
      ['source', 'destination', 'type'],
      ['source', 'destination', 'type'],
      label,
      failures
    );
    if (!isEntryPath(value.source))
      failures.push(`${label}.source 必須是 /<entry>.html。`);
    if (!isRoute(value.destination))
      failures.push(`${label}.destination 必須是合法 canonical route。`);
    if (value.type !== 301)
      failures.push(`${label}.type 必須是 manifest 支援的 301。`);
    if (typeof value.source !== 'string') continue;
    if (actual.has(value.source))
      failures.push(`firebase.json redirects 重複宣告 ${value.source}。`);
    else
      actual.set(value.source, {
        destination: value.destination,
        type: value.type
      });
  }

  for (const [source, expectedRule] of expected) {
    const actualRule = actual.get(source);
    if (actualRule === undefined)
      failures.push(
        `firebase.json redirects 少了 ${source} → ${expectedRule.destination} (${expectedRule.type})。`
      );
    else if (
      actualRule.destination !== expectedRule.destination ||
      actualRule.type !== expectedRule.type
    )
      failures.push(
        `firebase.json redirect ${source} 是 ${actualRule.destination} (${actualRule.type})；manifest 要求 ${expectedRule.destination} (${expectedRule.type})。`
      );
  }
  for (const [source, rule] of actual) {
    if (!expected.has(source))
      failures.push(
        `firebase.json redirects 多出未由 manifest 解釋的 ${source} → ${rule.destination} (${rule.type})。`
      );
  }
}

function compareBudgets(pages, budgets, failures) {
  if (!Array.isArray(budgets)) {
    failures.push('apps/web/performance-budget.json 頂層必須是 array。');
    return;
  }
  const actual = new Map();
  for (const [index, value] of budgets.entries()) {
    const label = `performance-budget.json[${index}]`;
    if (!isRecord(value) || typeof value.path !== 'string') {
      failures.push(`${label}.path 必須是字串。`);
      continue;
    }
    if (!isEntryPath(value.path))
      failures.push(`${label}.path 必須是 /<entry>.html。`);
    if (actual.has(value.path))
      failures.push(`performance-budget.json 重複宣告 ${value.path}。`);
    else actual.set(value.path, index);
  }

  const expected = new Set(pages.map((page) => `/${page.entry}`));
  for (const page of pages) {
    const path = `/${page.entry}`;
    if (!actual.has(path))
      failures.push(
        `performance-budget.json 沒有 ${path} 的預算（${page.route}）。`
      );
  }
  for (const path of actual.keys()) {
    if (!expected.has(path))
      failures.push(`performance-budget.json 多出 manifest 沒有的 ${path}。`);
  }
}

function compareIndexableEntries(pages, entries, failures) {
  if (!Array.isArray(entries)) {
    failures.push('build-web 的 PUBLIC_INDEXABLE_ENTRIES 必須是 array。');
    return;
  }

  const actual = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `build-web PUBLIC_INDEXABLE_ENTRIES[${index}]`;
    if (!isEntry(entry)) {
      failures.push(`${label} 必須是安全的 HTML entry 檔名。`);
      continue;
    }
    if (actual.has(entry))
      failures.push(`build-web PUBLIC_INDEXABLE_ENTRIES 重複宣告 ${entry}。`);
    actual.add(entry);
  }

  const expected = new Map(
    pages
      .filter((page) => page.indexable)
      .map((page) => [page.entry, page.route])
  );
  for (const [entry, route] of expected) {
    if (!actual.has(entry))
      failures.push(
        `build-web indexable allowlist 少了 ${entry}（manifest ${route} indexable=true）。`
      );
  }
  for (const entry of actual) {
    if (!expected.has(entry))
      failures.push(
        `build-web indexable allowlist 多出 ${entry}；manifest 沒有把它標成 indexable=true。`
      );
  }
}

const SCAN_ROUTES_EXPORT = 'PUBLIC_PAGE_SCAN_ROUTES';

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  )
    current = current.expression;
  return current;
}

/**
 * Read the explicit route declaration from a scan spec's TypeScript AST.
 *
 * Parsing an exported literal array makes comments inert and rejects computed
 * values/spreads. A quoted route anywhere else in the file therefore cannot
 * spoof coverage.
 */
export function extractPublicPageScanRoutes(source, sourcePath) {
  const failures = [];
  const routes = [];
  if (typeof source !== 'string') {
    failures.push(`${sourcePath} 來源必須是字串。`);
    return { failures, routes };
  }

  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    failures.push(
      `${sourcePath} 無法解析 TypeScript，不能驗證 ${SCAN_ROUTES_EXPORT}。`
    );
    return { failures, routes };
  }

  const declarations = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
    const constant =
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
    if (!exported || !constant) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === SCAN_ROUTES_EXPORT
      )
        declarations.push(declaration);
    }
  }

  if (declarations.length !== 1) {
    failures.push(
      `${sourcePath} 必須且只能 export 一份 const ${SCAN_ROUTES_EXPORT} literal array。`
    );
    return { failures, routes };
  }

  const declaration = declarations[0];
  if (declaration.initializer === undefined) {
    failures.push(`${sourcePath} 的 ${SCAN_ROUTES_EXPORT} 少了初始值。`);
    return { failures, routes };
  }
  const initializer = unwrapExpression(declaration.initializer);
  if (!ts.isArrayLiteralExpression(initializer)) {
    failures.push(
      `${sourcePath} 的 ${SCAN_ROUTES_EXPORT} 必須直接使用 literal array。`
    );
    return { failures, routes };
  }

  const seen = new Set();
  for (const [index, element] of initializer.elements.entries()) {
    if (
      !ts.isStringLiteral(element) &&
      !ts.isNoSubstitutionTemplateLiteral(element)
    ) {
      failures.push(
        `${sourcePath} 的 ${SCAN_ROUTES_EXPORT}[${index}] 必須是 route 字串 literal；不得 spread 或運算。`
      );
      continue;
    }
    const route = element.text;
    if (!isRoute(route)) {
      failures.push(
        `${sourcePath} 的 ${SCAN_ROUTES_EXPORT}[${index}]='${route}' 不是合法 public route。`
      );
      continue;
    }
    if (seen.has(route))
      failures.push(
        `${sourcePath} 的 ${SCAN_ROUTES_EXPORT} 重複宣告 ${route}。`
      );
    else {
      seen.add(route);
      routes.push(route);
    }
  }
  return { failures, routes };
}

function directIdentifierCall(node, name) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === name
  );
}

function playwrightTestCallback(call) {
  if (!directIdentifierCall(call, 'test')) return null;
  return (
    call.arguments.find(
      (argument) =>
        ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)
    ) ?? null
  );
}

function routeLoopVariable(statement) {
  if (!ts.isForOfStatement(statement)) return null;
  if (!ts.isVariableDeclarationList(statement.initializer)) return null;
  if (statement.initializer.declarations.length !== 1) return null;

  const declaration = statement.initializer.declarations[0];
  if (!ts.isIdentifier(declaration.name)) return null;
  const iterable = unwrapExpression(statement.expression);
  if (!ts.isIdentifier(iterable) || iterable.text !== SCAN_ROUTES_EXPORT)
    return null;
  return declaration.name.text;
}

function callbackExecutesRouteScan(callback, routeVariable, executorName) {
  if (!ts.isBlock(callback.body)) return false;

  const gotoPositions = [];
  const scanPositions = [];

  const visit = (node) => {
    // Nested callbacks and conditional expressions are not proof that every
    // route performs the navigation or scan.
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isConditionalExpression(node) ||
      (ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken
        ].includes(node.operatorToken.kind))
    )
      return;

    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'page' &&
        node.expression.name.text === 'goto' &&
        node.arguments.length > 0 &&
        ts.isIdentifier(unwrapExpression(node.arguments[0])) &&
        unwrapExpression(node.arguments[0]).text === routeVariable
      )
        gotoPositions.push(node.getStart());

      if (
        directIdentifierCall(node, executorName) &&
        node.arguments.length > 0 &&
        ts.isIdentifier(unwrapExpression(node.arguments[0])) &&
        unwrapExpression(node.arguments[0]).text === 'page'
      )
        scanPositions.push(node.getStart());
    }
    ts.forEachChild(node, visit);
  };

  // Only unconditional top-level callback statements count. A scanner hidden
  // under `if (route !== '/booking')` would otherwise let one declared route
  // escape while the gate still passed.
  for (const statement of callback.body.statements) {
    if (
      ts.isExpressionStatement(statement) ||
      ts.isVariableStatement(statement) ||
      ts.isReturnStatement(statement)
    )
      visit(statement);
  }
  return gotoPositions.some((gotoPosition) =>
    scanPositions.some((scanPosition) => scanPosition > gotoPosition)
  );
}

/**
 * Prove that the exported route list is an execution input, not only a
 * self-declared coverage claim. The contract is intentionally small and
 * static: a top-level for-of must register a Playwright test for each route,
 * and that test must navigate to the loop route before invoking the scan
 * helper with the same page.
 */
export function validatePublicPageScanExecution(
  source,
  sourcePath,
  executorName
) {
  if (typeof source !== 'string') return [];

  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  if (sourceFile.parseDiagnostics.length > 0) return [];

  const nonEmptyStaticArrays = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined
      ) {
        const initializer = unwrapExpression(declaration.initializer);
        if (
          ts.isArrayLiteralExpression(initializer) &&
          initializer.elements.length > 0
        )
          nonEmptyStaticArrays.add(declaration.name.text);
      }
    }
  }

  const registrationExecutesScan = (node, routeVariable, executorName) => {
    if (ts.isBlock(node))
      return node.statements.some((child) =>
        registrationExecutesScan(child, routeVariable, executorName)
      );
    if (ts.isExpressionStatement(node)) {
      const callback = playwrightTestCallback(node.expression);
      return (
        callback !== null &&
        callbackExecutesRouteScan(callback, routeVariable, executorName)
      );
    }
    if (ts.isForOfStatement(node)) {
      const iterable = unwrapExpression(node.expression);
      const definitelyNonEmpty =
        (ts.isIdentifier(iterable) &&
          nonEmptyStaticArrays.has(iterable.text)) ||
        (ts.isArrayLiteralExpression(iterable) && iterable.elements.length > 0);
      return (
        definitelyNonEmpty &&
        registrationExecutesScan(node.statement, routeVariable, executorName)
      );
    }
    // Conditions, optional callbacks and loops without a statically non-empty
    // iterable do not prove that every declared route registers a scan.
    return false;
  };

  let executes = false;
  for (const statement of sourceFile.statements) {
    const routeVariable = routeLoopVariable(statement);
    if (routeVariable === null) continue;

    executes = registrationExecutesScan(
      statement.statement,
      routeVariable,
      executorName
    );
    if (executes) break;
  }

  return executes
    ? []
    : [
        `${sourcePath} 宣告了 ${SCAN_ROUTES_EXPORT}，但沒有用它逐 route 註冊 test，並在同一測試內依序執行 page.goto(route) 與 ${executorName}(page)。`
      ];
}

function compareScans(pages, scanSources, failures) {
  if (!(scanSources instanceof Map) && !isRecord(scanSources))
    failures.push('scanSources 必須是 object 或 Map。');

  const pagesByRoute = new Map(pages.map((page) => [page.route, page]));
  const expectedByScan = new Map(
    Object.keys(SCAN_SPECS).map((scan) => [scan, new Set()])
  );
  for (const page of pages) {
    for (const scan of page.scans) {
      if (!hasOwn(SCAN_SPECS, scan)) continue;
      expectedByScan.get(scan)?.add(page.route);
    }
  }

  for (const [scan, sourcePath] of Object.entries(SCAN_SPECS)) {
    const source =
      scanSources instanceof Map
        ? scanSources.get(scan)
        : isRecord(scanSources)
          ? scanSources[scan]
          : undefined;
    if (typeof source !== 'string') {
      failures.push(`${scan} 沒有注入 ${sourcePath} 的來源。`);
      continue;
    }

    const parsed = extractPublicPageScanRoutes(source, sourcePath);
    failures.push(...parsed.failures);
    if (parsed.failures.length === 0)
      failures.push(
        ...validatePublicPageScanExecution(
          source,
          sourcePath,
          SCAN_EXECUTORS[scan]
        )
      );
    const actual = new Set(parsed.routes);
    const expected = expectedByScan.get(scan) ?? new Set();

    for (const route of expected) {
      if (!actual.has(route))
        failures.push(
          `${route} 宣告要跑 ${scan}，但 ${sourcePath} 的 ${SCAN_ROUTES_EXPORT} 少了這個路由。`
        );
    }
    for (const route of actual) {
      if (expected.has(route)) continue;
      if (!pagesByRoute.has(route))
        failures.push(
          `${sourcePath} 的 ${SCAN_ROUTES_EXPORT} 多出 manifest 沒有的 ${route}。`
        );
      else
        failures.push(
          `${sourcePath} 宣告 ${route}，但 manifest 沒有為該頁啟用 ${scan}。`
        );
    }
  }
}

/**
 * 純函式檢查核心。測試可注入縮小 fixture，不需碰真實檔案或啟動 server。
 */
export function checkPublicPageConfiguration({
  inventory,
  budgets,
  serverSource,
  firebase,
  buildIndexableEntries,
  scanSources = {},
  dataRouteSources = {}
}) {
  const failures = [];
  const pages = validateInventory(inventory, failures);
  const expected = buildExpectedRouting(pages, dataRouteSources, failures);
  const parsedServer = extractPrettyPaths(serverSource);
  failures.push(...parsedServer.failures);

  compareBudgets(pages, budgets, failures);
  compareIndexableEntries(pages, buildIndexableEntries, failures);
  compareServerMappings(
    expected.serverMappings,
    expected.redirects,
    parsedServer.mappings,
    failures
  );
  compareFirebaseRewrites(
    expected.rewrites,
    firebaseRules(firebase, 'rewrites', failures),
    failures
  );
  compareFirebaseRedirects(
    expected.redirects,
    firebaseRules(firebase, 'redirects', failures),
    failures
  );
  compareScans(pages, scanSources, failures);

  return {
    failures,
    pageCount: pages.length,
    dataRouteCount: expected.dataRouteCount
  };
}

async function repositoryInputs() {
  const scanSources = {};
  for (const [scan, path] of Object.entries(SCAN_SPECS))
    scanSources[scan] = await read(...path.split('/'));

  const buildWeb = await import(new URL('./build-web.mjs', import.meta.url));
  const clinicContent = await import(
    new URL('../apps/web/public/clinic-content.js', import.meta.url)
  );
  return {
    inventory: JSON.parse(await read('apps', 'web', 'public-pages.json')),
    budgets: JSON.parse(await read('apps', 'web', 'performance-budget.json')),
    serverSource: await read('apps', 'web', 'server.mjs'),
    firebase: JSON.parse(await read('firebase.json')),
    buildIndexableEntries: buildWeb.PUBLIC_INDEXABLE_ENTRIES,
    scanSources,
    dataRouteSources: {
      CLINIC_ROUTES: clinicContent.CLINIC_ROUTES
    }
  };
}

async function runCli() {
  try {
    const result = checkPublicPageConfiguration(await repositoryInputs());
    if (result.failures.length > 0) {
      console.error('Public-page inventory check failed:');
      for (const failure of result.failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `Public-page inventory check passed (${result.pageCount} 個進入點、${result.dataRouteCount} 條資料驅動的官網路由，與預算、server、Hosting 與掃描矩陣雙向一致).`
    );
  } catch (error) {
    console.error('Public-page inventory check failed:');
    console.error(
      `- 無法載入或解析檢查輸入：${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  resolve(invokedPath) === fileURLToPath(import.meta.url)
)
  await runCli();
