import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PERMISSIONS } from '../../apps/web/public/modules/constants.js';
import { permissionsFor } from '../../apps/web/public/modules/permissions.js';
import { ROLES } from '../../apps/web/public/vendor/domain/roles.js';

const calendarBookingRole = ROLES.map((role) => {
  const accountId = `e2e-role-${role}`;
  const permissions = permissionsFor({
    workspace: {
      authenticated: true,
      currentAccountId: accountId,
      accounts: [{ id: accountId, role, status: 'active' }]
    }
  });
  return { role, permissions };
})
  .filter(({ permissions }) => permissions.includes(PERMISSIONS.CREATE_BOOKING))
  .sort(
    (left, right) => left.permissions.length - right.permissions.length
  )[0]?.role;

if (calendarBookingRole === undefined)
  throw new Error('No role has the canonical create-booking permission.');

test.describe('CAL-PILOT controlled correction workbench', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('calPilotCsrf', 'csrf_test_token');
    });
  });

  test('filters candidates, explains errors in Chinese and sends only closed fields', async ({
    page
  }) => {
    let correction: Record<string, unknown> | undefined;
    await page.route('**/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/v1/calendar-session/client-config') {
        await route.fulfill({
          json: {
            apiKey: 'test-api-key',
            authDomain: 'example.invalid',
            projectId: 'test-project',
            appId: 'test-app-id'
          }
        });
        return;
      }
      if (path === '/v1/calendar/status') {
        await route.fulfill({
          json: {
            health: 'healthy',
            activeSource: null,
            lastSuccessfulSyncAt: null,
            nextScheduledSyncAt: null,
            pendingCandidateCount: 1,
            conflictCount: 0,
            expiresAt: '2026-11-28T04:51:37Z'
          }
        });
        return;
      }
      if (path === '/v1/calendar/sources') {
        await route.fulfill({ json: [] });
        return;
      }
      if (path === '/v1/calendar/candidates') {
        await route.fulfill({
          json: [
            {
              candidateId: 'candidate_invalid_001',
              kind: 'invalid_format',
              status: 'pending',
              displayLabel: '格式需修正',
              startsAt: null,
              endsAt: null,
              sourceVersion: 1,
              expectedVersion: 0,
              validationErrors: ['title_format_invalid', 'busy_reason_unknown'],
              createdAt: '2026-08-31T04:00:00.000Z',
              before: null
            }
          ]
        });
        return;
      }
      if (path === '/v1/calendar/availability') {
        await route.fulfill({
          json: {
            generatedAt: '2026-08-31T04:00:00.000Z',
            sourceVersion: 1,
            blocks: []
          }
        });
        return;
      }
      if (path === '/v1/calendar/synthetic-appointments') {
        await route.fulfill({ json: [] });
        return;
      }
      if (path === '/v1/calendar/synthetic-patients') {
        await route.fulfill({ json: [{ patientCode: 'A17' }] });
        return;
      }
      if (
        path === '/v1/calendar/candidates/candidate_invalid_001/correct' &&
        request.method() === 'POST'
      ) {
        correction = request.postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          json: { candidate: {}, projection: { projectionId: 'opaque_001' } }
        });
        return;
      }
      await route.fulfill({ status: 404, json: {} });
    });

    await page.goto('/staff?calendarPilot=1');
    await expect(
      page.getByRole('heading', { name: 'Calendar 待確認變更' })
    ).toBeVisible();
    await expect(page.getByText('標題不符合統一格式')).toBeVisible();
    await expect(page.getByText('忙碌原因不在允許清單')).toBeVisible();
    await page.locator('[data-candidate-filter]').selectOption('appointment');
    await expect(page.getByText('這個類型目前沒有候選變更。')).toBeVisible();
    await page.locator('[data-candidate-filter]').selectOption('invalid');
    await page.getByRole('button', { name: '受控修正' }).click();

    const dialog = page.getByRole('dialog', { name: '受控修正候選' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('合成患者')).toHaveValue('A17');
    await expect(dialog.locator('input[type="text"]')).toHaveCount(0);
    for (const forbidden of ['name', 'phone', 'editor', 'source', 'anesthesia'])
      await expect(dialog.locator(`[name="${forbidden}"]`)).toHaveCount(0);
    const accessibility = await new AxeBuilder({ page })
      .include('.calendar-pilot-root')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? '')
      )
    ).toEqual([]);
    await dialog.getByRole('button', { name: '重新檢查並核准' }).click();
    await expect.poll(() => correction).toBeDefined();
    expect(correction).toMatchObject({
      kind: 'appointment',
      patientCode: 'A17',
      bookingKind: 'initial',
      serviceId: 'service_snoring',
      expectedVersion: 0
    });
    expect(correction).not.toHaveProperty('name');
    expect(correction).not.toHaveProperty('phone');
    expect(correction).not.toHaveProperty('source');
    expect(correction).not.toHaveProperty('anesthesia');
  });

  test('uses a patient suggestion in the existing booking flow and leaves candidate handling manual', async ({
    page
  }) => {
    const startsAt = '2030-09-04T06:00:00.000Z';
    let booking: Record<string, unknown> | undefined;
    let ordinaryBooking: Record<string, unknown> | undefined;
    let bookingCount = 0;
    let handledCandidate: Record<string, unknown> | undefined;
    let candidatePending = true;
    let calendarLogoutAttempted = false;
    await page.addInitScript(
      (role) => sessionStorage.setItem('calPilotRole', role),
      calendarBookingRole
    );
    await page.route('**/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/v1/calendar-session/client-config') {
        await route.fulfill({
          json: {
            apiKey: 'test-api-key',
            authDomain: 'example.invalid',
            projectId: 'test-project',
            appId: 'test-app-id'
          }
        });
        return;
      }
      if (path === '/v1/calendar/status') {
        await route.fulfill({
          json: {
            health: 'healthy',
            activeSource: null,
            lastSuccessfulSyncAt: null,
            nextScheduledSyncAt: null,
            pendingCandidateCount: candidatePending ? 1 : 0,
            conflictCount: 0,
            expiresAt: '2030-09-30T00:00:00.000Z'
          }
        });
        return;
      }
      if (path === '/v1/calendar/sources') {
        await route.fulfill({ json: [] });
        return;
      }
      if (path === '/v1/calendar/candidates') {
        await route.fulfill({
          json: candidatePending
            ? [
                {
                  candidateId: 'candidate_manual_001',
                  kind: 'unmatched',
                  status: 'unmatched',
                  displayLabel: '未對應事件',
                  startsAt,
                  endsAt: '2030-09-04T06:30:00.000Z',
                  sourceVersion: 1,
                  expectedVersion: 0,
                  validationErrors: ['title_format_invalid'],
                  createdAt: '2030-09-01T00:00:00.000Z',
                  appointmentId: null,
                  before: null,
                  suggestedPatientId: 'patient_opaque_001',
                  suggestedPatientName: '合成患者甲',
                  suggestionMethod: 'phone_month_day'
                }
              ]
            : []
        });
        return;
      }
      if (path === '/v1/calendar/availability') {
        await route.fulfill({
          json: {
            generatedAt: '2030-09-01T00:00:00.000Z',
            sourceVersion: 1,
            blocks: []
          }
        });
        return;
      }
      if (path === '/v1/calendar/synthetic-appointments') {
        await route.fulfill({ json: [] });
        return;
      }
      if (path === '/v1/calendar/synthetic-patients') {
        await route.fulfill({ json: [{ patientCode: 'A17' }] });
        return;
      }
      if (path === '/v1/slots' && request.method() === 'GET') {
        await route.fulfill({
          json: {
            slots: [
              {
                slotId: 'slot_manual_001',
                kind: 'initial',
                startsAt,
                available: true
              }
            ]
          }
        });
        return;
      }
      if (path === '/v1/bookings' && request.method() === 'GET') {
        await route.fulfill({ json: { appointments: [] } });
        return;
      }
      if (path === '/v1/bookings' && request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        if (booking === undefined) booking = body;
        else ordinaryBooking = body;
        bookingCount += 1;
        await route.fulfill({
          status: 201,
          json: {
            appointmentId: `appointment_manual_00${bookingCount}`,
            status: 'confirmed',
            startsAt,
            endsAt: '2030-09-04T06:30:00.000Z'
          }
        });
        return;
      }
      if (path === '/v1/calendar-session' && request.method() === 'DELETE') {
        calendarLogoutAttempted = true;
        await route.fulfill({
          status: 503,
          json: {
            error: { code: 'SERVICE_UNAVAILABLE', message: 'delete failed' }
          }
        });
        return;
      }
      if (path === '/v1/calendar/candidates/candidate_manual_001/reject') {
        handledCandidate = request.postDataJSON() as Record<string, unknown>;
        candidatePending = false;
        await route.fulfill({ json: { candidate: {}, projection: null } });
        return;
      }
      await route.fulfill({ status: 404, json: {} });
    });

    await page.goto('/staff?calendarPilot=1&internalTestBooking=1');
    await expect(page.getByText('建議對應：合成患者甲')).toBeVisible();
    await page.getByRole('button', { name: '為此病患建立預約' }).click();
    await expect(page.locator('#booking-suggestion')).toBeVisible();
    await expect(page.locator('#booking-suggestion-label')).toContainText(
      '合成患者甲'
    );
    await expect(page.locator('#booking-slot-hint')).toContainText('2030');
    await expect(
      page.locator('#booking-form .field-group').first()
    ).toBeHidden();
    await page.locator('#booking-items [data-booking-item]').first().check();
    await page.locator('#booking-form button[type="submit"]').click();
    await expect
      .poll(() => booking)
      .toMatchObject({
        slotId: 'slot_manual_001',
        onBehalfPatientId: 'patient_opaque_001'
      });
    expect(booking).not.toHaveProperty('patient');
    expect(booking).not.toHaveProperty('phone');
    expect(booking).not.toHaveProperty('birthDate');
    expect(booking).not.toHaveProperty('lookupHash');
    await expect(
      page.getByRole('button', { name: '標記已處理' })
    ).toBeVisible();
    await page.getByRole('button', { name: '標記已處理' }).click();
    await expect
      .poll(() => handledCandidate)
      .toMatchObject({
        expectedVersion: 0
      });

    // Re-enter the staff workbench without a page reload, then mimic the
    // Calendar handoff event. An ordinary booking shortcut must discard the
    // transient suggested patient and restore the normal patient fields.
    await page.goto('/staff?internalTestBooking=1');
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('#current-account-label')).not.toBeEmpty();
    await page.evaluate(
      (eventDetail) => {
        window.dispatchEvent(
          new CustomEvent('beauessence:calendar-booking-suggestion', {
            detail: eventDetail
          })
        );
      },
      {
        candidateId: 'candidate_ordinary_001',
        patientId: 'patient_opaque_ordinary_001',
        patientName: '合成患者乙',
        startsAt
      }
    );
    await expect(page.locator('#booking-suggestion')).toBeVisible();
    await page.locator('[data-booking-shortcut]').first().click();
    await expect(page.locator('#booking-suggestion')).toBeHidden();
    await expect(page.locator('#booking-suggestion-label')).toHaveText('');
    await expect(page.locator('#booking-name')).toHaveValue('');
    await expect(
      page.locator('#booking-form .field-group').first()
    ).toBeVisible();

    // A Calendar logout whose server teardown fails still logs out of the
    // local workbench. The same document can then sign in again; the next
    // ordinary booking must use the fresh form patient rather than the prior
    // suggestion's opaque ID.
    await page.evaluate(
      (eventDetail) => {
        window.dispatchEvent(
          new CustomEvent('beauessence:calendar-booking-suggestion', {
            detail: eventDetail
          })
        );
      },
      {
        candidateId: 'candidate_logout_001',
        patientId: 'patient_opaque_logout_001',
        patientName: '合成患者丙',
        startsAt
      }
    );
    await expect(page.locator('#booking-suggestion')).toBeVisible();
    await page.locator('#logout').click();
    await expect.poll(() => calendarLogoutAttempted).toBe(true);
    await expect(page.locator('#login-view')).toBeVisible();
    await expect(page.locator('#booking-suggestion')).toBeHidden();
    await expect(page.locator('#booking-suggestion-label')).toHaveText('');
    await expect(page.locator('#booking-name')).toHaveValue('');
    await page.locator('#login-account').fill('front');
    await page.locator('#login-password').fill('beauessence-front');
    await page.locator('#login-view button[type="submit"]').click();
    await expect(page.locator('#login-view')).toBeHidden();
    await expect(page.locator('#booking-suggestion')).toBeHidden();

    await page.locator('[data-booking-shortcut]').first().click();
    await page.locator('#booking-name').fill('一般預約患者');
    await page.locator('#booking-phone').fill('0998765432');
    await page.locator('#booking-birth-month').fill('04');
    await page.locator('#booking-birth-day').fill('09');
    await page.locator('#booking-nationality').selectOption('domestic');
    await page.locator('#booking-items [data-booking-item]').first().check();
    await page.locator('#slots [data-select-slot]').first().click();
    await page.locator('#booking-form button[type="submit"]').click();
    await expect
      .poll(() => ordinaryBooking)
      .toMatchObject({
        slotId: 'slot_manual_001',
        onBehalfPatientId: expect.any(String)
      });
    expect(ordinaryBooking?.onBehalfPatientId).not.toBe(
      'patient_opaque_logout_001'
    );
  });
});
