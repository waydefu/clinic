import { expect, test } from '@playwright/test';

import { CLINIC_UI_SCAN_ROUTES } from './support/clinic-routes';

const CLINIC_ROUTES = [
  ['/clinic', '今晚，不必再和呼吸拔河'],
  ['/clinic/doctors', '醫師團隊'],
  ['/clinic/doctors/yan-cheng-an', '顏正安 院長'],
  ['/clinic/doctors/yang-sheng-feng', '楊昇峯 醫師'],
  ['/clinic/nasal/snoring-five-in-one', '止鼾五合一'],
  ['/clinic/nasal/inferior-turbinate-surgery', '下鼻甲手術'],
  ['/clinic/nasal/septoplasty', '鼻中隔手術'],
  ['/clinic/nasal/snore-relief-mouthguard', '止鼾好眠牙套']
] as const;

test.describe('診所網站整合', () => {
  for (const [path, heading] of CLINIC_ROUTES) {
    test(`${path} 可閱讀並能前往既有預約流程`, async ({ page }) => {
      await page.goto(path);

      // 首頁標題的視覺逐字動畫會保留一份報讀器專用完整字串；比可及名稱，
      // 不用重複的 textContent 當成語意。
      await expect(
        page.getByRole('heading', { level: 1 })
      ).toHaveAccessibleName(heading);
      await expect(
        page
          .getByRole('link', {
            name: /線上預約|預約諮詢|預約門診|預約專業評估/
          })
          .first()
      ).toHaveAttribute('href', '/booking');
      await expect(page).toHaveTitle(/^【測試用】/);
    });
  }

  test('首頁只呈現醫師與鼻功能醫學的指定內容範圍', async ({ page }) => {
    await page.goto('/clinic');

    await expect(page.locator('.clinic-service-card')).toHaveCount(4);
    await expect(page.locator('.clinic-doctor-card')).toHaveCount(2);
    await expect(
      page.getByRole('navigation', { name: '診所網站導覽' })
    ).not.toContainText(/微整形|整形手術|光電注射/);
    await expect(page.locator('main')).not.toContainText(
      /醫美|微整|隆鼻|抽脂|玻尿酸|肉毒|雷射/
    );
  });

  test('症狀導覽更新可及狀態與對應衛教連結', async ({ page }) => {
    await page.goto('/clinic');

    const option = page.getByRole('button', {
      name: '想了解非手術止鼾方式'
    });
    await option.click();

    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.clinic-symptom-guidance')).toContainText(
      '可以先了解：止鼾好眠牙套'
    );
    await expect(
      page.getByRole('link', { name: '查看相關服務' })
    ).toHaveAttribute('href', '/clinic/nasal/snore-relief-mouthguard');
  });

  test('行動選單可開啟並用 Escape 關閉', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/clinic');

    const menu = page.getByRole('button', { name: '選單' });
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('navigation', { name: '診所網站導覽' })
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('首頁預約按鈕接回患者預約頁', async ({ page }) => {
    await page.goto('/clinic');
    await page.getByRole('link', { name: '線上預約' }).last().click();

    await expect(page).toHaveURL('/booking');
    await expect(
      page.getByRole('heading', { level: 1, name: '確認您的門診時段' })
    ).toBeVisible();
  });
});

// 麵包屑的語意。axe 不檢查這幾項——它看得到 `<nav>` 有名稱、連結有文字，
// 但看不出外層該是 `<ol>`、當前頁該被標記、分隔符不該是真實文字節點。
// 那三個偏離就是這樣撐了很久沒被發現的，所以這裡逐項釘住。
//
// 路由取樣 import 自 `support/clinic-routes.ts`，**不在這裡另開陣列**。
test.describe('診所官網麵包屑語意', () => {
  // 只有詳情頁有麵包屑，但斷言寫成「有的話就必須合格」——這樣日後在別的路由
  // 加麵包屑，不必記得回來改這支測試。
  for (const path of CLINIC_UI_SCAN_ROUTES) {
    test(`${path} 的麵包屑（若有）是合格的清單`, async ({ page }) => {
      await page.goto(path);

      const nav = page.locator('nav.clinic-breadcrumb');
      if ((await nav.count()) === 0) return;

      // 外層是 `<ol>`：報讀器才會播報「清單，N 個項目」與目前位置。
      await expect(nav.locator('> ol')).toHaveCount(1);
      const items = nav.locator('ol > li');
      expect(await items.count()).toBeGreaterThan(1);

      // 當前頁明示 aria-current="page"。APG 對非連結的當前頁列為 optional，
      // 本專案一律要求——這是專案加嚴規則，不是 APG 的硬性要求。
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(items.last().locator('[aria-current="page"]')).toHaveCount(
        1
      );

      // 分隔符必須來自 CSS，不能是 DOM 裡的文字節點（那會被唸出來）。
      await expect(nav).not.toContainText('/');
    });
  }

  test('詳情頁確實有麵包屑', async ({ page }) => {
    for (const path of [
      '/clinic/doctors/yan-cheng-an',
      '/clinic/nasal/snoring-five-in-one'
    ]) {
      await page.goto(path);
      await expect(page.locator('nav.clinic-breadcrumb')).toHaveCount(1);
    }
  });
});
