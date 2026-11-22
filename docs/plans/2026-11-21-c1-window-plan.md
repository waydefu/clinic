# 2026-11-21 C1 窗口計畫：重建映像、C6 同步與衝突重測、#532～#535 驗證與 Gate 2 規劃

**狀態：`PLAN-ONLY／待負責人核准`**。本文件僅為開窗前待核准計畫，不是核准紀錄，也不是任何雲端或功能證據；未經負責人現場明確同意，不得執行本檔任何雲端步驟。負責人現場核准僅涵蓋本檔列出的動作與次數上限，超出即停並回報。

- **窗口時間**：2026-11-21 晚上台北時間（預估 19:00–24:00 台北 = `2026-11-21T11:00:00Z`–`2026-11-21T16:00:00Z`）。
- **執行分工**：
  - **負責人**：在場逐項核准（含每個 `terraform plan` 核對與 IAM 變更逐筆同意）、親自以 Google＋TOTP 登入（櫃台帳號使用 Chrome）、於專用測試行事曆手動修改事件 1 次。
  - **Claude**：執行本計畫列出的雲端步驟（Cloud Build、Terraform plan／apply、Hosting 部署、維護開關、排程操作、唯讀讀回）；絕不接觸密碼、驗證碼或下載金鑰。
  - **Gemini**：僅負責撰寫本計畫書，不執行任何雲端操作。
- **依據**：[11/18 窗口計畫](2026-11-18-c2-c6-window-plan.md)、[11/18 窗口報告](../reviews/2026-11-18-c1-window-c2-c6.md)、[11/19 Gemini 長跑紀錄](../reviews/2026-11-19-gemini-long-run-record.md)、[11/17 IAM 讀回](../reviews/2026-11-17-iam-readback.md)、[RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md)。

## UTC 到期時間與剩餘時間對照

所有到期時間一律以 UTC 撰寫，開窗前必先核對當下剩餘時間，避免重演 11/18 因台北時間換算失誤只剩 47 分鐘的插曲（見 [11/18 窗口報告](../reviews/2026-11-18-c1-window-c2-c6.md) 發現 6）。

| 控制項 | 建議設定值（UTC） | 台北對應時間 | 若 `11:00Z` 開窗剩餘 | 若 `13:00Z` 開窗剩餘 | 若 `14:00Z` 開窗剩餘 | 關窗處理 |
| --- | --- | --- | --- | --- | --- | --- |
| `internal_test_booking_expires_at_utc` | `2026-11-22T15:59:59Z` | 11/22 23:59:59 | 約 29 小時（28h 59m 59s） | 約 27 小時（26h 59m 59s） | 約 26 小時（25h 59m 59s） | 關窗時以 `stage1` tfvars 關閉，不依賴自然到期 |
| `platform_controls/maintenance` `expiresAtUtc` | `2026-11-21T17:00:00Z` | 11/22 01:00:00 | 6 小時 | 4 小時 | 3 小時 | 關窗時**一律手動設回 `underMaintenance: true`** |

既有背景期限（本窗口不變更，供現場對照）：

- C1 `calendar_pilot_configuration/active` `expiresAt`：`2026-12-16T04:51:37.000Z`（11/16 已續期，見 [11/16 日曆續期讀回](../reviews/2026-11-16-calendar-gate2-readback.md)，距 `11/21 11:00Z` 尚餘約 24 天 17 小時）。
- CAL-PILOT 合成子範圍到期：`2026-11-28T04:51:37Z`（11/25 前由負責人決定是否延期）。
- 主管 7 天 session 自然到期（C3 七天讀回）：`2026-11-23T08:23:00Z`（距 `11/21 11:00Z` 尚餘約 45 小時 23 分）。

## 0. 護欄（違反即停）

1. **專案隔離**：只用 C1 `beauessence-clinic-stg-c1a01`，所有 `gcloud` 指令一律顯式帶 `--project beauessence-clinic-stg-c1a01`；絕不混用 CAL-PILOT `beauessence-clinic-staging`。
2. **合成資料與專用測試行事曆**：只用合成資料（假名、假電話）與密鑰 `c1-synthetic-calendar-id` v2 指向的專用測試行事曆；絕不碰真實病患、正式行事曆、正式 DNS。
3. **機敏與隱私隔離**：人員帳號與信箱在紀錄與報告中一律遮蔽，**絕不寫出任何真實帳號或櫃台測試帳號 email**；**絕不把私有 tfvars 值、密鑰值、帳密或正式資料寫進文件或版控**。
4. **保護 C3 七天讀回**：主管帳號於 11/16 在內建瀏覽器建立的 7 天 session 將於 `2026-11-23T08:23:00Z` 到期。11/23 讀回完成前，主管帳號在內建瀏覽器**不登出、不停用、不重新登入**；本窗口所有員工端操作一律使用櫃台測試帳號在 **Chrome**（另一組 cookie）執行。
5. **關窗三道回復**：worker 處理與排程觸發僅限本窗口；關窗必恢復維護 `true`、`stage1` tfvars（內測預約閘門與 worker 處理開關皆 `false`）、兩個排程 `PAUSED`、Hosting 靜態版。

