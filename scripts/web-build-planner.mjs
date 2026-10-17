import { createHash } from 'node:crypto';
import { posix } from 'node:path';

// No repository reads: callers supply canonical configuration explicitly.
const HTML_EXTENSION = '.html';
const PUBLIC_ENTRY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/;

/**
 * public-pages.json owns the allowlist of pages that a formal build may make
 * indexable. Keep this small validation here as well as in check:pages so a
 * direct `pnpm build:web` fails closed instead of silently ignoring malformed
 * metadata.
 */
export function indexableEntriesFromPublicPages(inventory) {
  if (
    typeof inventory !== 'object' ||
    inventory === null ||
    Array.isArray(inventory) ||
    !Array.isArray(inventory.pages)
  )
    throw new Error('public-pages.json must contain a pages array.');

  const entries = [];
  const seen = new Set();
  for (const [index, page] of inventory.pages.entries()) {
    if (typeof page !== 'object' || page === null || Array.isArray(page))
      throw new Error(`public-pages.json pages[${index}] must be an object.`);
    if (
      typeof page.entry !== 'string' ||
      !PUBLIC_ENTRY_PATTERN.test(page.entry)
    )
      throw new Error(
        `public-pages.json pages[${index}].entry must be a safe HTML entry filename.`
      );
    if (typeof page.indexable !== 'boolean')
      throw new Error(
        `public-pages.json pages[${index}].indexable must be boolean.`
      );
    if (seen.has(page.entry))
      throw new Error(`public-pages.json repeats entry ${page.entry}.`);
    seen.add(page.entry);
    if (page.indexable) entries.push(page.entry);
  }
  return entries;
}

const DECISION_PATTERN = /^D-\d{3}$/;

/**
 * 每頁發布核准的單一正典判定（canonical publication decision）。
 *
 * indexAllowed = 全域開關 AND indexable AND 所需決策已核准。
 * 預設關閉：任一條件不滿足即不可索引、不可進 sitemap。全域開關只是必要條件，
 * 永遠不是充分條件——它打不開缺少每頁核准的頁面。
 */
export function readDecisionApproval(registerText, decisionId) {
  if (typeof registerText !== 'string' || !DECISION_PATTERN.test(decisionId))
    return false;
  for (const line of registerText.split('\n')) {
    const match = /^\|\s*(D-\d{3})\s*\|[^|]*\|[^|]*\|\s*([^|]*?)\s*\|/.exec(
      line
    );
    if (match === null || match[1] !== decisionId) continue;
    return /^approved\b/i.test(match[2]);
  }
  return false;
}

/** 登錄裡出現過的決策編號集合；requiresDecision 引用不存在的編號即 gate 失敗。 */
export function listRegisterDecisions(registerText) {
  const ids = new Set();
  if (typeof registerText !== 'string') return ids;
  for (const line of registerText.split('\n')) {
    const match = /^\|\s*(D-\d{3})\s*\|/.exec(line);
    if (match !== null) ids.add(match[1]);
  }
  return ids;
}

/**
 * 整份 inventory 的發布判定表（entry → decision），建置與 gate 共用同一個函式，
 * 不會有兩份算法各自解讀核准。
 */
export function publishDecisionsForInventory(
  inventory,
  registerText,
  globalRelease
) {
  const decisions = new Map();
  const pages =
    inventory !== null &&
    typeof inventory === 'object' &&
    Array.isArray(inventory.pages)
      ? inventory.pages
      : [];
  for (const page of pages) {
    if (
      typeof page !== 'object' ||
      page === null ||
      typeof page.entry !== 'string'
    )
      continue;
    decisions.set(
      page.entry,
      pagePublishDecision(page, {
        globalRelease,
        isDecisionApproved: (decision) =>
          readDecisionApproval(registerText, decision)
      })
    );
  }
  return decisions;
}

export function pagePublishDecision(
  page,
  { globalRelease, isDecisionApproved }
) {
  if (!globalRelease) return { index: false, inSitemap: false };
  if (typeof page !== 'object' || page === null || page.indexable !== true)
    return { index: false, inSitemap: false };
  if (
    typeof page.requiresDecision === 'string' &&
    !isDecisionApproved(page.requiresDecision)
  )
    return { index: false, inSitemap: false };
  return { index: true, inSitemap: true };
}

