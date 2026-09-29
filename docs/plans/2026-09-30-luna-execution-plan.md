# GPT-6 Luna 逐步執行計畫（2026-09-30）

**對象：** GPT-6 Luna，在業主筆電（Ubuntu arm64）執行。**照順序做，不要自己改設計。**
**依據：** `BD-POLICY-2026-09-29`、`OWNER-BATCH-2026-09-29B`、`EXPORT-CONTACT-STORAGE-2026-09-29`、
`BOOKING-NOTE-STORAGE-2026-09-29`、`CALENDAR-TITLE-FORMAT-2026-09-29`（見
[決策登記](../product/phase-1-decision-register.md)）、ADR-0002、ADR-0007、ADR-0008、ADR-0009。
**流程：** Luna 開 PR → Claude 審查 → 業主合併（`OWNER-BATCH-2026-09-29B` 第 8 項）。
**不授權：** 部署、`terraform apply`、真實資料、production。L6 只準備清單，指令交給業主。

## 0. 每個工作包都要照做的規則

1. 開工前：
   ```bash
   git fetch origin && git switch -c cursor/luna-<包代號> origin/main
   corepack pnpm install --frozen-lockfile
   corepack pnpm --filter @beauessence/domain --filter @beauessence/contracts run build
   ```
2. **一個工作包 = 一個 PR。** 不疊在別的未合併分支上（業主用 squash 合併，疊了會衝突）。
   前一包沒合併就先停，不要開下一包。
3. 只改該包「要改的檔案」列出的檔案；需要改其他檔案 → **停止並回報**。
4. 測試資料只用合成值（姓名「合成患者甲」、電話 `0900000xxx`）。不得出現真實姓名、電話。
5. 角色字串只從 `packages/domain/src/roles.ts` 取；測試用
   `ROLES.filter(r => CANDIDATE_ROLE_PERMISSIONS[r].includes('<權限>'))` 找角色，
   範例見 `apps/api/src/business-delivery/business-export.application-service.test.ts`。
6. 新權限一定要：加進 `apps/api/src/platform/authorization/rbac.ts` 的 `Permission` 聯集與
   `manager` 清單；在 `apps/api/unrouted-inventory.json` 的 `capabilityGates` 加一筆
   （格式照 `business_data_export`）；在程式裡用**字面字串**呼叫 `evaluateAccess`
   （`permission: 'xxx'`，不能用變數）。**不要**在 `Permission` 聯集的註解裡寫分號
   （檢查腳本會截斷）。
7. 送 PR 前全部要過（貼實際數字到 PR）：
   ```bash
   corepack pnpm run check:types
   corepack pnpm run check:lint
   node scripts/check-architecture.mjs
   corepack pnpm run check:sync
   node scripts/check-docs-links.mjs
   npx prettier --check .
   corepack pnpm run test:unit
   corepack pnpm run test:rules      # Firestore emulator，需 Java
   corepack pnpm run check:perf      # 動到 apps/web 才需要
   ```
   改了 `packages/domain` 一定要跑 `corepack pnpm run sync:domain` 並一起提交
   `apps/web/public/vendor/domain/*`。
8. **emulator 測試規則：** 同一個模擬資料庫被所有測試共用。每個新 emulator 測試檔在
   `beforeEach` **和** `afterAll` 都要清掉自己用到的集合（範例：
   `tests/firestore/business-delivery-export.test.ts` 的 `wipe()`）。
9. commit 訊息用英文，結尾加 `Co-Authored-By` 行；用 `git commit -F <檔案>`。
10. PR 說明用繁體中文，包含：摘要、依據的決定 ID、沒做的事、驗證表（每個檢查 PASS／FAIL／
    NOT_RUN＋原因＋數字）。
11. **停止條件（任何一包都適用）：** 測試失敗且原因不是本包造成、需要改規則／ADR／Safety Floor、
    需要雲端操作、發現決策登記沒寫到的政策問題 → 立刻停、在 PR 或訊息中寫明、等回覆。

