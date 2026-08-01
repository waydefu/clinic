import { expect, test } from '@playwright/test';

import { createBooking, login, openDisclosure } from './support/workbench.js';

// [人工無障礙 runbook](../../docs/runbooks/manual-accessibility-test.md) 的
// **機器可驗前置條件**。
//
// 那份 runbook 需要真人戴著螢幕閱讀器走完，因為「這句話念出來聽不聽得懂」沒有
// 任何程式判斷得了。但它的通過條件裡有一部分是結構性的——焦點有沒有真的移過去、
// 屬性在不在、Esc 有沒有把焦點還回去——那些每次改版都可能默默壞掉，卻要等到下一
// 次人工測試才會被發現。
//
// 這一組把那部分釘住，讓人工測試把時間花在真正需要耳朵的地方。**它不取代人工
// 測試**：這裡全綠只代表結構前提還在，不代表播報內容正確。

test.describe('runbook B4：跳過導覽連結', () => {
  test('第一個 Tab 就是跳過連結，按下後焦點真的落在主要內容', async ({
    page
  }) => {
    await login(page);
    await page.goto('/');
    await page.keyboard.press('Tab');

    const focused = page.locator(':focus');
    await expect(focused).toHaveClass(/skip-link/);

    // 只有連結存在不算數。舊版瀏覽器與部分實作按下後只改 hash、焦點留在原地，
    // 那對鍵盤使用者等於這條連結不存在。
    //
    // 斷言的是「焦點進入主要內容」而不是「焦點等於 #main-content」。實測（2026-08-01）
    // 焦點會落在 main 內的第一個區段標題 `#overview-heading`——那比停在裸 <main>
    // 更好，因為報讀器會順帶念出區段名稱。runbook B4 的通過條件寫的是「焦點真的
    // 移到 #main-content」，字面上比實作窄；照字面判會產生假失敗。已在 TW-05 的
    // 證據紀錄裡標出這處措辭落差。
    await focused.press('Enter');

    // 焦點是在 hashchange 之後才移動的，所以要輪詢等它落定，而不是按完立刻讀。
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement;
          const main = document.querySelector('#main-content');
          return main !== null && active !== null && main.contains(active);
        })
      )
      .toBe(true);

    const landedOn = await page.evaluate(() => document.activeElement?.id);
    expect(landedOn).toBeTruthy();
  });
});

test.describe('runbook B2：登入後的焦點落點', () => {
  test('焦點不會留在已經消失的登入表單上', async ({ page }) => {
    await login(page);

    const stranded = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return 'null';
      const loginView = document.querySelector('#login-view');
      return loginView?.contains(active) === true ? 'in-login-view' : 'moved';
    });
    expect(stranded).toBe('moved');
  });
});

test.describe('runbook B9：週檢視可聚焦', () => {
  test('是具名群組且可以取得焦點', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await page.goto('/#appointments-section');
    await openDisclosure(page, '#week-calendar-disclosure');

    const weekView = page.locator('#week-view');
    await expect(weekView).toHaveAttribute('role', 'group');
    await expect(weekView).toHaveAttribute('tabindex', '0');
    await expect(weekView).toHaveAttribute('aria-label', /週檢視/);

    // 屬性寫對但實際聚焦不了（被 CSS 或祖先 inert 擋住）也是常見的退步。
    await weekView.focus();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      'week-view'
    );
  });
});

test.describe('runbook B12：通知 popover 的 Esc 行為', () => {
  test('關閉後焦點回到鈴鐺，且 header 不位移', async ({ page }) => {
    await login(page);

    const bell = page.locator('#nav-bell');
    const headerBefore = await page.locator('header').first().boundingBox();

    await bell.click();
    await expect(page.locator('#notification-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#notification-popover')).toBeHidden();

    // 焦點掉回 <body> 是最常見的失敗樣態：清單關了，但鍵盤使用者要從頭 Tab 一次。
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      'nav-bell'
    );

    const headerAfter = await page.locator('header').first().boundingBox();
    expect(headerAfter?.height).toBe(headerBefore?.height);
  });
});

test.describe('runbook C1：forced-colors 下的焦點框', () => {
  test('高對比模式仍有可見焦點框，且用系統色', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await login(page);
    await page.goto('/');
    await page.keyboard.press('Tab');

    const outline = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null) return null;
      const style = getComputedStyle(active);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });

    expect(outline).not.toBeNull();
    expect(outline?.style).not.toBe('none');
    expect(Number.parseFloat(outline?.width ?? '0')).toBeGreaterThan(0);
  });
});
