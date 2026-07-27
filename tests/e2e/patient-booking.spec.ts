import { expect, test } from '@playwright/test';

// 患者端完整預約流程，跑在打包後的最終產物上。這是唯一一條真正走完四步驟精靈
// 的路徑，證明合成建立預約在真瀏覽器裡從頭到尾可用，而不只是單元層的函式。

test.describe('患者線上預約', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/booking');
    // 每個測試各自的 context 已是乾淨的 localStorage；仍明確清一次並重載，
    // 讓合成資料回到出廠狀態，測試互不影響。
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test('走完四步驟並建立一筆初診預約', async ({ page }) => {
    // 步驟 1：選初診，再選第一個看診項目（選項目會前進到步驟 2）。
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();

    // 步驟 2：選第一個可預約時段（選時段會前進到步驟 3）。
    await expect(page.locator('[data-patient-slot]').first()).toBeVisible();
    await page.locator('[data-patient-slot]').first().click();

    // 步驟 3：填基本資料，並勾選兩個各自獨立的確認——個資蒐集告知的同意，以及
    // 「資料只留在本機」。兩者是不同的事，所以是兩個勾選框而不是一個。
    await page.locator('#patient-name').fill('測試患者甲');
    await page.locator('#patient-phone').fill('0912345678');
    await page.locator('#patient-birth').fill('1990-05-20');
    await page.locator('#patient-national-id').fill('A123456789');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await page.locator('#confirm-patient-booking').click();
    // 不驗「送出中…」那個瞬間狀態：斷言是點擊之後才開始輪詢，本機動作往往在
    // 輪詢開始前就結束了，於是變成間歇性紅燈。忙碌狀態的專屬測試在
    // workbench-lifecycle.spec.ts，用 MutationObserver 確定性地觀察。

    // 步驟 4：完成畫面出現預約編號。
    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '預約已建立'
    );
    await expect(page.locator('#booking-result')).toContainText('預約編號');
    await expect(page.locator('#booking-result')).toContainText('appointment_');
  });

  // P12（業主 2026-07-27）：加入行事曆是患者唯一會拿到的提醒，所以完成畫面要
  // 明講「沒加就不會再有提醒」。但**提出取消之後那句話必須消失**——已經沒有門診
  // 可以提醒了，留著會讓同一個畫面同時說「取消要求已送出」與「記得加入行事曆」。
  // 取消路徑改寫的是同一批 id，所以這一段特別容易在改版時被漏掉。
  test('完成畫面說明沒有其他提醒管道，提出取消後收起那句話', async ({
    page
  }) => {
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('測試患者丙');
    await page.locator('#patient-phone').fill('0933444555');
    await page.locator('#patient-birth').fill('1978-03-09');
    await page.locator('#patient-national-id').fill('C123456789');
    await page.locator('#privacy-consent').check();
    await page.locator('#synthetic-confirmation').check();
    await page.locator('#confirm-patient-booking').click();

    await expect(page.locator('#booking-complete-reminder')).toBeVisible();
    await expect(page.locator('#booking-complete-reminder')).toContainText(
      '不會再發出任何提醒'
    );

    await page.locator('[data-patient-cancel]').first().click();
    await page.locator('.confirm-dialog button.button-primary').click();

    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '取消要求已送出'
    );
    await expect(page.locator('#booking-complete-reminder')).toBeHidden();
  });

  // P1b：回診狀態自 2026-07-27 起顯示在按鈕**外**。留在按鈕裡的話，這段會變的
  // 文字會成為按鈕可及名稱的一部分，等於每次狀態更新都在改「這顆按鈕叫什麼」。
  test('回診狀態顯示在掛號別按鈕之外', async ({ page }) => {
    const status = page.locator('#follow-up-choice-status');
    await expect(status).toBeVisible();
    await expect(status).toContainText('回診狀態');
    expect(
      await status.evaluate(
        (element) => element.closest('[data-booking-type]') !== null
      ),
      '#follow-up-choice-status 又被放回掛號別按鈕裡了'
    ).toBe(false);
    // 但按鈕仍必須指得到它，否則報讀器聽不到「為什麼現在不能選回診」。
    await expect(
      page.locator('[data-booking-type="follow_up"]')
    ).toHaveAttribute('aria-describedby', 'follow-up-choice-status');
  });

  test('未勾選本機保存確認時擋下送出並說明原因', async ({ page }) => {
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('測試患者乙');
    await page.locator('#patient-phone').fill('0922333444');
    await page.locator('#patient-birth').fill('1985-11-02');
    await page.locator('#patient-national-id').fill('B287654321');
    // 個資同意要先勾起來，才驗得到「本機保存確認」這一條——兩個確認各自報錯，
    // 而個資同意排在前面。只留一個沒勾，才知道報的是不是對的那一句。
    await page.locator('#privacy-consent').check();
    // 故意不勾 synthetic-confirmation。
    await page.locator('#confirm-patient-booking').click();

    await expect(page.locator('#synthetic-confirmation-error')).toBeVisible();
    // 沒有前進到完成步驟——步驟 4 面板維持隱藏（其標題文字是靜態預設，不能
    // 拿它判斷是否完成）。
    await expect(page.locator('[data-booking-step="4"]')).toBeHidden();
  });
});
