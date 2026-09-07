import { expect, type Page } from '@playwright/test';

import { STORAGE_KEY } from './workbench.js';

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

/**
 * 打開「查詢／取消預約」對話框並查出本人可管理的預約。
 *
 * 查詢必須用電話＋生日；這是患者自助表面，不是工作臺。
 */
export async function lookupBooking(
  page: Page,
  { phone, birthDate }: { phone: string; birthDate: string }
): Promise<void> {
  await page.locator('#booking-management-open').click();
  await page.locator('#booking-lookup-phone').fill(phone);
  await page.locator('#booking-lookup-birth').fill(birthDate);
  await page.locator('#booking-lookup-form button[type="submit"]').click();
  await expect(page.locator('.booking-lookup-card')).toBeVisible();
}

/** 讓需要走完取消／改期流程的案例不受 CI 實際執行時刻影響。 */
export async function makeLatestBookingSelfCancellable(
  page: Page
): Promise<void> {
  await page.evaluate((key) => {
    const next = JSON.parse(localStorage.getItem(key) ?? 'null');
    next.appointments.at(-1).startsAt = new Date(
      Date.now() + 24 * 60 * 60_000
    ).toISOString();
    localStorage.setItem(key, JSON.stringify(next));
  }, STORAGE_KEY);
}

/**
 * 走完患者初次預約表單，留下一筆可查詢的合成預約。
 *
 * 品質掃描要的是「查詢對話框裡的改期控制」這個狀態，不是再驗一次建立流程。
 */
export async function createPatientInitialBooking(
  page: Page,
  {
    name,
    phone,
    nationalId,
    birth
  }: {
    name: string;
    phone: string;
    nationalId: string;
    birth: { year: string; month: string; day: string };
  }
): Promise<void> {
  await page.locator('[data-booking-type="initial"]').click();
  await page.locator('#patient-services [data-service]').first().click();
  await page.locator('[data-patient-slot]').first().click();
  await page.locator('#patient-name').fill(name);
  await page.locator('#patient-phone').fill(phone);
  await fillBirthDate(page, birth);
  await page.locator('#patient-national-id').fill(nationalId);
  await page.locator('#privacy-consent').check();
  await page.locator('#synthetic-confirmation').check();
  await submitBooking(page);
}

/** 打開患者自助改期控制（查詢卡上的時段選單）。 */
export async function openPatientRescheduleControls(page: Page): Promise<void> {
  const identity = {
    name: '改期品質患者',
    phone: '0977000222',
    nationalId: 'M123456789',
    birth: { year: '1984', month: '04', day: '18' }
  };
  await page.goto('/booking');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await createPatientInitialBooking(page, identity);
  await makeLatestBookingSelfCancellable(page);
  await lookupBooking(page, {
    phone: identity.phone,
    birthDate: `${identity.birth.year}-${identity.birth.month}-${identity.birth.day}`
  });
  await expect(page.locator('[data-managed-reschedule-slot]')).toBeVisible();
}
