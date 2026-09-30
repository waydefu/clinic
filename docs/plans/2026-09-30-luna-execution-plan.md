# GPT-6 Luna 逐步執行計畫（2026-09-30）

**對象：** GPT-6 Luna，在業主筆電（Ubuntu arm64）執行。**照順序做，不要自己改設計。**
**依據：** `BD-POLICY-2026-09-29`、`OWNER-BATCH-2026-09-29B`、`EXPORT-CONTACT-STORAGE-2026-09-29`、
`BOOKING-NOTE-STORAGE-2026-09-29`、`CALENDAR-TITLE-FORMAT-2026-09-29`（見
[決策登記](../product/phase-1-decision-register.md)）、ADR-0002、ADR-0007、ADR-0008、ADR-0009。
**流程：** Luna 開 PR → Claude 審查 → 業主合併（`OWNER-BATCH-2026-09-29B` 第 8 項）。
**不授權：** 部署、`terraform apply`、真實資料、production。L6 只準備清單，指令交給業主。

## 0. 每個工作包都要照做的規則

開工前先依 [開發環境手冊](../runbooks/luna-development-environment.md) 核對
Node／pnpm、明確安裝依賴、emulator／瀏覽器與網路。環境修復是獨立前置 PR。

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

### 補充規則（2026-09-30 補，寫死）

1. **查詢索引不能覆蓋：** 現在 `resolveFromIntake` 建立新病患時用
   `transaction.set(lookupRef, { patientIds: [patientId], ... })`，會把索引整個蓋掉。改成：
   先把索引裡**已封存**的 ID 從「候選」中排除再交給 `resolveIntakeCandidate`；建立新病患時寫
   `patientIds: [...原本所有 ID（含已封存）, 新 ID]`。
2. **復原前再檢查：** 復原時若同一個索引裡已經有另一位**未封存**病患 → 回 409（「已有新紀錄，
   請聯絡開發者處理」），不得復原，避免同鍵兩位有效病患。
3. **員工清單過濾位置：** 用 `git grep -n "toListRecord(" apps/api/src` 找出呼叫處，在呼叫處
   把 `patientArchived === true` 的文件略過（不要改 `toListRecord` 本身的欄位規則）。
4. **一個交易最多 500 筆寫入：** 封存／刪除前先算要寫幾筆；超過 400 筆 → 回 409
   （「資料量過大，請聯絡開發者」）並**停止回報**，不要自己拆成多個交易。

### 測試（至少）

單元：非 manager 全部拒絕；功能關閉 404；沒有 reauth 不寫入；reasonCode 非法拒絕。
emulator：封存→清單與查詢看不到；30 天內復原成功、第 30 天整點復原失敗；未滿 30 天永久刪除失敗；
legal hold 時永久刪除失敗；永久刪除後 `audit_events` 筆數不變、其他列出集合為 0；
有未來 confirmed 預約時封存失敗；冪等重送與異內容 409；兩個同時封存只成功一個；封存後同電話月日再預約 → 建新病患且索引同時保有兩個 ID；此時復原舊病患 → 409。

**停止條件：** 發現其他集合也存病患 ID（用 `git grep -n "patientId" apps/api/src/firestore` 檢查）而本計畫沒列 → 停。

---

## L2 日曆新格式與手打事件自動對應

**依據：** `CALENDAR-TITLE-FORMAT-2026-09-29`、`OWNER-BATCH-2026-09-29B` 第 3 項、ADR-0002（含 2026-09-29 修訂段）。
**分成兩個 PR，依序做：** L2a（寫出去的標題）→ L2b（讀回來的手打事件）。

### 已決定的設計（Claude 2026-09-30 決定，Luna 不得更改）

1. **工作佇列（outbox）仍然不放個資。** API 寫入的 outbox job 維持只有 ID、狀態、時間。
2. **標題由 worker 在送出前組出來。** worker 處理 job 時，依 `appointmentId` **唯讀**讀取
   `appointments/{id}` 與 `patients/{patientId}`，組好標題後才呼叫 Google。worker 不寫病患資料。
