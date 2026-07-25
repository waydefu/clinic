# 2026 網頁規範稽核修復計畫書 — 2026-07-26

## 這份文件是什麼

2026-07-26 對前後端做了一次完整的 2026 網頁規範稽核，findings 見本文
「稽核結果摘要」。這份文件把每一項發現轉成**可以直接交給另一位 AI 開發者執行的
任務卡**：每張卡自帶檔案位置、現況證據、目標狀態、禁止事項與可執行的驗收指令，
不需要回頭讀稽核對話就能動工。

這仍然是合成資料的測試平台，不是正式醫療資訊系統。本計畫**不解除任何
Phase 1 決策閘門**，也不啟用任何目前被 `AGENTS.md` 列為 must-remain-disabled
的能力。

## 稽核結果摘要

已實測通過的部分（不要「順手改善」）：

- axe 在 `wcag2a`／`wcag2aa`／`wcag21a`／`wcag21aa`／`wcag22a`／`wcag22aa`／
  `best-practice` 全開下，患者頁（375×812）、工作臺（1280×720 與 375×812）
  皆為 **0 violations**。
- `escapeHtml` 覆蓋完整，週檢視、通知鈴鐺、稽核表格的插值都已逸出。
- CSP 嚴格（無 `unsafe-inline`／`unsafe-eval`），`<dialog>` 用原生 `showModal()`。
- Firestore 交易的 read-before-write、冪等重播、患者預約守衛設計正確。
- `check:lint`、`check:perf` 通過；`pnpm audit` 無 high／critical 未處理項。

需要修復的 17 項列於下方任務卡。

## 給執行者的共同規則

1. **先讀 `AGENTS.md`**，特別是「Minimal safe change」與「Repository map」。
   本計畫的每張卡都已標註要動的 boundary，但由誰擁有那條規則仍以
   `AGENTS.md` 的 Repository map 為準。
2. **一張卡一個 commit**。不要把多張卡合併，也不要夾帶格式化、相依升級或
   無關重構。`pnpm format` 由 Prettier 負責，不要手動壓行。
3. **不要碰 `apps/web/public/vendor/`**。那是 `packages/domain` 的編譯產物，
   由 `scripts/sync-domain-vendor.mjs` 生成，`pnpm check:sync` 會擋下漂移。
   要改領域規則就改 `packages/domain/src`，然後 `pnpm run sync:domain`。
4. **每張卡都要跑它自己的驗收指令**，通過後再跑 `corepack pnpm verify`。
   卡片若標註「需要 Emulator」，另外跑 `corepack pnpm test:rules`。
5. **標註「需要決策」的卡不要自己猜答案**。依 `AGENTS.md` 第 7 條，把問題與
   建議選項寫進 `docs/product/phase-1-decision-register.md`，然後停在那裡。
6. 修完一批之後，把結果補進本文件末尾的「執行紀錄」表，不要另開新文件。

## 任務總表

| ID | 標題 | 邊界 | 風險 | 依賴 | 閘門 |
| --- | --- | --- | --- | --- | --- |
| E1 | outbox 查詢的 head-of-line blocking | `apps/worker` + Firestore 索引 | 高 | — | 可做 |
| A1 | 注入 `modulepreload`，消除 5 趟往返 | `scripts/build-web.mjs` | 中 | — | 可做 |
| A2 | vendor barrel 改為深層 import | `apps/web` | 低 | — | 可做 |
| B1 | `<noscript>` 後備與靜態聯絡資訊 | `apps/web` | 低 | — | 可做 |
| E2 | outbox 批次時間戳與租約 | `apps/worker` | 中 | E1 | 可做 |
| E3 | `UtcIsoTimestampSchema` 放行非 ISO 字串 | `packages/contracts` + `packages/domain` | 中 | — | 可做 |
| B2 | HTML `no-store` → `no-cache` | 部署設定 | 低 | — | 可做 |
| E4 | rate limiter 的 Map 不回收 | `apps/api` | 低 | — | 可做 |
| E5 | 429 缺 `Retry-After` 契約 | `packages/contracts` + `apps/api` | 低 | E4 | 可做 |
| C1 | 補 COOP／CORP | 部署設定 | 低 | — | 可做 |
| C2 | CSP 導入 Trusted Types | 部署設定 + `apps/web` | 中 | C1 | 可做 |
| C3 | Permissions-Policy 對齊與 Privacy Sandbox 退出 | 部署設定 | 低 | — | 可做 |
| C4 | 本地 server 與 Hosting 的保真度落差 | `apps/web` | 低 | — | 可做 |
| D1 | a11y 閘門補上 WCAG 2.2 | `tests` | 低 | — | 可做 |
| D2 | 效能預算納入模組數與往返深度 | `scripts` | 低 | A1、A2 | 可做 |
| E6 | api-client 逾時改用 `AbortSignal` | `apps/web` | 低 | — | 可做 |
| F1 | 供應鏈：moderate advisory 與 action pinning | CI | 低 | — | 可做 |
| A3 | 修正 `build-web.mjs` 裡不成立的 CSP 理由 | `scripts` | 低 | — | 可做 |
| B3 | 預約頁改由 `/booking` 提供 | 部署設定 + `apps/web` | 中 | — | 可做（已決策） |
| G1 | 週檢視內層多出一條無用的垂直捲軸 | `apps/web` | 低 | — | 可做 |
| G2 | 手機版週檢視改為行程表檢視 | `apps/web` | 中 | G1 | 可做 |
| ~~X1~~ | ~~per-entry bundling~~ | — | — | — | **已否決，見下** |

「閘門」欄位的「可做」代表該項不依賴 D-001～D-011 任何一項；沒有任何一張卡會
啟用被禁用的能力。

2026-07-26 的兩項決策已記錄於 `docs/product/phase-1-decision-register.md` 的
「Web-standards audit directions」：**X2 決定採用 `/booking`**（改寫為任務 B3），
**X1 的 bundling 決定否決、維持逐檔可讀性**（衍生任務 A3）。

---

# 批次 1：正確性（先修，因為會靜默吃掉資料流）

## E1 — outbox 查詢的 head-of-line blocking

**邊界**：`apps/worker`、`firestore.indexes.json`
**風險**：高（會讓已到期的日曆同步被卡住最長一小時）

### 現況

`apps/worker/src/outbox-processor.ts:89-93`：

```ts
const candidates = await this.db
  .collection(OUTBOX_COLLECTION)
  .where('status', 'in', ['pending', 'in_progress'])
  .limit(20)
  .get();
```

沒有 `orderBy`，所以 Firestore 回的是文件 ID 順序的前 20 筆。