## 1. 從 `main` 重建映像與更新本地 tfvars

### 目的

將 11/19 已合進 `main` 的三項修正部署至 C1 進行雲端實測（詳見 [11/19 Gemini 長跑紀錄](../reviews/2026-11-19-gemini-long-run-record.md)）：

- **#532**（`232adf71`）：`calendar-sync` 補上防同步拋錯導致進程崩潰的保護，並輸出不含個資的結構化 JSON 日誌。
- **#533**（`f2a34a62`）：修復 `calendar_pilot_configuration/active` 存有 `previousSourceId: null` 時被契約 schema 拒絕而必回 503 的缺陷。
- **#534**（`e1869b81`）：內測前端 HTTP client 逾時由 10 秒調為 30 秒（因應 API 冷啟動），逾時後唯讀回查 `GET /v1/bookings/:id` 收斂，並以 `finally` 確保列表刷新。

### 執行步驟

1. **鎖定當天 `main` 精確 SHA**：在乾淨的 `origin/main` 取得 40 碼 exact SHA（至少包含 `83b61081390159a923ebac4ffe46fab0ff755e6c`），確認該 commit 的 GitHub CI 全綠。
2. **用 Cloud Build 重建映像**：使用 [containers/internal-test.cloudbuild.yaml](../../containers/internal-test.cloudbuild.yaml)，顯式帶 `--project beauessence-clinic-stg-c1a01` 與 `--substitutions=_SOURCE_SHA=<EXACT_40_CHAR_SHA>` 同時建置 `api` 與 `worker` 兩個映像：
   - `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/api:<EXACT_40_CHAR_SHA>`
   - `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/worker:<EXACT_40_CHAR_SHA>`
   - 註：`internal-test-calendar-sync` 與 `internal-test-outbox` 共用同一個 `worker` 映像，差別僅在容器啟動參數（`calendar-sync` 執行 `node dist/calendar-sync/calendar-pilot-main.js`）。
3. **讀回不可變 `@sha256:...` digest**：從 Cloud Build 結果或 Artifact Registry 唯讀讀回 `api` 與 `worker` 的 `@sha256:...` digest；不得以可變 tag 寫入 tfvars。
4. **更新本機私有（不入版控）tfvars**：參考 [terraform.tfvars.example](../../infra/terraform/c1-internal-test-run/terraform.tfvars.example)，僅在本機私有目錄更新開窗 tfvars 的下列欄位（私密值、密鑰版本與帳號一律不入 repo）：
   - `exact_apply_authority_sha = "<EXACT_40_CHAR_SHA>"`
   - `api_image = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/api@sha256:<API_DIGEST>"`
   - `worker_image = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/worker@sha256:<WORKER_DIGEST>"`
   - `api_source_sha = "<EXACT_40_CHAR_SHA>"`
   - `worker_source_sha = "<EXACT_40_CHAR_SHA>"`
   - `internal_test_booking_enabled = true`
   - `internal_test_booking_expires_at_utc = "2026-11-22T15:59:59Z"`
   - `business_delivery_enabled = true`
   - `worker_processing_enabled = true`（兩個排程維持 `paused = true`，本窗均手動逐次觸發）
5. **API `apply` 後必從同一 SHA 重部署 Hosting**：每次 `c1-internal-test-run` API `apply` 完成後，必從同一 exact SHA 建置並以 `firebase.isolated-api-preview.json` 重新部署 Hosting，讓 #534 前端修正上線。切分支或結束前記得執行 `git checkout -- apps/web/public/vendor/domain/`，避免 predeploy 產物留在工作區。
6. **流量與版本讀回（RC-05 程序把關）**：apply 前後均唯讀確認 `internal-test-api`、`internal-test-outbox`、`internal-test-calendar-sync` 的 100% 流量指向最新 revision，且執行中的映像 digest 與步驟 3 一致。

