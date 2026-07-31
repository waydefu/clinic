import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  createBooking,
  login,
  seedAppointmentCopies,
  showAllAppointments
} from './support/workbench.js';

export const PUBLIC_PAGE_SCAN_ROUTES = [
  '/',
  '/booking',
  '/privacy',
  '/clinic'
] as const;
const [WORKBENCH_ROUTE, BOOKING_ROUTE, PRIVACY_ROUTE, CLINIC_ROUTE] =
  PUBLIC_PAGE_SCAN_ROUTES;

// axe 無障礙掃描，跑在打包後的產物上。這是自動化能抓到的一部分 WCAG 問題
// （對比、名稱、地標、表單標籤…）；它補足而非取代人工報讀器與鍵盤測試。
//
// 只讓 serious / critical 影響等級的違規使測試失敗：這些是真正擋住使用者的問題。
// minor / moderate 仍會列出供人審視，但不阻斷 CI，避免把關卡變成噪音。
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

// 涵蓋到 WCAG 2.2 AA。2.2 自 2023 年起就是 W3C Recommendation，是現行標準。
//
// 只加 wcag22aa 標籤仍不會執行 `target-size`：axe-core 4.12 將該規則預設停用。
// `scan` 必須另外明確啟用它，否則註解與規則書雖然都聲稱有量 24px，實際掃描卻
// 完全沒跑。該規則的 impact 是 serious，因此違規會被下方的 gate 擋住。
const STANDARD_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22a',
  'wcag22aa'
];

async function scan(page: Page, context?: string) {
  const builder = new AxeBuilder({ page }).withTags(STANDARD_TAGS).options({
    rules: {
      'target-size': { enabled: true }
    }
  });
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

for (const route of PUBLIC_PAGE_SCAN_ROUTES) {
  test(`manifest public page 沒有 serious/critical 違規：${route}`, async ({
    page
  }) => {
    await page.goto(route);

    if (route === WORKBENCH_ROUTE) {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await expect(page.locator('#login-account')).toBeVisible();
    } else if (route === BOOKING_ROUTE) {
      await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
    } else if (route === PRIVACY_ROUTE) {
      await expect(
        page.getByRole('heading', { level: 1, name: /隱私權政策/ })
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', { level: 1, name: /從順暢呼吸開始/ })
      ).toBeVisible();
    }

    await scan(page, `manifest public page ${route}`);
  });
}

test.describe('無障礙掃描', () => {
  test('鼻功能醫學內頁沒有 serious/critical 違規', async ({ page }) => {
    await page.goto(`${CLINIC_ROUTE}/nasal/septoplasty`);
    await expect(
      page.getByRole('heading', { level: 1, name: '鼻中隔手術' })
    ).toBeVisible();
    await scan(page, '鼻功能醫學內頁');
  });

  test('工作臺登入後的預約清單沒有 serious/critical 違規', async ({ page }) => {
    await page.goto(WORKBENCH_ROUTE);
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#login-account').fill('admin');
    await page.locator('#login-password').fill('beauessence-admin');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#logout')).toBeVisible();
    await page.goto(`${WORKBENCH_ROUTE}#appointments-section`);
    // 展開建立預約的 <details>，讓掃描也涵蓋表單欄位。
    await page.locator('#booking-workflow').evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await expect(page.locator('#booking-form')).toBeVisible();
    await scan(page, '工作臺預約清單');
  });

  test('預約分頁有可及名稱、頁碼狀態且沒有 serious/critical 違規', async ({
    page
  }) => {
    await login(page);
    await createBooking(page);
    await seedAppointmentCopies(page, 25);
    await showAllAppointments(page);

    const pagination = page.getByRole('navigation', {
      name: '預約清單分頁'
    });
    await expect(pagination).toBeVisible();
    await expect(
      pagination.getByRole('button', { name: '上一頁預約' })
    ).toBeDisabled();
    await expect(
      pagination.getByRole('button', { name: '下一頁預約' })
    ).toBeEnabled();
    await expect(page.locator('#appointment-page-status')).toHaveText(
      '第 1 頁，共 2 頁'
    );
    await scan(page, '工作臺預約分頁');
  });

  test('forced-colors 模擬保留焦點、目前步驟、目前工作區與按鈕邊界', async ({
    page
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(BOOKING_ROUTE);
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.matchMedia('(forced-colors: active)').matches
        )
      )
      .toBe(true);

    const currentStep = page.locator(
      '.booking-stepper li[aria-current="step"]'
    );
    const stepOutline = await currentStep.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth)
      };
    });
    expect(stepOutline.style).not.toBe('none');
    expect(stepOutline.width).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Tab');
    const focusOutline = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const style = getComputedStyle(active);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth)
      };
    });
    expect(focusOutline).not.toBeNull();
    expect(focusOutline?.style).not.toBe('none');
    // Chromium may normalize the authored 3px system-color outline to 2px
    // under forced colors; the invariant is that a visible outline survives.
    expect(focusOutline?.width).toBeGreaterThanOrEqual(2);

    await login(page);
    await page.goto(`${WORKBENCH_ROUTE}#appointments-section`);
    const currentWorkspace = page.locator(
      '[data-workspace-nav][aria-current="page"]'
    );
    const workspaceOutline = await currentWorkspace.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth)
      };
    });
    expect(workspaceOutline.style).not.toBe('none');
    expect(workspaceOutline.width).toBeGreaterThanOrEqual(2);

    const buttonBorder = await page
      .locator('#appointment-filter-reset')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          style: style.borderTopStyle,
          width: Number.parseFloat(style.borderTopWidth)
        };
      });
    expect(buttonBorder.style).not.toBe('none');
    expect(buttonBorder.width).toBeGreaterThanOrEqual(1);
  });
});
