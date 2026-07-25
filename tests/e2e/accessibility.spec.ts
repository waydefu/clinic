import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// axe 無障礙掃描，跑在打包後的產物上。這是自動化能抓到的一部分 WCAG 問題
// （對比、名稱、地標、表單標籤…）；它補足而非取代人工報讀器與鍵盤測試。
//
// 只讓 serious / critical 影響等級的違規使測試失敗：這些是真正擋住使用者的問題。
// minor / moderate 仍會列出供人審視，但不阻斷 CI，避免把關卡變成噪音。
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

// 涵蓋到 WCAG 2.2 AA。2.2 自 2023 年起就是 W3C Recommendation，是現行標準。
//
// 先前這裡只列到 wcag21aa，等於 axe 的 `target-size`（SC 2.5.8，只掛在
// wcag22aa 標籤下）從來沒有被執行過——目標尺寸這一整類問題不會被任何自動檢查
// 看到。補上之後現況仍然零違規，所以這是白拿的一層保護，不是放寬。
const STANDARD_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa'
];

async function scan(page: Page, context?: string) {
  const builder = new AxeBuilder({ page }).withTags(STANDARD_TAGS);
  const results = await builder.analyze();
  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? '')
  );
  // 失敗時把違規的規則與節點印出來，才知道要修哪裡。
  expect(
    blocking,
    `${context ?? 'page'} axe violations:\n${JSON.stringify(
      blocking.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length
      })),
      null,
      2
    )}`
  ).toEqual([]);
}

test.describe('無障礙掃描', () => {
  test('患者預約頁沒有 serious/critical 違規', async ({ page }) => {
    await page.goto('/patient.html');
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
    await scan(page, '患者預約頁');
  });

  test('工作臺登入閘門沒有 serious/critical 違規', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.locator('#login-account')).toBeVisible();
    await scan(page, '工作臺登入閘門');
  });

  test('工作臺登入後的預約清單沒有 serious/critical 違規', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#login-account').fill('admin');
    await page.locator('#login-password').fill('beauessence-admin');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#logout')).toBeVisible();
    await page.goto('/#appointments-section');
    // 展開建立預約的 <details>，讓掃描也涵蓋表單欄位。
    await page.locator('#booking-workflow').evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await expect(page.locator('#booking-form')).toBeVisible();
    await scan(page, '工作臺預約清單');
  });
});