3. **自動對應只產生「建議」，不自動建立預約。** ADR-0002 規定外部變更只進待審清單、要自動套用必須
   另寫新 ADR，所以本包只做到「系統找出建議病患 → 櫃台確認後用現有的『建立新預約』幫該病患建立」。
   找不到或不確定 → 照現在一樣列為「未對應」。

### L2a 系統寫出去的標題（分支 `cursor/luna-calendar-title-out`）

**格式（寫死）：**

- 預約：`{服務}{初診|回診}/{姓名}{電話} {MMDD}/{備註}`
  - 服務：`service_snoring`→`止鼾`、`service_aesthetic`→`醫美`，其他 → 不寫服務字樣
  - 電話：`phoneDigits` 原樣（只有數字）；生日：`--05-20` → `0520`
  - 備註：`patientNote` 把換行換成一個空白、去頭尾空白；沒有備註就連前面的 `/` 一起省略
  - 缺姓名、電話或生日任一項（例如舊病患、已封存、已刪除）→ **改用現在的最小標題**
    （`formatClinicCalendarSummary` 的結果），不要拼半套
  - 例：`止鼾初診/合成患者甲0900000001 0520/想先詢問流程`
- 取消、未到、完成等狀態：沿用現在的狀態字樣前綴規則（看 `formatClinicCalendarSummary`），
  接在新標題前面。

**要改的檔案與做法：**

1. `packages/domain/src/calendar-projection.ts`
   - 新增並 export：
     ```ts
     export function formatClinicAppointmentTitle(input: {
       readonly bookingKind: string;      // 'initial' | 'follow_up'
       readonly itemId?: string;
       readonly name?: string;
       readonly phoneDigits?: string;
       readonly birthMonthDay?: string;   // '--MM-DD'
       readonly patientNote?: string;
     }): string | undefined               // 缺必要欄位回 undefined
     ```
   - `buildClinicCalendarEventBody` 的 input 加 `readonly title?: string`；
     `summary` 改成：有 `title` 時用「現有狀態前綴規則 ＋ title」，沒有時維持現在的結果。
   - `assertClinicCalendarPayloadAllowlist` 不用改（標題是字串值，不是欄位名稱）。
2. `apps/worker/src/calendar-port.ts`：`CalendarProjectionRequest` 加 `readonly title?: string;`
3. `apps/worker/src/google-calendar.ts` 的 `eventBody()`：把 `request.title` 傳給
   `buildClinicCalendarEventBody`（有值才傳）。
4. 新檔 `apps/worker/src/calendar-title-source.ts`：
   ```ts
   export interface CalendarTitleSource {
     /** 唯讀；任何錯誤或缺資料都回 undefined，絕不丟例外、絕不寫入。 */
     titleFor(appointmentId: string): Promise<string | undefined>;
   }
   export class FirestoreCalendarTitleSource implements CalendarTitleSource { /* 讀 appointments、patients；patients 有 archivedAt 就回 undefined */ }
   export const NO_CALENDAR_TITLE: CalendarTitleSource = { titleFor: async () => undefined };
   ```
5. `apps/worker/src/outbox-processor.ts`：constructor 多一個選用參數
   `titleSource: CalendarTitleSource = NO_CALENDAR_TITLE`；在第 439 行附近呼叫
   `this.calendar.project({...})` 之前 `const title = await this.titleSource.titleFor(job.appointmentId)`，
   有值才放進 request。**同時更新那段中文註解**（原本寫「姓名、電話……一律不得離開本系統」），
   改成「只有 ADR-0002 修訂段列的標題欄位，只在專用預約日曆」。
6. worker 的組裝處（`git grep -n "new OutboxProcessor" apps/worker/src` 找非測試檔）傳入
   `new FirestoreCalendarTitleSource(db)`；只有「專用預約日曆」的 port 才傳，其他（含 CAL-PILOT
   合成同步）不傳。分不出哪個是專用預約日曆 → **停止並回報**。

**測試：**

- `packages/domain/src/calendar-projection.test.ts`：
  完整欄位、無備註、備註含換行、缺電話回 undefined、缺生日回 undefined、未知服務、回診。
  另加反向測試：標題**不得**含年份、身分證字樣、`intakeNationality` 的值。
