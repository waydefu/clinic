# Google Calendar 與資料庫整合測試計畫

**狀態：** 階段 A 已完成；接日曆實測的技術前置清單見第 3.1 節。
撰寫於 2026-07-21，更新於 2026-07-22。
**前提：** 本計畫不自行核准任何 D-001～D-011 決策，也不改變目前
「僅瀏覽器狀態、無雲端後端」的事實。

## 1. 目前位置與目標位置

現況是一個**沒有後端的瀏覽器原型**：

```text
瀏覽器 ──► store.js ──► localStorage
             （modules/ 內為純領域規則）
```

目標架構（[ADR-0001](../adr/0001-domain-api-is-the-only-write-path.md)、
[ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)、
[ADR-0003](../adr/0003-firestore-direct-client-access-is-deny-by-default.md)）：

```text
瀏覽器／App ──► apps/api (/v1) ──► Firestore 交易（時段鎖定 + outbox）
                                        │
                                        └──► apps/worker ──► Google Calendar
```

三條不可妥協的界線：客戶端永不直接寫 Firestore；外部呼叫永不放進交易；
Calendar 是投影，不是可用性的來源。

## 2. 有利條件與最大風險

**有利**：領域規則已經是純函式且與 I/O 分離（`apps/web/public/modules/`），
時段鎖定、狀態機、防重複與回診規則都有測試。移植時搬的是規則，不是重寫。

**最大風險**：目前預約流程收集姓名、電話、生日（月日必填、年份選填）、
身分證／居留證或護照、健保卡攜帶意向、患者備註，以及本次門診與來源標籤。
在瀏覽器裡這些只留在使用者自己的裝置；一旦寫進 Firestore，就成為
**診所持有的個人資料**，適用個資法。因此：

> **D-001、D-002、D-003 核准前，不得將任何真實患者資料寫入雲端資料庫。**
> 階段 A 與 B 一律使用合成資料。

## 3. 分階段計畫

### 階段 A：本機 Emulator 的真實寫入路徑（不需任何雲端）— **已完成 2026-07-21**

涵蓋建立預約與其後的全部狀態轉換（取消、提出取消、到診、未到、改期），
以及 outbox worker 的重試、退避與死信。

目的：證明 Firestore 交易、冪等與 outbox 在真實資料庫語意下成立。

**已實作**

| 檔案 | 職責 |
| --- | --- |
| `packages/domain/src/booking-transaction.ts` | I/O-free 的 `planBooking`：讀到什麼就決定寫什麼。不做 I/O、不讀時鐘、不產生 ID、不呼叫外部服務 |
| `packages/domain/src/appointment-transition.ts` | `planTransition` 與 `planReschedule`：取消、到診、未到與改期的純決策 |
| `packages/domain/src/outbox.ts` | `planOutboxAttempt`：退避、重試上限與死信的純決策 |
| `apps/worker/` | 領取（帶租約）→ 交易外呼叫外部服務 → 結算 |
| `apps/api/src/firestore/booking.repository.ts` | 在一個 `runTransaction` 內套用計畫：先讀後寫，不含任何規則 |
| `tests/firestore/booking-transaction.test.ts` | Emulator 上的併發、冪等與不變式測試 |

計畫器與 repository 分開的原因：Firestore 可能重試交易，因此「要寫什麼」必須是
「讀到什麼」的純函式。規則放在計畫器，重試時重新計算即可；repository 只負責
套用，本身不含判斷。

**實測結果**（`corepack pnpm test:rules`，9 項通過）

| 驗收項目 | 結果 |
| --- | --- |
| 併發預約同一時段 | 8 個同時請求，**恰好 1 個成功、7 個失敗**；資料庫僅 1 筆預約、1 筆 outbox、1 筆稽核，無部分寫入殘留 |
| 冪等重送 | 相同 `idempotencyKey` 第二次回傳 `replayed: true` 與同一預約編號，不產生第二筆 |
| 同一人重複預約 | 第二筆遭拒（`DUPLICATE_ACTIVE_BOOKING`）；到診完成後可再預約 |
| 掛號別不符 | 以回診時段建立初診遭拒，且未寫入任何資料 |
| 時段不存在 | 遭拒且未寫入任何資料 |
| 客戶端直接存取 | Rules 仍為預設拒絕（既有測試持續通過） |
| 交易內外部呼叫 | 無。Calendar 只以 `outbox_jobs` 記錄意圖 |