`processDue`（同檔 `:175-177`）的迴圈在 `claim()` 回 `undefined` 時直接 `break`。
而 `claim()` 只在**這 20 筆候選全部不可領取**時才回 `undefined`：
`isDue`（`packages/domain/src/outbox.ts:101-105`）對還在退避中的工作回 `false`。

### 為什麼要緊

`MAX_BACKOFF_SECONDS = 3600`（`packages/domain/src/outbox.ts:24`）。只要文件 ID
最小的 20 筆同時處於退避，任何文件 ID 排在它們之後、其實已經到期的工作，在這
一輪完全碰不到——最壞情況是一筆該立刻送出的日曆同步被卡一小時。批次結束後
下一輪會重查，但候選集合不變，所以卡住的狀態會持續到那 20 筆之一離開
`pending`／`in_progress`。

### 要改什麼

1. 查詢改成以到期時間排序、只取真正可能到期的工作。建議形狀：

   ```ts
   .where('status', '==', 'pending')
   .where('nextAttemptAt', '<=', now)
   .orderBy('nextAttemptAt')
   .limit(20)
   ```

   注意 `nextAttemptAt` 在「立即到期」時是 **`undefined`（欄位不存在）**，
   見 `requeue()` 的註解（`outbox-processor.ts:292-293`）與 `isDue` 的
   `=== undefined` 分支。Firestore 的範圍查詢不會回傳缺欄位的文件，所以
   **必須先讓建立工作時就寫入 `nextAttemptAt`**（新工作寫入當下的時間），
   或改為兩段查詢。選前者：改 `planOutboxAttempt` 之外的建立路徑，讓欄位恆存在，
   並保留 `isDue` 現有的 `undefined` 分支作為舊資料的相容路徑。
2. 過期租約的回收要有獨立路徑，不能再靠 `status in [pending, in_progress]`
   混在同一個查詢裡。建議另一個查詢：
   `where('status','==','in_progress').where('leaseExpiresAt','<=',now).orderBy('leaseExpiresAt').limit(N)`。
3. `firestore.indexes.json` 目前是空的（`{"indexes": [], "fieldOverrides": []}`），
   要補上對應的複合索引，否則正式環境查詢直接失敗。

### 不要碰

- `planOutboxAttempt` 的退避與死信決策邏輯（純函式，已有測試）。
- `requeue()` 用 `FieldValue.delete()` 而非設 `null` 的作法——那是刻意的，
  註解已說明原因。

### 驗收

新增 Emulator 測試，必須涵蓋：

1. 建立 21 筆工作，讓文件 ID 最小的 20 筆都處於未來的 `nextAttemptAt`，
   第 21 筆已到期 → `processDue` 必須處理到第 21 筆。
2. 一筆 `in_progress` 且租約已過期的工作，必須能被重新領取。
3. 一筆 `in_progress` 且租約未過期的工作，不得被重複領取。

```bash
corepack pnpm test:rules
```

---

## E2 — outbox 批次時間戳與租約

**邊界**：`apps/worker`
**風險**：中　**依賴**：E1（同一個檔案，接著做以免衝突）

### 現況

`apps/worker/src/outbox-processor.ts:165-168`：

```ts
public async processDue(
  now = new Date().toISOString(),
  maxJobs = 50
): Promise<ProcessSummary> {
```

整批共用同一個 `now`。`claim()` 用它算租約（`:117-119`）：

```ts
leaseExpiresAt: new Date(Date.parse(now) + LEASE_SECONDS * 1000).toISOString()
```

`LEASE_SECONDS = 120`（`:47`），`maxJobs` 預設 50，而每一筆都要打一次外部日曆。

### 為什麼要緊

批次跑超過 120 秒時，後面領到的工作**在領到的當下租約就已經過期**，另一個
worker 可以同時領走同一筆。實務上 `idempotencyKey` 加上 upsert 擋住了重複事件，
所以這是「租約語意破了」而不是「資料壞了」——但租約是這個設計唯一的互斥手段，
不該只靠下游的冪等兜底。

此外 `settle()` 寫入的 `settledAt: now`（`:156`）也是整批同一時間，稽核紀錄上
50 筆工作會顯示成同一瞬間完成。

### 要改什麼

把三種時間分開：

- **批次基準時間**（決定「哪些算到期」）：維持參數化的 `now`，測試才能注入。
- **租約起算時間**：`claim()` 內部取 `Date.now()`。
- **結算時間**：`settle()` 內部取 `Date.now()` 寫入 `settledAt`。

`planOutboxAttempt` 需要的 `now`（算下一次退避）也應該用結算當下的時間，不是
批次起始時間。

### 驗收

新增單元測試：注入一個會前進的假時鐘，驗證第 N 筆工作的 `leaseExpiresAt`
是「領取當下 + 120 秒」而不是「批次起始 + 120 秒」。

```bash
corepack pnpm test:unit
corepack pnpm test:rules
```

---

## E3 — `UtcIsoTimestampSchema` 放行非 ISO 字串

**邊界**：`packages/contracts`（先）、`packages/domain`（後）
**風險**：中

### 現況

`packages/contracts/src/common.ts:3-8`：

```ts
export const UtcIsoTimestampSchema = z
  .string()
  .refine(
    (value) => value.endsWith('Z') && !Number.isNaN(Date.parse(value)),
    'Must be a valid UTC ISO-8601 timestamp.'
  );
```

實測證據（Node 24.15）：

```
"Jul 25 2026 Z"  →  endsWith('Z') = true，Date.parse 成功  →  通過驗證
```

同一組判斷在 domain 複製了 6 份：

- `packages/domain/src/appointment.ts:114`
- `packages/domain/src/appointment-transition.ts:161`
- `packages/domain/src/audit.ts:164`
- `packages/domain/src/booking-transaction.ts:116`
- `packages/domain/src/case-assignment.ts:60`
- `packages/domain/src/follow-up.ts:97`

### 為什麼要緊

`Date.parse` 對非 ISO 格式的解析是 implementation-defined。V8 接受
`"Jul 25 2026 Z"`，Safari／Firefox 不保證相同結果。一個通過驗證而存進 Firestore
的這種字串，換一個 runtime 讀出來就是另一個時間或 `NaN`——正好違反
`AGENTS.md` 第 5 條「時間戳以 UTC 儲存」。

### 要改什麼

1. `packages/contracts`：改用 zod 4 內建的 `z.iso.datetime({ offset: false })`，
   它做的是真正的 ISO-8601 格式檢查而不是委託給 `Date.parse`。保留原本的
   錯誤訊息。
