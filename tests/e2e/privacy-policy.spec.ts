import { expect, test } from '@playwright/test';

// 個資法第 8 條要求「蒐集前告知」五件事。這支測試把那五件事釘成頁面必須成立的
// 內容，而不是靠人記得——政策頁最常見的退步不是寫錯，是改版時整段被刪掉。
//
// 這裡驗的是「該說的有沒有說」與「找不找得到」，不是法律用語是否精確；文字本身
// 仍待法務審閱（D-003）。

test.describe('隱私權政策頁', () => {
  test('/privacy 可直接開啟，/privacy.html 則 301 導向它', async ({
    page,
    request
  }) => {
    await page.goto('/privacy');
    await expect(
      page.getByRole('heading', { level: 1, name: /隱私權政策/ })
    ).toBeVisible();

    // 兩個網址並存會讓搜尋引擎看到重複內容，也讓分享出去的連結各不相同。
    const direct = await request.get('/privacy.html', {
      maxRedirects: 0
    });
    expect(direct.status()).toBe(301);
    expect(direct.headers()['location']).toBe('/privacy');
  });

  test('個資法第 8 條要求告知的五件事都在頁面上', async ({ page }) => {
    await page.goto('/privacy');
    const body = page.locator('body');

    // 一、機構名稱 / 二、蒐集目的 / 三、個資類別 /
    // 四、期間、地區、對象及方式 / 五、當事人權利及行使方式
    await expect(body).toContainText('一森渼診所');
    await expect(body).toContainText('蒐集目的');
    await expect(body).toContainText('個人資料類別');
    await expect(body).toContainText('利用的期間、地區、對象與方式');
    await expect(body).toContainText('您可以行使的權利');
    // 「不提供的影響」也是第 8 條列舉的事項之一。
    await expect(body).toContainText('不提供個人資料的影響');

    // 權利要能真的行使：必須留下一個可用的聯絡管道。
    await expect(
      page.locator('a[href="tel:+886225771314"]').first()
    ).toBeVisible();
  });

  test('保存期限與提供對象寫的是實際設定，不是空話', async ({ page }) => {
    await page.goto('/privacy');
    const body = page.locator('body');
    await expect(body).toContainText('兩年');
    await expect(body).toContainText('Google');
    // 日曆投影刻意不含 PII，這一點必須對患者說清楚。
    await expect(body).toContainText('不含您的姓名');
  });

  // 目前資料根本沒有離開裝置。若政策頁講得像診所已經在蒐集，那是反向的不實陳述。
  test('說清楚現在是測試版本、資料不會傳到診所', async ({ page }) => {
    await page.goto('/privacy');
    const notice = page.locator('.policy-notice-strong');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('測試版本');
    await expect(notice).toContainText('不會傳送到診所');
    // 草稿身分同樣要標示，避免被當成診所的正式聲明引用。
    await expect(page.locator('body')).toContainText('草稿');
  });

  // 個資法要的是「蒐集**前**告知」，所以連結必須在填完資料、按下送出之前就看得
  // 到——躺在頁尾不算。要驗這件事就得真的走到那一步：資料欄位在步驟 3，前面兩步
  // 沒走完它是隱藏的。
  test('填寫資料的那一步就看得到告知連結，且在送出鈕之前', async ({ page }) => {
    await page.goto('/booking');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await expect(page.locator('[data-patient-slot]').first()).toBeVisible();
    await page.locator('[data-patient-slot]').first().click();

    const consentLink = page
      .locator('a[href="/privacy"]:below(:text("我了解此頁為測試版本"))')
      .first();
    await expect(consentLink).toBeVisible();

    // 順序也要對：告知在送出鈕之上，不是送出之後才補一句。
    const linkBox = await consentLink.boundingBox();
    const submitBox = await page
      .locator('#confirm-patient-booking')
      .boundingBox();
    expect(linkBox).not.toBeNull();
    expect(submitBox).not.toBeNull();
    expect(linkBox!.y).toBeLessThan(submitBox!.y);
  });

  test('本頁不載入任何指令碼，也不下載字型', async ({ page }) => {
    const scripts: string[] = [];
    const fonts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
      if (request.resourceType() === 'font') fonts.push(request.url());
    });
    await page.goto('/privacy');
    await expect(
      page.getByRole('heading', { level: 1, name: /隱私權政策/ })
    ).toBeVisible();
    expect(scripts).toEqual([]);
    expect(fonts).toEqual([]);
  });
});
