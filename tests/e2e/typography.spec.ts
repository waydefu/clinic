import { expect, test, type Locator, type Page } from '@playwright/test';

async function targetHeight(locator: Locator) {
  return locator.evaluate((element) => element.getBoundingClientRect().height);
}

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#login-account').fill('admin');
  await page.locator('#login-password').fill('beauessence-admin');
  await page.locator('#login-view button[type="submit"]').click();
  await expect(page.locator('#workspace-title')).toBeVisible();
}

test.describe('readable operational typography', () => {
  test('patient essentials use the 16px body scale and 44px controls', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/patient.html');
    await expect(page.locator('[data-booking-type="initial"]')).toBeVisible();

    const navigationLink = page.locator('.patient-nav a').first();
    await expect(navigationLink).toHaveCSS('font-size', '16px');
    expect(await targetHeight(navigationLink)).toBeGreaterThanOrEqual(44);

    await expect(page.locator('.booking-stepper strong').first()).toHaveCSS(
      'font-size',
      '16px'
    );
    await expect(
      page.locator('.booking-panel-heading > p:last-child').first()
    ).toHaveCSS('font-size', '16px');
    await expect(page.locator('#patient-national-id-hint')).toHaveCSS(
      'font-size',
      '16px'
    );

    const themePicker = page.locator('#theme-picker');
    await expect(themePicker).toHaveCSS('font-size', '16px');
    expect(await targetHeight(themePicker)).toBeGreaterThanOrEqual(44);
  });

  test('workbench navigation, feedback, filters and tables use 16px', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsAdmin(page);

    const appointmentsLink = page.locator(
      '.workspace-nav a[href="#appointments-section"]'
    );
    await expect(appointmentsLink).toHaveCSS('font-size', '16px');
    expect(await targetHeight(appointmentsLink)).toBeGreaterThanOrEqual(44);
    await appointmentsLink.click();
    await expect(page.locator('#appointments-heading')).toBeVisible();

    await expect(page.locator('#status')).toHaveCSS('font-size', '16px');
    await expect(page.locator('#appointment-result-summary')).toHaveCSS(
      'font-size',
      '16px'
    );
    await expect(page.locator('.filter-bar label').first()).toHaveCSS(
      'font-size',
      '16px'
    );
    await expect(page.locator('#booking-workflow .button').first()).toHaveCSS(
      'font-size',
      '16px'
    );

    await page.locator('.workspace-nav a[href="#schedule-section"]').click();
    const publishedSchedule = page
      .locator('#published-schedule .data-table')
      .first();
    await expect(publishedSchedule).toBeVisible();
    await expect(publishedSchedule).toHaveCSS('font-size', '16px');
    await expect(publishedSchedule.locator('th').first()).toHaveCSS(
      'font-size',
      '16px'
    );
  });
});
