import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 效能預算 gate：對 `apps/web/dist`（實際會部署的內容雜湊產物）計算每個 HTML
// 進入點的「傳輸重量」，超過 `apps/web/performance-budget.json` 就讓建置失敗。
//
// 為什麼是靜態計算而不是在 CI 跑 Lighthouse：頁面重量的迴歸是**確定性**的
// ——同樣的產物永遠得到同樣的位元組數，所以它適合當 gate。實驗室量到的時間
// （LCP/CLS）在共用 runner 上會抖動，把它當硬性 gate 只會製造假紅燈；那部分
// 改在 Playwright 專案裡量（`tests/e2e/performance.spec.ts`），用同一份預算檔的
// `timings` 區段，門檻取 Core Web Vitals 的「良好」界線而非緊貼現值。
//
// 預算檔沿用 **Lighthouse budget.json 的格式**（`path`／`resourceSizes`／
// `resourceCounts`／`timings`，大小單位 KiB），所以之後真的接上 Lighthouse CI
// 時這份檔案可以直接餵進去，不必重寫。
//
// 大小一律以 **gzip 後**的位元組計算：Hosting 對文字資產會壓縮，使用者實際下載
// 的是壓縮後的量，拿未壓縮位元組定預算會把 CSS/JS 的預算訂得毫無意義。

const RESOURCE_TYPE_BY_EXTENSION = new Map([
  ['.js', 'script'],
  ['.mjs', 'script'],
  ['.css', 'stylesheet'],
  ['.png', 'image'],
  ['.jpg', 'image'],
  ['.jpeg', 'image'],
  ['.gif', 'image'],
  ['.webp', 'image'],
  ['.avif', 'image'],
  ['.svg', 'image'],
  ['.ico', 'image'],
  ['.woff', 'font'],
  ['.woff2', 'font'],
  ['.ttf', 'font'],
  ['.otf', 'font'],
  ['.html', 'document']
]);

const KIB = 1024;

function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

function resourceTypeOf(path) {
  return RESOURCE_TYPE_BY_EXTENSION.get(extensionOf(path)) ?? 'other';
}

// 與 build-web.mjs 相同的前提：出貨的模組只有相對匯入、沒有裸名或動態 import。
const IMPORT_SPECIFIER = /(\bfrom\s*|\bimport\s*)(['"])(\.[^'"]+\.js)\2/g;
// HTML 只用 root-absolute 參照子資源（build 會把它們改寫成雜湊檔名）。
const HTML_REFERENCE = /\b(?:src|href)="(\/[^"#?]+)"/g;
const CSS_REFERENCE = /url\(\s*['"]?(\/?[^'")]+)['"]?\s*\)/g;
// 指令碼也會用字串常數指到圖片（`image: '/clinic-assets/doctor-yan.webp'`），而
// 那不是匯入，走不到上面的傳遞閉包。
//
// 2026-08-02：官網 12 張素材裡有 9 張只被 JS 這樣參照，於是 1.7 MB 的下載量對這
// 道預算完全隱形——`/clinic.html` 實際讓訪客下載 2.2 MB，gate 卻只看到 HTML 與
// CSS 摸得到的 522 KiB，而且全綠。位元組沒有因為參照方式不同就變少。
//
// 只認**帶影像副檔名**的 root-absolute 路徑：`/booking`、`/clinic/doctors` 這種
// 導覽字串沒有副檔名，不會被誤當成資源。
const SCRIPT_ASSET_REFERENCE =
  /(['"])(\/[^'"\s]+\.(?:png|jpe?g|gif|webp|avif|svg|ico))\1/g;

function referencesOf(path, content) {
  const source = String(content);
  const found = new Set();
  const extension = extensionOf(path);

  if (extension === '.html') {
    for (const match of source.matchAll(HTML_REFERENCE)) {
      const target = match[1].slice(1);
      // 導覽不是子資源。兩種形式都要排除：指向另一個頁面（document），以及
      // 沒有副檔名而認不出型別的對外網址（other）。
      //
      // 先前只排除前者，於是 `/booking` 這種**沒有副檔名**的網址被當成缺失的
      // 資源而讓 gate 紅燈——它其實是導覽目標，由 Hosting 的 rewrite 對應到
      // patient.html。改成型別判斷之後，指向不存在的 .js／.css／圖片仍然會被
      // 抓出來，那才是這個檢查真正要守的東西。
      const type = resourceTypeOf(target);
      if (type === 'document' || type === 'other') continue;
      found.add(target);
    }
  } else if (extension === '.js') {
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      found.add(posix.normalize(posix.join(posix.dirname(path), match[3])));
    }
    for (const match of source.matchAll(SCRIPT_ASSET_REFERENCE)) {
      found.add(match[2].slice(1));
    }
  } else if (extension === '.css') {
    for (const match of source.matchAll(CSS_REFERENCE)) {
      const reference = match[1];
      if (reference.startsWith('data:')) continue;
      found.add(
        reference.startsWith('/')
          ? reference.slice(1)
          : posix.normalize(posix.join(posix.dirname(path), reference))
      );
    }
  }

  return [...found];
}

// 進入點掛載模組的方式，以及 build 注入的 preload 宣告。
const MODULE_SCRIPT = /<script\s+type="module"\s+src="(\/[^"]+\.js)"/g;
const MODULE_PRELOAD = /<link\s+rel="modulepreload"\s+href="(\/[^"]+)"/g;

