import { expect, test } from '@playwright/test';

// 首頁動效與補全後的資訊區塊。
//
// 動效最容易壞在三個地方，而三個都不會有錯誤訊息：進場效果把內容永久留在隱藏
// 狀態、動效推高版面位移、以及使用者要求減少動態時照播不誤。這一組各盯一個。

test.describe('首頁動效', () => {
  test('進場效果只在 JS 執行時啟用，內容不會被永久藏起來', async ({ page }) => {
    await page.goto('/clinic');

    // `.clinic-motion` 是唯一會讓 [data-reveal] 變透明的開關，它由腳本加上。
    await expect(page.locator('html')).toHaveClass(/clinic-motion/);

    const sections = page.locator('[data-reveal]');
    await expect(sections).not.toHaveCount(0);

    // 捲到任何一個區塊都必須揭開；留在 opacity: 0 就等於內容不見了。
    const first = sections.first();
    await first.scrollIntoViewIfNeeded();
    await expect(first).toHaveClass(/is-revealed/);
    await expect(first).toHaveCSS('opacity', '1');
  });

  test('捲動後其餘區塊會依序揭開', async ({ page }) => {
    await page.goto('/clinic');
    const faq = page.locator('#clinic-faq');
    await faq.scrollIntoViewIfNeeded();
    await expect(faq).toHaveClass(/is-revealed/);
    await expect(faq).toHaveCSS('opacity', '1');
  });

  test('捲離頁首後 header 收合', async ({ page }) => {
    await page.goto('/clinic');
    const header = page.locator('.clinic-header');
    await expect(header).not.toHaveClass(/is-condensed/);

    await page.locator('#clinic-faq').scrollIntoViewIfNeeded();
    await expect(header).toHaveClass(/is-condensed/);
  });

  // 業主 2026-08-01 明確要求圖片不可分割或遮擋，所以進場只能淡入。縮放會讓圖片
  // 在動畫期間超出容器被裁掉一圈，clip-path 則是直接遮住一部分。
  test('圖片進場不縮放也不被遮罩', async ({ page }) => {
    await page.goto('/clinic');
    const image = page.locator('[data-reveal] img').first();
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveCSS('transform', 'none');
    await expect(image).toHaveCSS('clip-path', 'none');
  });
});

test.describe('減少動態偏好', () => {
  test('所有區塊直接可見，不播放進場', async ({ page }) => {
    // 用 `emulateMedia` 而不是 `test.use({ reducedMotion })`：後者在這個專案的
    // 設定下沒有生效（實測 `matchMedia(...).matches` 仍為 false），於是測試看起來
    // 在驗證減少動態，實際上驗證的是一般模式——一個會通過但什麼都沒測到的測試。
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/clinic');
    for (const id of ['#clinic-visit', '#clinic-faq']) {
      await expect(page.locator(id)).toHaveCSS('opacity', '1');
    }
    // 捲動進度條在此偏好下不顯示，而不是顯示一條不動的線。
    await expect(page.locator('.clinic-scroll-progress')).toBeHidden();
  });
});

test.describe('補全的首頁資訊', () => {
  test('門診時間與官網一致', async ({ page }) => {
    await page.goto('/clinic');
    const visit = page.locator('#clinic-visit');
    await expect(visit).toContainText('週三至週五 12:00–20:00');
    await expect(visit).toContainText('週六 10:00–18:00');
    await expect(visit).toContainText('週日、週一、週二');
  });

  test('社群連結是乾淨網址，沒有追蹤或登入牆', async ({ page }) => {
    await page.goto('/clinic');
    const chips = page.locator('.clinic-social-chip');
    await expect(chips).toHaveCount(4);

    const hrefs = await chips.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLAnchorElement).href)
    );
    expect(hrefs).toContain('https://page.line.me/821tzbtx');
    expect(hrefs).toContain('https://www.instagram.com/beauessence.tw');
    expect(hrefs).toContain('https://m.me/575723225620285');

    // 這三樣一旦回來就是退步：QR 彈窗、分享追蹤參數、Messenger 登入牆。
    const joined = hrefs.join(' ');
    expect(joined).not.toContain('openQrModal');
    expect(joined).not.toContain('utm_source');
    expect(joined).not.toContain('login.php');
  });

  test('常見問題維持衛教邊界且不承諾尚未核准的取消規則', async ({ page }) => {
    await page.goto('/clinic');
    const faq = page.locator('#clinic-faq');
    await expect(faq).toContainText('打鼾一定需要手術嗎？');
    await expect(faq).toContainText('需要先確認原因');
    await expect(faq).toContainText('實際診斷與處理方向會由醫師面診後說明');
    // D-005 未核准前，頁面上不得出現具體的截止時間或費用。
    await expect(faq).not.toContainText('24 小時');
    await expect(faq).not.toContainText('收費');
  });
});
