# INTERNAL_PREPRODUCTION 補強施工計畫（2026-09-14 獨立稽核）

> **Status (2026-09-15):** WP-B1～B11 are **signed**. F-01～F-14 remain
> engineering-open except where the closure matrix marks
> `NO_LONGER_APPLICABLE` or policy-accepted. Do not start from the waiting
> HUMAN BLOCKER text in WP-B*. Current Canon:
> [2026-09-15 WP-B signed authority](../reviews/2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md).
> `INTERNAL_PREPRODUCTION_COMPLETE` is still **FAIL**. This plan stays
> execution context; it does not itself authorize Cloud Run.

**類型：** 工程施工計畫（execution context only）。**不是**核准、不是部署授權、
不改變任何 D-series 狀態。權威順序：[AGENTS.md](../../AGENTS.md) Safety Floor →
[decision register](../product/phase-1-decision-register.md) →
[GOVERNANCE.md](../../GOVERNANCE.md) → 本計畫。衝突時本計畫讓步。

| 項目 | 內容 |
| --- | --- |
| 稽核基準 | `origin/main` `a9a445a4e9bae83f779a9914bc7203961813f916`（PR #123 squash） |
| 稽核日期 | 2026-09-14（Asia/Taipei） |
| 稽核方式 | 獨立、唯讀。未執行任何 test、build、lint、typecheck、emulator、Playwright、Terraform。兩項部署主張以未認證 HTTP GET 驗證 |
| 稽核結論 | `INTERNAL_PREPRODUCTION_COMPLETE = FAIL`（見 §1） |
| 與 PR #124 的關係 | PR #124（2026-09-14 仍開啟）以同一基準記錄 inspect 為 `PASS`。本計畫不修改 #124 的檔案；結論不同的原因見 §1.2 |
| 本文件 commit | 文件無法引用自身 commit。查詢：`git log -- docs/plans/2026-09-14-internal-preproduction-remediation-plan.md` |

配套工具清單：[Agent 工具導入評估與計畫](2026-09-14-agent-tooling-adoption.md)。

## 0. 給執行 agent 的使用規則

1. 開工前依序讀：`AGENTS.md` Safety Floor、[docs/INDEX.md](../INDEX.md) 對應路線、
   本計畫對應的工作包。不要一次載入整份 `docs/`。
2. **一個工作包 = 一個分支 = 一個 PR。** 分支名用工作包指定的名稱。不得在同一個
   PR 混入其他工作包。
3. 先看工作包的「任務等級」：
   - `Direct`：可直接施工。
   - `Planned`：依 [CLAUDE.md](../../CLAUDE.md)「Task classes」，**先提交計畫並取得
     業主核可**再施工。本計畫已提供初稿（檔案、不變量、授權、測試、回滾、部署影響），
     可直接引用後補完。
   - `Decision`：agent 只能起草決策封包，**不得施工**。格式逐字採用
     [human blocker template](../templates/human-blocker-template.md)。
   - `Owner-run`：部署、`terraform apply`、任何雲端變更。agent 準備指令與驗收步驟，
     **由業主本人執行**（`CLAUDE.md`「Production safety」、Safety Floor 8）。
4. 遇到工作包「停止條件」中的任一情況：停下、回報，不要繞過。
5. 回報使用 §7 格式。證據等級依 `CLAUDE.md` 的階梯，不得跳級。本機資源不足時依
   「Resource-aware verification」：重 gate 可交給 CI，回報 `NOT_RUN` 並指名接手的
   CI job，**不得**降低驗證標準。
6. 行號是 `a9a445a` 當下的位置，一律寫成「約 Lxx」。施工時以符號名稱重新定位；
   行號偏移不代表發現失效。

## 1. 稽核結論

### 1.1 為什麼是 FAIL

隔離環境 `beauessence-clinic-stg-c1a01` 的 preview channel 確實已部署，也在服務
靜態頁面，但**沒有 API**：

- `firebase.isolated-preview.json` 沒有 `/v1/**` 的 Cloud Run rewrite；
  `firebase.json` 約 L21-27 有。`scripts/check-public-pages.mjs` 的
  `compareIsolatedPreviewHosting()` 約 L750-753 更明文禁止隔離設定宣告 Run rewrite。
- 2026-09-14 以未認證 HTTP GET 實測 suffix preview URL：`/clinic` 回 200，
  `/v1/slots` 回 404。

因此在這個環境裡無法完成任何一筆 durable booking，IP-001 設定的「可進行完整
internal pre-production」未達成。這是工程／部署缺口，不是 go-live deferral，
也不是 authority blocker。

### 1.2 與 PR #124「PASS」結論不同的原因

- `pnpm inspect:internal-preproduction` 評估的是 operator 提供的 snapshot。
  `scripts/internal-preproduction-complete.mjs` 約 L225 的使用說明寫明它「Does not
  deploy, apply, smoke a live URL」。`ok: true` 代表 snapshot 內部一致且完整，不代表
  工具獨立觀察了雲端狀態。
- `pnpm smoke:internal-test-booking` 的 `evaluateUnauthenticatedApiSurface()`
  （`scripts/internal-test-booking-smoke.mjs` 約 L58-77）把 404 視為 fail-closed
  通過。11/11 個 404 證明的是「後端不存在」，不是 gate 運作正確。
- PR #124 對它自己定義的 packet 而言是一致的；本稽核以 IP-001 的目標衡量，所以
  結論不同。兩者記錄的事實並不互相否定。

### 1.3 已驗證紮實、施工時不得破壞

