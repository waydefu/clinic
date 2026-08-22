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
  // 這一條原本斷言「不得有垂直捲軸」（`overflow-y` 必須是 `hidden`）。那是
  // 2026-07-25 業主回報後的修法，但它把規則寫錯了層級：業主抱怨的是**捲了等於
  // 沒捲**——`overflow-x: auto` 依 CSS 規定會把另一軸的 `visible` 計算成 `auto`，
  // 水平捲軸佔掉約 13px 高度使內容垂直溢位 13px，於是冒出一條捲到底也看不到新
  // 東西的捲軸，只會把停在日曆上的滾輪手勢吃掉。
  //
  // 「一律禁止垂直捲軸」把正確的做法也一起擋掉了：時間網格的高度是「時數 ×
  // 每小時像素」，兩個因數各有下限，1122px 在 1366×768 的筆電上是視窗高度的
  // 1.7 倍（2026-08-02 業主回報「佔太多頁面空間」）。唯一的調節方式就是限制
  // 容器高度並在內部捲動。
  //
  // 規則因此改成「有捲軸就必須捲得出實質內容」（介面規則 R-20）——同時擋住舊
  // bug 與它的劣化版，而不是連正確做法一起擋。
  test('垂直捲軸必須捲得出實質內容，不能捲了等於沒捲', async ({ page }) => {
    await login(page);
    await openCalendarPanel(page);

    const scroll = await page.locator('.week-view').evaluate((element) => ({
      hidden: element.scrollHeight - element.clientHeight,
      overflowY: getComputedStyle(element).overflowY
    }));

    // 沒開放捲動就不該有溢位；開放了就必須是「值得捲」的量。100px 大約是一個
    // 完整時段方塊加一條時線——低於它就是先前那種 13px 假捲軸的同類。
    if (scroll.overflowY === 'hidden')
      expect(scroll.hidden).toBeLessThanOrEqual(0);
    else expect(scroll.hidden).toBeGreaterThan(100);
  });

  // 沒有欄名的時間網格等於一張沒有標題的表格：捲到下午就分不出哪一欄是哪一天。
  // sticky 在 `overflow-y: hidden` 之下是**沒有效果**的（黏的是最近的捲動容器，
  // 而那時容器垂直不捲），所以這條同時守著「有開放垂直捲動」與「表頭有黏住」。
  test('捲動後日期表頭仍然可見', async ({ page }) => {
    await login(page);
    await openCalendarPanel(page);

    const view = page.locator('.week-view');
    await expect(page.locator('.wv-head')).toBeVisible();

    await view.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const offset = await view.evaluate((element) => {
      const header = element.querySelector('.wv-head') as HTMLElement;
      return (
        header.getBoundingClientRect().top - element.getBoundingClientRect().top
      );
    });
    // 黏住時表頭頂端貼齊容器頂端；沒黏住會被捲成負值。
    expect(Math.abs(offset)).toBeLessThanOrEqual(2);
  });

  // 時間範圍由排班推導，不寫死。平日 12:00–20:00、30 分鐘一格且必須完整落在
  // 營業時間內 → 最後一格 19:30 起、20:00 結束，所以不該畫到 20:00 之後。
  // 先前寫死到 21:00，多出一小時永遠空白的網格。
  test('時間軸不超出營業時間', async ({ page }) => {
    await login(page);
    await openCalendarPanel(page);

    const labels = await page
      .locator('.wv-hour')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()));

    expect(labels.length).toBeGreaterThan(0);
    expect(labels.at(-1)).toBe('20:00');
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
    await expect(host.locator('.wv-grid')).toHaveCount(0);

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

test.describe('桌機仍是時間網格', () => {
  test('寬螢幕維持網格檢視，行程表不出現', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await createBooking(page);
    // 錨定到被渲染的那一週；打烊後 createBooking 會訂到下一個門診日，
    // 那可能不在週檢視顯示的週內。理由見 seedAppointmentCopies 的註解。
    await seedAppointmentCopies(page, 1);
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