- 現有「日曆不含個資」的測試：不要刪。改成兩條——沒給 `title` 時結果與現在完全相同；
  給了 `title` 時 `summary` 只含上述欄位。
- `apps/worker/src/outbox-processor.test.ts`：titleSource 回字串時 request 帶 `title`；
  回 undefined 時不帶；titleSource 丟例外時 job 仍照原樣投影（不因標題失敗而卡住）。
- 新 emulator 測試 `tests/firestore/calendar-title-source.test.ts`：完整資料、已封存、找不到病患。
  **`beforeEach` 與 `afterAll` 都要清資料。**

### L2b 手打事件的建議病患（分支 `cursor/luna-calendar-title-in`，L2a 合併後才開）

**抽取規則（寫死）：**

1. 把標題裡的 `-`、全形／半形空白去掉後，找所有 `09\d{8}`。**恰好 1 組**才繼續。
2. 從**原始標題**移除該電話後，找獨立的數字串（前後不是數字）：6 位數視為民國 `YYMMDD` 取後 4 碼，
   4 位數視為 `MMDD`；只接受月 01–12、日在該月範圍（2 月接受 29）。**恰好 1 組**才繼續。
3. 用 `opaqueLookupIdentity(電話, '--MM-DD')` 查 `patient_lookup_index_v2`：**恰好 1 位**、
   且該病患沒有 `archivedAt` → 建議；其他情況 → 不建議。

**要改的檔案與做法：**

1. 把 `opaqueLookupIdentity` 從 `apps/api/src/patients/patient-directory.ts` **搬到**
   `packages/domain/src/patient-identity.ts`（函式內容一字不改，包含 `rlk2_` 前綴與 `return-v2:` 字串），
   API 端改成 `import { opaqueLookupIdentity } from '@beauessence/domain'` 並從 patient-directory
   再 export 一次，讓既有 import 不壞。跑 `sync:domain`。**若 domain 不能用 `node:crypto`**
   （瀏覽器也會載入 domain）→ **停止並回報**，不要自己換雜湊演算法。
2. `packages/domain/src/calendar-sync.ts` 新增 `extractCalendarContact(title: string):
   { phoneDigits: string; birthMonthDay: string } | undefined`，照上面規則。
3. worker 的日曆同步寫入候選時（`apps/worker/src/calendar-sync/firestore-calendar-sync.repository.ts`，
   `candidate.kind === 'unmatched'` 的地方）：用 2 算出聯絡資料 → 用 1 算鍵 → 唯讀查索引與病患 →
   符合就在候選文件多寫 `suggestedPatientId` 與 `suggestionMethod: 'phone_month_day'`。
   **不要**把電話、生日或鍵寫進候選文件。
4. API 的候選清單回應（`apps/api/src/calendar/clinic-calendar-review.application-service.ts` 讀候選的地方）
   多回 `suggestedPatientId`（只給員工）；contracts 對應 schema 加選用欄位。
5. 工作臺候選清單：有 `suggestedPatientId` 時顯示「建議對應：{姓名}」與按鈕「為此病患建立預約」，
   按下去打開現有的「建立新預約」表單並預填 `onBehalfPatientId` 與事件時間；建立成功後由櫃台照現有
   方式把該候選標為已處理。**不新增自動建立預約的 API。**

**測試案例（抽取，放 `packages/domain/src/calendar-sync.test.ts`）：**

| 標題 | 預期 |
| --- | --- |
| `合成患者甲0900000001 0520` | `{ 0900000001, --05-20 }` |
| `合成患者甲 0900-000-001 790520` | `{ 0900000001, --05-20 }` |
| `(IG)AS/顏/合成患者甲0900000001/止` | undefined（沒有生日） |
| `0900000001 0900000002 0520` | undefined（兩組電話） |
| `合成患者甲0900000001 1332` | undefined（月日不合法） |
| `合成患者甲0900000001 0520 0612` | undefined（兩組生日） |
| `合成患者甲/鼻回` | undefined |

emulator：恰好 1 位 → 有 `suggestedPatientId`；2 位 → 沒有；已封存 → 沒有；候選文件裡找不到電話字串。

