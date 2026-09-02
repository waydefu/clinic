import { expect, test } from '@playwright/test';

test.describe('public 404 recovery', () => {
  test('unknown paths stay on the branded 404 and recover to clinic or booking', async ({
    page
  }) => {
    const response = await page.goto('/this-page-does-not-exist');

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: '找不到這個頁面' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '回到首頁' })).toHaveAttribute(
      'href',
      '/clinic'
    );
    await expect(
      page.getByRole('link', { name: '前往線上預約' })
    ).toHaveAttribute('href', '/booking');
    await expect(page.locator('a[href="/"]')).toHaveCount(0);
    await expect(page.locator('a[href="/staff"]')).toHaveCount(0);

    await page.getByRole('link', { name: '回到首頁' }).click();
    await expect(page).toHaveURL(/\/clinic$/);
    await expect(
      page.getByRole('heading', { name: '登入營運工作臺' })
    ).toHaveCount(0);
  });

  test('booking recovery from the branded 404 stays on the public form', async ({
    page
  }) => {
    await page.goto('/404.html');
    await page.getByRole('link', { name: '前往線上預約' }).click();
    await expect(page).toHaveURL(/\/booking$/);
    await expect(
      page.getByRole('heading', { name: '登入營運工作臺' })
    ).toHaveCount(0);
  });
});
