import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 對外頁面清單的一致性守衛（2026-07-27，自動檢查缺口 F-4）。
//
// 介面規則書 §4.1 早就寫著這份清單應該收斂成單一 machine-readable inventory，
// 並註明「完成前，逐檔登記仍是必要的過渡程序」。問題是那個過渡程序**沒有任何
// 東西在把關**：新增一個對外頁面時漏掉其中一份抄本不會有錯誤，那一類掃描只是
// 安靜地不涵蓋新頁面。2026-07-27 併站時 `/clinic` 漏掉 affordance 掃描正是如此，
// 當時靠人工複查才發現。
//
// 這支腳本不合併那些抄本——e2e、建置腳本與 Hosting 設定各有各的載入方式，硬要
// 共用一個模組會把測試綁死在建置腳本上。它做的是**比對**：清單與每一份抄本
// 不一致就紅，並說出少了哪一頁、少在哪裡。

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const read = (...parts) => readFile(join(root, ...parts), 'utf8');

const inventory = JSON.parse(await read('apps', 'web', 'public-pages.json'));
const pages = inventory.pages;

// 每一頁都要說明它是什麼、給誰看、跑哪些掃描。少了任何一項，這份清單就開始
// 變成一堆沒有人知道意義的字串。
for (const page of pages) {
  for (const key of [
    'route',
    'entry',
    'audience',
    'indexable',
    'scans',
    'note'
  ])
    if (page[key] === undefined)
      failures.push(`${page.route ?? '(未命名)'} 少了 ${key} 欄位。`);
  if (typeof page.note === 'string' && page.note.trim() === '')
    failures.push(`${page.route} 的 note 是空的。`);
}

// --- 1. 效能預算：每一個 entry 都要有預算 -----------------------------------
const budgets = JSON.parse(
  await read('apps', 'web', 'performance-budget.json')
);
const budgeted = new Set(budgets.map((budget) => budget.path));
for (const page of pages) {
  if (!budgeted.has(`/${page.entry}`))
    failures.push(
      `performance-budget.json 沒有 /${page.entry} 的預算（${page.route}）。新頁面必須明確定預算，否則它的重量沒有上限。`
    );
}
for (const path of budgeted) {
  if (!pages.some((page) => `/${page.entry}` === path))
    failures.push(
      `performance-budget.json 為 ${path} 定了預算，但 public-pages.json 沒有這一頁。兩者其中一個是過時的。`
    );
}

// --- 2. 本機 server 的 pretty URL 與 Hosting 的 rewrites 必須對得上 ---------
//
// E2E 跑在本機 server 上，正式站跑在 Hosting 上。兩邊不一致就等於「測到的行為
// 不是會部署的行為」——`/privacy` 新增時就漏過一次（當時 `/booking` 是寫死的）。
const server = await read('apps', 'web', 'server.mjs');
const firebase = JSON.parse(await read('firebase.json'));
const rewrites = firebase.hosting.rewrites ?? [];
for (const page of pages) {
  // `/` 與 `/404` 沒有 pretty URL：前者就是根目錄，後者由 Hosting 依慣例供應。
  if (page.route === '/' || page.route === '/404') continue;
  if (!server.includes(`['${page.route}', '${page.entry}']`))
    failures.push(
      `apps/web/server.mjs 的 PRETTY_PATHS 沒有 ${page.route} → ${page.entry}，本機 E2E 會 404 而線上正常。`
    );
  const hosted = rewrites.some(
    (rule) =>
      (rule.source === page.route || rule.source === `${page.route}/**`) &&
      rule.destination === `/${page.entry}`
  );
  if (!hosted)
    failures.push(
      `firebase.json 沒有把 ${page.route} rewrite 到 /${page.entry}，線上會 404 而本機正常。`
    );
}

// --- 3. 掃描矩陣：宣告要跑的掃描，那支 spec 裡就必須真的出現這個路由 --------
const SCAN_SPECS = {
  axe: 'tests/e2e/accessibility.spec.ts',
  responsive: 'tests/e2e/responsive.spec.ts',
  affordance: 'tests/e2e/affordance.spec.ts',
  'mobile-layout': 'tests/e2e/mobile-layout.spec.ts'
};
const specSources = new Map();
for (const [scan, path] of Object.entries(SCAN_SPECS))
  specSources.set(scan, await read(...path.split('/')));

for (const page of pages) {
  for (const scan of page.scans) {
    const source = specSources.get(scan);
    if (source === undefined) {
      failures.push(`${page.route} 宣告了未知的掃描 '${scan}'。`);
      continue;
    }
    if (!source.includes(`'${page.route}'`))
      failures.push(
        `${page.route} 宣告要跑 ${scan} 掃描，但 ${SCAN_SPECS[scan]} 裡找不到這個路由。掃描不會報錯，它只是安靜地不涵蓋這一頁。`
      );
  }
}

// --- 4. 診所官網的八條路由由 clinic-content.js 產生，共用同一個 entry -------
//
// 那八條不逐一列進 inventory（它們是資料驅動的），但**每一條都必須在本機 server
// 與 Hosting 上走得到**，否則分享出去的連結會 404。
const clinicContent = await read('apps', 'web', 'public', 'clinic-content.js');
const slugs = [...clinicContent.matchAll(/slug: '([a-z-]+)'/g)].map(
  (match) => match[1]
);
if (slugs.length === 0)
  failures.push(
    'clinic-content.js 讀不到任何 slug，診所官網的路由守衛已經失效。'
  );
for (const slug of slugs) {
  const routes = [`/clinic/doctors/${slug}`, `/clinic/nasal/${slug}`];
  if (!routes.some((route) => server.includes(`['${route}', 'clinic.html']`)))
    failures.push(
      `clinic-content.js 有 slug '${slug}'，但 apps/web/server.mjs 的 PRETTY_PATHS 走不到它。`
    );
}

if (failures.length > 0) {
  console.error('Public-page inventory check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Public-page inventory check passed (${pages.length} 個進入點、${slugs.length} 條資料驅動的官網路由，與預算、server、Hosting 與掃描矩陣一致).`
  );
}