---

## L3 工作臺「商務與驗收」分頁＋重新登入

**依據：** `CP-03-UI-IN-WORKBENCH-2026-09-29`、ADR-0008、ADR-0009、L1 路由。
**分支：** `cursor/luna-workbench-business-tab`

### 1. 分頁與權限

1. `apps/web/public/index.html` 加 `<section id="business-section" data-workspace-panel hidden>`，
   權限標記照現有 `audit-section`（`git grep -n "audit-section" apps/web/public` 找所有出現處，
   每一處都照做一份 `business-section`）。左側導覽加「商務與驗收」。
2. `apps/web/public/modules/workspace-tabs.js` 的 `ADMIN_PANEL_IDS` 加 `'business-section'`。

### 2. 畫面（新檔 `apps/web/public/modules/business-view.js`）

- 只在 C1 伺服器模式運作：`sessionStorage.getItem('calPilotCsrf')` 沒有值時，整個分頁只顯示
  「此功能只在 C1 伺服器模式可用」，不發任何請求。
- 所有請求用 `fetch('/v1/...', { credentials: 'same-origin' })`；POST 加
  `X-CSRF-Token: sessionStorage.getItem('calPilotCsrf')` 與 `Content-Type: application/json`。
- 四個區塊：
  1. **月報**：`<input type="month">` → `GET /v1/business-delivery/monthly-usage?month=YYYY-MM`；
     顯示員工人數、預約數、完整度、分類、維護費（`null` 顯示「需人工確認」）。
  2. **里程碑**：`GET /v1/business-delivery/milestones`；五段狀態逐列顯示；
     「確認正式上線日」（日期＋證據編號）與「確認尾款」（證據編號）兩個表單，
     body 照 `MilestoneAcknowledgementRequestSchema`，`expectedVersion` 用畫面上的 `revision`。
  3. **匯出**：起訖日期 → `POST /v1/business-delivery/exports`
     （`{ idempotencyKey, format:'csv', from, to }`）→ 顯示狀態、剩餘次數；
     下載用 `fetch` 取回文字後 `new Blob([text], { type: 'text/csv' })` ＋ `URL.createObjectURL`
     觸發下載，檔名 `export-{from}-{to}.csv`；撤銷按鈕。
  4. **封存**：照 L1 路由。
- `idempotencyKey`：`crypto.randomUUID().replaceAll('-', '')`，同一次操作重試時沿用同一個鍵。
- 文字全部用 `textContent` 放進畫面，**不用 innerHTML 放伺服器回來的值**。

### 3. 重新登入（最難的部分，照抄骨架）

登入程式（`apps/web/src/calendar-pilot-entry.js`）載有 Firebase，工作臺沒有。工作臺用事件請它幫忙。
**注意：** 交給工作臺之後，登入程式的畫面區塊（`root`）已被刪除，所以不能用現有的 `promptTotp`，
要自己開一個 `<dialog>`。

在 `calendar-pilot-entry.js` 的 import 補上 `reauthenticateWithPopup`，並在 `boot()` 最前面註冊：

```js
function promptReauthTotp() {
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'cp-dialog';
    dialog.innerHTML =
      '<form method="dialog" class="cp-form"><h2>輸入動態驗證碼</h2>' +
      '<label class="cp-full">6 位數驗證碼<input name="code" inputmode="numeric" ' +
      'autocomplete="one-time-code" pattern="[0-9]{6}" required /></label>' +
      '<button class="cp-button cp-button-primary" value="ok">確認</button>' +
      '<button class="cp-button" value="cancel" formnovalidate>取消</button></form>';
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const code = dialog.querySelector('input').value;
      const ok = dialog.returnValue === 'ok' && /^[0-9]{6}$/.test(code);
      dialog.remove();
      if (ok) resolve(code);
      else reject(new Error('已取消重新登入'));
    });
    dialog.showModal();
  });
}

async function freshIdToken() {
  const user = auth?.currentUser;
  if (!user) throw new Error('請先登入');
  try {
    const result = await reauthenticateWithPopup(user, new GoogleAuthProvider());
    return await result.user.getIdToken(true);
  } catch (error) {
    if (error?.code !== 'auth/multi-factor-auth-required') throw error;
    const resolver = getMultiFactorResolver(auth, error);
    const hint = resolver.hints.find(
      (item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID
    );
    if (!hint) throw new Error('此帳號沒有設定動態驗證碼');
    const code = await promptReauthTotp();
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code);
    const result = await resolver.resolveSignIn(assertion);
    return await result.user.getIdToken(true);
  }
}

window.addEventListener('beauessence:reauth-request', async (event) => {
  const requestId = event.detail?.requestId;
  if (typeof requestId !== 'string') return;
  try {
    const idToken = await freshIdToken();
    window.dispatchEvent(
      new CustomEvent('beauessence:reauth-result', { detail: { requestId, idToken } })
    );
  } catch {
    window.dispatchEvent(
      new CustomEvent('beauessence:reauth-result', {
        detail: { requestId, error: '重新登入未完成' }
      })
    );
  }
});
```

