import { expect, test } from '@playwright/test';

// 第一期不做官網（2026-11-28）：診所既有官網由現有廠商維護，本站的官網路由一律
// 301 到那裡，根目錄改進預約頁。不跟隨轉址，只驗證回應本身，所以測試不連外網。
const EXISTING_SITE = 'https://www.beauessence.com.tw/';

test.describe('第一期不做官網', () => {
  for (const path of [
    '/clinic',
    '/clinic.html',
    '/clinic/doctors',
    '/clinic/doctors/yan-cheng-an',
    '/clinic/nasal/septoplasty'
  ]) {
    test(`${path} 轉到既有官網`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers()['location']).toBe(EXISTING_SITE);
    });
  }

  test('根目錄轉到預約頁', async ({ request }) => {
    const response = await request.get('/', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toBe('/booking');
  });

  test('預約頁的「回官網」連到既有官網', async ({ page }) => {
    await page.goto('/booking');
    await expect(page.getByRole('link', { name: '回官網' })).toHaveAttribute(
      'href',
      EXISTING_SITE
    );
    await expect(page.locator('a[href^="/clinic"]')).toHaveCount(0);
  });
});
