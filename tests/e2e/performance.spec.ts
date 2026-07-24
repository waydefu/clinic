import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// 效能預算的「實驗室時間」那一半。位元組那一半是確定性的，由
// `scripts/check-performance-budget.mjs` 在 verify 裡對 dist 靜態計算；
// 這裡量的是瀏覽器真的畫出來的時間，門檻取自同一份 `performance-budget.json`
// 的 `timings` 區段。
//
// 門檻刻意取 Core Web Vitals 的「良好」界線（FCP 1.8s、LCP 2.5s、CLS 0.1），
// 而不是貼著本機現值：共用 CI runner 的時間會抖動，貼著現值訂只會製造假紅燈。
// 這個測試要抓的是「有人讓首屏慢了一個數量級」，不是幾十毫秒的雜訊。

interface TimingBudget {
  metric: string;
  budget: number;
}

interface BudgetEntry {
  path: string;
  timings?: TimingBudget[];
}

// Playwright 把測試轉成 CommonJS 執行，因此這裡用 `__dirname` 而不是
// `import.meta.url` 定位預算檔。
const budgets = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'apps', 'web', 'performance-budget.json'),
    'utf8'
  )
) as BudgetEntry[];

// 預算檔以「產物檔名」定位頁面；index.html 對外的網址是 `/`。
const URL_BY_BUDGET_PATH = new Map([
  ['/index.html', '/'],
  ['/patient.html', '/patient.html']
]);

declare global {
  interface Window {
    __perfMetrics?: {
      largestContentfulPaint: number;
      cumulativeLayoutShift: number;
    };
  }
}

function budgetOf(entry: BudgetEntry, metric: string): number {
  const timing = entry.timings?.find(
    (candidate) => candidate.metric === metric
  );
  if (timing === undefined) {
    throw new Error(`performance-budget.json 缺少 ${entry.path} 的 ${metric}`);
  }
  return timing.budget;
}

for (const entry of budgets) {
  const url = URL_BY_BUDGET_PATH.get(entry.path);
  if (url === undefined || entry.timings === undefined) continue;

  test(`${entry.path} 的首屏時間與版面位移在預算內`, async ({ page }) => {
    // 觀察器必須在文件開始載入前就裝好，否則 LCP 與 layout-shift 的第一批
    // 事件會在觀察之前就發生。CDP 注入不受頁面 CSP 限制。
    await page.addInitScript(() => {
      const metrics = { largestContentfulPaint: 0, cumulativeLayoutShift: 0 };
      window.__perfMetrics = metrics;
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
          };
          if (shift.hadRecentInput) continue;
          metrics.cumulativeLayoutShift += shift.value ?? 0;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto(url, { waitUntil: 'load' });
    // 讓最後一批 LCP 候選與載入後的版面位移有時間被記錄下來。刻意不用
    // `networkidle`：那個條件在平行執行時不保證會出現，會把效能測試變成
    // 不穩定的逾時來源，而它要量的東西在 load 之後就已經確定了。
    await page.waitForTimeout(1000);

    const measured = await page.evaluate(() => ({
      firstContentfulPaint:
        performance
          .getEntriesByType('paint')
          .find((observed) => observed.name === 'first-contentful-paint')
          ?.startTime ?? 0,
      largestContentfulPaint:
        window.__perfMetrics?.largestContentfulPaint ?? Number.NaN,
      cumulativeLayoutShift:
        window.__perfMetrics?.cumulativeLayoutShift ?? Number.NaN
    }));

    // 量到 0 代表指標沒被記錄到（觀察器沒裝上或頁面沒畫出東西），
    // 那是測試壞了而不是效能好，必須失敗而不是靜靜通過。
    expect(measured.firstContentfulPaint).toBeGreaterThan(0);
    expect(measured.largestContentfulPaint).toBeGreaterThan(0);

    expect(
      measured.firstContentfulPaint,
      `FCP ${measured.firstContentfulPaint.toFixed(0)}ms`
    ).toBeLessThanOrEqual(budgetOf(entry, 'first-contentful-paint'));
    expect(
      measured.largestContentfulPaint,
      `LCP ${measured.largestContentfulPaint.toFixed(0)}ms`
    ).toBeLessThanOrEqual(budgetOf(entry, 'largest-contentful-paint'));
    expect(
      measured.cumulativeLayoutShift,
      `CLS ${measured.cumulativeLayoutShift.toFixed(3)}`
    ).toBeLessThanOrEqual(budgetOf(entry, 'cumulative-layout-shift'));
  });
}