2. `packages/domain`：抽出一個共用的嚴格檢查（domain 不依賴 zod，所以用 regex），
   把 6 處重複換成呼叫它。regex 至少要涵蓋
   `YYYY-MM-DDTHH:MM:SS(.sss)?Z`，並保留既有的 `INVALID_TIMESTAMP` 錯誤碼。
3. 兩邊都要加一組「必須被拒絕」的測試，至少包含
   `"Jul 25 2026 Z"`、`"2026-13-01T00:00:00Z"`、`"2026-07-25T25:00:00Z"`。

### 明確不要做

**不要改用 `Temporal`。** 已確認 Node 24.15 需要 `--harmony-temporal` 才有
`globalThis.Temporal`（瀏覽器端 Chrome 148 已內建）。`packages/domain` 必須同時
在 Node 與瀏覽器執行，所以現階段不能用。等 Node 端無旗標可用時再開一張新卡。

### 驗收

```bash
corepack pnpm test:unit
corepack pnpm run check:types
```

---

# 批次 2：前端效能

## A1 — 注入 `modulepreload`，消除 5 趟往返

**邊界**：`scripts/build-web.mjs`、`apps/web/public/*.html`
**風險**：中（改建置產出，但不改執行語意）

### 現況

實測（`WEB_ROOT=dist` 的產物，瀏覽器網路面板）：patient.html 載入 **31 支 JS**。
模組圖的發現深度：

```
admin-bootstrap.js: 33 modules, discovery depth 4  （18 個檔案要到第 3 趟才被發現）
patient-app.js:     31 modules, discovery depth 4  （18 個檔案要到第 3 趟才被發現）
```

`apps/web/public/index.html` 與 `patient.html` 目前**沒有任何**
`<link rel="modulepreload">`（全 repo grep 為 0）。

### 為什麼要緊

瀏覽器要跑 5 趟連續 round trip 才把程式碼收齊。手機 4G RTT 約 100ms，等於在
應用開始執行之前先付掉約 500ms 的純延遲，直接反映在 LCP 與 INP 上。

### 要改什麼

在 `scripts/build-web.mjs` 的 `planHashedBuild` 之後、寫檔之前，替每個 HTML
進入點算出它的**傳遞模組閉包**，把 `<link rel="modulepreload" href="...">`
注入到 `</head>` 之前。

實作提示：

- 相依圖已經在 `planHashedBuild` 內算過（`dependencies` map，`:129-136`），
  把它一併回傳即可，不必重算。
- 進入點從 HTML 的 `<script type="module" src="...">` 抓，改寫邏輯與
  `rewriteHtmlReferences`（`:215-223`）同一處。
- 注入的 `href` 必須是**改寫後的雜湊檔名**，否則會多下載一份。
- 保持 `planHashedBuild` 為純函式，注入邏輯要能被單元測試餵合成檔案集合。
  `apps/web/src/build-web.test.ts` 已經是這個模式，照它加測試。

### 不要碰

- 不要改 CSP。`modulepreload` 受 `script-src` 管轄，而目前的 `'self'` 已經涵蓋。
- 不要改 `apps/web/public/` 裡的 HTML 手動加 link——那樣雜湊檔名會對不上。

### 驗收

```bash
corepack pnpm run build:web
corepack pnpm test:unit
corepack pnpm run check:perf
```

再以瀏覽器實測：`WEB_ROOT=dist` 啟動 `apps/web/server.mjs`，確認網路面板中
所有模組在**第 1 趟**就開始下載，而不是分 5 波。

`check:perf` 的 script 數量預算（`apps/web/performance-budget.json`）目前是
38／40，加上 preload link 不會增加請求數，只改變時序，所以預算不需要調整；
如果它擋下來了，代表注入邏輯重複下載了資源，回頭修而不是放寬預算。

---

## A2 — vendor barrel 改為深層 import

**邊界**：`apps/web`
**風險**：低

### 現況

`apps/web/public/vendor/domain/index.js` 是 `export *` × 13。四個模組透過它取用
領域函式：

| 檔案 | 行 | 取用的符號 | 真正所在檔案 |
| --- | --- | --- | --- |
| `modules/appointment-domain.js` | 22 | `calendarEventIdForAppointment`, `calendarEventIdForFollowUp` | `calendar-event-id.js` |
| `modules/constants.js` | 15 | `SLOT_DURATION_MINUTES`, `SLOT_MINUTE_MARKS`, `TAIPEI_TIME_ZONE` | `schedule.js` |
| `modules/domain-rules.js` | 15 | `assertReschedulable`, `assertSlotBookable`, `assertTransitionAllowed`, `assertWithinActiveBookingLimit`, `DomainError` | `appointment-rules.js`, `errors.js` |
| `modules/schedule-engine.js` | 19 | `assertScheduleValid`, `assertScheduleVersionMatches`, `DomainError`, `followUpGridTimes`, `planSlots`, `scheduleImpact` | `schedule.js`, `errors.js` |

因為 barrel，患者預約頁實際下載了 `payroll`、`case-assignment`、`audit`、
`outbox`、`appointment-transition`、`appointment` 等它用不到的檔案。由於不做
bundling，tree-shaking 幫不上忙——每個檔案就是一個獨立請求。

### 預期效果（已算過，不要高估）

改為深層 import 後的 vendor 閉包是 7 個檔案：

```
appointment-rules, audit, booking-transaction, calendar-event-id,
errors, idempotency, schedule
```

也就是 **13 → 7，省 6 個請求**。省不掉更多是因為 `appointment-rules` 會拉進
`booking-transaction`，而它又拉 `audit`／`idempotency`。

bundling（X1）已於 2026-07-26 否決，所以**不會有後續的大幅削減**——這 6 個就是
這條路上能省的全部，剩下的請求數由 A1 的 `modulepreload` 攤平成一趟往返、
由 D2 守住不再長回去。

### 要改什麼

把上表四個檔案的 `from '../vendor/domain/index.js'` 拆成指向實際檔案的
具名 import。不要動 `vendor/` 目錄本身。

### 驗收

```bash
corepack pnpm run check:sync   # 必須仍然通過：vendor 未被手改
corepack pnpm verify
corepack pnpm test:e2e
```

實測確認患者頁不再請求 `payroll.*.js` 與 `case-assignment.*.js`。

---

## X1 — per-entry bundling：**已否決（2026-07-26）**

稽核曾提案把每個進入點打包成一支檔案，可把患者頁的 31 個請求降到 2 個。
**專案負責人否決，理由是可讀性**：`dist/` 必須維持與 `public/` 逐檔對應，出貨的
程式碼才能被讀、被對照原始碼檢查。決策記錄見
`docs/product/phase-1-decision-register.md` 的「Web-standards audit directions」。

