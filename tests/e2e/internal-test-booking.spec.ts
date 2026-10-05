import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { chooseNationality, fillBirthDate } from './support/patient';
import {
  login,
  openDisclosure,
  showAllAppointments
} from './support/workbench';

type ListedSlot = {
  slotId: string;
  kind: string;
  startsAt: string;
  available: boolean;
};

type ContractBooking = {
  appointmentId: string;
  status: 'confirmed' | 'arrived' | 'cancelled' | 'completed' | 'no_show';
  startsAt: string;
  endsAt?: string;
  bookingKind?: 'initial' | 'follow_up';
  slotId?: string;
  patientId?: string;
  patientNote?: string;
};

type CreateStub = 'closed' | ContractBooking;
type MutationStub =
  | 'closed'
  | ContractBooking
  | {
      appointmentId: string;
      decision: 'required' | 'not_required';
      dueAt: string | null;
    }
  | {
      appointmentId: string;
      deleted: true;
      auditEventId: string;
    };
type MutationKind =
  | 'cancel'
  | 'reschedule'
  | 'arrive'
  | 'complete'
  | 'noShow'
  | 'followUp'
  | 'delete';

type CapturedPost = {
  path?: string;
  body?: Record<string, unknown>;
};

type PublishStub =
  | 'closed'
  | {
      publishedVersion: number;
      publishedAt: string;
      schedule: Record<string, unknown>;
    };

type ReturnLookupStub = {
  outcome: 'schedule';
  sessionId: string;
};

const MUTATION_ROUTES: Array<{ kind: MutationKind; pattern: RegExp }> = [
  { kind: 'cancel', pattern: /^\/v1\/bookings\/[^/]+\/cancel$/ },
  { kind: 'reschedule', pattern: /^\/v1\/bookings\/[^/]+\/reschedule$/ },
  { kind: 'arrive', pattern: /^\/v1\/bookings\/[^/]+\/arrive$/ },
  { kind: 'complete', pattern: /^\/v1\/bookings\/[^/]+\/complete$/ },
  { kind: 'noShow', pattern: /^\/v1\/bookings\/[^/]+\/no-show$/ },
  { kind: 'followUp', pattern: /^\/v1\/bookings\/[^/]+\/follow-up$/ },
  { kind: 'delete', pattern: /^\/v1\/bookings\/[^/]+\/delete$/ }
];

/** Isolated-test `/v1` is fail-closed on the packed dist server. Tests stub it. */
async function stubV1(
  page: Page,
  occupancy: 'closed' | { slots: ListedSlot[] },
  create: CreateStub = 'closed',
  mutations: Partial<Record<MutationKind, MutationStub>> = {},
  extras: {
    getBooking?: ContractBooking;
    /** Staff clinic list (`GET /v1/bookings`); a function so a test can echo what was posted. */
    listBookings?: () => ContractBooking[];
    publish?: PublishStub;
    returnLookup?: ReturnLookupStub;
  } = {}
): Promise<{
  body?: Record<string, unknown>;
  createHeaders?: Record<string, string>;
  arrive: CapturedPost;
  cancel: CapturedPost;
  reschedule: CapturedPost;
  complete: CapturedPost;
  noShow: CapturedPost;
  followUp: CapturedPost;
  delete: CapturedPost;
  query: CapturedPost;
  publish: CapturedPost;
  returnLookup: CapturedPost;
}> {
  const posted: {
    body?: Record<string, unknown>;
    createHeaders?: Record<string, string>;
    arrive: CapturedPost;
    cancel: CapturedPost;
    reschedule: CapturedPost;
    complete: CapturedPost;
    noShow: CapturedPost;
    followUp: CapturedPost;
    delete: CapturedPost;
    query: CapturedPost;
    publish: CapturedPost;
    returnLookup: CapturedPost;
  } = {
    arrive: {},
    cancel: {},
    reschedule: {},
    complete: {},
    noShow: {},
    followUp: {},
    delete: {},
    query: {},
    publish: {},
    returnLookup: {}
  };
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/v1/slots' && occupancy !== 'closed') {
      await route.fulfill({ json: occupancy });
      return;
    }
    if (path === '/v1/bookings' && method === 'POST') {
      posted.body = route.request().postDataJSON() as Record<string, unknown>;
      posted.createHeaders = route.request().headers();
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
    if (
      path === '/v1/return-lookup' &&
      method === 'POST' &&
      extras.returnLookup !== undefined
    ) {
      posted.returnLookup = {
        path,
        body: route.request().postDataJSON() as Record<string, unknown>
      };
      await route.fulfill({ status: 200, json: extras.returnLookup });
      return;
    }
    if (method === 'POST') {
      const matched = MUTATION_ROUTES.find(
        (spec) => spec.pattern.test(path) && mutations[spec.kind] !== undefined
      );
      if (matched !== undefined) {
        posted[matched.kind] = {
          path,
          body: route.request().postDataJSON() as Record<string, unknown>
        };
        const stub = mutations[matched.kind];
        if (stub === 'closed') {
          await route.fulfill({
            status: 503,
            json: { error: { code: 'SERVICE_UNAVAILABLE' } }
          });
          return;
        }
        await route.fulfill({ status: 200, json: stub });
        return;
      }
    }
    if (
      path === '/v1/bookings' &&
      method === 'GET' &&
      extras.listBookings !== undefined
    ) {
      await route.fulfill({ json: { appointments: extras.listBookings() } });
      return;
    }
    const query = /^\/v1\/bookings\/[^/]+$/.exec(path);
    if (method === 'GET' && query !== null && extras.getBooking !== undefined) {
      posted.query = { path };
      await route.fulfill({ json: extras.getBooking });
      return;
    }
    if (
      path === '/v1/schedule/publish' &&
      method === 'POST' &&
      extras.publish !== undefined
    ) {
      posted.publish = {
        path,
        body: route.request().postDataJSON() as Record<string, unknown>
      };
      if (extras.publish === 'closed') {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'SERVICE_UNAVAILABLE' } }
        });
        return;
      }
      await route.fulfill({ status: 200, json: extras.publish });
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
  await fillBirthDate(page, { month: '05', day: '20' });
  await chooseNationality(page);
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