| 不變量 | 位置 |
| --- | --- |
| fail-closed gate：預設停用、到期時間必須可解析且在未來、禁止 `beauessence-clinic-staging`、非 emulator 只允許 `beauessence-clinic-stg-c1a01` | `apps/api/src/internal-test-booking/internal-test-booking.gate.ts` 約 L38-58 |
| 每條路由「先 gate、後認證」 | `appointment.controller.ts`、`schedule.controller.ts` |
| 伺服器端真實認證：`verifyIdToken(…, true)`、`verifySessionCookie(…, true)`、要求 `email_verified`、拒絕停用帳號、員工需 TOTP、非 GET 的 cookie 請求需 CSRF、timing-safe 比對 | `internal-test-booking.authenticator.ts`、`auth/calendar-pilot-session.ts` |
| 病患 scope 以預約擁有者判定而非呼叫者，避免 403/404 變成存在性預言機 | `platform/authorization/rbac-appointment-policy.ts` `resolveScope()` 約 L35-42 |
| 單一交易寫入 appointment、slot、guard、audit、outbox、idempotency；idempotency 以 `transaction.create` 建立 | `apps/api/src/firestore/booking.repository.ts` 約 L106-167 |
| 同時段競態由純函式 planner 的 `isSlotOccupied` 判定 | `packages/domain/src/appointment-rules.ts`、`booking-transaction.ts` |
| Firestore Rules 全面拒絕 | `firestore.rules` |
| 唯一 required check 真正彙總 6 個 job，並要求 SAST 自報 commit 等於候選 commit | `.github/workflows/verify.yml` `evidence`、`scripts/generate-ci-evidence.mjs` |
| 未接線清單雙向強制 | `apps/api/unrouted-inventory.json`、`scripts/check-architecture.mjs` |
| C5 Terraform 以 exact SHA 把關、拒絕 staging project、鎖定 `asia-east1` | `infra/terraform/c5-firestore/` |

### 1.4 發現清單

| ID | 嚴重度 | 發現 | 工作包 |
| --- | --- | --- | --- |
| F-01 | P0 | C1 沒有 API；stage 無法執行 | WP-A6、WP-B1、WP-C1 |
| F-02 | P1 | C6「formal booking 維持 UNROUTED」gate 與現況不符 | WP-A1 |
| F-03 | P1 | 已掛載寫入面沒有限流、鎖定或重試上限 | WP-B2、WP-C2 |
| F-04 | P1 | 授權拒絕事件沒有持久稽核 | WP-P1 |
| F-05 | P2 | 兩個 controller 的 gate 在注入省略時 fail-open | WP-A2 |
| F-06 | P2 | 完成度證據鏈無法由 repository 重現 | WP-B6、WP-C5 |
| F-07 | P2 | UI 寫入走 API，預約清單留在 localStorage | WP-P2 |
| F-08 | P2 | 病患端沒有互動登入（員工端有） | WP-B3、WP-C3 |
| F-09 | P2 | 沒有應用層告警；API 日誌全部關閉 | WP-P3、WP-B4、WP-C4 |
| F-10 | P3 | 隔離設定 CSP 帶有 staging auth 來源（header parity 規則所致） | WP-C6 |
| F-11 | P3 | 過期計畫文件仍主張已退役的 authority | WP-A5 |
| F-12 | P3 | policy 層寫死 `accountActive: true` | WP-A3 |
| F-13 | P3 | 讀取排程總表以 `create_appointment` 權限把關 | WP-A4 |
| F-14 | P3 | 只有兩個角色能認證；合併不需人工審查 | WP-B5 |

未發現 P0 或 P1 等級的 security 或 data-integrity 缺陷。F-03、F-04 是控制缺口：
在 C1 上因沒有 API 而不暴露；`beauessence-clinic-staging` 上 CAL-PILOT API 的實際
部署版本本稽核**未查證**。

## 2. 授權邊界（所有工作包共用）

- **Safety Floor 8：** preview 授權只能部署靜態檔案，「Never … enable a Firebase
  backend under preview authority」。F-01 的 API 部署需要**新的、獨立的**業主授權
  紀錄；現有 preview packet 不可重用。
- **Safety Floor 7：** 未決政策不得猜測。限流參數（F-03）、病患身分驗證方式
  （F-08）、告警收件人（F-09）都必須先寫進 decision register。
- **IP-001（2026-09-13）：** `INTERNAL_TEST_ROUTE_AUTHORIZED` 與
  `PUBLIC_PRODUCTION_ROUTE_NOT_AUTHORIZED` 分離。任何工作包都不得開放 public
  production 路由、接真實資料、動 live Hosting、DNS 或 production Calendar。
- **D-006（approved）** 已涵蓋：重複失敗需產生稽核；稽核 append-only、任何角色不可刪；
  停用帳號後下一個受保護請求即拒絕；idle 30 分鐘、absolute 8 小時。F-04、F-12 可引用
  D-006。register 同段也寫明「durable audit storage」尚無證據。
- **D-002 pending：** 不得實作稽核、日誌或預約資料的刪除、TTL、保存期限自動化。
- **`CLAUDE.md`「Working tree」：** 不得對含他人變更的工作樹執行 `reset --hard`、
  `clean`、`checkout -- .`；平行工作使用 `.claude/worktrees/`。

## 3. 工作包總覽與相依

