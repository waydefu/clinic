import { expect, test, type Locator } from '@playwright/test';

import { CLINIC_UI_SCAN_ROUTES } from './support/clinic-routes.js';
import { CLIP_SCAN } from './support/clip-scan.js';
import { login } from './support/workbench.js';

async function targetHeight(locator: Locator) {
  return locator.evaluate((element) => element.getBoundingClientRect().height);
}

// 逐個具名選擇器斷言抓得到今天的問題，擋不住明天：只要有人把新的正文套上
// `--clinic-text-micro`，token 檢查會認為它用了**合法 token** 而放行，而字級
// 仍然是錯的。所以官網這一組改成掃 computed style，分兩層：
//
//   1. **絕對下限**：所有可見、非裝飾的文字 ≥14px（規則書 R-6 的硬底線）；
//   2. **語意門檻**：正文、導覽、控制項、聯絡資訊與安全警語 ≥16px。
//
// 掃 computed style 還有一個 token 檢查做不到的好處：**它看得到根本沒有寫
// CSS 的元素**。2026-08-06 這一輪就是這樣抓到兩處——`.clinic-visit-card h3`
// 落在瀏覽器預設的 1.17em（18.72px），hero 的 `<small>` 落在 `smaller`
// （13.33px）。兩者都沒有任何宣告，因此對讀宣告的檢查完全隱形。
const TEXT_SCAN = `(() => {
  const MIN_ABSOLUTE = 14;
  const MIN_SEMANTIC = 16;
  // 浮點容忍：瀏覽器可能回 13.999999px。這是誤差容忍，不是放寬門檻。
  const EPSILON = 0.01;

  // 「承載文字的元素」＝直接子節點裡有非空 text node 的元素。用它而不是
  // textContent，否則 <article><section><p>字</p></section></article> 會讓同一
  // 句話被回報三次，掃描一跑噴出幾百條重複就沒有人會看。
  const ownText = (element) => [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => (node.textContent ?? '').trim())
    .join('');

  const decorative = (element) => {
    if (element.closest('[aria-hidden="true"]') !== null) return true;
    if (element.closest('.visually-hidden') !== null) return true;
    if (element.closest('svg') !== null) return true;
    return false;
  };

  // R-6 允許停在 14px 的次要標記：eyebrow、徽章、代碼、極次要 metadata。
  // 它們不承載完成任務所需的資訊——拿掉也不影響讀者知道要做什麼。
  // 注意 \`.preview-boundary\` 本身**不在**這一類：那句「請勿輸入真實患者資料」
  // 是安全警語，必須好讀；只有它旁邊那顆 ONLINE PREVIEW 徽標算標記。
  const minorLabel = (element) => {
    if (element.classList.contains('clinic-eyebrow')) return true;
    if (element.matches('.preview-boundary span')) return true;
    if (element.matches('code, kbd, samp')) return true;
    return false;
  };

  // 16px 門檻適用的範圍：讀得懂內容與完成任務所需的文字。
  const semantic = (element) => {
    if (element.closest('nav, footer, address') !== null) return true;
    if (element.closest('.preview-boundary') !== null) return true;
    if (element.matches('p, li, dd, dt, td, th, label, button, a[href], summary'))
      return true;
    return false;
  };

  const offenders = [];
  const seen = new Set();
  for (const element of document.querySelectorAll('body *')) {
    const text = ownText(element);
    if (text === '') continue;
    if (decorative(element)) continue;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const size = Number.parseFloat(style.fontSize);
    const floor =
      semantic(element) && !minorLabel(element) ? MIN_SEMANTIC : MIN_ABSOLUTE;
    if (size >= floor - EPSILON) continue;

    const selector = element.tagName.toLowerCase() +
      (element.id !== '' ? '#' + element.id : '') +
      (element.className !== '' ? '.' + String(element.className).trim().split(/\\s+/).join('.') : '');
    const key = selector + '|' + text.slice(0, 24) + '|' + size;
    if (seen.has(key)) continue;
    seen.add(key);
    offenders.push(
      selector + ' 「' + text.slice(0, 24) + '」 → ' + size + 'px（需 ≥' + floor + 'px，R-6）'
    );
  }
  return offenders;
})()`;

