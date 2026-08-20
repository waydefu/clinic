import { expect, test, type Page } from '@playwright/test';

import { CLINIC_UI_SCAN_ROUTES } from './support/clinic-routes.js';
import { createBooking, login, openDisclosure } from './support/workbench.js';

export const PUBLIC_PAGE_SCAN_ROUTES = ['/', '/booking', '/clinic'] as const;
const [WORKBENCH_ROUTE, BOOKING_ROUTE] = PUBLIC_PAGE_SCAN_ROUTES;

// 手機版版面的迴歸守門員。
//
// 2026-07-26 的實機排查抓到兩個嚴重問題，而既有測試**兩個都沒抓到**，原因值得
// 記下來，因為那是同一種盲點：
//
//   1. `responsive.spec.ts` 只量登入後的預設分頁；
//   2. `workbench-lifecycle.spec.ts` 的水平捲軸測試逐一切過工作區，但清單裡
//      **沒有 `#appointments-section`**，而且它在沒有任何預約資料的狀態下執行。
//
// 也就是說「有資料的預約清單 × 手機寬度」這個組合從來沒有被檢查過——而那正是
// 櫃台每天實際看的畫面。這一組專門補上那個組合。

const PHONE = { width: 375, height: 812 };
const NARROW = { width: 320, height: 568 };

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

for (const route of PUBLIC_PAGE_SCAN_ROUTES) {
  test(`manifest public page 在手機寬度不產生水平捲軸：${route}`, async ({
    page
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(route);

    if (route === WORKBENCH_ROUTE) {
      await login(page);
      await expect(page.locator('#workspace-title')).toBeVisible();
    } else if (route === BOOKING_ROUTE) {
      await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
    } else {
      await expect(page.locator('h1')).toBeVisible();
    }

    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });
}

// 官網先前完全不在這支 spec 裡（`PUBLIC_PAGE_SCAN_ROUTES` 只有 `/` 與
// `/booking`），所以它的手機版從來沒有被這組守衛量過。內頁的版面組成與首頁不同
// ——長文、圖片、麵包屑——因此四類取樣各跑一次，另加 320px 的低寬壓力。
for (const route of CLINIC_UI_SCAN_ROUTES) {
  test(`診所官網內頁在窄螢幕不產生水平捲軸：${route}`, async ({ page }) => {
    for (const viewport of [PHONE, NARROW]) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();

      expect(
        await pageOverflow(page),
        `${route} @ ${viewport.width}px 把頁面推出了水平捲軸`
      ).toBeLessThanOrEqual(1);
    }
  });
}

