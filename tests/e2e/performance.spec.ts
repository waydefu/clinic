import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

//  canonical 診所路由：clinic-content.js 的 CLINIC_ROUTES 是唯一真實來源，
// check:pages 會拿它與 public-pages.json、server 與 Hosting 雙向比對。
// 這裡直接 import，不手抄第二份路由清單。
import { CLINIC_ROUTES } from '../../apps/web/public/clinic-content.js';
import {
  PERFORMANCE_PROFILES,
  defaultEntryRoutes,
  timingBudget
} from '../../scripts/web-performance-matrix.mjs';

import {
  evidenceHeadSha,
  evidenceSlug,
  writeEvidenceShard
} from './support/evidence-shards.js';

// 效能預算的「實驗室時間」那一半。位元組那一半是確定性的，由
// `scripts/check-performance-budget.mjs` 在 verify 裡對 dist 靜態計算；
// 這裡量的是瀏覽器真的畫出來的時間，門檻取自同一份 `performance-budget.json`
// 的 `timings` 區段。
//
// 門檻刻意取 Core Web Vitals 的「良好」界線（FCP 1.8s、LCP 2.5s、CLS 0.1），
// 而不是貼著本機現值：共用 CI runner 的時間會抖動，貼著現值訂只會製造假紅燈。
// 這個測試要抓的是「有人讓首屏慢了一個數量級」，不是幾十毫秒的雜訊。
//
// WEB-P0-02 完整性：/clinic 共用 shell 底下的每一條具體路由都要有
// desktop＋mobile 的實測，不得因為共用同一個 clinic.html 就只量首頁。
// privacy／404 沒有 timings 門檻（位元組預算仍由靜態 gate 守），不進本矩陣。
//
// 證據架構：每個測試只寫自己的分片（`output/evidence/shards/`），完整性驗證
// 交給 CI 的 `scripts/merge-web-evidence.mjs`。fullyParallel 下同一支 spec
// 會分散到多個 worker，各 worker 的 afterAll 只能看到局部資料——跨測試斷言
// 寫在 spec 裡只會誤報缺件。

interface TimingBudget {
  metric: string;
  budget: number;
}

interface BudgetEntry {
  path: string;
  timings?: TimingBudget[];
}

interface ShiftSource {
  target: string;
  value: number;
}

interface PerfRecord {
  route: string;
  entryPath: string;
  profile: string;
  width: number;
  height: number;
  metrics: Record<string, number>;
  budgets: Record<string, number>;
  status: 'PASS' | 'FAIL' | 'UNAVAILABLE';
  shiftSources: ShiftSource[];
}

// Playwright 把測試轉成 CommonJS 執行，因此這裡用 `__dirname` 而不是
// `import.meta.url` 定位預算檔。
const budgets = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'apps', 'web', 'performance-budget.json'),
    'utf8'
  )
) as BudgetEntry[];

// 進入點產物檔名 → 對外路由（單一來源在 web-performance-matrix.mjs）。
const ENTRY_ROUTES = defaultEntryRoutes({
  clinicRoutes: CLINIC_ROUTES as string[]
}) as Array<{ entryPath: string; routes: string[] }>;

declare global {
  interface Window {
    __perfMetrics?: {
      largestContentfulPaint: number;
      cumulativeLayoutShift: number;
    };
    __perfShiftSources?: Map<string, number>;
  }
}