/**
 * 一個進入點的模組圖有多深——也就是瀏覽器要跑幾趟連續往返才把程式碼收齊。
 *
 * 為什麼要量這個：位元組與請求數都看不見它。31 個模組分 5 波下載與分 1 波下載，
 * 位元組完全一樣、請求數完全一樣，但前者在行動網路上先付掉 4 趟 RTT 才開始執行。
 * 這正是 2026-07-26 稽核抓到的問題，而當時的預算全部是綠的。
 *
 * 深度 1 ＝ 解析 <head> 當下就能發現全部模組。`<link rel="modulepreload">` 讓
 * 整張圖在深度 1 就被宣告完；少宣告一個，那一個就退到它匯入者的下一層。
 *
 * 這也是為什麼這個檢查是**必要**而不是選配：per-entry bundling 已於 2026-07-26
 * 否決（逐檔可讀性優先），所以不會有後續改動來壓低請求數。preload 是永久解法，
 * 而永久解法需要一個閘門守著。
 */
export function moduleGraphDepth(entryPath, files) {
  const html = String(files.get(entryPath) ?? '');
  const entryModules = [...html.matchAll(MODULE_SCRIPT)].map((match) =>
    match[1].slice(1)
  );
  const preloaded = [...html.matchAll(MODULE_PRELOAD)].map((match) =>
    match[1].slice(1)
  );

  const depth = new Map();
  const queue = [];
  // HTML 直接宣告的（script 標籤與 preload）都在第一趟就被發現。
  for (const path of [...entryModules, ...preloaded]) {
    if (!files.has(path) || depth.has(path)) continue;
    depth.set(path, 1);
    queue.push(path);
  }
  while (queue.length > 0) {
    const path = queue.shift();
    for (const target of referencesOf(path, files.get(path))) {
      if (!files.has(target)) continue;
      const next = depth.get(path) + 1;
      if (depth.has(target) && depth.get(target) <= next) continue;
      depth.set(target, next);
      queue.push(target);
    }
  }

  const reachable = [...depth.keys()].filter(
    (path) => extensionOf(path) === '.js'
  );
  return {
    maxDepth: reachable.reduce(
      (max, path) => Math.max(max, depth.get(path)),
      0
    ),
    moduleCount: reachable.length,
    // 被匯入卻沒有 preload 宣告的模組：每一個都讓深度多一層。
    unpreloaded: reachable
      .filter((path) => !preloaded.includes(path))
      .filter((path) => !entryModules.includes(path))
      .sort()
  };
}

/**
 * 純核心：把「dist 檔案集合」＋「預算」算成每個進入點的資源摘要與違規清單。
 * 沒有 I/O，單元測試直接餵合成檔案集合。
 *
 * @param files Map<dist 相對 POSIX 路徑, string | Uint8Array>
 * @param budgets Lighthouse budget.json 陣列
 * @param transferSizeOf 傳輸大小函式（正式執行傳 gzip；測試可用原始長度）
 */
