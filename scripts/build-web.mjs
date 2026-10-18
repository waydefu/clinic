import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 把 apps/web/public 產出成內容雜湊過的 apps/web/dist。
//
// 為什麼要打包／雜湊：Phase 1 刻意讓 public/ 維持未打包的原始 ES module，方便
// 直接檢視，並靠 `Cache-Control: no-cache` 讓穩定入口每次重用前重新驗證。要讓靜態資產
// 能長期快取（immutable），檔名就必須帶內容雜湊——改一版就是新網址，舊快取
// 永遠不會回錯的內容。HTML 進入點維持穩定檔名與 no-cache，永遠指向最新的雜湊
// 資產。
//
// 這**不放寬 CSP**：不注入 inline script，仍是一份份 `script-src 'self'` 的 ES
// module，只是檔名帶了雜湊，並在 <head> 多了同源的 `modulepreload` 宣告。核心的
// 純函式 `planHashedBuild` 不碰 I/O，單元測試直接餵它一組合成檔案來驗證雜湊、
// 匯入改寫、HTML 改寫與 preload 注入。

import {
  indexableEntriesFromPublicPages,
  planHashedBuild as planBuild
} from './web-build-planner.mjs';
export {
  indexableEntriesFromPublicPages,
  listRegisterDecisions,
  pagePublishDecision,
  publishDecisionsForInventory,
  readDecisionApproval
} from './web-build-planner.mjs';

const HASHABLE = new Set(['.js', '.css']);
const HTML_EXTENSION = '.html';

const PUBLIC_PAGE_INVENTORY = JSON.parse(
  await readFile(
    new URL('../apps/web/public-pages.json', import.meta.url),
    'utf8'
  )
);
export { PUBLIC_PAGE_INVENTORY };
export const PUBLIC_INDEXABLE_ENTRIES = Object.freeze(
  indexableEntriesFromPublicPages(PUBLIC_PAGE_INVENTORY)
);

// D 系列核准狀態的唯一正典是決策登錄（decision register）；建置只讀不寫。
// 讀不到、列不存在、狀態不是 approved 開頭，一律視為未核准（fail-closed）。
const DECISION_REGISTER_TEXT = await readFile(
  new URL('../docs/product/phase-1-decision-register.md', import.meta.url),
  'utf8'
);
export { DECISION_REGISTER_TEXT };

// Compatibility/CLI adapter: canonical configuration I/O is intentional here.
// Isolated callers import web-build-planner.mjs and supply both inputs instead.
export function planHashedBuild(
  files,
  {
    hashLength = 10,
    inventory = PUBLIC_PAGE_INVENTORY,
    registerText = DECISION_REGISTER_TEXT
  } = {}
) {
  return planBuild(files, {
    hashLength,
    inventory,
    registerText,
    globalRelease: process.env.WEB_PUBLIC_INDEXABLE === 'true'
  });
}

function extensionOf(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
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

async function bundleCalendarPilot(files, repoRoot) {
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [
      join(repoRoot, 'apps', 'web', 'src', 'calendar-pilot-entry.js')
    ],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    minify: false,
    plugins: [
      {
        name: 'shared-calendar-session-authority',
        setup(plugin) {
          plugin.onResolve(
            { filter: /\/calendar-pilot-authority\.js$/ },
            () => ({
              path: './modules/calendar-pilot-authority.js',
              external: true
            })
          );
        }
      }
    ]
  });
  const output = result.outputFiles?.[0];
  if (output === undefined)
    throw new Error('CAL-PILOT browser bundle was not produced.');
  files.set('calendar-pilot-client.js', output.text);
}

async function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const publicDir = join(repoRoot, 'apps', 'web', 'public');
  const distDir = join(repoRoot, 'apps', 'web', 'dist');

  const files = await collectFiles(publicDir);
  await bundleCalendarPilot(files, repoRoot);
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
  //
  // 寫在 dist **之外**：出貨的目錄只該包含瀏覽器真的會請求的東西。這份對照表
  // 是給人看的建置證據，把它放進 dist 等於對外公開一份完整的原始檔名清單，
  // 卻沒有任何一行程式會去讀它。
  const manifestObject = Object.fromEntries([...manifest.entries()].sort());
  await writeFile(
    join(repoRoot, 'apps', 'web', 'asset-manifest.json'),
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
