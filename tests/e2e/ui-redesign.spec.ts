import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createBooking,
  login,
  showAllAppointments,
  STORAGE_KEY
} from './support/workbench.js';

// Complements T3-Q-01 without modifying its five in-flight files. Assertions
// protect task access and responsive geometry, not a particular CSS layout.
for (const width of [320, 360, 375, 390, 768, 1024, 1280, 1440]) {
  test(`新版工作臺 ${width}px 保留有資料清單、導覽與可操作目標`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await createBooking(page, { name: 'TEST_UI_001', phone: '0900000001' });
    await showAllAppointments(page);
    if (width >= 1024) {
      // 清單日期來自 createBooking 的「下一檔時段」，1–9 日比 10–31 日短一碼。
      // 桌機 1280 的 4px 溢位只在兩位數日穩定出現；另插一列最長完整日期，
      // 避免把真實版面缺陷藏進「今天還是個位數日」的綠燈。
      await page.evaluate((key) => {
        const raw = window.localStorage.getItem(key);
        if (raw === null) throw new Error('找不到合成工作臺狀態');
        const state = JSON.parse(raw);
        const source = state.appointments.at(-1);
        if (source === undefined) throw new Error('請先建立一筆預約');
        state.appointments.push({
          ...source,
          id: 'appointment_long_date',
          startsAt: '2026-12-31T04:00:00.000Z'
        });
        window.localStorage.setItem(key, JSON.stringify(state));
      }, STORAGE_KEY);
      await page.reload();
      await expect(page.locator('#login-view')).toBeHidden();
      await showAllAppointments(page);
      await expect(page.locator('#appointments-section')).toContainText(
        '2026年12月31日'
      );
    }
    await expect(page.locator('#appointments-section')).toContainText(
      'TEST_UI_001'
    );
    const geometry = await page.evaluate(() => {
      const overflow =
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth;
      const outside = [...document.querySelectorAll('body *')]
        .filter(
          (el) =>
            el.checkVisibility() &&
            el.getBoundingClientRect().right > innerWidth + 1
        )
        .slice(-20)
        .map((el) => ({
          tag: el.tagName,
          id: el.id,
          class: String(el.className).slice(0, 80),
          right: Number(el.getBoundingClientRect().right.toFixed(1)),
          min: getComputedStyle(el).minWidth
        }));
      return { overflow, outside };
    });
    expect(geometry.overflow, JSON.stringify(geometry)).toBeLessThanOrEqual(1);
    const trigger = page.getByRole('button', {
      name: '工作區導覽',
      exact: true
    });
    if (width <= 768) await trigger.click();
    else {
      await expect(trigger).toBeHidden();
      const rail = page.locator('.workspace-nav');
      await expect(rail).toHaveCSS('flex-direction', 'column');
      await expect(rail).toHaveCSS('position', 'sticky');
      expect((await rail.boundingBox())!.width).toBe(176);
    }
    const active = page.locator('.workspace-nav [aria-current="page"]');
    await active.focus();
    await expect(active).toBeInViewport();
    await expect(active).toBeFocused();
    // selectOption / hash scroll uses block:start and tucks
    // #appointment-status-filter under sticky .workspace-nav at 768px.
    // Axe then reports WCAG 2.5.8 target-size (partiallyObscured ~11px).
    // Center the control before the scan; do not weaken the rule.
    await page.locator('#appointment-status-filter').evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .withRules(['target-size'])
      .analyze();
    expect(
      scan.violations.filter(
        (v) =>
          v.impact === 'serious' ||
          v.impact === 'critical' ||
          v.id === 'target-size'
      )
    ).toEqual([]);
  });
}

test('官網主視覺完整顯示既有醫師肖像，說明不覆蓋影像', async ({ page }) => {
  await page.goto('/clinic');
  const portrait = page.locator('.clinic-hybrid-hero__image');
  await expect(portrait).toHaveAttribute('alt', '顏正安院長形象照');
  await expect(portrait).toHaveCSS('object-fit', 'contain');
  const imageBox = await portrait.boundingBox();
  const captionBox = await page
    .locator('.clinic-hybrid-hero__caption')
    .boundingBox();
  expect(imageBox).not.toBeNull();
  expect(captionBox).not.toBeNull();
  expect(captionBox!.y).toBeGreaterThanOrEqual(
    imageBox!.y + imageBox!.height - 1
  );
  await expect(
    page.locator('.clinic-hybrid-hero__actions a[href="/booking"]')
  ).toBeVisible();
});

