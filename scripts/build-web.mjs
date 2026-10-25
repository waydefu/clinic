import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const escapeHtml = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

// 路由 → 頁面清單（單一來源）：與 clinic-site.js renderRoute() 的路由、標題、描述一致。
// 檔案放在 `clinic-route/` 之下，一個絕不會等於任何對外路徑的目錄名：若寫在 `clinic/`
// 下，目錄會遮住 `/clinic` 的 rewrite；用 flat 檔 + firebase.json 的精確 rewrite
// 也避開 Hosting 對目錄索引的結尾斜線 301。
function clinicRoutePageList({ DOCTORS, NASAL_SERVICES }) {
  return [
    {
      path: '/clinic/doctors',
      title: '醫師團隊',
      description: '認識一森渼診所專業醫師團隊。',
      image: '/clinic-assets/clinic-logo.webp'
    },
    ...DOCTORS.map((doctor) => ({
      path: `/clinic/doctors/${doctor.slug}`,
      title: doctor.name,
      description: doctor.summary,
      image: doctor.image
    })),
    ...NASAL_SERVICES.map((service) => ({
      path: `/clinic/nasal/${service.slug}`,
      title: service.title,
      description: service.subtitle,
      image: service.image
    }))
  ].map((route) => ({
    ...route,
    file: `clinic-route${route.path.slice('/clinic'.length)}.html`
  }));
}

/** 路由 → 建置會產出的頁面檔（供 check-public-pages 比對 firebase rewrites 與預算）。 */
export function clinicRoutePageFiles(content) {
  return new Map(
    clinicRoutePageList(content).map((route) => [route.path, route.file])
  );
}

/**
 * 官網每條路由各產一份靜態 HTML（`clinic-route/<路由>.html`，由 firebase.json 的
 * 精確 rewrite 供應），讓標題、描述、OG、Twitter 在任何 JavaScript 執行前就是正確的（搜尋與分享預覽的爬蟲不跑 JS）。
 *
 * 以**已建好的** clinic.html 為模板，所以雜湊資產參照、modulepreload 與 noindex
 * 與它逐字相同；只換 <title>、description，並補上 clinic-site.js 的 setMeta() 會
 * 寫入的那一組標籤。標籤名稱與值必須與 setMeta() 一致，runtime 才會是原地覆寫
 * （idempotent）而不是重複。`/clinic` 本身仍由 clinic.html 承載，不在此列。
 *
 * canonical／og:url／og:image／twitter:image 需要絕對網址，而建置不知道網域：
 * 沒給 origin 就整組省略，交給 runtime 補，也不寫出錯誤的絕對網址。
 */
export function planClinicRoutePages(clinicHtml, content, { origin } = {}) {
  const { CLINIC } = content;
  const isPreview = /<meta\s+name="robots"[^>]*content="[^"]*noindex/i.test(
    clinicHtml
  );
  const TITLE = /<title>[^<]*<\/title>/;
  const DESCRIPTION = /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/;
  if (!TITLE.test(clinicHtml) || !DESCRIPTION.test(clinicHtml))
    throw new Error(
      'clinic.html has no <title> or description meta to replace.'
    );
  const routes = clinicRoutePageList(content);
  const pages = new Map();
  for (const route of routes) {
    const title = escapeHtml(
      `${isPreview ? '【測試用】' : ''}${route.title}｜${CLINIC.name}`
    );
    const description = escapeHtml(route.description);
    const tags = [
      `<meta name="description" content="${description}" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${description}" />`,
      '<meta property="og:type" content="website" />',
      '<meta property="og:locale" content="zh_TW" />',
      `<meta property="og:site_name" content="${escapeHtml(CLINIC.name)}" />`,
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${title}" />`,
      `<meta name="twitter:description" content="${description}" />`
    ];
    if (origin !== undefined) {
      const url = escapeHtml(new URL(route.path, origin).href);
      const image = escapeHtml(new URL(route.image, origin).href);
      tags.push(
        `<meta property="og:url" content="${url}" />`,
        `<meta property="og:image" content="${image}" />`,
        `<meta name="twitter:image" content="${image}" />`,
        `<link rel="canonical" href="${url}" />`
      );
    }
    pages.set(
      route.file,
      clinicHtml
        .replace(TITLE, () => `<title>${title}</title>`)
        .replace(DESCRIPTION, () => tags.join('\n    '))
    );
  }
  return pages;
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
  // 唯讀取用 runtime 同一份內容；網域由 WEB_SITE_ORIGIN 提供，未設就不寫絕對網址。
  const clinicContent = await import(
    pathToFileURL(join(publicDir, 'clinic-content.js')).href
  );
  const origin = process.env.WEB_SITE_ORIGIN || undefined;
  for (const [path, html] of planClinicRoutePages(
    String(outputs.get('clinic.html')),
    clinicContent,
    { origin }
  ))
    outputs.set(path, html);

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