**這個否決有一個必須寫下來的後果**：A1 的 `modulepreload` 從「先行改善」升格為
**永久解法**。既然不會有 bundling 來收拾請求數，就必須靠閘門守住它——這正是 D2
存在的理由，D2 因此從「選配」變成**必要**。

不要重新提案 bundling，除非出現推翻可讀性這個理由的新證據。

---

## A3 — 修正 `build-web.mjs` 裡不成立的 CSP 理由

**邊界**：`scripts`
**風險**：低

### 現況

`scripts/build-web.mjs:302-304`：

> **不做 bundling**，只逐檔壓縮：CSP 是 `script-src 'self'`，產物必須維持一份份
> 的 ES module

同檔 `:15-17` 也有類似說法。

### 為什麼要改

**這個理由是錯的。** CSP 的 `script-src 'self'` 限制的是腳本的**來源**與是否
inline，不是檔案數量；一支同源的 bundle 完全符合 `script-src 'self'`。

不做 bundling 的決定本身**是對的**，但它站得住腳的理由是逐檔可讀性（見 X1），
不是 CSP。留著一個不成立的技術限制在註解裡，下一個讀到的人會以為那是硬性約束
而不再重新評估——註解的價值就在於它說的是真的。

### 要改什麼

把兩處註解改成陳述真正的理由：`dist/` 與 `public/` 逐檔對應是刻意保留的性質，
出貨產物必須能對照原始碼檢查；並註明 CSP 並未要求這件事。

**只改註解，不改任何行為。**

### 驗收

```bash
corepack pnpm run check:format
corepack pnpm test:unit
```

---

# 批次 3：韌性與部署設定

## B1 — `<noscript>` 後備與靜態聯絡資訊

**邊界**：`apps/web`
**風險**：低

### 現況

`apps/web/public/index.html` 的 `<body>` 只有三個元素：skip-link、
`<main class="login-view" hidden>`（`:24`）、`<div class="app-shell" hidden>`（`:83`）。
JS 沒有執行時，**整頁全白**。

`patient.html` 稍好但一樣不可用：`#patient-booking-app` 預設 `hidden`，
JS 沒跑就只剩 header 與 footer，且 footer 的「門診時間讀取中」永遠停在讀取中。
**靜態 HTML 裡查不到電話**——電話只存在於 JSON-LD（`patient.html:50`）。

全 repo 沒有任何 `<noscript>`。

### 為什麼要緊

這不只是「使用者關掉 JS」的邊緣情境。目前患者頁要載入 31 支模組，任何一支
失敗（網路不穩、快取毒化、CDN 異常）都會得到同一個結果：一個沒有任何說明、
也沒有診所電話的空白頁。對一個門診預約頁來說，最低限度的後備應該是
「請致電 02-2577-1314」。

### 要改什麼

1. 兩頁都加 `<noscript>`，內容包含診所名稱、地址、電話（`tel:` 連結）與
   門診時間，並說明線上預約需要 JavaScript。
2. `patient.html` 的靜態 HTML 中補上電話，不要只放在 JSON-LD。
   診所資訊的單一來源是 `modules/constants.js` 的 `CLINIC`
   （見該檔 `:17-19` 的註解），修改時兩邊要一致。
3. 考慮把門診時間的靜態文字直接寫進 HTML，讓 JS 只做「更新」而不是「填空」，
   這樣 `門診時間讀取中` 就不會是永久狀態。

### 不要碰

不要為此引入伺服器端渲染或框架。這是靜態 HTML 的補強。

### 驗收

`scripts/check-web-ui.mjs` 有輸入控制項的允許清單（`:210`、`:268`、`:279`）與
外部 URL 檢查（`:320-323`）。`<noscript>` 內只放文字與 `tel:` 連結，不會觸發，
但仍要跑：

```bash
corepack pnpm run check:ui
corepack pnpm verify
```

手動驗證：瀏覽器停用 JavaScript 後載入兩頁，必須看得到診所電話。

---

## B2 — HTML `no-store` → `no-cache`

**邊界**：`firebase.json`、`apps/web/server.mjs`
**風險**：低

### 現況

`firebase.json:10` 對 `**` 設定 `Cache-Control: no-store`；
`apps/web/server.mjs:60-63` 對非雜湊資產同樣是 `no-store`。

實測 A/B（同一份 `dist`，只改這一個標頭）：

| HTML 的 Cache-Control | 上一頁導覽的 transferSize |
| --- | --- |
| `no-store` | 19,983 bytes（重新下載） |
| `no-cache` | 0 bytes（走快取） |

### 為什麼要緊

除了上面實測到的重複下載，Chrome 的文件明載**主文件帶 `no-store` 的頁面不進
back/forward cache**。bfcache 還原在 Core Web Vitals 的實地資料裡算成近乎瞬間的
導覽，放棄它等於自願讓 LCP／INP 的欄位數據變差。

（誠實標註：我在稽核用的嵌入式瀏覽器裡兩次 `notRestoredReasons` 都回
`masked`、兩次都沒有被 bfcache 還原，所以 bfcache 這一段是引用 Chrome 的
文件行為，不是我在這台機器上直接驗到的。上表的 transferSize 差異則是實測。）

### 要改什麼

HTML 與其他非雜湊資產改為 `no-cache`（仍然每次重新驗證，但可以進快取與
bfcache）。內容雜湊過的 `.js`／`.css` 維持
`public, max-age=31536000, immutable` 不變。

`firebase.json` 與 `apps/web/server.mjs` 兩邊都要改——後者宣稱鏡像前者。

### 驗收

```bash
corepack pnpm run build:web
```

以 `WEB_ROOT=dist` 啟動本地 server，`curl -I` 確認：

- `/patient.html` → `Cache-Control: no-cache`
- `/store.<hash>.js` → `Cache-Control: public, max-age=31536000, immutable`

`apps/web/src/security-headers.test.ts` 已經在測標頭，把新的期望值加進去。

---

## B3 — 預約頁改由 `/booking` 提供（已決策）

**邊界**：部署設定 + `apps/web`
**風險**：中（動到對外網址，且本地 server 必須同步）

### 決策

**預約頁的對外路徑是 `/booking`**（2026-07-26，記錄於
`docs/product/phase-1-decision-register.md`）。

網域仍未定案：`beauessence.com.tw` 只是目前 markup 自己寫的值，上線前要由診所
確認。**這張卡不處理網域**，只處理路徑——路徑錯了現在就會 404，網域則是上線前
換一個字串的事。

### 現況

`apps/web/public/patient.html:15` 與 `:25`：

```html
<link rel="canonical" href="https://beauessence.com.tw/booking" />
<meta property="og:url" content="https://beauessence.com.tw/booking" />
```

