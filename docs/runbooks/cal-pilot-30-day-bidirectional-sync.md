# CAL-PILOT synthetic-only 雙向同步操作手冊

**適用範圍：** `beauessence-clinic-staging` 的 synthetic-only 測試。
**不適用：** 正式專案、正式日曆、真實姓名、電話、病歷、臨床內容或金流。

**目前狀態（2026-08-31）：** 既有 30 天候選已啟用；業主另核准延長至
`2026-11-28T04:51:37Z`，但仍須以精確 extension commit／diff 再確認後才可套用。
目前線上仍以既有 kill switch 為準。精確 revision、映像、期限、
初次同步與驗證結果見
[30 天 synthetic-only 部署紀錄](../reviews/2026-08-30-cal-pilot-30-day-deployment.md)。
延期候選與凍結邊界見
[2026-08-31 延期 change plan](../reviews/2026-08-31-cal-pilot-extension-change-plan.md)。

## 1. 使用者會看到什麼

- 員工工作臺與患者測試頁讀取同一個 API 可用時段鏡像。
- 初診使用整點／半點，回診使用 15／45 分；週三至週五
  12:00–20:00、週六 10:00–18:00。
- 預約只擋同一線別；`[忙碌]` 事件會擋所有重疊線別。
- Google 新增、修改或刪除不直接改預約；先進入待審佇列，核准時重新檢查
  時段、合成患者重複預約與版本衝突。
- 只有 `manager` 可切換或回滾來源；`manager` 與 `front_desk` 可審核。

### 未部署的受控修正候選

後續功能 PR 增加 `POST /v1/calendar/candidates/{candidateId}/correct`，但它目前只供
本機與 CI review，**不是線上操作步驟**。功能合併／部署前仍須另行核准。該端點只
接受封閉選項，核准時重新跑版本、source generation、時段重疊與患者重複檢查，並
由 Worker 更新同一個 Google 事件；candidate 建立時會在 server-side 封存 Google
`etag`，交易再次核對 mirror 後，Worker 的 `PATCH` 仍以 `If-Match` 防止審核後到寫回前
的競態。PATCH body 不帶 insert-only `event.id`，`etag` 也不回傳瀏覽器；不存在
「強制覆蓋」參數。

既有舊候選缺少上述版本快照，因此此未部署功能會 fail closed。未來若核准部署，先以
受控重新同步／migration 重建候選並驗證，不得把目前 mirror `etag` 直接補到舊候選。

## 2. 唯一允許的 Google 標題

| 類型 | 格式 | 例子 |
| --- | --- | --- |
| 預約 | `[預約] 患者代碼｜掛號別｜項目` | `[預約] A17｜初診｜止鼾` |
| 忙碌 | `[忙碌] 原因` | `[忙碌] 會議` |

患者代碼只能是已啟用的 A01～A30；掛號別只能是「初診／回診」；項目只能是
「止鼾／醫美」；忙碌原因只能是「會議／休假／教育訓練／其他」。說明、地點、
與會者與其他自由文字不會匯入。格式錯誤只會產生「需修正」候選。

既有日曆另觀察到「小編姓名 `(LINE)[來源]`／姓名、電話／服務／全麻或局麻」
這類斜線分隔舊標題。它**不是**本次允許格式，也不得自動轉入：姓名與電話是本次
明文禁止的真實個資，麻醉方式是臨床欄位。正式接線前若要遷移，必須另行核准資料
範圍，將小編／來源改為封閉代碼、患者改為系統識別碼、電話完全移出 Calendar，
並由臨床資料系統承接麻醉資訊；在此之前一律維持「需修正」、不擋位。

## 3. 架構與秘密邊界

```text
Hosting /v1/** → Cloud Run API → Firestore（瀏覽器規則全面拒絕）
                                   ↑ outbox / candidate
Cloud Scheduler → private Worker → Google Calendar API
```

Calendar ID、原始 Google event ID、etag、sync token、服務帳號金鑰與 HMAC
金鑰只存在私人 Worker／Secret Manager 邊界，不得回傳瀏覽器、寫入日誌、提交 Git
或進入 Hosting 建置產物。讀取與寫入使用不同服務帳號與不同最小 scope。

Hosting CSP 除同源外，只允許 Firebase Auth 的 Identity Toolkit／Secure Token
連線、Google API 的固定 iframe loader，以及本 staging 專案的 Firebase Auth
iframe；全部使用精確 host，不使用 wildcard，且瀏覽器仍不得直接連 Calendar API。

## 4. 部署前必要證據

1. 工作樹乾淨，候選 commit 已固定。
2. `pnpm verify`、Firestore Rules、供應鏈／秘密掃描及 Cloud Build
   容器建置通過。
3. API、Worker 映像以 registry `@sha256:` digest 固定。
4. Terraform plan 只含已核准的 staging／`asia-east1` 資源；Firestore `(default)`
   與 Identity Platform 既有資源先 import，禁止 replace。
5. 已記錄舊 API revision、舊 Worker revision 與舊 Hosting version。
6. Firebase CLI 先撤銷舊工作階段再重新登入；不可執行會印出 token 的登入清單。
7. 兩本 CAL-PILOT 日曆已分別授予 reader 唯讀與 writer 編輯權。

部署腳本預設拒絕執行；只有傳入兩個 immutable digest、精確 UTC 到期時間與
`-ConfirmApply` 才會繼續。輸入檔會先驗證：兩把服務帳號必須不同、source map
恰好兩個核准 ID、初始 manager allowlist 恰好一個 Google 帳號。

## 5. 部署順序

