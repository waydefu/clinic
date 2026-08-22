# 第一階段 Booking MVP 施工日誌與決策清冊 (Execution Log)

**建立日期：** 2026-08-19 (Asia/Taipei)  
**基準 Commit SHA：** `ea3316e027ab675dde564419412f979aa0e57f68`  
**初始狀態：** `main` 分支，工作區乾淨，無未追蹤或未提交變更。

---

## 施工準則與六大修正記錄 (Orientation Directives)

依據 2026-08-19 專案負責人指示，本輪施工確立並強制執行以下核心原則：

1. **Calendar 現況定性**：Outbound Google Calendar「本機架構與 Client 已完成，尚無真實 Calendar 連線、部署 Worker 與 Production 驗證」。
2. **Calendar inbound review 邊界 (BOOK-MVP-007)**：現階段僅允許 manual-review／system-authoritative 規格、治理與文件對齊；accepted ADR-0002 保持有效，D-009/D-016 未核准前，**嚴禁實作任何 inbound webhook、syncToken 輪詢、API route 或回寫邏輯**。任何 future Calendar co-authority 提案才須先用新 ADR 明確取代 ADR-0002。
3. **診所首頁 `/clinic` 絕對凍結**：`/clinic` 實際 HTML / CSS / JS / assets 全面 Freeze；允許新增或修改純 regression / freeze guard 測試，但**絕不得改變首頁 baseline 或任何外觀與邏輯**。
4. **統一 Step ID 與追蹤對照**：BOOK-MVP-001 ～ 009 統一編號，禁止編號漂移。每個 Step 獨立記錄 Before / During / After，獨立 Commit；PR 依邏輯單元整合。
5. **Booking Preview 網址宣告**：Booking Preview 尚無有效遠端 URL，廠商評估文件（Vendor Package）標示為 `PENDING DEPLOYMENT`，**嚴禁引用已過期或未經授權的舊 URL**。待取得本次明確部署授權並完成部署後，方得寫入實際 URL 與到期日。**2026-08-20 supersession：** exact candidate C 經獨立授權部署並通過 463/463 線上檢查後，此 gate 已履行；current URL／expiry 見 BOOK-MVP-005 package 與下方 Attempt 2。
6. **Preview 個資欄位定性**：Preview 表單「包含 PII 類型欄位，但只能使用 Synthetic Data，嚴禁輸入任何真實患者資料」。

---

## 第一階段 Scope 定義與凍結邊界

### A. 第一階段納入範圍 (In-Scope: Booking MVP)
1. 病患線上預約流程 (`/booking`)
2. 預約建立與交易防護
3. 預約改期
4. 預約取消（含病患取消與櫃台委派取消）
5. 基本預約查詢
6. 基本預約工作台 (`/`)
7. 營業時間設定
8. 特定日期營業時間例外
9. 休診／臨時關閉
10. 可預約時段管理
11. 單一時段容量 (Capacity = 1) 與預約規則所需設定
12. Google Calendar 雙向同步規格對齊（Outbound 規格＋Inbound 待審佇列規格）
13. 官網站內整合準備（API-only 與 Widget+API 雙軌評估）
14. Booking Preview 展示（Synthetic Data only，供網站公司技術評估）

### B. 凍結範圍 (Frozen Capabilities: Freeze ≠ Delete)
以下模組保留代碼但全面凍結，不接正式 API、不接正式 DB、不接雲端服務：
- 個案管理 (Case Management)
- 薪資計算與結算 (Payroll & Commission，D-008/D-015 暫緩)
- 手術與臨床時間軸 (Surgery & Clinical Records，Expansion S，D-014 待專業審查)
- 金流、付款與退款 (Payments & Refunds，D-015 暫緩)
- 庫存管理 (Inventory，獨立外部專案)
- LINE / Meta / 社群 Webhooks / CRM
- 多院區管理 (Multi-branch)
- 行動 App / PWA Push
- 進階營運報表
- **診所首頁 `/clinic` 全站頁面**

---

## 統一施工步驟對照表 (Step ID Matrix)

| Step ID | 步驟名稱 | 範圍與交付標的 | 狀態 |
| :--- | :--- | :--- | :--- |
| **BOOK-MVP-001** | Scope Lock & Ledger Initialization | 建立施工日誌、鎖定第一階段範疇、同步 `docs/README.md` | **PASS** |
| **BOOK-MVP-002** | Clinic Homepage Freeze Guard | 建立 `/clinic` 靜態檔案清單防護測試與零回歸驗證 | **PASS** |
| **BOOK-MVP-003** | Frozen Modules Isolation | 對個管、薪資、手術擴充設置 disabled-by-default 與邊界防護 | **PASS** |
| **BOOK-MVP-004** | Booking Preview Independent Validation | 驗證 `/booking` 流程、Synthetic PII 邊界與無障礙／響應式基準 | **PASS** |
| **BOOK-MVP-005** | Web Vendor Evaluation Package | 撰寫 `docs/integration/booking-web-vendor-evaluation.md` 評估包 | **PASS** |
| **BOOK-MVP-006** | Frontend Assets Payload Report | 量測 JS/CSS/Assets 原始、gzip、brotli 大小並記錄報告 | **PASS** |
| **BOOK-MVP-007** | Calendar Alignment (Spec & Governance) | 規格層對齊 Outbound 狀態與 Inbound 待審衝突流程（無 code 回寫） | **PASS** |
| **BOOK-MVP-008** | Documentation & Authority Sync | 同步更新 `AGENTS.md`、`README.md`、`roadmap.md` 等權威文件 | **PASS** |
| **BOOK-MVP-009** | Full Verification & Evidence Gate | 執行全套靜態檢查、單元測試、Emulator Rules 與 E2E 驗證 | **PASS — CANDIDATE C FROZEN** |

---

## 施工記錄明細 (Execution Records)

### BOOK-MVP-001: Scope Lock & Execution Ledger Initialization

#### Before
- **Timestamp:** 2026-08-19 20:00 (Asia/Taipei)
- **Branch:** `main`
- **HEAD SHA:** `ea3316e027ab675dde564419412f979aa0e57f68`
- **目的:** 鎖定第一階段 Booking MVP 施工範疇，初始化施工日誌，並建立對照矩陣。
- **Scope:** 建立 `docs/implementation/phase-1-booking-mvp-execution-log.md` 並註冊至 `docs/README.md`。
- **Explicit Non-Scope:** 不修改 `/clinic` 任何檔案，不修改任何業務邏輯代碼，不碰 Production。
- **預計修改檔案:**
  - `docs/implementation/phase-1-booking-mvp-execution-log.md` (新增)
  - `docs/README.md` (更新索引)
- **風險:** 低（純文件與治理記錄）。
- **Dependency:** 無。
- **Blocking Decision:** 無。
- **Acceptance Criteria:**
  1. `docs/implementation/phase-1-booking-mvp-execution-log.md` 完整存在，記載 6 項修正指示與 Step ID 矩陣。
  2. `docs/README.md` 正確索引該文件。
  3. `pnpm check:docs` 通過。
- **Test Plan:** 執行 `corepack pnpm run check:docs` 與 `corepack pnpm run check:structure`。
- **Rollback Plan:** `git revert <commit-sha>` 或刪除新建文件並還原 `docs/README.md`。

#### During
- 實際執行：建立 `docs/implementation/` 目錄，撰寫 `phase-1-booking-mvp-execution-log.md`。
- 將本文件註冊至 `docs/README.md`。
- 檢查文件連結與結構檢查腳本相容性。

#### After
- **實際修改檔案:**
  - `docs/implementation/phase-1-booking-mvp-execution-log.md`
  - `docs/README.md`
  - `scripts/check-structure.mjs`
- **Commit 歷史與 SHA:**
  1. `8c19cedf4a82773cb362510530470eeed5c80d47` (`docs(governance): BOOK-MVP-001 initialize execution log and lock Phase 1 scope`)
  2. `831eee0b88d8b67aeecba0567f814981e4c76aa4` (`docs(governance): record BOOK-MVP-001 completion status in execution log`)
- **測試指令:** `corepack pnpm run check:docs; corepack pnpm run check:structure; corepack pnpm run test:unit`
- **測試結果:** PASS (check:docs 133 檔全過, check:structure 214 檔全過, test:unit 61 檔 1025 測試全過)
- **CI Status:** `NOT RUN / NOT AVAILABLE` (本機驗證通過；本步驟產物尚未推送到 remote/PR，待 GitHub Actions 執行後記錄正式 CI Evidence)
- **Rollback 指令與順序:** `git revert 831eee0b88d8b67aeecba0567f814981e4c76aa4 8c19cedf4a82773cb362510530470eeed5c80d47`
- **Security Check:** 零機密資料、零真實個資、零 Production 憑證。
- **最終狀態:** **PASS**

---

### BOOK-MVP-002: Clinic Homepage Freeze Guard & Baseline Lock

#### Before
- **Timestamp:** 2026-08-19 20:15 (Asia/Taipei)
- **Branch:** `main`
- **HEAD SHA:** `831eee0b88d8b67aeecba0567f814981e4c76aa4`
- **目的:** 為診所首頁 `/clinic` 建立不可繞過之自動化凍結守衛（Freeze Guard），以 SHA-256 Hash Manifest 鎖定所有 30 個首頁相關靜態與原始檔案，防止後續施工意外更動。
- **Scope:**
  - 新增 `scripts/check-clinic-freeze.mjs` 阻斷式檢查腳本。
  - 新增 `scripts/check-clinic-freeze.test.mjs` 單元測試。
  - 將檢查腳本與測試註冊至 `scripts/check-structure.mjs` required paths。
  - 在 `package.json` 新增 `check:clinic-freeze` 指令並整合進 `verify`。
- **Explicit Non-Scope:** 嚴禁修改任何 `apps/web/public/clinic*`、`apps/web/public/clinic-assets/*`、`apps/web/clinic-source/*` 之實際 HTML/CSS/JS/assets 內容。
- **預計修改檔案:**
  - `scripts/check-clinic-freeze.mjs` (新增)
  - `scripts/check-clinic-freeze.test.mjs` (新增)
  - `scripts/check-structure.mjs` (更新 requiredPaths)
  - `package.json` (更新 scripts)
  - `docs/implementation/phase-1-booking-mvp-execution-log.md` (更新)
- **受保護檔案清單與 SHA-256 Baseline (30 檔):**
  1. `apps/web/public/clinic.html` (`3b5c0de6caab960f2bdbc883fcfe5a38452bf08c5572be1202fbd647274583e8`)
  2. `apps/web/public/clinic-site.js` (`9056dbd4e28a3369541b95661a4805b91b3f9114d1e5b3018ab75ceb5427ce9d`)
  3. `apps/web/public/clinic-site.css` (`31e4ad6c472c09369ad0f71dede8789da3c92de1fb6b171adcd3c5bc2c08d757`)
  4. `apps/web/public/clinic-content.js` (`91e0265f4e715e8f7c99fd7c68d408e71731e9d10beb1a95104396f766940397`)
  5. `apps/web/public/clinic-booking.css` (`58c13447098fccadcfc271c48fee5ef3c832ba8e43c3c0f675d4fba7838cb3cd`)
  6. `apps/web/clinic-assets.manifest.json` (`a60b2e038d112cab269bd541a274be027e3b930be365408d01ae2e8a9e1951ec`)
  7. `apps/web/public/clinic-assets/care-aftercare.webp` (`357a5456cd34d5358330982ced3e21d7184d4dff27e22996f61761c9d859ab2b`)
  8. `apps/web/public/clinic-assets/care-environment.webp` (`e012952d35fe9e6baa277ffa283f22619588130e2f8f5b69f3a81de4f58c2321`)
  9. `apps/web/public/clinic-assets/care-listening.webp` (`6944e0bb33174e3f1b49450e10689f645e4f87fefdfd019592a6d1ae4b4d00ce`)
  10. `apps/web/public/clinic-assets/care-treatment.webp` (`cad10418106dc43b6f8496fba3bed1ea5d3dd0f46523b363ed3536435f0d940a`)
  11. `apps/web/public/clinic-assets/clinic-logo.webp` (`d75608cda33fad2a83d5a67f5dddc78dcd71bbc880aefe8240b59a13a3ed27fe`)
  12. `apps/web/public/clinic-assets/doctor-yan.webp` (`2ad8d264794a5f7343da35e13576e3173926f95420b9700a8bbbc1c08f0208f5`)
  13. `apps/web/public/clinic-assets/doctor-yang.webp` (`08d82dea869b851a0ba4e8238c140d47b84dcc783fd3a60e3ebd1639a1adcb45`)
  14. `apps/web/public/clinic-assets/service-mouthguard.webp` (`0336e510cebfa63f5eea67b4f88d6870e99e1899f541617613e2d1dc4c7a2a28`)
  15. `apps/web/public/clinic-assets/service-septoplasty.webp` (`437dcbb24b080669c9c2c409f8da5dcaa727597f02f3d10c9c53e66155b006cb`)
  16. `apps/web/public/clinic-assets/service-snoring.webp` (`13e09041abcb7f22754e1dfecb043d2af4517f3193f3d075e1167959e6f45f02`)
  17. `apps/web/public/clinic-assets/service-turbinate.webp` (`2facd26d81cd1b28c8c28bc59b07a6d7a807f4719634b3d1f9c5662457ef5970`)
  18. `apps/web/public/clinic-assets/soft-green-bg.webp` (`0f2af54beadbf8c0bbe264bf7e53a7fd819ca7fa7ae0f6275107fed9e60977a6`)
  19. `apps/web/clinic-source/care-aftercare.png` (`c49db2a5060fade84bba3171804f85b305e016d047f4f09645647cc3d9cd1dbe`)
  20. `apps/web/clinic-source/care-environment.png` (`f92b4e04c04342b5bedeab81c9326d29d316526ac6a1c9471e25944c8ddcb726`)
  21. `apps/web/clinic-source/care-listening.png` (`32c0c90da144d5a8897e0b7828683962ef589e053988cc5ecc2945621e8bbde8`)
  22. `apps/web/clinic-source/care-treatment.png` (`8de62c08cfe6d6322e732ebf6f876eaf842ae6fa84eb785ae18915c0debe1e9a`)
  23. `apps/web/clinic-source/clinic-logo.png` (`cda356f8f1ba409afac959aeab0ebbefc0719534f207d6a558e84f6b435aa288`)
  24. `apps/web/clinic-source/doctor-yan.png` (`2c0ec54261cc17cc7b02b1eff5614eb326dfb67e0b33b7ae01ee12ea06fbd47c`)
  25. `apps/web/clinic-source/doctor-yang.png` (`f1316bdc9adb80e9353f9cf673fef18075092af6c036db2d5e6881e05920f2b4`)
  26. `apps/web/clinic-source/service-mouthguard.webp` (`1625d9e0e3d63bfe59d2d4e9defd016528b7fec51d12bb07533c416f89b48377`)
  27. `apps/web/clinic-source/service-septoplasty.jpg` (`5d004fc929ffc3f931e35b0a93f0cca166345f6860fc565ce4c70e3612f4b09a`)
  28. `apps/web/clinic-source/service-snoring-symptoms.jpg` (`9b29b1b85cdb0d1603298437c8c81a17612aa33556fa96b481fd28bf17d458ec`)
  29. `apps/web/clinic-source/service-turbinate.jpg` (`0166ed81572ca16aecf3fdbcbbc040b12c5bf8db8c2ad75e317ebd5c4246d457`)
  30. `apps/web/clinic-source/soft-green-bg.png` (`86df0dd8b065da587c8ce06bfa5cb9c64bb5f329987f526b6aadc3dc1244ee50`)
