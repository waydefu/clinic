import { expect, test, type Page } from '@playwright/test';

// 互動元素必須「看得出來可以按」。
//
// 這一組測試來自 2026-07-25 的實際回饋：「清除選取」與「前往處理清單」在畫面上
// 只是變了顏色的文字，使用者不知道那是按鈕。兩個成因不同，但症狀一樣：
//
//   1. `.text-button` 當時是 `background: transparent; padding: 0`——沒有任何形狀。
//   2. `.summary-action` 的按鈕樣式寫成 `.summary-card .summary-action`，於是同樣
//      掛著這個 class、但放在「下一位」面板裡的那一顆，完全沒吃到樣式。
//
// 第二種特別危險：**它不會報錯**，CSS 也沒有壞，只是選擇器沒選到。所以這裡不驗
// 「有沒有寫某條規則」，而是驗**畫面上算出來的樣子**——那是唯一抓得到 (2) 的方式。
//
// 依據：NN/g〈Beyond Blue Links: Making Clickable Elements Recognizable〉——扁平化
// 之後，互動元素仍必須靠形狀（邊框、底色、內距）或底線與靜態文字區分，光靠顏色
// 不夠；該文並引用了「從扁平改成有立體感的按鈕後點擊率大幅上升」的研究。

/** 導覽列裡的連結靠**位置**表達可點擊，依 NN/g 不需要額外的底線或框。 */
const POSITIONALLY_SIGNALLED = ['nav', '.workspace-nav', '.patient-nav'];

async function affordanceReport(page: Page) {
  return page.evaluate((skipSelectors) => {
    const parseRgb = (value: string) => {
      const parts = value.match(/[\d.]+/g);
      return parts === null
        ? null
        : {
            r: Number(parts[0]),
            g: Number(parts[1]),
            b: Number(parts[2]),
            a: parts[3] === undefined ? 1 : Number(parts[3])
          };
    };

    const offenders: string[] = [];
    const candidates = document.querySelectorAll<HTMLElement>(
      'button, a[href], [role="button"]'
    );

    for (const element of candidates) {
      // 只看使用者現在真的看得到的東西。
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (skipSelectors.some((selector) => element.closest(selector) !== null))
        continue;
      // <summary> 由瀏覽器自己畫展開標記；skip-link 平時刻意藏在畫面外。
      if (element.closest('summary') !== null) continue;
      if (element.classList.contains('skip-link')) continue;
      // 標誌本身就是「回首頁」——這是網頁上最強的既有慣例之一，不需要再框一個
      // 按鈕外觀。它已經有圖像形狀，加框反而會讓 header 變得吵。
      if (element.classList.contains('brand')) continue;

      const style = window.getComputedStyle(element);

      const hasBorder =
        ['borderTopWidth', 'borderBottomWidth'].some(
          (side) => Number.parseFloat(style[side as 'borderTopWidth']) > 0
        ) && style.borderTopStyle !== 'none';
      const hasOutline =
        Number.parseFloat(style.outlineWidth) > 0 &&
        style.outlineStyle !== 'none';
      const background = parseRgb(style.backgroundColor);
      const hasBackground = background !== null && background.a > 0;
      const hasUnderline = style.textDecorationLine.includes('underline');
      // 有 box-shadow 也算一種形狀（例如 inset 的下緣線）。
      const hasShadow = style.boxShadow !== 'none';

      if (hasBorder || hasOutline || hasBackground || hasUnderline || hasShadow)
        continue;

      const label = `${element.tagName.toLowerCase()}${
        element.id ? `#${element.id}` : ''
      }${
        typeof element.className === 'string' && element.className.trim() !== ''
          ? `.${element.className.trim().split(/\s+/).join('.')}`
          : ''
      }`;
      offenders.push(
        `${label} — 「${element.textContent?.trim().slice(0, 18)}」`
      );
    }
    return offenders;
  }, skipSelectorsFor());
}

function skipSelectorsFor() {
  return POSITIONALLY_SIGNALLED;
}

test.describe('可點擊性（affordance）', () => {
  test('患者頁的互動元素都看得出可以按', async ({ page }) => {
    await page.goto('/booking');
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();

    const offenders = await affordanceReport(page);
    expect(
      offenders,
      `這些互動元素只有文字顏色、沒有形狀：\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('工作臺的互動元素都看得出可以按', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#login-account').fill('admin');
    await page.locator('#login-password').fill('beauessence-admin');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#logout')).toBeVisible();

    // 逐個工作區掃過去：問題往往只出現在某一個分頁裡。
    for (const hash of [
      '#overview',
      '#appointments-section',
      '#schedule-section',
      '#case-section',
      '#accounts-section',
      '#audit-section'
    ]) {
      await page.goto(`/${hash}`);
      const offenders = await affordanceReport(page);
      expect(
        offenders,
        `${hash} 有互動元素只剩文字顏色：\n${offenders.join('\n')}`
      ).toEqual([]);
    }
  });

  test('同一個 class 在不同容器裡長得一樣', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#login-account').fill('admin');
    await page.locator('#login-password').fill('beauessence-admin');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#logout')).toBeVisible();
    await page.goto('/#overview');

    // `.summary-action` 同時出現在統計卡與「下一位」面板。先前樣式被寫成
    // `.summary-card .summary-action`，於是後者完全沒有樣式——這條就是釘住它。
    const shapes = await page
      .locator('.summary-action')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const style = window.getComputedStyle(element);
          return [
            style.borderTopWidth,
            style.borderRadius,
            style.backgroundColor,
            style.paddingLeft
          ].join('|');
        })
      );

    expect(shapes.length, '首頁應該有多個 .summary-action').toBeGreaterThan(1);
    expect(
      new Set(shapes).size,
      `同一個 class 卻長出不同樣子（樣式被父層選擇器綁住了）：\n${[...new Set(shapes)].join('\n')}`
    ).toBe(1);
  });
});
