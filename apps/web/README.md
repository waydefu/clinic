# Web App

目前只提供旗標啟用的本機測試網站，作為合成預約流程的實機瀏覽器驗證。
它固定綁定 `127.0.0.1:3100`，不收集姓名、電話、Email 或醫療資料。

自 v2 模組化工作臺起，這些頁面把合成狀態放在瀏覽器 `localStorage`，**不呼叫
任何 API**，因此只需要一個視窗：

```powershell
$env:TEST_ONLY_WEB_ENABLED='true'
corepack pnpm --filter @beauessence/web dev:test-only
```

**不需要另外啟動 API。** 這些頁面的狀態完全在瀏覽器。`apps/api` 目前只提供
`/v1/health`，預約寫入路徑只有 repository 與 Emulator 測試，尚未開放為路由
（Phase 1 gate）。

瀏覽 `http://127.0.0.1:3100` 後，可測試預約、取消、改期、未到、到診、回診確認、
排班發布與稽核。資料只保存在該瀏覽器，清除網站資料即可重置。

執行 `corepack pnpm check:ui` 可檢查此頁仍保有無外部端點、無資料輸入欄位、
鍵盤跳至主內容、動態提示與焦點樣式等測試安全／無障礙基線。

正式病患預約站、取消入口、隱私政策與後台仍待 D-001～D-011 核准。不得將預約
交易、Calendar 寫入、薪資計算、服務帳號金鑰或直接 Firestore 存取放入瀏覽器。