---

## L1 封存／復原／永久刪除（CP-05）

**依據：** `BD-POLICY-2026-09-29` §2、`OWNER-BATCH-2026-09-29B` 第 4、5 項。
**分支：** `cursor/luna-cp05-retention`

### 規則（寫死，不得更改）

| 項目 | 值 |
| --- | --- |
| 單位 | 病患（連同其所有預約） |
| 誰能做 | 只有 `manager`；新權限 `manage_business_retention` |
| 封存 | 需重新驗證（`x-reauth-id-token`，同 CP-03 的 `FreshReauthenticationVerifier`） |
| 可復原期 | 封存後 30 天（`RetentionPolicy.recoverableDays = 30`，放進 `BD-POLICY-2026-09-29` 的政策表） |
| 永久刪除 | 只能對「已封存且滿 30 天、沒有 legal hold」的病患；需重新驗證＋`reasonCode` |
| 30 天到 | **不自動刪**，只出現在「待永久刪除」清單 |
| legal hold | 只有 manager 能設定／解除；有 hold 就不能永久刪除 |
| 有未來的有效預約 | 拒絕封存（409），請先取消 |
| 稽核紀錄 `audit_events` | **保留**（3 年），永久刪除時不動 |
| 使用事件 `bd_usage_events`、匯出紀錄 `bd_export_log` | 保留（沒有個資） |

### 要改的檔案

- `packages/domain/src/business-delivery-policy.ts`：政策表加 `retention: { recoverableDays: 30 }`
- `packages/domain/src/business-delivery-retention.ts`：**重用** `planRetentionOperation`，不要重寫
- `packages/contracts/src/business-delivery.ts`：加下列 schema
- 新檔 `apps/api/src/firestore/business-delivery-retention.repository.ts`
- 新檔 `apps/api/src/business-delivery/business-retention.application-service.ts`＋`.test.ts`
- 新檔 `apps/api/src/business-delivery/business-retention.controller.ts`
- `apps/api/src/business-delivery/business-delivery.module.ts`、`business-delivery.tokens.ts`
- `apps/api/src/platform/authorization/rbac.ts`、`apps/api/unrouted-inventory.json`
- `apps/api/src/patients/patient-directory.ts`：查詢與清單要**排除已封存病患**
- 新檔 `tests/firestore/business-delivery-retention.test.ts`
- 新檔 `docs/adr/0010-business-delivery-retention.md`，並加進 `docs/README.md` 的 ADR 清單

### 路由

| 路由 | body | 回應 |
| --- | --- | --- |
| `POST /v1/business-delivery/retention/archive` | `{ idempotencyKey, patientId }`＋reauth header | `{ patientId, state:'archived', restorableUntil }` |
| `POST /v1/business-delivery/retention/restore` | `{ idempotencyKey, patientId }` | `{ patientId, state:'active' }` |
| `POST /v1/business-delivery/retention/permanent-delete` | `{ idempotencyKey, patientId, reasonCode }`＋reauth header | `{ patientId, state:'deleted', layers }` |
| `POST /v1/business-delivery/retention/legal-hold` | `{ idempotencyKey, patientId, hold: boolean, reasonCode }` | `{ patientId, legalHold }` |
| `GET /v1/business-delivery/retention/pending-deletion` | — | `{ patients: [{ patientId, archivedAt, restorableUntil, legalHold }] }`（**不含姓名**） |

`reasonCode` 只能是 `patient_request`、`retention_expired`、`duplicate_record`、`other`
（zod enum）。`patientId` 用 `OpaqueIdentifierSchema`。

### 資料寫法（全部在一個 Firestore 交易裡）

- **封存：** 讀 `patients/{id}`（不存在 → 404）、讀該病患所有 `appointments`
  （`where('patientId','==',id)`）。任一預約 `status` 為 `confirmed` 或 `arrived` 且
  `startsAt > now` → 409。寫：`patients/{id}` 加 `archivedAt`、`archivedByRef`、
  `restorableUntil = archivedAt + 30 天`、`legalHold`（沒有就 `false`）；每筆預約加
  `patientArchived: true`；寫一筆 `bd_retention_log`（`{ action, patientId, actorRef, at }`，不含姓名）。
