# 第一階段 Booking MVP 施工日誌與決策清冊 (Execution Log)

**建立日期：** 2026-08-19 (Asia/Taipei)  
**基準 Commit SHA：** `ea3316e027ab675dde564419412f979aa0e57f68`  
**初始狀態：** `main` 分支，工作區乾淨，無未追蹤或未提交變更。

---

## 施工準則與六大修正記錄 (Orientation Directives)

依據 2026-08-19 專案負責人指示，本輪施工確立並強制執行以下核心原則：

1. **Calendar 現況定性**：Outbound Google Calendar「本機架構與 Client 已完成，尚無真實 Calendar 連線、部署 Worker 與 Production 驗證」。
2. **Calendar 雙向同步邊界 (BOOK-MVP-007)**：現階段僅允許 Calendar 雙向同步的規格／治理／文件對齊；ADR-0006 未接受、D-009/D-016 未核准前，**嚴禁實作任何 inbound webhook、syncToken 輪詢、API route 或回寫邏輯**。
3. **診所首頁 `/clinic` 絕對凍結**：`/clinic` 實際 HTML / CSS / JS / assets 全面 Freeze；允許新增或修改純 regression / freeze guard 測試，但**絕不得改變首頁 baseline 或任何外觀與邏輯**。
4. **統一 Step ID 與追蹤對照**：BOOK-MVP-001 ～ 009 統一編號，禁止編號漂移。每個 Step 獨立記錄 Before / During / After，獨立 Commit；PR 依邏輯單元整合。
5. **Booking Preview 網址宣告**：Booking Preview 尚無有效遠端 URL，廠商評估文件（Vendor Package）標示為 `PENDING DEPLOYMENT`，**嚴禁引用已過期或未經授權的舊 URL**。待取得本次明確部署授權並完成部署後，方得寫入實際 URL 與到期日。
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
| **BOOK-MVP-003** | Frozen Modules Isolation | 對個管、薪資、手術擴充設置 disabled-by-default 與邊界防護 | PENDING |
| **BOOK-MVP-004** | Booking Preview Independent Validation | 驗證 `/booking` 流程、Synthetic PII 邊界與無障礙／響應式基準 | PENDING |
| **BOOK-MVP-005** | Web Vendor Evaluation Package | 撰寫 `docs/integration/booking-web-vendor-evaluation.md` 評估包 | PENDING |
| **BOOK-MVP-006** | Frontend Assets Payload Report | 量測 JS/CSS/Assets 原始、gzip、brotli 大小並記錄報告 | PENDING |
| **BOOK-MVP-007** | Calendar Alignment (Spec & Governance) | 規格層對齊 Outbound 狀態與 Inbound 待審衝突流程（無 code 回寫） | PENDING |
| **BOOK-MVP-008** | Documentation & Authority Sync | 同步更新 `AGENTS.md`、`README.md`、`roadmap.md` 等權威文件 | PENDING |
| **BOOK-MVP-009** | Full Verification & Evidence Gate | 執行全套靜態檢查、單元測試、Emulator Rules 與 E2E 驗證 | PENDING |

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
| `patient-identity.ts` | **FOUNDATION** | Booking + Case 共用患者比對 |
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

## BOOK-MVP-003-B: Frozen Capability Isolation (Case Management / Payroll Workload)

### BOOK-MVP-003-B-1: Capability Gate Foundation

