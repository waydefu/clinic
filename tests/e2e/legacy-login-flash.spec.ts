import { expect, test } from '@playwright/test';

const CLIENT_CONFIG = '**/v1/calendar-session/client-config';

test.describe('legacy synthetic login flash', () => {
  test('does not expose the test-only workbench login while client-config is pending', async ({
    page
  }) => {
    let releaseConfig: (respondOk: boolean) => void = () => {
      throw new Error('client-config route was not armed');
    };
    const held = new Promise<boolean>((resolve) => {
      releaseConfig = resolve;
    });

    await page.route(CLIENT_CONFIG, async (route) => {
      const ok = await held;
      if (!ok) {
        await route.fulfill({ status: 404, json: {} });
        return;
      }
      await route.fulfill({
        json: {
          apiKey: 'test-api-key',
          authDomain: 'example.invalid',
          projectId: 'test-project',
          appId: 'test-app-id'
        }
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const login = document.getElementById('login-view');
      const boot = document.getElementById('cal-pilot-boot-status');
      return (
        login?.hidden === false ||
        (boot !== null && boot.getClientRects().length > 0)
      );
    });

    const pendingText = await page.locator('body').innerText();
    expect(pendingText).not.toContain('登入營運工作臺');
    expect(pendingText).not.toContain('beauessence-admin');
    expect(pendingText).not.toContain('beauessence-front');
    expect(pendingText).toMatch(/正在載入/);

    releaseConfig(false);
    await expect(
      page.getByRole('heading', { name: '登入營運工作臺' })
    ).toBeVisible();
  });

  test('enters CAL-PILOT after client-config without showing the synthetic login', async ({
    page
  }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('calPilotCsrf', 'csrf_test_token');
    });
    await page.route('**/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
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
            pendingCandidateCount: 0,
            conflictCount: 0,
            expiresAt: '2026-11-28T04:51:37Z'
          }
        });
        return;
      }
      if (
        path === '/v1/calendar/sources' ||
        path === '/v1/calendar/candidates' ||
        path === '/v1/calendar/synthetic-patients'
      ) {
        await route.fulfill({ json: [] });
        return;
      }
      await route.fulfill({ status: 404, json: {} });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: '待審佇列' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '登入營運工作臺' })
    ).toBeHidden();
  });
});
