import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

    await page.goto('/');
    await expect(page.getByRole('heading', { name: '待審佇列' })).toBeVisible();
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
});
