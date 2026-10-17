// 架構守衛的純判斷邏輯。
//
// `check-architecture.mjs` 的流程全部在 top-level 執行（讀檔、走目錄、寫
// process.exitCode），直接 import 會執行整道 gate；CLI 的故障測試因此以
// filesystem mock 覆蓋讀取邊界。純判斷邏輯抽到這裡，普通測試不需觸及 I/O——
// 這與 `unrouted-inventory.mjs` 的拆法一致。
//
// 這裡的每一個函式都不碰檔案系統，輸入是字串或已讀好的檔案清單。
import { posix } from 'node:path';
import ts from 'typescript';

/**
 * 移除註解，但**保留字串內容**。
 *
 * 「這個檔案有沒有自己重寫一份 domain 規則」的守衛是靠字面比對；如果連字串
 * 一起剝掉，守衛會漏掉真正寫在字串裡的規則，而如果不剝註解，一段解釋規則的
 * 中文註解會被誤判成違規。兩者都會讓守衛失去意義，方向相反而已。
 */
export function stripComments(source) {
  const parsed = ts.createSourceFile(
    'architecture-comments.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const ranges = new Map();
  const collect = (comments) => {
    for (const range of comments ?? []) {
      ranges.set(`${range.pos}:${range.end}`, range);
    }
  };
  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(source, node.pos));
    collect(ts.getTrailingCommentRanges(source, node.end));
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  let output = '';
  let cursor = 0;
  for (const range of [...ranges.values()].sort((a, b) => a.pos - b.pos)) {
    if (range.end <= cursor) continue;
    if (range.pos > cursor) output += source.slice(cursor, range.pos);
    cursor = range.end;
  }
  return output + source.slice(cursor);
}

/**
 * 靜態與動態匯入的模組指定字串。
 *
 * 只讀 compiler AST 的字面 module specifier，不求值 source。註解、字串與 regex
 * decoy 不會產生匯入；compact 語法、type import 與 dynamic import options 保留。
 * 非字面動態載入仍交由 opaqueDynamicImports 依既有契約 fail closed。
 */
function literalModuleSpecifier(node) {
  let value = node;
  while (value !== undefined && ts.isParenthesizedExpression(value)) {
    value = value.expression;
  }
  return value !== undefined && ts.isStringLiteralLike(value)
    ? value.text
    : undefined;
}

export function importSpecifiers(source) {
  const parsed = ts.createSourceFile(
    'architecture-imports.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const found = [];
  const addLiteral = (node) => {
    const specifier = literalModuleSpecifier(node);
    if (specifier !== undefined) found.push(specifier);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      addLiteral(node.arguments[0]);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteral(node.moduleReference.expression);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      addLiteral(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/**
 * Walk a browser ESM graph whose sources are keyed by repository-relative,
 * POSIX-style paths. Only literal relative imports discovered by
 * `importSpecifiers` create edges, so comments and decoy strings cannot make a
 * module appear reachable.
 */
export function reachableRelativeModules(entry, sources) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || seen.has(current)) continue;
    const source = sources.get(current);
    if (source === undefined) continue;
    seen.add(current);
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const base = current.slice(0, current.lastIndexOf('/') + 1);
      const parts = `${base}${specifier}`.split('/');
      const normalized = [];
      for (const part of parts) {
        if (part === '' || part === '.') continue;
        if (part === '..') normalized.pop();
        else normalized.push(part);
      }
      const target = normalized.join('/');
      if (sources.has(target)) queue.push(target);
    }
  }
  return seen;
}

/**
 * 走訪**看不透**的模組載入。
 *
 * `importSpecifiers` 是靜態比對，只認得字面值。這在 2026-08-06 的對抗測試裡被
 * 證實可繞過：在 `main.ts` 加一行
 *
 *     const target = './appointments/appointment.application-service.js';
 *     await import(target);
 *
 * 之後 `check:architecture` 依然全綠，而該檔案仍列在 `unrouted-inventory.json`
 * 裡宣稱「未接線」——實測 `probe()` 確實把它載進來並取得三個匯出。整個專案
 * 「被決策擋住的能力到不了」的論述就靠這道走訪，所以這是可達性分析的地基問題，
 * 不是風格問題。
 *
 * 六個確認可繞過的向量：計算後的指定字串、帶插值的樣板字串、字串相接、
 * `createRequire`、把 `import` 包成別名函式，以及無插值樣板字串（後者現在已由
 * `importSpecifiers` 正常解析）。
 *
 * 修法不是去求值任意運算式——那等於實作一個直譯器，而且永遠追不完。改成**遇到
 * 看不透的載入就失敗**：可達性分析不可靠的當下就停下來，由作者改成字面值。
 * 這是 fail-closed，不是 best-effort。
 */
