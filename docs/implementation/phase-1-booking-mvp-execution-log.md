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
| **BOOK-MVP-002** | Clinic Homepage Freeze Guard | 建立 `/clinic` 靜態檔案清單防護測試與零回歸驗證 | PENDING |
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
- **Commit SHA:** `e96520cab865677046b60f523c6c9895d3b7c738`
- **測試指令:** `corepack pnpm run check:docs; corepack pnpm run check:structure; corepack pnpm run test:unit`
- **測試結果:** PASS (check:docs 133 檔全過, check:structure 214 檔全過, test:unit 61 檔 1025 測試全過)
- **Security Check:** 零機密資料、零真實個資、零 Production 憑證。
- **最終狀態:** **PASS**
