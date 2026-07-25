import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 把 apps/web/public 產出成內容雜湊過的 apps/web/dist。
//
// 為什麼要打包／雜湊：Phase 1 刻意讓 public/ 維持未打包的原始 ES module，方便
// 直接檢視，並靠 `Cache-Control: no-store` 保證預覽永遠是最新的。要讓靜態資產
// 能長期快取（immutable），檔名就必須帶內容雜湊——改一版就是新網址，舊快取
// 永遠不會回錯的內容。HTML 進入點維持穩定檔名與 no-store，永遠指向最新的雜湊
// 資產。
//
// 這**不放寬 CSP**：不注入 inline script，仍是一份份 `script-src 'self'` 的 ES
// module，只是檔名帶了雜湊，並在 <head> 多了同源的 `modulepreload` 宣告。核心的
// 純函式 `planHashedBuild` 不碰 I/O，單元測試直接餵它一組合成檔案來驗證雜湊、
// 匯入改寫、HTML 改寫與 preload 注入。

const HASHABLE = new Set(['.js', '.css']);
const HTML_EXTENSION = '.html';

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

// 只改寫相對匯入（./ 或 ../）。shipped module 沒有裸名或 root-absolute 匯入，
// 也沒有動態 import；驗證過的前提讓這個改寫可以只用正則而不必完整解析。
const IMPORT_SPECIFIER = /(\bfrom\s*|\bimport\s*)(['"])(\.[^'"]+\.js)\2/g;

// HTML 進入點掛載模組的方式，以及注入 preload 的錨點。
const MODULE_ENTRY = /<script\s+type="module"\s+src="(\/[^"]+\.js)"/g;
const CLOSING_HEAD = /(?:(\r?\n)([ \t]*))?<\/head>/;

function relativeSpecifiers(source) {
  const found = new Set();
  for (const match of source.matchAll(IMPORT_SPECIFIER)) found.add(match[3]);
  return [...found];
}

/** 把匯入者裡的相對規格解析成以 public 根為基準的 POSIX 路徑。 */
function resolveSpecifier(importerPath, specifier) {
  return posix.normalize(posix.join(posix.dirname(importerPath), specifier));
}

/**
 * Tarjan's strongly-connected components, returned dependencies-first.
 *
 * The JS graph is not a DAG: ES modules allow import cycles (the vendored
 * domain has `appointment-rules ↔ booking-transaction`), and cyclic files
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
export function planHashedBuild(files, { hashLength = 10 } = {}) {
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

  // 相依圖：每個 JS 指向它匯入的（存在於檔案集合裡的）相對規格。
  const dependencies = new Map(
    jsPaths.map((path) => [
      path,
      relativeSpecifiers(String(files.get(path)))
        .map((specifier) => resolveSpecifier(path, specifier))
        .filter((target) => files.has(target))
    ])
  );

  const components = stronglyConnectedComponents(
    jsPaths,
    (path) => dependencies.get(path) ?? []
  );

  // source path → 對外的絕對網址（帶雜湊）。
  const servedUrl = new Map();
  const outputs = new Map();
  const manifest = new Map();

  // 把一個相對匯入改寫成指定的目標檔名，保留相對目錄前綴。
  const rewriteImports = (source, importer, basenameFor) =>
    source.replace(IMPORT_SPECIFIER, (whole, keyword, quote, specifier) => {
      const target = resolveSpecifier(importer, specifier);
      const basename = basenameFor(target);
      if (basename === undefined) return whole;
      return `${keyword}${quote}${specifier.replace(/[^/]+$/, basename)}${quote}`;
    });

  const emit = (sourcePath, content) => {
    outputs.set(manifest.get(sourcePath), content);
  };

  for (const path of cssPaths) {
    const content = String(files.get(path));
    const outPath = posix.join(
      posix.dirname(path),
      hashedBasename(path, sha256(content).slice(0, hashLength))
    );
    manifest.set(path, outPath);
    servedUrl.set(path, `/${outPath}`);
    outputs.set(outPath, content);
  }

  for (const component of components) {
    const members = new Set(component);

    // SCC 的雜湊輸入用「與雜湊無關的規範形式」：跨 SCC 匯入換成已知的雜湊檔名，
    // 同 SCC 匯入換成目標的來源路徑（穩定）。因此雜湊有定義，且任一成員改動都會
    // 讓整個 SCC 的雜湊改變。
    const canonicalize = (path) =>
      rewriteImports(String(files.get(path)), path, (target) => {
        if (members.has(target)) return `@scc:${target}`;
        return manifest.has(target)
          ? posix.basename(manifest.get(target))
          : undefined;
      });
    const hashInput = [...members]
      .sort()
      .map((path) => `${path}\u0000${canonicalize(path)}`)
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

    // 最終內容：跨 SCC 與同 SCC 的匯入現在都有雜湊檔名可用。
    for (const path of members) {
      emit(
        path,
        rewriteImports(String(files.get(path)), path, (target) =>
          manifest.has(target)
            ? posix.basename(manifest.get(target))
            : undefined
        )
      );
    }
  }

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
      for (const next of dependencies.get(current) ?? []) {
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

  for (const path of htmlPaths) {
    const source = String(files.get(path));
    outputs.set(
      path,
      withModulePreloads(rewriteHtmlReferences(source), source)
    );
    manifest.set(path, path);
  }
  for (const path of otherPaths) {
    outputs.set(path, files.get(path));
    manifest.set(path, path);
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

  return { outputs, manifest };
}

async function collectFiles(root) {
  const files = new Map();
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      const key = relative(root, absolute).split(sep).join('/');
      // .js/.css/.html 當文字讀（會被改寫）；其餘（圖片等）當 Buffer 原樣搬。
      const extension = extensionOf(key);
      files.set(
        key,
        HASHABLE.has(extension) || extension === HTML_EXTENSION
          ? await readFile(absolute, 'utf8')
          : await readFile(absolute)
      );
    }
  };
  await walk(root);
  return files;
}

/**
 * 壓縮樣式表，就地改寫檔案集合。
 *
 * 為什麼需要：這個專案的樣式表帶著大量說明「為什麼這樣寫」的註解，而先前的建置
 * 把它們原封不動送給每一位訪客——patient.html 的樣式表因此吃掉 14.6 KiB 的
 * 傳輸量，其中相當比例是中文註解。那等於在懲罰把理由寫清楚：註解愈完整，使用者
 * 付的錢愈多。壓縮之後，原始碼保留全部理由，線上只送規則。
 *
 * 在 `planHashedBuild` **之前**執行，因此內容雜湊算的是實際出貨的位元組；
 * planHashedBuild 本身維持純函式，測試仍可餵合成檔案集合。
 */
