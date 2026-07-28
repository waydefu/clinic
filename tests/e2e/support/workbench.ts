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
  // 療程自 2026-07-27 起是可複選（W5），而且**至少要一項**。先前是 `<select>`，
  // 永遠有一個預設值，所以這個 helper 從來不必碰它。
  await page.locator('#booking-items [data-booking-item]').first().check();
  await page.locator('#slots [data-select-slot]').first().click();
  await page.locator('#booking-form button[type="submit"]').click();
  await expect(page.locator('#status')).toContainText('預約已建立');
}

/** 合成狀態在瀏覽器裡的鍵。改版時 state-schema.js 與這裡要一起改。 */
export const STORAGE_KEY = 'beauessence_synthetic_online_preview_v7';

/**
 * 換一個角色登入，**保留目前的合成狀態**。
 *
 * 直接把 `authenticated` 設回 false 再重載，而不是按 `#logout`：登出按鈕在窄
 * 視窗下會被摺進工作臺設定裡，用它當步驟會讓測試在某些斷點下無故逾時（登入
 * 訊號當初就是為此收斂的）。換角色是**測試的前置動作**、不是被驗證的行為，
 * 所以取最不易碎的做法；登出本身另有測試。
 */
export async function switchRole(
  page: Page,
  role: WorkbenchRole
): Promise<void> {
  await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return;
    const state = JSON.parse(raw);
    state.workspace.authenticated = false;
    window.localStorage.setItem(key, JSON.stringify(state));
  }, STORAGE_KEY);
  await page.reload();
  await login(page, role, { fresh: false });
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

/**
 * 切到「全部狀態」。
 *
 * `createBooking` 選的是第一個可預約時段，而診所週日至週二休診——所以那一筆
 * 多半不落在今天，預設的「當日」篩選看不到它。（2026-07-27 之前的理由是合成
 * 資料固定在 2030 年；視窗改成從今天起算之後，理由換了，結論一樣。）
 */
export async function showAllAppointments(page: Page): Promise<void> {
  await page.locator('#appointment-status-filter').selectOption('all');
}