test.describe('readable operational typography', () => {
  test('patient essentials use the 16px body scale and 44px controls', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/booking');
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();

    const navigationLink = page.locator('.patient-nav a').first();
    await expect(navigationLink).toHaveCSS('font-size', '16px');
    expect(await targetHeight(navigationLink)).toBeGreaterThanOrEqual(44);

    await expect(page.locator('.booking-stepper strong').first()).toHaveCSS(
      'font-size',
      '16px'
    );
    await expect(
      page.locator('.booking-panel-heading > p:last-child').first()
    ).toHaveCSS('font-size', '16px');
    await expect(page.locator('#patient-national-id-hint')).toHaveCSS(
      'font-size',
      '16px'
    );

    const themePicker = page.locator('#theme-picker');
    await expect(themePicker).toHaveCSS('font-size', '16px');
    expect(await targetHeight(themePicker)).toBeGreaterThanOrEqual(44);
  });

  test('workbench navigation, feedback, filters and tables use 16px', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);

    const appointmentsLink = page.locator(
      '.workspace-nav a[href="#appointments-section"]'
    );
    await expect(appointmentsLink).toHaveCSS('font-size', '16px');
    expect(await targetHeight(appointmentsLink)).toBeGreaterThanOrEqual(44);
    await appointmentsLink.click();
    await expect(page.locator('#appointments-heading')).toBeVisible();

    await expect(page.locator('#status')).toHaveCSS('font-size', '16px');
    await expect(page.locator('#appointment-result-summary')).toHaveCSS(
      'font-size',
      '16px'
    );
    await expect(page.locator('.filter-bar label').first()).toHaveCSS(
      'font-size',
      '16px'
    );
    await expect(page.locator('#booking-workflow .button').first()).toHaveCSS(
      'font-size',
      '16px'
    );

    await page.locator('.workspace-nav a[href="#schedule-section"]').click();
    const publishedSchedule = page
      .locator('#published-schedule .data-table')
      .first();
    await expect(publishedSchedule).toBeVisible();
    await expect(publishedSchedule).toHaveCSS('font-size', '16px');
    await expect(publishedSchedule.locator('th').first()).toHaveCSS(
      'font-size',
      '16px'
    );
  });

  // 官網先前完全不在這支 spec 的範圍內——它只 `goto('/booking')` 與工作臺。
  // 於是 `/clinic` 在 375px 有 32 處文字低於 14px（最小 9.92px，包含手機唯一的
  // 導覽入口與「請勿輸入真實患者資料」這句安全警語），而 CI 一直是綠的。
  for (const route of CLINIC_UI_SCAN_ROUTES) {
    for (const width of [1280, 375]) {
      test(`診所官網的文字達到字級門檻：${route} @ ${width}px`, async ({
        page
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await expect(page.locator('h1')).toBeVisible();

        const offenders = await page.evaluate(TEXT_SCAN);
        expect(
          offenders,
          `${route} @ ${width}px 有文字低於字級門檻：\n${(offenders as string[]).join('\n')}`
        ).toEqual([]);
      });
    }
  }
});

test.describe('診所官網在 200% 文字放大下不損失內容', () => {
  // 400% 頁面縮放的重排（SC 1.4.10）不在這裡重複做——1280px 的 400% 等於
  // 320px viewport，`responsive.spec.ts` 的 320px 案例已經守住了。
  for (const route of CLINIC_UI_SCAN_ROUTES) {
    test(`${route} @ 200%`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();

      // 用 CSSOM 改根字級，不是 addStyleTag——這個 app 的 CSP 是
      // `style-src 'self'`，注入 <style> 會被擋掉。改 element.style 走的是
      // CSSOM，不受該指令限制。
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
      await page.waitForTimeout(200);

      // A. 文件層：不得出現新的水平溢位。
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(
        overflow.scrollWidth,
        `${route} 在 200% 文字放大下出現水平溢位：${overflow.scrollWidth} > ${overflow.clientWidth}`
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);

      // B. 元素層：承載文字的元素（或它的祖先）不得把文字切掉。
      const clipped = await page.evaluate(CLIP_SCAN);
      expect(
        clipped,
        `${route} 在 200% 文字放大下有文字被裁切：\n${(clipped as string[]).join('\n')}`
      ).toEqual([]);

      // C. 功能不得遺失。SC 1.4.4 講的是「損失內容**或功能**」——B 管內容，
      // 這一段管功能：關鍵區域還在、主要轉換入口還看得見而且還按得到。
      for (const selector of [
        '.clinic-header',
        '.clinic-breadcrumb',
        '.clinic-footer'
      ]) {
        const region = page.locator(selector).first();
        if ((await region.count()) === 0) continue;
        await expect(region, `${selector} 在 200% 下消失了`).toBeVisible();
      }

      const cta = page.locator('a[href="/booking"]').first();
      if ((await cta.count()) > 0) {
        await expect(cta, '200% 下主要轉換入口不可見').toBeVisible();
        expect(
          await targetHeight(cta),
          '200% 下主要轉換入口的觸控目標小於 44px'
        ).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
