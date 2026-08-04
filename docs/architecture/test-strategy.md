# 測試策略

**狀態：** 現行權威（既有層級）＋ plan-only（尚未存在的分組與層級）。

**撰寫日期：** 2026-08-04

本文件把既有的測試層級與 [前端與供應鏈品質把關](web-quality-gates-2026-07-24.md)
所定義的 gate 整理成一份策略，並標示哪些層級尚未存在。

---

## 1. 測試層級

| # | 層級 | 現況 | 執行方式 |
| --- | --- | --- | --- |
| 1 | Unit tests | ✅ 59 檔 915 測試 | `pnpm test:unit`（vitest） |
| 2 | Firestore Emulator rules tests | ✅ | `pnpm test:rules`（需 JDK 21） |
| 3 | Cloud Functions integration tests | ❌ **不存在** | 無 Functions 可測（只掛 `/v1/health`） |
| 4 | Playwright desktop E2E | ✅ | `pnpm test:e2e` |
| 5 | Playwright mobile E2E | ✅ 部分 | `mobile-layout`、`responsive` |
| 6 | axe 無障礙 | ✅ | `accessibility.spec.ts` |
| 7 | RBAC 直連 URL 測試 | ⚠️ 部分 | `delegated-deletion`、`role-maintenance-responsive` |
| 8 | Google Calendar sync tests | ⚠️ 僅假服務 | Emulator 內的 outbox／死信演練 |
| 9 | Offline／retry／idempotency | ✅ | outbox 重試、冪等鍵、`api-client` 錯誤映射 |
| 10 | Visual regression | ⚠️ 參考基線 | 十張截圖＋SHA-256 manifest，**非跨 OS 像素 gate** |

第 3 項值得說明：**沒有 Cloud Functions 可以測，因為一個都沒部署。** 這一層要等
C1～C6 slice 取得 deployment authority 之後才有意義。

第 10 項的限制是刻意的：跨作業系統的像素比對會因字型渲染差異持續誤報，因此
[2026-07-28 UI 視覺基線](../reviews/ui-visual-baseline-2026-07-28.md) 定位為
**參考證據**，不是阻擋性 gate。

---

## 2. E2E 分組

### 2.1 現行六組（2026-08-04 起）

`e2e` 為 matrix job，PR 上呈現為六個獨立 check。分組定義的唯一真實來源是
[`scripts/e2e-groups.mjs`](../../scripts/e2e-groups.mjs)。

| 分組 | Spec | 測試數 |
| --- | --- | --- |
| `e2e-auth-rbac` | delegated-deletion、role-maintenance-responsive | 20 |
| `e2e-appointments` | week-calendar、workbench-lifecycle | 32 |
| `e2e-patient-portal` | clinic-site、patient-booking、privacy-policy | 35 |
| `e2e-mobile` | mobile-layout、responsive | 53 |
| `e2e-accessibility` | accessibility、manual-accessibility-preconditions、no-script | 17 |
| `e2e-ui` | affordance、clinic-motion、performance、theme、typography | 34 |

合計 191，與拆分前相同。

### 2.2 目標八組與現行六組的差異

負責人 2026-08-04 指定的目標分組為：`auth-rbac`、`appointments`、`follow-up`、
`surgery`、`patient-portal`、`calendar-sync`、`mobile`、`accessibility`。

| 目標分組 | 現況 | 何時建立 |
| --- | --- | --- |
| `follow-up` | 回診測試目前散在 `workbench-lifecycle` 內 | 回診 spec 拆出時 |
| `surgery` | **無任何 spec**；手術功能未實作 | P4，D-014 核准後 |
| `calendar-sync` | 同步測試目前在 Emulator 層，非 E2E | P3，D-009／D-016 核准後 |
| `ui` | 目標清單未涵蓋，但有 5 支 spec 需要歸屬 | 已建立，**必須保留** |

**空的 job 不建立。** 一個永遠綠燈的 `e2e-surgery` 會讓人以為手術流程有測試覆蓋，
比沒有這個 job 更危險。功能實作時才建立對應分組。

### 2.3 分組漂移防護

拆成多個 job 後多了一個單一 job 沒有的失敗模式：**新增的 spec 沒被分進任何一組，
於是不再執行，而 CI 仍然全綠。** 漏跑的測試看起來和通過一模一樣。

`check:e2e-groups`（接在 `pnpm verify` 內）驗證三件事：每支 spec 剛好屬於一組、
清單裡的檔案都存在、workflow 的 matrix 組名與清單一致。新增分組時必須同時更新
`scripts/e2e-groups.mjs` 與 workflow 的 matrix，否則 gate 會擋下來。