function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** 內容雜湊塞在副檔名前：styles.css → styles.<hash>.css。 */
function hashedBasename(path, hash) {
  const base = posix.basename(path);
  const dot = base.lastIndexOf('.');
  return `${base.slice(0, dot)}.${hash}${base.slice(dot)}`;
}

// 只改寫相對匯入（./ 或 ../）。靜態匯入會進入 modulepreload；動態
// import 則是真正的延遲載入邊界，只參與內容雜湊與檔名改寫，不可被
// preload 拉回首頁負載。CAL-PILOT 的 Google/TOTP 客戶端就靠這個邊界
// 等後端確認功能已啟用後才下載。
const STATIC_IMPORT_SPECIFIER =
  /(\bfrom\s*|\bimport\s*)(['"])(\.[^'"]+\.js)\2/g;
const DYNAMIC_IMPORT_SPECIFIER = /\bimport\s*\(\s*(['"])(\.[^'"]+\.js)\1\s*\)/g;
// 延遲載入的樣式表同樣要指向雜湊檔名。esbuild 會把 `stylesheet`
// 這類區域識別字縮成單一字母，所以要接受任何簡單識別字的 `.href`；
// 仍只改寫存在於 manifest 的相對 CSS，避免誤碰一般網址。
const LAZY_STYLE_SPECIFIER =
  /([A-Za-z_$][\w$]*\.href\s*=\s*)(['"])(\.[^'"]+\.css(?:[?#][^'"]*)?)\2/g;

// HTML 進入點掛載模組的方式，以及注入 preload 的錨點。
const MODULE_ENTRY = /<script\s+type="module"\s+src="(\/[^"]+\.js)"/g;
const CLOSING_HEAD = /(?:(\r?\n)([ \t]*))?<\/head>/;

function staticSpecifiers(source) {
  const found = new Set();
  for (const match of source.matchAll(STATIC_IMPORT_SPECIFIER))
    found.add(match[3]);
  return [...found];
}

function dynamicSpecifiers(source) {
  const found = new Set();
  for (const match of source.matchAll(DYNAMIC_IMPORT_SPECIFIER))
    found.add(match[2]);
  return [...found];
}

function relativeSpecifiers(source) {
  return [
    ...new Set([...staticSpecifiers(source), ...dynamicSpecifiers(source)])
  ];
}

/** 把匯入者裡的相對規格解析成以 public 根為基準的 POSIX 路徑。 */
function resolveSpecifier(importerPath, specifier) {
  return posix.normalize(posix.join(posix.dirname(importerPath), specifier));
}

// Scan CSS tokens, not arbitrary text: comments and ordinary strings are not URLs.
// The planner and performance closure share the same URL identity rules.
export function cssAssetReferences(source) {
  const refs = [];
  const gap = (start) => {
    let i = start;
    while (i < source.length) {
      if (/\s/.test(source[i])) {
        i += 1;
        continue;
      }
      if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2);
        i = end === -1 ? source.length : end + 2;
        continue;
      }
      break;
    }
    return i;
  };
  const string = (start) => {
    let end = start + 1;
    while (end < source.length) {
      if (source[end] === '\\') {
        end += 2;
        continue;
      }
      if (source[end] === source[start]) return { start: start + 1, end };
      end += 1;
    }
    throw new Error('Unterminated CSS string.');
  };
  const identifier = (start) => {
    let end = start;
    while (end < source.length) {
      if (/[\w\u0080-\uffff-]/.test(source[end])) {
        end += 1;
        continue;
      }
      const escaped =
        /^\\(?:[0-9a-f]{1,6}(?:\r\n|[ \t\r\n\f])?|[^\r\n\f])/i.exec(
          source.slice(end)
        );
      if (escaped === null) break;
      end += escaped[0].length;
    }
    return {
      end,
      value: decodeCssEscapes(source.slice(start, end)).toLowerCase()
    };
  };
  const add = (token) =>
    refs.push({
      ...token,
      value: decodeCssEscapes(source.slice(token.start, token.end))
    });
  const url = (opening) => {
    const start = gap(opening + 1);
    let token;
    let closing;
    if (source[start] === '"' || source[start] === "'") {
      token = string(start);
      closing = gap(token.end + 1);
    } else {
      closing = start;
      while (closing < source.length && source[closing] !== ')')
        closing += source[closing] === '\\' ? 2 : 1;
      let end = closing;
      while (end > start && /\s/.test(source[end - 1])) end -= 1;
      token = { start, end };
    }
    if (source[closing] !== ')') throw new Error('Unterminated CSS url().');
    add(token);
    return closing + 1;
  };
  // At-rule predicates/namespaces identify conditions or names, not downloads.
  // Stop before the block so normal declarations inside it are still scanned.
  const preludeEnd = (start) => {
    let i = start;
    let depth = 0;
    while (i < source.length) {
      if (source.startsWith('/*', i)) {
        i = gap(i);
        continue;
      }
      if (source[i] === '"' || source[i] === "'") {
        i = string(i).end + 1;
        continue;
      }
      if (source[i] === '\\') {
        i += 2;
        continue;
      }
      if (source[i] === '(' || source[i] === '[') depth += 1;
      if (source[i] === ')' || source[i] === ']') depth -= 1;
      if (depth === 0 && source[i] === '{') return i;
      if (depth === 0 && source[i] === ';') return i + 1;
      i += 1;
    }
    return i;
  };
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('/*', i)) {
      i = gap(i);
      continue;
    }
    if (source[i] === '"' || source[i] === "'") {
      i = string(i).end + 1;
      continue;
    }
    if (source[i] === '@') {
      const name = identifier(i + 1);
      let next = gap(name.end);
      if (name.value === 'import') {
        if (source[next] === '"' || source[next] === "'") {
          const token = string(next);
          add(token);
          next = token.end + 1;
        } else {
          const target = identifier(next);
          if (target.value !== 'url' || source[target.end] !== '(')
            throw new Error('CSS @import requires a string or URL.');
          next = url(target.end);
        }
      }
      i = preludeEnd(next);
      continue;
    }
    const name = identifier(i);
    if (name.end > i) {
      i =
        name.value === 'url' && source[name.end] === '('
          ? url(name.end)
          : name.end;
      continue;
    }
    i += 1;
  }
  return refs;
}

