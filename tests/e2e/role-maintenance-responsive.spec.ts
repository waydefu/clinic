import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, role: 'admin' | 'front'): Promise<void> {
  await page.goto('/');
  await page.locator('#login-account').fill(role);
  await page
    .locator('#login-password')
    .fill(role === 'admin' ? 'beauessence-admin' : 'beauessence-front');
  await page.locator('#login-submit').click();
  await expect(page.locator('#login-view')).toBeHidden();
}

async function resetBrowserState(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function callSyntheticStore<T>(
  page: Page,
  path: string,
  options?: { method?: string; body?: string }
): Promise<T> {
  return page.evaluate(
    async ({ requestPath, requestOptions }) => {
      const storeUrl = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/store\.[a-f0-9]+\.js$/.test(name));
      if (storeUrl === undefined)
        throw new Error('找不到打包後的 synthetic store module。');
      const { stagingRequest } = await import(storeUrl);
      return stagingRequest(requestPath, requestOptions);
    },
    { requestPath: path, requestOptions: options }
  );
}

async function createCompletedVisit(page: Page): Promise<string> {
  await page.goto('/#appointments-section');
  await page.locator('#booking-workflow').evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
  await page.locator('#booking-name').fill('測試患者甲');
  await page.locator('#booking-phone').fill('0912345678');
  await page.locator('#booking-birth').fill('1990-05-20');
  await page.locator('#booking-national-id').fill('A123456789');
  await page.locator('#slots [data-select-slot]').first().click();
  await page.locator('#booking-form button[type="submit"]').click();
  await expect(page.locator('#status')).toContainText('預約已建立');
  await page.locator('#appointment-status-filter').selectOption('all');
  const row = page.locator('[data-appointment-card]').first();
  const id = await row.getAttribute('data-appointment-card');
  await row.locator('[data-appointment-action="complete"]').click();
  await page.locator('.confirm-dialog button.button-primary').click();
  await expect(page.locator('#status')).toContainText('到診已記錄');
  if (id === null) throw new Error('預約缺少 synthetic id。');
  return id;
}