`firebase.json` 的 hosting 區塊**沒有任何 `rewrites`、`cleanUrls` 或
`trailingSlash`**，實際部署出來的路徑是 `/patient.html`。`/booking` 會 404，
也就是說 canonical 與所有社群分享連結目前都指向一個打不開的網址。

### 要改什麼

採用**顯式設定**，不要用 `cleanUrls`：

1. `firebase.json` 加兩條規則。順序在 Firebase Hosting 是
   redirects → rewrites → headers，所以不會互相打架，也不會產生迴圈
   （rewrite 是內部取檔，不是再一次 HTTP 導向）：

   ```jsonc
   "redirects": [
     { "source": "/patient.html", "destination": "/booking", "type": 301 }
   ],
   "rewrites": [
     { "source": "/booking", "destination": "/patient.html" }
   ]
   ```

   301 那條是必要的：少了它，同一份內容會同時活在兩個網址上，canonical 只能
   建議、不能強制。

2. `apps/web/server.mjs` 必須實作同兩條規則。E2E 跑在這個 server 上，
   本地與 Hosting 不一致就等於沒測到真正會部署的行為。

3. 站內連結全部改指 `/booking`：
   - `apps/web/public/index.html:179`（工作臺的「患者預約頁」）
   - `apps/web/public/patient.html:90`（頁首品牌連結）
   - `apps/web/public/patient.html:151`（維護畫面的「重新整理狀態」）

4. `apps/web/performance-budget.json` 的進入點路徑由 `/patient.html` 改為
   `/booking`。

5. `tests/e2e/*.spec.ts` 裡的 `page.goto('/patient.html')` 改為 `/booking`，
   並**新增一條測試**驗證 `/patient.html` 會 301 到 `/booking`。

### 為什麼不用 `cleanUrls` 或改檔名

`cleanUrls: true` 會對整站生效（`/index.html` 也會被導向 `/`），是全域的隱式
行為，而且 `server.mjs` 要完整複製它才能維持保真度。兩條顯式規則看得見、
好測、影響面精確。改檔名（`patient.html` → `booking.html`）則會在測試、
連結與預算檔製造一批與這次目的無關的改動。

### 不要碰

- `patient.html:8` 的 `<meta name="robots" content="noindex, nofollow">` 維持不動。
  測試版仍然不對外索引。
- 不要改網域字串。那是上線前的獨立動作。

### 驗收

```bash
corepack pnpm run build:web
corepack pnpm run check:perf
corepack pnpm test:e2e
```

以 `WEB_ROOT=dist` 啟動本地 server 後：

- `curl -I http://127.0.0.1:3100/booking` → `200`
- `curl -I http://127.0.0.1:3100/patient.html` → `301`，`Location: /booking`

---

# 批次 4：安全標頭

三張卡都動同兩個檔案（`firebase.json` 與 `apps/web/server.mjs`），建議連續做完
再一起驗收，避免互相衝突。

## C1 — 補 COOP／CORP

**風險**：低

現行標頭已有 CSP、`X-Content-Type-Options`、`Referrer-Policy`、
`X-Frame-Options`、`X-Robots-Tag`、`Permissions-Policy`。缺：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

前者切斷跨來源視窗對 `window.opener` 的存取，後者阻止其他站台把本站資源當成
子資源載入。兩者都不會影響本站（所有資源同源、沒有跨來源彈窗）。

驗收：兩份設定都改，`apps/web/src/security-headers.test.ts` 加期望值，
`pnpm test:e2e` 必須全綠（COOP 若配置錯誤會打斷頁面）。

## C2 — CSP 導入 Trusted Types

**風險**：中　**依賴**：C1

現行 CSP：

```
default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self';
object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
```

這個專案大量使用 `innerHTML`（`admin-bootstrap.js` 20 餘處、`patient-app.js`
數處），目前完全靠 `escapeHtml` 的紀律撐住。稽核確認現行程式碼的逸出是完整的，
但那是一個每次新增 render 函式都要重新遵守的約定。Trusted Types 把約定變成
瀏覽器強制。

**分兩步做，不要一次上線：**

1. 先加 `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'`，
   跑完整的 e2e 與手動流程，收集違規清單。
2. 依清單建立一個具名 policy（把現有的 `escapeHtml` 包成 `createHTML`），
   把所有 `innerHTML` 指派改為經過該 policy，然後才把指令移進正式的 CSP：
   `require-trusted-types-for 'script'; trusted-types beauessence`。

驗收：第 2 步完成後，`pnpm test:e2e` 全綠且 console 無 CSP 違規。

## C3 — Permissions-Policy 對齊與 Privacy Sandbox 退出

**風險**：低

現況不一致：

- `firebase.json:17`：`camera=(), microphone=(), geolocation=(), payment=()`
- `apps/web/server.mjs:72`：`camera=(), microphone=(), geolocation=()`（少 `payment=()`）

`server.mjs` 的註解宣稱它以與 Firebase Hosting 相同的安全／快取政策服務產物，
所以這個漂移本身就是缺陷。

同時建議補上 Privacy Sandbox 的退出指令——對一個處理健康資料的站台，明確拒絕
比預設參與更合適：

```
browsing-topics=(), attribution-reporting=(), join-ad-interest-group=(), run-ad-auction=()
```

驗收：`apps/web/src/security-headers.test.ts` 加一條「兩份設定的
Permissions-Policy 必須逐字相同」的測試，讓漂移下次直接被擋。

## C4 — 本地 server 與 Hosting 的保真度落差

**風險**：低

`apps/web/server.mjs:26-33` 的副檔名允許清單沒有 `.json`，所以
`asset-manifest.json` 與 `vendor/domain/manifest.json` 在本地一律 404（實測確認），
但 Firebase Hosting 會照常提供。

兩個選項，擇一並在 commit 訊息說明理由：

- **A**：把 `.json` 加進允許清單，讓本地忠實反映 Hosting。
- **B**：讓 `build-web.mjs` 不要把 `asset-manifest.json` 寫進 `dist/`
  （改寫到 `dist/` 之外的位置，或只在需要時產生），讓兩邊都不提供它。

建議 B——那份 manifest 是給操作者對照用的，runtime 不需要（`build-web.mjs:340`
的註解自己說了），沒有理由出貨。但若要保留它作為部署稽核證據，就選 A。

驗收：`apps/web/src/build-web.test.ts` 加對應斷言。

---

# 批次 5：品質閘門

## D1 — a11y 閘門補上 WCAG 2.2

**邊界**：`tests`
**風險**：低

`tests/e2e/accessibility.spec.ts:12-17` 的 `withTags` 只到 `wcag21aa`：