## 2. `c1-internal-test-run` `terraform plan` 預期差異清單（多出即停）

執行 `terraform plan` 後須交由負責人逐筆檢視。因本次包含 #535 的 IAM 收斂變更，**僅允許出現下列三類差異**，且須負責人明確同意後才可 `apply`：

| 類別 | 預期資源 | 預期動作與差異內容 | 核准注意 |
| --- | --- | --- | --- |
| (a) Cloud Run 映像與開窗 env | `google_cloud_run_v2_service.api[0]`（`internal-test-api`） | `update`：新 `api` 映像 digest、`INTERNAL_TEST_SOURCE_SHA`、`INTERNAL_TEST_BOOKING_ENABLED=true`、`INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC=2026-11-22T15:59:59Z`、`BUSINESS_DELIVERY_ENABLED=true` | 確認 digest 與當天 exact SHA 一致 |
| (a) Cloud Run 映像與開窗 env | `google_cloud_run_v2_service.worker[0]`（`internal-test-outbox`） | `update`：新 `worker` 映像 digest、`INTERNAL_TEST_SOURCE_SHA`、`INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED=true` | 確認 digest 與當天 exact SHA 一致 |
| (a) Cloud Run 映像與開窗 env | `google_cloud_run_v2_service.calendar_sync["enabled"]`（`internal-test-calendar-sync`） | `update`：新 `worker` 映像 digest、`INTERNAL_TEST_SOURCE_SHA` | 啟動參數維持 `dist/calendar-sync/calendar-pilot-main.js` |
| (b) #535 IAM 變更（移除 1 筆） | `google_project_iam_member.terraform_ci_stage_f["roles/iam.serviceAccountUser"]` | `destroy`（1 筆）：移除 `c1-terraform-ci` 的專案層 `roles/iam.serviceAccountUser` | **屬 IAM 變更，須負責人檢視 plan 確認** |
| (b) #535 IAM 變更（新增 4～5 筆；C1 預期 5 筆） | `google_service_account_iam_member.terraform_ci_act_as_runtime["api" \| "worker" \| "scheduler" \| "builder" \| "calendar_sync"]` | `create`（5 筆）：C1 已啟用 `calendar_sync` 故為 5 筆；將 `c1-terraform-ci` 的 `roles/iam.serviceAccountUser` 收斂至這 5 個本模組 runtime 服務帳號 | **屬 IAM 變更，須負責人檢視 plan 確認** |
| (c) 已知排程漂移 | `google_cloud_scheduler_job.outbox_drain[0]` 與／或 `google_cloud_scheduler_job.calendar_sync["enabled"]` | `update`：已知 `retry_config.max_doublings` 差異；兩者 `paused` 維持 `true` | 不得意外解除暫停 |

**停止規則**：只要 `terraform plan` 出現上表以外的任何資源異動、任何其他 IAM 角色／成員異動、密鑰版本異動，或除 (b) 指定移除項目外的任何 `destroy`／`replace`，**立即停止，不執行 apply，回報負責人**。

## 3. 本窗口驗證測項與上限

### 開窗前唯讀核對

- 確認專用測試行事曆分享權限未異動（負責人在 Google Calendar 確認 `internal-test-outbox` 可修改事件、`internal-test-calendar-sync` 可檢視事件詳細資料；Claude 不改分享）。
- 確認 Firestore `calendar_pilot_configuration/active` 未過期（`2026-12-16T04:51:37.000Z`）且 `workerLeaseOwner` 為空。
- 確認主管 7 天 session 仍有效且未撤銷。
- 完成第 1–2 節的 `apply` 與 Hosting API 版部署後，將 `platform_controls/maintenance` 設為 `underMaintenance: false`（`expiresAtUtc: "2026-11-21T17:00:00Z"`）正式開窗。

### 測項清單

