import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createBooking,
  login,
  showAllAppointments
} from './support/workbench.js';

// Complements T3-Q-01 without modifying its five in-flight files. Assertions
// protect task access and responsive geometry, not a particular CSS layout.
for (const width of [360, 390, 768, 1280, 1440]) {
  test(`新版工作臺 ${width}px 保留有資料清單、導覽與可操作目標`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await createBooking(page, { name: 'TEST_UI_001', phone: '0900000001' });
    await showAllAppointments(page);
    await expect(page.locator('#appointments-section')).toContainText(
      'TEST_UI_001'
    );
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
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
