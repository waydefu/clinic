import { expect, test, type Page } from '@playwright/test';

// 工作臺的完整生命週期：登入 → 建立 → 到診 → 回診 → 刪除，跑在打包後的產物上。
// 這條路徑同時覆蓋這個 session 新做的兩件事——管理者限定的刪除（含理由彈窗）
// 與登入閘門——確保它們在真瀏覽器裡真的接得起來，而不只是單元測試裡的函式。

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#login-account').fill('admin');
  await page.locator('#login-password').fill('beauessence-admin');
  await page.locator('#login-view button[type="submit"]').click();
  // 登入後閘門消失、工作臺出現。
  await expect(page.locator('#login-view')).toBeHidden();
  await expect(page.locator('#logout')).toBeVisible();
}

async function createBooking(page: Page): Promise<void> {
  await page.goto('/#appointments-section');
  // 建立預約的表單收在一個 <details> 裡，先展開。
  await page.locator('#booking-workflow').evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
  await page.locator('#booking-name').fill('測試患者甲');
  await page.locator('#booking-phone').fill('0912345678');
  await page.locator('#booking-birth').fill('1990-05-20');
  await page.locator('#booking-national-id').fill('A123456789');
  await page.locator('#booking-kind').selectOption('initial');
  // 選第一個可預約時段，再送出建立。
  await page.locator('#slots [data-select-slot]').first().click();
  await page.locator('#booking-form button[type="submit"]').click();
}

// 合成資料是 2030 年，預設「當日」篩選看不到；切到「全部狀態」才會列出。
async function showAllAppointments(page: Page): Promise<void> {
  await page.locator('#appointment-status-filter').selectOption('all');
}

test.describe('工作臺預約生命週期', () => {
  test('登入→建立→到診→回診→刪除', async ({ page }) => {
    await loginAsAdmin(page);
    await createBooking(page);
    await showAllAppointments(page);

    const card = page.locator('[data-appointment-card]').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('預約成立');

    // 到診：卡片上的主要動作按鈕，確認彈窗按「確認到診」（非破壞性，主要色）。
    await card.locator('[data-appointment-action="complete"]').click();
    await page.locator('.confirm-dialog button.button-primary').click();
    await expect(page.locator('[data-appointment-card]').first()).toContainText(
      '已完成到診'
    );

    // 回診：完成到診後於逐筆回診確認記錄「需要回診」；表單就在同一頁，不需重載。
    const followUpForm = page
      .locator('#follow-up-list [data-follow-up-form]')
      .first();
    await expect(followUpForm).toBeVisible();
    await followUpForm
      .locator('select[name="status"]')
      .selectOption('required');
    // 目標日期／時間預設已落在第一個有回診時段的門診日，直接存檔。
    await followUpForm.locator('button[type="submit"]').click();

    // 存檔後該筆變成「待安排回診」的回診版卡片。
    const followUpCard = page.locator('[data-follow-up-pending]').first();
    await expect(followUpCard).toBeVisible();

    // 刪除（管理者限定）：從卡片的「更多處置」選單開啟，理由彈窗選理由後確認。
    await followUpCard.locator('summary').click();
    await followUpCard.locator('[data-appointment-action="delete"]').click();
    const dialog = page.locator('.confirm-dialog');
    await expect(dialog.locator('.confirm-dialog-reason')).toBeVisible();
    await dialog.locator('select').selectOption('wrong_patient');
    await dialog.locator('button.button-danger').click();

    // 刪除後清單不再有任何預約卡。
    await expect(page.locator('[data-appointment-card]')).toHaveCount(0);
  });

  test('櫃台帳號看不到刪除入口', async ({ page }) => {
    // 先以管理者建立一筆，再以櫃台登入檢查刪除入口缺席。
    await loginAsAdmin(page);
    await createBooking(page);
    await page.locator('#logout').click();

    await expect(page.locator('#login-view')).toBeVisible();
    await page.locator('#login-account').fill('front');
    await page.locator('#login-password').fill('beauessence-front');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#logout')).toBeVisible();

    await page.goto('/#appointments-section');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card]').first();
    await expect(card).toBeVisible();
    // 打開「更多處置」選單也沒有刪除項。
    await card.locator('summary').click();
    await expect(
      card.locator('[data-appointment-action="delete"]')
    ).toHaveCount(0);
  });
});