- **風險:** 低（純新增防護腳本與測試，無首頁代碼變更）。
- **Acceptance Criteria:**
  1. `check:clinic-freeze` 實體執行通過（30 檔 Hash 全部吻合）。
  2. 單元測試驗證 Hash 變更或檔案遺失時能精確阻斷。
  3. `verify` 執行通過。
  4. 首頁 30 個檔案零變更（CLINIC HOMEPAGE CHANGED = NO）。
- **Test Plan:** 執行 `corepack pnpm run check:clinic-freeze`、`corepack pnpm run check:structure` 與 `corepack pnpm run test:unit`。
- **Rollback Plan:** `git revert <commit-sha>` 還原新增的 guard 腳本與 package.json 配置。

#### During
- 提取首頁 30 個檔案之 SHA-256 基準雜湊。
- 撰寫 `scripts/check-clinic-freeze.mjs` 與 `scripts/check-clinic-freeze.test.mjs`。
- 將腳本加入 `scripts/check-structure.mjs` 與 `package.json` 的 `verify` 鏈中。

#### After
- **實際修改檔案:**
  - `scripts/check-clinic-freeze.mjs` (新增)
  - `scripts/check-clinic-freeze.test.mjs` (新增)
  - `scripts/check-structure.mjs` (更新 requiredPaths)
  - `package.json` (更新 scripts)
  - `docs/implementation/phase-1-booking-mvp-execution-log.md` (更新)
- **Commit SHA:** `6043951a8cf9726075de011bd38dd4fcbfc3c49e` (`test(guard): BOOK-MVP-002 establish clinic homepage freeze guard`)
- **測試指令:** `corepack pnpm run check:clinic-freeze; corepack pnpm run check:structure; corepack pnpm run test:unit`
- **測試結果:** PASS (check:clinic-freeze 30 檔通過, check:structure 216 檔通過, test:unit 62 檔 1029 測試全過)
- **CI Status:** `NOT RUN / NOT AVAILABLE` (本機驗證通過；本步驟產物尚未推送到 remote/PR，待 GitHub Actions 執行後記錄正式 CI Evidence)
- **Rollback 指令:** `git revert 6043951a8cf9726075de011bd38dd4fcbfc3c49e`
- **CLINIC HOMEPAGE CHANGED:** **NO** (30 個首頁相關檔案無任何位元組修改)
- **最終狀態:** **PASS**

---

### BOOK-MVP-003-A: Frozen Capability Reachability & Dependency Inventory (Corrected)

