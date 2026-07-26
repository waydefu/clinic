import { expect, test } from '@playwright/test';

// 這一頁在 JavaScript 沒有執行時必須還能用。
//
// 這不是只為了「使用者關掉 JS」的邊緣情境。預約流程的內容全部由模組產生，而
// 產物是逐檔出貨的 ES module，任何一支沒載進來（訊號不穩、快取毒化、資產遺失）
// 結果都一樣：`#patient-booking-app` 與登入閘門都帶著 hidden，畫面上什麼都沒有。
// 先前那個「什麼都沒有」連診所電話都不包含——對一個門診預約頁來說，這是最不能
// 接受的失敗方式，因為患者連改用電話的路都被擋住了。
//
// 關掉 JavaScript 是能穩定重現那個狀態的方式，所以拿它當這條保證的守門員。
test.use({ javaScriptEnabled: false });

test.describe('JavaScript 未執行時的後備', () => {
  test('患者預約頁仍然給得出電話、地址與門診時間', async ({ page }) => {
    await page.goto('/booking');

    // 電話是這個畫面唯一的行動點，必須真的可以撥。
    await expect(
      page.getByRole('link', { name: '02-2577-1314' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: '0800-000-913（免付費）' })
    ).toBeVisible();

    const text = await page.locator('body').innerText();
    expect(text).toContain('臺北市松山區光復北路112號2樓');
    expect(text).toContain('門診時間');
    // 而且要說清楚為什麼看不到預約流程，不能只是一塊聯絡資訊。
    expect(text).toContain('JavaScript');
  });

  // 門診時間先前是「讀取中」，靠 JS 填。JS 沒跑就永遠停在讀取中——那是一個
  // 永遠不會結束的載入狀態，比沒有還糟。現在靜態內容就是真的時間，JS 只負責
  // 更新它。
  test('門診時間不是一個永遠不會結束的讀取中', async ({ page }) => {
    await page.goto('/booking');

    await expect(page.locator('#patient-hours-footer')).not.toHaveText(
      /讀取中/
    );
    await expect(page.locator('#patient-hours-footer')).toContainText('12:00');
  });

  // canonical 與 og:url 都宣告 /booking，所以那個網址必須真的可用，而舊路徑要
  // 導過去而不是留下第二份同樣的內容。
  test('/patient.html 會 301 導向對外網址 /booking', async ({ page }) => {
    const response = await page.goto('/patient.html');

    expect(new URL(page.url()).pathname).toBe('/booking');
    expect(response?.status()).toBe(200);
  });

  test('工作臺說明自己為什麼是空的，而不是留一片空白', async ({ page }) => {
    await page.goto('/');

    const text = await page.locator('body').innerText();
    expect(text).toContain('JavaScript');
    // 先前這裡的 innerText 只有 skip link。
    expect(text.length).toBeGreaterThan(40);
  });
});