test.describe('工作臺手機版版面', () => {
  test.use({ viewport: PHONE });

  // 處置鍵先前是 flex-wrap: nowrap，一列三個鍵需要 427px。實測在 375px 螢幕上
  // 把整個頁面推出 52px 的水平捲軸，展開「更多處置」時 112px。
  test('有預約資料時，預約清單不得把頁面推出水平捲軸', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await page.goto(`${WORKBENCH_ROUTE}#appointments-section`);
    await page.locator('#appointment-status-filter').selectOption('all');
    await expect(page.locator('[data-appointment-card]').first()).toBeVisible();

    expect(await pageOverflow(page), '收合時').toBeLessThanOrEqual(1);

    // 展開「更多處置」是先前溢出最嚴重的狀態。
    const menu = page.locator('details.action-menu').first();
    await menu.evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    expect(await pageOverflow(page), '展開處置選單時').toBeLessThanOrEqual(1);

    // 選單本身也要留在畫面內，不能有一半在視窗外。
    const box = await page.locator('.action-menu-list').first().boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(box?.x ?? 0).toBeGreaterThanOrEqual(-1);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1);
  });

  // 患者姓名先前被同格的「電話 · 生日 · 身分證」擠到 27px，中文因此一字一行
  // 排成直書。姓名是櫃台掃描清單時第一個要看的欄位。
  test('患者姓名不得被擠成一字一行', async ({ page }) => {
    await login(page);
    await createBooking(page, { name: '歐陽測試' });
    await page.goto(`${WORKBENCH_ROUTE}#appointments-section`);
    await page.locator('#appointment-status-filter').selectOption('all');

    const name = page
      .locator('[data-appointment-card] td', { hasText: '歐陽測試' })
      .locator('strong')
      .first();
    await expect(name).toBeVisible();

    const box = await name.boundingBox();
    // 一行約 26px。四個字若逐字換行會是四行（>100px）。
    expect(box?.height ?? 0).toBeLessThan(40);
    // 而且寬度要放得下四個字，不是被壓成一個字寬。
    expect(box?.width ?? 0).toBeGreaterThan(40);
  });

  test('篩選、卡片處置與批次操作使用緊湊但可點擊的格線', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await page.goto(`${WORKBENCH_ROUTE}#appointments-section`);
    await page.locator('#appointment-status-filter').selectOption('all');
    await expect(page.locator('[data-appointment-card]').first()).toBeVisible();

    const filterBoxes = await page
      .locator('.appointment-filters > label')
      .evaluateAll((labels) =>
        labels.map((label) => {
          const box = label.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width };
        })
      );
    expect(filterBoxes).toHaveLength(3);
    expect(filterBoxes[0].width).toBeGreaterThan(filterBoxes[1].width * 1.8);
    expect(Math.abs(filterBoxes[1].y - filterBoxes[2].y)).toBeLessThan(2);
    expect(Math.abs(filterBoxes[1].width - filterBoxes[2].width)).toBeLessThan(
      2
    );

    const controls = page
      .locator('[data-appointment-card] .appointment-controls')
      .first();
    const actionBoxes = await controls
      .locator(':scope > *')
      .evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect();
          return { y: box.y, width: box.width };
        })
      );
    expect(actionBoxes).toHaveLength(3);
    expect(actionBoxes[0].width).toBeGreaterThan(actionBoxes[1].width * 1.8);
    expect(Math.abs(actionBoxes[1].y - actionBoxes[2].y)).toBeLessThan(2);

    await page.locator('.row-select').first().check();
    await expect(page.locator('#appointment-batch-bar')).toBeVisible();

    // 這裡先前要求三顆批次按鈕**必須在同一列**。那個要求在 390px 是做不到的：
    // 三欄各只剩 103px，而「批次確認取消」六個中文字要 96px＋內距，於是標籤被
    // 折成兩行（實測按鈕高度 42px 的文字範圍）。介面規則書 R-4 不准逐字斷行，
    // R-5 也明說空間不足時**應該**換行——所以該改的是這條斷言，不是版面。
    //
    // 現在要求的是：標籤維持單行、觸控目標仍 ≥44px、同一列的按鈕等寬、頁面不
    // 溢出。欄數由 `auto-fit` 依可用空間決定。
    const batchActions = await page
      .locator('.batch-actions > *')
      .evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(item);
          const rects = [...range.getClientRects()];
          const extent =
            rects.length === 0
              ? 0
              : Math.max(...rects.map((rect) => rect.bottom)) -
                Math.min(...rects.map((rect) => rect.top));
          const fontSize = Number.parseFloat(
            window.getComputedStyle(item).fontSize
          );
          return {
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: box.height,
            wrapped: extent > fontSize * 2
          };
        })
      );

    expect(batchActions.every((item) => !item.wrapped)).toBe(true);
    expect(
      Math.min(...batchActions.map(({ height }) => height))
    ).toBeGreaterThanOrEqual(44);
    // 同一列的按鈕等寬（grid 的欄是均分的）。
    for (const row of new Set(batchActions.map(({ y }) => y))) {
      const widths = batchActions
        .filter((item) => item.y === row)
        .map(({ width }) => width);
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);
    }
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('每週時段的開始與結束欄位並排填滿表單', async ({ page }) => {
    await login(page);
    await page.goto(`${WORKBENCH_ROUTE}#schedule-section`);
    await expect(page.locator('#weekly-form')).toBeVisible();

    const group = page.locator('#weekly-form .inline-fields');
    const groupBox = await group.boundingBox();
    const inputBoxes = await group.locator('input').evaluateAll((inputs) =>
      inputs.map((input) => {
        const box = input.getBoundingClientRect();
        return { y: box.y, width: box.width };
      })
    );
    expect(inputBoxes).toHaveLength(2);
    expect(Math.abs(inputBoxes[0].y - inputBoxes[1].y)).toBeLessThan(2);
    expect(Math.abs(inputBoxes[0].width - inputBoxes[1].width)).toBeLessThan(2);
    expect(inputBoxes[0].width).toBeGreaterThan((groupBox?.width ?? 0) * 0.4);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  test('通知面板完整留在視窗內，離開面板即收合', async ({ page }) => {
    await login(page);
    const bell = page.locator('#nav-bell');
    const popover = page.locator('#notification-popover');

    await bell.click();
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#notification-heading')).toBeVisible();
    await expect(page.locator('#notification-close')).toBeFocused();

    const box = await popover.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewport?.width ?? 0
    );
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewport?.height ?? 0
    );

    await page.locator('.workspace-nav a').first().focus();
    await expect(popover).toBeHidden();
    await expect(bell).toHaveAttribute('aria-expanded', 'false');
  });

  test('每個工作區在 375px 都不產生水平捲軸', async ({ page }) => {
    await login(page);
    await createBooking(page);
    for (const panel of [
      '#overview',
      '#appointments-section',
      '#schedule-section',
      '#accounts-section',
      '#audit-section'
    ]) {
      await page.goto(`${WORKBENCH_ROUTE}${panel}`);
      // 建立的預約多半不落在今天（診所週日至週二休診），預設的「當日」篩選
      // 看不到它。不切成「全部狀態」的話預約清單是空的——而空清單本來就不會
      // 溢出，這一輪就白跑了。既有測試漏掉這個面板的原因之一正是這個。
      if (panel === '#appointments-section') {
        await page.locator('#appointment-status-filter').selectOption('all');
        await expect(
          page.locator('[data-appointment-card]').first()
        ).toBeVisible();
      }
      expect(
        await pageOverflow(page),
        `${panel} 不應該有水平捲軸`
      ).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('工作臺在最窄的常見螢幕', () => {
  test.use({ viewport: NARROW });

  test('320px 下有資料的預約清單仍不溢出', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await page.goto(`${WORKBENCH_ROUTE}#appointments-section`);
    await page.locator('#appointment-status-filter').selectOption('all');
    await expect(page.locator('[data-appointment-card]').first()).toBeVisible();

    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe('患者預約頁手機版', () => {
  test.use({ viewport: PHONE });

  // 頁首先前把品牌、健保標章、主題選單、環境徽章各排一列，佔掉 260px；
  // 患者要捲到螢幕 80% 的位置才看得到第一個問題。
  test('頁首不得把第一個問題推到首屏之外', async ({ page }) => {
    await page.goto(BOOKING_ROUTE);
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();

    const viewportHeight = page.viewportSize()?.height ?? 812;
    const headerHeight = await page
      .locator('.patient-header')
      .evaluate((el) => el.getBoundingClientRect().height);
    // 上限 28% → 30%（2026-07-27 併站）→ **25%（2026-07-27 P13）**。
    //
    // 併站時導覽獨佔一列、環境徽章再一列，實測 235px（29%），門檻因此暫時放到
    // 30%，並在註解裡記下「正確做法是改成漢堡選單」。P13 就是把那件事做掉：
    // 導覽收進帶文字標籤的漢堡按鈕（不是藏起來——展開後內容一個都沒少），
    // 徽章與漢堡併成同一列，於是那一整列 44px 回到了預約流程。
    //
    // 門檻跟著實作在**同一個變更**收緊，不是放著等下次順便。
    expect(headerHeight).toBeLessThan(viewportHeight * 0.25);

    // 真正重要的是「患者要捲多久才看得到第一個問題」。修好前 651px（螢幕的
    // 80%），修好後 592px（73%）。
    const contentTop = await page
      .locator('.booking-stepper')
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(contentTop).toBeLessThan(viewportHeight * 0.72);
  });

  // 英文副標先前在 48rem 以下被 display:none 收掉，患者頁的品牌在手機上因此只剩
  // 中文——而患者頁正是對外的那一面。它疊在標誌的 40px 高度之內，本來就不需要用
  // 「藏起來」去換版面空間。
  test('品牌的英文副標在手機仍然看得見', async ({ page }) => {
    await page.goto(BOOKING_ROUTE);
    const subtitle = page.locator('.patient-header .brand small');
    await expect(subtitle).toBeVisible();
    // 只釘品牌名，不釘後面那個字。副標在 2026-07-27 併站時由
    // 「Beau Essence Appointment」改成「Beau Essence Clinic」——那是文案決定，
    // 這條測試要擋的是**副標整個消失**，不是文案不准改。
    await expect(subtitle).toContainText('Beau Essence');

    const box = await subtitle.boundingBox();
    // 一行約 14px。0 高度代表又被收掉了，過高代表被擠成逐字換行。
    expect(box?.height ?? 0).toBeGreaterThan(8);
    expect(box?.height ?? 0).toBeLessThan(48);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  // P13（2026-07-27）：導覽在手機收進漢堡選單。
  //
  // 這條的前身要求「導覽與環境徽章併成同一列」，而併站後導覽三項就佔滿整列，
  // 那個目標在數學上已經不可能。現在改成守住漢堡真正該成立的四件事：
  // 收起時導覽不佔版面、漢堡與徽章併成一列且徽章靠右、**展開後導覽項一個不少**
  // （R-13：主要功能不得因螢幕窄而消失），以及展開時頁面仍不橫捲。
  test('手機把導覽收進漢堡，展開後項目一個不少', async ({ page }) => {
    await page.goto(BOOKING_ROUTE);
    const menuButton = page.locator('.patient-menu-button');
    const nav = page.locator('#patient-nav');
    await expect(menuButton).toBeVisible();
    await expect(nav).toBeHidden();

    const collapsed = await page
      .locator('.patient-header-inner')
      .evaluate((inner) => {
        const box = (selector: string) => {
          const el = inner.querySelector(selector) as HTMLElement;
          const rect = el.getBoundingClientRect();
          return { y: rect.y, height: rect.height, right: rect.right };
        };
        const innerRect = inner.getBoundingClientRect();
        return {
          menu: box('.patient-menu-button'),
          badge: box('.environment-badge'),
          contentRight:
            innerRect.right - parseFloat(getComputedStyle(inner).paddingRight),
          headerHeight: (
            inner.closest('.patient-header') as HTMLElement
          ).getBoundingClientRect().height
        };
      });

    // 徽章仍然靠右——不能變成孤零零地貼在左邊，那正是 2026-07-26 修過的
    // 「留白過多」的樣子。**不要求它與漢堡同列**：375px 下實測是品牌＋標章、
    // 主題選單＋漢堡、徽章三列，那是 flex 依內容寬度算出來的結果（R-5 允許
    // 空間不足時換列），硬要併列只能靠縮字或藏東西。
    expect(
      Math.abs(collapsed.badge.right - collapsed.contentRight)
    ).toBeLessThan(2);
    // 收起導覽那一列（44px）之後，頁首從 235px 掉到 167px。門檻留餘裕，
    // 再長回一列就會被擋下來。
    expect(collapsed.headerHeight).toBeLessThan(200);

    // 漢堡本身要是達標的觸控目標（R-3，患者端 44×44）。
    const menuBox = await menuButton.boundingBox();
    expect(menuBox!.height).toBeGreaterThanOrEqual(44);
    expect(menuBox!.width).toBeGreaterThanOrEqual(44);

    // 展開後導覽項一個不少，且狀態要讓輔助技術讀得到。
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toBeVisible();
    await expect(nav.locator('a')).toHaveCount(4);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);

    // Escape 收起來，焦點回到漢堡（R-12）。
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  // 「類型與項目」先前因為 overflow-wrap: anywhere 被排成「類型與項／目」，
  // 最後一個字自己一行。中文可以在任何字之間斷行，所以這不是邊界情況。
  test('步驟標籤不得把最後一個字擠到第二行', async ({ page }) => {
    await page.goto(BOOKING_ROUTE);
    const label = page.locator('.booking-stepper li.is-active strong');
    await expect(label).toBeVisible();

    const box = await label.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(32);
  });

  test('四個步驟在 375px 都不產生水平捲軸', async ({ page }) => {
    await page.goto(BOOKING_ROUTE);
    expect(await pageOverflow(page), 'step 1').toBeLessThanOrEqual(1);

    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('[data-service]').first().click();
    await expect(page.locator('[data-patient-slot]').first()).toBeVisible();
    expect(await pageOverflow(page), 'step 2').toBeLessThanOrEqual(1);

    await page.locator('[data-patient-slot]').first().click();
    await expect(page.locator('#patient-name')).toBeVisible();
    expect(await pageOverflow(page), 'step 3').toBeLessThanOrEqual(1);
  });

  test('必填星號緊跟欄名，資料欄位維持同寬', async ({ page }) => {
    await page.goto(BOOKING_ROUTE);
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('[data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await expect(page.locator('#patient-name')).toBeVisible();

    // 只量**目前看得到的必填**身分欄位。表單自 2026-07-27 起還有選填的備註
    // （textarea）、標籤分組，以及一個平時收起來的護照欄——用
    // `:not(.consent-preview)` 會把它們一起撈進來，於是這條測試會因為「新增了一個
    // 選填欄位」而紅，卻與它要守的事（星號位置與各欄同寬）完全無關。
    // 生日已改成 <fieldset> 三格，不在這一組裡；它有自己的欄寬規則。
    const labels = page.locator(
      '.patient-form-grid > label:has(.required-mark):not([hidden])'
    );
    await expect(labels).toHaveCount(3);
    const labelRows = await labels.locator('.field-label').evaluateAll((rows) =>
      rows.map((row) => {
        const mark = row.querySelector('.required-mark');
        const box = row.getBoundingClientRect();
        const markBox = mark?.getBoundingClientRect();
        return {
          display: getComputedStyle(row).display,
          height: box.height,
          markY: markBox?.y ?? -1,
          rowY: box.y
        };
      })
    );
    for (const row of labelRows) {
      expect(row.display).toBe('flex');
      expect(row.height).toBeLessThan(32);
      expect(Math.abs(row.markY - row.rowY)).toBeLessThan(4);
    }

    const inputAndLabelWidths = await labels.evaluateAll((items) =>
      items.map((label) => {
        const input = label.querySelector('input');
        return {
          input: input?.getBoundingClientRect().width ?? 0,
          label: label.getBoundingClientRect().width
        };
      })
    );
    const inputWidths = inputAndLabelWidths.map((item) => item.input);
    expect(Math.max(...inputWidths) - Math.min(...inputWidths)).toBeLessThan(2);
    for (const widths of inputAndLabelWidths)
      expect(widths.input).toBeGreaterThan(widths.label - 2);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe('患者預約頁在最窄的常見螢幕', () => {
  test.use({ viewport: NARROW });

  // 320px 是英文副標唯一真的可能放不下的寬度。它必須靠換行解決，而不是靠
  // 消失，而且換行不得把頁面推出水平捲軸。
  test('320px 下英文副標換行而不是消失', async ({ page }) => {
    await page.goto(BOOKING_ROUTE);
    const subtitle = page.locator('.patient-header .brand small');
    await expect(subtitle).toBeVisible();

    const box = await subtitle.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(8);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe('工作臺導覽的捲動提示', () => {
  test.use({ viewport: PHONE });

  // 七個工作區在 375px 只看得到三個，其餘四個在畫面外。沒有提示的話，使用者
  // 合理地會以為工作臺只有三個區塊。
  test('放不下時要有捲動提示，而不是把最後一項硬切掉', async ({ page }) => {
    await login(page);
    await openDisclosure(page, '#week-calendar-disclosure');

    const nav = page.locator('.workspace-nav');
    const state = await nav.evaluate((el) => ({
      overflows: el.scrollWidth > el.clientWidth + 1,
      mask: getComputedStyle(el).maskImage,
      snap: getComputedStyle(el).scrollSnapType
    }));

    expect(state.overflows, '這個測試只在導覽真的放不下時有意義').toBe(true);
    expect(state.mask, '需要淡出遮罩表示「後面還有」').not.toBe('none');
    expect(state.snap, '需要 scroll-snap 讓項目不會停在半個字').toContain('x');
  });
});

// 2026-08-06 手機版審查補上的三條。前兩條釘住的是實際量到的缺陷，第三條釘住
// 修它時差點造成的回歸。
test.describe('診所官網品牌標誌在手機不佔版面', () => {
  // 為什麼用比例而不是絕對像素：標誌本來就該隨視窗收放，寫死像素等於把下一次
  // 合理的尺寸調整也一起擋掉。真正不能接受的是「它吃掉半個畫面」。
  //
  // 修之前的實測值：頁尾標誌在**每一個**寬度都是 200px（三個 media query 只改
  // grid-column，沒有一個覆寫寬度），於是 320px 上佔 62.5%；頁首標誌在
  // 320–412 全段固定 140px，320px 上佔 43.8%。
  for (const width of [320, 360, 390, 412]) {
    test(`${width}px：頁首與頁尾標誌各自不超過三分之一版面寬`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/clinic');

      const ratios = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const ratio = (selector: string) => {
          const node = document.querySelector(selector);
          if (node === null) return null;
          return node.getBoundingClientRect().width / vw;
        };
        return {
          header: ratio('.clinic-brand img'),
          footer: ratio('.clinic-footer__brand img')
        };
      });

      expect(ratios.header, '找不到頁首標誌').not.toBeNull();
      expect(ratios.footer, '找不到頁尾標誌').not.toBeNull();
      expect(ratios.header ?? 1).toBeLessThanOrEqual(1 / 3);
      expect(ratios.footer ?? 1).toBeLessThanOrEqual(1 / 3);
    });
  }
});

test.describe('診所官網首屏帶得走實用資訊', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // 修之前：門診時間與地址只存在於 y≈6240px 的「門診時間與交通」區塊與頁尾，
  // 手機上要捲過約 11 個畫面才看得到。首屏只有標語、一句說明與兩顆按鈕。
  test('門診時間、電話與地址不必捲動就看得到', async ({ page }) => {
    await page.goto('/clinic');

    const facts = page.locator('.clinic-hero-facts');
    await expect(facts).toBeVisible();

    const withinFold = await facts.evaluate(
      (node) =>
        node.getBoundingClientRect().top + window.scrollY <
        document.documentElement.clientHeight
    );
    expect(withinFold, '首屏實用資訊被推到第一個畫面之外').toBe(true);

    // 值必須與下方詳細區塊同源，否則兩處會各自漂移。
    await expect(facts).toContainText('週三至週五');
    await expect(facts).toContainText('02-2577-1314');
    await expect(facts).toContainText('光復北路');
  });

  // 這一區的電話與地址是獨立連結，不在句子裡，因此不適用 SC 2.5.8 的 Inline
  // 例外——加它們的當下就漏掉了這件事，affordance 那支測試當場轉紅。
  test('首屏資訊裡的連結仍達 44px 可點高度', async ({ page }) => {
    await page.goto('/clinic');

    const heights = await page
      .locator('.clinic-hero-fact a')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height)
      );

    expect(
      heights.length,
      '首屏資訊應該至少有電話與地址兩個連結'
    ).toBeGreaterThanOrEqual(2);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
  });
});