- **復原：** 必須已封存且 `now < restorableUntil` → 清掉 `archivedAt` 等欄位、預約的
  `patientArchived` 刪除；寫 log。超過期限 → 409。
- **永久刪除：** 必須已封存、`now >= restorableUntil`、`legalHold === false`，否則 409。
  刪除：`patients/{id}`、該病患所有 `appointments`、`patient_booking_guards/{id}`、
  `patient_follow_up_states/{id}`、`return_sessions` 中 `patientId == id` 的文件、
  `follow_ups` 中 `patientId == id` 的文件；從 `patient_lookup_index_v2` 中所有含此 id 的文件的
  `patientIds` 陣列移除此 id（用 `where('patientIds','array-contains',id)` 找）。
  **不刪** `audit_events`、`bd_*`。回應的 `layers` 列出每個集合刪了幾筆。
  備份／PITR 不動（ADR-0010 要寫明：備份隨保存期自然過期，還原時要重新套用刪除紀錄）。
- **冪等：** 每個動作把 `idempotencyKey` 與請求雜湊存在 `bd_retention_log` 的文件 ID
  （`${action}_${sha256(idempotencyKey).slice(0,40)}`）；同鍵同內容回原結果，同鍵異內容回 409。

### 排除已封存病患

`patient-directory.ts` 的 `resolveFromIntake`：若候選病患有 `archivedAt` → 當作不存在（建立新病患）。
`lookupReturn`：候選有 `archivedAt` → 回查無。員工清單（`toListRecord` 的上層查詢）：
略過 `patientArchived === true` 的預約。匯出：在
`apps/api/src/firestore/business-delivery-export.repository.ts` 的 `rows` 產生處略過
`patientArchived === true` 的預約。

### 測試（至少）

單元：非 manager 全部拒絕；功能關閉 404；沒有 reauth 不寫入；reasonCode 非法拒絕。
emulator：封存→清單與查詢看不到；30 天內復原成功、第 30 天整點復原失敗；未滿 30 天永久刪除失敗；
legal hold 時永久刪除失敗；永久刪除後 `audit_events` 筆數不變、其他列出集合為 0；
有未來 confirmed 預約時封存失敗；冪等重送與異內容 409；兩個同時封存只成功一個。

**停止條件：** 發現其他集合也存病患 ID（用 `git grep -n "patientId" apps/api/src/firestore` 檢查）而本計畫沒列 → 停。

---

## L2 日曆新格式與手打事件自動對應

**依據：** `CALENDAR-TITLE-FORMAT-2026-09-29`、`OWNER-BATCH-2026-09-29B` 第 3 項、ADR-0002 修訂段。
**分支：** `cursor/luna-calendar-title`

### 格式（寫死）

- 系統寫入的預約標題：`{服務}{初診|回診}/{姓名}{電話} {MMDD}/{備註}`
  - 服務：`service_snoring`→`止鼾`、`service_aesthetic`→`醫美`
  - 電話：只留數字；生日：`--05-20` → `0520`
  - 沒有備註就省略最後的 `/{備註}`；備註去掉換行（換成空白），最多 120 字
  - **不寫**顧問／小編代碼、來源、完整生日
  - 例：`止鼾初診/合成患者甲0900000001 0520/想先詢問流程`
- 保留時段：`⚠ HH:MM-HH:MM 保留時段(原因)`，時間用台北時間；原因沿用現有
  `CALENDAR_BUSY_REASON_BY_LABEL` 的中文標籤。
- 系統辨認自己的事件：用現有 event 的 `extendedProperties`（`linkId`），**不再**看標題前綴。
  `apps/worker/src/calendar-sync/sync-engine.ts` 的 `looksLikePilotTitle` 改為檢查
  extendedProperties 是否有本系統的 linkId。

