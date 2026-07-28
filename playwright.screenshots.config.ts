import { defineConfig, devices } from '@playwright/test';

const PORT = 3211;

export default defineConfig({
  testDir: './tests/ui-screenshots',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    colorScheme: 'light',
    contextOptions: {
      reducedMotion: 'reduce'
    },
    deviceScaleFactor: 1,
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium-reference',
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 1
      }
    }
  ],
  webServer: {
    command: 'corepack pnpm run build && corepack pnpm run serve:dist',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      TEST_ONLY_WEB_ENABLED: 'true',
      WEB_ROOT: 'dist',
      TEST_ONLY_WEB_PORT: String(PORT)
    }
  }
});