**尚未做、且刻意不做的事**

- **沒有對外開放任何預約寫入端點。** Phase 1 gate 明定在隱私、預約政策與
  身分/角色決策核准前不得啟用寫入路徑，因此本階段只有 repository 與測試。
- 未接雲端 Firestore、未接 Authentication。

**2026-07-22 更新**：瀏覽器與伺服器的規則已收斂——四組預約規則抽入
`packages/domain`，瀏覽器經 vendor 同步（雜湊防漂移）呼叫同一份，見
[ADR-0004](../adr/0004-browser-and-server-share-one-compiled-domain.md)。
原「兩套實作漂移」的風險已消除。

### 3.1 接日曆實測的技術前置（不需核准、可立即做）

依 roadmap 的順序，接上真實 Google Calendar 之前必須先完成。**四項技術前置
全部完成**（截至 2026-07-23，單元 106 項、Emulator 44 項通過）：

1. **outbox 冪等鍵改為 base32hex** — ✅ 已完成 2026-07-22。鍵改由
   [`packages/domain/src/calendar-event-id.ts`](../../packages/domain/src/calendar-event-id.ts)
   產生（UTF-8 → base32hex、小寫、無填充、長度 5–1024），並提供
   `fromCalendarEventId` 還原邏輯鍵供人工追查。`booking-transaction.ts`、
   `appointment-transition.ts` 與瀏覽器預覽都改呼叫同一個產生器；假日曆
   會拒絕不合格式的 ID 並標記為不可重試。
   **鍵綁預約而非狀態**：一筆預約 = 日曆上一個事件，改期是搬動、到診是更新、
   取消是刪除同一個事件。原「每狀態一鍵」會讓改期留殘影、取消刪不掉，已於
   同日修正並補上「建立→改期→到診→取消後日曆為空」的生命週期斷言。
2. **worker 的 Calendar adapter 先以假服務定型** — ✅ 已完成 2026-07-22。
   `calendar-port.ts` 具備：event ID 格式把關（不合格式＝不可重試）、
   `upsert`／`cancel` 兩種動作、409（事件已存在）與 410／404（早已刪除）
   都視為冪等成功、依**執行當下**的預約狀態決定動作，以及診所端事件為
   一小時區塊（`CLINIC_EVENT_MINUTES`）加品牌綠 `colorId`。細節見
   [日曆 event ID 與 outbox 冪等鍵](calendar-event-id.md)。
3. **事件欄位最小化定型** — ✅ 已完成。事件內容只放預約編號、掛號別、時間與
   診所地址；Emulator 測試以斷言鎖住「不得出現姓名、電話、身分證、手術種類、
   備註」，患者端 `.ics` 匯出另有同款斷言。
4. **runbook 演練** — ✅ 已完成 2026-07-23。依
   [calendar-sync-failure runbook](../runbooks/calendar-sync-failure.md)在本機
   以假日曆走過失敗→死信→補回，並固定為 Emulator 測試
   （`tests/firestore/calendar-sync-runbook.test.ts`，3 案例）。過程補上
   `OutboxProcessor.requeue`（runbook 步驟 3 缺的操作能力：只作用於死信、沿用
   同一把鑰匙）。證據見
   [Runbook 演練紀錄](../reviews/calendar-sync-runbook-rehearsal-2026-07-23.md)。

四項完成後，D-009 一核准（日曆擁有者、授權模型、scope、專用測試日曆），
剩下的就只是把假服務換成真實 API 用戶端與憑證注入。

**阻擋決策**：無（合成資料、無雲端）。這是**現在就可以做**的部分。