### 手打事件自動對應（寫死）

1. 從標題抽出所有 `09` 開頭的 10 位數字（先移除 `-`、空白）。**恰好 1 組**才繼續，否則「未對應」。
2. 抽生日：標題中除了電話以外的 6 位數字（民國 `YYMMDD`）取後 4 碼，或 4 位數字 `MMDD`；
   **恰好 1 組**且是合法月日才繼續，否則「未對應」。
3. 用 `opaqueLookupIdentity(電話, '--MM-DD')`（`apps/api/src/patients/patient-directory.ts`）查
   `patient_lookup_index_v2`：**恰好 1 位**候選且未封存 → 自動連結；0 位或 ≥2 位 → 「未對應」。
4. 「未對應」的事件照現有流程進工作臺的候選清單（`unmatched`），時段視為占用。
   **任何不確定都走未對應**，不得猜。

### 要改的檔案

- `packages/domain/src/calendar-sync.ts`：新增 `formatAppointmentTitle`、`formatReservedTitle`、
  `extractCalendarContact`（回傳 `{ phoneDigits, monthDay } | undefined`）；舊的
  `formatSyntheticAppointmentTitle` 保留給舊測試，不刪。
- `apps/worker/src/calendar-sync/*`：寫入時改用新格式；判斷自己事件改用 extendedProperties。
- 自動對應的查詢放在 API（worker 不直接讀病患資料？先用 `git grep -n "patient_lookup_index" apps/worker`
  確認；若 worker 沒有讀病患集合的權限或程式 → **停止並回報**，由 Claude 決定放哪）。
- 測試：`packages/domain/src/calendar-sync.test.ts` 加格式與抽取案例；現有「日曆不含個資」
  的測試改成「只允許 ADR-0002 欄位」的正向＋反向測試（**不能直接刪掉**）。

### 測試案例（抽取）

| 標題 | 預期 |
| --- | --- |
| `合成患者甲0900000001 0520` | `{ 0900000001, --05-20 }` |
| `(IG)AS/顏/合成患者甲0900000001/止` | 無生日 → 未對應 |
| `合成患者甲 0900-000-001 790520` | `{ 0900000001, --05-20 }` |
| `0900000001 0900000002 0520` | 兩組電話 → 未對應 |
| `合成患者甲0900000001 1332` | 月日不合法 → 未對應 |
| `合成患者甲/鼻回` | 未對應 |

---

## L3 工作臺「商務與驗收」分頁＋重新登入

**依據：** `CP-03-UI-IN-WORKBENCH-2026-09-29`、ADR-0008、ADR-0009、L1 路由。
**分支：** `cursor/luna-workbench-business-tab`

### 做什麼

1. `apps/web/public/index.html` 加一個工作區段 `id="business-section"`，
   `data-workspace-panel`、`data-restricted`（只有 manager 顯示，做法照現有 `audit-section`）。
   左側導覽加「商務與驗收」。在 `apps/web/public/modules/workspace-tabs.js` 的
   `ADMIN_PANEL_IDS` 加 `'business-section'`。
2. 新檔 `apps/web/public/modules/business-view.js`：
   - 月報：月份選擇（`<input type="month">`）→ `GET /v1/business-delivery/monthly-usage?month=`，
     顯示員工人數、預約數、完整度、分類、維護費（`null` 顯示「需人工確認」）。
   - 里程碑：`GET /v1/business-delivery/milestones`，顯示五段狀態；兩個按鈕
     「確認正式上線日」（要填日期＋證據編號）與「確認尾款」（要填證據編號）。
   - 匯出：選起訖日期 → 建立 → 顯示狀態與剩餘次數 → 下載按鈕 → 撤銷按鈕。
   - 封存：病患 ID 輸入 → 封存／復原；「待永久刪除」清單 → 永久刪除（選 reasonCode）；legal hold 開關。
   - 所有 POST 帶 `X-CSRF-Token`（`sessionStorage.getItem('calPilotCsrf')`），做法照
     `apps/web/public/modules/internal-test-booking-transport.js` 的 `v1()`。
