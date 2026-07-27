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

  // 政策頁是自成一頁、不載入 styles.css 的第三個進入點。先前它底部只有一句
  // 底線文字「回到線上預約」——那是這一整組測試在防的東西，只是它當時不在
  // 掃描範圍內。新增對外頁面時，這個 describe 要一起加。
  test('隱私權政策頁的互動元素都看得出可以按', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('#policy-agree')).toBeAttached();
    const offenders = await affordanceReport(page);
    expect(
      offenders,
      `政策頁有互動元素只剩文字顏色：\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  // 可按的東西，它的字不能被逐字斷行。
  //
  // 2026-07-27 實機回報：頁尾的「預約須知」「隱私權政策」被擠成一個字一行的
  // 直排。成因是 flex 項目預設可以縮到比內容還窄，而中文沒有空格，一旦容器
  // 比一個詞還窄就只能逐字斷。這條掃全站可見的可點元素，量的是**實際排出來的
  // 行數**，所以不論成因是哪一種都抓得到。
  test('可點擊的短標籤不會被逐字斷成好幾行', async ({ page }) => {
    for (const path of ['/booking', '/privacy']) {
      await page.goto(path);
      for (const width of [1280, 900, 768, 480, 390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        const broken = await page.evaluate(() => {
          const offenders: string[] = [];
          for (const element of document.querySelectorAll<HTMLElement>(
            'a[href], button'
          )) {
            const box = element.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            const text = element.textContent?.trim() ?? '';
            // 只看短標籤：長句本來就該換行。
            if (text.length === 0 || text.length > 8 || /\s/.test(text))
              continue;
            // 行文中的連結要跟著句子換行——那是正常的。這裡管的是**獨立的控制
            // 項**（導覽、頁尾、按鈕）：它們自己就是一個東西，被拆開就只是壞掉。
            // 判準是父層有沒有其他實際文字圍著它。
            const parent = element.parentElement;
            const isInlineInProse =
              parent !== null &&
              [...parent.childNodes].some(
                (node) =>
                  node !== element &&
                  node.nodeType === Node.TEXT_NODE &&
                  (node.textContent ?? '').trim().length > 0
              );
            if (isInlineInProse) continue;
            const range = document.createRange();
            range.selectNodeContents(element);
            // 一個短標籤排出兩行以上，就是被硬斷了。
            if (range.getClientRects().length > 1)
              offenders.push(
                `「${text}」→ ${range.getClientRects().length} 行`
              );
          }
          return offenders;
        });
        expect(
          broken,
          `${path} @ ${width}px 有標籤被逐字斷行：\n${broken.join('\n')}`
        ).toEqual([]);
      }
    }
  });

  // R-5（介面規則書）：有橫向空間就不要上下堆疊。
  //
  // 白白的縱向堆疊會把首屏推走——這個專案量過，頁首多一列就讓患者看到第一個
  // 問題的位置往下掉 50px。桌機寬度下，一組 2–3 顆的動作必須在同一列。
  test('同一組動作在放得下時必須並排', async ({ page }) => {
    const groups = [
      { path: '/privacy', selector: '.policy-agree-actions' },
      { path: '/privacy', selector: '.policy-header' }
    ];
    for (const { path, selector } of groups) {
      await page.goto(path);
      await page.setViewportSize({ width: 1280, height: 800 });
      const rows = await page.locator(selector).evaluate((container) => {
        const boxes = [...container.children]
          .map((child) => child.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.height > 0)
          .sort((left, right) => left.top - right.top);
        if (boxes.length === 0) return 0;
        // 不能用「上緣相同」判斷同一列：`align-items: center` 下高度不同的項目
        // 上緣本來就不一樣。用**垂直範圍有沒有重疊**才是同一列的正確定義。
        let count = 1;
        let bottom = boxes[0].bottom;
        for (const box of boxes.slice(1)) {
          if (box.top >= bottom) {
            count += 1;
            bottom = box.bottom;
          } else {
            bottom = Math.max(bottom, box.bottom);
          }
        }
        return count;
      });
      expect(
        rows,
        `${path} 的 ${selector} 在 1280px 下排成 ${rows} 列，但空間放得下一列`
      ).toBe(1);
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