| WP | 組別 | 發現 | 等級 | 相依 | 分支 | 執行者 |
| --- | --- | --- | --- | --- | --- | --- |
| WP-A1 | A 立即 | F-02 | Direct（gate 變更） | — | `agent/wp-a1-unrouted-gate-truth` | agent |
| WP-A2 | A 立即 | F-05 | Direct | — | `agent/wp-a2-required-internal-test-gate` | agent |
| WP-A3 | A 立即 | F-12 | Direct（auth 邊界） | — | `agent/wp-a3-account-active-context` | agent |
| WP-A4 | A 立即 | F-13 | Direct（行為等價） | — | `agent/wp-a4-schedule-grid-permission` | agent |
| WP-A5 | A 立即 | F-11 | Direct（docs） | — | `agent/wp-a5-stale-plan-header` | agent |
| WP-A6 | A 立即 | F-01 前置 | Direct | — | `agent/wp-a6-smoke-strict-api-mode` | agent |
| WP-P1 | P 需計畫核可 | F-04 | Planned | 計畫核可 | `agent/wp-p1-durable-denial-audit` | agent |
| WP-P2 | P 需計畫核可 | F-07 | Planned | 計畫核可、IP-001 範圍確認 | `agent/wp-p2-server-appointment-list` | agent |
| WP-P3 | P 需計畫核可 | F-09 前置 | Planned | 計畫核可 | `agent/wp-p3-api-structured-logging` | agent |
| WP-B1 | B 決策 | F-01 | Decision | — | `agent/wp-b1-c1-api-authority-packet` | agent 起草／業主決定 |
| WP-B2 | B 決策 | F-03 | Decision | — | `agent/wp-b2-rate-limit-decision-packet` | agent 起草／業主與資安負責人決定 |
| WP-B3 | B 決策 | F-08 | Decision | — | `agent/wp-b3-patient-auth-decision-packet` | agent 起草／業主決定 |
| WP-B4 | B 決策 | F-09 | Decision | — | `agent/wp-b4-alert-recipient-packet` | agent 起草／業主決定 |
| WP-B5 | B 決策 | F-14 | Decision | — | `agent/wp-b5-role-scope-review-packet` | agent 起草／業主決定 |
| WP-B6 | B 決策 | F-06 | Decision | — | —（離線交付） | operator |
| WP-C1 | C 決策後 | F-01 | Planned＋Owner-run | WP-B1=A、WP-A2、WP-A6 | `agent/wp-c1-c1-api-deployment` | agent 準備／業主執行 |
| WP-C2 | C 決策後 | F-03 | Planned | WP-B2；部署驗證依 WP-C1 | `agent/wp-c2-rate-limiting` | agent |
| WP-C3 | C 決策後 | F-08 | Planned | WP-B3 | `agent/wp-c3-patient-sign-in` | agent |
| WP-C4 | C 決策後 | F-09 | Planned＋Owner-run | WP-B4、WP-P3、WP-C1 | `agent/wp-c4-application-alerts` | agent 準備／業主執行 |
| WP-C5 | C 決策後 | F-06 | Direct（evidence） | WP-B6 | `agent/wp-c5-archive-2026-09-14-evidence` | agent |
| WP-C6 | C 決策後 | F-10 | Direct | WP-C1 或 WP-C3 | `agent/wp-c6-per-environment-auth-origin` | agent |

## 4. 工作包

### A 組：可立即開始

#### WP-A1　修正與現況不符的 UNROUTED gate（F-02，P1）

- **等級：** Direct。屬 blocking gate 變更，依
  `.claude/rules/gates-and-ci.md` 需提供 intentional-failure 證明。
- **授權：** 不需新決策；讓既有 gate 與 IP-001 現況一致。
- **問題：** `scripts/c2-c6-smoke-evidence.mjs` 約 L28-33 的
  `FORMAL_BOOKING_ROUTE_MARKERS` 只對 `app.module.ts` 原始碼做字串比對。
  `AppointmentController` 與 `ScheduleController` 經
  `InternalTestBookingModule.register()` 掛載（`internal-test-booking.module.ts`
  約 L74），這兩個字串不會出現在 `app.module.ts`，所以 gate 仍回報「formal booking
  UNROUTED」。`scripts/sequential-c-gate.mjs` 約 L290-316 使用同一個函式。
- **檔案：** `scripts/c2-c6-smoke-evidence.mjs`、
  `scripts/c2-c6-smoke-evidence.test.mjs`、`scripts/sequential-c-gate.mjs`、
  `scripts/sequential-c-gate.test.mjs`。
- **不變量：**
  - `CalendarWatchController`、`BookPilotModule`、`BookPilotController` 保持未路由。
  - `AppModule` 不得直接 import `AppointmentController`、`ScheduleController`、
    `BookPilotModule`、`BookPilotController` 或 `CalendarWatchController`。
  - 不改寫任何已記錄的 dated evidence JSON。
- **步驟：**
  1. 把「booking UNROUTED」拆成兩條名稱誠實的規則：
     - **R1 直接 import 禁令：** `app.module.ts` 不得直接出現上述五個識別字。保留
       字串比對，訊息改為「AppModule must not import … directly」。
     - **R2 未路由真實性：** 讀取 `apps/api/unrouted-inventory.json`，要求
       `src/calendar/calendar-watch.controller.ts`、`src/book-pilot/book-pilot.module.ts`、
       `src/book-pilot/book-pilot.controller.ts` 都列在 `unrouted`。`check:architecture`
       已雙向強制清單與可達性一致，R2 繼承其正確性。
  2. 刪除「Formal booking … must stay UNROUTED」字樣，改為「CalendarWatchController
     and BookPilot must stay UNROUTED; AppointmentController and ScheduleController
     may be routed only through InternalTestBookingModule」。
  3. C6 smoke evidence 的 `bookingUnrouted` 欄位：若評估器會重新評估歷史 evidence，
     保留讀取舊欄位並新增 `bookPilotUnrouted`，不要刪除欄位。
  4. 先寫測試並確認它先紅：
     - `app.module.ts` 只 import 一個包裝模組，且清單缺少
       `calendar-watch.controller.ts` → 必須 FAIL。
     - `app.module.ts` 直接 import `AppointmentController` → 必須 FAIL。
     - 現況（`InternalTestBookingModule`＋清單完整）→ PASS。
- **驗收：**
  - 上述三個測試存在且通過。
  - 另開一個**不合併**的 intentional-failure PR：把
    `calendar-watch.controller.ts` 從清單移除，同一 commit 上
    `Verification evidence` 為紅。把 run 連結寫進本 WP 的 PR 說明後關閉該 PR。
- **Gates：** 本機
  `corepack pnpm exec vitest run scripts/c2-c6-smoke-evidence.test.mjs scripts/sequential-c-gate.test.mjs`；
  CI `Verification evidence`。
- **回滾：** revert PR。**部署影響：** 無。
- **停止條件：** 若 `check:architecture` 並未把 `calendar-watch.controller.ts` 判為
  不可達，停下回報——那是另一個 gate 缺陷。

#### WP-A2　internal-test gate 注入改為必填（F-05，P2）

- **等級：** Direct。
- **授權：** Safety Floor「any ungated `AppointmentController` … import on
  `AppModule`」仍 disabled；IP-001 fail-closed。
- **問題：** 兩個 controller 以 `@Optional()` 注入設定，設定缺席時直接跳過 gate：
  - `apps/api/src/appointments/appointment.controller.ts` 約 L65-79
  - `apps/api/src/schedule/schedule.controller.ts` 約 L44-53
  目前唯一的生產組合 `InternalTestBookingModule.register()` 一定提供設定，所以現在不可
  利用；但未來任何省略設定的組合都會靜默得到無 gate 的寫入面。