| 步驟 | 對應目標 | 動作與預期結果 | 上限 |
| --- | --- | --- | --- |
| 3.1 `calendar-sync` 健檢與日誌 | **#532＋#533 驗證** | 手動觸發 `internal-test-calendar-sync`（暫停中無法直接 `run`，採 `resume → run → pause`，15 秒內恢復暫停）。預期回 **200**（不再因 `previousSourceId: null` 回 503，亦不再 500 崩潰），且 Cloud Logging 出現 `service: "calendar-pilot-worker"`、不含個資的結構化 JSON 日誌（`worker_started`、`calendar_sync_completed`）。**若再現 5xx 或異常退出**：以 bash 唯讀拉回結構化錯誤日誌（含 `stderr`／`varlog/system`）即**立即停止** | `calendar-sync` ≤ 5（與 3.2、3.3 共用） |
| 3.2 合成建立、投影與同步收斂 | **C6 同步收斂（2.3）** | 負責人在 **Chrome** 以櫃台測試帳號登入 `/staff?internalTestBooking=1` → 建立 1 筆合成預約 → 手動觸發 `internal-test-outbox-drain`（`resume → run → pause`）→ 負責人於測試行事曆目視確認出現假名化事件（不含病患個資）→ 手動觸發 `internal-test-calendar-sync` 1 次 → 讀回確認同步收斂、健康狀態 `healthy`、無非預期寫入 | 登入 ≤ 2、建立 ≤ 2、`drain` ≤ 5、行事曆寫入 ≤ 10 |
| 3.3 外部異動衝突偵測 | **C6 衝突偵測（2.4）** | 負責人在專用測試行事曆手動修改該合成事件時間 **1 次** → 手動觸發 `internal-test-calendar-sync` 1 次 → 唯讀檢查 `calendar_pilot_audit_events`（預期出現衝突稽核事件）與員工頁衝突候選計數。若未觸發或未顯示計數，誠實記錄為「未證明（`NOT_PROVEN`）」，**不臨場改程式或設定** | 手動改事件 1 |
| 3.4 取消後畫面收斂與補償移除 | **#534 驗證** | 負責人在員工頁取消該合成預約（優先涵蓋冷啟動或正常延遲情境，不人為造錯）→ 確認畫面**不再誤顯示「服務暫時無法使用」**、列表立即刷新為「已取消」、原時段釋放 → 手動觸發 `internal-test-outbox-drain` 1 次 → 負責人目視確認測試行事曆該事件已被補償移除或標記取消 | 取消 ≤ 2（`drain` 併入 ≤ 5 上限） |
| 3.5 稽核讀回與櫃台登出 | 收尾驗證 | 唯讀統計窗口期間 `audit_events`、`calendar_pilot_audit_events` 新增筆數與 action（不讀內容）；櫃台帳號登出並讀回 `calendar_pilot_sessions` 該筆 `revokedAt` 有值（絕不碰主管帳號） | 唯讀＋櫃台登出 1 |

### 本窗口總寫入上限

| 項目 | 上限 | 備註 |
| --- | --- | --- |
| 合成預約建立 | ≤ 2 | 正常只需 1 筆 |
| 合成預約取消 | ≤ 2 | 正常只需 1 筆 |
| 櫃台登入 | ≤ 2 | Chrome 獨立 cookie |
| `internal-test-outbox-drain` 觸發 | ≤ 5 | `resume → run → pause` 期間若每分鐘自動執行亦計入 |
| `internal-test-calendar-sync` 觸發 | ≤ 5 | 同上 |
| 專用測試行事曆寫入（建立／手動改時間／補償） | ≤ 10 | 其中負責人手動改時間上限 1 |
| `platform_controls/maintenance` 寫入 | 2 | 開窗設 `false` 1 次、關窗設 `true` 1 次 |
| Terraform `apply` | `c1-internal-test-run` ≤ 2（開窗＋關窗）；第 5 節 ≤ 1；第 6 節 ≤ 1 | 各自獨立看 plan 核准 |

## 4. Gate 2「真實日曆至少 50 次正常收斂」執行規劃

本節為規劃，**不包含在 11/21 本窗口執行授權內**。依據 [50 次以上隔離合成日曆驗收作業單](../runbooks/calendar-pilot-synthetic-fault-observations.md)、[RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md) 與 [決定登記](../product/phase-1-decision-register.md) `APPROVAL-RC-2026-11-14`（只接專用合成日曆與合成資料；CAL-PILOT 合成子範圍於 `2026-11-28T04:51:37Z` 到期，須於 **11/25 前**由負責人決定是否延期）。

### 前提條件

- 必須先通過 11/21 第 3 節的單輪同步收斂（3.2）與衝突（3.3）驗證，確認無系統性異常。
- 每次批次試驗前須取得負責人另行獨立核准（明列 exact SHA、授權引用編號、日期時窗與當窗上限），且由負責人在場登入提供 session／CSRF。

### 執行方式與分窗規劃

