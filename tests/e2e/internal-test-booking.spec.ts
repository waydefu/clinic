import { expect, test, type Page } from '@playwright/test';

import { fillBirthDate } from './support/patient';
import { login, openDisclosure } from './support/workbench';

type ListedSlot = {
  slotId: string;
  kind: string;
  startsAt: string;
  available: boolean;
};

type CreateStub =
  | 'closed'
  | {
      appointmentId: string;
      status: 'confirmed';
      startsAt: string;
      endsAt: string;
    };

/** Isolated-test `/v1` is fail-closed on the packed dist server. Tests stub it. */
async function stubV1(
  page: Page,
  occupancy: 'closed' | { slots: ListedSlot[] },
  create: CreateStub = 'closed'
): Promise<{ body?: Record<string, unknown> }> {
  const posted: { body?: Record<string, unknown> } = {};
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/v1/slots' && occupancy !== 'closed') {
      await route.fulfill({ json: occupancy });
      return;
    }
    if (path === '/v1/bookings' && method === 'POST') {
      posted.body = route.request().postDataJSON() as Record<string, unknown>;
      if (create === 'closed') {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'SERVICE_UNAVAILABLE' } }
        });
        return;
      }
      await route.fulfill({ status: 201, json: create });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND' } }
    });
  });
  return posted;
}

async function fillPatientCreateForm(page: Page): Promise<void> {
  await page.locator('#patient-name').fill('測試患者甲');
  await page.locator('#patient-phone').fill('0912345678');
  await fillBirthDate(page, { year: '1990', month: '05', day: '20' });
  await page.locator('#patient-national-id').fill('A123456789');
  await page.locator('#privacy-consent').check();
  await page.locator('#synthetic-confirmation').check();
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
    await page.evaluate(() => {
      window.location.hash = 'appointments-section';
    });
    await openDisclosure(page, '#booking-workflow');
    await expect(page.locator('#slots')).toContainText('目前沒有可預約時段');
    await expect(page.locator('#slots [data-select-slot]')).toHaveCount(0);
  });

  test('opt-in create posts /v1/bookings without patient fields', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const endsAt = upcomingIso(48.5);
    const posted = await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_overlay_open',
            kind: 'initial',
            startsAt,
            available: true
          }
        ]
      },
      {
        appointmentId: 'appointment_api_001',
        status: 'confirmed',
        startsAt,
        endsAt
      }
    );

    await page.goto('/booking?internalTestBooking=1');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await openPatientSlotStep(page);
    await page.locator('[data-patient-slot="slot_overlay_open"]').click();
    await fillPatientCreateForm(page);
    await page.locator('#confirm-patient-booking').click();

    await expect(page.locator('#booking-result')).toContainText(
      'appointment_api_001'
    );
    expect(posted.body).toMatchObject({
      slotId: 'slot_overlay_open',
      serviceId: expect.any(String),
      bookingKind: 'initial'
    });
    expect(posted.body).not.toHaveProperty('patient');
    expect(posted.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
  });

  test('opt-in create does not keep a local booking when /v1/bookings is closed', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_overlay_open',
            kind: 'initial',
            startsAt,
            available: true
          }
        ]
      },
      'closed'
    );

    await page.goto('/booking?internalTestBooking=1');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await openPatientSlotStep(page);
    await page.locator('[data-patient-slot="slot_overlay_open"]').click();
    await fillPatientCreateForm(page);
    await page.locator('#confirm-patient-booking').click();

    await expect(page.locator('#patient-submit-status')).toContainText(
      '未送出預約'
    );
    await expect(page.locator('#booking-result')).not.toContainText(
      'appointment_'
    );
    await expect(page.locator('[data-booking-step="3"]')).toBeVisible();
  });
});
