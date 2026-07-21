# Web App

目前只提供旗標啟用的本機測試網站，作為合成預約流程的實機瀏覽器驗證。
它固定綁定 `127.0.0.1:3100`，不收集姓名、電話、Email 或醫療資料。

自 v2 模組化工作臺起，這些頁面把合成狀態放在瀏覽器 `localStorage`，**不呼叫
任何 API**，因此只需要一個視窗：

```powershell
$env:TEST_ONLY_WEB_ENABLED='true'
corepack pnpm --filter @beauessence/web dev:test-only
```

只有要直接操作 `/v1/test-only/*` 端點時才需要另開一個 API 視窗：

```powershell
$env:ENABLE_TEST_ONLY_BOOKING='true'
corepack pnpm --filter @beauessence/api dev
```

該 API 帶有 test-only 旗標時會拒絕綁定非 loopback 位址，避免未經驗證的寫入
端點被發佈到網路。

瀏覽 `http://127.0.0.1:3100` 後，可測試合成時段預約、取消、櫃檯完成到診、稽核與
不含病患資料的 outbox 意圖。關閉任一程序即清除其記憶體狀態。

執行 `corepack pnpm check:ui` 可檢查此頁仍保有無外部端點、無資料輸入欄位、
鍵盤跳至主內容、動態提示與焦點樣式等測試安全／無障礙基線。

正式病患預約站、取消入口、隱私政策與後台仍待 D-001～D-011 核准。不得將預約
交易、Calendar 寫入、薪資計算、服務帳號金鑰或直接 Firestore 存取放入瀏覽器。
