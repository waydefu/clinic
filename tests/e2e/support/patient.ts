import { expect, type Page } from '@playwright/test';

/**
 * 患者預約頁的共用操作。
 *
 * 生日自 2026-07-27 起是三格（年選填／月／日，見介面規則書 R-7 的具名例外），
 * 所以「填生日」不再是 `fill('1990-05-20')` 一句話。集中在這裡，是為了下一次
 * 欄位形狀再變時只有一個地方要改——先前 `#patient-birth` 散在三支 spec 裡。
 */
export async function fillBirthDate(
  page: Page,
  { year, month, day }: { year?: string; month: string; day: string }
): Promise<void> {
  await page.locator('#patient-birth-year').fill(year ?? '');
  await page.locator('#patient-birth-month').fill(month);
  await page.locator('#patient-birth-day').fill(day);
}

/**
 * 送出預約並等到它**真的**建立完成。
 *
 * 不能等 `#booking-complete-heading` 的文字：「預約已建立」同時是 patient.html
 * 裡那個標題的**靜態預設值**，所以那個斷言在按下送出的瞬間就通過了，之後的步驟
 * 會跑在還沒寫進 localStorage 的狀態上（2026-07-27 實際踩到：讀出來是 null）。
 * `#booking-result` 的預約編號是成功處理器才填的，那才是真的訊號。
 */
export async function submitBooking(page: Page): Promise<void> {
  await page.locator('#confirm-patient-booking').click();
  await expect(page.locator('#booking-result')).toContainText('appointment_');
}