1. **怎麼跑**：
   - 明確區分「**50 次正常收斂**」（Gate 2 必要條件）與「**八種故障注入**」（lease 遺失、412、503、結果不明、重複事件、cursor 失效、重啟續掃、stuck owner；故障注入須另行授權，未獲核准前不得製造）。
   - 沿用既有試驗腳本 `scripts/calendar-pilot-fault-trials.mjs`（預設 dry-run 不連外；實跑須具備 `--execute-synthetic-trials`、經授權的操作者 `--driver <path>`、新輸出檔 `--out <path>`，以及環境變數 `CALENDAR_PILOT_TRIAL_PROJECT_ID=beauessence-clinic-stg-c1a01`、`CALENDAR_PILOT_TRIAL_CALENDAR_ID` 指向專用合成日曆、`CALENDAR_PILOT_TRIAL_AUTHORIZATION` 授權引用）。
   - 固定一組 `synthetic_` 開頭的 `linkId` 集合，每次 trial 皆等待**完整一輪掃描**完成，不得把單輪掃描的多個 slice 拆算成多次操作。
2. **每次窗口寫入上限與窗口數估算**：
   - 建議單窗執行 **20～25 次 trial**，上限設為：**單窗行事曆寫入 ≤ 50 次、Cloud Run 呼叫 ≤ 60 次**，每窗耗時約 30–45 分鐘（含開關窗與讀回）。
   - 達成 ≥ 50 次正常收斂估算需 **2～3 個獨立窗口**（例如 25＋25，或 20＋20＋15 留餘裕），建議排於 **2026-11-22 至 2026-11-25** 完成，避開 **11/26 程式凍結**，並於 11/25 前同步決定 CAL-PILOT 子範圍是否延期。
3. **成本估算**：
   - Google Calendar API：免費，且單窗 ≤ 50 次寫入遠低於每日配額。
   - Cloud Run（`api`／`outbox`／`calendar-sync`）、Firestore 讀寫與 Cloud Logging：3 個窗口合計預估 **< NT$10**（低於 C1 NT$2,000 警示預算的 1%；警示預算並非硬性上限，每窗結束必確認排程皆回到 `PAUSED`）。
4. **怎麼計數與留證據**：
   - 每輪配發唯一遞增正整數 `trial` 流水號，每次完整列出同一組 `synthetic_` `linkId` 集合，並對 Calendar 全部分頁與 Firestore 正本逐筆比對。
   - 每個成功 link 須滿足 `eventCount === 1`、正本 ID 正確，且依作業單欄位順序（`id`、`linkId`、`status`、`title`、`startsAt`、`endsAt`，時間轉 UTC ISO）計算的小寫 SHA-256 `expectedDigest` 與 `observedDigest` 完全一致，重跑一輪無額外 provider mutation 才記 `converged`。
   - 離線驗證：執行 `node scripts/calendar-pilot-observation-check.mjs <sanitized-json>`，確認結果滿足 `trials >= 50`、`blocked == 0`、`conflict == 0`、`allConverged == true`（exit 0）。
   - 證據入庫：將 exact SHA、授權引用、各窗口起迄 UTC 時間、離線檢查結果與去識別摘要整理存入 `docs/reviews/`（例如 `docs/reviews/2026-11-25-gate2-50-convergence-readback.md`）；**絕不將原始事件、個資、email、URL 或憑證寫入檔案或版控**。
5. **失敗怎麼停**：
   - 偵測到非合成資料、目標專案或日曆不符；
   - 發現重複事件且缺少三項 ownership 證明（不盲刪）；
   - 連續 3 次 5xx 或進程異常退出；
   - 出現無法解釋的 `blocked` 或 `conflict`（**不得計入收斂**，亦絕不自行清除 Firestore `workerLeaseOwner` 或強制接管 stuck owner）。
   - 上述任一成立即**立即停止當次窗口**、保留唯讀證據並依第 7 節關窗收尾。

### 實跑指令與每窗 checklist（正常收斂 driver）

driver：`scripts/calendar-pilot-convergence-driver.mjs`，只做正常收斂、不含八種故障注入，自身不建立任何 Calendar／Firestore 連線；外部存取全由操作者另備的 ports 模組提供（匯出 `createPorts({ calendarId, projectId })`，回傳 `readScanMarker()`、`readExpected(linkId)`、`listEvents(calendarId, linkId)`，可選 `mutate(linkId, trial)`）。driver 拒絕執行的條件：專案不是 `beauessence-clinic-stg-c1a01`（`CALENDAR_PILOT_TRIAL_PROJECT_ID`，若有設 `GOOGLE_CLOUD_PROJECT` 也須相同）、日曆 ID 不是 `synthetic…@group.calendar.google.com`（只讀環境變數 `CALENDAR_PILOT_TRIAL_CALENDAR_ID`）、linkId 非 `synthetic_` 開頭、`CALENDAR_PILOT_DRIVER_MAX_WRITES` 不在 1～50（預設 50）。遇下列即丟錯停止（`fault-trials` 只在全部完成後才寫輸出檔）：該 link 不是恰好一筆事件或與 Firestore 期望不符、等不到新一輪完整掃描（`lastSuccessfulSyncAt` 沒前進）、連續 3 次 5xx、寫入達上限。