```ts
const builder = new AxeBuilder({ page }).withTags([
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa'
]);
```

已安裝的 axe-core 是 **4.12.1**，其中 `target-size` 規則（SC 2.5.8，WCAG 2.2 AA）
掛在 `wcag22aa` 標籤下——也就是說這條規則從來沒有被執行過。WCAG 2.2 自 2023 年
起就是 W3C Recommendation，是 2026 年的現行標準。

**已實測：補上 `wcag22a` 與 `wcag22aa` 之後，三支測試仍然全綠**，所以這是零成本
的一層保護。

順帶記錄：患者頁 footer 有三個 21px 高的連結（`預約須知` 64×21、
`開發工具` 81×21、`開發工作臺` 80×20）。axe 判定通過，因為 SC 2.5.8 有間距例外。
這**不是**違規，不要為此改樣式；但若那一區日後變擠，補上的規則會即時抓到。

### 要改什麼

在 `withTags` 陣列加入 `'wcag22a'` 與 `'wcag22aa'`。同時更新該檔開頭的註解，
說明涵蓋的標準版本。

### 驗收

```bash
corepack pnpm test:e2e
```

## D2 — 效能預算納入模組數與往返深度

**邊界**：`scripts`
**風險**：低　**依賴**：A1、A2

**這張卡是必要的，不是選配。** X1（bundling）已否決，代表逐檔載入是這個專案的
長期形態；沒有任何後續改動會再壓低請求數，所以唯一能防止它長回去的就是閘門。

A1 與 A2 修好之後，沒有任何自動檢查會阻止它再退化：
`apps/web/performance-budget.json` 只管位元組與請求數，不管**往返深度**，而深度
才是這次真正的問題（31 個請求分 5 波 vs. 分 1 波，位元組完全一樣）。

在 `scripts/check-performance-budget.mjs` 增加兩項：

1. 每個進入點的模組圖最大發現深度上限（A1 完成後應為 1）。
2. 每個進入點的 preload link 數量必須等於其傳遞閉包大小（防止漏注入）。

深度計算就是對 `dist/` 的模組圖做 BFS，把 HTML 內的 `modulepreload` 視為
深度 0 的發現來源。

驗收：故意移除一個 preload link，`pnpm run check:perf` 必須失敗。

---

# 批次 6：其餘後端與供應鏈

## E4 — rate limiter 的 Map 不回收

**邊界**：`apps/api`　**風險**：低

`apps/api/src/platform/runtime/rate-limiter.ts:23-42` 的 `windows` Map 只增不減。
每一個出現過又不再出現的 key 都永久佔用記憶體。註解已說明正式版的限流器由
D-010 決定會換成共用 store，但在那之前這個 in-memory 版本若被實際掛上路由，
就是一條慢速記憶體耗盡路徑（key 通常含呼叫者識別或 IP）。

要改：在 `assertWithinLimit` 內順手清掉已過期的視窗，或加一個以
`windowMs` 為週期的清掃。不要引入計時器（測試需要可決定性），用惰性清掃即可。

驗收：加單元測試，注入假時鐘，確認 10,000 個一次性 key 在視窗過後
`windows.size` 會回落。

## E5 — 429 缺 `Retry-After` 契約

**邊界**：`packages/contracts`、`apps/api`　**風險**：低　**依賴**：E4

`apps/api/src/platform/errors/api-error.ts` 把 `RateLimitedError` 對應到 429，
但沒有任何地方產生 `Retry-After`。

前端已經先假設它會存在——`apps/web/public/modules/api-client.js:13` 的註解：

> 429/503 在真實 transport 會帶 Retry-After

要改：讓 `RateLimitedError` 攜帶「還要等幾秒」（`FixedWindowRateLimiter` 算得出來，
它知道視窗起始時間），並在 `mapErrorToApiResponse` 的回傳裡帶出對應的標頭資訊，
由 controller 寫入回應。`ServiceUnavailableError` 同理。

驗收：`apps/api` 的單元測試涵蓋「429 必須帶 `Retry-After`，且其值不大於視窗長度」。

## E6 — api-client 逾時改用 `AbortSignal`

**邊界**：`apps/web`　**風險**：低

`apps/web/public/modules/api-client.js:157-175` 的 `withTimeout` 是手刻的
promise race：逾時之後只是不再等待，底層請求仍在進行。

現在的 transport 是瀏覽器內的合成 store，所以沒有實害。但這段程式碼的存在理由
就是「讓未來的 `/v1` fetch 換上來時 UI 已經有逾時語意」（見該檔 `:7-9` 的註解），
而換上 fetch 之後，一個掛住的請求會持續佔用 HTTP/1.1 的 6 連線額度。

要改：改用 `AbortSignal.timeout(ms)`，並以 `AbortSignal.any([...])` 合併使用者
取消的訊號，讓 transport 收得到 abort。兩者都是 baseline 可用的 API。

同時處理：重試（`:213-217`）目前沒有任何延遲或 jitter，是立刻重打。
加上小幅退避。

驗收：`apps/web/src/api-client.test.ts` 加測試，確認逾時會對 transport 傳入
已 abort 的 signal。

## F1 — 供應鏈：moderate advisory 與 action pinning

**邊界**：CI　**風險**：低

1. `pnpm audit` 目前有 4 筆 moderate，全在 `firebase-tools` 與 `firebase-admin`
   底下：`uuid`、`@opentelemetry/core`、`@hono/node-server`、`tar`。
   `check:supply-chain` 用 `--audit-level high`，所以不會擋。其中
   **`uuid` 經由 `firebase-admin` 進到 `apps/api` 的正式相依**，其餘是 CLI／
   dev-only。要做的是：在 `pnpm-workspace.yaml` 的註解區塊比照現有的
   `find-my-way`／`brace-expansion` 體例，記錄這四筆的路徑、影響範圍與
   解除條件，並判斷 `uuid` 是否可以用 `overrides` 鎖到 `>=11.1.1`。
2. `.github/workflows/*.yml` 的 actions 以 tag 釘（`actions/checkout@v4` 等）。
   2026 年的供應鏈建議是釘 commit SHA，並在旁邊註記版本。

**已知限制**：這個 repository 目前**沒有 git remote**，所以 `verify.yml` 與
`codeql.yml` 從來沒有真的執行過（`codeql.yml` 的註解自己也寫了這一點）。
在推上遠端之前，這一批的價值是「設定正確」而不是「把關生效」。

---

# 批次 7：週檢視的捲動與行動版體驗

2026-07-26 由業主實際操作回報。兩項都在 `apps/web` 的週檢視，G2 依賴 G1 先把
捲動語意收乾淨。

## G1 — 週檢視內層多出一條無用的垂直捲軸

