import { defineConfig, devices } from '@playwright/test';

// E2E 跑在**打包後的最終產物**上（WEB_ROOT=dist），不是原始 public/：這樣測到的
// 就是實際會部署的雜湊模組圖、CSP 與快取語意，而不是一份只有開發時存在的版本。
// webServer 的 command 會先 build 再啟動 server.mjs，所以 CI 只要一行 test:e2e。
const PORT = 3210;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'corepack pnpm run build && corepack pnpm run serve:dist',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    env: {
      TEST_ONLY_WEB_ENABLED: 'true',
      WEB_ROOT: 'dist',
      TEST_ONLY_WEB_PORT: String(PORT)
    }
  }
});