1. 套用 reviewed Terraform foundation；Scheduler 必須維持 paused。
2. 以專用 builder 在 Cloud Build 建立兩個映像，取得 Artifact Registry digest。
   已存在的服務建立 0% tagged revision；Cloud Run 不接受全新服務以 0% 建立，
   因此首次部署要先建立**不公開**的 100% revision，通過具身分 smoke 後才公開 API。
   Worker 全程保持私人。
3. 以短期 `run.invoker` 與隔離的 CLI 設定執行 API／私人 Worker synthetic smoke；
   完成後撤銷測試登入與 IAM binding。
4. 將流量切到精確 revision，更新 Scheduler 私人 URL，但仍保持 paused。
5. seed A01～A30、兩個 opaque source summary 與 30 天到期 kill switch。
6. 先部署 Firebase Auth Google provider、Firestore deny-all rules 與 indexes，再發布
   `cal-pilot` 30 天 Hosting preview。
7. 初始化 Identity Platform，把 preview domain 加入 allowlist，並強制啟用 TOTP。
   若專案已啟用，只接受官方回傳的精確「already enabled」結果為冪等成功；
   `authorizedDomains` 與 MFA 使用 Identity Toolkit `projects.config` GET／PATCH，
   保留既有 MFA provider，不用 Admin SDK 不支援的更新欄位。
8. 驗證 Google provider、TOTP 與 Firestore 規則後，才開啟 inbound／outbound；最後
   resume 五分鐘 Scheduler。

## 6. 每日操作與來源切換

- 狀態列須顯示健康度、待審數、衝突數與到期日。
- 來源切換先按「驗證」；完整視窗讀取、格式掃描與 write probe 全通過後才可切換。
- 切換成功後 Worker 先在新來源 upsert 並讀回驗證所有未來的系統事件，才刪除舊
  來源由系統管理的副本；外部事件不動。
- 切換失敗不更動 active source；上一來源保留為一鍵回滾。
- `410 Gone` 會清掉失效 sync token 並重建鏡像；重建只產生候選，不直接改預約。
- Terraform foundation 固定 Scheduler 的私人 Worker 目標；部署流程負責 active window
  的 resume／pause。active window 期間不可直接套用仍含 `paused = true` 的預設 plan，
  否則會把五分鐘同步停掉。

## 7. 緊急停止與回滾

順序固定：

1. pause `cal-pilot-five-minute-sync`。
2. 把 `inboundEnabled`、`outboundEnabled` 設為 `false`，寫入匿名 audit。
3. API／Worker 流量切回記錄的前一 revision。
4. Hosting `cal-pilot` channel 切回前一 version。

首次發布沒有前一個 Cloud Run revision 或 Hosting version，不得聲稱已回切。首版安全
停止是：依序 pause Scheduler、關閉 inbound／outbound、移除 API 公開呼叫權限，並讓
`cal-pilot` preview 到期或刪除；保留 Cloud Run revision、合成資料、候選與匿名 audit
供查核。後續發布才可依已記錄的前一 revision／version 執行第 3、4 步。

不要刪除合成預約、mirror、候選或匿名 audit。若疑似金鑰外洩，另停用對應
Secret version、撤銷 Google Calendar ACL 並輪替服務帳號金鑰。

## 8. 到期、續期與費用

應用程式在核准的精確 UTC 時間 fail closed；Scheduler 與 Hosting channel 也須
停止／到期。延長套用後的 kill switch 是 `2026-11-28T04:51:37Z`。
NT$30 的 50%／80%／100% 通知（約 NT$15／24／30）使用
2026-08-30～2026-11-28 的單一 custom period，不按月重設；Cloud Billing API
使用不含尾日的 `endDate`，所以 Terraform 寫入 `2026-11-29`。它是告警，不是硬上限。低流量可能接近
免費，但 Cloud Run、Scheduler、Firestore、Secret Manager、Artifact Registry、
日誌或流量都可能產生費用；正式環境不得假設免費。

延長測試、增加帳號、改 Calendar 白名單或接正式資料，全部視為新核准。

### 延期套用

1. 不可重跑 `seed-cal-pilot.mjs`，避免重設來源、游標或合成資料。
2. 以 `cal-pilot-extend.ps1` 核對精確 commit、API／Worker revision 與 digest、
   Hosting version、Scheduler、六個 Secret 的單一 enabled version、舊期限與精確
   兩本 enabled source ID 與 source generation；Secret version manifest 只能放版本號，不能放值。只有
   `-ConfirmApply` 才執行 Firestore transaction。
3. 該 transaction 只更新 `expiresAt` 並同時新增匿名
   `calendar_pilot_expiry_extended` audit；source generation 不變。
4. Terraform plan 必須只有既有 budget 的名稱與 custom period 更新，且為
   `0 added, 1 changed, 0 destroyed`；任何其他差異都停止。
5. Hosting 文案 release 只允許移除「30 天」字樣。發布前後都重新比對 81 個既有
   檔案，除 hashed client／對應 HTML manifest 外不得有功能差異。

### Hosting metadata-only 續期

- Preview channel 一次最多延長 30 天。只在剩餘七天內執行
  `cal-pilot-renew-hosting.ps1`；下一期限固定為
  `min(now + 30 days, 2026-11-28T04:51:37Z)`。
- 續期前後必須是同一 Hosting version；腳本只 PATCH `expireTime`，不得建立
  release、重建網站或改 Identity authorized domain。
- 若續期失敗或過期，不改 live channel；讓 preview fail closed，依緊急停止流程
  關閉 Scheduler 與 inbound／outbound，再由具名核准決定是否恢復。