```text
CALENDAR_PILOT_TRIAL_PROJECT_ID=beauessence-clinic-stg-c1a01 CALENDAR_PILOT_TRIAL_CALENDAR_ID=<專用合成日曆 ID，不入版控> CALENDAR_PILOT_TRIAL_AUTHORIZATION=<授權引用編號> CALENDAR_PILOT_DRIVER_PORTS=scripts/calendar-pilot-live-ports.mjs CALENDAR_PILOT_DRIVER_MAX_WRITES=50 node scripts/calendar-pilot-fault-trials.mjs --links synthetic_a,synthetic_b --trials 50 --limit <本窗 trial 數> --execute-synthetic-trials --driver scripts/calendar-pilot-convergence-driver.mjs --out <新檔路徑>（後續窗口把 --out 換成 --resume <同一檔案>）
node scripts/calendar-pilot-observation-check.mjs <新檔路徑>
```

`scripts/calendar-pilot-live-ports.mjs` 是現成的 live ports：Firestore 走 firebase-admin（ADC），Calendar 以原生 fetch 打 Calendar REST v3，access token 取自 `gcloud auth application-default print-access-token` 子行程（開窗前須以含 Calendar scope 的 ADC 登入，且不讀任何金鑰檔）；每個 trial 由 `triggerScan` 依序執行 `gcloud scheduler jobs resume`、`run`（等 10 秒）、`pause` `internal-test-calendar-sync`（固定 `--project beauessence-clinic-stg-c1a01 --location asia-east1`，run 失敗也會 pause）。每次外部呼叫前都重驗專案與合成日曆。本機不實跑，只在核准的窗口使用。

每窗 checklist：

1. 負責人已核准本窗（exact SHA、授權引用、時窗、寫入上限），先不加執行旗標跑一次 dry-run 核對計畫。
2. 核對環境變數三項（專案、日曆、授權）與 `CALENDAR_PILOT_DRIVER_MAX_WRITES` ≤ 50；兩個排程維持 `PAUSED`，每個 trial 的完整掃描由負責人核准的手動觸發產生。
3. 每個 trial 觀察 `lastSuccessfulSyncAt` 前進後才取樣；任何停止條件成立即停，保留唯讀證據，走第 7 節關窗。
4. 分窗累積：`fault-trials` 每完成一個 trial 就原子寫入輸出檔（先寫 `.tmp` 再 rename），中途停止不丟已完成筆數。第一窗用 `--out <新檔路徑> --limit <本窗 trial 數>`，之後每窗改用 `--resume <同一檔案> --limit <本窗 trial 數>` 續跑（`--trials` 仍填總數 50，`--links` 須與前窗相同；`--out` 與 `--resume` 擇一）。總數不足 50 時 `observation-check` 照舊判不通過。
5. 結束後跑 `calendar-pilot-observation-check.mjs`，要求 exit 0 且 `allConverged: true`；摘要入庫，不放原始事件、email、URL 或憑證。

## 5. C5 每週備份 Terraform（PR #528）處理方案

- **模組與內容**：`infra/terraform/c5-firestore/`（見 [c5-firestore README](../../infra/terraform/c5-firestore/README.md)），依 `BACKUP-B-2026-11-15` 新增週日每週備份、保留 14 週（`8467200s`），既有每日備份（30 天）、PITR（7 天）與 `export_chunk_ttl` 不變。每月專案外匯出（2 年）仍待負責人決定外部儲存位置，不在本模組。
- **建議處理方式（待負責人現場擇一）**：
  - **方案 A（建議併入 11/21 窗口末尾）**：於第 3 節主測項完成、關窗前，獨立執行 `infra/terraform/c5-firestore/` `terraform plan`。**預期差異僅有 `+1`（新增 `google_firestore_backup_schedule.weekly[0]`）、`0 change`、`0 destroy`、`0 replace`**。負責人現場檢視 plan 確認無誤並明確核准後才 `apply`，並以 `gcloud firestore backups schedules list --project beauessence-clinic-stg-c1a01` 讀回確認每日與每週兩條排程均存在。
  - **方案 B（拆出另排）**：若 plan 出現任何預期外異動（例如變動資料庫本體、每日備份或 TTL），或 11/21 主測項時間不足，直接跳過不 apply，另排窗口處理。