async function fillStaffOptInCreateForm(
  page: Page,
  slotId: string
): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = 'appointments-section';
  });
  await openDisclosure(page, '#booking-workflow');
  await page.locator('#booking-name').fill('測試患者甲');
  await page.locator('#booking-phone').fill('0912345678');
  await page.locator('#booking-birth-month').fill('05');
  await page.locator('#booking-birth-day').fill('20');
  await page.locator('#booking-nationality').selectOption('domestic');
  await page.locator('#booking-kind').selectOption('initial');
  await page.locator('#booking-items [data-booking-item]').first().check();
  await page.locator(`[data-select-slot="${slotId}"]`).click();
  await page.locator('#booking-form button[type="submit"]').click();
  await expect(page.locator('#status')).toContainText('預約已建立');
}

function upcomingIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

/** iCalendar／Google 日曆網址的 UTC 時間格式：20300102T040000Z。 */
function calendarStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
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
    await expect(page.locator('#patient-env-boundary')).toContainText(
      '資料只保存在本機瀏覽器'
    );
    await expect(page.locator('#patient-env-boundary')).not.toContainText(
      '內部測試路由'
    );
    await expect(
      page.locator('.patient-header .environment-badge')
    ).toContainText('LOCAL TEST ONLY');
    await expect(
      page.locator('.patient-header .environment-badge')
    ).not.toContainText('INTERNAL TEST');
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
    await expect(page.locator('#patient-env-boundary')).toHaveText(
      '內部測試路由 · 非正式上線'
    );
    await expect(
      page.locator('.patient-header .environment-badge')
    ).toContainText('INTERNAL TEST');
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
    await expect(page.locator('#environment-label')).toHaveText(
      'INTERNAL TEST'
    );
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

  test('opt-in staff create posts onBehalfPatientId then complete hits /v1', async ({
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
        arrive: {
          appointmentId: 'appointment_api_001',
          status: 'arrived',
          startsAt,
          endsAt
        },
        complete: {
          appointmentId: 'appointment_api_001',
          status: 'completed',
          startsAt,
          endsAt
        }
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    expect(posted.body).toMatchObject({
      slotId: 'slot_overlay_open',
      serviceId: expect.any(String),
      bookingKind: 'initial',
      onBehalfPatientId: expect.stringMatching(/^patient_\d{3}$/)
    });
    expect(posted.body).not.toHaveProperty('patient');
    expect(posted.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );

    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('[data-appointment-action="arrive"]').click();
    await page.getByRole('button', { name: '確認到診' }).click();
    await expect(page.locator('#status')).toContainText('已記錄到診');
    expect(posted.arrive.path).toBe('/v1/bookings/appointment_api_001/arrive');

    await card.locator('[data-appointment-action="complete"]').click();
    await page.locator('.confirm-dialog button.button-primary').click();
    await expect(page.locator('#status')).toContainText('看診已完成');
    expect(posted.complete.path).toBe(
      '/v1/bookings/appointment_api_001/complete'
    );
    expect(posted.complete.body).not.toHaveProperty('patient');
    expect(posted.complete.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
  });

  test('opt-in staff no-show posts /v1/bookings/:id/no-show without patient fields', async ({
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
        appointmentId: 'appointment_api_002',
        status: 'confirmed',
        startsAt,
        endsAt
      },
      {
        noShow: {
          appointmentId: 'appointment_api_002',
          status: 'no_show',
          startsAt,
          endsAt
        }
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_002"]');
    await card.locator('.action-menu summary').click();
    await card.locator('[data-appointment-action="no_show"]').click();
    await page.getByRole('button', { name: '標記未到', exact: true }).click();

    await expect(page.locator('#status')).toContainText('已標記未到');
    expect(posted.noShow.path).toBe('/v1/bookings/appointment_api_002/no-show');
    expect(posted.noShow.body).not.toHaveProperty('patient');
    expect(posted.noShow.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
  });

  test('opt-in staff complete does not succeed locally when /v1 complete is closed', async ({
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
      {
        appointmentId: 'appointment_api_001',
        status: 'confirmed',
        startsAt,
        endsAt: upcomingIso(48.5)
      },
      {
        arrive: {
          appointmentId: 'appointment_api_001',
          status: 'arrived',
          startsAt,
          endsAt: upcomingIso(48.5)
        },
        complete: 'closed'
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('[data-appointment-action="arrive"]').click();
    await page.getByRole('button', { name: '確認到診' }).click();
    await expect(page.locator('#status')).toContainText('已記錄到診');
    await card.locator('[data-appointment-action="complete"]').click();
    await page.locator('.confirm-dialog button.button-primary').click();

    await expect(page.locator('#status')).toContainText(
      '服務暫時無法使用，請稍後再試。'
    );
    await expect(card).toContainText('已到診');
  });

  test('opt-in staff complete-without-card does not succeed locally', async ({
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
      {
        appointmentId: 'appointment_api_001',
        status: 'confirmed',
        startsAt,
        endsAt: upcomingIso(48.5)
      },
      {
        arrive: {
          appointmentId: 'appointment_api_001',
          status: 'arrived',
          startsAt,
          endsAt: upcomingIso(48.5)
        }
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('[data-appointment-action="arrive"]').click();
    await page.getByRole('button', { name: '確認到診' }).click();
    await expect(page.locator('#status')).toContainText('已記錄到診');
    await card.locator('.action-menu summary').click();
    await card
      .locator('[data-appointment-action="complete_without_card"]')
      .click();
    await page.locator('.confirm-dialog button.button-primary').click();

    await expect(page.locator('#status')).toContainText(
      '服務暫時無法使用，請稍後再試。'
    );
    await expect(card).toContainText('已到診');
  });

  test('opt-in staff notes do not succeed locally', async ({ page }) => {
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
      {
        appointmentId: 'appointment_api_001',
        status: 'confirmed',
        startsAt,
        endsAt: upcomingIso(48.5)
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('[data-notes-toggle]').click();
    const form = page.locator('[data-notes-form="appointment_api_001"]');
    await expect(form).toBeVisible();
    await form.locator('[name="noteText"]').fill('櫃台備註');
    await form.getByRole('button', { name: '儲存備註' }).click();

    await expect(page.locator('#status')).toContainText(
      '服務暫時無法使用，請稍後再試。'
    );
    await expect(form.locator('[name="noteText"]')).toHaveValue('櫃台備註');
  });

  test('opt-in staff reschedule posts /v1/bookings/:id/reschedule without patient fields', async ({
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

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('.action-menu summary').click();
    await card.locator('[data-appointment-action="reschedule"]').click();
    const form = page.locator('[data-reschedule-form="appointment_api_001"]');
    await expect(form).toBeVisible();
    await form
      .locator('select[name="slotId"]')
      .selectOption('slot_overlay_alt');
    await form.getByRole('button', { name: '確認改期' }).click();

    await expect(page.locator('#status')).toContainText('預約已改期');
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

  test('opt-in staff cancel posts /v1/bookings/:id/cancel without patient fields', async ({
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
      {
        cancel: {
          appointmentId: 'appointment_api_001',
          status: 'cancelled',
          startsAt,
          endsAt: upcomingIso(48.5)
        }
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('.action-menu summary').click();
    await card.locator('[data-appointment-action="cancel"]').click();
    await page.locator('.confirm-dialog button.button-danger').click();

    await expect(page.locator('#status')).toContainText('預約已取消');
    expect(posted.cancel.path).toBe('/v1/bookings/appointment_api_001/cancel');
    expect(posted.cancel.body).not.toHaveProperty('patient');
    expect(posted.cancel.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
  });

  test('opt-in lookup by opaque id queries /v1/bookings/:id without PII', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const posted = await stubV1(
      page,
      'closed',
      'closed',
      {},
      {
        getBooking: {
          appointmentId: 'appointment_api_001',
          status: 'confirmed',
          startsAt,
          endsAt: upcomingIso(48.5)
        }
      }
    );

    await page.goto('/booking?internalTestBooking=1');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#booking-management-open').click();
    await page.locator('#booking-lookup-phone').fill('appointment_api_001');
    await page.locator('#booking-lookup-form button[type="submit"]').click();

    await expect(page.locator('#booking-lookup-status')).toContainText(
      '找到 1 筆預約'
    );
    await expect(page.locator('.booking-lookup-card')).toBeVisible();
    expect(posted.query.path).toBe('/v1/bookings/appointment_api_001');
  });

  // AUD-11：GET /v1/bookings/:id 的回應帶 bookingKind 與 slotId，但查詢卡沒有
  // 把它們留下來，於是改期選項（同掛號別、排除原時段）整個消失。
  test('lookup by opaque id keeps the booking kind and slot so reschedule options remain', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const altStartsAt = upcomingIso(72);
    const posted = await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_lookup_current',
            kind: 'follow_up',
            startsAt,
            available: true
          },
          {
            slotId: 'slot_lookup_alt',
            kind: 'follow_up',
            startsAt: altStartsAt,
            available: true
          },
          {
            slotId: 'slot_lookup_other_kind',
            kind: 'initial',
            startsAt: upcomingIso(96),
            available: true
          }
        ]
      },
      'closed',
      {
        reschedule: {
          appointmentId: 'appointment_api_001',
          status: 'confirmed',
          startsAt: altStartsAt,
          endsAt: upcomingIso(72.5)
        }
      },
      {
        getBooking: {
          appointmentId: 'appointment_api_001',
          status: 'confirmed',
          startsAt,
          endsAt: upcomingIso(48.5),
          bookingKind: 'follow_up',
          slotId: 'slot_lookup_current'
        }
      }
    );

    await page.goto('/booking?internalTestBooking=1');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.locator('#booking-management-open').click();
    await page.locator('#booking-lookup-phone').fill('appointment_api_001');
    await page.locator('#booking-lookup-form button[type="submit"]').click();

    await expect(page.locator('#booking-lookup-status')).toContainText(
      '找到 1 筆預約'
    );
    await expect(page.locator('.booking-lookup-card')).toContainText('回診');
    const select = page.locator(
      '[data-managed-reschedule-slot="appointment_api_001"]'
    );
    await expect(select).toBeVisible();
    // 只有同掛號別、且不是原時段的空位。
    expect(
      await select.evaluate((element: HTMLSelectElement) =>
        [...element.options].map((option) => option.value).filter(Boolean)
      )
    ).toEqual(['slot_lookup_alt']);

    await select.selectOption('slot_lookup_alt');
    await page.locator('[data-managed-reschedule]').click();
    await page.getByRole('button', { name: '確認改期' }).click();
    await expect(page.locator('#booking-lookup-status')).toContainText(
      '預約已改期'
    );
    expect(posted.reschedule.path).toBe(
      '/v1/bookings/appointment_api_001/reschedule'
    );
    expect(posted.reschedule.body).toMatchObject({
      targetSlotId: 'slot_lookup_alt'
    });
  });

  // AUD-12：結果畫面的 .ics 與 Google 日曆網址讀的是建立當下的預約，改期後
  // 沒有跟著更新，患者加入行事曆的仍是舊時間。
  test('reschedule updates the result screen and both calendar exports to the new time', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const altStartsAt = upcomingIso(72);
    await stubV1(
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
    const cardTime = page.locator('.booking-lookup-card-heading strong');
    const oldWhen = await cardTime.innerText();
    await page
      .locator('[data-managed-reschedule-slot="appointment_api_001"]')
      .selectOption('slot_overlay_alt');
    await page.locator('[data-managed-reschedule]').click();
    await page.getByRole('button', { name: '確認改期' }).click();
    await expect(page.locator('#booking-complete-heading')).toHaveText(
      '預約已改期'
    );

    // 結果畫面：顯示新時間，不再只說「已改期」。
    const newWhen = await cardTime.innerText();
    expect(newWhen).not.toBe(oldWhen);
    await expect.soft(page.locator('#booking-result')).toContainText(newWhen);
    await expect
      .soft(page.locator('#booking-result'))
      .not.toContainText(oldWhen);

    // 兩種匯出都是新時間。
    await page.locator('#booking-management-close').click();
    const at = calendarStamp(altStartsAt);
    const href = await page
      .locator('#add-to-google-calendar')
      .getAttribute('href');
    expect
      .soft(new URL(href ?? '').searchParams.get('dates'))
      .toBe(`${at}/${at}`);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#add-to-calendar').click()
    ]);
    const ics = readFileSync(await download.path(), 'utf8');
    expect.soft(ics).toContain(`DTSTART:${at}`);
    expect.soft(ics).not.toContain(`DTSTART:${calendarStamp(startsAt)}`);
  });

  // AUD-13：患者備註經 POST /v1/bookings 送出、由伺服器只在櫃台清單回傳；
  // 工作臺 transport 先前把它丟掉，渲染器永遠看不到。
  test('a patient note from the booking page shows as plain text in the staff list', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const endsAt = upcomingIso(48.5);
    const note = '<b>合成備註</b>：想問術後照護';
    // 伺服器端的替身：回傳剛剛收到的備註，與 BOOKING-NOTE-STORAGE 一致。
    const server: { storedNote?: string } = {};
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
        appointmentId: 'appointment_api_note_001',
        status: 'confirmed',
        startsAt,
        endsAt
      },
      {},
      {
        listBookings: () => [
          {
            appointmentId: 'appointment_api_note_001',
            status: 'confirmed',
            startsAt,
            endsAt,
            bookingKind: 'initial',
            slotId: 'slot_overlay_open',
            patientId: 'patient_opaque_note_001',
            ...(server.storedNote === undefined
              ? {}
              : { patientNote: server.storedNote })
          }
        ]
      }
    );

    await page.goto('/booking?internalTestBooking=1');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await openPatientSlotStep(page);
    await page.locator('[data-patient-slot="slot_overlay_open"]').click();
    await fillPatientCreateForm(page);
    await page.locator('#patient-note').fill(note);
    await page.locator('#confirm-patient-booking').click();
    await expect(page.locator('#booking-result')).toContainText(
      'appointment_api_note_001'
    );
    expect(posted.body).toMatchObject({ patientNote: note });
    server.storedNote = posted.body?.patientNote as string;

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await page.evaluate(() => {
      window.location.hash = 'appointments-section';
    });
    await showAllAppointments(page);
    const card = page.locator(
      '[data-appointment-card="appointment_api_note_001"]'
    );
    await expect(card.locator('.note-chip')).toHaveText(`患者：${note}`);
    // 備註是文字，不是標記：沒有任何元素是從備註內容長出來的。
    await expect(card.locator('b')).toHaveCount(0);
  });

  // AUD-15：API 模式的資料會送到診所的測試伺服器；頁面不能照樣說「只存在
  // 瀏覽器」。本機模式的對照在 patient-booking.spec.ts。
  test('API mode states that the data is sent to the clinic test server, not kept only in the browser', async ({
    page
  }) => {
    await stubV1(page, {
      slots: [
        {
          slotId: 'slot_overlay_open',
          kind: 'initial',
          startsAt: upcomingIso(48),
          available: true
        }
      ]
    });
    await page.goto('/booking?internalTestBooking=1');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    const sentToServer = '會送到診所的測試伺服器';
    const browserOnly =
      /只(?:會)?(?:存|保存|留)在?(?:本機|我這台|您這台|這台|目前)/;
    await expect(page.locator('#patient-preview-warning')).toContainText(
      sentToServer
    );
    await expect(page.locator('#patient-announcement')).toContainText(
      sentToServer
    );

    await openPatientSlotStep(page);
    await page.locator('[data-patient-slot="slot_overlay_open"]').click();
    await expect(page.locator('#synthetic-confirmation-text')).toHaveText(
      `我了解此頁為測試版本，填寫的資料${sentToServer}。`
    );

    // 沒勾確認就送出：行內錯誤也要說同一件事。
    await page.locator('#patient-name').fill('測試患者乙');
    await page.locator('#patient-phone').fill('0922333444');
    await fillBirthDate(page, { month: '11', day: '02' });
    await chooseNationality(page);
    await page.locator('#privacy-consent').check();
    await page.locator('#confirm-patient-booking').click();
    await expect(page.locator('#synthetic-confirmation-error')).toContainText(
      sentToServer
    );

    // 畫面上看得見的文字，沒有任何一句還說資料只存在瀏覽器。
    const visibleText = await page.locator('body').innerText();
    expect(visibleText).not.toMatch(browserOnly);
  });

  test('verified return lookup switches the live flow to follow-up slots', async ({
    page
  }) => {
    const posted = await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_follow_up_open',
            kind: 'follow_up',
            startsAt: upcomingIso(48),
            available: true
          }
        ]
      },
      'closed',
      {},
      {
        returnLookup: {
          outcome: 'schedule',
          sessionId: 'return_session_test_001'
        }
      }
    );

    await page.goto('/booking?internalTestBooking=1');
    await page.locator('#booking-management-open').click();
    await page.locator('#booking-lookup-phone').fill('0912000001');
    await page.locator('#booking-lookup-birth-month').fill('01');
    await page.locator('#booking-lookup-birth-day').fill('15');
    await page.locator('#booking-lookup-form button[type="submit"]').click();
    await expect(page.locator('#booking-lookup-status')).toContainText(
      '已確認回診身分'
    );
    await page.locator('#booking-management-close').click();

    await expect(page.locator('#slot-choice-description')).toContainText(
      '回診開放每小時 15 分與 45 分'
    );
    await expect(
      page.locator('[data-patient-slot="slot_follow_up_open"]')
    ).toBeVisible();
    await page.locator('[data-booking-back="1"]').click();
    await expect(page.locator('[data-booking-type="follow_up"]')).toBeEnabled();
    await expect(page.locator('[data-booking-type="initial"]')).toBeDisabled();
    expect(posted.returnLookup).toEqual({
      path: '/v1/return-lookup',
      body: { phone: '0912000001', birthDate: '--01-15' }
    });
  });

  test('verified return lookup books the follow-up without re-entering identity', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const posted = await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_follow_up_open',
            kind: 'follow_up',
            startsAt,
            available: true
          }
        ]
      },
      {
        appointmentId: 'appointment_follow_up_001',
        status: 'confirmed',
        startsAt
      },
      {},
      {
        returnLookup: {
          outcome: 'schedule',
          sessionId: 'return_session_test_001'
        }
      }
    );

    await page.goto('/booking?internalTestBooking=1');
    await page.locator('#booking-management-open').click();
    await page.locator('#booking-lookup-phone').fill('0912000001');
    await page.locator('#booking-lookup-birth-month').fill('01');
    await page.locator('#booking-lookup-birth-day').fill('15');
    await page.locator('#booking-lookup-form button[type="submit"]').click();
    await expect(page.locator('#booking-lookup-status')).toContainText(
      '已確認回診身分'
    );
    await page.locator('#booking-management-close').click();
    await page.locator('[data-patient-slot="slot_follow_up_open"]').click();
    await page.locator('#confirm-patient-booking').click();

    await expect(page.locator('#booking-result')).toContainText(
      'appointment_follow_up_001'
    );
    expect(posted.body).toMatchObject({
      slotId: 'slot_follow_up_open',
      serviceId: 'service_snoring',
      bookingKind: 'follow_up'
    });
    expect(posted.body).not.toHaveProperty('intake');
    expect(posted.createHeaders?.['x-return-session']).toBe(
      'return_session_test_001'
    );
  });

  test('restart after return booking isolates the next initial intake', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const posted = await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_return_001',
            kind: 'follow_up',
            startsAt,
            available: true
          },
          {
            slotId: 'slot_initial_002',
            kind: 'initial',
            startsAt,
            available: true
          }
        ]
      },
      {
        appointmentId: 'appointment_synthetic_001',
        status: 'confirmed',
        startsAt
      },
      {},
      {
        returnLookup: { outcome: 'schedule', sessionId: 'synthetic_return_001' }
      }
    );
    await page.goto('/booking?internalTestBooking=1');
    await page.locator('#booking-management-open').click();
    await page.locator('#booking-lookup-phone').fill('0912000001');
    await page.locator('#booking-lookup-birth-month').fill('01');
    await page.locator('#booking-lookup-birth-day').fill('15');
    await page.locator('#booking-lookup-form button[type="submit"]').click();
    await expect(page.locator('#booking-lookup-status')).toContainText(
      '已確認回診身分'
    );
    await page.locator('#booking-management-close').click();
    await page.locator('[data-patient-slot="slot_return_001"]').click();
    await page.locator('#confirm-patient-booking').click();
    await expect(page.locator('#booking-result')).toContainText(
      'appointment_synthetic_001'
    );
    expect(posted.createHeaders?.['x-return-session']).toBe(
      'synthetic_return_001'
    );

    await page.locator('#book-another').click();
    expect(
      await page.evaluate(() => sessionStorage.getItem('itrs'))
    ).toBeNull();
    await expect(page.locator('[data-booking-type="initial"]')).toBeEnabled();
    await openPatientSlotStep(page);
    await page.locator('[data-patient-slot="slot_initial_002"]').click();
    await fillPatientCreateForm(page);
    await page.locator('#patient-name').fill('合成初診乙');
    await page.locator('#confirm-patient-booking').click();
    await expect(page.locator('#booking-result')).toContainText(
      'appointment_synthetic_001'
    );
    expect(posted.body).toMatchObject({
      bookingKind: 'initial',
      intake: { name: '合成初診乙' }
    });
    expect(posted.createHeaders).not.toHaveProperty('x-return-session');
  });

  test('same-tab staff navigation does not inherit return-patient credentials', async ({
    page
  }) => {
    const observed: Array<Record<string, string>> = [];
    await stubV1(
      page,
      { slots: [] },
      'closed',
      {},
      {
        returnLookup: { outcome: 'schedule', sessionId: 'synthetic_return_001' }
      }
    );
    await page.goto('/booking?internalTestBooking=1');
    await page.locator('#booking-management-open').click();
    await page.locator('#booking-lookup-phone').fill('0912000001');
    await page.locator('#booking-lookup-birth-month').fill('01');
    await page.locator('#booking-lookup-birth-day').fill('15');
    await page.locator('#booking-lookup-form button[type="submit"]').click();
    await expect(page.locator('#booking-lookup-status')).toContainText(
      '已確認回診身分'
    );
    expect(await page.evaluate(() => sessionStorage.getItem('itrs'))).toBe(
      'synthetic_return_001'
    );
    await page.route('**/v1/**', async (route) => {
      observed.push(route.request().headers());
      await route.fallback();
    });
    await login(page, 'admin', { path: '/staff?internalTestBooking=1' });
    await expect.poll(() => observed.length).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => sessionStorage.getItem('itrs'))
    ).toBeNull();
    expect(
      observed.every((headers) => headers['x-return-session'] === undefined)
    ).toBe(true);
  });

  test('opt-in staff publish posts /v1/schedule/publish without patient fields', async ({
    page
  }) => {
    const posted = await stubV1(
      page,
      {
        slots: [
          {
            slotId: 'slot_overlay_open',
            kind: 'initial',
            startsAt: upcomingIso(48),
            available: true
          }
        ]
      },
      'closed',
      {},
      {
        publish: {
          publishedVersion: 2,
          publishedAt: '2030-01-02T04:00:00.000Z',
          schedule: { timeZone: 'Asia/Taipei' }
        }
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await page.evaluate(() => {
      window.location.hash = 'schedule-section';
    });
    await expect(page.locator('#date-exception-form')).toBeVisible();
    await page.locator('#exception-date').fill('2030-12-31');
    await page.locator('#exception-kind').selectOption('closed');
    await page.locator('#date-exception-form button[type="submit"]').click();
    await expect(page.locator('#date-exception-form-status')).toContainText(
      '日期例外已加入'
    );
    await expect(page.locator('#publish-schedule')).toBeEnabled();
    await page.locator('#publish-schedule').click();
    await page.getByRole('button', { name: '發布營業時間' }).click();

    await expect(page.locator('#schedule-toolbar-status')).toContainText(
      '營業時間已發布'
    );
    expect(posted.publish.path).toBe('/v1/schedule/publish');
    expect(posted.publish.body).toMatchObject({
      expectedVersion: expect.any(Number),
      schedule: expect.any(Object)
    });
    expect(posted.publish.body).not.toHaveProperty('patient');
    expect(posted.publish.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
  });

  test('opt-in staff follow-up posts /v1/bookings/:id/follow-up without clinical extras', async ({
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
          },
          {
            slotId: 'slot_20300102_1215',
            kind: 'follow_up',
            startsAt: '2030-01-02T04:15:00.000Z',
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
        arrive: {
          appointmentId: 'appointment_api_001',
          status: 'arrived',
          startsAt,
          endsAt
        },
        complete: {
          appointmentId: 'appointment_api_001',
          status: 'completed',
          startsAt,
          endsAt
        },
        followUp: {
          appointmentId: 'appointment_api_001',
          decision: 'required',
          dueAt: '2030-01-02T04:15:00.000Z'
        }
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('[data-appointment-action="arrive"]').click();
    await page.getByRole('button', { name: '確認到診' }).click();
    await expect(page.locator('#status')).toContainText('已記錄到診');
    await card.locator('[data-appointment-action="complete"]').click();
    await page.locator('.confirm-dialog button.button-primary').click();
    await expect(page.locator('#status')).toContainText('看診已完成');

    const form = page.locator('[data-follow-up-form="appointment_api_001"]');
    await expect(form).toBeVisible();
    await form.locator('select[name="status"]').selectOption('required');
    await form.getByRole('button', { name: '儲存回診指示' }).click();

    await expect(page.locator('#status')).toContainText('回診指示已登錄');
    expect(posted.followUp.path).toBe(
      '/v1/bookings/appointment_api_001/follow-up'
    );
    expect(posted.followUp.body).toMatchObject({
      decision: 'required'
    });
    expect(posted.followUp.body).not.toHaveProperty('dueDate');
    expect(posted.followUp.body).not.toHaveProperty('dueTime');
    expect(posted.followUp.body).not.toHaveProperty('patient');
    expect(posted.followUp.body).not.toHaveProperty('tags');
    expect(posted.followUp.body).not.toHaveProperty('noteText');
    expect(posted.followUp.body).not.toHaveProperty('certificateCopies');
    expect(posted.followUp.body).not.toHaveProperty('medicalRecordNumber');
    expect(posted.followUp.body).not.toHaveProperty('managerId');
    expect(posted.followUp.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
    await expect(
      page.locator('[data-follow-up-form="appointment_api_001"]')
    ).toHaveCount(0);
  });

  test('opt-in staff follow-up does not succeed locally when /v1 follow-up is closed', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const endsAt = upcomingIso(48.5);
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
      {
        appointmentId: 'appointment_api_001',
        status: 'confirmed',
        startsAt,
        endsAt
      },
      {
        arrive: {
          appointmentId: 'appointment_api_001',
          status: 'arrived',
          startsAt,
          endsAt
        },
        complete: {
          appointmentId: 'appointment_api_001',
          status: 'completed',
          startsAt,
          endsAt
        },
        followUp: 'closed'
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('[data-appointment-action="arrive"]').click();
    await page.getByRole('button', { name: '確認到診' }).click();
    await expect(page.locator('#status')).toContainText('已記錄到診');
    await card.locator('[data-appointment-action="complete"]').click();
    await page.locator('.confirm-dialog button.button-primary').click();
    await expect(page.locator('#status')).toContainText('看診已完成');

    const form = page.locator('[data-follow-up-form="appointment_api_001"]');
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: '儲存回診指示' }).click();

    await expect(page.locator('#status')).toContainText(
      '服務暫時無法使用，請稍後再試。'
    );
    await expect(form).toBeVisible();
  });

  test('opt-in staff delete posts /v1/bookings/:id/delete with a closed reason', async ({
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
        delete: {
          appointmentId: 'appointment_api_001',
          deleted: true,
          auditEventId: 'audit_appointment_api_001_deleted_key'
        }
      }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('.action-menu summary').click();
    await card.locator('[data-appointment-action="delete"]').click();
    await page
      .locator('.confirm-dialog-reason select')
      .selectOption('created_in_error');
    await page.locator('.confirm-dialog-actions .button-danger').click();

    await expect(page.locator('#status')).toContainText('已刪除');
    expect(posted.delete.path).toBe('/v1/bookings/appointment_api_001/delete');
    expect(posted.delete.body).toMatchObject({
      reasonCode: 'created_in_error'
    });
    expect(posted.delete.body).not.toHaveProperty('patient');
    expect(posted.delete.body).not.toHaveProperty('authorizationSecret');
    expect(posted.delete.body?.idempotencyKey).toEqual(
      expect.stringMatching(/^.{16,}$/)
    );
  });

  test('opt-in staff delete does not succeed locally when /v1 delete is closed', async ({
    page
  }) => {
    const startsAt = upcomingIso(48);
    const endsAt = upcomingIso(48.5);
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
      {
        appointmentId: 'appointment_api_001',
        status: 'confirmed',
        startsAt,
        endsAt
      },
      { delete: 'closed' }
    );

    await login(page, 'admin', {
      fresh: true,
      path: '/staff?internalTestBooking=1'
    });
    await fillStaffOptInCreateForm(page, 'slot_overlay_open');
    await showAllAppointments(page);
    const card = page.locator('[data-appointment-card="appointment_api_001"]');
    await card.locator('.action-menu summary').click();
    await card.locator('[data-appointment-action="delete"]').click();
    await page.locator('.confirm-dialog-actions .button-danger').click();

    await expect(page.locator('#status')).toContainText(
      '服務暫時無法使用，請稍後再試。'
    );
    await expect(card).toBeVisible();
  });
});