**邊界**：`apps/web`
**風險**：低

### 現況

`apps/web/public/workbench.css:1177-1182`：

```css
.week-view {
  ...
  overflow-x: auto;
}
```

只宣告了 `overflow-x`，但實測 `getComputedStyle(.week-view).overflowY` 是
**`auto`**，不是 `visible`。這不是誰寫錯，是 CSS 的規定：兩軸只要有一軸不是
`visible`，另一軸的 `visible` 就會被計算成 `auto`。於是這個容器拿到了一條它
從來沒有要過的垂直捲軸。

接著是連鎖反應。實測（登入後展開「本週排程」）：

| 視窗寬度 | clientHeight | scrollHeight | 垂直捲軸 |
| --- | --- | --- | --- |
| 375px | 1189 | 1202 | 有（可捲 13px） |
| 800px | 1189 | 1202 | 有（可捲 13px） |

那 13px 正好是**水平捲軸自己的高度**：水平捲軸吃掉內容盒 13px 高度 →
內容因此垂直溢位 13px → 觸發垂直捲軸。一條捲軸長出了另一條捲軸。

### 為什麼要緊

這條垂直捲軸的可捲範圍只有 13px，捲到底也看不到任何新東西——它不傳達資訊，
只做一件事：**把使用者想給頁面的滾輪與觸控手勢吃掉**。游標落在日曆上時滾動，
頁面不動，先空轉那 13px。這正是業主回報的「日曆內垂直滾動條與網頁滾動功能
有點重疊」。

週檢視的網格高度是由 `week-view.js` 依營業時段算出來後直接設定的（`gridHeight`），
容器永遠剛好裝得下，所以**垂直方向從來不需要捲動**。

### 要改什麼

在 `.week-view` 明確宣告 `overflow-y: hidden`，讓它不再從 `visible` 被推成
`auto`。`hidden` 而不是 `clip`：`hidden` 仍允許程式化捲動，鍵盤焦點移到畫面外的
事件時 `scrollIntoView` 還能運作，`clip` 會連那個都擋掉。

**要一併確認的副作用**：水平捲軸仍會吃掉 13px，改成 `hidden` 之後那 13px 會被
裁掉而不是可捲。實作時檢查被裁掉的是不是只有網格底部的空白；若最後一條時間線
或事件底緣被切到，就補等高的 `padding-bottom`，或用 `scrollbar-gutter: stable`。

### 驗收

新增 e2e 斷言（放進 `tests/e2e/workbench-lifecycle.spec.ts` 或 `responsive.spec.ts`）：

```
週檢視容器的 scrollHeight 不得大於 clientHeight
```

在 375px 與桌機寬度各驗一次。

**注意現有測試為什麼沒抓到**：`responsive.spec.ts` 與
`role-maintenance-responsive.spec.ts` 檢查的是**頁面層級**的水平捲動，而這條捲軸
是容器內部的，所以那些測試一路綠燈。新斷言必須針對容器本身。

---

## G2 — 手機版週檢視改為行程表檢視

**邊界**：`apps/web`
**風險**：中　**依賴**：G1

### 現況

實測 375px 寬（登入後展開「本週排程」）：

| 量測 | 值 |
| --- | --- |
| 容器可視寬度 | 331px |
| 內容需要的寬度 | 832px |

`workbench.css:1586-1588` 在桌機斷點把 `.wv-head` 與 `.wv-grid` 的 `min-width`
設為 `52rem`，`.wv-col` 的 `min-width` 是 `6.85rem` × 7 欄。手機上因此要**橫向
捲過 2.5 個螢幕寬**才能看完一週，而且時間軸（`.wv-axis`）不是 sticky——橫向捲動
之後左邊的時間刻度就離開畫面，使用者看得到事件卻不知道那是幾點。

一個七欄的時間網格在 375px 上沒有可用的排法。這不是調參數能解決的，是**檢視型態
選錯了**。

### 目標形狀

業主提供的參考是行事曆 app 的「行程表／Schedule」檢視：不畫時間網格，改成依日期
分組的垂直清單。

```
7月12日至18日          ← 週範圍標題
──────────────────────────────
週日   ┃ 登錄戰雙        ┃
 12    ┃ 上午12時        ┃   ← 左側日期欄 + 右側事件卡
──────────────────────────────
週一   ┃ 登錄戰雙        ┃
 13    ┃ 上午12時        ┃
       ┃ 暑修還課        ┃   ← 同一天多筆就往下疊
       ┃ 下午12時        ┃
```

要點：只垂直捲動、沒有橫向捲動、沒有時間網格、每天的事件往下疊、日期只在群組
標題出現一次。

### 要改什麼

1. 在 `modules/week-view.js` 新增 `renderAgendaView(state, weekStart, todayDate)`，
   與 `renderWeekView` **共用同一份資料準備邏輯**（`shown`、`followUpReminderEvents`、
   `visibleDays`），只換輸出形狀。不要複製一份篩選規則出來——那正是兩份規則開始
   漂移的起點。
2. **依視窗寬度擇一渲染，不要兩份都渲染再用 CSS 藏一份。** 兩份都在 DOM 裡會產生
   重複的 `data-week-event` 按鈕：既有的點擊處理器會抓到兩個，輔助科技也會唸到兩次
   同名的按鈕。用 `matchMedia('(max-width: 48rem)')` 決定要呼叫哪一個，並監聽
   `change` 重新渲染。
3. 必須原樣保留的行為：
   - `data-week-event="<appointment id>"` 按鈕與既有的點擊處理器；
   - 每個事件的完整 `aria-label`（姓名、時間、掛號別、項目、狀態）；
   - `escapeHtml` 對每一個插值；
   - `wv-status-*` 的狀態樣式與 `focus-visible` 外框；
   - `week-view.js` 現有的兩條顯示規則：休診日不顯示，**但只要那天有預約就一定
     要顯示**（該檔 `:224-240` 的註解說明了為什麼——資料不能因為排班改了就從畫面
     上消失）。
4. 行程表沒有絕對定位，所以**不需要 `hydrateWeekView`**，也就不需要任何行內
   樣式。這條路徑比網格更單純，別把 `data-top`／`data-height` 那一套帶過去。

### 不要碰

- 桌機的週網格。它在桌機上是對的，這張卡只加一個行動版的替代檢視。
- 週切換工具列（`week-prev`／`week-today`／`week-next`）。兩種檢視共用同一個
  「目前是哪一週」的狀態。

### 驗收

```bash
corepack pnpm run check:ui
corepack pnpm test:e2e
```

新增 e2e 測試，至少涵蓋：