## 6. `c1-foundation`（#535 的 CI 帳號降權與 WIF 綁定歸零）— 獨立 IAM 變更節

> **IAM 變更警示**：本節屬 **IAM 與 Workload Identity Federation（WIF）權限變更，須由負責人逐項核准**，與第 2 節 `c1-internal-test-run` 完全分開執行，不得混在同一批核准中。若本窗時間不足或負責人希望改排獨立 IAM 窗口，可直接延後，不影響第 3 節與關窗。

- **對應來源**：PR #535（`1cd3af92`），模組 `infra/terraform/c1-foundation/`（見 [c1-foundation README](../../infra/terraform/c1-foundation/README.md) 與 [11/17 IAM 讀回](../reviews/2026-11-17-iam-readback.md)）。
- **私有 tfvars 前置**：沿用本機私有 `c1-foundation` tfvars，確認已填入 `exact_apply_authority_sha`、GitHub 數字 ID `github_repository_id = "1312536037"`、`github_repository_owner_id = "123912239"`、`github_allowed_refs = ["refs/heads/main"]`，並維持預設 `github_wif_binding_enabled = false`（`billing_account_id` 等私密值維持本機私有，不入 repo）。

### `c1-foundation` `terraform plan` 預期差異清單（多出即停）

| 項目 | 預期資源 | 預期動作與內容 | 核准注意 |
| --- | --- | --- | --- |
| CI 專案層降權（B-01／NEW-10 CI 子項） | `google_project_iam_member.terraform_ci["roles/resourcemanager.projectIamAdmin"]`、`["roles/storage.admin"]` | `destroy`（2 筆）：移除專案層 `projectIamAdmin` 與 `storage.admin`；保留其餘 **7 筆**（`serviceUsageAdmin`、`iam.serviceAccountAdmin`、`iam.workloadIdentityPoolAdmin`、`secretmanager.admin`、`logging.admin`、`monitoring.admin`、`pubsub.admin`） | 確認只移除這 2 筆、剩餘 7 筆不變 |
| WIF provider 條件收緊（B-02） | `google_iam_workload_identity_pool_provider.github[0]` | `update`：`attribute_mapping` 補上 `attribute.workflow_ref`；`attribute_condition` 套用 `repository == 'waydefu/clinic'`、`repository_id == '1312536037'`、`repository_owner_id == '123912239'` 與 `refs/heads/main` | 逐項核對數字 ID 與 ref |
| WIF 綁定歸零（B-02，W3-05 Q8=A） | `google_service_account_iam_member.terraform_ci_wif` | `destroy`（1 筆）：移除既有 1 筆 WIF 綁定，歸零為 0 筆 | 確認目前無任何 GitHub workflow 使用 WIF |
| 已知停用狀態差異 | `google_service_account.terraform_ci[0]` | 11/17 已由負責人核准停用 `c1-terraform-ci`，plan 可能顯示將該帳號改回啟用（`disabled: true → false`） | **須負責人決定 apply 後是否立即以 `gcloud iam service-accounts disable` 維持停用**（建議預設：apply 後維持停用） |

### 明確排除與 apply 後讀回

- **排除項（留待後續 IAM 窗口）**：不在 Terraform 內的 **NEW-10 雲端項**——預設 Compute Engine 服務帳號與 Cloud Build 服務帳號對 `${PROJECT_ID}-tfstate` bucket 持有的 `roles/storage.objectAdmin`，本窗不處理。
- **apply 後唯讀讀回**：執行 `gcloud projects get-iam-policy`、`gcloud iam workload-identity-pools providers describe`、`gcloud iam service-accounts get-iam-policy`、`gcloud iam service-accounts describe`（一律帶 `--project beauessence-clinic-stg-c1a01`），確認 7 筆專案層角色、WIF 條件、0 筆 WIF 綁定與帳號啟用／停用狀態符合負責人決定。

## 7. 關窗步驟（沿用 `stage1`）與停止條件

### 關窗步驟（嚴格依序執行）

