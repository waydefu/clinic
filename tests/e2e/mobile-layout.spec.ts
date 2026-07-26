import { expect, test, type Page } from '@playwright/test';

import { createBooking, login, openDisclosure } from './support/workbench.js';

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

test.describe('工作臺手機版版面', () => {
  test.use({ viewport: PHONE });

  // 處置鍵先前是 flex-wrap: nowrap，一列三個鍵需要 427px。實測在 375px 螢幕上
  // 把整個頁面推出 52px 的水平捲軸，展開「更多處置」時 112px。
  test('有預約資料時，預約清單不得把頁面推出水平捲軸', async ({ page }) => {
    await login(page);
    await createBooking(page);
    await page.goto('/#appointments-section');
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
    await page.goto('/#appointments-section');
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

  test('每個工作區在 375px 都不產生水平捲軸', async ({ page }) => {
    await login(page);
    await createBooking(page);
    for (const panel of [
      '#overview',
      '#appointments-section',
      '#schedule-section',
      '#case-section',
      '#accounts-section',
      '#audit-section'
    ]) {
      await page.goto(`/${panel}`);
      // 合成資料是 2030 年，預設的「當日」篩選看不到它。不切成「全部狀態」的話，
      // 預約清單是空的——而空清單本來就不會溢出，這一輪就白跑了。既有測試漏掉
      // 這個面板的原因之一正是這個。
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
    await page.goto('/#appointments-section');
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
    await page.goto('/booking');
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();

    const viewportHeight = page.viewportSize()?.height ?? 812;
    const headerHeight = await page
      .locator('.patient-header')
      .evaluate((el) => el.getBoundingClientRect().height);
    // 修好前 260px（32%），修好後 201px（25%）。門檻設在兩者之間，這條斷言才
    // 真的擋得住那個版面回來。
    expect(headerHeight).toBeLessThan(viewportHeight * 0.28);

    // 真正重要的是「患者要捲多久才看得到第一個問題」。修好前 651px（螢幕的
    // 80%），修好後 592px（73%）。
    const contentTop = await page
      .locator('.booking-stepper')
      .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(contentTop).toBeLessThan(viewportHeight * 0.72);
  });

  // 「類型與項目」先前因為 overflow-wrap: anywhere 被排成「類型與項／目」，
  // 最後一個字自己一行。中文可以在任何字之間斷行，所以這不是邊界情況。
  test('步驟標籤不得把最後一個字擠到第二行', async ({ page }) => {
    await page.goto('/booking');
    const label = page.locator('.booking-stepper li.is-active strong');
    await expect(label).toBeVisible();

    const box = await label.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(32);
  });

  test('四個步驟在 375px 都不產生水平捲軸', async ({ page }) => {
    await page.goto('/booking');
    expect(await pageOverflow(page), 'step 1').toBeLessThanOrEqual(1);

    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('[data-service]').first().click();
    await expect(page.locator('[data-patient-slot]').first()).toBeVisible();
    expect(await pageOverflow(page), 'step 2').toBeLessThanOrEqual(1);

    await page.locator('[data-patient-slot]').first().click();
    await expect(page.locator('#patient-name')).toBeVisible();
    expect(await pageOverflow(page), 'step 3').toBeLessThanOrEqual(1);
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