- **檔案：** 上述兩個 controller；`appointment.controller.test.ts`、
  `schedule.controller.test.ts`、`schedule.occupancy.emulator.test.ts`（目前以不帶設定
  的 harness 建構）；確認 `internal-test-booking.emulator.test.ts` 不受影響。
- **不變量：** `register()` 行為不變；預設環境仍回 503；「先 gate 後認證」順序不變。
- **步驟：**
  1. 移除 `@Optional()`，設定與 clock 成為必要依賴。
  2. 刪除 `=== undefined` 早退分支；gate 方法無條件呼叫
     `assertInternalTestBookingWritable()`。
  3. 測試 harness 改為**明確**注入開啟設定，例如
     `{ enabled: true, expiresAtUtc: <固定的未來時間>, projectId: 'beauessence-clinic-stg-c1a01', emulatorHost: '127.0.0.1:8080' }`，
     並注入固定 clock（`.claude/rules/domain-and-api.md`：測試不得依賴牆上時鐘）。
  4. 新增測試：以 Nest testing module 組合 controller 但**不**提供
     `INTERNAL_TEST_BOOKING_SETTINGS` → 模組初始化必須失敗。
- **驗收：** `rg "internalTestSettings === undefined" apps/api/src` 沒有結果；新增的
  失敗組合測試通過；既有 controller 與 emulator 測試全綠。
- **Gates：** 本機只跑上述單元測試檔；emulator 測試交給 CI 的
  `Firestore Emulator（交易、冪等、outbox、預設拒絕）` job，本機可報 `NOT_RUN`。
- **回滾：** revert。**部署影響：** 無。
- **停止條件：** 若有非測試程式碼依賴「不帶設定」的組合，停下回報。

#### WP-A3　帳號狀態由認證層傳入 policy（F-12，P3）

- **等級：** Direct（auth 邊界，開工前讀 Safety Floor）。
- **授權：** D-006「disabling an account must reject its next protected request」。
- **問題：** `rbac-appointment-policy.ts` 每次 `evaluateAccess` 都寫死
  `accountActive: true`；約 L19-25 的註解說停用訊號尚不存在。實際上
  `auth/calendar-pilot-session.ts` 約 L200-201 與
  `internal-test-booking.authenticator.ts` 約 L73-74 都已檢查 `user.disabled`。控制
  存在於上一層，但 policy 模組被單獨重用時會 fail-open。
- **檔案：** `apps/api/src/auth/authentication-context.ts`、
  `internal-test-booking.authenticator.ts`、`auth/calendar-pilot-session.ts`
  （`authenticate()` 回傳值）、`platform/authorization/rbac-appointment-policy.ts`，
  以及它們的測試。
- **不變量：** 認證器既有的停用檢查保留（兩道防線並存）；`accountActive` 缺席或不為
  `true` 時 policy 必須拒絕。
- **步驟：**
  1. `AuthenticationContext` 新增必要欄位 `readonly accountActive: boolean`，
     讓型別強制每個產生者填寫。
  2. 兩個認證器在停用檢查通過後設 `accountActive: true`。
  3. policy 改讀 `context.accountActive`；不為 `true` 一律拋
     `AuthorizationDeniedError`。
  4. 刪除過期註解，改寫為現況。
  5. 測試：`accountActive: false` 的 context 對每個 `assertCan*` 皆被拒；認證器測試
     斷言回傳 `accountActive: true`。
- **驗收：** `rbac-appointment-policy.ts` 中不再出現字面值 `accountActive: true`；
  新增測試通過。
- **停止條件：** 若 `AuthenticationContext` 被 `apps/worker` 或 `packages/*` 共用，
  型別變更會擴散到其他 package，停下並把本 WP 改為 Planned。

#### WP-A4　排程總表讀取改用獨立權限（F-13，P3，行為等價）

- **等級：** Direct。不改變任何角色的實際存取結果。
- **授權：** 只做語意去耦，不需新決策。**讓 physician 可讀總表屬政策變更，本 WP 不做**
  （D-006 未列出的動作一律拒絕；`physician` 權限清單刻意為空）。
- **問題：** `createScheduleAuthorizationPolicy().assertCanReadGrid`
  （`rbac-appointment-policy.ts` 約 L163-173）以 `create_appointment` 判定讀取。
- **檔案：** `apps/api/src/platform/authorization/rbac.ts`（Permission 型別與角色權限表）、
  `rbac-appointment-policy.ts`、相關測試；若 `unrouted-inventory.json` 的
  `capabilityGates` 需要列舉新權限，一併更新（`check:architecture` 會檢查權限覆蓋）。
- **步驟：**
  1. 新增 permission `read_schedule_grid`，**只**授予目前持有 `create_appointment` 的
     角色。
  2. `assertCanReadGrid` 改用 `read_schedule_grid`。
  3. 測試：逐一角色斷言讀總表的結果與變更前完全相同，包含 physician 仍被拒。
- **驗收：** 角色 × 權限等價測試通過；`check:architecture` 通過。
- **停止條件：** 若權限表有「單一來源」規則要求放在 `packages/domain`，依規則放置，
  不要在 `apps/api` 另建第二份。

#### WP-A5　過期計畫文件加取代標頭（F-11，P3）

- **等級：** Direct（docs）。
- **問題：** `docs/product/current-execution-and-approval-plan.md` 約 L3 仍寫
  「剩餘工作全部 Luna（`GROK_RESTS`）」，沒有指向 2026-09-13
  `GROK_UNRESTED`／`GROK_PROJECT_CLOSER`（register 約 L45-51），也寫著不掛
  `/v1/bookings`，而 IP-001 已以 fail-closed 方式掛載。
- **步驟：** 在檔首狀態列下加一段日期化的取代說明，格式比照
  `docs/product/luna-local-project-completion-master-plan.md` 檔首；**不改寫**文件
  歷史內文。
- **驗收：** `check:docs`、`check:format` 通過。

#### WP-A6　smoke 評估器新增「API 已部署」嚴格模式（F-01 前置）

- **等級：** Direct。
- **問題：** `evaluateUnauthenticatedApiSurface()` 一律把 404 當成通過。API 部署到
  C1 之後，404 代表路由壞了，應判 FAIL。
