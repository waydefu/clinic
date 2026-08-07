import { defineConfig, devices } from '@playwright/test';

// E2E 跑在**打包後的最終產物**上（WEB_ROOT=dist），不是原始 public/：這樣測到
// 實際會部署的雜湊模組圖，test-only server 也模擬 Firebase 的 CSP 與快取語意。
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
  // 兩個 project，但**不是**把每一支測試都跑兩遍。
  //
  // 2026-08-06 查到的缺口：先前只有 `Desktop Chrome` 一個 project，於是所有「手機
  // 版」測試其實都是把桌機 Chrome 的視窗縮小——沒有 touch、沒有行動 UA、
  // deviceScaleFactor 永遠是 1。直接後果是 clinic-site.css 裡五處
  // `@media (hover: hover)` 的**無 hover 分支從來沒有被執行過**：真手機上那些
  // 只在 hover 時出現的樣式到底怎麼表現，沒有任何測試看得到。
  //
  // 用 `testMatch` 把行動 project 限縮在 mobile 這一組（見 scripts/e2e-groups.mjs），
  // 因此新增的執行量只有那兩支 spec，不是整套 191 個測試再跑一次。桌機專屬的
  // 流程測試也不會在手機模擬下產生沒有意義的失敗。
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-device',
      // 路徑分隔符錨定是必要的：沒有它，`responsive.spec.ts$` 也會吃到
      // `role-maintenance-responsive.spec.ts`，把一支桌機流程測試拖進手機模擬跑，
      // 然後在點不到的登出鈕上失敗。
      testMatch: /[\\/](?:mobile-layout|responsive)\.spec\.ts$/,
      use: { ...devices['Pixel 7'] }
    },
    {
      // WebKit 引擎覆蓋。**先前這裡完全沒有**：上面兩個 project 的
      // `Desktop Chrome` 與 `Pixel 7` 都是 Chromium 的 device descriptor，
      // 而 descriptor 與 engine 是兩件事——套上 iPhone descriptor 跑的仍然是
      // Chromium。所以「沒有 WebKit 覆蓋」是這份設定的選擇，不是工具的限制。
      //
      // 只跑官網的結構那一支。字級與版面那支（typography）帶著工作臺的登入
      // 流程，把整條 auth 拉進 WebKit 的代價與收穫不成比例；官網才是患者用
      // iPhone 開的東西。比照 mobile-device 已有的 testMatch 收斂手法。
      //
      // **它不是實體 iOS Safari。** 涵蓋不到真實軟鍵盤、OS 層 Dynamic Type
      // 與系統字級、瀏覽器 chrome、安全區域，以及平台輔助科技整合。
      // 規則書 §5.3 的實體裝置矩陣不會因為這個 project 而被滿足。
      name: 'webkit',
      testMatch: /[\\/]clinic-site\.spec\.ts$/,
      use: { ...devices['Desktop Safari'] }
    }
  ],
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