3. **重新登入橋接：** 在 `apps/web/src/calendar-pilot-entry.js`（有 Firebase）加：
   ```js
   window.addEventListener('beauessence:reauth-request', async (event) => {
     // 用現有 Google＋TOTP 登入流程重新登入，取得新 ID token
     // 成功：window.dispatchEvent(new CustomEvent('beauessence:reauth-result',
     //   { detail: { requestId: event.detail.requestId, idToken } }))
     // 失敗：detail 帶 { requestId, error: '重新登入未完成' }
   });
   ```
   `business-view.js` 需要重新登入時發 `beauessence:reauth-request`（帶隨機 `requestId`），
   等對應的 `beauessence:reauth-result`（60 秒逾時），拿到 `idToken` 放進
   `x-reauth-id-token` header。**ID token 不得存進 localStorage／sessionStorage、不得記 log。**
4. 本機合成模式（沒有 API）時，這個分頁只顯示「此功能只在 C1 伺服器模式可用」。
5. 預算：跑 `corepack pnpm run check:perf`，看 `/index.html` 超出多少；在
   `apps/web/performance-budget.json` 的 `/index.html` 項目把 `total`（以及超出的類別）
   **只加到剛好通過再多 1 KiB**，並在 `justification` 句尾補一句：
   `2026-09-30 CP-03-UI-IN-WORKBENCH-2026-09-29：商務與驗收分頁，業主核准小幅上調。`
6. 新 e2e：`tests/e2e/business-tab.spec.ts`，並加進 `scripts/e2e-groups.mjs` 的 `e2e-ui` 群組。
   用 `page.route('**/v1/business-delivery/**')` 模擬 API；驗證：manager 看得到、front_desk 看不到
   （切過去被導回營運首頁）、月報與里程碑正確顯示、確認按鈕會發出 reauth-request 並帶 header。
7. 跑 `corepack pnpm run check:ui`、`check:tokens`、`check:pages`，全部要過。

**停止條件：** `check:tokens` 要求的顏色／間距在 token 表裡找不到 → 停；預算需要加超過 5 KiB → 停。

---

## L4 還原演練驗證工具（CP-06-S 第二部分）

**依據：** 執行工作包 CP-06-S／V1～V6、`OWNER-BATCH-2026-09-29B` 第 6 項（實際演練在測試交付後微調期）。
**分支：** `cursor/luna-cp06-verifier`

1. 新檔 `scripts/recovery-clone-verify.mjs`＋`.test.mjs`：
   - 參數：`--project`、`--database`（必須不是 `(default)`，且符合 `^[a-z][a-z0-9-]{2,61}[a-z0-9]$`）、
     `--manifest <expected.json>`。
   - 用 `firebase-admin` 連到指定 **named database**（`getFirestore(app, databaseId)`）。
   - 只讀：統計 `appointments`、`patients`、`slots`、`patient_lookup_index_v2`、`audit_events`、
     `outbox_jobs` 筆數，與 manifest 的預期筆數比對（V1）；manifest 列出的 10 筆合成預約逐欄比對（V2）；
     `audit_events` 依 `occurredAt` 排序檢查沒有缺號（V3）。
   - 輸出 JSON：每一項 PASS／FAIL＋數字；有任何 FAIL 就 exit 1。
   - **絕對不寫入**；`project` 必須通過 `scripts/isolated-c1-project-id.mjs` 的 `isIsolatedC1ProjectId`。
2. 測試：用 emulator 建一個 named database 驗 PASS 與 FAIL 各一次；`(default)`、staging 專案、
   格式錯的 database 名稱都要被拒絕。
3. V4～V6（隔離 runner 建立／取消預約、專用還原日曆）**不在本包**，文件寫明留給 CP-06-E 當天。

---

