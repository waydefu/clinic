import { expect, test, type Page } from '@playwright/test';

import { fillBirthDate } from './support/patient';
import { login, openDisclosure } from './support/workbench';

type ListedSlot = {
  slotId: string;
  kind: string;
  startsAt: string;
  available: boolean;
};

type ContractBooking = {
  appointmentId: string;
  status: 'confirmed' | 'cancelled';
  startsAt: string;
  endsAt?: string;
};

type CreateStub = 'closed' | ContractBooking;
type MutationStub = 'closed' | ContractBooking;

type CapturedPost = {
  path?: string;
  body?: Record<string, unknown>;
};

/** Isolated-test `/v1` is fail-closed on the packed dist server. Tests stub it. */
async function stubV1(
  page: Page,
  occupancy: 'closed' | { slots: ListedSlot[] },
  create: CreateStub = 'closed',
  mutations: { cancel?: MutationStub; reschedule?: MutationStub } = {}
): Promise<{
  body?: Record<string, unknown>;
  cancel: CapturedPost;
  reschedule: CapturedPost;
}> {
  const posted: {
    body?: Record<string, unknown>;
    cancel: CapturedPost;
    reschedule: CapturedPost;
  } = { cancel: {}, reschedule: {} };
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
    const cancel = /^\/v1\/bookings\/([^/]+)\/cancel$/.exec(path);
    if (
      method === 'POST' &&
      cancel !== null &&
      mutations.cancel !== undefined
    ) {
      posted.cancel = {
        path,
        body: route.request().postDataJSON() as Record<string, unknown>
      };
      if (mutations.cancel === 'closed') {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'SERVICE_UNAVAILABLE' } }
        });
        return;
      }
      await route.fulfill({ status: 200, json: mutations.cancel });
      return;
    }
    const reschedule = /^\/v1\/bookings\/([^/]+)\/reschedule$/.exec(path);
    if (
      method === 'POST' &&
      reschedule !== null &&
      mutations.reschedule !== undefined
    ) {
      posted.reschedule = {
        path,
        body: route.request().postDataJSON() as Record<string, unknown>
      };
      if (mutations.reschedule === 'closed') {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'SERVICE_UNAVAILABLE' } }
        });
        return;
      }
      await route.fulfill({ status: 200, json: mutations.reschedule });
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

async function createOptInBooking(
  page: Page,
  slotId: string,
  appointmentId: string
): Promise<void> {
  await page.goto('/booking?internalTestBooking=1');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await openPatientSlotStep(page);
  await page.locator(`[data-patient-slot="${slotId}"]`).click();
  await fillPatientCreateForm(page);
  await page.locator('#confirm-patient-booking').click();
  await expect(page.locator('#booking-result')).toContainText(appointmentId);
}

async function openCreatedBookingManagement(page: Page): Promise<void> {
  await page.locator('#booking-result-manage').click();
  await expect(page.locator('#booking-management-dialog')).toBeVisible();
  await expect(page.locator('.booking-lookup-card')).toBeVisible();
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

  test('opt-in cancel posts /v1/bookings/:id/cancel without patient fields', async ({
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
      },
      {
        cancel: {
          appointmentId: 'appointment_api_001',
          status: 'cancelled',
          startsAt,
          endsAt
        }
      }
    );

    await createOptInBooking(page, 'slot_overlay_open', 'appointment_api_001');
    await openCreatedBookingManagement(page);
    await page.locator('[data-managed-cancel]').click();
    await page.getByRole('button', { name: '確認取消' }).click();

    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '預約已取消'
    );
    expect(posted.cancel.path).toBe('/v1/bookings/appointment_api_001/cancel');
    expect(posted.cancel.body).not.toHaveProperty('patient');
    expect(posted.cancel.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
  });

  test('opt-in cancel after the day-10:00 cutoff stays local and asks to call', async ({
    page
  }) => {
    const bookableStartsAt = upcomingIso(48);
    const posted = await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_overlay_open',
            kind: 'initial',
            startsAt: bookableStartsAt,
            available: true
          }
        ]
      },
      {
        appointmentId: 'appointment_api_cutoff',
        status: 'confirmed',
        startsAt: '2020-01-02T04:00:00.000Z',
        endsAt: '2020-01-02T04:30:00.000Z'
      },
      {
        cancel: 'closed'
      }
    );

    await createOptInBooking(
      page,
      'slot_overlay_open',
      'appointment_api_cutoff'
    );
    await openCreatedBookingManagement(page);

    await expect(page.locator('[data-managed-cancel]')).toHaveCount(0);
    await expect(page.locator('#booking-management-dialog')).toContainText(
      '預約當日 10:00 後如需取消或更改，建議直接來電診所。'
    );
    await expect(page.locator('.booking-phone-fallback')).toContainText(
      '02-2577-1314'
    );
    expect(posted.cancel.path).toBeUndefined();
  });

  test('opt-in cancel does not succeed locally when /v1 cancel is closed', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
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
        endsAt: upcomingIso(48.5)
      },
      { cancel: 'closed' }
    );

    await createOptInBooking(page, 'slot_overlay_open', 'appointment_api_001');
    await openCreatedBookingManagement(page);
    await page.locator('[data-managed-cancel]').click();
    await page.getByRole('button', { name: '確認取消' }).click();

    await expect(page.locator('#booking-lookup-status')).toContainText(
      '此預約無法線上取消，請來電 02-2577-1314。'
    );
    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '預約已建立'
    );
    expect(posted.cancel.path).toBe('/v1/bookings/appointment_api_001/cancel');
  });

  test('opt-in reschedule posts /v1/bookings/:id/reschedule without patient fields', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const altStartsAt = upcomingIso(72);
    const posted = await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_overlay_open',
            kind: 'initial',
            startsAt,
            available: true
          },
          {
            slotId: 'slot_overlay_alt',
            kind: 'initial',
            startsAt: altStartsAt,
            available: true
          }
        ]
      },
      {
        appointmentId: 'appointment_api_001',
        status: 'confirmed',
        startsAt,
        endsAt: upcomingIso(48.5)
      },
      {
        reschedule: {
          appointmentId: 'appointment_api_001',
          status: 'confirmed',
          startsAt: altStartsAt,
          endsAt: upcomingIso(72.5)
        }
      }
    );

    await createOptInBooking(page, 'slot_overlay_open', 'appointment_api_001');
    await openCreatedBookingManagement(page);
    await page
      .locator('[data-managed-reschedule-slot="appointment_api_001"]')
      .selectOption('slot_overlay_alt');
    await page.locator('[data-managed-reschedule]').click();
    await page.getByRole('button', { name: '確認改期' }).click();

    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '預約已改期'
    );
    expect(posted.reschedule.path).toBe(
      '/v1/bookings/appointment_api_001/reschedule'
    );
    expect(posted.reschedule.body).toMatchObject({
      targetSlotId: 'slot_overlay_alt'
    });
    expect(posted.reschedule.body).not.toHaveProperty('patient');
    expect(posted.reschedule.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
  });
});
