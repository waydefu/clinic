import { expect, test, type Page } from '@playwright/test';

import {
  createBooking,
  login,
  showAllAppointments,
  STORAGE_KEY,
  switchRole
} from './support/workbench';

// 刪除預約委派給櫃台（2026-07-27 負責人方向）。這支測試釘住的是**邊界**：
// 預設關閉、開啟後仍要授權碼、停用單一組要立刻失效，而且繞過畫面直接送出
// 一樣會被擋——「隱藏按鈕」從來不是授權。

async function addAuthorization(page: Page, label: string, secret: string) {
  await page.goto('/#accounts-section');
  await page.locator('#delegation-label').fill(label);
  await page.locator('#delegation-secret').fill(secret);
  await page.locator('#delegation-form button[type="submit"]').click();
  await expect(page.locator('#delegation-form-status')).toContainText(label);
}

async function confirmDialogPrimary(page: Page) {
  await page.locator('.confirm-dialog-actions .button-primary').click();
}

async function enableDelegation(page: Page) {
  await page.locator('[data-delegation-toggle]').click();
  await confirmDialogPrimary(page);
  await expect(page.locator('[data-delegation-toggle]')).toHaveText('關閉委派');
}

/**
 * 打開刪除確認彈窗。
 *
 * 刪除藏在每一列的「更多處置」<details> 裡（只有一個可用處置時才會被攤平成
 * 按鈕），所以要先把選單展開，否則按鈕存在卻不可見。
 */
async function openDeleteDialog(page: Page) {
  await page.goto('/#appointments-section');
  await showAllAppointments(page);
  const menu = page.locator('details.action-menu').first();
  if ((await menu.count()) > 0)
    await menu.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
  await page.locator('[data-appointment-action="delete"]').first().click();
}

test.describe('刪除預約的委派授權', () => {
  test('預設是關的，而且一組授權碼都沒有', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/#accounts-section');
    await expect(page.locator('[data-delegation-toggle]')).toHaveText(
      '開啟委派'
    );
    await expect(page.locator('[data-authorization-row]')).toHaveCount(0);
  });

  test('櫃台在委派關閉時看不到刪除入口', async ({ page }) => {
    await login(page, 'admin');
    await createBooking(page, { name: '委派測試甲' });
    await switchRole(page, 'front');
    await page.goto('/#appointments-section');
    await showAllAppointments(page);
    await expect(
      page.locator('[data-appointment-action="delete"]')
    ).toHaveCount(0);
  });

  test('管理者自己刪除不需要授權碼', async ({ page }) => {
    await login(page, 'admin');
    await createBooking(page, { name: '委派測試乙' });
    await openDeleteDialog(page);
    // 管理者天生有權限，彈窗不該出現授權碼欄位。
    await expect(page.locator('.confirm-dialog-secret input')).toBeHidden();
    await page.locator('.confirm-dialog-actions .button-danger').click();
    await expect(page.locator('#status')).toContainText('已刪除');
  });

  test('開啟委派後，櫃台要輸入授權碼；用錯的不會通過', async ({ page }) => {
    await login(page, 'admin');
    await addAuthorization(page, '早班櫃台', 'morning-key');
    await enableDelegation(page);
    await createBooking(page, { name: '委派測試丙' });

    await switchRole(page, 'front');
    await openDeleteDialog(page);
    const secret = page.locator('.confirm-dialog-secret input');
    await expect(secret).toBeVisible();

    await secret.fill('wrong-key');
    await page.locator('.confirm-dialog-actions .button-danger').click();
    await expect(page.locator('#status')).toContainText('授權碼不正確');
    // 沒刪成，紀錄必須還在。
    await expect(
      page.locator('[data-appointment-action="delete"]')
    ).not.toHaveCount(0);

    await openDeleteDialog(page);
    await page.locator('.confirm-dialog-secret input').fill('morning-key');
    await page.locator('.confirm-dialog-actions .button-danger').click();
    await expect(page.locator('#status')).toContainText('已刪除');
  });

  test('稽核留下用了哪一組授權碼，但不留授權碼本身', async ({ page }) => {
    await login(page, 'admin');
    await addAuthorization(page, '早班櫃台', 'morning-key');
    await enableDelegation(page);
    await createBooking(page, { name: '委派測試丁' });

    await switchRole(page, 'front');
    await openDeleteDialog(page);
    await page.locator('.confirm-dialog-secret input').fill('morning-key');
    await page.locator('.confirm-dialog-actions .button-danger').click();
    await expect(page.locator('#status')).toContainText('已刪除');

    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      STORAGE_KEY
    );
    expect(stored).not.toBeNull();
    const events = JSON.parse(stored ?? '{}').auditEvents as {
      action: string;
      authorizationLabel?: string;
    }[];
    const deletion = events.find(
      (event) => event.action === 'appointment_deleted'
    );
    expect(deletion?.authorizationLabel).toBe('早班櫃台');
    // 授權碼本身絕不可出現在稽核事件裡（稽核會被匯出、列印、轉寄）。
    expect(JSON.stringify(events)).not.toContain('morning-key');
  });

  test('停用那一組之後，櫃台的入口立刻消失', async ({ page }) => {
    await login(page, 'admin');
    await addAuthorization(page, '早班櫃台', 'morning-key');
    await enableDelegation(page);
    await page.locator('[data-authorization-toggle]').click();
    await confirmDialogPrimary(page);
    await expect(page.locator('[data-authorization-toggle]')).toHaveText(
      '啟用'
    );
    await createBooking(page, { name: '委派測試戊' });

    await switchRole(page, 'front');
    await page.goto('/#appointments-section');
    await showAllAppointments(page);
    // 委派雖然開著，但沒有任何啟用中的授權碼，入口就不該出現。
    await expect(
      page.locator('[data-appointment-action="delete"]')
    ).toHaveCount(0);
  });

  // 最重要的一條：介面只是介面。
  //
  // 委派**關閉**時櫃台看不到刪除入口——但「看不到」不是授權。這裡把入口自己
  // 塞回 DOM 再按下去，模擬任何人在瀏覽器裡做得到的事，驗證擋下來的是 store
  // 而不是那顆按鈕存不存在。
  test('把刪除按鈕塞回畫面也沒有用，擋下來的是 store 不是按鈕', async ({
    page
  }) => {
    await login(page, 'admin');
    await createBooking(page, { name: '委派測試己' });

    await switchRole(page, 'front');
    await page.goto('/#appointments-section');
    await showAllAppointments(page);
    await expect(
      page.locator('[data-appointment-action="delete"]')
    ).toHaveCount(0);

    const injected = await page.evaluate(() => {
      // 任何一顆既有的處置按鈕都帶著預約 id，拿它來組一顆「刪除」。
      const existing = document.querySelector('[data-appointment-id]');
      const id = existing?.getAttribute('data-appointment-id');
      if (id === null || id === undefined) return false;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.appointmentAction = 'delete';
      button.dataset.appointmentId = id;
      button.id = 'injected-delete';
      button.textContent = '刪除';
      existing?.parentElement?.append(button);
      return true;
    });
    expect(injected).toBe(true);

    await page.locator('#injected-delete').click();
    await page.locator('.confirm-dialog-actions .button-danger').click();
    await expect(page.locator('#status')).toContainText('沒有執行此動作的權限');
  });
});
