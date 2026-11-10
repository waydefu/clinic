# Web App

目前提供本機測試網站與另行授權的到期靜態預覽，作為合成預約流程的實機
瀏覽器驗證。患者表單可輸入核准的姓名、電話、生日（月日必填、年份選填）、
身分證／居留證或護照、健保卡攜帶意向、患者備註，以及本次門診與來源標籤；
介紹人姓名只在對應來源下選填。不收 LineID 或性別，也不得輸入或依賴真實病患資料。

## 模式與資料邊界

- **預設瀏覽器本機模式**：合成狀態存在該瀏覽器的 `localStorage`，預約操作使用
  browser-local transport，不呼叫預約 API；清除該網站資料可重置本機狀態。
- **本機選用的內部測試模式**：loopback 的受支援頁面以
  `internalTestBooking=1` 選用 server-backed transport；預約操作可經 `apps/api`
  送至隔離測試後端，不適用「資料只留在瀏覽器」的保證。
- **C1 內部測試模式**：指定 C1 HTTPS 主機的受支援頁面使用 server-backed
  transport；瀏覽器模式判定不是授權或後端啟用的證據。後端仍須符合 IP-001
  開關、UTC 到期及隔離 project／emulator 的 fail-closed gate。

上述 server-backed 模式只限合成資料；不授權公開 production、部署或真實資料。
remote 執行狀態沒有由本文件讀回，為 `UNVERIFIED`。三種模式不得讓瀏覽器直接
存取 Firestore，亦不改變現行 intake 決策。

預設本機模式的 patient/admin controller 統一經過
`modules/api-client.js`，注入 `stagingRequest` 作 browser-local transport；
短暫的合成延遲用來實際驗證 pending 按鈕文字、disabled 重複送出防護與狀態列公告；
按鈕本身刻意不設 `aria-busy`：

```powershell
$env:TEST_ONLY_WEB_ENABLED='true'
corepack pnpm --filter @beauessence/web dev:test-only
```

預設瀏覽器本機模式**不需要另外啟動 API**。`AppModule` 透過
`InternalTestBookingModule` 掛入受 gate 保護的隔離測試路徑，預設關閉；
公開 production `/v1/bookings` 未獲授權。`apps/api` 另有決策登錄記載的
合成-only CAL-PILOT 路由；那不是 production Calendar。

在預設瀏覽器本機模式瀏覽 `http://127.0.0.1:3100` 後，可測試預約、取消、改期、
未到、到診、回診確認、排班發布與稽核。

執行 `corepack pnpm check:ui` 可檢查此頁仍保有無外部端點、患者欄位允許清單、
鍵盤跳至主內容、動態提示與焦點樣式等測試安全／無障礙基線。

`/booking` 預約／取消介面、`/privacy` 告知草稿與工作臺皆為合成測試面，
不是正式服務。server-backed 內部測試不等於正式病患預約／取消端點、核准並
發布的隱私政策或 production 身分驗證。不得將預約交易、Calendar 寫入、薪資
計算、服務帳號金鑰或直接 Firestore 存取放入瀏覽器。