- **檔案：** `scripts/internal-test-booking-smoke.mjs` 與其 `.test.mjs`；若 completeness
  inspect 要辨識模式，另改 `scripts/internal-preproduction-complete.mjs` 與其測試。
- **不變量：** **預設行為不變**（靜態 C1 仍接受 404）；未認證的 2xx create、mutate、
  lookup 永遠 FAIL。
- **步驟：**
  1. 新增參數 `expectApi`（CLI 旗標，例如 `--expect-api`），預設 `false`。
  2. `expectApi` 為 `true` 時，`/v1/*` 探針只接受 503（gate 關）或 401（gate 開、
     未認證）；404 與其他狀態判 FAIL，理由寫明「API expected but route missing」。
  3. 若 snapshot 宣告 API 已部署，completeness inspect 要求 smoke 以 `expectApi`
     模式產生。
  4. 測試：兩種模式 × {200、401、404、503} 的真值表。
- **驗收：** 真值表測試通過；預設模式的既有測試不變。

### P 組：需先提交計畫並取得核可

#### WP-P1　授權拒絕事件持久化稽核（F-04，P1）

- **等級：** Planned（寫入路徑與稽核行為）。
- **授權：** D-006 approved——「repeated failures lock delegation verification and
  produce audit」、「audit is permanent, append-only and cannot be deleted by any
  role」。D-002 pending：不得實作刪除或 TTL。
- **問題：** `platform/authorization/denied-authorization-audit-sink.ts` 只有
  `InMemoryDeniedAuthorizationAuditSink`，且列在 unrouted inventory。已路由的
  `AuthorizationDeniedError`、`AuthenticationRequiredError` 不留下任何持久紀錄。
- **預計檔案：**
  - 新增 Firestore 實作（例如 `apps/api/src/firestore/denied-authorization-audit.repository.ts`），
    只做 `create`。
  - `denied-authorization-audit-sink.ts`：抽出 port 介面，保留 in-memory 版本供測試。
  - `platform/errors/api-exception.filter.ts`：攔截兩種錯誤後寫入 sink。
  - `internal-test-booking.module.ts`：提供 Firestore sink。
  - `apps/api/unrouted-inventory.json`：移除已接線的檔案。
  - `packages/contracts`：若稽核事件 schema 在此，新增 denial 事件版本。
  - emulator 測試（Nest HTTP）。
- **不變量：**
  - 事件只含：不透明 actor id（未認證為 `anonymous`）、route template（例如
    `POST /v1/bookings/:appointmentId/cancel`，**不是**實際 URL）、reason code、
    UTC 時間、correlation id。**不得**含 token、cookie、email、request body 或任何
    資源 id。
  - `firestore.rules` 維持全面拒絕；寫入只經 Admin SDK。
  - sink 寫入失敗**不得**改變原本的 401/403 回應。
  - 拒絕發生在交易之前，不在 booking 交易內寫入。
- **步驟：**
  1. 定義 `DeniedAuthorizationAuditPort.record(event)`。
  2. Firestore 實作寫入 `audit_events` 或獨立 collection；二選一並在計畫中寫明理由。
     doc id 不可預測，使用 `create` 語意。
  3. exception filter 攔截後寫入，外包 try/catch；寫入失敗只累加內部錯誤計數，回應碼
     不變。
  4. 不做重複事件合併。未認證流量放大寫入成本的風險由 WP-C2 處理，在 PR 標示此相依。
  5. emulator HTTP 測試：跨病患 `GET /v1/bookings/:id` → 403，且恰好一筆 denial 文件、
     欄位白名單斷言；無 token → 401 且一筆 `anonymous` 事件；sink 故意拋錯 → 仍回 403。
- **驗收：** 上述測試通過；更新清單後 `check:architecture` 通過；`check:secrets`
  通過。
- **停止條件：** contracts 的 audit schema 需要破壞性變更；需要保存期限數字（D-002）。

#### WP-P2　伺服器端預約列表（F-07，P2）

- **等級：** Planned（跨 `packages/contracts`、`packages/domain`、`apps/api`、
  `apps/web`）。
- **授權：** IP-001 授權 internal-test `/v1/bookings` 路由群。**開工前停止條件：**
  [IP-001 紀錄](../reviews/2026-09-13-internal-preproduction-owner-direction.md)沒有
  逐條列出「列表」。先在計畫中請業主確認列表屬於 IP-001 範圍；未確認不得施工。
- **問題：** `apps/web/public/modules/internal-test-booking-transport.js` 約 L328-356：
  `GET /state` 走本地 transport，只有 `slots` 被 `/v1/slots`、`/v1/schedule` 覆蓋。
  寫入走 `/v1` 但不回寫本地，所以 API 建立的預約不會出現在清單。
  `AppointmentRepositoryPort`（`appointment.repository-port.ts` 約 L52-60）沒有任何
  list 方法。
- **預計檔案：** `packages/contracts`（`ListAppointments` request/response 與欄位投影）；
  `appointment.repository-port.ts`（`listForPatient`、`listForClinic`）；
  `firestore/booking.repository.ts`；`firestore.indexes.json`（`appointments` 依擁有者與
  `startsAt` 的複合索引）；`appointment.application-service.ts`；
  `appointment.controller.ts`；`rbac-appointment-policy.ts`（`assertCanList`）；
  `internal-test-booking-transport.js`；對應的 emulator、單元與
  `tests/e2e/internal-test-booking.spec.ts` 測試。
- **不變量：**
  - 新路由不得與 `GET /v1/bookings/:appointmentId` 衝突。建議
    `GET /v1/bookings?scope=mine` 與 `?scope=clinic`，並測試 `:appointmentId` 仍正確。
  - 先 gate 後認證；病患只拿到自己的預約；欄位採 fail-closed 投影。
  - 未帶 `?internalTestBooking=1` 的頁面仍是 synthetic，不呼叫列表。
  - 不把 API 結果寫回 localStorage 當真實來源。
  - `apps/web/performance-budget.json` 的預算不得超標。
