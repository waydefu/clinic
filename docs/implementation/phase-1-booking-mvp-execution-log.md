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
- **測試指令:** `corepack pnpm run check:clinic-freeze; corepack pnpm run check:structure; corepack pnpm run test:unit`
- **測試結果:** PASS (check:clinic-freeze 30 檔通過, check:structure 216 檔通過, test:unit 62 檔 1029 測試全過)
- **CI Status:** `NOT RUN / NOT AVAILABLE` (本機驗證通過；本步驟產物尚未推送到 remote/PR，待 GitHub Actions 執行後記錄正式 CI Evidence)
- **CLINIC HOMEPAGE CHANGED:** **NO** (30 個首頁相關檔案無任何位元組修改)
- **最終狀態:** **PASS**