在 `business-view.js`：

```js
export function requestFreshIdToken(timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener('beauessence:reauth-result', onResult);
      reject(new Error('重新登入逾時'));
    }, timeoutMs);
    function onResult(event) {
      if (event.detail?.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener('beauessence:reauth-result', onResult);
      if (typeof event.detail.idToken === 'string') resolve(event.detail.idToken);
      else reject(new Error(event.detail.error ?? '重新登入未完成'));
    }
    window.addEventListener('beauessence:reauth-result', onResult);
    window.dispatchEvent(
      new CustomEvent('beauessence:reauth-request', { detail: { requestId } })
    );
  });
}
```

需要重新登入的請求（建立匯出、確認里程碑、封存、永久刪除）：先 `await requestFreshIdToken()`，
把結果放進 header `x-reauth-id-token`。**idToken 只存在區域變數，不得寫入 storage、不得 console.log。**

**必須先確認的兩件事（做不到就停止並回報）：**

1. 按鈕點下去**同步**發出 request 事件（不要先 `await` 別的東西），否則瀏覽器會擋彈出視窗。
2. `apps/web/public/_headers` 或 Hosting 設定裡的 CSP 允許 Google 登入彈窗
   （`git grep -n "frame-src\|Cross-Origin-Opener-Policy" apps/web firebase.json`）；
   若 `Cross-Origin-Opener-Policy` 是 `same-origin`，彈窗會失效 → 停止並回報，不要自己改 CSP。

### 4. 預算

跑 `corepack pnpm run check:perf`。在 `apps/web/performance-budget.json` 的 `/index.html` 項目，
把超出的類別與 `total` **只加到剛好通過再多 1 KiB**，並在 `justification` 句尾補：
`2026-09-30 CP-03-UI-IN-WORKBENCH-2026-09-29：商務與驗收分頁，業主核准小幅上調。`
需要加超過 5 KiB → 停止並回報。

### 5. 測試

- 新 e2e `tests/e2e/business-tab.spec.ts`，加進 `scripts/e2e-groups.mjs` 的 `e2e-ui` 群組。
  用 `page.route('**/v1/business-delivery/**', ...)` 模擬 API；先
  `page.evaluate(() => sessionStorage.setItem('calPilotCsrf', 'test-csrf'))` 進入伺服器模式。
  驗證：manager 看得到分頁、front_desk 看不到（切過去回到營運首頁）；月報與里程碑顯示正確；
  按「確認尾款」會發出 `beauessence:reauth-request`（在測試裡 `page.evaluate` 監聽並回
  `beauessence:reauth-result` 帶假 token），之後的 POST 帶 `x-reauth-id-token` 與 `X-CSRF-Token`；
  沒有 csrf 時只顯示「此功能只在 C1 伺服器模式可用」且沒有發請求。
- 單元測試 `requestFreshIdToken`：成功、錯誤、逾時、別人的 requestId 不影響。
- 重新登入彈窗本身無法自動測試 → PR 寫「需部署當天由業主實測」，**不要寫 PASS**。
- `corepack pnpm run check:ui`、`check:tokens`、`check:pages` 都要過。

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