- **步驟：**
  1. contracts：定義 request/response 與欄位投影。
  2. port 與 Firestore 查詢；新增索引。
  3. application service 與 policy（patient 為 own、staff 為 clinic scope）。
  4. controller 路由。
  5. web transport：旗標下 `appointments` 改由伺服器提供，本地清單不再作為來源。
  6. 測試（見驗收）。
- **驗收：**
  - emulator：病患 A 的列表不含病患 B 的預約；staff 列表兩者皆含；無 token 回 401；
    gate 關閉回 503。
  - e2e（可用 route interception）：旗標下重新整理後清單來自 `/v1/bookings?scope=mine`，
    localStorage 沒有 appointments 時仍能顯示。
  - 部署後（依 WP-C1，Owner-run 驗收）：在 C1 建立 → 重新整理 → 清單顯示。

#### WP-P3　API 結構化、不含 PII 的日誌（F-09 前置）

- **等級：** Planned（屬於「logs a person's data」邊界，`CLAUDE.md` 要求先讀
  AGENTS.md）。
- **授權：** Safety Floor 1（不得記錄真實資料）；D-002 pending（不得設定保存期限數字）。
- **問題：** `apps/api/src/main.ts` 約 L56-59 以 `new FastifyAdapter({ logger: false })`
  與 `{ logger: false }` 建立應用，API 沒有應用日誌，無法建立以日誌為基礎的預約失敗或
  認證失敗告警。Cloud Run 平台的 request log（狀態碼、延遲）不受影響。
- **步驟：**
  1. 定義日誌事件白名單：`event`（穩定代碼，例如 `booking.create.rejected`）、`reason`
     （domain error code）、`route`（template）、`status`、`correlationId`、
     `durationMs`、`severity`。**禁止**：body、query string、header、cookie、token、
     email、任何資源 id。
  2. 以單行 JSON 輸出到 stdout（Cloud Logging 會解析 `severity` 與 `message`）。
  3. exception filter 與 application service 的失敗路徑各記一筆。
  4. 測試：以假 logger 擷取輸出並斷言白名單；以含 email 與 token 的請求驗證輸出不含
     這些字串。
- **驗收：** 白名單測試與洩漏測試通過。
- **停止條件：** 需要保存期限，或需要輸出到第三方服務（D-002、D-010）。

### B 組：需業主或人類決策

共同規則：用 [human blocker template](../templates/human-blocker-template.md) 逐字
格式起草。決策答案寫進 decision register 之後，C 組對應工作包才能開工。起草者不得在
答覆前修改對應程式、gate 或雲端資源。

#### WP-B1　C1 是否部署 API（F-01）

- **請業主決定：**
  - **選項 A：** 授權在 `beauessence-clinic-stg-c1a01` 啟用 Cloud Run 並部署 API。
    需要新的授權紀錄，列明 exact commit、project、service、region、到期時間、可啟用的
    API 清單與回滾方式。
  - **選項 B：** 不部署。把 stage 主張正式改寫為「靜態前端 preview＋後端由 CI 證明」，
    並在 register 記錄 `INTERNAL_PREPRODUCTION_COMPLETE` 的新定義。
- **封包必須附上：** Safety Floor 8 原文（preview 授權不可啟用後端）；
  `check:pages` 目前禁止隔離設定宣告 Run rewrite 的事實；選項 A 需要員工登入端點
  `GET /v1/calendar-session/client-config`（`calendar-pilot-session.controller.ts`
  約 L37）回傳 C1 自己的 Firebase 設定——
  [stage-2-gate-status.json](../architecture/stage-2-gate-status.json) 記錄 C2
  `completed`（synthetic），但執行期設定是否可用需查證。

#### WP-B2　限流參數與架構（F-03）

- **事實：** `apps/api/unrouted-inventory.json` 對 `rate-limiter.ts` 的註記為：
  D-006、D-010 已核准必須限流，但「目前只有 per-process fixed-window 測試實作，沒有
  共享狀態或核准參數」。
- **請決定：**
  1. 每個 key（actor 或 IP）的視窗長度與允許次數，分三類：未認證請求、已認證寫入、
     session 建立。
  2. 超限回應：建議 429＋`Retry-After`。
  3. 架構：
     - **A：** Cloud Run `max-instances=1`＋既有 per-process limiter。只適用內部
       預生產；簡單，但是單點。
     - **B：** Firestore 共享計數。跨實例一致；每個請求多一次交易成本。
     - **C：** 前置 Load Balancer＋Cloud Armor rate-based rules。最強，但需要 LB，
       與目前 Hosting→Run rewrite 架構不同，成本與改動最大。
  4. 是否信任 Hosting 轉發的 `X-Forwarded-For`（Fastify `trustProxy`）。

#### WP-B3　病患身分驗證方式（F-08）

- **事實：**
  - 員工端有真實互動登入：`apps/web/src/calendar-pilot-entry.js` 由
    `scripts/build-web.mjs` 約 L732-745 打包為 `calendar-pilot-client.js`；執行期向
    `GET /v1/calendar-session/client-config` 取 Firebase 設定（約 L865-878），走 Google
    redirect＋TOTP，並把 CSRF 寫入 `sessionStorage.calPilotCsrf`（約 L232）。
  - 病患端 `sessionStorage.internalTestIdToken`（`internal-test-booking-transport.js`
    約 L284-288）沒有任何程式寫入，只能人工注入。
- **請決定：** 內部預生產是否需要病患互動登入。若需要，決定方式，以及是否維持伺服器
  現行 `email_verified === true` 要求。若不需要，在 IP-001 相關紀錄寫明「病患 token 由
  operator 提供」為 stage 限制。
- **注意：** 病患身分涉及 D-001～D-003 的個資面向；本決策不取代法務核准。

#### WP-B4　告警通知對象（F-09）

- **事實：** C1 現有告警只有 IAM SetIamPolicy（通知既有預算 Pub/Sub，無 email 收件者）
  與預算告警：`infra/terraform/c1-foundation/main.tf` 約 L157、L213-258；
  `infra/terraform/cal-pilot/main.tf` 約 L185。
- **請決定：** 通知管道、收件人（**不得寫進 repo**，以變數或 secret 注入）、上班時間
  與非上班時間的嚴重度規則（可比照 `apps/worker/src/calendar-sync/calendar-pilot-health.ts`
  的 `weekday`／`immediate`）。