1. 375px 下週檢視容器 `scrollWidth <= clientWidth`（沒有橫向捲動）；
2. 375px 下每個事件按鈕的高度 ≥ 44px（`typography.spec.ts` 已經在守這個標準）；
3. 同一個 appointment id 在 DOM 中只出現**一個** `data-week-event` 按鈕
   （證明沒有同時渲染兩份）；
4. 桌機寬度下仍然是網格檢視，且既有的週檢視測試不變；
5. axe 掃描在 375px 下仍為零違規（`accessibility.spec.ts` 已涵蓋 WCAG 2.2 AA）。

# 建議執行順序

每一批結束時 `corepack pnpm verify` 必須全綠，再進下一批。

| 批次 | 內容 | 為什麼是這個順序 |
| --- | --- | --- |
| 1 | E1 → E2 | 正確性優先，且同檔，連續做避免衝突。 |
| 2 | A2 → A1 → A3 | 效能。**A2 先做**：A1 注入的清單依模組圖而定，先縮小閉包就不必重跑。 |
| 3 | B1 → B2 → B3 | 韌性、快取與對外網址。 |
| 4 | C1 → C3 → C4 → C2 | C2（Trusted Types）要跑 report-only 觀察期，放最後。 |
| 5 | D1 → D2 | D2 依賴批次 2 的成果，且已升為必要。 |
| 6 | E3 → E4 → E5 → E6 → F1 | 收尾，彼此獨立。 |
| 7 | G1 → G2 | 週檢視。G1 先把捲動語意收乾淨，G2 才知道行動版要取代的是什麼。 |

（2026-07-26 實際執行時，業主指定先做批次 2 與零散小項；E1／E2 與 B1 順延，
仍是未修復的最高優先項。見「執行紀錄」。）

# 需要人類決定的項目

| ID | 問題 | 狀態 |
| --- | --- | --- |
| X1 | 是否接受 `dist/` 不再與 `public/` 逐檔對應，改為 per-entry bundling？ | **2026-07-26 否決**：維持逐檔可讀性。衍生 A3，並使 D2 升為必要。 |
| X2 | 正式的預約頁網址是什麼？ | **2026-07-26 決定 `/booking`**，改寫為任務 B3。 |
| — | 正式網域是否為 `beauessence.com.tw`？ | **仍未定案**，上線前由診所確認；不阻擋 B3。 |

決策內容記錄於 `docs/product/phase-1-decision-register.md` 的
「Web-standards audit directions - 2026-07-26」。

# 執行紀錄

修完一項就在這裡補一列，不要另開文件。

| 日期 | 任務 ID | 結果 | 證據 |
| --- | --- | --- | --- |
| 2026-07-26 | A2 | 完成。vendor 傳遞閉包 14 → 7 個請求 | 瀏覽器網路面板確認 `payload`／`case-assignment`／`outbox`／`appointment-transition`／`follow-up`／`appointment`／`index` 不再被請求；`check:sync` 通過（vendor 未手改） |
| 2026-07-26 | A1 | 完成。往返 5 趟 → 1 趟 | `PerformanceResourceTiming` 實測：患者頁 25 支 JS 全部在 13–20ms 之間同時開始，工作臺 27 支同時開始（先前為 5 波）。`build-web.test.ts` 加 4 項（含「沒有 `</head>` 就讓建置失敗」） |
| 2026-07-26 | A3 | 完成。只改註解 | `build-web.mjs` 兩處不成立的 CSP 理由改為真正的逐檔可讀性理由 |
| 2026-07-26 | D1 | 完成。axe 涵蓋到 WCAG 2.2 AA | 加 `wcag22a`／`wcag22aa` 後三支掃描仍全綠，`target-size`（SC 2.5.8）自此真的會執行 |
| 2026-07-26 | E3 | 完成。時間戳只認規範定義的格式 | 新增 `packages/domain/src/timestamp.ts`，取代 domain 六份複本；`common.test.ts`／`timestamp.test.ts` 共 31 項，釘住 `"Jul 25 2026 Z"`、`2026-02-31`、`2026-02-29` 等必須被拒絕 |
| 2026-07-26 | E4 | 完成。限流器不再無限成長 | 惰性清掃，且**每個視窗最多掃一次**——第一版每遇新 key 就全表掃描，50k 輪替 key 會退化成 O(N²)（實測該檔測試時間 1.36s → 209ms）。新增兩項測試分別釘住記憶體與時間複雜度 |
| 2026-07-26 | B2 | 完成。HTML 改 `no-cache` | `curl -I` 確認 `/patient.html` → `no-cache`，雜湊資產仍為 `immutable` |
| 2026-07-26 | C1 | 完成。補 COOP／CORP | `curl -I` 確認兩者皆為 `same-origin` |
| 2026-07-26 | C3 | 完成。兩份設定對齊並退出 Privacy Sandbox | 新增「本地 server 必須逐字複製 firebase.json 標頭」的測試，漂移下次會直接被擋 |

## 這一輪的取捨與副作用

- **`/index.html` 的 document 預算 10 → 11 KiB。** A1 注入的 28 條 preload 讓
  document 的 gzip 傳輸量變成 10.4 KiB。這不是重複下載（`check-performance-budget`
  以 `Set` 計算閉包，已確認不會重複計數），而是 preload 清單本身的真實成本：
  用約 0.4 KiB 換掉 4 趟連續往返（行動網路上約 400ms）。進入點總量 75.8 KiB／
  預算 90 KiB，仍有餘裕。**這是刻意放寬，不是為了讓紅燈變綠。**
- **E1、E2（outbox head-of-line blocking 與租約）與 B1（JS 失效時的白畫面）
  尚未修復**，仍是目前最高優先的兩項。業主指定先做效能與零散小項。
- B3（`/booking`）、C2（Trusted Types）、C4、D2、E5、E6、F1 未動工。
- **G1、G2 於 2026-07-26 由業主實機操作後新增**（批次 7），已完成診斷與規劃、
  尚未實作。G1 的成因已量測確認：`overflow-x: auto` 讓 `overflow-y` 從 `visible`
  被計算成 `auto`，水平捲軸再吃掉 13px 高度而長出一條只能捲 13px 的垂直捲軸。
  G2 的量測是 375px 下容器可視 331px、內容需要 832px。

## 這一輪的驗收

```
corepack pnpm verify   → 通過（38 個測試檔、438 項；先前 36 檔、389 項）
corepack pnpm test:e2e → 通過（73 項，含補上 WCAG 2.2 後的 axe 掃描）
```

E2E 第一次執行時 Playwright 沿用了先前留下的舊 server 行程（`reuseExistingServer`），
因此標頭改動並未真的被測到；殺掉行程後重跑一次才是上面的結果。