for (const { entryPath, routes } of ENTRY_ROUTES) {
  for (const route of routes) {
    for (const profile of PERFORMANCE_PROFILES as Array<{
      name: string;
      width: number;
      height: number;
    }>) {
      test(`${route} [${profile.name}] 的首屏時間與版面位移在預算內`, async ({
        page
      }) => {
        // 兩個 profile 都用明確的 viewport：桌機 1280×720（Desktop Chrome
        // 預設），手機 390×844（Pixel 7 的 CSS viewport；真機 descriptor
        // 由 mobile 專案的 mobile-layout／responsive 覆蓋）。
        await page.setViewportSize({
          width: profile.width,
          height: profile.height
        });
        // 觀察器必須在文件開始載入前就裝好，否則 LCP 與 layout-shift 的第一批
        // 事件會在觀察之前就發生。CDP 注入不受頁面 CSP 限制。
        await page.addInitScript(() => {
          const metrics = {
            largestContentfulPaint: 0,
            cumulativeLayoutShift: 0
          };
          const sources = new Map<string, number>();
          window.__perfMetrics = metrics;
          window.__perfShiftSources = sources;
          const describe = (node: Node | null | undefined): string => {
            if (!(node instanceof Element)) return 'unknown';
            let label = node.tagName.toLowerCase();
            if (node.id !== '') label += `#${node.id}`;
            else if (
              typeof node.className === 'string' &&
              node.className.trim() !== ''
            )
              label += `.${node.className.trim().split(/\s+/)[0]}`;
            return label;
          };
          new PerformanceObserver((list) => {
            for (const observed of list.getEntries()) {
              metrics.largestContentfulPaint = observed.startTime;
            }
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((list) => {
            for (const observed of list.getEntries()) {
              const shift = observed as PerformanceEntry & {
                value?: number;
                hadRecentInput?: boolean;
                sources?: Array<{ node?: Node | null }>;
              };
              if (shift.hadRecentInput) continue;
              metrics.cumulativeLayoutShift += shift.value ?? 0;
              // 位移歸因（triage 用近似值：同一筆位移的全額記在每個牽涉節點上，
              // 只用於排出嫌疑順序，不做精確分帳）。
              for (const source of shift.sources ?? []) {
                const key = describe(source.node);
                sources.set(key, (sources.get(key) ?? 0) + (shift.value ?? 0));
              }
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });

        const measure = async () => {
          await page.goto(route, { waitUntil: 'load' });
          if (route === '/staff') {
            await page.evaluate(() => window.localStorage.clear());
            await page.reload();
            await expect(page.locator('#login-account')).toBeVisible();
          } else if (route === '/booking') {
            await expect(
              page.locator('[data-booking-type="initial"]')
            ).toBeVisible();
          } else {
            // 診所殼內路由：等第一個 h1 畫出來，證明量到的是這條路由的內容
            // 而不是空殼（八條路由皆有 h1，見 clinic-site.spec.ts）。
            await expect(
              page.getByRole('heading', { level: 1 }).first()
            ).toBeVisible();
          }
          // 讓最後一批 LCP 候選與載入後的版面位移有時間被記錄下來。刻意不用
          // `networkidle`：那個條件在平行執行時不保證會出現，會把效能測試變成
          // 不穩定的逾時來源，而它要量的東西在 load 之後就已經確定了。
          await page.waitForTimeout(1000);

          return page.evaluate(() => ({
            firstContentfulPaint:
              performance
                .getEntriesByType('paint')
                .find((observed) => observed.name === 'first-contentful-paint')
                ?.startTime ?? 0,
            largestContentfulPaint:
              window.__perfMetrics?.largestContentfulPaint ?? Number.NaN,
            cumulativeLayoutShift:
              window.__perfMetrics?.cumulativeLayoutShift ?? Number.NaN,
            shiftSources: Array.from(
              window.__perfShiftSources ?? new Map<string, number>()
            )
              .map(([target, value]) => ({
                target,
                value: Math.round(value * 10000) / 10000
              }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
          }));
        };

        let measured = await measure();
        // Chromium 的第一次冷啟動偶爾不會送出 buffered paint observer event。
        // 只有在「指標根本沒量到」時重載一次；第二次仍為 0，照樣由下方斷言判定失敗。
        if (
          measured.firstContentfulPaint === 0 ||
          measured.largestContentfulPaint === 0
        ) {
          measured = await measure();
        }

        const fcpBudget = timingBudget(
          budgets,
          entryPath,
          'first-contentful-paint'
        );
        const lcpBudget = timingBudget(
          budgets,
          entryPath,
          'largest-contentful-paint'
        );
        const clsBudget = timingBudget(
          budgets,
          entryPath,
          'cumulative-layout-shift'
        );
        const honest =
          measured.firstContentfulPaint > 0 &&
          measured.largestContentfulPaint > 0 &&
          Number.isFinite(measured.cumulativeLayoutShift) &&
          measured.firstContentfulPaint <= fcpBudget &&
          measured.largestContentfulPaint <= lcpBudget &&
          measured.cumulativeLayoutShift <= clsBudget;
        // 先寫分片再斷言：失敗的測試也要留下 FAIL 記錄，合併後的 artifact 才完整。
        // 同一測試 retry 會覆寫同名分片（先後執行，不競態）。
        const sha = evidenceHeadSha();
        writeEvidenceShard(
          'web-performance',
          evidenceSlug(route, profile.name),
          {
            schemaVersion: 1,
            headSha: sha,
            generatedBy: 'tests/e2e/performance.spec.ts',
            record: {
              route,
              entryPath,
              profile: profile.name,
              width: profile.width,
              height: profile.height,
              metrics: {
                'first-contentful-paint': measured.firstContentfulPaint,
                'largest-contentful-paint': measured.largestContentfulPaint,
                'cumulative-layout-shift': measured.cumulativeLayoutShift
              },
              budgets: {
                'first-contentful-paint': fcpBudget,
                'largest-contentful-paint': lcpBudget,
                'cumulative-layout-shift': clsBudget
              },
              status: honest ? 'PASS' : 'FAIL',
              shiftSources: measured.shiftSources
            } satisfies PerfRecord
          }
        );

        // 量到 0 代表指標沒被記錄到（觀察器沒裝上或頁面沒畫出東西），
        // 那是測試壞了而不是效能好，必須失敗而不是靜靜通過。
        expect(measured.firstContentfulPaint).toBeGreaterThan(0);
        expect(measured.largestContentfulPaint).toBeGreaterThan(0);

        expect(
          measured.firstContentfulPaint,
          `FCP ${measured.firstContentfulPaint.toFixed(0)}ms`
        ).toBeLessThanOrEqual(fcpBudget);
        expect(
          measured.largestContentfulPaint,
          `LCP ${measured.largestContentfulPaint.toFixed(0)}ms`
        ).toBeLessThanOrEqual(lcpBudget);
        expect(
          measured.cumulativeLayoutShift,
          `CLS ${measured.cumulativeLayoutShift.toFixed(3)}`
        ).toBeLessThanOrEqual(clsBudget);
      });
    }
  }
}