#### WP-B5　驗收涵蓋角色與人工審查（F-14）

- **事實：** `CalendarPilotStaffRole` 只有 `manager` 與 `front_desk`，allowlist 由
  `CALENDAR_PILOT_MANAGER_EMAILS`、`CALENDAR_PILOT_FRONT_DESK_EMAILS` 決定
  （`auth/calendar-pilot-session.ts` 約 L78-95）。`physician`、`consultant`、
  `system_admin`、`auditor`、`service_account` 在已掛載介面沒有認證路徑。
  2026-09-14 以 GitHub API 讀取 `main` 的 branch protection：
  `required_approving_review_count: 0`。
- **請決定：** (1) 內部預生產驗收涵蓋哪些角色；(2) 是否把 required reviews 提高到 1
  （屬 D-013 修訂）。

#### WP-B6　提供 2026-09-14 inspect 原始產物（F-06）

- **事實：** PR #124 的紀錄列出 12 個產物的 SHA-256，並標為「session evidence, not in
  git」。
- **請 operator：** 以離線方式提供這 12 個原檔，不經 PR 評論或任何公開管道。
- **若原檔已不存在：** 在該 review 記錄「產物遺失，相關列降為 operator 具結」。

### C 組：決策之後

#### WP-C1　C1 API 部署鏈（F-01，依 WP-B1 選 A）

- **等級：** Planned＋Owner-run。
- **前置：** WP-B1 選 A 已寫入 register；WP-A2、WP-A6 已合併（部署前 gate 必須必填、
  smoke 必須能把 404 判為 FAIL）。
- **agent 施工（程式與設定，不 apply）：**
  1. **Terraform：** 新增 C1 API stack，或擴充既有 C1 stack，計畫中擇一並說明理由。
     比照 `infra/terraform/c5-firestore/`：`exact_apply_authority_sha` 預設
     `not_granted`，所有資源 `count = 0`；`project_id` 驗證拒絕
     `beauessence-clinic-staging`；region 鎖 `asia-east1`。資源包含：Cloud Run 與
     Artifact Registry API、最小權限 runtime service account（每個 role 逐條寫理由）、
     Cloud Run service。`INTERNAL_TEST_BOOKING_ENABLED`、
     `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC`、`GOOGLE_CLOUD_PROJECT`、
     `CALENDAR_PILOT_*_EMAILS` 以 tfvars 或 secret 注入，不進 repo。若 WP-B2 選 A，
     設 `max_instance_count = 1`。
  2. **Hosting：** 新增獨立設定（例如 `firebase.isolated-api-preview.json`），把
     `/v1/**` rewrite 指向 C1 的 Run service。**不修改**現有
     `firebase.isolated-preview.json`，保留它作為靜態回滾目標。
  3. **`scripts/check-public-pages.mjs`：** 為新設定加比對規則——靜態部分仍需與
     `firebase.json` 一致，Run rewrite 只允許指向 C1 service。現有「隔離設定不得有
     Run rewrite」規則只套用在原靜態設定。附測試。
  4. 更新 `plan:internal-test-apply`、`plan:internal-test-preview`（`execute: false`），
     使其能產生新設定的計畫。
  5. 撰寫 Owner-run 指令包（exact SHA、逐行指令、預期輸出、回滾指令），放在 PR 說明，
     不寫進任何會被 agent 自動執行的腳本。
- **Owner-run：** 業主以 exact SHA 執行 Terraform plan、apply 與 Hosting 部署。
- **驗收（Owner-run 之後，只讀檢查）：**
  - 以 `--expect-api` 模式對 C1 preview 跑 smoke：gate 關閉時 `/v1/*` 全為 503；
    開啟時為 401。
  - 以合成測試帳號完成一次端到端：建立 → `GET /v1/bookings/:id` 讀回 → 取消。
  - 以新 snapshot 重跑 `inspect:internal-preproduction`。
- **回滾：** Hosting 改回部署靜態的 `firebase.isolated-preview.json`；Terraform 以
  `exact_apply_authority_sha=not_granted` 重新 plan 移除資源（業主執行）。
- **停止條件：** C1 的 Firebase Auth 未設定，導致 client-config 無法回傳 C1 設定；需要
  啟用授權清單以外的 API；任何步驟需要 staging 資源。

#### WP-C2　限流實作（F-03，依 WP-B2）

- **等級：** Planned。
- **步驟：** 依決策的架構實作 Nest guard，套在 `InternalTestBookingModule` 的所有路由與
  `CalendarPilotSessionController` 的 session 建立；超限回 429＋`Retry-After`；把
  `rate-limiter.ts`（選 B 時連同 Firestore 實作）自 unrouted inventory 移除；若決策信任
  `X-Forwarded-For`，測試偽造標頭時的行為符合決策。
- **驗收：** emulator HTTP 測試——視窗內第 N+1 次回 429；不同 actor 互不影響；視窗過後
  恢復（注入 clock，不用牆上時鐘）。部署後（依 WP-C1）以 smoke 驗證一次 429。

#### WP-C3　病患登入（F-08，依 WP-B3）

- **等級：** Planned。
- **若決策為實作：** 比照員工端，由 API 在執行期提供 client config，不把設定寫進
  bundle；ID token 優先保存在記憶體，若必須跨頁使用 sessionStorage，在 PR 寫明理由；
  未帶旗標時不載入 Auth SDK；`scripts/check-performance-budget.mjs` 不得超標。
- **若決策為不實作：** 只改文件，把限制寫進相關 review 與本計畫。
- **驗收：** 一位沒有 shell 權限的測試者完成一次預約（Owner-run 驗收，記錄步驟與結果）。

#### WP-C4　應用層告警（F-09，依 WP-B4、WP-P3、WP-C1）

- **等級：** Planned＋Owner-run apply。
- **步驟：** 在 C1 Terraform 以 exact SHA 把關新增：
  - Cloud Run 5xx 比率（平台 request 指標，不需應用日誌）；
  - 依 WP-P3 事件代碼的 log-based metric（`booking.*.rejected`、`auth.*`）；
  - outbox dead-letter 深度（依 worker 可提供的指標；若沒有，停下回報）；
  - Firestore backup schedule 失敗。
  收件人以變數注入，不進 repo。
