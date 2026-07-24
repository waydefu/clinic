import { expect, test } from '@playwright/test';

// 患者端完整預約流程，跑在打包後的最終產物上。這是唯一一條真正走完四步驟精靈
// 的路徑，證明合成建立預約在真瀏覽器裡從頭到尾可用，而不只是單元層的函式。

test.describe('患者線上預約', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patient.html');
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

    // 步驟 3：填基本資料並勾選「資料只留在本機」的確認。
    await page.locator('#patient-name').fill('測試患者甲');
    await page.locator('#patient-phone').fill('0912345678');
    await page.locator('#patient-birth').fill('1990-05-20');
    await page.locator('#patient-national-id').fill('A123456789');
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

  test('未勾選本機保存確認時擋下送出並說明原因', async ({ page }) => {
    await page.locator('[data-booking-type="initial"]').click();
    await page.locator('#patient-services [data-service]').first().click();
    await page.locator('[data-patient-slot]').first().click();
    await page.locator('#patient-name').fill('測試患者乙');
    await page.locator('#patient-phone').fill('0922333444');
    await page.locator('#patient-birth').fill('1985-11-02');
    await page.locator('#patient-national-id').fill('B287654321');
    // 故意不勾 synthetic-confirmation。
    await page.locator('#confirm-patient-booking').click();

    await expect(page.locator('#synthetic-confirmation-error')).toBeVisible();
    // 沒有前進到完成步驟——步驟 4 面板維持隱藏（其標題文字是靜態預設，不能
    // 拿它判斷是否完成）。
    await expect(page.locator('[data-booking-step="4"]')).toBeHidden();
  });
});