test.describe('角色邊界', () => {
  test.beforeEach(async ({ page }) => {
    await resetBrowserState(page);
  });

  test('櫃台的受限導覽與治理資料不留在文件 DOM', async ({ page }) => {
    await login(page, 'front');

    await expect(page.locator('[data-admin-nav]')).toHaveCount(0);
    await expect(page.locator('[data-admin-only]')).toHaveCount(0);
    await expect(page.locator('#audit-section')).toHaveCount(0);
    await expect(page.locator('#reset-state')).toHaveCount(0);
  });

  test('櫃台輸入管理區 hash 會導回首頁並取得拒絕訊息焦點', async ({ page }) => {
    await login(page, 'front');
    await page.goto('/#accounts-section');

    await expect(page).toHaveURL(/#overview$/);
    await expect(page.locator('#status')).toContainText('沒有權限');
    expect(await page.evaluate(() => document.activeElement?.id)).toMatch(
      /^(status|overview-heading)$/
    );
  });

  test('櫃台直接呼叫重設動作仍會被拒絕', async ({ page }) => {
    await login(page, 'front');

    const result = await callSyntheticStore<string>(page, '/reset', {
      method: 'POST',
      body: '{}'
    }).then(
      () => 'allowed',
      (error: unknown) => (error instanceof Error ? error.message : 'denied')
    );

    expect(result).toContain('權限');
  });

  test('櫃台可登錄回診與首次指派，但不能改派', async ({ page }) => {
    await login(page, 'admin');
    const appointmentId = await createCompletedVisit(page);
    await page.locator('#logout').click();
    await expect(page.locator('#login-view')).toBeVisible();
    await login(page, 'front');

    await page.goto('/#appointments-section');
    const followUp = page.locator(`[data-follow-up-form="${appointmentId}"]`);
    await expect(followUp).toBeVisible();
    await followUp.locator('button[type="submit"]').click();
    await expect(page.locator('#status')).toContainText('回診指示已登錄');

    await page.goto('/#case-section');
    const row = page.locator(`[data-case-row="${appointmentId}"]`);
    await expect(row.locator('[data-case-form]')).toBeVisible();
    await row.locator('button[type="submit"]').click();
    await expect(row.locator('.status-chip')).toHaveText('已指派');
    await expect(row).toContainText('改派限主管');

    const result = await callSyntheticStore<string>(page, '/case-assignments', {
      method: 'POST',
      body: JSON.stringify({
        appointmentId,
        managerId: 'manager_test_002'
      })
    }).then(
      () => 'allowed',
      (error: unknown) => (error instanceof Error ? error.message : 'denied')
    );
    expect(result).toContain('權限');
  });
});

test.describe('行動版 header 與重排', () => {
  test.beforeEach(async ({ page }) => {
    await resetBrowserState(page);
  });

  test('390px 的品牌、通知與選單在同一列', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'admin');

    const positions = await page.evaluate(() => {
      const brand = document.querySelector('.brand')?.getBoundingClientRect();
      const bell = document.querySelector('#nav-bell')?.getBoundingClientRect();
      const menu = document
        .querySelector('.topbar-tools > summary')
        ?.getBoundingClientRect();
      return {
        brand: brand?.top,
        bell: bell?.top,
        menu: menu?.top
      };
    });

    expect(positions.brand).toBeDefined();
    expect(
      Math.abs((positions.brand ?? 0) - (positions.bell ?? 999))
    ).toBeLessThan(12);
    expect(
      Math.abs((positions.brand ?? 0) - (positions.menu ?? 999))
    ).toBeLessThan(12);
  });

  test('320px、200% 文字仍沒有頁面水平捲動', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await login(page, 'admin');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });

    const overflow = await page.evaluate(() => ({
      amount:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: element.className,
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          };
        })
        .filter(
          ({ right, width }) =>
            width > 0 &&
            (right > document.documentElement.clientWidth + 1 ||
              width > document.documentElement.clientWidth + 1)
        )
        .slice(0, 10)
    }));
    expect(
      overflow.amount,
      JSON.stringify(overflow.offenders)
    ).toBeLessThanOrEqual(1);
  });

  test('通知 popover 不撐高 header，Esc 關閉並把焦點還給鈴鐺', async ({
    page
  }) => {
    await login(page, 'admin');
    await page.goto('/#appointments-section');
    await page.locator('#booking-workflow').evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await page.locator('#booking-name').fill('通知測試患者');
    await page.locator('#booking-phone').fill('0912345678');
    await page.locator('#booking-birth').fill('1990-05-20');
    await page.locator('#booking-national-id').fill('A123456789');
    await page.locator('#slots [data-select-slot]').first().click();
    await page.locator('#booking-form button[type="submit"]').click();
    await expect(page.locator('#status')).toContainText('預約已建立');
    const state = await callSyntheticStore<{
      appointments: Array<{ id: string }>;
    }>(page, '/state');
    await callSyntheticStore(
      page,
      `/bookings/${state.appointments[0].id}/cancellation`,
      {
        method: 'POST',
        body: JSON.stringify({ origin: 'patient' })
      }
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const bell = page.locator('#nav-bell');
    await expect(bell).toHaveAttribute('aria-label', '通知，1 筆未讀');
    const before = await page
      .locator('.topbar')
      .evaluate((element) => element.getBoundingClientRect().height);
    await bell.click();
    await expect(bell).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#notification-popover')).toBeVisible();
    await expect(page.locator('#notification-list')).not.toHaveAttribute(
      'aria-live',
      /.*/
    );
    const after = await page
      .locator('.topbar')
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(Math.round(after)).toBe(Math.round(before));

    await page.keyboard.press('Escape');
    await expect(page.locator('#notification-popover')).toBeHidden();
    await expect(bell).toHaveAttribute('aria-expanded', 'false');
    await expect(bell).toBeFocused();
  });

  test('常見手機直向與橫向都不產生頁面水平捲動', async ({ page }) => {
    await login(page, 'admin');
    const sizes = [
      { width: 320, height: 568 },
      { width: 360, height: 800 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 568, height: 320 },
      { width: 800, height: 360 },
      { width: 812, height: 375 },
      { width: 844, height: 390 },
      { width: 932, height: 430 }
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(
        overflow,
        `${size.width}x${size.height} 不應有頁面水平捲動`
      ).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('患者端維護隔離', () => {
  test.beforeEach(async ({ page }) => {
    await resetBrowserState(page);
    await login(page, 'admin');
    await callSyntheticStore(page, '/workspace/maintenance', {
      method: 'POST',
      body: JSON.stringify({
        enabled: true,
        title: '預約系統維護中',
        body: '請稍後再回來。',
        startsAt: '',
        resumeAt: ''
      })
    });
    await page.goto('/patient.html');
  });

  test('維護啟用時工作流程 inert，焦點在維護標題', async ({ page }) => {
    await expect(page.locator('#patient-maintenance')).toBeVisible();
    await expect(page.locator('#patient-booking-app')).toHaveAttribute(
      'inert',
      ''
    );
    await expect(page.locator('#maintenance-page-title')).toBeFocused();
  });

  test('繞過畫面直接送出患者預約仍會被維護閘門拒絕', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const storeUrl = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /\/store\.[a-f0-9]+\.js$/.test(name));
      if (storeUrl === undefined)
        throw new Error('找不到打包後的 synthetic store module。');
      const { stagingRequest } = await import(storeUrl);
      const state = await stagingRequest('/state');
      const slot = state.slots.find(
        (item) => item.reservationId === undefined && item.kind === 'initial'
      );
      try {
        await stagingRequest('/bookings', {
          method: 'POST',
          body: JSON.stringify({
            slotId: slot.id,
            bookingKind: 'initial',
            itemId: 'service_snoring',
            origin: 'patient',
            patient: {
              name: '合成患者',
              phone: '0912345678',
              birthDate: '1990-05-20',
              nationalId: 'A123456789',
              hasNhiCard: false
            }
          })
        });
        return 'allowed';
      } catch (error) {
        return error instanceof Error ? error.message : 'denied';
      }
    });

    expect(result).toContain('維護');
  });
});