### 階段 B：staging 專案的雲端 Firestore（仍為合成資料）

**阻擋決策**：D-006（身分與角色）、D-010（環境、IAM、備份、監控）。

- 在 `beauessence-clinic-staging` 啟用 Firestore，位置選 `asia-east1`。
- 啟用 Firebase Auth，工作臺改為真實登入；目前的「角色模擬器」退場。
  現有 `permissions.js` 的角色矩陣成為伺服器端授權的規格來源。
- Rules 維持預設拒絕；所有存取經 API 的服務帳號。
- 保留一鍵清除合成資料的能力。

**驗收**：未登入者無法呼叫任何寫入端點；櫃台角色無法執行管理者動作（伺服器端
拒絕，不只是隱藏畫面）；稽核事件包含真實的操作者身分。

### 階段 C：Google Calendar 投影（合成日曆）

**阻擋決策**：D-009（日曆擁有者、授權模型、scope、事件欄位）。

- 建立**專用的測試日曆**，與任何醫師私人日曆分離。
- `apps/worker` 消費 `outbox_jobs`：建立、改期、取消對應的事件。
- 每筆預約使用固定的 Calendar Event ID 作為冪等鍵，重試不得產生重複事件。
- 事件內容只放預約編號與掛號別。**不得放入**姓名、電話、身分證、健保卡、
  手術種類、備註標籤或回診項目——這些都足以揭露就醫關聯。
- 失敗處理：指數退避重試、死信佇列、後台可見的待處理清單。

**驗收**：Calendar 暫時不可用時，患者端不得看到「已同步」的假象；服務恢復後
可安全補回；重試 100 次仍只有一個事件；以
[calendar-sync-failure runbook](../runbooks/calendar-sync-failure.md) 演練一次。

### 階段 D：正式資料前

D-001～D-003 核准、隱私政策發布、保存與刪除流程可執行、備份與復原演練完成、
資安審查通過。詳見專案規劃書第 7 與第 8 節。

## 4. 資料模型對應

目前瀏覽器狀態 → 目標 Firestore collection：

| 現在（`state-schema.js`） | 目標 collection | 移轉備註 |
| --- | --- | --- |
| `patients[]` | `patients` | 身分證字號需決定是否雜湊後另存；不得以姓名自動合併 |
| `slots[]` | `slots` | 文件 ID 用 `{resourceId}_{startAt}`，天然唯一鍵 |
| `appointments[]` | `appointments` | 已含 `bookingKind`、`itemId`、`noteTags` |
| `followUps[]` | `follow_ups` | 已含 `tags` 與 `certificateCopies` |
| `caseAssignments[]` | `case_assignments` | 需補 `effectiveFrom/To` 以支援改派歷程 |
| `auditEvents[]` | `audit_events` | 不可覆寫；需補 before/after 摘要 |
| `outboxJobs[]` | `outbox_jobs` | 需補重試次數與最後錯誤 |
| `schedule` / `scheduleDraft` | `availability_rules` | 含 `blockedTimes` 的初診／回診分流 |
| `workspace.accounts[]` | 由 Firebase Auth + 自訂 claims 取代 | 不再自行保存帳號 |

規劃書第 6.1 節另列出 `payroll_*` 與 `privacy_*` 系列，於階段 D 前補齊。

## 5. 建議順序

階段 A 不需要任何核准也不碰真實資料，卻能驗證整個架構最容易出錯的部分
（交易、冪等、outbox）。**建議先做階段 A**，其餘等對應決策核准。

## 6. 明確不做的事

- 不把 Calendar 當可用性來源或雙約防護。
- 不在 Firestore 交易內呼叫 Calendar、Email、LINE、Meta 或 NAS。
- 不讓瀏覽器、行動 App 或 NAS 直接讀寫 Firestore。
- 不在未核准 D-001～D-003 前，將真實患者資料寫入任何雲端服務。
- 不把 Service Account JSON 私鑰放進程式庫或前端。
