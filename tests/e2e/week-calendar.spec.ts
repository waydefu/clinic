import { expect, test, type Page } from '@playwright/test';

import {
  createBooking,
  login,
  openDisclosure,
  seedAppointmentCopies,
  showAllAppointments
} from './support/workbench.js';

// 週檢視的捲動語意與行動版形態。
//
// 兩件由業主實機操作回報的問題：日曆內多出一條沒有用途的垂直捲軸，以及手機上
// 的時間網格根本無法使用。既有的 responsive 測試檢查的是**頁面層級**的水平
// 捲動，而週檢視的捲動發生在容器內部，所以那些測試一路綠燈卻沒看見這兩件事。
// 這一組專門盯著容器本身。

const MOBILE = { width: 375, height: 812 };

/** 週檢視收在「本週排程」的 <details> 裡，量捲動之前要先展開。 */
async function openCalendarPanel(page: Page): Promise<void> {
  await page.goto('/#appointments-section');
  await openDisclosure(page, '#week-calendar-disclosure');
}

test.describe('週檢視的捲動', () => {
  // `overflow-x: auto` 會讓另一軸的 `visible` 被**計算成** `auto`（CSS 規定：
  // 兩軸只要有一軸不是 visible／clip，另一軸就跟著變）。於是容器拿到一條沒人
  // 要的垂直捲軸：水平捲軸佔掉約 13px 高度 → 內容垂直溢位 13px → 捲軸出現。
  // 它捲到底也看不到新東西，只會把停在日曆上的滾輪手勢吃掉。
  test('容器不得有垂直捲軸，垂直方向本來就不需要捲動', async ({ page }) => {
    await login(page);
    await openCalendarPanel(page);

    const overflowY = await page
      .locator('.week-view')
      .evaluate((element) => getComputedStyle(element).overflowY);
    // auto／scroll 才會產生捲軸並攔截滾輪；hidden 不會。
    expect(overflowY).toBe('hidden');
  });
});

test.describe('行動版週檢視', () => {
  test.use({ viewport: MOBILE });

  // 時間網格在 375px 需要 832px 寬（實測），要橫捲 2.5 個螢幕，而且時間軸不是
  // sticky，一橫捲就看不出那是幾點。行程表放棄時間軸，換成垂直清單。
  test('手機改用行程表，且完全沒有水平捲動', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await openCalendarPanel(page);

    const host = page.locator('#week-view');
    await expect(host.locator('.wv-agenda')).toBeVisible();
    await expect(host.locator('.wv-grid')).toHaveCount(0);

    const scroll = await host.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }));
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
  });

  // 兩種檢視同時存在於 DOM 會產生兩個同名按鈕：點擊處理器抓到兩個，讀螢幕也
  // 唸兩次。所以是擇一渲染，不是畫兩份再用 CSS 藏一份。
  test('一筆預約只出現一個可點事件，不會兩種檢視都渲染', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await openCalendarPanel(page);

    const events = page.locator('#week-view [data-week-event]');
    await expect(events).toHaveCount(1);

    // 而且維持全站 44px 的可點面積標準。
    const box = await events.first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('事件帶著與網格檢視相同的完整標籤', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await openCalendarPanel(page);

    const label = await page
      .locator('#week-view [data-week-event]')
      .first()
      .getAttribute('aria-label');
    expect(label).toContain('測試患者甲');
    expect(label).toContain('初診');
  });
});

test.describe('桌機仍是時間網格', () => {
  test('寬螢幕維持網格檢視，行程表不出現', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await createBooking(page);
    await openCalendarPanel(page);

    const host = page.locator('#week-view');
    await expect(host.locator('.wv-grid')).toBeVisible();
    await expect(host.locator('.wv-agenda')).toHaveCount(0);
    await expect(host.locator('[data-week-event]')).toHaveCount(1);
  });

  test('點第二頁的週事件會切到目標所在頁並顯示該列', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await createBooking(page);
    const ids = await seedAppointmentCopies(page, 25);
    await showAllAppointments(page);
    await openCalendarPanel(page);

    const targetId = ids.at(-1);
    if (targetId === undefined) throw new Error('缺少分頁目標預約');
    await expect(
      page.locator(`[data-appointment-card="${targetId}"]`)
    ).toHaveCount(0);

    const event = page.locator(`#week-view [data-week-event="${targetId}"]`);
    await expect(event).toHaveCount(1);
    // 同一時段附近有多筆事件；直接觸發原生 click，避免測試本身受碰撞版面遮擋影響。
    await event.evaluate((button) => (button as HTMLButtonElement).click());

    await expect(page.locator('#appointment-page-status')).toHaveText(
      '第 2 頁，共 2 頁'
    );
    await expect(
      page.locator(`[data-appointment-card="${targetId}"]`)
    ).toBeVisible();
  });
});