export function planBudgetReport(
  files,
  budgets,
  { transferSizeOf = (content) => Buffer.byteLength(content) } = {}
) {
  const entryPaths = [...files.keys()]
    .filter((path) => extensionOf(path) === '.html')
    .sort();

  const budgetFor = (entryPath) =>
    budgets.find((budget) => budget.path === `/${entryPath}`) ??
    budgets.find((budget) => budget.path === '*');

  const entries = entryPaths.map((entryPath) => {
    // 從 HTML 出發做傳遞閉包：HTML → css/js/圖，js → 相對匯入，css → url()。
    const reached = new Set([entryPath]);
    const missing = [];
    const queue = [entryPath];
    while (queue.length > 0) {
      const path = queue.shift();
      for (const target of referencesOf(path, files.get(path))) {
        if (reached.has(target)) continue;
        if (!files.has(target)) {
          missing.push(`${path} → /${target}`);
          continue;
        }
        reached.add(target);
        queue.push(target);
      }
    }

    const sizes = new Map();
    const counts = new Map();
    let totalBytes = 0;
    for (const path of reached) {
      const type = resourceTypeOf(path);
      const bytes = transferSizeOf(files.get(path));
      sizes.set(type, (sizes.get(type) ?? 0) + bytes);
      counts.set(type, (counts.get(type) ?? 0) + 1);
      totalBytes += bytes;
    }
    sizes.set('total', totalBytes);
    counts.set('total', reached.size);

    return {
      path: `/${entryPath}`,
      resources: [...reached].sort(),
      missing,
      sizes,
      counts,
      moduleGraph: moduleGraphDepth(entryPath, files),
      budget: budgetFor(entryPath)
    };
  });

  const violations = [];
  for (const entry of entries) {
    for (const reference of entry.missing) {
      violations.push(
        `${entry.path}: 參照了 dist 裡不存在的資源（${reference}）`
      );
    }
    if (entry.budget === undefined) {
      violations.push(
        `${entry.path}: 沒有對應的效能預算。新頁面必須在 performance-budget.json 裡明確定預算。`
      );
      continue;
    }
    // 2026-07-27（自動檢查缺口 F-5）：每個進入點都要說明它的數字是怎麼來的。
    //
    // 「預算調高必須留下理由與實測」先前只寫在 web-quality-gates 的表格裡，靠人
    // 記得去補。於是「改一個數字讓 CI 變綠」與「說明為什麼」之間沒有任何強制
    // 關係。這一條不能阻止有人隨手寫一句話，但它讓兩件事變成同一個動作，而且
    // 會出現在 code review 的 diff 裡。
    if (
      typeof entry.budget.justification !== 'string' ||
      entry.budget.justification.trim() === ''
    ) {
      violations.push(
        `${entry.path}: 預算沒有 justification。請寫明這些數字是怎麼來的（實測值？刻意的上限？調整過的理由？）。`
      );
    }
    for (const { resourceType, budget } of entry.budget.resourceSizes ?? []) {
      const actualKib = (entry.sizes.get(resourceType) ?? 0) / KIB;
      if (actualKib > budget) {
        violations.push(
          `${entry.path}: ${resourceType} 傳輸量 ${actualKib.toFixed(1)} KiB 超過預算 ${budget} KiB`
        );
      }
    }
    for (const { resourceType, budget } of entry.budget.resourceCounts ?? []) {
      const actual = entry.counts.get(resourceType) ?? 0;
      if (actual > budget) {
        violations.push(
          `${entry.path}: ${resourceType} 請求數 ${actual} 超過預算 ${budget}`
        );
      }
    }
    // 往返深度：位元組與請求數都看不見它，但它決定「多久之後才開始執行」。
    const depthBudget = entry.budget.moduleGraph?.maxDiscoveryDepth;
    if (depthBudget !== undefined) {
      const { maxDepth, unpreloaded } = entry.moduleGraph;
      if (maxDepth > depthBudget) {
        violations.push(
          `${entry.path}: 模組圖往返深度 ${maxDepth} 超過預算 ${depthBudget}（少了 ${unpreloaded.length} 個 modulepreload：${unpreloaded.slice(0, 3).join('、')}${unpreloaded.length > 3 ? '…' : ''}）`
        );
      } else if (unpreloaded.length > 0) {
        // 深度還沒惡化，但已經有模組沒被宣告——下一個相依就會把它推到第二趟。
        violations.push(
          `${entry.path}: ${unpreloaded.length} 個模組沒有 modulepreload 宣告（${unpreloaded.slice(0, 3).join('、')}${unpreloaded.length > 3 ? '…' : ''}）`
        );
      }
    }
  }

  return { entries, violations };
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
      files.set(key, await readFile(absolute));
    }
  };
  await walk(root);
  return files;
}

function formatKib(bytes) {
  return `${(bytes / KIB).toFixed(1)} KiB`;
}

async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const distDir = join(repoRoot, 'apps', 'web', 'dist');
  const budgetPath = join(repoRoot, 'apps', 'web', 'performance-budget.json');

  let files;
  try {
    files = await collectFiles(distDir);
  } catch {
    console.error(
      'Performance budget check failed: apps/web/dist 不存在。請先執行 `corepack pnpm build`。'
    );
    process.exitCode = 1;
    return;
  }

  const budgets = JSON.parse(await readFile(budgetPath, 'utf8'));
  const { entries, violations } = planBudgetReport(files, budgets, {
    // 只有文字資產會被 Hosting 壓縮；圖片等二進位資產維持原始大小。
    transferSizeOf: (content) => gzipSync(content).length
  });

  const report = process.argv.includes('--report');
  if (report || violations.length > 0) {
    for (const entry of entries) {
      console.log(`\n${entry.path}`);
      for (const type of [
        'document',
        'script',
        'stylesheet',
        'image',
        'font'
      ]) {
        if (!entry.sizes.has(type)) continue;
        console.log(
          `  ${type.padEnd(11)} ${String(entry.counts.get(type)).padStart(3)} 個 ${formatKib(entry.sizes.get(type)).padStart(10)}`
        );
      }
      console.log(
        `  ${'total'.padEnd(11)} ${String(entry.counts.get('total')).padStart(3)} 個 ${formatKib(entry.sizes.get('total')).padStart(10)}`
      );
    }
  }

  if (violations.length > 0) {
    console.error('\nPerformance budget check failed:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log(
      `\nPerformance budget check passed (${entries.length} 個進入點，gzip 傳輸量）.`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