test('患者手機首屏可開始選擇，選擇與返回仍保留', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking');
  await expect(page.locator('.booking-stepper strong')).toHaveCount(3);
  for (const label of await page.locator('.booking-stepper strong').all()) {
    await expect(label).toBeVisible();
  }
  const firstVisit = page.locator('[data-booking-type="initial"]');
  await expect(firstVisit).toBeInViewport();
  await firstVisit.click();
  // Service renderer owns the button attribute; use its native button role.
  const choice = page.locator('#patient-services button').first();
  await expect(choice).toBeVisible();
  await choice.click();
  await expect(page.locator('#slot-choice-heading')).toBeVisible();
  await page.locator('[data-booking-back="1"]').click();
  await expect(firstVisit).toHaveAttribute('aria-pressed', 'true');
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
});

test('官網首屏主要文案與醫師說明不以低透明度進場', async ({ page }) => {
  await page.goto('/clinic');
  const animated = await page
    .locator('.clinic-hybrid-hero__copy > *, .clinic-hybrid-hero__visual')
    .evaluateAll((elements) =>
      elements
        .filter((element) => getComputedStyle(element).animationName !== 'none')
        .map((element) => element.className)
    );
  expect(animated).toEqual([]);
});

for (const width of [320, 375]) {
  for (const state of ['schedule', 'patient-details']) {
    test(`${width}px 表單狀態 ${state} 不溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      if (state === 'schedule') {
        await login(page);
        await page.goto('/staff#schedule-section');
        await expect(page.locator('#weekly-form')).toBeVisible();
      } else {
        await page.goto('/booking');
        await page.locator('[data-booking-type="initial"]').click();
        await page.locator('[data-service]').first().click();
        await page.locator('[data-patient-slot]').first().click();
        await expect(page.locator('#patient-name')).toBeVisible();
      }
      const geometry = await page.evaluate(() => ({
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        outside: [...document.querySelectorAll('body *')]
          .filter(
            (el) =>
              el.checkVisibility() &&
              el.getBoundingClientRect().right > innerWidth + 1
          )
          .slice(-20)
          .map((el) => ({
            tag: el.tagName,
            id: el.id,
            class: el.className,
            right: el.getBoundingClientRect().right,
            min: getComputedStyle(el).minWidth
          }))
      }));
      expect(
        geometry.overflow,
        JSON.stringify(geometry.outside)
      ).toBeLessThanOrEqual(1);
    });
  }
}

test('官網模組延遲時，頁尾不先佔據主內容首屏', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let release!: () => void;
  const moduleReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/clinic-site(?:\.[a-f0-9]+)?\.js$/, async (route) => {
    await moduleReady;
    await route.continue();
  });
  try {
    await page.goto('/clinic', { waitUntil: 'commit' });
    await expect(page.locator('.clinic-header')).toHaveCSS(
      'position',
      'sticky'
    );
    await expect(page.locator('.clinic-footer')).toBeAttached();
    const footer = await page.locator('.clinic-footer').boundingBox();
    expect(footer!.y).toBeGreaterThanOrEqual(900);
  } finally {
    release();
  }
  await expect(page.locator('#clinic-main h1')).toBeVisible();
});

test.describe('官網無腳本退路', () => {
  test.use({ javaScriptEnabled: false });
  test('不為尚未執行的模組留下空白首屏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/clinic');
    await expect(page.locator('.clinic-noscript')).toBeVisible();
    const footer = await page.locator('.clinic-footer').boundingBox();
    expect(footer!.y).toBeLessThan(900);
    await expect(
      page.locator('.clinic-noscript a[href="tel:+886225771314"]')
    ).toBeVisible();
  });
});
