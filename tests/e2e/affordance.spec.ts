import { expect, test, type Page } from '@playwright/test';

import { CLINIC_UI_SCAN_ROUTES } from './support/clinic-routes';
import { createBooking, login, showAllAppointments } from './support/workbench';

export const PUBLIC_PAGE_SCAN_ROUTES = [
  '/',
  '/booking',
  '/privacy',
  '/clinic'
] as const;
const [WORKBENCH_ROUTE, BOOKING_ROUTE, PRIVACY_ROUTE] = PUBLIC_PAGE_SCAN_ROUTES;

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

/** 診所官網的四類取樣。單一來源在 `support/clinic-routes`。 */
const CLINIC_ROUTES = CLINIC_UI_SCAN_ROUTES;

const WORKSPACES = [
  '#overview',
  '#appointments-section',
  '#schedule-section',
  '#case-section',
  '#accounts-section',
  '#communications-section',
  '#audit-section'
];

/**
 * 找出被逐字斷行的短標籤（介面規則書 R-4）。
 *
 * **不能用 `getClientRects().length` 判斷行數**：一個含圖示 `<span>` 的按鈕，
 * 圖示與文字各自是一個 inline box，同一行也會回傳好幾個 rect。先前這裡就是這樣
 * 寫的，掃工作臺時對「→建立預約」這種按鈕全部誤判（實測 3 個 rect、卻只有一行）。
 *
 * 正確的判準是**垂直範圍**：一行的高度約 1.3–1.5 倍字級，超過 2 倍才是真的換了行。
 */
const wrapScanSource = () => {
  // 只取**看得見**的文字節點。
  //
  // 視覺隱藏的文字（`position:absolute; width:1px; overflow:hidden` 那一組）雖然
  // 沒有被畫出來，`getClientRects()` 仍會回傳它裡面文字的 rect——而且是正常大小
  // 的 rect，不是 1px，所以濾 rect 尺寸沒有用。診所官網的漢堡鈕就是這樣：可見的
  // 是圖示，「選單」兩個字是給報讀器的，卻讓整顆按鈕被誤判成換了行。
  const visibleTextNodes = (element: HTMLElement) => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if ((node.textContent ?? '').trim() === '') continue;
      const host = node.parentElement;
      if (host === null) continue;
      if (host.clientWidth <= 1 || host.clientHeight <= 1) continue;
      nodes.push(node);
    }
    return nodes;
  };

  const offenders: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(
    'a[href], button'
  )) {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const visible = visibleTextNodes(element);
    // 用空白接起來，不是直接串接：分開的文字節點代表分開的內容（標題＋註解，
    // 例如「醫美」與「依療程進度」）。串成一坨會讓它看起來像一個七字的短標籤，
    // 於是「本來就該分行的兩段話」被誤判成逐字斷行。
    const text = visible
      .map((node) => node.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    // 只看短標籤：長句本來就該換行。
    if (text.length === 0 || text.length > 8 || /\s/.test(text)) continue;
    // 行文中的連結要跟著句子換行——那是正常的。這裡管的是**獨立的控制項**
    // （導覽、頁尾、按鈕）：它們自己就是一個東西，被拆開就只是壞掉。
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

    const rects = visible.flatMap((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()];
    });
    if (rects.length === 0) continue;
    const extent =
      Math.max(...rects.map((rect) => rect.bottom)) -
      Math.min(...rects.map((rect) => rect.top));
    const fontSize = Number.parseFloat(
      window.getComputedStyle(element).fontSize
    );
    if (extent > fontSize * 2)
      offenders.push(
        `「${text}」→ 垂直範圍 ${Math.round(extent)}px（字級 ${fontSize}px）`
      );
  }
  return offenders;
};