1. **維護模式設回 `true`**：手動將 Firestore `platform_controls/maintenance` 設回 `underMaintenance: true`（不論 `expiresAtUtc` 是否已過，均手動復原）。
2. **`c1-internal-test-run` 套用 `stage1` tfvars**：以本機私有 `stage1` tfvars（`internal_test_booking_enabled = false`、`business_delivery_enabled = false`、`worker_processing_enabled = false`、兩排程 `paused = true`、到期退回 `stage1` 既定過期時間；建議同步更新本次新映像 digest／source SHA，避免誤退回 11/16 舊映像）跑 `terraform plan` → 負責人檢視確認 → `terraform apply`。
3. **Hosting 換回靜態版**：以 `firebase.isolated-preview.json` 重新部署 Hosting，切斷 `/v1/**` 轉送；完成後執行 `git checkout -- apps/web/public/vendor/domain/` 恢復工作區。
4. **清理測試行事曆殘留**：若第 3 節補償未完全移除測試事件，由負責人於 Google Calendar 手動刪除並記明。
5. **關窗讀回 checklist**（全項唯讀確認並記入報告）：
   - [ ] 兩個排程（`internal-test-outbox-drain`、`internal-test-calendar-sync`）均為 `PAUSED`
   - [ ] `internal-test-outbox` 環境變數 `INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED=false`
   - [ ] `internal-test-api` 環境變數 `INTERNAL_TEST_BOOKING_ENABLED=false`、`BUSINESS_DELIVERY_ENABLED=false`、到期時間為 `stage1` 過期值
   - [ ] 直連 API `GET /v1/slots` 與 `POST /v1/bookings` 均回 **503**
   - [ ] Hosting `/booking`、`/staff` 回 **200**，且靜態版 `/v1/**` 回 **404**
   - [ ] `platform_controls/maintenance` 為 `underMaintenance: true`
   - [ ] 櫃台測試帳號 `disabled: false` 且本次櫃台 session `revokedAt` 有值
   - [ ] **主管 7 天 session 完好**：`calendar_pilot_sessions` 中 11/16 建立的主管 7 天 session 仍有效、未撤銷（留待 `2026-11-23T08:23:00Z` 起做 C3 七天讀回）
   - [ ] outbox 無 pending；`calendar_pilot_configuration/active` 無殘留 `workerLeaseOwner`
   - [ ] 若執行第 5 節：Firestore 每日（30 天）與每週日（14 週）備份排程均讀回存在
   - [ ] 若執行第 6 節：`c1-terraform-ci` 權限、WIF 條件、0 筆 WIF 綁定與停用狀態符合負責人決定
6. **報告與台帳更新**：將結果寫成 `docs/reviews/2026-11-21-c1-window-readback.md`（遮蔽人員帳號、不含憑證與私有 tfvars），同步更新 [C2～C6 部署申請草稿](2026-11-15-c2-c6-rc-deployment-requests.md)、[RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md) 與本計畫書狀態。

### 停止條件

以下任一項成立即**立即停下、保留唯讀證據、照本節步驟關窗並回報負責人**：

- 出現任何非合成資料，或目標專案非 `beauessence-clinic-stg-c1a01`、目標日曆非專用測試日曆（`c1-synthetic-calendar-id` v2）。
- 任一模組的 `terraform plan` 出現預期清單以外的資源變動、非預期 IAM 異動或非預期 `destroy`／`replace`。
- 本窗口任一寫入或觸發上限用完。
- 主管 7 天 session 出現失效或被撤銷風險。
- `internal-test-calendar-sync` 再現 5xx 或容器異常退出（讀回結構化錯誤日誌後即停，不臨場改碼）。
- API 或 worker 出現非預期 5xx 連續 3 次以上。
- `calendar_pilot_configuration/active` 出現無法解釋的 `workerLeaseOwner` 卡住或非預期 `blocked`（不自行清除 owner）。

## 8. 待負責人現場核准與決定事項

1. **開窗範圍與上限**：核准本計畫書第 1～3 節、第 7 節內容、UTC 到期時間與寫入上限。
2. **`c1-internal-test-run` plan（含 #535 IAM）**：現場檢視 plan 確認符合第 2 節清單後核准 apply。
3. **C5 每週備份（第 5 節）**：現場決定併入本窗末尾（方案 A，看 plan 後核准）或拆出另排（方案 B）。
4. **`c1-foundation` IAM 變更（第 6 節）**：現場決定是否於本窗獨立執行；若執行，逐筆看 plan 核准，並確認 apply 後是否立即維持 `c1-terraform-ci` 停用（建議預設：維持停用）。
5. **Gate 2 50 次正常收斂（第 4 節）**：確認待第 3 節通過後，於 11/22–11/25 分 2～3 個獨立窗口另行核准執行（不在本窗實跑）。