## L5 合作終止與資料返還（CP-07）

**依據：** `BD-POLICY-2026-09-29` §6、`OWNER-BATCH-2026-09-29B` 第 7 項。前置：L1、CP-04（#205）已合併。
**分支：** `cursor/luna-cp07-termination`

1. **重用** `packages/domain/src/business-delivery-termination.ts` 的
   `planBusinessTerminationOperation`；政策值 `minimumNoticeDays = 30`、
   `controlledCopyRetentionDays = 30` 加進政策表。
2. 路由（manager；除 GET 外都要 reauth）：
   - `POST /v1/business-delivery/terminations` `{ idempotencyKey, noticeDate }` → 建立終止案
   - `GET /v1/business-delivery/terminations/:id` → 清單狀態
   - `POST .../:id/acknowledgements` `{ idempotencyKey, receiptKind:'data_return', exportId }`：
     系統查 `bd_export_jobs/{exportId}` 的 `sha256`，記錄簽收人（actorRef）、時間與該雜湊。
     **這就是「系統內按已收到」。**
   - `POST .../:id/close` `{ idempotencyKey, expectedVersion }`：伺服器自己檢查所有必要步驟
     （返還匯出已簽收、受控副本保留期滿），**不收 `complete: true`**；缺任何一步回 409 並列出缺什麼。
3. 不自動停用服務、不自動撤銷帳號（撤銷權限列為清單項目，由人操作後在系統打勾）。
4. 測試同 L1 的格式：權限、reauth、冪等、缺步驟不能結案。

---

## L6 批次部署清單（只寫文件，不執行）

**依據：** `OWNER-BATCH-2026-09-29B` 第 1 項。前置：L1～L5 都已合併。
**分支：** `cursor/luna-c1-batch-deploy-packet`

新檔 `docs/plans/2026-10-xx-c1-batch-deploy-packet.md`（日期用實際日期），照
[執行工作包的 R-DEPLOY](2026-09-22-current-project-execution-packets.md#共用-r-deploycp-03040507-每包-se-必經)
寫：精確 SHA（寫「合併後由業主填入」）、要設定的環境變數
（`BUSINESS_DELIVERY_ENABLED=true`、`BUSINESS_DELIVERY_POLICY_VERSION=BD-POLICY-2026-09-29`、
`BUSINESS_DELIVERY_SCOPE=internal_synthetic`、`BUSINESS_DELIVERY_OBSERVED_SINCE=<部署時 UTC>`、
`BUSINESS_DELIVERY_MAINTENANCE_EMAILS=<業主提供>`）、Terraform 只有 `export_chunk_ttl` 一個新資源、
回退方式、當天驗收清單（每個功能一個正向＋一個反向操作）、手冊截圖清單。
**Luna 不執行任何部署指令**，全部交給業主。

---

## L7 回歸、操作手冊、驗收清單（CP-08～CP-10）

**前置：** L6 部署完成並由業主驗收。

1. CP-08：在 C1 依 `docs/plans/2026-09-22-current-project-acceptance-matrix.md` 逐列執行，
   每列填 PASS／FAIL＋證據檔名；FAIL 不修程式，列出來回報。
2. CP-09：`docs/runbooks/` 下新增「管理者操作手冊」（繁中、給診所看的白話），章節：登入、
   預約管理、月報與驗收、匯出、封存與刪除、合作終止。截圖只用部署當天拍的合成資料畫面。
3. CP-10：驗收清單文件，逐項列出「業主要看什麼、怎麼算通過」，最後一欄留給業主簽名日期。

---

## 附：現況（2026-09-30）

| 項目 | 狀態 |
| --- | --- |
| CP-03 月用量與里程碑 API | 已合併（#198） |
| 電話＋月日保存 | 已合併（#203） |
| 預約備註保存 | 已合併（#204） |
| CP-04 匯出 API | #205 待合併 |
| CP-06-S 計畫輸出修正 | 已合併（#199） |
| L1～L7 | 本計畫 |