// 「延展連結」（stretched link）：連結用一個 `::after` 覆蓋整張卡片，於是命中區
// 是卡片而不是那幾個字。這是卡片式版面的標準做法，但它讓**元素自己的方框不能
// 代表真正的目標**——量錯了會同時誤判 R-2（形狀在卡片上）與 R-3（尺寸是卡片
// 的）。每個掃描各自帶一份 `effectiveTarget`：`page.evaluate` 的函式是序列化後
// 送進瀏覽器執行的，抓不到這個檔案裡的其他變數。
async function affordanceReport(page: Page) {
  return page.evaluate((skipSelectors) => {
    const effectiveTarget = (element: HTMLElement): HTMLElement => {
      const after = window.getComputedStyle(element, '::after');
      const stretched =
        after.position === 'absolute' &&
        after.top === '0px' &&
        after.right === '0px' &&
        after.bottom === '0px' &&
        after.left === '0px';
      const host = element.offsetParent;
      return stretched && host instanceof HTMLElement ? host : element;
    };

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

      // 延展連結的形狀在它覆蓋的那張卡片上，不在文字本身。
      const style = window.getComputedStyle(effectiveTarget(element));

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

/**
 * 找出「明明放得下卻分成多列」的動作群組（介面規則書 R-5）。
 *
 * 只看真正的一列控制項：flex／grid 容器，且**每個子元素本身就是**可點元素。
 * 內容區塊（標題、說明、選項卡）本來就該直排，不在此列。
 *
 * 需要多寬的量法是把容器複製成 `width: max-content` 的單列再量——不能用現在
 * 排出來的寬度，因為 `flex-direction: column` 下子元素會被拉滿寬，看起來永遠
 * 「放不下」，正好把要抓的那種情況放過去。
 */
const stackScanSource = () => {
  const rowsOf = (boxes: DOMRect[]) => {
    const sorted = [...boxes].sort((left, right) => left.top - right.top);
    if (sorted.length === 0) return 0;
    let count = 1;
    let bottom = sorted[0].bottom;
    for (const box of sorted.slice(1)) {
      if (box.top >= bottom) {
        count += 1;
        bottom = box.bottom;
      } else {
        bottom = Math.max(bottom, box.bottom);
      }
    }
    return count;
  };

  const offenders: string[] = [];
  for (const container of document.querySelectorAll<HTMLElement>('*')) {
    const style = window.getComputedStyle(container);
    // **只看 flex row。**
    //
    // grid 的欄數是設計者明寫的決定（`grid-template-columns`），「幾欄」本身就是
    // 答案、不是意外；而且下面 `width: max-content` 的量法對 grid 無效——
    // flex-direction／flex-wrap 覆寫不影響 grid，複製品仍維持同樣欄數，量出來的
    // 數字偏小而誤判。實測診所官網的 hero 主題列與頁尾社群列都是 grid，兩者都被
    // 誤報過（4 顆 199px 的晶片本來就塞不進 429px）。grid 交由 R-5 的人工判定。
    if (!['flex', 'inline-flex'].includes(style.display)) continue;
    if (style.flexDirection !== 'row') continue;
    const children = [...container.children].filter((child) => {
      const box = child.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (children.length < 2 || children.length > 5) continue;
    if (!children.every((child) => child.matches('button, a[href]'))) continue;

    const boxes = children.map((child) => child.getBoundingClientRect());
    if (rowsOf(boxes) < 2) continue;

    const available =
      container.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const probe = container.cloneNode(true) as HTMLElement;
    probe.style.cssText += `;position:absolute;visibility:hidden;left:-9999px;top:0;width:max-content;max-width:none;flex-direction:row;flex-wrap:nowrap;`;
    container.parentElement?.append(probe);
    const needed = probe.scrollWidth;
    probe.remove();

    if (needed <= available) {
      const name = `${container.tagName.toLowerCase()}${
        container.id ? `#${container.id}` : ''
      }${
        typeof container.className === 'string' &&
        container.className.trim() !== ''
          ? `.${container.className.trim().split(/\s+/).join('.')}`
          : ''
      }`;
      offenders.push(
        `${name} — ${rowsOf(boxes)} 列，單列只需 ${Math.round(needed)}px，可用 ${Math.round(available)}px`
      );
    }
  }
  return offenders;
};

for (const route of PUBLIC_PAGE_SCAN_ROUTES) {
  test(`manifest public page 的互動元素都看得出可以按：${route}`, async ({
    page
  }) => {
    await page.goto(route);

    if (route === WORKBENCH_ROUTE) {
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.locator('#login-account').fill('admin');
      await page.locator('#login-password').fill('beauessence-admin');
      await page.locator('#login-view button[type="submit"]').click();
      await expect(page.locator('#logout')).toBeVisible();
    } else if (route === BOOKING_ROUTE) {
      await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
    } else if (route === PRIVACY_ROUTE) {
      await expect(page.locator('#policy-agree')).toBeAttached();
    } else {
      await expect(
        page.getByRole('heading', { level: 1, name: /從順暢呼吸開始/ })
      ).toBeVisible();
    }

    const offenders = await affordanceReport(page);
    expect(
      offenders,
      `${route} 有互動元素只剩文字顏色：\n${offenders.join('\n')}`
    ).toEqual([]);
  });
}

test.describe('可點擊性（affordance）', () => {
  test('工作臺每個工作區的互動元素都看得出可以按', async ({ page }) => {
    await page.goto(WORKBENCH_ROUTE);
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
      await page.goto(`${WORKBENCH_ROUTE}${hash}`);
      const offenders = await affordanceReport(page);
      expect(
        offenders,
        `${hash} 有互動元素只剩文字顏色：\n${offenders.join('\n')}`
      ).toEqual([]);
    }
  });

  // 診所官網（2026-07-27 併入）。它進了無障礙、重排、預算與 check:ui，唯獨漏了
  // 這一組——規則書 R-7 的第 1 項就是「加進 affordance 掃描」。manifest loop
  // 已掃首頁，這裡再補共享 shell 的代表性內頁。
  test('診所官網內頁的互動元素都看得出可以按', async ({ page }) => {
    for (const path of CLINIC_ROUTES.slice(1)) {
      await page.goto(path);
      const offenders = await affordanceReport(page);
      expect(
        offenders,
        `${path} 有互動元素只剩文字顏色：\n${offenders.join('\n')}`
      ).toEqual([]);
    }
  });

  // 可按的東西，它的字不能被逐字斷行。
  //
  // 2026-07-27 實機回報：頁尾的「預約須知」「隱私權政策」被擠成一個字一行的
  // 直排。成因是 flex 項目預設可以縮到比內容還窄，而中文沒有空格，一旦容器
  // 比一個詞還窄就只能逐字斷。這條掃全站可見的可點元素，量的是**實際排出來的
  // 行數**，所以不論成因是哪一種都抓得到。
  test('可點擊的短標籤不會被逐字斷成好幾行', async ({ page }) => {
    for (const width of [1280, 1024, 900, 768, 480, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [BOOKING_ROUTE, PRIVACY_ROUTE, ...CLINIC_ROUTES]) {
        await page.goto(path);
        const broken = await page.evaluate(wrapScanSource);
        expect(
          broken,
          `${path} @ ${width}px 有標籤被逐字斷行：\n${broken.join('\n')}`
        ).toEqual([]);
      }
    }
  });

  // 工作臺是每天用最久的畫面，而且它的控制項最多、標籤最長。要看到批次列與
  // 逐筆處置，必須先登入並讓清單真的有資料。
  test('工作臺的短標籤也不會被逐字斷行', async ({ page }) => {
    await login(page, 'admin');
    await createBooking(page, { name: '斷行掃描' });
    await showAllAppointments(page);
    // 批次列只在有選取時出現。
    await page.locator('[data-appointment-select]').first().check();

    for (const width of [1280, 1024, 900, 768, 480, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const hash of WORKSPACES) {
        await page.goto(`${WORKBENCH_ROUTE}${hash}`);
        // 收合區塊裡的控制項一樣要檢查。
        await page.evaluate(() => {
          for (const details of document.querySelectorAll('details'))
            details.open = true;
        });
        const broken = await page.evaluate(wrapScanSource);
        expect(
          broken,
          `${hash} @ ${width}px 有標籤被逐字斷行：\n${broken.join('\n')}`
        ).toEqual([]);
      }
    }
  });

  // R-5：動作排列依優先級、風險與可用空間決定。
  //
  // 規則**不是**「一律並排」——空間不足、標籤較長、主要 CTA 需要全寬、要把破壞性
  // 動作分開，都是正當的堆疊理由。所以測試不能斷言「只能有一列」，那會逼出錯誤
  // 的版面。這裡量的是**無理由的堆疊**：把同一組動作攤成單列去量它需要多寬，
  // 若明明塞得進現有寬度卻仍然分成多列，那就是沒有理由的。
  test('寬畫面不得出現無理由的堆疊', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(PRIVACY_ROUTE);
    expect(await page.evaluate(stackScanSource)).toEqual([]);

    await page.goto(BOOKING_ROUTE);
    expect(await page.evaluate(stackScanSource)).toEqual([]);

    for (const path of CLINIC_ROUTES) {
      await page.goto(path);
      const offenders = await page.evaluate(stackScanSource);
      expect(
        offenders,
        `${path} 有動作群組在 1280px 下無理由堆疊：\n${offenders.join('\n')}`
      ).toEqual([]);
    }

    await login(page, 'admin', { fresh: false });
    await createBooking(page, { name: '堆疊掃描' });
    await showAllAppointments(page);
    await page.locator('[data-appointment-select]').first().check();
    for (const hash of WORKSPACES) {
      await page.goto(`${WORKBENCH_ROUTE}${hash}`);
      await page.evaluate(() => {
        for (const details of document.querySelectorAll('details'))
          details.open = true;
      });
      const offenders = await page.evaluate(stackScanSource);
      expect(
        offenders,
        `${hash} 有動作群組在 1280px 下無理由堆疊：\n${offenders.join('\n')}`
      ).toEqual([]);
    }
  });

  // R-3：患者端與行動版的可點目標至少 44×44 CSS px。
  //
  // axe 只查 WCAG 2.2 SC 2.5.8 的 24×24（AA 下限）。44px 是本專案自己訂的較嚴
  // 門檻，理由是現場多半單手持手機，所以要另外掃。量的是**可點擊的方框**（含
  // 內距），不是圖示大小——規則書明說 icon 可以小，但它的可點區不行。
  //
  // 依 SC 2.5.8 的 Inline 例外，句子裡的連結不在此限：它們的尺寸受行高約束，
  // 硬撐大反而會破壞內文排版。
  test('患者端的可點目標在手機寬度達到 44px', async ({ page }) => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of [BOOKING_ROUTE, PRIVACY_ROUTE, ...CLINIC_ROUTES]) {
        await page.goto(path);
        const small = await page.evaluate(() => {
          const effectiveTarget = (element: HTMLElement): HTMLElement => {
            const after = window.getComputedStyle(element, '::after');
            const stretched =
              after.position === 'absolute' &&
              after.top === '0px' &&
              after.right === '0px' &&
              after.bottom === '0px' &&
              after.left === '0px';
            const host = element.offsetParent;
            return stretched && host instanceof HTMLElement ? host : element;
          };

          // SC 2.5.8 的 Equivalent 例外：同一張卡片裡若已有另一個指向同一位址、
          // 且尺寸達標的控制項，這一個就不必自己達標。診所官網的卡片正是如此
          // ——標題是延展連結（整張卡片），「了解更多」是同一個目的地的重複入口。
          const hasEquivalent = (element: HTMLElement) => {
            const href = element.getAttribute('href');
            if (href === null) return false;
            const scope = element.closest('article, li, .clinic-card-grid > *');
            if (scope === null) return false;
            return [...scope.querySelectorAll<HTMLElement>('a[href]')].some(
              (other) => {
                if (other === element) return false;
                if (other.getAttribute('href') !== href) return false;
                const box = effectiveTarget(other).getBoundingClientRect();
                return box.width >= 44 && box.height >= 44;
              }
            );
          };

          const offenders: string[] = [];
          for (const element of document.querySelectorAll<HTMLElement>(
            'button, a[href], [role="button"], select'
          )) {
            const box = effectiveTarget(element).getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            if (element.classList.contains('skip-link')) continue;
            if (hasEquivalent(element)) continue;
            // Inline 例外：句子裡的連結。
            const parent = element.parentElement;
            if (
              parent !== null &&
              [...parent.childNodes].some(
                (node) =>
                  node !== element &&
                  node.nodeType === Node.TEXT_NODE &&
                  (node.textContent ?? '').trim().length > 0
              )
            )
              continue;
            if (box.width < 44 || box.height < 44)
              offenders.push(
                `${element.tagName.toLowerCase()}${
                  element.id ? `#${element.id}` : ''
                } 「${element.textContent?.trim().slice(0, 12)}」→ ${Math.round(
                  box.width
                )}×${Math.round(box.height)}`
              );
          }
          return offenders;
        });
        expect(
          small,
          `${path} @ ${width}px 有可點目標小於 44×44：\n${small.join('\n')}`
        ).toEqual([]);
      }
    }
  });

  test('同一個 class 在不同容器裡長得一樣', async ({ page }) => {
    await page.goto(WORKBENCH_ROUTE);
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#login-account').fill('admin');
    await page.locator('#login-password').fill('beauessence-admin');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#logout')).toBeVisible();
    await page.goto(`${WORKBENCH_ROUTE}#overview`);

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
