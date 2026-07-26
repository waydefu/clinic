import { expect, type Page } from '@playwright/test';

/**
 * 工作臺 E2E 的共用操作。
 *
 * 為什麼要集中：登入這件事先前在四份 spec 裡各寫了一次，而且四份對「登入完成」
 * 的判斷**互相不同**——有的等 `#logout` 可見、有的等 `#login-view` 隱藏、有的等
 * `#workspace-title` 可見。那不只是重複：`#logout` 收在手機寬度會摺疊起來的工作臺
 * 設定裡，所以用它當訊號的那一份在行動版視窗下必定逾時（2026-07-26 實際踩到）。
 *
 * 收斂成一種語意：**登入閘門消失**就是登入完成。它與視窗寬度無關，也不依賴任何
 * 只在某個斷點才可見的控制項。
 */

export type WorkbenchRole = 'admin' | 'front';

const PASSWORDS: Record<WorkbenchRole, string> = {
  admin: 'beauessence-admin',
  front: 'beauessence-front'
};

/**
 * 以指定角色登入。
 *
 * `fresh` 會先清掉 localStorage 再重載：合成狀態存在瀏覽器裡，跨測試殘留會讓
 * 斷言依賴執行順序。需要延續前一步狀態的測試才傳 false。
 */
export async function login(
  page: Page,
  role: WorkbenchRole = 'admin',
  { fresh = true }: { fresh?: boolean } = {}
): Promise<void> {
  await page.goto('/');
  if (fresh) {
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  }
  await page.locator('#login-account').fill(role);
  await page.locator('#login-password').fill(PASSWORDS[role]);
  await page.locator('#login-view button[type="submit"]').click();
  await expect(page.locator('#login-view')).toBeHidden();
}

/**
 * 建立一筆預約，走與操作者相同的表單流程。
 *
 * 等的是「預約已建立」這句真的出現，而不是表單狀態列現身。成功處理器會在收尾時
 * 把建立表單的 <details> 關起來，那一步在送出之後的非同步流程裡；太早返回的話，
 * 下一次呼叫會先展開表單、填到一半才被前一筆的收尾關掉——症狀是欄位突然
 * 「不可見」。
 */
export async function createBooking(
  page: Page,
  {
    name = '測試患者甲',
    phone = '0912345678',
    nationalId = 'A123456789',
    birth = '1990-05-20'
  }: {
    name?: string;
    phone?: string;
    nationalId?: string;
    birth?: string;
  } = {}
): Promise<void> {
  await page.goto('/#appointments-section');
  await openDisclosure(page, '#booking-workflow');
  await page.locator('#booking-name').fill(name);
  await page.locator('#booking-phone').fill(phone);
  await page.locator('#booking-birth').fill(birth);
  await page.locator('#booking-national-id').fill(nationalId);
  await page.locator('#booking-kind').selectOption('initial');
  await page.locator('#slots [data-select-slot]').first().click();
  await page.locator('#booking-form button[type="submit"]').click();
  await expect(page.locator('#status')).toContainText('預約已建立');
}

/** 展開一個 <details>。工作臺把多數工作區收在裡面，測試要先打開才看得到內容。 */
export async function openDisclosure(
  page: Page,
  selector: string
): Promise<void> {
  await page.locator(selector).evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
}

/** 合成資料是 2030 年，預設的「當日」篩選看不到；切到「全部狀態」才會列出。 */
export async function showAllAppointments(page: Page): Promise<void> {
  await page.locator('#appointment-status-filter').selectOption('all');
}
