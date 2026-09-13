import { expect, test, type Page } from '@playwright/test';

import { login, openDisclosure } from './support/workbench';

/** Isolated-test `/v1` is fail-closed on the packed dist server. Tests stub it. */
async function stubV1(
  page: Page,
  occupancy:
    | 'closed'
    | {
        slots: Array<{
          slotId: string;
          kind: string;
          startsAt: string;
          available: boolean;
        }>;
      }
): Promise<void> {
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/slots' && occupancy !== 'closed') {
      await route.fulfill({ json: occupancy });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND' } }
    });
  });
}

async function openPatientSlotStep(page: Page): Promise<void> {
  await page.locator('[data-booking-type="initial"]').click();
  await page.locator('#patient-services [data-service]').first().click();
  await expect(page.locator('[data-booking-step="2"]')).toBeVisible();
}

function upcomingIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

test.describe('internal-test booking occupancy overlay', () => {
  test('default /booking keeps the synthetic grid and never lists /v1/slots', async ({
    page
  }) => {
    let slotListCalls = 0;
    await page.route('**/v1/slots**', async (route) => {
      slotListCalls += 1;
      await route.fulfill({
        status: 404,
        json: { error: { code: 'NOT_FOUND' } }
      });
    });

    await page.goto('/booking');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    await expect(page.locator('#patient-env-boundary')).toHaveText(
      '公開網址持有人可存取 · 資料只保存在本機瀏覽器'
    );
    await openPatientSlotStep(page);
    await expect(page.locator('[data-patient-slot]').first()).toBeVisible();
    expect(slotListCalls).toBe(0);
  });

  test('opt-in with a closed slot list hides the synthetic bookable grid', async ({
    page
  }) => {
    await stubV1(page, 'closed');
    await page.goto('/booking?internalTestBooking=1');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    await expect(page.locator('#patient-env-boundary')).toHaveText(
      '內部測試路由 · 非正式上線'
    );
    await openPatientSlotStep(page);
    await expect(page.getByText('目前沒有可預約時段')).toBeVisible();
    await expect(page.locator('[data-patient-slot]')).toHaveCount(0);
  });

  test('opt-in overlays published occupancy and keeps occupied slots unbookable', async ({
    page
  }) => {
    const openStartsAt = upcomingIso(48);
    const takenStartsAt = upcomingIso(49);
    await stubV1(page, {
      slots: [
        {
          slotId: 'slot_overlay_open',
          kind: 'initial',
          startsAt: openStartsAt,
          available: true
        },
        {
          slotId: 'slot_overlay_taken',
          kind: 'initial',
          startsAt: takenStartsAt,
          available: false
        }
      ]
    });

    await page.goto('/booking?internalTestBooking=1');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await openPatientSlotStep(page);

    await expect(page.locator('[data-patient-slot]')).toHaveCount(1);
    await expect(
      page.locator('[data-patient-slot="slot_overlay_open"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-patient-slot="slot_overlay_taken"]')
    ).toHaveCount(0);
  });

  test('staff opt-in with a closed slot list hides the synthetic bookable grid', async ({
    page
  }) => {
    await stubV1(page, 'closed');
    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await page.goto('/staff?internalTestBooking=1#appointments-section');
    await openDisclosure(page, '#booking-workflow');
    await expect(page.locator('#slots')).toContainText('目前沒有可預約時段');
    await expect(page.locator('#slots [data-select-slot]')).toHaveCount(0);
  });
});
