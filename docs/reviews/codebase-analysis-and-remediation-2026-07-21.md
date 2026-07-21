# 程式庫分析與修正紀錄 — 2026-07-21

## 範圍

對 Phase 1 workspace 進行一次全面靜態與實機檢查，並修正所有發現。修正前後
`corepack pnpm verify` 皆通過；測試由 33 個增加為 45 個。

本文件記錄的仍是合成資料測試工具，不是正式醫療資訊系統。

## 修正項目

### P1-1 專案沒有版本控制

`CONTRIBUTING.md` 規範 Pull Request 與 Issue、`AGENTS.md` 要求 approved change
record、`docs/` 下有 3 份 ADR 與 5 份 checkpoint，但目錄不是 Git repository。
整套稽核制度沒有可回溯的載體，`.gitignore` 的祕密防護也沒有生效對象。

已建立 repository 並以現況為第一個 commit，同時新增 `.gitattributes` 讓行尾
符合 `.editorconfig` 的 `end_of_line = lf`，並忽略 Firebase 部署快取與
`*-debug.log`。

### P1-2 API 的 loopback 保證可被環境變數破壞

`apps/web/server.mjs` 將 host 寫死為 `127.0.0.1` 且缺少旗標即拒絕啟動，但
`apps/api/src/main.ts` 使用 `process.env['HOST'] ?? '127.0.0.1'`。
`HOST=0.0.0.0 ENABLE_TEST_ONLY_BOOKING=true` 會把完全沒有認證的 test-only
寫入端點（`POST /v1/test-only/bookings`、`/complete`、`/schedule`、`/reset`）
暴露到區網，與文件宣稱的 double-gated loopback 不符。

新增 `resolveListenHost()`：test-only 啟用時只接受 `127.0.0.1`、`::1`、
`localhost`，其餘一律在 listener 建立前拋錯。以 `listen-host.test.ts` 覆蓋。

### P1-3 本機測試網站的 CSP 擋掉自己的管理工作臺

`server.mjs` 的 CSP 為 `connect-src http://127.0.0.1:3000`，未包含 `'self'`。
v2 重構後 `admin-bootstrap.js` 改為 `fetch('/admin-shell.html')`，該請求因此
被瀏覽器阻擋。

實機證據：以舊 CSP 載入 `http://127.0.0.1:3100/index.html`，頁面永遠停在
`index.html` 的靜態骨架（「讀取中」「正在載入合成測試狀態」「讀取角色中」與
`—` 佔位），管理工作臺從未掛載。改為 `connect-src 'self'` 後，工作臺完整
渲染（42 個可預約時段、8 個區段皆正常）。

Hosting 版 CSP 含 `'self'` 故不受影響，這是先前只在 Hosting preview 做回歸
驗證而未發現的原因。同時移除兩份 CSP 中的 `http://127.0.0.1:3000`：v2 頁面
不呼叫 API，公開預覽也不應獲准連線到訪客本機。

### P2-1 權限解析在失敗時升權

`modules/permissions.js` 的 `currentAccount()` 在找不到目前帳號時回退到第一個
active admin。這是 fail-open：只要 `localStorage` 的 `currentAccountId` 過期或
被竄改，使用者即靜默取得管理者權限。

已移除回退，改為回傳 `undefined`，由 `requirePermission` 拒絕。

### P2-2 儲存狀態未經驗證即使用

`modules/state-schema.js` 的 `loadState()` 只比對 `schemaVersion===2` 就直接
回傳 localStorage 內容，缺欄位會在 `currentAccount` 直接 TypeError。

新增 `isUsableState()`：檢查必要陣列、`workspace` 結構，以及 session 是否指向
一個存在且啟用的帳號；不符合即捨棄並回到 `initialState()`。這同時是 P2-1
fail-closed 之後的復原路徑，避免使用者卡在無權限畫面。

實機驗證：session 指向不存在帳號、以及 `{schemaVersion:2, workspace:{}}` 兩種
狀況皆正確重置為乾淨初始狀態，未發生靜默升權。

### P2-3 取消路徑未檢查權限，且以 caller 宣告的 origin 決定授權

`staging-store-v2.js` 的 `/bookings/{id}/cancellation` 是唯一沒有
`requirePermission` 的寫入路徑；`/bookings` 則以 `body.origin==='patient'`
跳過權限檢查，而 origin 由呼叫端自行宣告。

已集中為 `resolveActor()`，補上 `CANCEL_BOOKING` 檢查，並在該處明確註記
origin 不構成授權、不得移植到 `apps/api`（見 ADR-0001）。

### P3-1 死碼被結構檢查釘死並公開發佈

`app.js`(26.8KB)、`patient.js`(12KB)、`staging-store.js`(10.5KB) 與舊版
`check-test-only-ui.mjs` 已無人載入，但 `check-structure.mjs` 仍列為必要檔案，
且位於會被 Hosting 公開發佈的 `apps/web/public/`。舊 UI guard 亦已不在
`verify` 內執行。

四個檔案已刪除，結構檢查同步更新（73 → 69 個必要檔案）。歷史基線改由 Git 保存。

### P3-2 排版被檢查腳本釘死在壓縮狀態

`check-test-only-ui-v2.mjs` 以精確字串比對（例如
`elements['main-content'].focus({preventScroll:true});`），任何格式化都會使
guard 失敗——這正是 v2 模組被手寫成單行 1574 字元的原因，而被它取代的舊檔
反而排版正常。專案亦未配置任何 formatter 或 linter。

guard 的比對改為忽略空白（描述「必須存在哪個結構」而非「如何排版」），並導入
Prettier、新增 `format` 與 `check:format` script，`verify` 納入格式檢查。

### P3-3 零星

- `engines.node` 由釘死的 `24.14.0` 改為 `>=24.14.0 <25`，消除每次指令的警告。
- 移除 root 的 `firestore-debug.log`，`.gitignore` 改為涵蓋 `*-debug.log`。
- `apps/web/README.md` 原稱頁面「只能呼叫本機記憶體 API」，v2 之後已不成立，
  已改為單一視窗流程並說明何時才需要 API 視窗。

## 尚未變更

D-001～D-011 仍待核准。本次修正未觸及正式預約寫入路徑、Authentication、
Google Calendar、薪資規則或 NAS 整合。