- **驗收：** 刻意誘發一次超過門檻的失敗，業主確認收到通知並記錄時間。

#### WP-C5　證據歸檔（F-06，依 WP-B6）

- **等級：** Direct（evidence）。
- **步驟：**
  1. 取得 operator 提供的原檔。
  2. 在本機去識別化：移除 email、IAM member、token；專案 id 與資源 id 可保留。
  3. 放進 `docs/reviews/` 下的日期化產物目錄，目錄命名在 PR 中與
     [document lifecycle](../document-lifecycle.md) 規則對齊。
  4. 建立索引表，同時記錄「原檔 SHA-256（沿用 #124 紀錄值）」與「去識別化後 SHA-256」。
  5. 在對應 review 加上連結。
- **注意：** repository 為 public（2026-09-14 以 GitHub API 讀取
  `visibility: public`）。合併前逐檔人工檢查。
- **驗收：** `check:secrets`、`check:docs` 通過；第三人能以 repo 內的檔案重算去識別化
  後的 SHA-256。

#### WP-C6　各環境 auth 來源納入 header parity（F-10，依 WP-C1 或 WP-C3）

- **等級：** Direct。
- **事實：** `compareIsolatedPreviewHosting()`（`scripts/check-public-pages.mjs` 約
  L730-777）要求隔離設定的 `hosting.headers` 與 `firebase.json` **逐字相同**，所以
  staging 的 `frame-src https://beauessence-clinic-staging.firebaseapp.com` 被帶進
  隔離設定。C1 目前沒有互動登入，這個來源不會被使用。
- **步驟：** parity 比對改為「CSP 中 Firebase auth domain 以外逐字相同」；隔離設定改用
  C1 自己的 auth domain；同步更新 `apps/web/src/security-headers.test.ts`（約 L40 期待
  staging 來源）與 `check-public-pages` 的測試。
- **驗收：** 兩份設定各自只含自己專案的 auth domain；其餘 header 仍逐字一致；
  `check:pages` 通過。
- **不要**在 WP-C1、WP-C3 之前單獨刪除隔離設定中的 staging 來源——`check:pages` 會
  直接失敗。

## 5. 執行順序與並行

1. **第一批（可並行）：** WP-A1～A6；同時起草 WP-B1～B6。
2. **第二批（計畫核可後可並行）：** WP-P1、WP-P2、WP-P3。
3. **第三批（決策寫入 register 後）：** WP-C1 → WP-C2、WP-C4；WP-B3 決策後做
   WP-C3；WP-B6 後做 WP-C5；WP-C1 或 WP-C3 後做 WP-C6。

**同檔衝突：** WP-A2 與 WP-P1 都改 `internal-test-booking.module.ts`；WP-A3 與
WP-P1 都碰 `rbac-appointment-policy.ts` 一帶；WP-C1 與 WP-C6 都改
`check-public-pages.mjs`。同一時間只開其中一個，後開者 rebase。

## 6. 重新宣告 INTERNAL_PREPRODUCTION_COMPLETE 的最低條件

以下全部成立才可重新宣告；即使成立，也不等於 `PROJECT_COMPLETE` 或 production。

1. WP-A1、WP-A2 已合併。
2. WP-B1 已決策。選 A：WP-C1 驗收全部通過（503/401、一次端到端）。選 B：register
   已記錄新定義，下列第 3～6 條依新定義調整。
3. WP-P1 已合併，並在部署環境驗證一次拒絕事件落地。
4. WP-C2 已合併，並在部署環境驗證一次 429。
5. WP-P2 已合併，並在部署環境驗證「建立 → 重新整理 → 清單」。
6. WP-C3 完成（或決策明載不需要）；WP-C4 通知送達一次；WP-C5 完成（或產物遺失已記錄）。
7. 以 `--expect-api` 模式重跑 smoke 與 `inspect:internal-preproduction`，產物依
   WP-C5 規則入庫。

## 7. 完成回報格式（每個 PR 說明必填）

```text
WP-ID / Finding:
Branch / PR:
What changed (by file):
Evidence rung: CODE-ONLY | TEST-VERIFIED | GATE-VERIFIED | CI-VERIFIED | DEPLOYED-NOT-SMOKED | VERIFIED-PRODUCTION
Gates: <gate> PASS | FAIL | NOT_RUN | UNAVAILABLE (reason, numbers)
Acceptance criteria: <each item> met | not met (evidence link)
Invariants checked:
Deliberately not done:
Stop conditions hit:
```

## 8. 稽核方法、未覆蓋範圍與更正

- **方法：** 唯讀讀取原始碼、git 歷史、PR、既有 CI 結果、branch protection（GitHub
  API）、Terraform 與 Firebase 設定；對 C1 preview 發出兩個未認證 HTTP GET。
- **未執行（`NOT_RUN`，唯讀稽核）：** 所有 test、build、lint、typecheck、emulator、
  Playwright、Lighthouse、axe、Terraform plan。
- **未覆蓋：** `beauessence-clinic-staging` 上 CAL-PILOT API 的實際部署版本；雲端 IAM
  與監控的實際狀態（只讀 repository 與 PR #124 紀錄）；互動式登入；TW-05。
- **稽核過程中的更正（照實記錄）：**
  - 初版稱「web bundle 沒有登入流程」。錯誤：員工端登入存在於
    `apps/web/src/calendar-pilot-entry.js`。已改為現行 F-08（僅病患端沒有登入）。
  - 初版建議直接刪除隔離設定的 staging `frame-src`。錯誤：會違反 `check:pages` 的
    header parity。已改為 WP-C6。
  - 初版只列出 `appointment.controller.ts` 的 fail-open；`schedule.controller.ts` 有
    相同寫法，已併入 WP-A2。
  - 初版稱監控只有 IAM 訊號；另有預算告警，已更正。
  - 稽核初期曾在本機工作區誤執行 `git checkout origin/main -- .`，違反唯讀原則。已完整
    還原並確認工作樹乾淨，未影響任何遠端狀態。當時 agent 從 repository 的上一層資料夾
    啟動，`.claude/hooks/guard-commands.mjs` 因此沒有生效——正常情況下它會擋下這條指令。