#### Before
- **Timestamp:** 2026-08-19 (Asia/Taipei; exact start time not recorded)
- **Branch:** `agent/book-mvp-003-a-inventory`
- **HEAD SHA:** `1a253a8b56bc8d4f55bf228b0e96e4f73842edc3` (origin/main, PR #20 merged)
- **目的:** 全面盤點第一階段凍結能力的可達性、依賴關係與共用模組，修正先前報告錯誤假設，產出可施工的隔離策略。
- **Scope:** 僅限架構分析、搜尋、依賴圖建立、文件更新。**嚴禁修改 runtime 代碼**。
- **Explicit Non-Scope:** 不修改 `packages/domain`、`packages/contracts`、`apps/api`、`apps/worker`、`apps/web` runtime 代碼；不修改 Firestore rules、CI workflow、Production config。
- **修正目標 (Review 要求):**
  1. 重查 Canonical Role Model (`packages/domain/src/roles.ts`)
  2. 檢查 `store.js` mutation reachability
  3. 盤點 Overview 所有 `#case-section` entry points
  4. 移除 `permissions.js` 施工假設錯誤
  5. 補充 execution-log、tests、commit SHA
- **Acceptance Criteria:**
  1. 修正後的 Reachability Matrix 與 Dependency Matrix 經交叉驗證
  2. 所有矛盾點（Authority Conflict）已記錄並標註
  3. `check:clinic-freeze`、`check:structure`、`check:docs` 全綠
  4. Execution log 記錄完整 Before/During/After
- **Rollback Plan:** `git revert <commit-sha>` 還原文件更新

#### During
- **Canonical Role Model 驗證 (`packages/domain/src/roles.ts`):**
  - `OPERATIONAL_ROLES`: `['manager', 'front_desk', 'consultant', 'physician', 'patient']` (5 角色)
  - `SYSTEM_ROLES`: `['system_admin', 'auditor', 'service_account']` (3 角色)
  - `ASSUME_CASE_MANAGER_IS_CONSULTANT = true` — **未決假設**，受 rbac-matrix.md §7 Q1 阻擋
  - `LEGACY_ROLE_ALIASES`: `admin` → `manager`；`case_manager` → `consultant` (條件式，依賴上述假設)
  - **關鍵發現**: 瀏覽器端仍使用 legacy `admin` 代碼，未遷移至 `manager`；`case_manager` 不在 `OPERATIONAL_ROLES` 中，僅透過 alias 映射

- **Store.js Mutation Reachability (`apps/web/public/store.js`):**
  - Import: `assignCaseManager`, `buildOperationalTasks`, `buildWorkload` from `case-management.js`
  - `stagingRequest` handler 含路徑:
    - `/follow-ups/...` → 呼叫 `assignCaseManager` (需 `PERMISSIONS.ASSIGN_CASE` / `REASSIGN_CASE`)
    - `/case-assignments` → 呼叫 `assignCaseManager` (需 `PERMISSIONS.ASSIGN_CASE` / `REASSIGN_CASE`)
  - **結論**: Frozen capabilities (CASE_MANAGEMENT) **可透過合成 API 觸發狀態變更**，權限檢查在 `permissions.js` 的 `requirePermission`

- **Overview #case-section Entry Points (`apps/web/public/index.html`):**
  1. Line 211: Nav link `<a href="#case-section" data-workspace-nav>個管指派</a>` — **無 `data-admin-only`，全角色可見**
  2. Line 292: Summary card "個管月度患者" → `<a class="summary-action" href="#case-section">查看個管</a>`
  3. Line 300: Summary card "已完成到診" → `<a class="summary-action" href="#case-section">查看個管</a>`
  4. Line 864: Section `<section id="case-section" ...>` — **無 `data-admin-only`**
  - **風險**: 櫃台角色 (`front_desk`) 可直接導航至個管區，D-007 仍 `pending`

- **Permissions.js 施工假設修正:**
  - **錯誤假設**: 先前報告稱 `permissions.js` 需修改或加旗標
  - **事實**: `permissions.js` 的 `rolePermissions` 已將 `PERMISSIONS.ASSIGN_CASE` 賦予 `front_desk` (line 23)
  - **結論**: 權限模型**已允許櫃台指派個管**，無需修改 `permissions.js`；隔離需在 **UI/路由層** 透過 capability flag + route guard 實現

- **Admin-view.js 渲染邏輯確認:**
  - `renderCaseAssignments`: 檢查 `permissions.includes(PERMISSIONS.ASSIGN_CASE)` / `REASSIGN_CASE` (lines 976-980) — 前台可編輯
  - `renderWorkload`: **無權限檢查**，直接渲染統計表
  - Caption 註記 "首次指派可由櫃台處理，改派限主管" 僅為文案，程式碼未強制

- **Unrouted Inventory 交叉驗證 (`apps/api/unrouted-inventory.json`):**
  - `case_assignment`: `remainingBlockers` 含 `D-007` (決策未核定) + `C0`～`C6` (Stage 2 slices)
  - `payroll_and_settlement`: `remainingBlockers` 含 `D-008`、`D-015` + `C0`～`C6`
  - 確認：API 層已完全阻斷，僅瀏覽器合成層可達

- **Final Review Correction (2026-08-19):**
  1. **`store.js` 是 003-B 施工對象，不得遺漏。** 兩個實際 mutation 路徑需 fail-closed guards：
     - `POST /case-assignments`（store.js:300-309，`requirePermission` ASSIGN_CASE / REASSIGN_CASE → `assignCaseManager`）
     - `POST /follow-ups/:id` 且 `body.managerId` 為非空字串時（store.js:287-299）——回診記錄**順帶**觸發 case-assignment side effect
  2. **`index.html` 是 003-B 施工對象。** 靜態 `#case-section` entry points 不得只留給 route guard redirect，需與動態入口一起隔離：
     - workspace nav「個管指派」（index.html:211）
     - overview summary card「查看個管」（index.html:292）
     - overview summary card「查看統計」（index.html:300）
     - admin-view.js 動態 task `pendingCaseAssignments`（admin-view.js:259-264，href `#case-section`）
  3. **角色敘述最終修正：**
     - canonical `roles.ts` **沒有** `case_manager` role——不在 `OPERATIONAL_ROLES`，也不在 `SYSTEM_ROLES`
     - `case_manager` 僅為 `LEGACY_ROLE_ALIASES` 條件式 alias → `consultant`（受 `ASSUME_CASE_MANAGER_IS_CONSULTANT = true` 控制）
     - **consultant candidate permissions 並非 `[]`**：API side 的 candidate 權限為 `assign_case_manager`/`decide_follow_up`/`read_audit`（apps/api/src/platform/authorization/rbac.ts:83）。**注意：這與 browser 端 `front_desk` 的 `PERMISSIONS.ASSIGN_CASE`（permissions.js:23）是兩套不同 permission model**——browser 用 `ASSIGN_CASE`/`REASSIGN_CASE` 字串化旗標，API 用能力字串；前者不代表後者，不得寫成「front_desk 含 consultant 權限列」。
     - 刪除「保留空權限 case_manager 或移除？」類型的 user decision——沒有這個角色可選
     - 003-B **不修改** `roles.ts`、browser `permissions.js`、API `rbac.ts`
  4. **Feature flag 決策已核定：** 使用獨立 `apps/web/public/modules/capability-flags.js`（不放 `constants.js`）。Flags default=false、fail-closed；禁止 query/localStorage/window/runtime override。
  5. **003-B tests 必須加入 mutation bypass negative tests**（見 After）。

#### After
- **修正後的 Reachability Matrix 關鍵更新:**

| Capability | UI Entry | Direct Route | Handler | Reachability | 修正說明 |
|------------|----------|--------------|---------|--------------|----------|
| CASE_MANAGEMENT | Nav + 2 Summary cards + Section | `/#case-section` (hash) | `store.js` → `assignCaseManager` | **REACHABLE** (含 mutation) | 前台權限已含 `ASSIGN_CASE`，非僅管理者 |
| PAYROLL (workload) | Same route | Same | `renderWorkload` (無權限檢查) | **REACHABLE** (read-only) | 統計表對所有角色可見 |
| PAYROLL (close/adjust) | None | None | RBAC permissions only | **PLAN_ONLY** | API unrouted，無 UI |
| SURGERY/CLINICAL | None | None | None | **PLAN_ONLY** | Expansion S，純決策層 |

- **修正後的 Shared Dependency 分類:**

| Module | Classification | 理由 |
|--------|---------------|------|
| `patient-identity.ts` | **FOUNDATION** | Booking/API foundation；可能與 future Case matching/merge 有關，但 current frozen Case domain 不直接依賴 |
| `schedule.ts` | **FOUNDATION** | Booking 時段 + Case 完成時間推算 |
| `roles.ts` | **FOUNDATION** | Canonical role source (ADR-0004) |
| `audit.ts` / `idempotency.ts` | **FOUNDATION** | 所有寫入路徑共用 |
| `case-assignment.ts` | **FROZEN_FEATURE** | Domain logic 保留，僅封入口 |
| `payroll.ts` | **FROZEN_FEATURE** | Domain logic 保留，僅封入口 |

- **High-Risk Shared Dependency 修正:**
  - `case_manager` role: **不存在於 `roles.ts`**，僅透過 `LEGACY_ROLE_ALIASES` 映射到 `consultant` (受假設控制)
  - `front_desk` 已有 `ASSIGN_CASE` 權限 — **非施工假設，而是現況**

- **Proposed 003-B Isolation Strategy 修正:**
  - **不修改 `permissions.js`** (已符合現況)
  - **不修改 `roles.ts`** (Canonical source，凍結)
  - **不修改 API `rbac.ts`**
  - 隔離點遷移至: `capability-flags.js` (獨立旗標檔，已核定) + `workspace-tabs.js` (route guard) + `admin-view.js` (render guard) + `store.js` (fail-closed mutation guards) + `index.html` (靜態 entry points 移除)
  - 新增架構測試: `check-architecture.mjs` 驗證 frozen capabilities 在 flag=false 時不可達

- **Files Expected to Change (003-B 修正版):**
  - `apps/web/public/modules/capability-flags.js` — **新增**，`CASE_MANAGEMENT_ENABLED = false`、`PAYROLL_WORKLOAD_ENABLED = false`（default false、fail-closed、無 override）
  - `apps/web/public/modules/workspace-tabs.js` — Route guard 檢查旗標，`#case-section` direct hash 導回 `#overview`
  - `apps/web/public/modules/admin-view.js` — `renderCaseAssignments`/`renderWorkload` 旗標檢查；動態 `pendingCaseAssignments` task 移除
  - `apps/web/public/store.js` — `POST /case-assignments` 與 `/follow-ups/:id`+`managerId` 的 fail-closed mutation guards（flag=false 時拒絕且 state 不變）
  - `apps/web/public/index.html` — 移除 workspace nav「個管指派」、overview「查看個管」「查看統計」三處靜態 entry points（與動態 task 一起隔離，不採 redirect 殘留）
  - `scripts/check-architecture.mjs` — 新增 frozen capability reachability guard
  - `tests/e2e/workbench-lifecycle.spec.ts` — 旗標關閉行為測試 + mutation bypass negative tests

- **003-B Required Mutation Bypass Negative Tests:**
  1. `POST /case-assignments` 在 flag=false 必須拒絕且 state 不變
  2. `POST /follow-ups/:id` 帶 `managerId` 不得繞過 freeze（不得產生 case-assignment）
  3. 正常 follow-up 不帶 `managerId` 仍正常
  4. Booking create/reschedule/cancel/complete 不受影響
  5. `#case-section` direct hash 導回 `#overview`
  6. 所有 static/dynamic frozen UI entries 不可 discoverable

- **Files That Must Not Change (新增):**
  - `apps/web/public/modules/permissions.js` — **不修改**，權限模型為現況
  - `packages/domain/src/roles.ts` — **不修改**，Canonical role source
  - `apps/api/src/platform/authorization/rbac.ts` — **不修改**

- **驗證結果:**
  - `check:clinic-freeze`: PASS (30 檔)
  - `check:structure`: PASS (216 檔)
  - `check:docs`: PASS (133 檔)
  - `test:unit`: PASS (62 檔, 1029 測試)
  - **CI Status:** `NOT RUN / NOT AVAILABLE` (本機驗證通過，未 push)

- **最終狀態:** **READY FOR FINAL REVIEW** (Inventory 完成並已依 review 修正；003-B 未核准，不施工)

---

### BOOK-MVP-003-B-REDO-A: Clean Baseline & Dependency Proof

#### Before
- **Timestamp:** 2026-08-20 12:46:25 +08:00 (Asia/Taipei)
- **Branch:** `agent/book-mvp-003-b-redo`
- **Baseline HEAD:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`
- **origin/main:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`（`git fetch origin` 成功後確認）
- **Worktree:** `F:\診所專案\clinic-book-mvp-003-b-redo`（獨立 clean worktree；不使用既有 dirty/rejected checkout）
- **目的:** 在任何 runtime 變更前，建立 BOOK-MVP-003-B REDO 的完整 clean-main gate、patient static module graph、build/performance 與 current-main mutation ordering 證據。
- **Scope:** 僅執行 authoritative baseline gates、clean build、patient dependency/performance measurement、`store.js` current-main 行為證明，以及本 execution log 的 Phase A evidence。
- **Explicit Non-Scope:** 不修改 runtime、UI、route、renderer、domain、contracts、permissions、RBAC、patient sources、performance budget/checker、clinic、CI、Firebase、Terraform、worker 或 Calendar；不 push、不開 PR、不開始 Phase B 前的 runtime 施工。
- **Planned Files:** `docs/implementation/phase-1-booking-mvp-execution-log.md`（Phase A 唯一允許修改的檔案）。
- **PR #22 Boundary:** PR #22 尚未 merge，且不是本 redo 的 implementation source；本 worktree 只從 verified `origin/main` 建立，不 cherry-pick、不複製其 code 或 branch state。
- **風險:** Windows/CJK worktree 的工具鏈相容性、clean worktree 尚未安裝 dependencies、baseline gate 或 performance 若在 current main 失敗；任何失敗均須分類為 `ENVIRONMENT`、`REMOTE/LOCAL DRIFT`、`ACTUAL MAIN FAILURE` 或 `UNKNOWN`，不得順手修 unrelated issue。
- **Acceptance Criteria:**
  1. Worktree clean，branch/HEAD/origin/main 全部符合已驗證基準。
  2. 指定 baseline gates 與完整 `corepack pnpm verify` 全部 PASS。
  3. clean build 與 `check:perf` PASS，並記錄 patient document/resource/module graph 基準。
  4. 證明 current main 的兩條 Case mutation path、normal follow-up 分離與 `saveState` ordering。
  5. Phase A 只變更 execution log，`git diff --check` 與 docs checks PASS。
- **Tests:** `check:clinic-freeze`、`check:structure`、`check:architecture`、`check:ui`、`check:docs`、`check:format`、`check:types`、`check:lint`、`check:perf`、`test:unit`、完整 `verify`，以及 clean build/report/module graph evidence。
- **Rollback Plan:** Phase A evidence commit 以 `git revert <phase-a-commit-sha>` 還原；不 amend、不 rebase、不改寫歷史。

#### During
- `git fetch origin` 成功；local `origin/main` 與 fetched remote main 均為 `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。
- 確認 local/remote 均不存在 `agent/book-mvp-003-b-redo` 後，從 verified `origin/main` 建立獨立 worktree；branch、HEAD 與 `origin/main` 全部吻合，source worktree clean。
- 工具版本：Node `v24.15.0`、Corepack `0.34.6`、pnpm `11.9.0`；初始 `node_modules` 不存在，`pnpm-lock.yaml` 存在。
- 執行 `corepack pnpm install --frozen-lockfile`；lockfile 驗證與 resolution 通過，但在從 repository-external pnpm store 複製 `@axe-core/playwright` 的 `LICENSE` 至 worktree-local temporary package path 時失敗：
  - error: `[ERR_PNPM_EPERM] [importPackage ...] EPERM: operation not permitted, copyfile ...`
  - exit code: `1`
  - 安裝留下不完整、untracked/ignored 的 worktree-local `node_modules`。
- 依 `AGENTS.md` 的 dependency rebuild 規則與本 slice stop condition，不刪除、不修復、不重試不完整 dependency tree；未執行任何 baseline package gate，未開始 runtime implementation。

#### After
- **Timestamp:** 2026-08-20 12:51:19 +08:00 (Asia/Taipei)
- **實際修改檔案:** `docs/implementation/phase-1-booking-mvp-execution-log.md` only。
- **Deviations:** 完整 baseline gates、clean build、patient module graph measurement 與 critical-main runtime proof 均因 dependency installation prerequisite 失敗而 `NOT_RUN`；Phase B `NOT_STARTED`。
- **Failure Classification:** **ENVIRONMENT** — Windows filesystem denied a package-store `copyfile` during frozen-lockfile installation；沒有 remote/local drift 證據，也尚未執行 gate，故不可分類為 actual main failure。
- **Tests / Results:**
  - `git diff --check`: PASS。
  - `check:clinic-freeze`, `check:structure`, `check:architecture`, `check:ui`, `check:docs`, `check:format`, `check:types`, `check:lint`, `check:perf`, `test:unit`, `verify`: **NOT_RUN (blocked before gates)**。
  - patient build/module/performance baseline: **NOT_RUN**。
- **Failure/Fix Evidence:** 未嘗試 fix；未刪除 `node_modules`、未改 lockfile、未修改 runtime。需要 owner 明確授權 dependency cleanup/retry 或提供已驗證可用的 clean dependency environment 後再續 Phase A。
- **Commit SHA:** `4fbd8b6ede52dcd6cbdedfbb0aa9d6f6e611955d` (`docs(governance): record BOOK-MVP-003-B redo baseline`)。
- **Rollback:** `git revert 4fbd8b6ede52dcd6cbdedfbb0aa9d6f6e611955d`；worktree-local incomplete `node_modules` 不納入 Git，不在本 slice 自動刪除。
- **CLINIC HOMEPAGE CHANGED:** **NO**。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **最終狀態:** **BLOCKED (ENVIRONMENT)**。

#### Remote CI Supersession
- **Timestamp:** 2026-08-20 (Asia/Taipei; GitHub Actions run completed on the same date).
- **Previous Local Result:** **BLOCKED — ENVIRONMENT**。保留上述 Windows `ERR_PNPM_EPERM` 歷史，不回寫成成功，也不把該主機視為 acceptance authority。
- **New Acceptance Method:** GitHub-hosted clean CI；本機僅負責 source inspection、small edits、Git diff 與 commits。
- **Reason:** local Windows dependency installation is not treated as the acceptance environment；Linux GitHub-hosted runner 對 redo branch 的 exact Phase-A-only head 執行 frozen install 與完整 required verification。
- **PR:** [#23](https://github.com/waydefu/clinic/pull/23)（Draft；`main` ← `agent/book-mvp-003-b-redo`；DO NOT MERGE）。
- **Remote Branch Head:** `cccb1b22e7a7d8f9b590884c1356f56f2ef982c7`。
- **Workflow Run:** [32334272601](https://github.com/waydefu/clinic/actions/runs/32334272601) — `success`。
- **Repository Verify:** PASS；structure 216 required files、docs 132 files、format、lint、types、architecture、UI、pages、tokens、secrets、sync 與 clean build 均通過。
- **Unit:** PASS — 62 test files / 1029 tests；既有 `case-assignment`、`payroll` domain/contracts tests 仍通過。
- **Performance:** `check:perf` PASS — 5 entry points 的 gzip transfer budgets 全部通過；此結果是 PR #22 patient document regression 的 authoritative pre-implementation comparison baseline。
- **Clinic Freeze:** PASS — 30 frozen files verified。
- **Required Jobs:** core verify、tracked secrets/dependency audit/inventory、Firestore Emulator、e2e-auth-rbac、e2e-mobile、e2e-appointments、e2e-ui、e2e-accessibility、e2e-patient-portal、Semgrep CE SAST 全部 `success`。
- **Verification Evidence:** PASS — commit-bound evidence job `96321124912` 為 `success`。
- **Deviations:** Phase A 的 local clean build、patient module graph measurement 與 package gates 維持 `NOT_RUN (ENVIRONMENT)`；其 acceptance 已由上述 exact-head remote clean CI 取代，不修改先前紀錄。
- **Rollback:** `git revert <remote-baseline-evidence-commit-sha>`；不 amend、不 rebase、不改寫既有 Phase-A commits。
- **New Phase-A Status:** **PASS — REMOTE CI BASELINE ESTABLISHED**。

---

### BOOK-MVP-003-B-REDO-B: Frozen Case Mutation Isolation

#### Before
- **Timestamp:** 2026-08-20 13:13:39 +08:00 (Asia/Taipei).
- **Branch:** `agent/book-mvp-003-b-redo`。
- **HEAD SHA:** `1ae05b4d4b2c7993d58f0c6f30b6b7588b99e3f8`。
- **Base Main SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。
- **Objective:** 將 synthetic store 的兩條 frozen Case mutation path 改為 source-controlled、unconditional、fail-closed compatibility boundaries，同時保留不帶 Case assignment intent 的正常 follow-up。
- **Scope:** `POST /case-assignments`；`POST /follow-ups/:id` 且 `managerId` 為 trimmed non-empty string；直接 behavioral Vitest 證明 rejection 先於 `recordFollowUp`、`assignCaseManager`、audit/outbox/state mutation 與 `saveState`。
- **Explicit Non-Scope:** UI discoverability、hash route、renderer、workbench scope policy、capability flag、patient source、permissions/RBAC、Case/Payroll domain/contracts、worker、clinic、performance budget/checker、workflow、Firebase/Terraform/Calendar 與 BOOK-MVP-004；Phase C 不開始。
- **Candidate Files:**
  - `apps/web/public/store.js` — 在 shared store 內以無額外 import 的 source-controlled boundary 先行拒絕 frozen Case intent，並移除變成未使用的 `assignCaseManager` named import；保留 `buildOperationalTasks` 與 `buildWorkload`。
  - `apps/web/src/frozen-capability-boundary.test.ts` — 新增 focused behavioral test；現有 `test-only-modules.test.ts` 是 domain/helper 大型集合，沒有 store command seam，故不把 mutation-boundary integration assertions 混入該檔。測試使用 repository dependency Vitest 的 ESM mock/spy 包住原實作，並以受控 `localStorage` 驗證 persisted state。
  - `docs/implementation/phase-1-booking-mvp-execution-log.md` — Before/After 與 remote CI evidence。
- **Mutation Invariants:**
  1. `/case-assignments` 在 permission resolution、`assignCaseManager`、audit mutation、`saveState` 前拒絕。
  2. follow-up 的 `managerId` 為 trimmed non-empty string 時，在 `recordFollowUp`、Case permission/assignment、audit、outbox、patient/appointment mutation 與 `saveState` 前拒絕；whitespace-only 不可繞過。
  3. `managerId` absent、`undefined` 或 `''` 維持 normal follow-up；既有 audit/outbox semantics 不被 freeze 破壞。
  4. Rejection 同時證明 forbidden functions 未呼叫，以及 persisted/in-memory relevant state collections 無變更；不以 source regex 取代 behavioral proof。
  5. `store.js` 不新增 workbench-only module edge、query/localStorage/window/remote capability override。
- **Test Plan:** focused unit cases涵蓋 `/case-assignments`、non-empty/whitespace `managerId` rejection、absent/empty `managerId` success、function call spies、persisted-state equality、followUps/caseAssignments/auditEvents/outboxJobs/appointments/patients invariants；GitHub-hosted `pnpm verify`、all E2E groups、Firestore Emulator、clinic freeze、Semgrep、Verification evidence 與 `check:perf` 為 acceptance authority。
- **Remote CI Acceptance Plan:** 先讓此 docs-only Before head 全綠；runtime/test commit 推送後再逐 job 檢查；implementation evidence commit 的 final head 再全綠。任何紅燈依 introduced/transient/proven-baseline/unknown 分類，未通過不得進下一 slice。
- **Rollback Plan:** Before record、implementation/test、After evidence 各自用 `git revert <commit-sha>` 回退；不 amend、不 rebase、不 force push、不刪除 frozen implementation。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **BOOK-MVP-004 STARTED:** **NO**。

#### During
- `apps/web/public/store.js` 在 command dispatch 前加入 unconditional frozen Case compatibility boundary：`/case-assignments` 一律拒絕；`/follow-ups/:id` 的 `managerId` 為任何非空字串（包含 whitespace-only）時拒絕。兩者都先於 permission resolution、`recordFollowUp`、`assignCaseManager` 與 `saveState`。
- 移除 shared store 已不再使用的 `assignCaseManager` named import；保留 `buildOperationalTasks`、`buildWorkload` 與全部 frozen Case/Payroll domain implementation。
- 新增 `apps/web/src/frozen-capability-boundary.test.ts`，用 Vitest ESM spies 包住原本的 `recordFollowUp`、`assignCaseManager`、`loadState`、`saveState`；同時比對 request-local relevant state 與 persisted localStorage，避免「throw before save 但已局部 mutation」的假綠燈。
- 正常 follow-up 覆蓋 `managerId` absent、`undefined`（JSON boundary 正規化為 absent）與 `''`；成功時驗證 follow-up、audit 與 outbox semantics，且 Case assignment 不發生。
- 既有 `tests/e2e/workbench-lifecycle.spec.ts` 與 `tests/e2e/role-maintenance-responsive.spec.ts` 原先仍斷言 Case assignment 成功；Phase B boundary 生效後更新為驗證 submit 確實抵達 store、收到 frozen error、status 仍為「待指派」。UI discoverability/route/render 尚未修改，留待 Phase C+ owner authorization。
- **CI Finding / Fix History:**
  1. Run `32335268644`：新增 test 未符合 Prettier；以 `d211fe7c56b2ed1d60fb9d671f9ee2597ab01e39` 機械排版修正，未 amend。
  2. Run `32335417123`：test seed 未登入，且 whitespace-only 被錯誤當成 empty；以 `b797224df5326b076d607ff09c8a37e5eb97ce8c` 修正 authenticated seed 與 non-empty intent semantics。
  3. Run `32335597629`：core verify/perf 已綠，但兩個 E2E 仍期待舊 Case success；Semgrep strict mode 對 `importOriginal<typeof import(...)>()` partial parse 並以 exit 3 阻斷。以 `5ddd80e7c1cc7685664997e73edd935c78db1073` 更新 test-only assertions，並改用 tests 已允許的 `any` 讓 SAST 完整解析；未修改 Semgrep、workflow 或 acceptance gate。

#### After
- **Timestamp:** 2026-08-20 13:36:07 +08:00 (Asia/Taipei).
- **Accepted Implementation Head:** `5ddd80e7c1cc7685664997e73edd935c78db1073`。
- **Primary Runtime Commit:** `6bc70ab3107abacb3aa0b77f746479b33dbaa3d3` (`fix(scope): fail closed frozen case mutations`)；後續 `d211fe7`、`b797224`、`5ddd80e` 均為不改寫歷史的 introduced-finding fixes。
- **Changed Files:**
  - `apps/web/public/store.js`
  - `apps/web/src/frozen-capability-boundary.test.ts`
  - `tests/e2e/role-maintenance-responsive.spec.ts`（CI-proven stale Case-success assertion correction）
  - `tests/e2e/workbench-lifecycle.spec.ts`（CI-proven stale Case-success assertion correction）
- **Behavior:** `/case-assignments` rejected before assignment/audit/save；follow-up + non-empty/whitespace `managerId` rejected before follow-up/Case/audit/outbox/save；follow-up without Case intent remains successful。
- **Workflow Run:** [32335991462](https://github.com/waydefu/clinic/actions/runs/32335991462) — accepted implementation head `success`。
- **Repository Verify:** PASS — structure 216、clinic freeze、architecture、UI guard、docs、format、types、lint、sync、clean build 全部通過。
- **Unit:** PASS — 63 test files / 1035 tests；focused boundary 6 cases PASS；existing Case/Payroll domain/contracts tests preserved and PASS。
- **Performance:** `check:perf` PASS — 5 entry points gzip budgets；沒有新增 workbench policy module 或 patient module edge，budget/checker/threshold 未變更。
- **E2E:** PASS — appointments、auth-rbac、mobile、patient-portal、UI、accessibility 全部 `success`。
- **Firestore / Supply Chain / SAST:** Firestore Emulator PASS；tracked secrets/dependency audit/inventory PASS；Semgrep CE SAST PASS（0 blocking findings，commit-bound evidence generated）。
- **Verification Evidence:** PASS — job `96326044096`。
- **Deviations:** 因 remote CI 證明兩個既有 E2E assertions 與新 frozen boundary 衝突，Phase B test-only scope 擴至上述兩個 canonical specs；未擴張 runtime scope。所有 introduced failures 均記錄並以 forward commits 修正。
- **Rollback Plan:** 依反向順序執行 `git revert 5ddd80e7c1cc7685664997e73edd935c78db1073 b797224df5326b076d607ff09c8a37e5eb97ce8c d211fe7c56b2ed1d60fb9d671f9ee2597ab01e39 6bc70ab3107abacb3aa0b77f746479b33dbaa3d3`；不 rewrite shared history。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **PATIENT SOURCE CHANGED:** **NO**。
- **PERFORMANCE BUDGET CHANGED:** **NO**。
- **BOOK-MVP-004 STARTED:** **NO**。
- **Phase-B Implementation Status:** **PASS — REMOTE CI GREEN; FINAL EVIDENCE HEAD CI PENDING**。

---

### BOOK-MVP-003-B-REDO-C: Workbench UI, Route & Projection Isolation

#### Before
- **Timestamp:** 2026-08-20 14:01:33 +08:00 (Asia/Taipei).
- **Branch / HEAD:** `agent/book-mvp-003-b-redo` @ `e0f8cfb67551db0ddad7bf8236915a3cd61e92ae`。
- **Base Main SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`；GitHub remote main 與 local `origin/main` 一致。
- **Objective:** 完成 Phase 1 workbench 的 frozen Case/Payroll discoverability、direct route、render/projection 與 dependency-topology isolation，同時維持 Phase B mutation boundary、normal follow-up 與全部 Booking/排班能力。
- **003-A Refinement:** 003-A 所提 `capability-flags.js` 的治理意圖保留，但 PR #22 已證明 shared `store.js` import workbench-only flag 會污染 patient static graph。本 redo 改採 `apps/web/public/modules/workbench-scope-policy.js`：source-controlled、fail-closed、無 query/localStorage/window/remote override，只能從 workbench modules 可達，且不得由 `store.js` 或 patient graph 可達。
- **Scope:**
  1. 移除 active HTML 的 Case nav、Case summary shortcut、Payroll workload summary 與 `#case-section` panel；保留 Booking completed summary並導向 Booking/Follow-up workspace。
  2. `#case-section` direct hash deterministic replace 至 `#overview`，不顯示 authorization error。
  3. Active operational tasks 只排除 `pendingCaseAssignments`，保留 `overdueArrivals`、`pendingFollowUps`、`cancellationRequests`、`outboxPending` 及既有 governance visibility。
  4. Follow-up form、intake sheet 與 active bootstrap 不 render/submit assigned-manager或Payroll projection；normal follow-up fields、audit/outbox semantics維持。
  5. Preserved `renderCaseAssignments`／`renderWorkload` functions 本身亦 fail closed；Case/Payroll domain/helpers/contracts/tests不刪除。
  6. Static topology guard證明 patient graph及shared store均到不了workbench policy；behavioral unit/E2E證明task/render/route/UI行為，避免以註解或decoy string通過。
- **Candidate Files:**
  - `apps/web/public/index.html`
  - `apps/web/public/admin-bootstrap.js`
  - `apps/web/public/modules/admin-view.js`
  - `apps/web/public/modules/workspace-tabs.js`
  - `apps/web/public/modules/workbench-scope-policy.js`（new）
  - `scripts/check-architecture.mjs`
  - `apps/web/src/workbench-scope-policy.test.ts`（new focused behavioral/topology coverage）
  - targeted existing E2E specs under `tests/e2e/` for exact selector absence、safe direct route、normal follow-up、responsive/affordance matrices
  - dated visual/evidence files only after the exact runtime head is verified；2026-08-10 and earlier evidence remain immutable
  - this execution log for After evidence
- **Must Not Change:** `apps/web/public/store.js` Phase-B boundary、patient HTML/app/api-client、`permissions.js`、canonical roles、API RBAC、Case/Payroll domain/contracts、worker、30 frozen clinic files、performance budget/checker、workflows、Firebase/Terraform/Calendar runtime、lockfiles。
- **Acceptance Criteria:** frozen selectors absent from active DOM/accessibility tree；`#case-section` → `#overview` without permission error；render outputs contain no Case manager/Payroll/pending Case projection；four legitimate operational task categories retained；normal follow-up and Booking lifecycle green；patient graph excludes policy；clinic 30/30 and performance green；all required CI and Verification evidence green。
- **Test Plan:** focused Vitest for immutable policy、task projection、safe route resolution、follow-up/intake/frozen renderer outputs；E2E exact selector and deep-link assertions plus existing Booking/role/mobile/accessibility suites；GitHub-hosted full verify、Firestore、supply chain、SAST and Verification evidence are acceptance authority。
- **Rollback Plan:** Before、runtime/tests、visual/evidence commits separately `git revert`；never amend/rebase/force push；Phase B/store and frozen implementation remain intact。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **BOOK-MVP-004 STARTED:** **NO**。

#### During
- Added import-free `workbench-scope-policy.js` with immutable `CASE_MANAGEMENT=false` and `PAYROLL_WORKLOAD=false`; it reads no query、window、browser storage or remote config。
- Removed active Case nav/summary/panel and Payroll workload summary from `index.html`; kept the completed-visit Booking summary and redirected it to `#appointments-section`。
- `workspace-tabs.js` now resolves the frozen `#case-section` deep link through the pure scope policy and uses `history.replaceState` to reach `#overview` without invoking the authorization-denied handler。
- Active `renderTasks` filters only `pendingCaseAssignments`; overdue arrival、cancellation request、pending follow-up and governance-visible outbox tasks remain。Normal follow-up no longer renders/submits `managerId`; intake no longer projects assigned manager。Preserved Case/Payroll renderers return an empty projection while frozen。
- Removed active bootstrap Case/Payroll DOM writes and Case form event wiring；Phase-B `store.js` fail-closed compatibility boundary was not modified。
- Added topology reachability based on actual literal ESM edges。The guard proves both patient-app graph and shared store graph cannot reach workbench policy, while active workbench must reach it；comments and decoy strings are covered by the pure graph unit test。
- Updated `check:ui` from the stale requirement that Case UI exist to exact active-shell selector refusals；the same guard still requires the frozen store compatibility boundary and preserved Case workload helper。
- Updated focused Vitest and canonical E2E assertions for exact selector absence、safe route、normal follow-up、four retained task categories、responsive panels and direct mutation rejection。
- The current visual-capture source still references the immutable 2026-08-10 historical baseline；none of that dated document、manifest or its ten PNG files was edited or removed。This slice uses executable DOM、responsive、affordance and accessibility evidence for the new workbench state；fresh online owner/vendor visual review is recorded only after the exact candidate preview deployment。
- **Introduced CI Finding:** run `32338902193` reached structure、architecture and UI PASS but core stopped at Prettier for six new/edited files；classified `INTRODUCED — FORMAT ONLY`。Used an already-installed repository-external Prettier 3.9.5 binary only for mechanical formatting（no local install/pnpm repair），committed forward as `08fb7ea`；no gate or runtime behavior changed。

#### After
- **Timestamp:** 2026-08-20 14:23:32 +08:00 (Asia/Taipei).
- **Accepted Implementation Head:** `08fb7ea590753319956651695d4ab39e91d37c60`。
- **Runtime Commit:** `dfed3188a653ff0e4e7b54280af5ae69d3a592a0` (`fix(scope): isolate frozen workbench surfaces`)；format-only follow-up `08fb7ea590753319956651695d4ab39e91d37c60`。
- **Workflow Run:** [32339100657](https://github.com/waydefu/clinic/actions/runs/32339100657) — `success`。
- **Repository Verify:** PASS — structure 216、docs、format、types、lint、sync、public pages、tokens、architecture、UI、clean build all green。
- **Unit:** PASS — 64 test files / 1042 tests；scope policy/render/topology tests and Phase-B mutation boundary tests green；Case/Payroll domain/contracts tests preserved。
- **Behavioral E2E:** PASS — appointments、UI、auth/RBAC、mobile、accessibility、patient portal；exact frozen selector absence、`#case-section` → `#overview` and normal follow-up verified。
- **Performance:** PASS — 5 entry points gzip budgets；patient static graph cannot reach workbench policy；patient source and budget unchanged。
- **Clinic Freeze:** PASS — 30 frozen files verified；historical dated visual evidence unchanged。
- **Firestore / Supply Chain / SAST:** all PASS；SAST job `96334395345`。
- **Verification Evidence:** PASS — job `96334943338`。
- **Changed Scope:** active workbench HTML/bootstrap/view/navigation、source-controlled workbench-only policy、architecture/UI gates and directly related unit/E2E assertions；one synthetic release-summary string removed the frozen feature advertisement。No permissions/RBAC/domain/contracts/patient/clinic/budget/workflow/config change。
- **Rollback Plan:** `git revert 08fb7ea590753319956651695d4ab39e91d37c60 dfed3188a653ff0e4e7b54280af5ae69d3a592a0`，then append superseding governance evidence；Phase B rollback remains separate。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **PATIENT SOURCE CHANGED:** **NO**。
- **PERFORMANCE BUDGET CHANGED:** **NO**。
- **BOOK-MVP-004 STARTED:** **NO**。
- **BOOK-MVP-003-B Status:** **PASS — IMPLEMENTATION CI GREEN; FINAL EVIDENCE HEAD CI PENDING**。

#### Final evidence head
- **Evidence Commit:** `4c0da1f5564cacf697a04e4965d087e425ab5597` (`docs(governance): record BOOK-MVP-003-B redo isolation evidence`)。
- **Workflow Run:** [32339663962](https://github.com/waydefu/clinic/actions/runs/32339663962) — exact evidence head `success`。
- **Required Jobs:** repository verify、Firestore Emulator、auth/RBAC、appointments、UI、mobile、patient portal、accessibility、supply chain／secrets、Semgrep SAST 與 Verification evidence 全部 `success`。
- **Core Evidence:** structure 216、docs 132、public-page inventory、architecture、UI、format、types、lint、clean build、5 entry performance budgets、64 test files / 1042 tests 全部 PASS。
- **Verification Evidence:** job `96336612889` PASS。
- **BOOK-MVP-003-B Status:** **PASS — FINAL EVIDENCE HEAD CI GREEN**。

---

### BOOK-MVP-004: Booking Preview Independent Validation

#### Before
- **Timestamp:** 2026-08-20 14:33:34 +08:00 (Asia/Taipei).
- **Branch / HEAD:** `agent/book-mvp-003-b-redo` @ `4c0da1f5564cacf697a04e4965d087e425ab5597`。
- **Base Main SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。
- **Prerequisite:** BOOK-MVP-003-B final evidence run `32339663962` 全綠；Case/Payroll frozen boundary、normal follow-up、patient graph、performance 與 clinic 30-file freeze 均維持 PASS。
- **Objective:** 以打包後真瀏覽器行為獨立驗證 `/booking` 的 synthetic-only 流程、安全邊界、responsive／keyboard／accessibility 基準，以及與 staff workbench 共用的 create／conflict／reschedule／cancel／masked-identity lifecycle；不把 preview 改成 production。
- **Inspection Finding:** 現有 `/booking` 已顯示測試版本及 browser-local storage 說明，`/privacy` 亦有真實資料禁令；但 `/booking` 本身缺少不可由工作臺公告覆寫的明確「請勿輸入真實患者資料」靜態警語。這是 BOOK-MVP-004 acceptance gap，將以最小、永遠可見的 patient-only boundary 補齊。
- **Scope:**
  1. 在 `/booking` active DOM 加入 static synthetic-only／real-data prohibition／browser-local boundary；不得依賴可編輯 announcement、query、storage 或 remote config。
  2. Behavioral E2E 證明初始載入、精確 PII 類型欄位、create/current/cancel、reserved-slot conflict fail-closed、staff reschedule、screen identity masking、keyboard/focus 與零 API／Firestore／Calendar／LINE／Meta／NAS request。
  3. 以既有 manifest-driven responsive、axe、noindex/security、privacy、performance 與 clinic freeze gates 作獨立 cross-check，建立 dated validation evidence；不重寫歷史 review。
- **Candidate Files:**
  - `apps/web/public/patient.html` — static preview boundary only。
  - `apps/web/public/styles.css` — minimal patient boundary presentation；不得改 clinic stylesheet。
  - `scripts/check-web-ui.mjs` — source invariant for the non-overridable warning and existing exact field allowlist。
  - `tests/e2e/patient-booking.spec.ts` — preview boundary、PII、create/current/cancel、conflict and network-isolation behavior。
  - `tests/e2e/workbench-lifecycle.spec.ts` — staff reschedule and masked screen projection behavior。
  - `docs/reviews/2026-08-20-booking-preview-independent-validation.md` — dated validation crosswalk/evidence。
  - `docs/README.md` and this execution log — lifecycle/index/evidence registration。
- **Must Not Change:** `/clinic` 30 frozen files、patient data model/approved fields、store mutation semantics、Case/Payroll domains/contracts、permissions/RBAC、API/worker、Firestore Rules、Firebase/Terraform/Calendar runtime、performance budget/checker、workflow、lockfiles、historical dated evidence。
- **Acceptance Plan:** lightweight local syntax/diff review only；implementation push 後以 GitHub-hosted full verify、all E2E、Firestore、SAST、performance、clinic freeze與 Verification evidence驗收；After evidence commit 的新 HEAD 再全綠才開始 BOOK-MVP-005。
- **Rollback Plan:** Before、runtime/tests/validation evidence、After evidence 各自 `git revert <sha>`；不得 amend/rebase/force push。若 warning 或 tests 造成 introduced regression，只修 current slice，不放寬 gate。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **BOOK-MVP-005 STARTED:** **NO**。

#### During
- **Implementation Commits:** `809331407ab80271fb32c815ec342ceda3afb8af`（behavioral boundary tests and initial warning）、`bb2c5d42739c07f243153312902c216da5a9e906`（mobile/keyboard correction and warning consolidation）、`ba39690af1bfb201b5970e20afde53655f86c30f`（accepted document-envelope correction）。
- **Introduced Finding 1:** run `32340933231` 以 `/patient.html` performance、mobile 首題位置與 keyboard interaction 三個獨立 gate 擋下 standalone warning panel；分類為 branch-introduced，未放寬 gate。
- **Introduced Finding 2:** run `32341224942` 的 mobile／patient E2E 已綠，但 core 仍以 `/patient.html` document budget 擋下重複警語；分類為 branch-introduced，未修改 patient content 以外架構、budget、checker 或 workflow。
- **Accepted Design:** real-data prohibition 收斂至既有且 always-visible 的「資料保存」card；保留 `LOCAL TEST ONLY` header、field allowlist、patient module graph 與所有 budget。鍵盤測試改為對真實 element 發送 `Enter`，不以 synthetic event 假設瀏覽器行為。

#### After
- **Timestamp:** 2026-08-20 (Asia/Taipei)。
- **Status:** **PASS — INDEPENDENT VALIDATION GREEN**。
- **Accepted Implementation SHA:** `ba39690af1bfb201b5970e20afde53655f86c30f`。
- **Changed Runtime/Test Files:** `apps/web/public/patient.html`、`scripts/check-web-ui.mjs`、`tests/e2e/patient-booking.spec.ts`、`tests/e2e/workbench-lifecycle.spec.ts`；`styles.css` 最終無 net change。
- **Dated Evidence:** `docs/reviews/2026-08-20-booking-preview-independent-validation.md`，並在 `docs/README.md` newest-first 註冊；歷史 baseline 未改寫。
- **Behavioral Result:** synthetic create/current/cancel、reserved-slot conflict no-write、staff reschedule slot transfer、screen identity masking、keyboard/focus、responsive/accessibility 全數 PASS；初始 static load 後 create/cancel 為零 browser network request。
- **Persisted-State Result:** conflict rejection 後 serialized localStorage 不變，appointments／patients／auditEvents／outboxJobs counts 不變，原 reservation 保留。
- **Remote Acceptance:** GitHub-hosted run [`32341449657`](https://github.com/waydefu/clinic/actions/runs/32341449657) @ `ba39690af1bfb201b5970e20afde53655f86c30f`，11/11 jobs `success`。
- **Core Verify:** job `96341222556`；structure 216、docs 132、clinic freeze 30/30、architecture、UI、format、types、lint、clean build、5 entry performance budgets、64 test files / 1042 tests 全部 PASS。
- **Required Jobs:** Firestore `96341222586`、supply-chain/secrets `96341222747`、accessibility `96341222777`、mobile `96341222781`、appointments `96341222799`、patient portal `96341222803`、SAST `96341222873`、UI `96341222880`、auth/RBAC `96341222885`、Verification evidence `96341791420` 全部 PASS。
- **Performance:** **PASS**；`/patient.html` unchanged 7 KiB budget 內，未新增 patient→workbench policy edge，未改 budget/checker/threshold。
- **Rollback:** 依 `ba39690` → `bb2c5d4` → `8093314` 順序各自 `git revert`；本 After/evidence commit 亦獨立 revert，禁止重寫 shared history。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **PATIENT DATA MODEL CHANGED:** **NO**。
- **PERFORMANCE BUDGET CHANGED:** **NO**。
- **WORKFLOW CHANGED:** **NO**。
- **BOOK-MVP-005 STARTED:** **NO**。
- **Final Evidence Head:** commit `dfa1562d665d43f2ee6478dadc6d0e47ea604b8d`，GitHub-hosted run [`32341926443`](https://github.com/waydefu/clinic/actions/runs/32341926443) 11/11 jobs PASS；core `96342601952`、Verification evidence `96343211153` 均為 `success`。BOOK-MVP-004 至此完成。

---

### BOOK-MVP-005: Website Vendor Evaluation Package

#### Before
- **Timestamp:** 2026-08-20 15:04:40 +08:00 (Asia/Taipei)。
- **Branch / HEAD:** `agent/book-mvp-003-b-redo` @ `dfa1562d665d43f2ee6478dadc6d0e47ea604b8d`。
- **Base Main SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。
- **Prerequisite:** BOOK-MVP-004 final evidence run `32341926443` 全綠。
- **Objective:** 交付不需整份 repository 即可評估的網站廠商文件，說明官網 `/reservations/` 目標、API-only／Widget + API／iframe fallback 模型、current preview 限制、responsive／accessibility／host-page responsibilities 與資料/API boundary；不宣稱 production API 已存在。
- **Scope:** 建立 `docs/integration/booking-web-vendor-evaluation.md`；部署前 URL 必須精確標成 `PENDING DEPLOYMENT`，成功驗證後才換成當期 URL。推薦 Widget + API；current Firebase preview 的 `X-Frame-Options: DENY` 與 `frame-ancestors 'none'` 明確禁止直接 iframe。
- **Candidate Files:** `docs/integration/booking-web-vendor-evaluation.md`、`docs/README.md`、本 execution log；BOOK-MVP-006 的 payload report 作同一 vendor-handoff slice 的量化 companion。
- **Must Not Change:** runtime、`/clinic` 30 frozen files、production API/backend、Firestore/Calendar/LINE/Meta/NAS、Firebase/Terraform、credentials、real data、performance budget/checker semantics、workflow、lockfiles。
- **Acceptance:** docs links/index/lifecycle、format 與 full GitHub required checks 綠；document 不含 secret、credential、service account、production Firebase config、real PII、full repo archive 或 stale preview URL。
- **Rollback:** 每個 slice 以 `git revert <sha>` 回復；不 rewrite shared history。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **BOOK-MVP-006 STARTED:** **NO**。

#### After — pre-deployment package
- **Status:** **PASS — PRE-DEPLOYMENT VENDOR PACKAGE READY; VERIFIED URL PENDING DEPLOYMENT**。
- **Delivery Commit:** `ea1cfcd1eeb5c0bbccef86ccdb0ab459920c2d13`。
- **Document:** `docs/integration/booking-web-vendor-evaluation.md`；廠商不需 repository 即可評估 official `/reservations/` journey、Widget + API recommendation、API-only alternative、iframe fallback、host/responsive/accessibility/error responsibilities 與 data boundary。
- **Preview Truth:** URL/expiry 均保持 `PENDING DEPLOYMENT`；current preview 明確為 browser-local synthetic/noindex/no-real-data，未宣稱 production API active。
- **iframe Truth:** 明載 current `X-Frame-Options: DENY` 與 CSP `frame-ancestors 'none'`，禁止直接 iframe；fallback 需 dedicated surface 和獨立 security acceptance。
- **Remote Acceptance:** run [`32343091379`](https://github.com/waydefu/clinic/actions/runs/32343091379) @ `ea1cfcd1eeb5c0bbccef86ccdb0ab459920c2d13`，11/11 jobs PASS；core `96345973181`、Firestore `96345973515`、supply-chain `96345973340`、六組 E2E `96345973259`／`96345973324`／`96345973344`／`96345973355`／`96345973443`／`96345973479`、SAST `96345973469`、Verification evidence `96346763581` 全部 `success`。
- **Completion Gate Remaining:** authorized deploy 後將 verified URL/expiry 寫回同一 canonical document並再跑 final CI；完成前 BOOK-MVP-005 不標 final PASS。
- **Rollback:** `git revert ea1cfcd`；Before/evidence 另以其 commit revert，不 rewrite history。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **BOOK-MVP-006 STARTED:** **YES — COUPLED VENDOR HANDOFF SLICE**。

### BOOK-MVP-006: Frontend Asset / Payload Report

#### Before
- **Timestamp:** 2026-08-20 15:04:40 +08:00 (Asia/Taipei)。
- **Branch / HEAD:** `agent/book-mvp-003-b-redo` @ `dfa1562d665d43f2ee6478dadc6d0e47ea604b8d`。
- **Base Main SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。
- **Objective:** 由 authoritative GitHub Linux build 量測 `/booking`、`/clinic` 與 workbench 的 document／JS／CSS／image／total transfer、resource counts、content hashing、cache behavior 與可支援的 compression evidence，分離廠商數字與內部 budget evidence。
- **Measurement Plan:** 使用既有 `scripts/check-performance-budget.mjs --report` 對 CI 產生的 `apps/web/dist` 印出 deterministic gzip closure；如需讓該既有 report mode 在 CI log 可見，只暫時調整 package command 的 output mode，量測後回復，絕不改演算法、budget、threshold 或 workflow。Brotli 只在 repository tooling 對同一 dist 有 authoritative output 時列數字，否則明確記錄 `NOT MEASURED`。
- **Candidate Files:** `package.json`（temporary report-output switch，final net change 必須為 zero）、`docs/integration/booking-frontend-payload-report.md`、`docs/README.md`、本 execution log。
- **Must Not Change:** `apps/web/performance-budget.json`、`scripts/check-performance-budget.mjs` semantics、runtime、clinic、patient content、workflow、lockfiles、production config。
- **Acceptance:** authoritative run 產生 exact entry measurements且所有現行 budgets PASS；final docs-only HEAD 再全綠。任何超標視為 regression，不以放寬 budget/checker 解決。
- **Rollback:** measurement/output、report/evidence commits 各自 `git revert <sha>`；不 amend/rebase/force push。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **BOOK-MVP-007 STARTED:** **NO**。

#### During
- **Measurement Instrumentation:** commit `934b683f96317efc3295625834942532fbc15e1b` temporarily added the existing `--report` output mode to `check:perf`; no algorithm/budget/threshold/workflow change。
- **Authoritative Measurement:** run [`32342667289`](https://github.com/waydefu/clinic/actions/runs/32342667289) 11/11 PASS；core job `96344741075` built 76 files / 52 content-hashed and printed exact gzip entry closures；Verification evidence `96345329499` PASS。
- **Instrumentation Removal:** delivery commit `ea1cfcd1eeb5c0bbccef86ccdb0ab459920c2d13` restored the original package command；final net package/runtime change versus pre-measurement head is zero。

#### After
- **Status:** **PASS — AUTHORITATIVE PAYLOAD REPORT DELIVERED**。
- **Document:** `docs/integration/booking-frontend-payload-report.md`。
- **Vendor Gzip Totals:** `/booking` 62.6 KiB / 37 resources；`/clinic` 118.1 KiB / 13 resources；workbench 86.1 KiB / 38 resources。
- **Booking Breakdown:** document 7.0 KiB、31 scripts 41.2 KiB、2 stylesheets 9.0 KiB、3 images 5.3 KiB；total budget 70 KiB PASS。
- **Clinic Breakdown:** document 2.0 KiB、2 scripts 13.0 KiB、1 stylesheet 7.4 KiB、9 images 95.7 KiB；total budget 200 KiB PASS；frozen files 未改。
- **Workbench Breakdown:** document 9.3 KiB、33 scripts 59.2 KiB、2 stylesheets 15.0 KiB、2 images 2.6 KiB；total budget 90 KiB PASS。
- **Compression/Cache:** gzip 為 authority；Brotli 明確 `NOT MEASURED`（repository gate 不輸出，不以 local estimate 替代）；HTML `no-cache`、hashed JS/CSS one-year `immutable`、其他 assets 維持 global `no-cache`。
- **Implementation Acceptance:** run [`32343091379`](https://github.com/waydefu/clinic/actions/runs/32343091379) @ `ea1cfcd1eeb5c0bbccef86ccdb0ab459920c2d13` 11/11 PASS，含 performance、clinic freeze、all E2E、Firestore、SAST、supply-chain 與 Verification evidence。
- **Budget/Checker/Workflow Change:** **NO** final net change。
- **Rollback:** slice reverse order為 `git revert ea1cfcd`、`git revert 934b683`、`git revert 320e423`；後續 After-evidence commit 另行 revert。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **BOOK-MVP-007 STARTED:** **NO**。
- **Final Evidence Head:** commit `7e1e3a86a20a138bb223425d15d707908658d011`，run [`32343468738`](https://github.com/waydefu/clinic/actions/runs/32343468738) 11/11 PASS；core `96347125758`、Verification evidence `96347763847` 均 `success`。BOOK-MVP-006 至此完成；BOOK-MVP-005 保持 pre-deployment URL gate。

---

### BOOK-MVP-007: Calendar Alignment (Spec & Governance)

#### Before
- **Timestamp:** 2026-08-20 15:23:38 +08:00 (Asia/Taipei)。
- **Branch / HEAD:** `agent/book-mvp-003-b-redo` @ `7e1e3a86a20a138bb223425d15d707908658d011`。
- **Base Main SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。
- **Prerequisite:** BOOK-MVP-005/006 final evidence run `32343468738` 11/11 PASS。
- **Objective:** 只在 spec/governance 層對齊 accepted ADR-0002、2026-08-16 recorded owner input 與仍 pending 的 D-009/D-016：system/domain state 永遠是 authority，Calendar 僅為 projection/operational view，outbound 走 transaction → outbox → worker，inbound 只能 proposed candidate/manual-review queue且不得自動 mutation。
- **Verified Drift:** plan-only bidirectional document、README/roadmap cross-reference與 decision-register 的 2026-07-28 paragraph仍把「須取代 ADR-0002」或「auto-apply vs review 未選」寫成 current；但 live D-016 row/2026-08-16 input已指定 manual review＋system authoritative（reviewer identity/matching/delete semantics仍未解）。修正不得把 input 升格 approval。
- **Candidate Files:** `docs/adr/0002-calendar-is-a-projection-not-the-lock.md`、兩份 Calendar integration/bidirectional architecture plan、`docs/architecture/api-v1-contract.md`、Expansion S plan、integration approval packet、`docs/product/phase-1-decision-register.md`、`docs/product/current-execution-and-approval-plan.md`、`README.md`、`docs/roadmap.md`、`docs/README.md`、本 execution log；後四份補讀檔案皆是 drift search 直接命中的 live binding/navigation 文件，不擴張到無關 docs。
- **Must Not Change:** Calendar/API/worker/runtime code、credentials、Firebase/Terraform、production resource、real Calendar/data、D-series status、dated review evidence。
- **Acceptance:** current documents agree that manual-review candidate ingestion preserves ADR-0002 authority；任何 future auto-apply/co-authority design才需要 superseding ADR；D-009/D-016保持 pending，且不存在 implementation/deployment claim。Full GitHub required checks green。
- **Rollback:** docs slice以 `git revert <sha>` 回復；不 rewrite history。
- **CALENDAR CONNECTED:** **NO**。
- **WORKER DEPLOYED:** **NO**。
- **CREDENTIAL ADDED/USED:** **NO**。
- **REAL CALENDAR DATA USED:** **NO**。
- **BOOK-MVP-008 STARTED:** **NO**。

### BOOK-MVP-008: Documentation & Authority Sync

#### Before
- **Timestamp:** 2026-08-20 15:23:38 +08:00 (Asia/Taipei)。
- **Branch / HEAD:** `agent/book-mvp-003-b-redo` @ `7e1e3a86a20a138bb223425d15d707908658d011`。
- **Objective:** 在 implementation truth 已知後同步 live authority/navigation：BOOK-MVP-003/004/006已 PASS、005待 verified deploy URL、007為 docs-only alignment；保留 Stage 1、pending decisions、synthetic-only/no-production boundary，不重寫 dated evidence。
- **Mandatory Review Set:** `AGENTS.md`、`README.md`、`docs/roadmap.md`、`docs/phase-1-execution-plan.md`、`docs/product/phase-1-decision-register.md`、本 execution log、`docs/README.md`；另以 current execution plan消除 D-016 stale question。
- **Patient Identity Correction:** execution log現有「Booking + Case 共用患者比對」過強；改為 Booking/API foundation，可能與 future Case matching/merge有關，但 current frozen Case domain不直接依賴 patient-identity。只修 live ledger wording，不改 historical review。
- **Candidate Files:** 上述 live documents only；若檢查後 statement仍 current則不為了湊數改檔。
- **Must Not Change:** dated review evidence、runtime/tests、clinic、roles/permissions/RBAC、domain/contracts、budget/checker、workflow、lockfiles、decision status或 owner-input authority level。
- **Acceptance:** authority/status/boundary/cross-links一致，docs lifecycle/index/links/format/full CI全綠；沒有 owner direction被轉為 formal approval。
- **Rollback:** docs sync/evidence commit各自 `git revert <sha>`。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **BOOK-MVP-009 STARTED:** **NO**。

#### After — BOOK-MVP-007 Calendar alignment
- **Status:** **PASS — SPEC/GOVERNANCE ALIGNMENT ACCEPTED BY REMOTE CI**。
- **Implementation Commit:** `269c283dfb680d45805031c207dbcc3d58b42ff0` (`docs(governance): align Calendar and BOOK-MVP authority`)。
- **Authority Result:** accepted ADR-0002 remains authoritative；system/domain state是唯一 booking／availability／capacity authority，Calendar只可作 projection／operational view。Outbound仍是 transaction → outbox → worker；inbound只可作隔離 candidate/manual-review proposal，不得自動 mutation。
- **Decision Result:** 2026-08-16 manual-review＋system-authoritative input已同步到 live plans/contracts，但沒有升格 formal approval；D-009、D-016保持 `pending`，reviewer identity、matching、delete semantics、scope/exclusions、approval metadata與 SLO仍是 gate。
- **Remote Acceptance:** run [`32344628527`](https://github.com/waydefu/clinic/actions/runs/32344628527) @ `269c283dfb680d45805031c207dbcc3d58b42ff0` 11/11 PASS；core `96350640878`、Firestore `96350640801`、supply-chain `96350640602`、auth/RBAC `96350640751`、mobile `96350640791`、appointments `96350640813`、patient portal `96350640858`、accessibility `96350640861`、UI `96350640876`、SAST `96350640760`、Verification evidence `96351261166`均 `success`。
- **Runtime/Route/Worker/Credential Change:** **NO**。
- **CALENDAR CONNECTED:** **NO**。
- **REAL CALENDAR DATA USED:** **NO**。
- **Rollback:** `git revert 269c283`；After evidence commits `20aab92`及本 ordering correction另行 revert，不 rewrite history。

#### After — BOOK-MVP-008 authority sync
- **Status:** **PASS — LIVE AUTHORITY/NAVIGATION SYNCHRONIZED**。
- **Reviewed/Changed:** mandatory seven-file review完成；只修 genuine live drift並追讀直接命中的 Calendar binding/navigation docs。Dated review/visual evidence未改，D-series status未改。
- **Patient Identity Result:** `patient-identity.ts`正確記為 Booking/API foundation；可能與 future Case matching/merge相關，但 current frozen Case domain不直接依賴。
- **Current Truth:** BOOK-MVP-003／004／006 PASS；BOOK-MVP-005仍待 verified deployed URL/expiry；BOOK-MVP-007只完成 spec/governance。Stage 1、synthetic-only、no-production、no-real-data邊界不變。
- **Remote Acceptance:** 同一 implementation run [`32344628527`](https://github.com/waydefu/clinic/actions/runs/32344628527) 11/11 PASS，包含 docs/links/format、architecture/UI checks、performance、clinic freeze、unit、all E2E、Firestore、SAST及 Verification evidence。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **BOOK-MVP-009 STARTED:** **NO**。
- **Completion Gate:** 修正 ordering 後的新 HEAD仍須 full GitHub CI 11/11 PASS；通過前不開始 BOOK-MVP-009。

---

### BOOK-MVP-009: Final Full Verification & Candidate Freeze

#### Before
- **Timestamp:** 2026-08-20 15:46:24 +08:00 (Asia/Taipei)。
- **Branch / HEAD:** `agent/book-mvp-003-b-redo` @ `4cb094e631018ad03ebc6ab8c974502d8839262a`。
- **Base Main SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。
- **Prerequisite:** BOOK-MVP-007/008 corrected final evidence run [`32345057004`](https://github.com/waydefu/clinic/actions/runs/32345057004) 11/11 PASS；core `96352063018`、Firestore `96352063222`、SAST `96352063104`、Verification evidence `96352714431`均 `success`。
- **Objective:** 建立 concise Traditional Chinese owner handoff，凍結 deployable runtime與全部 pre-deployment vendor/owner docs，並在同一 candidate SHA執行 repository-required full GitHub verification。該 commit全綠後即為 exact deployment candidate C。
- **Candidate Files:** `docs/reviews/2026-08-20-booking-mvp-owner-acceptance.md`、`docs/README.md`、本 execution log；不再修改 runtime。
- **Candidate Truth:** Owner document的 preview URL/expiry保持 `PENDING DEPLOYMENT`；C只含部署前 truth。C綠燈後由獨立 docs-only authority commit D記錄 C的 exact SHA、operator、project、channel與 expiry，再從 exact C build/deploy。
- **Must Not Change:** runtime/tests、clinic frozen files、patient/workbench module graph、roles/permissions/RBAC、Case/Payroll domain/contracts、budget/checker、workflow、lockfiles、Firebase/Terraform/Calendar config、dated evidence。
- **Required Same-SHA Gate:** verify（structure/docs/format/lint/types/build/sync/domain/perf/unit/architecture/UI/public pages/design tokens/clinic freeze）＋Firestore Emulator＋全部 required E2E（accessibility/appointments/auth-RBAC/mobile/patient portal/UI）＋supply-chain/secrets＋SAST＋Verification evidence全部 GREEN。
- **Acceptance:** candidate commit 11/11 jobs PASS且 `check:perf`／clinic 30-file freeze PASS；branch delta/self-review無 scope creep、secret、real PII、production config、Calendar implementation或 historical evidence rewrite。之後記錄 `C = <exact SHA>`，runtime即 frozen。
- **Rollback:** candidate docs commit用 `git revert <sha>`；003～008各 logical slice沿 execution log反向 `git revert`，不 rebase/reset/force push。Preview尚未部署，無 cloud rollback。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **LIVE HOSTING DEPLOYED:** **NO**。
- **BOOK-MVP-009 Status:** **IN PROGRESS — CANDIDATE CI PENDING**。

#### After — exact deployment candidate C
- **Status:** **PASS — SAME-SHA FULL VERIFICATION GREEN; CANDIDATE FROZEN**。
- **C:** `7e0add8079b37da2e1c11ef4f59660554b9b66d8` (`docs(index): register owner handoff as review evidence`)。
- **Scope:** C包含全部 deployable runtime、BOOK-MVP-003～008 accepted changes、pre-deployment vendor package、payload report與 owner handoff；preview URL/expiry仍正確保持 `PENDING DEPLOYMENT`。C之後不得改 runtime，除非 online verification證明 genuine defect並重走 C2 full-CI/authority流程。
- **Candidate Run:** [`32345967000`](https://github.com/waydefu/clinic/actions/runs/32345967000) on exact C，11/11 jobs `success`。
- **Core Evidence:** job `96354679186`；structure 216 files、clinic freeze 30 files、architecture、UI、public pages、design tokens、docs 136 files、format、types/build、lint、sync/domain、performance 5 entrypoints與 unit 64 files／1042 tests全部 PASS。
- **Other Jobs:** Firestore `96354679022`、patient portal `96354679159`、supply-chain `96354679167`、SAST `96354679265`、mobile `96354679277`、appointments `96354679303`、UI E2E `96354679309`、accessibility `96354679335`、auth/RBAC `96354679379`、Verification evidence `96355327716`全部 `success`。
- **Failure Disposition:** first freeze attempt `3e5a7aafbc9e644f6aa731662c90bfd1c563c29b` failed only because the new dated review was indexed outside `docs/README.md` Review record；`7e0add8` moved that same link into the required lifecycle section，沒有 runtime change。Failed SHA不是 C。
- **BOOK-MVP-009 Status:** **PASS**。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **LIVE HOSTING DEPLOYED:** **NO**。
- **Rollback:** `git revert 7e0add8`、`git revert 3e5a7aa`；其餘 logical slices依本 log反向 revert，不 rewrite history。

### PRE-DEPLOYMENT AUTHORITY RECORD D — exact candidate C

- **Recorded At:** 2026-08-20 15:55:33 +08:00 (Asia/Taipei)。
- **Exact Deploy Commit:** `7e0add8079b37da2e1c11ef4f59660554b9b66d8` (**C**)；deployment必須 checkout/build C，不得 build本 docs-only D。
- **Candidate Acceptance:** run [`32345967000`](https://github.com/waydefu/clinic/actions/runs/32345967000) 11/11 PASS，Verification evidence `96355327716` PASS。
- **Firebase Project:** `beauessence-clinic-staging`（project number `781119800251`；`firebase projects:list`於本次 read-only查證可見）。
- **Hosting Channel:** `synthetic-review`。
- **Requested Expiry:** `7d`。
- **Purpose:** website Vendor + Owner synthetic preview evaluation／UI/UX acceptance。
- **Approver:** project owner；本 session於 2026-08-20明確授權一次 expiring synthetic Hosting preview deployment。
- **Operator:** `wayde.fu@gmail.com`；Firebase CLI `15.18.0` 的 `firebase login:list`於本次確認登入，`firebase projects:list`確認 operator可見 exact staging project。
- **Canonical Command:** `firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging`。
- **Permitted Resource:** **Firebase Hosting preview channel ONLY**。
- **Prohibited:** live Hosting、Firestore、Functions、Storage、Cloud Run、Authentication activation、Calendar、LINE／Meta／NAS、production backend、real data。
- **Data Boundary:** synthetic browser-local data only；**NO REAL DATA**。
- **D Scope:** 本 record的 commit只可修改本 execution log；D相對 C不得有 runtime/test/config/workflow/lockfile差異。D push後須 full GitHub CI 11/11 GREEN，之後仍從 detached exact C執行 runbook。
- **Deployment Status:** **BLOCKED — PREDEPLOY ENVIRONMENT; EXACT C NOT PUBLISHED**。詳見下方 Attempt 1。
- **Rollback:** authority commit以 `git revert <D-sha>`回復；這不會回復 Firebase CLI在失敗 predeploy前已更新的 preview-channel expiry metadata，該 partial effect另由下方 remote audit記錄。

#### After — authority record D
- **D:** `f2d0f6735311b709b06e8e2f7a7264f021d7bf7b` (`docs(governance): authorize exact candidate C preview`)；相對 C只修改本 execution log。
- **Remote Acceptance:** run [`32346355049`](https://github.com/waydefu/clinic/actions/runs/32346355049) 11/11 PASS；core `96355823165`、supply-chain `96355823401`、auth/RBAC `96355823452`、mobile `96355823477`、appointments `96355823583`、SAST `96355823600`、Firestore `96355823613`、accessibility `96355823655`、UI `96355823684`、patient portal `96355823704`、Verification evidence `96356470043`全部 `success`。
- **Authority Gate:** **PASS**；deploy target仍是 exact C `7e0add8079b37da2e1c11ef4f59660554b9b66d8`，不是 D。

### SYNTHETIC PREVIEW DEPLOYMENT ATTEMPT 1 — ENVIRONMENT BLOCKED

- **Attempted At:** 2026-08-20 16:02 +08:00 (Asia/Taipei)。
- **Exact Source:** clean detached worktree at candidate C `7e0add8079b37da2e1c11ef4f59660554b9b66d8`；`git status --short` empty。
- **Dependency Proof:** reused an existing pnpm 11.9.0 installation whose repository lockfile and `node_modules/.pnpm/lock.yaml` both equal candidate lock SHA-256 `7B0721E132B0A54DB574A35CF4D2C23B49E728BB012075B66B018E1F2CBB6E36`；TypeScript/ESLint resolved and the previously blocked axe LICENSE exists。沒有使用 PR #22 source或 dist。
- **Operator/Target Proof:** Firebase CLI `15.18.0`，operator `wayde.fu@gmail.com`；`firebase login:list`／`projects:list`確認 exact project `beauessence-clinic-staging`（number `781119800251`）。
- **Command:** canonical `firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging`；只指定 Hosting preview channel。
- **Failure:** canonical `firebase.json` predeploy `corepack pnpm run build`在 build/upload前以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`中止；detached junction的 absolute pnpm virtual-store path不被接受，pnpm要求 purge/install。依 owner low-resource-host policy，未設 `CI=true`、未關 `confirmModulesPurge`、未 purge／install／repair、未移除 predeploy，且未重試相同 deploy command。
- **Remote Effect Audit:** `firebase hosting:channel:list --json`顯示 C **沒有**新 release；channel仍指向 2026-08-19 release/version `4e3488c61dc64188`。Firebase在 predeploy失敗前把既有 `synthetic-review` channel metadata的 `updateTime`／`expireTime`更新為 `2026-08-20T08:02:43.287030164Z`／`2026-08-27T08:02:43.287030164Z`。這是已獲准 preview channel的 expiry metadata partial effect；不是 C content、不是 live或 backend deploy。
- **Delivery Consequence:** 舊 release與其 URL不是本次 C，不得交付、重用或宣稱 verified；vendor/owner canonical docs保持 `PENDING DEPLOYMENT`。`verify:preview` **NOT RUN**，因為沒有新的 exact-C URL。
- **Hosted Alternative Audit:** `gh codespace list`沒有既有 hosted environment；未建立新的付費 Codespace，也未搬運 Firebase refresh token／credential。Repository沒有 authorized deploy workflow，且依指示未修改 CI。
- **Required Unblock:** 提供一個 clean remote/hosted exact-C environment，可按 lockfile安裝並安全使用已授權 Firebase operator；或 owner先建立/指定等價 deploy host。之後須重新確認 C、operator、project，執行同一 canonical command並完成 `verify:preview`。
- **Deployment Status:** **BLOCKED — CLEAN EXECUTION ENVIRONMENT REQUIRED**。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **AUTHORIZED PREVIEW CHANNEL METADATA TOUCHED:** **YES — EXPIRY ONLY; CONTENT NOT UPDATED**。
- **LIVE HOSTING DEPLOYED:** **NO**。
- **BACKEND/FIRESTORE/FUNCTIONS/CALENDAR DEPLOYED:** **NO**。
- **REAL DATA USED:** **NO**。
- **BOOK-MVP-005 Status:** **IN PROGRESS — VERIFIED EXACT-C URL STILL PENDING**。
- **BOOK-MVP-009 Status:** **PASS — C REMAINS VALID/FROZEN**。

### SYNTHETIC PREVIEW DEPLOYMENT ATTEMPT 2 — OWNER-AUTHORIZED `CI=true` RESOLUTION

- **Resolution Authority:** owner於 2026-08-20完成前次 blocker review，確認 candidate C未被拒絕，並只針對 exact-C non-interactive deploy／canonical predeploy明確授權一次 process-scoped `CI=true` retry；未授權 `confirmModulesPurge=false`或任何 repository config/source/history變更。
- **Previous Status Preserved:** Attempt 1 的 `BLOCKED — ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`與 expiry-only partial effect保留如上；本紀錄不把先前正確 stop改寫成成功。
- **Exact Source:** clean detached worktree @ `7e0add8079b37da2e1c11ef4f59660554b9b66d8`（C）；retry前、canonical build後與 `verify:preview`後 `git status --short`均無 tracked modification。未部署 PR HEAD、D、main或 PR #22。
- **Operator / Target:** `wayde.fu@gmail.com`；project `beauessence-clinic-staging`（number `781119800251`）；Hosting preview channel `synthetic-review`；requested expiry `7d`。
- **Execution:** 只在 deployment process設定 `CI=true`，執行 unchanged canonical `firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging`。`firebase.json` predeploy `corepack pnpm run build`保持啟用，完成 dependency reconciliation、workspace build、18 domain vendor file sync與 76-file hashed web dist；沒有跳過 predeploy、替換 dist、修改 lockfile／package／Firebase config或持久化環境設定。
- **Result:** **PASS — EXACT C CONTENT UPLOADED AND RELEASED**。Release `1787215117437000`，version `461a8ca164840843`（`FINALIZED`），release time `2026-08-20T08:38:37.437Z`（16:38:37 Asia/Taipei）。Firebase Authentication channel-domain sync warning另行記錄；Authentication不在 authority內且未啟用，Hosting release本身完成。
- **Preview:** <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app>；absolute expiry `2026-08-27T08:37:05.942064109Z`（16:37:05 Asia/Taipei）。同一 channel URL先前指向舊 release；本次只在新 release/version與 embedded exact-C marker均被查證後才成為 current delivery URL。
- **Online Verification:** process-scoped `CI=true`下執行 `corepack pnpm verify:preview -- <current-url>`，於 `2026-08-20T08:39:00.239Z`取得 **463/463 PASS**；commit marker為 C。涵蓋 `/booking`、`/clinic`、`/privacy`、workbench、security/noindex headers、HTML no-cache、hashed JS/CSS immutable cache、synthetic/local-browser/masked-identity與 no-backend／Firestore／Calendar／LINE／Meta／NAS boundary。
- **Dated Evidence:** `docs/reviews/2026-08-20-booking-mvp-synthetic-preview-deployment.md`；historical 2026-07/08 deployment與 visual evidence未修改。
- **Delivery Result:** vendor package與 owner package已寫入 verified URL、expiry、C與驗收說明；**BOOK-MVP-005 PASS**，vendor handoff READY，owner acceptance READY FOR OWNER TESTING。
- **Final Documentation Gate:** 本 post-deployment docs commit push後，新的 PR #23 HEAD仍須所有 required GitHub jobs與 Verification evidence GREEN；candidate-C run不能替代這個 final-head gate。
- **LIVE HOSTING DEPLOYED:** **NO**。
- **BACKEND/FIRESTORE/FUNCTIONS/STORAGE/CLOUD RUN DEPLOYED:** **NO**。
- **CALENDAR CONNECTED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **BOOK-MVP-003:** **PASS**。
- **BOOK-MVP-004:** **PASS**。
- **BOOK-MVP-005:** **PASS**。
- **BOOK-MVP-006:** **PASS**。
- **BOOK-MVP-007:** **PASS — SPEC/GOVERNANCE ONLY**。
- **BOOK-MVP-008:** **PASS**。
- **BOOK-MVP-009:** **PASS — C REMAINS FROZEN**。
- **Rollback:** preview自動到期；需要提前下架時依 `docs/runbooks/synthetic-online-preview.md#下架`刪除 `synthetic-review` channel。Post-deployment docs commit、D與各 logical slice分別用 `git revert`；不 rebase/reset/force push。

---

### OWNER ACCEPTANCE REFINEMENT — NEW C2 BEFORE RECORD

- **Timestamp:** 2026-08-20 17:43:47 +08:00 (Asia/Taipei)。
- **Branch / HEAD:** `agent/book-mvp-003-b-redo` @ `7b3e8a33ddf68d33f942599ebf674d7aaee2c1c1`。
- **Base Main SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`；remote main在本輪開始時未前進。
- **Authority Change:** owner完成已部署 C的體驗審查後，要求在同一 PR #23進行最終 UX/scope refinement。先前 C `7e0add8079b37da2e1c11ef4f59660554b9b66d8`、其 full-CI與 preview deployment仍是有效 historical evidence，但不再是本輪最終交付候選；本輪必須建立、驗證並部署新的 exact candidate **C2**。
- **Case Reconciliation:** 先前「Phase 1 synthetic workbench完全 freeze `CASE_MANAGEMENT`」被本次 owner direction局部 supersede：只在 synthetic workbench恢復 Case assignment/read-render-mutation reachability，並以 current `ASSIGN_CASE`／`REASSIGN_CASE`權限、pre-mutation authorization、single-save與 no-partial-write invariants實作。這不是 D-007全域 production approval；`PAYROLL_WORKLOAD`仍 frozen，Case domain/contracts/audit vocabulary保留。
- **Objective:** active non-frozen surfaces預設暖色；恢復正確授權的 Case workflow；把 staff週曆改為真實 schedule-derived compact sessions；移除 booking初始自動捲動並保留每步 context；privacy modal返回時保留 Step 3/state/focus；vendor-facing booking header不暴露 clinic/internal navigation；以 behavioral/architecture/accessibility/performance/full-CI與新 dated visual evidence證明結果。
- **Scope:** `apps/web/public/theme.js`與 active-surface theme tests；synthetic workbench scope policy、store Case mutation boundary、Case/follow-up UI與 weekly calendar；patient booking layout/scroll/privacy-return/vendor navigation；focused unit/E2E/architecture guards；new dated visual evidence、owner/vendor/execution evidence及 PR #23 current truth。
- **Non-Scope:** `/clinic`與 doctor frozen HTML/CSS/JS/assets/content/layout/SEO/brand；Payroll renderer/mutation；roles、browser permission vocabulary、API RBAC、Case/Payroll domain/contracts；production backend/data/credentials；Firestore direct browser access；Google Calendar implementation/connection；LINE/Meta/NAS；live Hosting；performance budget/checker/threshold；workflow/lockfiles；PR #22；merge。
- **Candidate Runtime Files:** `apps/web/public/theme.js`、`apps/web/public/store.js`、`apps/web/public/index.html`、`apps/web/public/styles.css`、`apps/web/public/admin-bootstrap.js`、`apps/web/public/modules/workbench-scope-policy.js`、`apps/web/public/modules/admin-view.js`、`apps/web/public/modules/week-view.js`、`apps/web/public/patient.html`、`apps/web/public/patient-app.js`、`apps/web/public/modules/policy-dialog.js`、`apps/web/public/privacy.html`、`apps/web/public/privacy.css`；任何額外 runtime檔須先以 actual dependency證明必要性。
- **Candidate Test/Guard Files:** existing focused tests under `apps/web/src` and `tests/e2e` for scope policy、frozen boundary、theme、week calendar、patient booking、privacy、workbench lifecycle/accessibility，以及 `scripts/check-architecture.mjs`、`scripts/check-web-ui.mjs`、`scripts/check-public-pages.mjs` only where actual boundary evidence requires updates。
- **Mutation Invariants:** `/case-assignments`先判斷 active assignment並 require `ASSIGN_CASE`或`REASSIGN_CASE`，再呼叫 preserved `assignCaseManager`；follow-up含 semantic non-empty `managerId`時先完成 Case action authorization、再完成 `MANAGE_FOLLOW_UP` authorization，之後才可 `recordFollowUp`／`assignCaseManager`，正常 request boundary只 save一次。任何 denial或 invalid whitespace manager intent都不得改 followUps、caseAssignments、auditEvents、outboxJobs、appointments、patient state或 persisted state，亦不得到達 `saveState`。
- **UI/Data Invariants:** Case只在 synthetic workbench恢復；Payroll保持不可 discover/navigate/render/mutate。週曆只由 business hours/date exceptions/closures/actual appointments衍生，不建立假 event cards。Booking context只顯示 actual selection/state；privacy imported dialog不得導頁或重建 application state。Patient static graph不得新增 workbench-only policy edge。
- **Acceptance Strategy:** autonomous gated slices A–J；每個 meaningful runtime slice各自 commit、normal push並檢查 PR #23全部 GitHub-hosted jobs。Full acceptance包含 core verify、structure/docs/format/lint/types/build/unit/performance/architecture/UI/public pages/design tokens/clinic freeze、Firestore Emulator、all required E2E、supply-chain/secrets、SAST與 Verification evidence。
- **Visual Evidence Strategy:** 只新增新的 dated baseline（至少 owner指定的10個 desktop/mobile/flow scenarios）；不得修改、刪除或重新解釋2026-08-10及更早的 historical evidence。
- **Candidate/Deployment Strategy:** runtime與pre-deployment evidence完成且 exact SHA full-CI綠後凍結為 **C2**；另立 docs-only authority record後，僅以 process-scoped `CI=true`和 unchanged canonical Firebase predeploy從 exact C2部署到 `beauessence-clinic-staging`／`synthetic-review`、expiry `7d`，再跑 `verify:preview`。不得部署較後的 docs HEAD。
- **Rollback:** 每個 logical slice及其 evidence commit各自以 `git revert <sha>`反向回復；preview自動到期或依既有 runbook提前刪除 channel。禁止 amend/rebase/reset/force push/history rewrite。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **GOOGLE CALENDAR CONNECTED:** **NO**。
- **PAYROLL REACTIVATED:** **NO**。
- **NEW C2 FROZEN:** **NO — IMPLEMENTATION NOT STARTED**。

### OWNER ACCEPTANCE REFINEMENT — IMPLEMENTATION AND PRE-C2 EVIDENCE

- **Status:** **IMPLEMENTATION PASS; PRE-DEPLOYMENT EVIDENCE IN PROGRESS**。上方 BEFORE
  record 的 `IMPLEMENTATION NOT STARTED` 是開工當下的歷史狀態，不改寫；本節接續記錄實際結果。
- **Warm Theme Slice:** `1e3258a`、`a75425e`、`74e89b8`；GitHub run
  [`32356734975`](https://github.com/waydefu/clinic/actions/runs/32356734975) 全綠。
  Active non-frozen surfaces 預設 warm，clinic frozen files 未改。
- **Case Slice:** `be4eef2`、`d4619bc`、`0374ffa`；GitHub run
  [`32358394801`](https://github.com/waydefu/clinic/actions/runs/32358394801) 全綠。
  `CASE_MANAGEMENT` 僅在 synthetic workbench 恢復 discoverability、route、render 與受限
  mutation；`/case-assignments` 按 existing assignment 選擇 `ASSIGN_CASE` 或
  `REASSIGN_CASE`。Follow-up 的 semantic non-empty `managerId` 先做 Case action
  authorization，再做 `MANAGE_FOLLOW_UP`，然後才可 `recordFollowUp`／
  `assignCaseManager`，且只 save 一次。Denial 沒有局部 state／audit／outbox
  或 persisted-state 寫入。`PAYROLL_WORKLOAD` 仍 fail closed。
- **Weekly Calendar Slice:** `732489c`；GitHub run
  [`32359148847`](https://github.com/waydefu/clinic/actions/runs/32359148847) 全綠。
  週曆僅將 business hours、date exceptions、closures 投影為 schedule sessions，
  並呈現 actual synthetic appointments；empty state 不生成假 event cards。
  沒有 Google Calendar API、credential、worker 或 inbound sync。
- **Booking Context / Scroll Slice:** `6a816e6` 的第一次 run
  [`32359898488`](https://github.com/waydefu/clinic/actions/runs/32359898488) 只因
  `/patient.html` document 7.1 KiB 超過 7 KiB 失敗，正確分類為 introduced regression；
  沒有放寬 budget、更改 checker 或刪除 patient content。`c3a8ca8` 在不新增
  module edge 的情況下收旂，GitHub run
  [`32360319826`](https://github.com/waydefu/clinic/actions/runs/32360319826) 全綠含
  `check:perf`。結果為 true page top、無 initial auto-scroll，Step 2／3 顯示
  actual selected context。
- **Privacy Preservation Slice:** `0676aad`；GitHub run
  [`32360711873`](https://github.com/waydefu/clinic/actions/runs/32360711873) 全綠。
  Privacy 以 imported dialog 顯示，關閉後保留 Step 3、輸入、read status 與 focus，
  不導頁、不重建 application state。
- **Vendor Booking-only Slice:** `9ee84af06ea18b651d03b8292424de0d0d5dad18`；
  GitHub run [`32361248890`](https://github.com/waydefu/clinic/actions/runs/32361248890)
  全綠。`/booking` header 不含 `/clinic`、doctor、root workbench 或 internal
  navigation；vendor evaluation 只交付 `/booking`，目標為 official
  `/reservations/`。
- **Architecture / Guard Proof:** `scripts/check-architecture.mjs` 建立 actual static ESM
  graph，證明 patient／store 不可達 workbench-only scope policy，而 workbench 可達；
  `scripts/check-web-ui.mjs` 釘住 Case selectors 與 `CASE_MANAGEMENT=true`，同時要求
  Payroll selectors 缺席與 `PAYROLL_WORKLOAD=false`。Focused unit／E2E 直接測
  pre-mutation/no-partial-write、permission ordering、route/UI/render、privacy state、
  actual-event calendar 與 booking-only links；不只依賴 source string／regex。
- **Visual Evidence:** `c8e860f`新增 exact 10-scenario capture definition；第一批
  run [`32361769888`](https://github.com/waydefu/clinic/actions/runs/32361769888)
  雖完成 artifact，人工檢視發現 full-page sticky summary stitching artifact，因此
  **REJECTED AS EVIDENCE** 且未寫入 repository。`8376f58` 只修正 capture-only
  normalization；GitHub capture run
  [`32361992728`](https://github.com/waydefu/clinic/actions/runs/32361992728) job
  `96403401959` 產生第二批，10 張已逐張人工檢視、console errors／warnings
  均為 0。同 source 一般 PR run
  [`32361996691`](https://github.com/waydefu/clinic/actions/runs/32361996691)
  required jobs 與 Verification evidence 全綠。2026-08-10 與更早 visual evidence
  未修改。
- **Capture Workflow Disposition:** 因 local Windows 不是 acceptance runner，擷取期間曾在
  `verify.yml` 建立僅 `workflow_dispatch` 才可用的一次性 GitHub-hosted capture job；
  artifact 完成後該 workflow diff 已在 C2 前移除。Final branch 的 workflow 必須與
  `origin/main` 一致。
- **Current Pre-C2 Docs:** 新增 `ui-visual-baseline-2026-08-20.md` 與新日期資產
  目錄；owner／vendor 文件現先標示 exact C2 URL／expiry 為
  `PENDING DEPLOYMENT`；新增 owner-refinement synthetic-preview deployment record，
  不改寫舊 candidate C 部署紀錄。
- **C2 Freeze Gate:** 本 pre-deployment evidence commit 必須在 PR #23 的 core verify、
  performance、clinic 30-file freeze、unit、all E2E、Firestore、supply-chain、SAST
  與 Verification evidence 全綠後，才可凍結該 exact SHA 為 **C2**。
  部署只能來自 exact C2，不是後續 docs HEAD。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **PATIENT MODULE EDGE ADDED TO WORKBENCH POLICY:** **NO**。
- **PERFORMANCE BUDGET CHANGED:** **NO**。
- **GOOGLE CALENDAR CONNECTED:** **NO**。
- **PAYROLL REACTIVATED:** **NO**。
- **BOOK-MVP-004+ NEW WORK STARTED:** **NO**。
- **NEW C2 FROZEN:** **NO — SAME-SHA CI PENDING**。
- **Rollback:** 各個 implementation／test／evidence commit 分別 `git revert <sha>`；
  禁止 amend、rebase、reset、force push。

### OWNER ACCEPTANCE REFINEMENT — EXACT C2 FREEZE AND SYNTHETIC PREVIEW

- **C2:** `091ce0f732b32ad064d3694a26a219cc6e3687fe`
  (`style(docs): normalize refinement evidence endings`)。C2 包含全部 refinement runtime、
  tests／guards、pre-deployment owner／vendor docs 與 2026-08-20 新視覺證據；
  臨時 capture workflow 已移除，C2 的 `.github/workflows/verify.yml` 與
  `origin/main` 相同。
- **Remote Main:** 凍結與部署前以 GitHub API 再查仍為
  `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`。沒有 rebase、reset、
  cherry-pick PR #22 或部署較後 docs HEAD。
- **C2 Full CI:** run
  [`32362982753`](https://github.com/waydefu/clinic/actions/runs/32362982753)
  11/11 `success`；core `96406359507`、UI E2E `96406359547`、accessibility
  `96406359601`、Firestore `96406359670`、appointments `96406359717`、mobile
  `96406359738`、patient portal `96406359770`、supply-chain `96406359779`、
  auth/RBAC `96406359903`、SAST `96406360016`、Verification evidence
  `96407043254` 全部通過。
- **Core Detail:** structure 216 files、visual baseline 10 PNGs、clinic freeze 30 files、
  architecture／UI／public pages／design tokens／docs／format／types／lint／sync／
  performance 5 entrypoints 全 PASS；unit 64 files／1047 tests PASS，含 preserved
  `case-assignment.test.ts` 與 `payroll.test.ts`。Performance budget／checker／threshold
  未改。
- **Independent Diff Review:** Case authorization 先於 `recordFollowUp`／
  `assignCaseManager`／audit／outbox／`saveState`；Payroll policy 仍 `false`；patient／store
  module graph 不可達 workbench policy；週曆只使用 schedule 與 actual
  appointments；booking 無 initial scroll／clinic-internal header links，privacy 保留
  Step 3 state/focus。Workflow、lockfile、Firebase／Terraform config、RBAC／roles、
  Case／Payroll domain、old visual evidence 與 clinic frozen files均無 C2 branch delta。
- **Exact Deploy Worktree:**
  `F:\診所專案\tmp\book-mvp-c2-deploy-091ce0f` detached at exact C2；build／deploy／
  online verification 前後 `git status --short` 無 tracked modification。Source lockfile
  與 reused installed pnpm lock SHA-256 均為
  `7B0721E132B0A54DB574A35CF4D2C23B49E728BB012075B66B018E1F2CBB6E36`。
- **Operator / Target:** `wayde.fu@gmail.com`；Firebase CLI `15.18.0`；project
  `beauessence-clinic-staging` (number `781119800251`)；Hosting preview channel
  `synthetic-review`；requested expiry `7d`。
- **Execution:** 只在 deployment process 設定 `CI=true`，執行 unchanged canonical
  `firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging`。
  `firebase.json` predeploy `corepack pnpm run build` 保持啟用，完成 dependency
  reconciliation、workspace build、18 domain vendor file sync 與 76-file／52-hashed-file
  web build；沒有改 lockfile／config、替換 dist 或跳過 predeploy。
- **Hosting Result:** **PASS**。Release `1787224877406000`，version
  `5690ed4534b5a567` (`FINALIZED`)，release time `2026-08-20T11:21:17.406Z`
  (19:21:17 Asia/Taipei)。Firebase Authentication channel-domain sync warning 另行記錄；
  Authentication 未啟用或修改，Hosting release 已完成。
- **Preview:**
  <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app>；
  absolute expiry `2026-08-27T11:20:16.755922478Z`
  (19:20:16 Asia/Taipei)。
- **Online Verification:** exact-C2 worktree 以 process-scoped `CI=true` 執行
  `corepack pnpm verify:preview -- <url>`，於 `2026-08-20T11:22:14.397Z`
  取得 **463/463 PASS**，evidence commit 為 exact C2。檢查 deployed workbench／
  booking HTML、staging host、security／noindex headers、HTML no-cache、hashed
  assets 與 immutable caching。
- **Interactive Browser Limitation:** in-app browser control 在導航前連續三次因
  `failed to write kernel assets: path not found` 中止，包含先開 Codex browser
  tab 後的重試；web open 也被該 service 的 URL safety layer 拒絕。這是
  browser-tool environment limitation，不是 preview failure。依 owner 本機禁令
  沒有改跑本機 Playwright；此項不宣稱 PASS，並在 owner／deployment
  review 保留。Interactive／visual evidence 由 exact-C2 required E2E 與同一
  unchanged runtime 的 10 張 GitHub-hosted 人工檢視截圖支撐。
- **Dated Evidence:**
  `docs/reviews/2026-08-20-booking-mvp-owner-refinement-synthetic-preview-deployment.md`；
  先前 candidate C deployment 與 2026-08-10／更早 visual evidence 未改寫。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **AUTHORIZED SYNTHETIC HOSTING PREVIEW TOUCHED:** **YES — EXACT C2 RELEASE ONLY**。
- **LIVE HOSTING DEPLOYED:** **NO**。
- **BACKEND/FIRESTORE/FUNCTIONS/STORAGE/CLOUD RUN DEPLOYED:** **NO**。
- **REAL DATA USED:** **NO**。
- **CLINIC CHANGED:** **NO**。
- **GOOGLE CALENDAR CONNECTED:** **NO**。
- **PAYROLL REACTIVATED:** **NO**。
- **PR #23 MERGED:** **NO**。
- **Rollback:** preview 自動到期；需要提前下架時依 runbook 刪除
  `synthetic-review` channel。C2 與 post-deployment docs 分別 `git revert <sha>`；
  不 rebase／reset／force push。

## BOOK-MVP FINAL UI CORRECTION / C3 — BEFORE IMPLEMENTATION (2026-08-22)

- **Branch / PR:** `agent/book-mvp-003-b-redo`；PR #23 保持 open、未合併。PR #22
  已確認為 closed、未合併，沒有 cherry-pick、rebase 或重開。
- **Starting HEAD:** `8d19adffa9f37b8cb059e42cb31789cf68a0ef4e`；remote main
  `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282`；worktree clean。
- **Objective:** 完成既有 booking MVP 的最終合成 UI correction：Case 回診表單桌機欄位
  排列、日期欄週曆、病人端三步驟與獨立「查詢／取消預約」，再以同一 exact SHA
  全綠 CI 凍結 C3，僅部署授權的 staging Hosting preview。
- **Owner Decisions Applied to Synthetic MVP:** 病人端改為三個輸入步驟，成功為結果而非
  Step 4；查詢須以「電話＋生日」或「身分證／居留證／護照號碼＋生日」雙欄位驗證；
  自助取消只在距預約時間**嚴格大於 20 分鐘**時直接進入既有 canonical
  `cancelled` transition，等於 20 分鐘、19 分鐘或已過期皆拒絕並顯示診所電話。
- **Production Decision Boundary:** 上述 20 分鐘規則只屬 synthetic/local browser MVP；
  D-005 正式取消窗口仍為 pending，決策登錄中既有的「當日 10:00 前」輸入不改寫、
  不宣稱正式核准。D-007、D-008 與其他 production decisions 亦保持原狀。
- **In Scope:** `apps/web` 呈現與 browser-local store、既有 appointment state machine
  的 patient self-cancel adapter、focused unit/E2E/architecture/UI/performance guards、
  2026-08-22 新視覺證據、owner/vendor/execution/deployment docs 與 PR #23 說明。
- **Explicitly Out of Scope:** production backend／Firestore／Functions／Storage／Cloud Run、
  live Hosting、真實患者資料、Google Calendar、LINE/Meta integration、Payroll、
  BOOK-MVP-004+、30 個 clinic frozen files、CI workflow 或效能門檻放寬、PR merge。
- **Invariant / Risk Controls:** Case 權限檢查仍先於 mutation，失敗不得 partial write；
  Payroll 維持 fail closed；patient graph 不可達 workbench-only policy；拒絕或重複取消
  不得改 appointment、slot、audit、outbox 或 persisted state；成功取消只儲存一次並
  釋放 reservation；服務端時間不足或不可確認時 fail closed。
- **Planned Evidence:** structure／architecture／UI／public-page／format／type／lint／sync／
  performance、focused and full unit、browser-local E2E（desktop/mobile、privacy、theme、
  lookup/cancel boundary）、a11y、Firestore／appointments／supply-chain／SAST、clinic
  30/30 freeze；新 13-scenario captures 逐張人工檢視。
- **Deployment Gate:** 只有 exact prospective C3 的全部 required GitHub CI 同 SHA 全綠，
  並另行記錄 C3 deployment authority 後，才可由 exact C3 detached worktree 執行未更動的
  canonical predeploy，部署到 `beauessence-clinic-staging` 的 `synthetic-review` 7d
  preview；`CI=true` 只限該 process。
- **PRODUCTION RESOURCE TOUCHED:** **NO**。
- **REAL DATA USED:** **NO**。
- **NEW C3 FROZEN:** **NO — IMPLEMENTATION AND SAME-SHA CI PENDING**。
- **Rollback:** 每一個 logical slice 使用獨立 commit，必要時 `git revert <sha>`；禁止
  amend、rebase、reset、force push。preview 可等待到期或依 runbook 提前刪除 channel。

## BOOK-MVP FINAL UI CORRECTION / C3 — AFTER IMPLEMENTATION, BEFORE CANDIDATE FREEZE (2026-08-22)

- **Implemented Scope:** Case／follow-up 表單移除桌機巨大空白並在手機單欄重排；週曆改成
  七個日期欄、schedule-derived header 與 actual synthetic event cards；患者預約收斂為
  Step 1 類型項目、Step 2 單一 active date 的 full-width slots、Step 3 兩個語意欄，成功
  改為三步驟後結果。獨立查詢／取消流程只接受「電話＋生日」或「證件號碼＋生日」。
- **Cancellation Rule:** synthetic patient direct cancel 只有在 trusted application time 可判斷
  距開始時間嚴格大於 20 分鐘時才顯示確認並呼叫 canonical cancel transition；21 分鐘可取消，
  20／19 分鐘、已開始、已取消、非 active 或時間未知皆 fail closed，改顯示 canonical
  `02-2577-1314`。成功路徑只持久化一次並釋放 slot；拒絕及重複操作不改 appointment、
  slot、audit、outbox 或 persisted state。
- **Privacy / Identity:** 查無結果不揭示哪個欄位不符；結果只顯示查詢者操作所需的日期、
  時間、類型、項目、遮罩編號與狀態。privacy dialog 關閉後仍返回 Step 3，已填欄位、勾選
  與 read-status 保留，焦點回到 opener。
- **Files:** runtime 只變更既有 `apps/web` synthetic workbench／patient HTML、CSS、modules
  與 browser-local adapter；測試變更限於相關 unit／E2E／architecture／UI／capture guards。
  本輪新增 2026-08-22 reference evidence，未修改 30 個 frozen clinic files、Payroll、
  Firebase config、lockfile 或 production integration。
- **Logical Commits:** `4a828d5` workbench Case／週曆；`5592000` verified direct
  self-cancellation；`2b353ff` 三步驟 patient flow；`e04b827` final cancellation acceptance；
  `6a2ee4d` mobile／budget gate 修正。`9c6adb5` 記錄 BEFORE authority，`b9b7e14` 與
  `85c8cb9` 分別是 formatting 與一次性 visual-capture orchestration。
- **Introduced Failure Handling:** run
  [`32550738079`](https://github.com/waydefu/clinic/actions/runs/32550738079) 只發現兩個
  touched test files 的 Prettier 差異；run
  [`32551582162`](https://github.com/waydefu/clinic/actions/runs/32551582162) 只發現新測試的
  unbound-method lint；run
  [`32551803837`](https://github.com/waydefu/clinic/actions/runs/32551803837) 發現 patient
  document 7 KiB budget 邊界、375px header height 與兩個舊文字 locator。每次都只修正
  introduced defect，沒有放寬 workflow、performance、clinic freeze、security 或 test gate。
- **Green Runtime Evidence:** commit `b9b7e14` run
  [`32551027804`](https://github.com/waydefu/clinic/actions/runs/32551027804) 11/11 PASS；修正後
  commit `6a2ee4d` run
  [`32552109290`](https://github.com/waydefu/clinic/actions/runs/32552109290) 11/11 PASS；同一
  source commit `85c8cb9` 的一般 PR run
  [`32552271093`](https://github.com/waydefu/clinic/actions/runs/32552271093) 11/11 PASS。
- **Visual Evidence:** dispatch run
  [`32552601705`](https://github.com/waydefu/clinic/actions/runs/32552601705) 的
  `capture-ui` job `96981661065` 在 Linux Chromium 產生 13 張 current-date PNG 與 hash-bound
  manifest。13 個情境 console errors／warnings 均為 0、擷取前 page-level overflow assertion
  全過；逐張人工檢視沒有意外 clipping、重疊、巨大空白或層級錯誤，warm default 正確。
  一次性 dispatch input／job 已移除，final workflow 必須與 `origin/main` 相同。
- **Acceptance Coverage:** structure、docs、format、lint、types/build、architecture、UI、
  public pages、performance、clinic 30/30 freeze、unit、desktop/mobile／patient／appointments／
  auth-RBAC E2E、accessibility、Firestore Emulator、supply-chain／secrets、SAST 與
  commit-bound Verification evidence；final prospective C3 仍須在同一 SHA 再次全綠。
- **Production Authority:** synthetic `>20 minutes` 規則不取代 D-005。正式取消窗口仍
  `pending`，既有「當日 10:00 前」只保留為未核准 input；本輪沒有 production API、
  Firestore、Functions、Storage、Cloud Run、Authentication、Calendar、live Hosting 或真實資料。
- **Deployment State:** **NOT DEPLOYED**。只有 final prospective C3 same-SHA 11/11 全綠，
  並另以 docs-only commit 記錄 exact C3／project／channel／expiry／operator／owner authority
  後，才可由 detached exact-C3 worktree 部署 Hosting preview。
- **NEW C3 FROZEN:** **NO — CURRENT EVIDENCE CHANGES REQUIRE FINAL SAME-SHA CI**。
- **PR #23 MERGED:** **NO**。
- **Rollback:** runtime／tests／evidence 依上述 logical commits 逐一 `git revert <sha>`；
  不 amend、rebase、reset 或 force push。尚無 C3 cloud release 需要 rollback。
