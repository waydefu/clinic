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