---

## 3. 角色測試

每個角色都需要一組**直連 URL** 測試：以該角色登入後，直接輸入其他角色的工作區
網址，必須被擋下且不洩漏資料。

前端隱藏不算通過。驗收標準是：

1. Router guard 擋下導覽；
2. API 回傳授權失敗；
3. 回應**不因目標是否存在而不同**（避免 NOT_FOUND enumeration oracle）；
4. 稽核紀錄有這次被拒絕的嘗試。

完整矩陣見 [角色權限矩陣](rbac-matrix.md) §6。目前 `e2e-auth-rbac` 只涵蓋委派刪除與
角色維護頁，五個角色的完整交叉測試尚未建立——這是 P0 的工作項。

---

## 4. 行動版 viewport 矩陣

| 尺寸 | 現況 |
| --- | --- |
| 320 × 568 | ✅ 已測 |
| 360 × 800 | ❌ 新增 |
| 390 × 844 | ✅ 已測（診所官網） |
| 412 × 915 | ❌ 新增 |
| 430 × 932 | ❌ 新增 |
| 768 × 1024 | ❌ 新增 |

六個尺寸全部納入 `e2e-mobile`。詳見 [行動版 UX 規劃](../design/mobile-ux-plan.md) §7。

---

## 5. 無障礙

三個層級，**不可互相取代**：

| 層級 | 工具 | 現況 |
| --- | --- | --- |
| 自動掃描 | axe-core | ✅ 無 Critical／Serious |
| CSS 回歸預檢 | Playwright `forcedColors: active` | ✅ |
| 人工實測 | 螢幕閱讀器、強制色彩、鍵盤、縮放 | ❌ **從未執行** |

第三層有備妥的 [runbook](../runbooks/manual-accessibility-test.md)，但尚未有人執行過。
依 [文件生命週期規則](../document-lifecycle.md) §4：**自動 axe 成功不等於螢幕閱讀器
與人工驗收成功。** 這一項不得在任何驗收條件中被自動 gate 取代。

---

## 6. CI gate

| Job | 內容 | 阻擋 |
| --- | --- | --- |
| `verify` | 結構、架構、UI 邊界、頁面、tokens、文件、E2E 分組、secrets、格式、型別、lint、同步、效能預算、單元測試 | ✔ |
| `rules` | Firestore Emulator | ✔ |
| `e2e-*`（6 個） | Playwright ＋ axe | ✔ |
| `supply-chain` | tracked secrets、dependency audit、SBOM、授權政策 | ✔ |
| `evidence` | 綁定 commit 的驗證證據 | ✔ **唯一的 branch protection required check** |
| `sast`（獨立 workflow） | Semgrep | — |

`evidence` 是 `main` 上唯一的 strict required check。它把上述四個 job 的結果綁定
commit SHA 與 run，任一不是 success 就是 failure，包含「沒有回報結果」。

**CodeQL 已於 2026-08-01 被 Semgrep 取代**，見
[SAST 遷移紀錄](../reviews/2026-08-01-sast-migration-and-audit-governance-delivery.md)。
任何提到「修正 CodeQL 問題」的規劃都是基於過期資訊。

---

## 7. 每個階段的測試要求

新增功能時，下列問題必須在 PR 描述中有答案：

1. 這個變更屬於哪一個 E2E 分組？若需要新分組，`e2e-groups.mjs` 是否已更新？
2. 涉及角色嗎？是否有直連 URL 測試？
3. 涉及行動版嗎？六個 viewport 是否都測過？
4. 涉及外部效果嗎？是否走 outbox、是否冪等？
5. 新增了受決策阻擋的能力嗎？`unrouted-inventory.json` 的 blocker 是否已登記？

第 5 點由 `check:architecture` 強制執行，不是靠自律。

---

## 8. 相關文件

- [前端與供應鏈品質把關](web-quality-gates-2026-07-24.md) — 各 gate 的細節與效能預算
- [角色權限矩陣](rbac-matrix.md) — 角色測試矩陣
- [行動版 UX 規劃](../design/mobile-ux-plan.md) — viewport 驗收
- [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md)
- [2026-07-28 UI 視覺基線](../reviews/ui-visual-baseline-2026-07-28.md)
- [2026-08-01 gate 覆蓋率檢討](../reviews/2026-08-01-gate-coverage-tw-01-05.md)
