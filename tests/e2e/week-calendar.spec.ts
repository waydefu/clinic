import { expect, test, type Page } from '@playwright/test';

import {
  createBooking,
  login,
  openDisclosure,
  seedAppointmentCopies,
  showAllAppointments
} from './support/workbench.js';

// 桌機採「日期欄 × 實際營業 session 列」；手機維持日期分組行程表。兩種檢視只
// 畫真實事件，不靠空白占位卡製造看似有內容的日曆。

const MOBILE = { width: 375, height: 812 };

/** 週檢視收在「本週排程」的 <details> 裡，量捲動之前要先展開。 */
async function openCalendarPanel(page: Page): Promise<void> {
  await page.goto('/#appointments-section');
  await openDisclosure(page, '#week-calendar-disclosure');
}

test.describe('桌機緊湊 session matrix', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await openCalendarPanel(page);
  });

  test('門診列由實際排班推導，不再渲染絕對定位時間軸', async ({ page }) => {
    await expect(page.locator('.wv-session-table')).toBeVisible();
    await expect(page.locator('[data-week-session="600-1080"]')).toContainText(
      '10:00–18:00'
    );
    await expect(page.locator('[data-week-session="720-1200"]')).toContainText(
      '12:00–20:00'
    );
    await expect(page.locator('.wv-axis, .wv-hour, .wv-line')).toHaveCount(0);
  });

  test('空週只有日期與營業 session，沒有假事件或空白占位卡', async ({
    page
  }) => {
    await expect(page.locator('#week-view [data-week-event]')).toHaveCount(0);
    await expect(page.locator('.wv-session-cell > *')).toHaveCount(0);
    await expect(page.locator('.wv-session-table')).not.toContainText(
      '尚無預約'
    );
  });

  test('預設空週保持緊湊且不產生巢狀垂直捲動', async ({ page }) => {
    const geometry = await page.locator('.week-view').evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      hidden: element.scrollHeight - element.clientHeight,
      overflowY: getComputedStyle(element).overflowY
    }));
    expect(geometry.height).toBeLessThan(400);
    expect(geometry.hidden).toBeLessThanOrEqual(0);
    expect(geometry.overflowY).toBe('hidden');
  });
});

test.describe('行動版週檢視', () => {
  test.use({ viewport: MOBILE });

  // 時間網格在 375px 需要 832px 寬（實測），要橫捲 2.5 個螢幕，而且時間軸不是
  // sticky，一橫捲就看不出那是幾點。行程表放棄時間軸，換成垂直清單。
  test('手機改用行程表，且完全沒有水平捲動', async ({ page }) => {
    await login(page);
    await createBooking(page);
    // 錨定到被渲染的那一週；打烊後 createBooking 會訂到下一個門診日，
    // 那可能不在週檢視顯示的週內。理由見 seedAppointmentCopies 的註解。
    await seedAppointmentCopies(page, 1);
    await openCalendarPanel(page);

    const host = page.locator('#week-view');
    await expect(host.locator('.wv-agenda')).toBeVisible();
    await expect(host.locator('.wv-session-table')).toHaveCount(0);

    const scroll = await host.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }));
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
  });

  // 桌機的高度上限與內部捲動**不得**套到行程表上。它是另一種檢視型態，不是同一
  // 個網格的窄版：清單本來就該跟著頁面自然流動，硬加高度上限等於把桌機的問題
  // 複製到手機，還多一個巢狀捲動容器。目前沒有別的測試守著這件事。
  test('行程表不得有自己的捲動容器', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await seedAppointmentCopies(page, 1);
    await openCalendarPanel(page);

    const box = await page.locator('#week-view').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        maxHeight: style.maxHeight,
        overflowY: style.overflowY,
        hidden: element.scrollHeight - element.clientHeight
      };
    });

    expect(box.maxHeight).toBe('none');
    expect(box.hidden).toBeLessThanOrEqual(0);
  });

  // 兩種檢視同時存在於 DOM 會產生兩個同名按鈕：點擊處理器抓到兩個，讀螢幕也
  // 唸兩次。所以是擇一渲染，不是畫兩份再用 CSS 藏一份。
  test('一筆預約只出現一個可點事件，不會兩種檢視都渲染', async ({ page }) => {
    await login(page);
    await createBooking(page);
    // 錨定到被渲染的那一週；打烊後 createBooking 會訂到下一個門診日，
    // 那可能不在週檢視顯示的週內。理由見 seedAppointmentCopies 的註解。
    await seedAppointmentCopies(page, 1);
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
    // 錨定到被渲染的那一週；打烊後 createBooking 會訂到下一個門診日，
    // 那可能不在週檢視顯示的週內。理由見 seedAppointmentCopies 的註解。
    await seedAppointmentCopies(page, 1);
    await openCalendarPanel(page);

    const label = await page
      .locator('#week-view [data-week-event]')
      .first()
      .getAttribute('aria-label');
    expect(label).toContain('測試患者甲');
    expect(label).toContain('初診');
  });
});

test.describe('桌機 session matrix 事件', () => {
  test('寬螢幕只渲染 matrix，真實預約只產生一張事件卡', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await createBooking(page);
    // 錨定到被渲染的那一週；打烊後 createBooking 會訂到下一個門診日，
    // 那可能不在週檢視顯示的週內。理由見 seedAppointmentCopies 的註解。
    await seedAppointmentCopies(page, 1);
    await openCalendarPanel(page);

    const host = page.locator('#week-view');
    await expect(host.locator('.wv-session-table')).toBeVisible();
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
