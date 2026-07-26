import { expect, test, type Page } from '@playwright/test';

// 版面在每個斷點都不得產生水平捲軸（WCAG 1.4.10 Reflow：320px 寬度下內容要能
// 單欄重排）。
//
// 這個測試也是斷點統一的把關。先前兩份樣式表各用一套斷點（styles.css 62/44/30rem、
// workbench.css 70/48/44rem），44–48rem 之間是一段沒人設計過的半成品狀態：
// workbench 已經把工具列拉成滿版，styles 卻還沒把 topbar 轉成直排。統一成
// 64/48/30rem 之後，這裡逐一量過每個斷點的上下緣。

// 斷點本身，加上斷點正上方 1px（確認舊規則已經讓位）與常見裝置寬度。
const WIDTHS = [1280, 1025, 1024, 769, 768, 481, 480, 390, 320];

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = [...document.querySelectorAll('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > root.clientWidth + 1;
      })
      .slice(0, 5)
      .map((element) => {
        const id = element.id ? `#${element.id}` : '';
        const cls =
          typeof element.className === 'string' && element.className
            ? `.${element.className.trim().split(/\s+/)[0]}`
            : '';
        return `${element.tagName.toLowerCase()}${id}${cls}`;
      });
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      overflowing
    };
  });
}

test.describe('版面重排', () => {
  for (const width of WIDTHS) {
    test(`患者頁在 ${width}px 不出現水平捲軸`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/booking');
      await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();

      const result = await horizontalOverflow(page);
      expect(
        result.scrollWidth,
        `溢出元素：${result.overflowing.join(', ')}`
      ).toBeLessThanOrEqual(result.clientWidth + 1);
    });
  }

  for (const width of WIDTHS) {
    test(`工作臺在 ${width}px 不出現水平捲軸`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.locator('#login-account').fill('admin');
      await page.locator('#login-password').fill('beauessence-admin');
      await page.locator('#login-view button[type="submit"]').click();
      // 手機寬度下工具列會收進 <details>，#logout 因此不可見——用登入閘門
      // 是否消失來判斷登入成功，才是在每個寬度都成立的訊號。
      await expect(page.locator('#login-view')).toBeHidden();
      await expect(page.locator('#workspace-title')).toBeVisible();

      const result = await horizontalOverflow(page);
      expect(
        result.scrollWidth,
        `溢出元素：${result.overflowing.join(', ')}`
      ).toBeLessThanOrEqual(result.clientWidth + 1);
    });
  }
});