function decodeCssEscapes(value) {
  return value.replace(
    /\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|([^\r\n\f])|\r\n|[\r\n\f])/gi,
    (_whole, hex, escaped) => {
      if (hex === undefined) return escaped ?? '';
      const code = Number.parseInt(hex, 16);
      return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
        ? '\ufffd'
        : String.fromCodePoint(code);
    }
  );
}

export function resolveCssReference(importer, value) {
  const url = value.trim();
  if (url === '' || /^(?:[a-z][a-z0-9+.-]*:|\/\/|[?#])/i.test(url))
    return undefined;
  const split = url.search(/[?#]/);
  const pathname = split === -1 ? url : url.slice(0, split);
  const suffix = split === -1 ? '' : url.slice(split);
  const decoded = decodeURIComponent(pathname);
  const absolute = pathname.startsWith('/');
  const path = posix.normalize(
    absolute ? decoded.slice(1) : posix.join(posix.dirname(importer), decoded)
  );
  if (path === '..' || path.startsWith('../'))
    throw new Error(`CSS reference escapes the asset root: ${importer}`);
  return { path, suffix, absolute, explicitDot: pathname.startsWith('./') };
}

function rewriteCssUrl(importer, reference, output) {
  if (output.startsWith('@scc:')) return output + reference.suffix;
  let path = reference.absolute
    ? '/' + output
    : posix.relative(posix.dirname(importer), output);
  if (!reference.absolute && reference.explicitDot && !path.startsWith('.'))
    path = './' + path;
  const encoded = path
    .split('/')
    .map((part) =>
      encodeURIComponent(part).replace(
        /['()]/g,
        (char) => '%' + char.charCodeAt(0).toString(16)
      )
    )
    .join('/');
  return (
    encoded +
    reference.suffix.replace(/[\s"'()\\]/g, (char) =>
      encodeURIComponent(char).replace(
        /['()]/g,
        (x) => '%' + x.charCodeAt(0).toString(16)
      )
    )
  );
}

/**
 * Tarjan's strongly-connected components, returned dependencies-first.
 *
 * The JS graph is not a DAG: ES modules allow import cycles, and cyclic files
 * cannot be given independent content hashes — there is no order in which each
 * one's hash is known before the other needs it. The answer is to hash each SCC
 * as a unit: every file in a cycle shares one hash and busts together, which is
 * correct because a change to either changes what the other resolves.
 */
function stronglyConnectedComponents(nodes, edgesOf) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;

  const strongConnect = (node) => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);

    for (const next of edgesOf(node)) {
      if (!index.has(next)) {
        strongConnect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), index.get(next)));
      }
    }

    if (low.get(node) === index.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  };

  for (const node of nodes) if (!index.has(node)) strongConnect(node);
  // Tarjan emits components in reverse topological order, which is exactly
  // dependencies-first for the condensation graph.
  return components;
}

/**
 * The pure core: given every public file as path → content, return the hashed
 * outputs and a source → output manifest. No I/O, so the build can be unit
 * tested by handing it a synthetic file set.
 *
 * Assets are content-hashed so they can be cached immutably: a change produces
 * a new name, so a stale cache can never serve the wrong bytes. Dependencies
 * are hashed before dependents (SCC-condensed topological order) so every hash
 * reflects the exact bytes that will be fetched transitively.
 */
export function planHashedBuild(
  files,
  { hashLength = 10, inventory, registerText, globalRelease = false } = {}
) {
  if (typeof registerText !== 'string')
    throw new Error('An explicit decision register text is required.');
  const jsPaths = [];
  const cssPaths = [];
  const htmlPaths = [];
  const otherPaths = [];
  for (const path of files.keys()) {
    const extension = extensionOf(path);
    if (extension === '.js') jsPaths.push(path);
    else if (extension === '.css') cssPaths.push(path);
    else if (extension === HTML_EXTENSION) htmlPaths.push(path);
    else otherPaths.push(path);
  }

  const assetPaths = [...cssPaths, ...jsPaths];
  const assetSet = new Set(assetPaths);
  const cssReferences = new Map(
    cssPaths.map((path) => [
      path,
      cssAssetReferences(String(files.get(path))).map((ref) => ({
        ...ref,
        resolved: resolveCssReference(path, ref.value)
      }))
    ])
  );
  const cssTargets = (path) =>
    (cssReferences.get(path) ?? []).flatMap((ref) =>
      ref.resolved === undefined ? [] : [ref.resolved.path]
    );
  for (const path of cssPaths)
    for (const target of cssTargets(path))
      if (!files.has(target))
        throw new Error(
          `CSS ${path} references ${target}, which the build cannot emit.`
        );
  const lazyTargets = (path) =>
    [...String(files.get(path)).matchAll(LAZY_STYLE_SPECIFIER)].map(
      (match) => resolveCssReference(path, match[3]).path
    );
  for (const path of jsPaths)
    for (const target of lazyTargets(path))
      if (!files.has(target))
        throw new Error(
          `Module ${path} references missing stylesheet ${target}.`
        );
  // Include stylesheet hrefs in hashing, never in modulepreload.
  const dependencies = new Map(
    assetPaths.map((path) => [
      path,
      (extensionOf(path) === '.css'
        ? cssTargets(path)
        : [
            ...relativeSpecifiers(String(files.get(path))).map((specifier) =>
              resolveSpecifier(path, specifier)
            ),
            ...lazyTargets(path)
          ]
      ).filter((target) => assetSet.has(target))
    ])
  );
  // 首頁 preload 只能走靜態邊；若把動態邊也放進去，延遲載入
  // 就會形同虛設。
  const staticDependencies = new Map(
    jsPaths.map((path) => [
      path,
      staticSpecifiers(String(files.get(path)))
        .map((specifier) => resolveSpecifier(path, specifier))
        .filter((target) => files.has(target))
    ])
  );

  const components = stronglyConnectedComponents(
    assetPaths,
    (path) => dependencies.get(path) ?? []
  );

  // source path → 對外的絕對網址（帶雜湊）。
  const servedUrl = new Map();
  const outputs = new Map();
  const manifest = new Map();

  // 把一個相對匯入改寫成指定的目標檔名，保留相對目錄前綴。
  const rewriteImports = (source, importer, basenameFor) => {
    const staticRewritten = source.replace(
      STATIC_IMPORT_SPECIFIER,
      (whole, keyword, quote, specifier) => {
        const target = resolveSpecifier(importer, specifier);
        const basename = basenameFor(target);
        if (basename === undefined) return whole;
        return `${keyword}${quote}${specifier.replace(/[^/]+$/, basename)}${quote}`;
      }
    );
    return staticRewritten.replace(
      DYNAMIC_IMPORT_SPECIFIER,
      (whole, quote, specifier) => {
        const target = resolveSpecifier(importer, specifier);
        const basename = basenameFor(target);
        if (basename === undefined) return whole;
        return `import(${quote}${specifier.replace(/[^/]+$/, basename)}${quote})`;
      }
    );
  };

  const rewriteLazyStyles = (source, importer, outputFor) =>
    source.replace(LAZY_STYLE_SPECIFIER, (whole, prefix, quote, specifier) => {
      const reference = resolveCssReference(importer, specifier);
      const output = outputFor(reference.path);
      return output === undefined
        ? whole
        : `${prefix}${quote}${rewriteCssUrl(importer, reference, output)}${quote}`;
    });
  const rewriteCss = (source, importer, outputFor) => {
    let result = source;
    for (const ref of [...cssReferences.get(importer)].reverse()) {
      if (ref.resolved === undefined) continue;
      const output = outputFor(ref.resolved.path);
      if (output === undefined) continue; // Stable, unhashed copied resource.
      result =
        result.slice(0, ref.start) +
        rewriteCssUrl(importer, ref.resolved, output) +
        result.slice(ref.end);
    }
    return result;
  };
  const rewriteAsset = (path, outputFor) => {
    const source = String(files.get(path));
    if (extensionOf(path) === '.css')
      return rewriteCss(source, path, outputFor);
    return rewriteImports(
      rewriteLazyStyles(source, path, outputFor),
      path,
      (target) => {
        const output = outputFor(target);
        return output === undefined || output.startsWith('@scc:')
          ? output
          : posix.basename(output);
      }
    );
  };

  const emit = (sourcePath, content) => {
    outputs.set(manifest.get(sourcePath), content);
  };

  for (const component of components) {
    const members = new Set(component);
    const canonicalize = (path) =>
      rewriteAsset(path, (target) =>
        members.has(target) ? `@scc:${target}` : manifest.get(target)
      );
    const singletonCss =
      component.length === 1 &&
      extensionOf(component[0]) === '.css' &&
      !dependencies.get(component[0]).includes(component[0]);
    let hashInput = singletonCss
      ? canonicalize(component[0])
      : [...members]
          .sort()
          .map((path) => `${path}\u0000${canonicalize(path)}`)
          .join('\u0000');
    // Copied assets keep their names/bytes, but CSS cache keys still track their bytes.
    const copied = [
      ...new Set(
        [...members].flatMap(cssTargets).filter((path) => !assetSet.has(path))
      )
    ].sort();
    if (copied.length > 0)
      hashInput +=
        '\u0000' +
        copied
          .map((path) => `${path}\u0000${sha256(files.get(path))}`)
          .join('\u0000');
    const hash = sha256(hashInput).slice(0, hashLength);
    for (const path of members) {
      const outPath = posix.join(
        posix.dirname(path),
        hashedBasename(path, hash)
      );
      manifest.set(path, outPath);
      servedUrl.set(path, `/${outPath}`);
    }
    for (const path of members)
      emit(
        path,
        rewriteAsset(path, (target) => manifest.get(target))
      );
  }

  /**
   * 移除 HTML 註解。
   *
   * 這個專案的註解密度很高，而且是刻意的：規則與理由寫在它們生效的地方旁邊。
   * 但那些字對瀏覽器毫無用處，卻是**每一次載入**都要傳的位元組。2026-07-25 已經
   * 修過同一類問題的 CSS 版本（當時發現建置把樣式表註解原封不動出貨），HTML 這
   * 一份那次沒有一起處理，也沒有任何檢查會指出它——直到 2026-07-27 加了幾段說明
   * 就撞破 document 預算，才被 `check:perf` 逼出來。
   *
   * 只拿掉註解，**不動空白、不動屬性引號**：那類「壓縮」讓產物幾乎無法與原始碼
   * 比對，而省下的量遠小於它帶來的除錯成本。`<!doctype html>` 不是註解，不受影響。
   */
  const htmlCommentPattern = new RegExp('<!--[\\s\\S]*?-->', 'g');
  const stripHtmlComments = (html) => html.replace(htmlCommentPattern, '');

  // HTML 是穩定進入點：改寫它對 js/css 的 root-absolute 參照，其餘（HTML 內部
  // 連結、圖片、錨點）原封不動。
  const rewriteHtmlReferences = (html) =>
    html.replace(
      /\b(src|href)="(\/[^"]+\.(?:js|css))"/g,
      (whole, attribute, url) => {
        const sourcePath = url.slice(1);
        const served = servedUrl.get(sourcePath);
        return served === undefined ? whole : `${attribute}="${served}"`;
      }
    );

  // 進入點模組的傳遞閉包，BFS 順序（相依先於它的相依）。
  const moduleClosure = (entry) => {
    const order = [];
    const seen = new Set([entry]);
    const queue = [entry];
    while (queue.length > 0) {
      const current = queue.shift();
      order.push(current);
      for (const next of staticDependencies.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return order;
  };

  /**
   * 在 <head> 注入整個模組圖的 `modulepreload`。
   *
   * 為什麼需要：模組是逐檔出貨的（不做 bundling，刻意保留 dist 與 public 的逐檔
   * 對應），而 `<script type="module">` 掛在 <body> 末端。瀏覽器因此只能一層一層
   * 地發現相依——實測患者頁要 5 趟連續往返才把 31 個模組收齊，其中 18 個要到
   * 第 4 趟才第一次被看到。手機上這是開機前先付掉的純延遲。
   *
   * `modulepreload` 把整張圖在解析 <head> 時就一次宣告完，往返從 5 趟壓成 1 趟。
   * 這不放寬 CSP：preload 的來源仍受 `script-src 'self'` 管轄，且注入的是同源的
   * 雜湊檔名。
   *
   * 進入點自己也列入：它的 <script> 標籤在 <body> 末端，早一點開始抓沒有壞處，
   * 而且 module map 會去重，不會下載兩次。
   */
  const withModulePreloads = (rewritten, source) => {
    const preloaded = new Set();
    for (const match of source.matchAll(MODULE_ENTRY)) {
      const entry = match[1].slice(1);
      if (!files.has(entry)) continue;
      for (const path of moduleClosure(entry)) preloaded.add(path);
    }
    if (preloaded.size === 0) return rewritten;

    const links = [...preloaded].map(
      (path) => `<link rel="modulepreload" href="${servedUrl.get(path)}" />`
    );
    const closingHead = CLOSING_HEAD.exec(rewritten);
    if (closingHead === null) {
      throw new Error(
        'An HTML entry point declares a module script but has no </head> to preload into.'
      );
    }
    // 縮排跟著 </head> 走，讓產物仍然讀得下去——dist 被 .prettierignore 排除，
    // 沒有排版器會來收拾。
    const [whole, newline = '', indent = ''] = closingHead;
    return rewritten.replace(
      whole,
      links.map((link) => `${newline}${indent}  ${link}`).join('') + whole
    );
  };

  // 上線那天最典型的一個災難：預覽站的 `noindex` 被原封不動帶到正式站，網站
  // 從此不出現在 Google，而且**沒有任何錯誤訊息**——通常要好幾個月後才有人發現
  // 「怎麼都搜不到我們」。
  //
  // 所以不要靠「記得刪掉」。原始碼永遠保持 noindex（預設安全），要發正式站時
  // 設 `WEB_PUBLIC_INDEXABLE=true`，由建置**移除**那一行；實際 allowlist 直接來自
  // public-pages.json 的 indexable metadata。工作臺、clinic preview 與 404 目前
  // 都是 false，不能因為這支建置腳本留著另一份過期陣列而意外被放行。
  //
  // 但全域開關只是必要條件：真正放行的是每頁的正典發布判定
  // （pagePublishDecision）——全域開關 AND indexable AND 所需決策已核准。
  // 例如 /privacy 的 indexable 是 true（技術上可索引），但 requiresDecision
  // D-003 仍是 pending，所以即使開關打開也維持 noindex 且不得進 sitemap。
  const indexable = globalRelease === true;
  const ROBOTS_META = /\s*<meta\s+name="robots"[^>]*>/i;
  // 注入的 inventory 照樣走一次形狀驗證：malformed metadata 在建置期就爆炸，
  // 不會安靜地變成「全部關閉」或「全部放行」。
  const indexableEntrySet = new Set(indexableEntriesFromPublicPages(inventory));
  const releaseSet = new Set(
    [...publishDecisionsForInventory(inventory, registerText, indexable)]
      .filter(([, decision]) => decision.index)
      .map(([entry]) => entry)
  );

  // 測試版本要在**名稱**上就看得出來：分享連結、瀏覽器分頁、書籤、螢幕截圖裡
  // 出現的都是 <title>，而業主看到的往往就是那些，不是頁面上的徽章。
  // 與 noindex 綁在同一個開關：正式建置同時拿掉 noindex 與這個標記，不可能只
  // 拿掉一半。
  const markAsTest = (path, html) => {
    if (indexable || !indexableEntrySet.has(path)) return html;
    return html.replace(/<title>([^<]*)<\/title>/, (whole, title) =>
      title.includes('測試') ? whole : `<title>【測試用】${title}</title>`
    );
  };

  const publishIndexable = (path, html) => {
    if (!indexable || !releaseSet.has(path)) return html;
    if (!ROBOTS_META.test(html)) {
      throw new Error(
        `WEB_PUBLIC_INDEXABLE=true but ${path} has no <meta name="robots"> to remove. ` +
          '請確認那一行還在——它是預設安全的來源，不該被手動刪掉。'
      );
    }
    // canonical 是放行的前提：讓一個沒有正規網址的頁面進索引，等於把權重灑在
    // 任何指得到它的網址上。
    if (!/<link\s+rel="canonical"\s+href="https:\/\//i.test(html)) {
      throw new Error(
        `${path} has no absolute rel="canonical", so it must not be published as indexable.`
      );
    }
    return html.replace(ROBOTS_META, '');
  };

  for (const path of htmlPaths) {
    const source = String(files.get(path));
    outputs.set(
      path,
      markAsTest(
        path,
        publishIndexable(
          path,
          withModulePreloads(
            rewriteHtmlReferences(stripHtmlComments(source)),
            source
          )
        )
      )
    );
    manifest.set(path, path);
  }
  for (const path of otherPaths) {
    outputs.set(path, files.get(path));
    manifest.set(path, path);
  }

  // sitemap 與 meta 用同一個正典判定派生：已發布頁的 canonical 必須在列，
  // 未核准頁的 <url> 整段拿掉。模板裡缺了已發布頁的 canonical 就爆炸——
  // 不能安靜地出貨「meta 可索引、sitemap 卻交代不清」的矛盾組合。
  if (outputs.has('sitemap.xml')) {
    const publishedCanonicals = new Set();
    for (const entry of releaseSet) {
      if (!outputs.has(entry)) continue;
      const match = /<link\s+rel="canonical"\s+href="([^"]+)"/i.exec(
        String(outputs.get(entry))
      );
      if (match !== null) publishedCanonicals.add(match[1]);
    }
    const template = String(outputs.get('sitemap.xml'));
    const templateLocs = new Set(
      [...template.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) =>
        match[1].trim()
      )
    );
    for (const canonical of publishedCanonicals) {
      if (!templateLocs.has(canonical)) {
        throw new Error(
          `${canonical} is publish-approved but missing from sitemap.xml; ` +
            'refusing to ship an indexable page the sitemap cannot explain.'
        );
      }
    }
    outputs.set(
      'sitemap.xml',
      template.replace(/<url>[\s\S]*?<\/url>/gi, (block) => {
        const loc = /<loc>([^<]+)<\/loc>/i.exec(block);
        return loc !== null && publishedCanonicals.has(loc[1].trim())
          ? block
          : '';
      })
    );
  }

  // 完整性：改寫後每個相對匯入都必須指到真的產出的檔案。改寫本來就該保證這點，
  // 斷言把「靜默壞掉的模組圖」變成建置期就爆炸，而不是使用者瀏覽器裡的 404。
  for (const [outPath, content] of outputs) {
    if (extensionOf(outPath) !== '.js') continue;
    for (const specifier of relativeSpecifiers(String(content))) {
      const target = resolveSpecifier(outPath, specifier);
      if (!outputs.has(target)) {
        throw new Error(
          `Built ${outPath} imports ${specifier}, which resolves to a file the build did not emit.`
        );
      }
    }
  }

  for (const [outPath, content] of outputs) {
    if (extensionOf(outPath) !== '.css') continue;
    for (const ref of cssAssetReferences(String(content))) {
      const reference = resolveCssReference(outPath, ref.value);
      if (reference !== undefined && !outputs.has(reference.path))
        throw new Error(
          `Built CSS ${outPath} references ${reference.path}, which the build did not emit.`
        );
    }
  }

  return { outputs, manifest };
}