export function opaqueDynamicImports(source) {
  const sourceFile = ts.createSourceFile(
    'opaque-import-check.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const found = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifier = node.arguments[0];
      if (literalModuleSpecifier(specifier) === undefined) {
        found.push(
          `import(${specifier?.getText(sourceFile).slice(0, 48) ?? ''}`
        );
      }
    }
    if (ts.isIdentifier(node) && node.text === 'createRequire')
      found.push('createRequire(...)');
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...new Set(found)];
}

/** 相對路徑（`.` 或 `/` 開頭）以外的都是裸名。 */
export function isBareSpecifier(specifier) {
  return !(specifier.startsWith('.') || specifier.startsWith('/'));
}

/**
 * 找出某一層裡不被允許的裸名匯入。
 *
 * `files` 是 `{ path, source }` 陣列，由呼叫端負責讀檔。回傳的每一筆都帶著
 * 該層的 `why`，因為守衛擋下來的當下，人最需要知道的是「為什麼這一層不能這樣
 * 匯入」而不是「哪一行違規」。
 */
export function layerViolations(layer, files) {
  const allowed = new Set(layer.allowedBare ?? []);
  const violations = [];
  for (const { path, source } of files) {
    for (const specifier of importSpecifiers(source)) {
      if (!isBareSpecifier(specifier)) continue;
      if (allowed.has(specifier)) continue;
      violations.push({
        path,
        specifier,
        detail: `${path} 匯入了 '${specifier}'。${layer.why}`
      });
    }
  }
  return violations;
}

/**
 * Ensure browser-shared source modules cannot reach a server-only source module.
 * The server-only entry itself may still import ordinary pure domain modules.
 */
export function serverOnlyBoundaryViolations(
  files,
  { serverOnlySuffix = '.node.ts', testSuffix = '.test.ts' } = {}
) {
  const sources = new Map(files.map(({ path, source }) => [path, source]));
  const availablePaths = new Set(sources.keys());
  const violations = [];

  function resolveSourcePath(current, specifier) {
    if (!specifier.startsWith('.')) return undefined;
    const joined = posix.normalize(
      posix.join(posix.dirname(current), specifier)
    );
    const candidates = [joined];
    if (joined.endsWith('.js'))
      candidates.push(`${joined.slice(0, -'.js'.length)}.ts`);
    else if (!/\.[^/]+$/.test(joined)) candidates.push(`${joined}.ts`);
    candidates.push(posix.join(joined, 'index.ts'));
    return candidates.find((candidate) => availablePaths.has(candidate));
  }

  for (const [entryPath] of sources) {
    if (
      !entryPath.endsWith('.ts') ||
      entryPath.endsWith(serverOnlySuffix) ||
      entryPath.endsWith(testSuffix)
    )
      continue;

    for (const occurrence of opaqueDynamicImports(
      sources.get(entryPath) ?? ''
    )) {
      violations.push({
        path: entryPath,
        chain: [entryPath],
        detail: `${entryPath} contains an unresolved module load (${occurrence}); the server-only boundary cannot verify it.`
      });
    }

    const pending = [{ path: entryPath, chain: [entryPath] }];
    const visited = new Set([entryPath]);
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) continue;
      const source = sources.get(current.path);
      if (source === undefined) continue;

      for (const specifier of importSpecifiers(source)) {
        const target = resolveSourcePath(current.path, specifier);
        if (target === undefined) continue;
        const chain = [...current.chain, target];
        if (target.endsWith(serverOnlySuffix)) {
          violations.push({
            path: entryPath,
            target,
            chain,
            detail: `${entryPath} reaches server-only module ${target} through ${chain.join(' -> ')}.`
          });
          continue;
        }
        if (visited.has(target)) continue;
        visited.add(target);
        pending.push({ path: target, chain });
      }
    }
  }

  return violations;
}

/**
 * 找出瀏覽器端自己重寫 domain 規則的痕跡。
 *
 * 比對前先剝註解：一段引用規則來解釋「為什麼要走 domain」的註解，不應該被判成
 * 違規；而真正寫在程式碼字串裡的規則必須被抓到。
 */
export function forbiddenBrowserPatterns(source, rules) {
  const stripped = stripComments(source);
  return rules
    .filter(({ pattern }) => pattern.test(stripped))
    .map(({ detail }) => detail);
}