#### Before
- **Timestamp:** 2026-08-19 (Asia/Taipei; exact start time not recorded)
- **Branch:** `agent/book-mvp-003-b-isolation`
- **Baseline SHA:** `3a3b7859e0a46c0549d3d1d4c7f32293c1cd9282` (origin/main, PR #21 merged)
- **Objective:** 建立 frozen capability 旗標的單一來源，Phase 1 只存在「預設關閉」一種狀態。
- **Scope:** 新增 `apps/web/public/modules/capability-flags.js`。
- **Non-Scope:** 不修改任何 UI / runtime 行為；不修改 `constants.js`；不建立任何執行期覆寫管道。

#### During
- 新增 `apps/web/public/modules/capability-flags.js`：
  - `CASE_MANAGEMENT_ENABLED = false`
  - `PAYROLL_WORKLOAD_ENABLED = false`
  - 具名 `export`、模組層級 `const`（不可重新賦值）；僅設定了 fail-closed 值。
  - 無 query / localStorage / window / import.meta.env / 遠端 config / feature-flag UI。

#### After
- **Tests:**
  - `check:lint`: PASS
  - `test:unit`: PASS (62 檔, 1029 測試)
  - `check:structure`: PASS (216 檔; visual baseline 10 PNG)
  - `check:architecture`: PASS (3 層、11 筆、單一來源)
  - `check:clinic-freeze`: PASS (30 檔)
- **CI Status:** `NOT RUN / NOT AVAILABLE`（本機驗證通過）
- **Result:** PASS
- **Commit SHA:** `6e3f9b7`（`feat(scope): BOOK-MVP-003-B add frozen capability gates`）
- **Rollback:** `git revert 6e3f9b7`

### BOOK-MVP-003-B-2: Runtime Mutation Isolation (store.js)

#### Before
- **Timestamp:** 2026-08-19 (Asia/Taipei; exact start time not recorded)
- **Branch:** `agent/book-mvp-003-b-isolation`
- **Baseline SHA:** `6e3f9b7`（003-B-1 完成後）
- **Objective:** 在合成 API 層 fail-closed 阻斷 case-management mutation，且維持回診指示本身不受影響。
- **Scope:** 僅修改 `apps/web/public/store.js` 兩條 mutation path。
- **Non-Scope:** 不修改 `case-management.js` domain、不修改權限模型、不修改其他 path。

#### During
- `stagingRequest` 新增 `CASE_MANAGEMENT_ENABLED` 匯入。
- `POST /case-assignments`：在 `requirePermission` 之前加 `if (!CASE_MANAGEMENT_ENABLED) throw new Error('個管指派功能已凍結，無法指派個管師。')`。
- `POST /follow-ups/:id`：**在任何 mutation 之前**檢查——`!CASE_MANAGEMENT_ENABLED && managerId 為非空字串` 即 throw，避免「回診成功、個管半失敗」的非原子狀態；正常 follow-up（無 managerId）流程完全不受影響。

#### After
- **Tests:**
  - `check:lint`: PASS
  - `test:unit`: PASS (62 檔, 1029 測試)
- **CI Status:** `NOT RUN / NOT AVAILABLE`
- **Result:** PASS
- **Commit SHA:** `0a54a24`（`feat(scope): BOOK-MVP-003-B isolate case/payroll mutations`）
- **Rollback:** `git revert 0a54a24`

### BOOK-MVP-003-B-3: UI Isolation (index.html / admin-view.js / admin-bootstrap.js)

#### Before
- **Timestamp:** 2026-08-19 (Asia/Taipei; exact start time not recorded)
- **Branch:** `agent/book-mvp-003-b-isolation`
- **Baseline SHA:** `0a54a24`（003-B-2 完成後）
- **Objective:** 把凍結能力的動態與靜態 UI 入口全部隔離：flag=false 時不得有可發現的
  個管指派／月度工作量入口，也不准在渲染層產生任何個管 UI。
- **Scope:** 僅修改 `apps/web/public/index.html`、`modules/admin-view.js`、
  `admin-bootstrap.js`、`modules/workspace-tabs.js` 以外的守衛與測試（見 003-B-4）。
- **Non-Scope:** 不修改權限模型、不修改 `case-management.js` domain、不修改 API。

#### During
- `index.html`：移除 workspace nav「個管指派」、overview 摘要卡「查看個管」與「查看
  統計」、整個 `<section id="case-section">` 區塊；meta description 與首頁說明文案
  同步移除「個管」。
- `admin-view.js`：匯入 `CASE_MANAGEMENT_ENABLED`／`PAYROLL_WORKLOAD_ENABLED`。
  - `renderTasks`：旗標關閉時濾掉 `pendingCaseAssignments` 動態 task（其餘待辦照常）。
  - `renderFollowUps`：旗標關閉時完全不渲染個管下拉/唯讀欄（不提供 discoverable
    入口，也不會在送表單時帶出 managerId）。
  - `renderCaseAssignments`／`renderWorkload`：fail-closed——旗標關閉時立即 return ''。
- `admin-bootstrap.js`：`#case-section` 等節點已移除，所有對該節點的存取與事件綁定
  改為先檢查節點存在（避免誤觸不存在節點）。
- **測試更新：** 移除此前依賴個管 UI 的測試，改為凍結行為測試：
  - `workbench-lifecycle.spec.ts`：新測試驗證「無 UI 入口、mutation 拒絕且狀態不變」
    （POST /case-assignments 與 /follow-ups/:id＋managerId 都回「凍結」且 state 完全
    不變）。
  - `role-maintenance-responsive.spec.ts`：櫃台可照常登錄回診；個管節點不存在；
    POST /case-assignments 回「凍結」（不是「權限」）。
  - `affordance.spec.ts`／`mobile-layout.spec.ts`：工作區掃描清單移除 `#case-section`。
  - `current-ui.spec.ts`：移除 case-assigned-workload 截圖情境；視覺基線減為 9 張
    （manifest、PNG、check-structure required scenarios、`ui-visual-baseline-2026-08-10.md`
    、`ui-ux-rules.md` §5.5 同步更新）。
  - `check-web-ui.mjs`：守衛改為讀取 capability-flags.js——旗標 false 時要求 admin
    shell **不得**出現「個管指派與工作量」文案、store 必須含凍結守衛文案。

#### After
- **Tests:**
  - `check:structure`: PASS (216 檔; visual baseline 9 PNG)
  - `check:lint`: PASS
  - `check:docs`: PASS (133 檔)
  - `check:ui`: PASS
  - `check:clinic-freeze`: PASS (30 檔)
  - `check:architecture`: PASS
  - `check:types`：PASS（build 成功）
  - `test:unit`: PASS (62 檔, 1029 測試)
  - `test:e2e`（targeted）：PASS——affordance、role-maintenance、workbench-lifecycle
    47 筆 chromium + mobile-layout 28 筆 mobile-device 全綠
  - `check:perf`：`/patient.html` document 7.0 KiB vs 預算 7 KiB 超標——確認為基線既存
    （stash 後於 baseline 重跑同為失敗），非本 slice 引入。
- **CI Status:** `NOT RUN / NOT AVAILABLE`（未 push）
- **Result:** PASS
- **Commit SHA:** `5baab61`（`feat(scope): BOOK-MVP-003-B isolate frozen case/payroll UI`）
- **Rollback:** `git revert 5baab61`

### BOOK-MVP-003-B-4: Route Guard (workspace-tabs.js)

#### Before
- **Timestamp:** 2026-08-19 (Asia/Taipei; exact start time not recorded)
- **Branch:** `agent/book-mvp-003-b-isolation`
- **Baseline SHA:** `5baab61`（003-B-3 完成後）
- **Objective:** 凍結能力深連結不得殘留——直接以 `#case-section` 開頁要導回 `#overview`，
  且不顯示權限類型的拒絕訊息（不是「沒有權限」）。
- **Scope:** 僅修改 `apps/web/public/modules/workspace-tabs.js`。
- **Non-Scope:** 不修改權限模型、不建立新的權限訊息。

#### During
- 匯入 `CASE_MANAGEMENT_ENABLED`，建立 `FROZEN_PANEL_IDS`（旗標為 true 時集合為空，
  隔離與旗標狀態耦合，能力恢復時路由自然回歸）。
- `resolvePanelId`：`raw` hash 命中凍結工作區時，`replaceState` 改寫為
  `#overview` 並直接回傳 `DEFAULT_PANEL`——刻意不走 `deniedHandler`，因為凍結不是
  權限拒絕。
- 檔頭註解內的深連結範例由「#case-section」改為「#schedule-section」。
- **測試：** `workbench-lifecycle.spec.ts` 凍結測試新增第 1b 步——`goto('/#case-section')`
  後 URL 回到 `#overview` 且 overview 標題可見。

#### After
- **Tests:**
  - `check:lint`: PASS
  - `check:ui`: PASS
  - `check:architecture`: PASS
  - `test:e2e`（targeted）：PASS——workbench-lifecycle.spec.ts 23 筆 chromium 全綠
    （含新加的 #case-section 深連結導回 #overview 斷言）
- **CI Status:** `NOT RUN / NOT AVAILABLE`
- **Result:** PASS
- **Commit SHA:** `0c0e80a`（`feat(scope): BOOK-MVP-003-B add frozen workspace route guard`）
- **Rollback:** `git revert 0c0e80a`

### BOOK-MVP-003-B-5: Architecture Reachability Guard (check-architecture.mjs)

#### Before
- **Timestamp:** 2026-08-19 (Asia/Taipei; exact start time not recorded)
- **Branch:** `agent/book-mvp-003-b-isolation`
- **Baseline SHA:** `0c0e80a`（003-B-4 完成後）
- **Objective:** 把「凍結工作區不得有未受旗標保護的入口」從 check:ui 的單一入口檢查
  擴成對整個 `apps/web/public` 的靜態可達性守衛。
- **Scope:** 僅修改 `scripts/check-architecture.mjs`。
- **Non-Scope:** 不修改 check:ui（兩道守衛互補，不互相取代）。

#### During
- 新增規則 4「frozen-capability」：
  1. `capability-flags.js` 必須以字面值布林宣告 `CASE_MANAGEMENT_ENABLED` 與
     `PAYROLL_WORKLOAD_ENABLED`。
  2. 旗標為 false 時，任何瀏覽器檔案引用凍結工作區路由 id（`case-section`）都必須
     在同一份檔案裡引用對應旗標；未受旗標保護的引用即為新入口，擋下。
  3. 旗標為 false 時，`index.html` 不得含有該工作區的 `href` 或 `id` 靜態入口。
- 守衛本身（capability-flags.js）豁免於規則 2 的旗標引用要求。
- 以 theme.js 暫時插入未受保護的 `case-section` 引用做負面驗證，確認守衛確實觸發，
  隨即還原。

#### After
- **Tests:**
  - `check:architecture`: PASS（含負面目測驗證）
  - `check:lint`: PASS
  - `check:ui`: PASS
- **CI Status:** `NOT RUN / NOT AVAILABLE`
- **Result:** PASS
- **Commit SHA:** `3b4da19`（`feat(scope): BOOK-MVP-003-B add frozen capability reachability guard`）
- **Rollback:** `git revert 3b4da19`

### BOOK-MVP-003-B-6: PR #22 Review Findings

#### Before
- **Timestamp:** 2026-08-20（Asia/Taipei）
- **Branch:** `agent/book-mvp-003-b-isolation`
- **Baseline SHA:** `0d41081`（006 完成、PR #22 已開）
- **Trigger:** PR #22 CI 第一個 job（verify）紅燈——`prettier --check` 報 6 個檔案格式不合規；review 另指出四個 findings：改寫 2026-08-10 dated visual baseline 證據、frozen-capability 守衛只憑 `source.includes(flag)`、PR body 宣稱 synthetic data model／state projection 全部移除（與「domain／state 保留」的實際邊界不符）。
- **Objective:** 只修 review findings，不新增功能、不重新設計 BOOK-MVP-003-B。
- **Scope:** Prettier 修正、baseline 證據還原＋另立新基線、check-architecture 規則 4 強化、PR body 修正。
- **Non-Scope:** 不修改 domain／contracts／RBAC／worker／clinic、不修改 performance threshold、不開始 BOOK-MVP-004。

#### During
1. **Prettier（6 檔）**：`apps/web/public/index.html`、`modules/capability-flags.js`、`store.js`、`scripts/check-architecture.mjs`、`scripts/check-web-ui.mjs`、`tests/e2e/workbench-lifecycle.spec.ts` 以 `prettier --write` 修正，皆為純格式（補檔尾換行、拆過長條件式、單行合併）。
2. **恢復 2026-08-10 dated evidence**：`ui-visual-baseline-2026-08-10.md`、`manifest.json`、`workbench--case-assigned-workload--desktop-1280x900--light.png` 從 `origin/main` 原樣還原（十張 PNG、含 case-assigned-workload，逐位元組未動）。
3. **新現行基線 2026-08-20**：`current-ui.spec.ts` 的 `CAPTURE_DATE` 改為 2026-08-20；`capture:ui` 新擷九張 PNG＋manifest 到 `docs/reviews/assets/ui-visual-baseline-2026-08-20/`；新增 `docs/reviews/ui-visual-baseline-2026-08-20.md`；`check-structure.mjs` 的 `visualBaselineDirectory` 與 required paths 改釘 08-20（08-10 兩份文件＋manifest 仍列為 required）；docs/README.md 索引與 ui-ux-rules.md §5.5 同步指到 08-20。九張圖與 08-10 逐張 SHA 全不同——環境從 Windows 11（10.0.22631）換成 Windows 10（10.0.19045），系統字型渲染差異，documented 為預期環境差異。
4. **check-architecture 規則 4 強化**：比對前先 `stripComments`（註解裡的旗標名稱不算守衛）；新增純函式 `hasFailClosedCapabilityGuard`（architecture-rules.mjs），對三個實際邊界檔案（`workspace-tabs.js`、`store.js`、`admin-view.js`）要求真的 fail-closed 分支——`!FLAG`（mutation guard、凍結時不渲染 return ''）或 `FLAG ?`（FROZEN_PANEL_IDS 三元）；`??` nullish 不算分支。其他引用檔案維持「程式碼裡檢查旗標」要求。
5. **測試新增 8 筆**：architecture-rules.test.mjs 補 `hasFailClosedCapabilityGuard` 正／反面案例（negated、ternary、bare name、comment-only、string literal、nullish coalescing、多旗標 any-of、route-owner 同型寫法），35→43。
6. **PR body 修正**：刪除「synthetic data model／state projection 全部移除」宣稱，改為 domain／state preserved；UI／route／render／mutation isolated。

#### After
- **Tests:**
  - `pnpm verify`：全部 PASS，唯一失敗是既有 `check:perf` `/patient.html` 7.0 KiB vs 7 KiB budget（2026-08-10 起已存在於 main；patient.html 最後一次更動為 main 的 `6e0713f`；依 review 指示不修、不改 threshold）
  - `check:structure`: PASS（218 files；現行基線 2026-08-20 九張；2026-08-10 十張 dated evidence 原樣保留）
  - `check:docs`: PASS（134 files）
  - `check:architecture`: PASS（規則 4 強化後，三個邊界檔案以 fail-closed 分支通過）
  - `test:unit`: PASS（62 files、1037 tests，含 architecture-rules 43 筆）
  - `check:format`: PASS
  - `capture:ui`（2026-08-20）: PASS——九個情境 console error／warning 均為 0、無水平 overflow
- **CI Status:** 重新 push 後觀察 PR #22 required CI
- **Result:** PASS
- **Commit SHA:** 預期新增一筆 fix commit（繼 `0d41081` 之後）
- **Rollback:** `git revert <fix commit>`（fix 只動守衛與證據，不觸凍結能力邊界）