async function minifyStylesheets(files) {
  const { transform } = await import('esbuild');
  for (const [path, content] of files) {
    if (extensionOf(path) !== '.css') continue;
    const result = await transform(String(content), {
      loader: 'css',
      minify: true
    });
    files.set(path, result.code);
  }
}

/**
 * 壓縮模組，就地改寫檔案集合。理由與樣式表相同：原始碼裡大量「為什麼這樣寫」的
 * 中文註解不該由每位訪客付費下載。實測 gzip 後省下約 44%。
 *
 * **不做 bundling**，只逐檔壓縮。理由是**逐檔可讀性**：dist 必須與 public 逐檔
 * 對應，出貨的程式碼才能被讀、被對照原始碼檢查（2026-07-26 決策，見
 * `docs/product/phase-1-decision-register.md`）。
 *
 * 先前這裡寫的理由是「CSP 是 `script-src 'self'`，產物必須維持一份份的 ES
 * module」——**那是錯的**。CSP 管的是腳本的來源與是否 inline，不是檔案數量；
 * 一支同源的 bundle 完全符合 `script-src 'self'`。決定本身不變，但理由要說真話，
 * 否則下一個讀到的人會以為那是硬性限制而不再重新評估。
 *
 * 代價是模組圖靠瀏覽器逐層發現會產生往返瀑布，這由 `planHashedBuild` 注入的
 * `modulepreload` 攤平。`planHashedBuild` 也還要靠 import 語句改寫成雜湊檔名，
 * 而 esbuild 在非 bundle 模式下會原樣保留 `from"./x.js"`，改寫用的正規表示式
 * 吃得下。
 *
 * `keepNames` 是保險：壓縮會重新命名區域識別字，若有任何程式靠 `constructor.name`
 * 或 `error.name` 判斷分支，改名就會靜默走錯。保留名稱只多一點點位元組。
 */
async function minifyModules(files) {
  const { transform } = await import('esbuild');
  for (const [path, content] of files) {
    if (extensionOf(path) !== '.js') continue;
    const result = await transform(String(content), {
      loader: 'js',
      format: 'esm',
      target: 'es2022',
      minify: true,
      keepNames: true
    });
    files.set(path, result.code);
  }
}

async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const publicDir = join(repoRoot, 'apps', 'web', 'public');
  const distDir = join(repoRoot, 'apps', 'web', 'dist');

  const files = await collectFiles(publicDir);
  await minifyStylesheets(files);
  await minifyModules(files);
  const { outputs, manifest } = planHashedBuild(files);

  await rm(distDir, { recursive: true, force: true });
  for (const [outPath, content] of outputs) {
    const absolute = join(distDir, outPath.split('/').join(sep));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  // 供操作者對照 source → 雜湊產物；runtime 不需要（參照已直接改寫進檔案）。
  const manifestObject = Object.fromEntries([...manifest.entries()].sort());
  await writeFile(
    join(distDir, 'asset-manifest.json'),
    `${JSON.stringify(manifestObject, null, 2)}\n`,
    'utf8'
  );

  const hashed = [...manifest.keys()].filter((path) =>
    HASHABLE.has(extensionOf(path))
  ).length;
  console.log(
    `Built apps/web/dist (${outputs.size} files, ${hashed} content-hashed).`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