test.describe('患者端行動版', () => {
  test('四步驟只標一個目前步驟，裝飾數字不重複報讀', async ({ page }) => {
    await resetBrowserState(page);
    await page.goto('/patient.html');
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();

    await expect(
      page.locator('[data-step-indicator][aria-current="step"]')
    ).toHaveCount(1);
    await expect(page.locator('[data-step-indicator] > span')).toHaveCount(4);
    for (const number of await page
      .locator('[data-step-indicator] > span')
      .all())
      await expect(number).toHaveAttribute('aria-hidden', 'true');
  });

  test('常見手機直向與橫向都可重排', async ({ page }) => {
    await resetBrowserState(page);
    await page.goto('/patient.html');
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();
    const sizes = [
      { width: 320, height: 568 },
      { width: 360, height: 800 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 568, height: 320 },
      { width: 800, height: 360 },
      { width: 812, height: 375 },
      { width: 844, height: 390 },
      { width: 932, height: 430 }
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(
        overflow,
        `${size.width}x${size.height} 不應有頁面水平捲動`
      ).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('介面術語', () => {
  test('工作臺不再顯示舊稱', async ({ page }) => {
    await resetBrowserState(page);
    await login(page, 'admin');
    const visibleCopy = await page.evaluate(() => document.body.textContent);

    for (const obsolete of [
      '排班',
      '管理者',
      '個案管理師',
      '手術種類',
      '已帶健保卡',
      '逐筆回診確認',
      '記錄回診決定'
    ])
      expect(visibleCopy).not.toContain(obsolete);
  });
});
