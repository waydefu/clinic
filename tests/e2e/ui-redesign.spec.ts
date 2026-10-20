import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createBooking,
  login,
  showAllAppointments,
  STORAGE_KEY
} from './support/workbench.js';

// Complements T3-Q-01 without modifying its five in-flight files. Assertions
// protect task access and responsive geometry, not a particular CSS layout.
for (const width of [320, 360, 375, 390, 768, 1024, 1280, 1440]) {
  test(`新版工作臺 ${width}px 保留有資料清單、導覽與可操作目標`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await createBooking(page, { name: 'TEST_UI_001', phone: '0900000001' });
    await showAllAppointments(page);
    if (width >= 1024) {
      // 清單日期來自 createBooking 的「下一檔時段」，1–9 日比 10–31 日短一碼。
      // 桌機 1280 的 4px 溢位只在兩位數日穩定出現；另插一列最長完整日期，
      // 避免把真實版面缺陷藏進「今天還是個位數日」的綠燈。
      await page.evaluate((key) => {
        const raw = window.localStorage.getItem(key);
        if (raw === null) throw new Error('找不到合成工作臺狀態');
        const state = JSON.parse(raw);
        const source = state.appointments.at(-1);
        if (source === undefined) throw new Error('請先建立一筆預約');
        state.appointments.push({
          ...source,
          id: 'appointment_long_date',
          startsAt: '2026-12-31T04:00:00.000Z'
        });
        window.localStorage.setItem(key, JSON.stringify(state));
      }, STORAGE_KEY);
      await page.reload();
      await expect(page.locator('#login-view')).toBeHidden();
      await showAllAppointments(page);
      await expect(page.locator('#appointments-section')).toContainText(
        '2026年12月31日'
      );
    }
    await expect(page.locator('#appointments-section')).toContainText(
      'TEST_UI_001'
    );
    const geometry = await page.evaluate(() => {
      const overflow =
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth;
      const outside = [...document.querySelectorAll('body *')]
        .filter(
          (el) =>
            el.checkVisibility() &&
            el.getBoundingClientRect().right > innerWidth + 1
        )
        .slice(-20)
        .map((el) => ({
          tag: el.tagName,
          id: el.id,
          class: String(el.className).slice(0, 80),
          right: Number(el.getBoundingClientRect().right.toFixed(1)),
          min: getComputedStyle(el).minWidth
        }));
      return { overflow, outside };
    });
    expect(geometry.overflow, JSON.stringify(geometry)).toBeLessThanOrEqual(1);
    const trigger = page.getByRole('button', {
      name: '工作區導覽',
      exact: true
    });
    if (width <= 768) await trigger.click();
    else {
      await expect(trigger).toBeHidden();
      const rail = page.locator('.workspace-nav');
      await expect(rail).toHaveCSS('flex-direction', 'column');
      await expect(rail).toHaveCSS('position', 'sticky');
      expect((await rail.boundingBox())!.width).toBe(176);
    }
    const active = page.locator('.workspace-nav [aria-current="page"]');
    await active.focus();
    await expect(active).toBeInViewport();
    await expect(active).toBeFocused();
    // selectOption / hash scroll uses block:start and tucks
    // #appointment-status-filter under sticky .workspace-nav at 768px.
    // Axe then reports WCAG 2.5.8 target-size (partiallyObscured ~11px).
    // Center the control before the scan; do not weaken the rule.
    await page.locator('#appointment-status-filter').evaluate((element) => {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .withRules(['target-size'])
      .analyze();
    expect(
      scan.violations.filter(
        (v) =>
          v.impact === 'serious' ||
          v.impact === 'critical' ||
          v.id === 'target-size'
      )
    ).toEqual([]);
  });
}

// 首屏品牌牆（業主 2026-10-11 決定）：照片用 object-fit: cover 填滿，邊緣可以裁，
// 但牆上的標誌必須整個留在畫面內；標題、說明與按鈕不覆蓋影像。2026-10-12 方向
// A+B 起桌機文字在照片左側、手機在照片下方，所以改成檢查「不重疊」而不是「在下方」；
// 門診資訊卡刻意疊在照片下緣，但不能碰到標誌。標誌位置
// 以來源圖的比例記錄（1920×1080 編碼後量測，四周各留約 1% 餘裕）；換圖時要重量。
// 尺寸挑的是會把取景推到極端的組合：常見筆電的實際可視高度（1366×657）、矮寬
// 視窗、超寬螢幕，以及直式平板與手機。
const BRAND_WALL_LOGO = { left: 0.26, top: 0.19, right: 0.59, bottom: 0.53 };

for (const viewport of [
  { width: 3440, height: 1300 },
  { width: 1920, height: 960 },
  { width: 1440, height: 900 },
  { width: 1366, height: 657 },
  { width: 1280, height: 720 },
  { width: 1280, height: 500 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
  { width: 320, height: 568 }
]) {
  test(`官網首屏 ${viewport.width}×${viewport.height} 品牌牆標誌完整，文字不覆蓋照片`, async ({
    page
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/clinic');
    const wall = page.locator('.clinic-arrival__image');
    await expect(wall).toHaveAttribute(
      'alt',
      '一森渼診所入口的品牌牆，牆上是診所標誌'
    );
    await wall.evaluate((node) => (node as HTMLImageElement).decode());

    const geometry = await wall.evaluate((node, logo) => {
      const img = node as HTMLImageElement;
      const box = img.getBoundingClientRect();
      const style = getComputedStyle(img);
      const scale =
        style.objectFit === 'cover'
          ? Math.max(
              box.width / img.naturalWidth,
              box.height / img.naturalHeight
            )
          : Math.min(
              box.width / img.naturalWidth,
              box.height / img.naturalHeight
            );
      const drawnWidth = img.naturalWidth * scale;
      const drawnHeight = img.naturalHeight * scale;
      const [x, y] = style.objectPosition
        .split(' ')
        .map((part) => Number.parseFloat(part) / 100);
      const originX = box.left + (box.width - drawnWidth) * x;
      const originY = box.top + (box.height - drawnHeight) * y;
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      return {
        image: rect(img),
        logo: {
          left: originX + logo.left * drawnWidth,
          top: originY + logo.top * drawnHeight,
          right: originX + logo.right * drawnWidth,
          bottom: originY + logo.bottom * drawnHeight
        },
        copy: [...document.querySelectorAll('.clinic-arrival__copy > *')].map(
          rect
        ),
        facts: rect(document.querySelector('.clinic-arrival__facts')!)
      };
    }, BRAND_WALL_LOGO);

    expect(geometry.logo.left).toBeGreaterThanOrEqual(geometry.image.left);
    expect(geometry.logo.right).toBeLessThanOrEqual(geometry.image.right);
    expect(geometry.logo.top).toBeGreaterThanOrEqual(geometry.image.top);
    expect(geometry.logo.bottom).toBeLessThanOrEqual(geometry.image.bottom);

    type Box = { left: number; top: number; right: number; bottom: number };
    const overlaps = (a: Box, b: Box) =>
      a.left < b.right - 1 &&
      b.left < a.right - 1 &&
      a.top < b.bottom - 1 &&
      b.top < a.bottom - 1;
    expect(geometry.copy.length, '首屏標題、說明或按鈕不見了').toBe(3);
    for (const block of geometry.copy) {
      expect(overlaps(block, geometry.image), '首屏文字蓋到照片上').toBe(false);
    }
    expect(overlaps(geometry.facts, geometry.logo), '資訊卡蓋到標誌').toBe(
      false
    );

    await expect(
      page.locator('.clinic-arrival__actions a[href="/booking"]')
    ).toBeVisible();
  });
}

test('患者手機首屏可開始選擇，選擇與返回仍保留', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/booking');
  await expect(page.locator('.booking-stepper strong')).toHaveCount(3);
  for (const label of await page.locator('.booking-stepper strong').all()) {
    await expect(label).toBeVisible();
  }
  const firstVisit = page.locator('[data-booking-type="initial"]');
  await expect(firstVisit).toBeInViewport();
  await firstVisit.click();
  // Service renderer owns the button attribute; use its native button role.
  const choice = page.locator('#patient-services button').first();
  await expect(choice).toBeVisible();
  await choice.click();
  await expect(page.locator('#slot-choice-heading')).toBeVisible();
  await page.locator('[data-booking-back="1"]').click();
  await expect(firstVisit).toHaveAttribute('aria-pressed', 'true');
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
});

test('官網首屏品牌牆與主要文案不以低透明度進場', async ({ page }) => {
  await page.goto('/clinic');
  const hero = page.locator(
    '.clinic-arrival__copy > *, .clinic-arrival__media, .clinic-arrival__image'
  );
  // 選擇器若因改版落空，evaluateAll 會在零個元素上回傳 []，變成沒測到東西的綠燈。
  await expect(hero).toHaveCount(5);
  await expect(page.locator('.clinic-arrival')).not.toHaveAttribute(
    'data-reveal'
  );
  const animated = await hero.evaluateAll((elements) =>
    elements
      .filter((element) => getComputedStyle(element).animationName !== 'none')
      .map((element) => element.className)
  );
  expect(animated).toEqual([]);
});

for (const width of [320, 375]) {
  for (const state of ['schedule', 'patient-details']) {
    test(`${width}px 表單狀態 ${state} 不溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      if (state === 'schedule') {
        await login(page);
        await page.goto('/staff#schedule-section');
        await expect(page.locator('#weekly-form')).toBeVisible();
      } else {
        await page.goto('/booking');
        await page.locator('[data-booking-type="initial"]').click();
        await page.locator('[data-service]').first().click();
        await page.locator('[data-patient-slot]').first().click();
        await expect(page.locator('#patient-name')).toBeVisible();
      }
      const geometry = await page.evaluate(() => ({
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        outside: [...document.querySelectorAll('body *')]
          .filter(
            (el) =>
              el.checkVisibility() &&
              el.getBoundingClientRect().right > innerWidth + 1
          )
          .slice(-20)
          .map((el) => ({
            tag: el.tagName,
            id: el.id,
            class: el.className,
            right: el.getBoundingClientRect().right,
            min: getComputedStyle(el).minWidth
          }))
      }));
      expect(
        geometry.overflow,
        JSON.stringify(geometry.outside)
      ).toBeLessThanOrEqual(1);
    });
  }
}

test('官網模組延遲時，頁尾不先佔據主內容首屏', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let release!: () => void;
  const moduleReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/clinic-site(?:\.[a-f0-9]+)?\.js$/, async (route) => {
    await moduleReady;
    await route.continue();
  });
  try {
    await page.goto('/clinic', { waitUntil: 'commit' });
    await expect(page.locator('.clinic-header')).toHaveCSS(
      'position',
      'sticky'
    );
    await expect(page.locator('.clinic-footer')).toBeAttached();
    const footer = await page.locator('.clinic-footer').boundingBox();
    expect(footer!.y).toBeGreaterThanOrEqual(900);
  } finally {
    release();
  }
  await expect(page.locator('#clinic-main h1')).toBeVisible();
});

test.describe('官網無腳本退路', () => {
  test.use({ javaScriptEnabled: false });
  test('不為尚未執行的模組留下空白首屏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/clinic');
    await expect(page.locator('.clinic-noscript')).toBeVisible();
    const footer = await page.locator('.clinic-footer').boundingBox();
    expect(footer!.y).toBeLessThan(900);
    await expect(
      page.locator('.clinic-noscript a[href="tel:+886225771314"]')
    ).toBeVisible();
  });
});
