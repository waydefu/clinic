# 企業級全面審查（2026-08-06）

**狀態：** 有日期的審查證據。本文記錄**當天實跑了什麼、查到什麼、改了什麼、還剩什麼**，
不取代 `roadmap.md`、Phase 1 執行計畫、決策登錄、ADR 或 runbook。

> **為什麼不是 `docs/AUDIT-2026.md`。** 委託書指定把結果集中到 `docs/AUDIT-2026.md`。
> 改放 `docs/reviews/` 的理由是[文件生命週期規則](../document-lifecycle.md)§1：本文
> 是「證明某日期、某 commit 做過什麼」的日期證據，不是現行權威。放在 `docs/` 根層
> 會讓它看起來像持續有效的結論，而下個月它就過期了——那正是該規則要防的事。
> 委託人已於當日裁決「在現有治理下整併」，此處依該裁決辦理。

---

## 1. 主管摘要

**這套系統目前不適合正式使用，而且它自己知道。** `apps/api` 只掛 `/v1/health`
一條路由，Firestore 全域 `allow read, write: if false`，沒有雲端後端、沒有
Authentication、沒有日曆連線、沒有真實病患資料；Stage 2 閘門 C0 為 `revise`、
C1～C6 全部 `pending`、六個 deployment authority 全部 `not_granted`。這不是缺陷，
是刻意且由機器強制的狀態。

因此本次審查的重點不在「找出上線阻擋」——那份清單已經存在且被 CI 把關——而在
**驗證那道把關本身擋不擋得住**。答案是：原本擋不住。

### 最大三項風險

| # | 風險 | 狀態 |
|---|---|---|
| 1 | **可達性閘門可被繞過**：整個「被決策擋住的能力到不了」的論述靠 `check:architecture` 的可達性走訪，而它以 regex 解析 import，六種寫法可繞過。已實證：加一行計算式 `import(target)` 後 gate 全綠，而檔案實際在執行期被載入。 | **已修**（Finding A-1） |
| 2 | **角色定義三方分歧**：瀏覽器 2 個、伺服器 7 個、D-006 核准 3 個、業主需求 5 個，且醫師與諮詢師在兩份程式碼裡都不存在。金額可見性與患者端欄位過濾都蓋在這之上。 | **伺服器端已收斂**，瀏覽器端未做（Finding R-1） |
| 3 | **手機版缺乏真正的行動裝置測試**：唯一的 Playwright project 是 Desktop Chrome，所有「手機版」測試都是縮小的桌機視窗，無 touch、無行動 UA。五處 `@media (hover: hover)` 的無 hover 分支從未被執行。 | **已修**（Finding M-1） |

### 本次已完成

四個 commit，全部附實跑證據：品牌圖響應式與首屏資訊（`96dabf2`）、閘門
fail-closed（`79609e6`）、伺服器角色收斂（`79272ed`）、本報告。

### 尚未完成（明確列出，未悄悄略過）

- **2026 標準來源矩陣（18＋權威來源）完全未做。** 本次沒有執行任何外部查證。
  報告中所有結論都來自本 repository 的程式碼與實跑，沒有一條引用外部標準文件。
  委託書要求的 §三（多來源查證）視為**未履行**，詳見 §7。
- 瀏覽器端角色改名、RBAC 六處落實的其餘五處、Domain 深度審查、109 份文件整併。

---

## 2. 審查範圍

| 項目 | 值 |
|---|---|
| Repository | `github.com/waydefu/clinic` |
| 本機路徑 | `D:\診所專案\beauessence-appointment-platform-fresh` |
| 起始 branch／commit | `ci/bump-actions-to-node24` @ `7d8a4ef`（領先 `main` 3 個 commit） |
| 審查分支 | `claude/audit-fix-docs-2026` |
| 起始工作區 | 乾淨，無未提交修改 |
| 日期 | 2026-08-06 |
| 規模 | 420 追蹤檔、109 份 Markdown、pnpm monorepo |

**可存取：** 本機完整 repository、全部測試與 gate、Firestore Emulator。
**無法存取：** GitHub Actions 實際執行結果、`beauessence-clinic-staging` 雲端專案、
production（不存在）、CodeQL／Semgrep 的雲端 finding。本報告不對這些做任何推論。

> **委託書的前提落差。** 委託書預期找出 Firebase Rules 過寬、Calendar 同步缺
> idempotency、正式資料外洩、患者費用外流等問題。這些在本專案**均不成立**：
> Rules 全域拒絕、Calendar 未連線、沒有正式資料、金額功能未實作。約六成檢查項
> 無標的。

---

## 3. 實跑證據

全部在 `claude/audit-fix-docs-2026` 上實際執行，非引用。

| 指令 | 修改前 | 修改後 |
|---|---|---|
| `corepack pnpm verify`（15 道 gate） | exit 0，59 檔／**915** 測試 | exit 0，60 檔／**939** 測試 |
| `corepack pnpm test:e2e` | **191 passed** | **272 passed** |
| `corepack pnpm test:rules` | 6 檔／**66** 測試 | 6 檔／66 測試 |
| `corepack pnpm audit --prod` | No known vulnerabilities | 同左 |
| `corepack pnpm audit --audit-level high` | 5 vulnerabilities（全 moderate，未達門檻） | 同左 |
| `corepack pnpm run sbom` | CycloneDX 1.6，920 元件／80 runtime，授權 gate 過 | 同左 |
| `corepack pnpm run check:secrets` | pass（420 檔） | pass |

**環境限制：** `test:rules` 在 `D:\診所專案\` 這類含非 ASCII 字元的路徑下，
Firestore Emulator 起不來。需先 `subst X: "<專案路徑>"` 再於 `X:\` 執行。
（`docs/runbooks/public-mirror-sync.md` 對 trufflehog 記載了同一個限制。）

**5 筆 moderate advisory**（全為 dev-only 傳遞依賴，`audit:prod` 乾淨）：
`vitest>vite>postcss`、`firebase-tools>undici`（3 筆）、
`firebase-tools>…>hono`。未達 `--audit-level high` 門檻，故不 gating。

---

## 4. Findings

### [A-1] 可達性閘門可被計算式動態 import 繞過

- **嚴重度：** Critical　**優先序：** P0　**信心：** 已由程式碼與執行證實
- **狀態：** 已修正
- **影響：** 全部受決策阻擋的能力（D-004／D-007／D-008／D-014／D-015）
- **檔案：** `scripts/architecture-rules.mjs:70`（`importSpecifiers`）、
  `scripts/check-architecture.mjs:166`（`reachableFrom`）
- **重現：** 在 `apps/api/src/main.ts` 末端加入
  ```ts
  const probeTarget = './appointments/appointment.application-service.js';
  export async function probe(): Promise<unknown> { return import(probeTarget); }
  ```
  執行 `pnpm check:architecture` → **exit 0，全綠**。建置後
  `await (await import('./apps/api/dist/main.js')).probe()` 回傳該模組的三個匯出
  （`AppointmentApplicationService`、`MissingVerifiedPatientError`、
  `toBookingRequest`），證明它**確實在執行期被載入**，而
  `unrouted-inventory.json` 仍宣稱它「未接線」。
- **根本原因：** 可達性走訪以 regex 比對 import，只認得字面值指定字串。
- **實測可繞過的六個向量：** 計算後的指定字串、帶插值的樣板字串、字串相接、
  `createRequire`、把 `import` 包成別名函式、無插值樣板字串。
- **為什麼這比看起來嚴重：** 最後一項 `` import(`./x.js`) `` 是完全正常的寫法。
  這不只是攻擊路徑，是**遲早會發生的意外**——任何人這樣寫都會靜默地讓那道
  gate 對該檔案失效。
- **修改方案：** 不去求值任意運算式（那等於寫直譯器且永遠追不完），改為
  **fail closed**：新增 `opaqueDynamicImports()`，`check:architecture` 遇到
  看不透的載入即失敗，要求作者改用字面值。無插值樣板字串改為正常解析並跟進。
- **實際修改：** `scripts/architecture-rules.mjs`、`scripts/check-architecture.mjs`、
  `scripts/architecture-rules.test.mjs`（+9 測試）
- **測試結果：** 乾淨樹通過；重新注入原本可繞過的 probe → 失敗並指名檔案與呼叫。
- **回歸風險：** 低。`apps/api` 目前完全沒有動態 import 或 `createRequire`，
  規則現在零成本。

### [M-1] 手機版從未在真正的行動裝置條件下被測過

- **嚴重度：** High　**優先序：** P1　**信心：** 已由設定檔證實
- **狀態：** 已修正
- **檔案：** `playwright.config.ts:22`
- **根本原因：** 唯一 project 是 `devices['Desktop Chrome']`。所有手機測試都是
  `setViewportSize` 縮小的桌機視窗：無 touch、無行動 UA、`deviceScaleFactor` 恆為 1。
- **直接後果：** `clinic-site.css` 內五處 `@media (hover: hover)` 的**無 hover
  分支從未執行過**；真手機上那些只在 hover 出現的樣式無人驗證。
- **修改方案：** 新增 `mobile-device` project（Pixel 7），以 `testMatch` 限縮在
  mobile 這一組，避免整套 191 個測試重跑一次。
- **過程中的教訓：** `testMatch` 未錨定路徑分隔符時，`responsive.spec.ts$` 會
  一併吃到 `role-maintenance-responsive.spec.ts`，把桌機流程測試拖進手機模擬並失敗。
- **測試結果：** E2E 191 → 272 passed。

### [M-2] 品牌標誌在手機佔掉半個版面

- **嚴重度：** Medium　**優先序：** P1　**信心：** 已量測
- **狀態：** 已修正
- **檔案：** `apps/web/public/clinic-site.css:1071`（頁尾）、`:1174`／`:1406`（頁首）
- **根本原因：** 頁尾 `.clinic-footer__brand img` 固定 `12.5rem`，而三個 media
  query 區塊**只調整 `grid-column`，沒有任何一個覆寫寬度**；頁首在 ≤48rem 與
  ≤30rem 各壓一個定值，導致 320–412px 全段固定 140px。

| 寬度 | 頁首（前→後） | 頁尾（前→後） |
|---|---|---|
| 320 | 43.8% → **27.5%** | 62.5% → **32.5%** |
| 360 | 38.9% → 26% | 55.6% → 30% |
| 390 | 35.9% → 26% | 51.3% → 30% |
| 412 | 34% → 26% | 48.5% → 30% |
| 768 | 21.9% → 18.8% | 26%（不變） |
| 1024／1440 | 不變 | 不變 |

- **附帶修正：** 先前 768px 的標誌（168px）比 1024px（144px）**更大**，是反向
  跳動。把手機規則上限接到桌機 clamp 的下限後，320→768 單調遞增。
- **保留：** HTML 上的 `width`／`height` 屬性未動，載入前佔位比例不變，CLS 預算不受影響。

### [M-3] 手機首屏沒有任何可行動的資訊

- **嚴重度：** Medium　**優先序：** P1　**信心：** 已量測
- **狀態：** 已修正（部分）
- **量測（320×568，修改前）：** 首頁總高 **8550px ≒ 15 個畫面**；
  「門診時間與交通」區塊起點在 **y≈6240px ≒ 11 個畫面之後**。首屏只有
  eyebrow、標語、一句說明與兩顆按鈕，以及一個 272×272 的純裝飾圓球。
- **修改方案：** 新增 `heroQuickFacts()`，把**同一組 `CLINIC` 常數**（門診時間、
  電話、地址）呈現在首屏。**沒有新增任何醫療或營運文案**；完整版仍以
  `#clinic-visit` 為準，兩處同源。
- **結果：** facts 頂端由 y≈6240px 降到 **y≈482–589px**。360×640 以上落在首屏內；
  **320×568 仍差 21px 在摺線下方**——如實記錄，未為單一舊機型扭曲版面。
- **過程中的回歸：** 新增的電話與地址是獨立連結（不在句子裡），不適用
  WCAG SC 2.5.8 的 Inline 例外，加入當下讓 `affordance.spec.ts` 轉紅。已補
  `min-height: 2.75rem` 並加測試釘住。

### [M-4] 反射測試寬度與 CSS 斷點不對齊

- **嚴重度：** Low　**優先序：** P2　**狀態：** 已修正
- `responsive.spec.ts` 原本量 320 與 390 之間直接跳過，而該區間 CSS 只有一階斷點。
  已補 **360 與 412**（最常見的兩種 Android 寬度）。
- **未修的部分：** 該 spec 仍只斷言「無水平捲軸」，不檢查 Target Size、文字截斷或
  元素重疊。無水平捲軸不等於版面可用。列為 P2。

### [R-1] 角色定義三方分歧

- **嚴重度：** High　**優先序：** P1　**信心：** 已由程式碼證實
- **狀態：** 伺服器端已收斂；瀏覽器端**未做**

| 來源 | 角色 | 數量 |
|---|---|---|
| `apps/web/public/modules/constants.js` | `admin`、`front_desk` | 2 |
| `apps/api/.../rbac.ts` | `patient`…`service_account` | 7 |
| D-006 核准基線（2026-07-28） | administrator／front-desk／**physician** | 3 |
| 業主 2026-08-04 需求 | 管理者／櫃檯／諮詢師／醫師／病患 | 5 |

- 兩份程式碼裡**都沒有醫師與諮詢師**，儘管 D-006 已核准 physician。
- 兩邊連權限詞彙都不同（瀏覽器 `create_booking` vs 伺服器 `create_appointment`）。
- **修改方案：** 新增 `packages/domain/src/roles.ts` 作為單一來源；`rbac.ts` 改為
  匯入它；`case_manager` 依 Q1 假設收斂為 `consultant`；補上 `physician`
  且**權限為空集合**。
- **偏離計畫之處：** `rbac-matrix.md` §6 指定放 `packages/contracts`，實作改放
  `packages/domain`。理由：contracts **沒有送到瀏覽器的路徑**（無打包器、裸名被
  層級守衛禁止），唯一共享機制是 `sync-domain-vendor` 複製 domain 編譯產物並以
  sha256 manifest 擋漂移（ADR-0004）。放 contracts 會讓「兩邊都從它匯入」在
  瀏覽器端無法成立。
- **未完成：** 瀏覽器 `admin` → `manager` 改名。它牽動登入 fixture、已儲存的
  workspace state 與大量斷言，與本次其他修改混在一起會無法審查。

### [R-2] `rbac.ts` 未接線（不修，記錄為刻意狀態）

- **嚴重度：** Info　**狀態：** 不修正
- `evaluateAccess` 僅被自身測試與 `rbac-appointment-policy.ts` 引用，無任何路由。
- 這是**刻意**的：`unrouted-inventory.json` 登記且 `check:architecture` 雙向強制，
  阻擋來自 D-004／D-007／D-008／D-014／D-015 與 Stage C0（`revise`）～C6。
- **為什麼本次不接線：** 端到端接線需要 server-verified 身分（Stage C2）與
  server-side session／revocation（C3），兩者皆 `pending`。在沒有認證的情況下接線，
  `actorRole` 只能來自前端——而 rbac-matrix.md §4.1 明訂「前端傳入的 role 一律不採信」。
  接了等於製造一個看起來有授權、實際上沒有的假象。

### [S-1] 已查證但**無** finding 的項目（避免誤導）

以下項目經實測確認健全，明確記為無問題：

- `check:secrets` 對格式正確的 AWS／Google／GitHub token 皆能攔截。
  （初次探測未觸發，原因是我用了 42 字元的畸形 Google key，正確格式為 39 字元；
  這是探測錯誤，不是掃描器缺口。）
- `gitleaks.toml` 未接進 CI，但它是 `public-mirror-sync` runbook 第 5 步的
  **人工控制項**，有明確文件記載，非遺漏的 gate。
- GitHub Actions **全部 SHA-pinned**（`sast.yml`、`verify.yml` 共 21 處）。
- Firestore Rules 全域拒絕，與 ADR-0003 一致，rules 測試 66 項全綠。
- `clinic.html` 的 `<h1>` 使用 `.visually-hidden` 供輔助技術 ＋ `aria-hidden`
  逐字動畫，是正確的可及性寫法，非重複內容缺陷。

---

## 5. 已完成修正

| Finding | 修改內容 | 主要檔案 | 測試 | 結果 |
|---|---|---|---|---|
| A-1 | 閘門對看不透的載入 fail closed | `scripts/architecture-rules.mjs`、`check-architecture.mjs` | +9 單元測試；重放原 probe | 通過；原繞過手法現在被擋 |
| M-1 | 新增 Pixel 7 行動裝置 project | `playwright.config.ts` | E2E | 191 → 272 passed |
| M-2 | 品牌標誌隨視窗收放 | `clinic-site.css` | +4 比例測試 | 320px 頁尾 62.5%→32.5% |
| M-3 | 首屏門診時間／電話／地址 | `clinic-site.js`、`clinic-site.css` | +2 測試 | y 6240px → 482px |
| M-4 | 補 360／412 反射寬度 | `responsive.spec.ts` | E2E | 通過 |
| R-1 | 伺服器角色收斂至單一來源 | `packages/domain/src/roles.ts`、`rbac.ts` | +15 單元測試 | 939 tests 全過 |

**Commit：** `96dabf2`（M-1～M-4）、`79609e6`（A-1）、`79272ed`（R-1）

---

## 6. 未完成項目

| # | 項目 | 未完成原因 | 所需決策／權限 | 建議下一步 |
|---|---|---|---|---|
| 1 | **2026 標準來源矩陣（18＋來源）** | 本次未執行任何外部查證 | 無，純工作量 | 見 §7；不可視為已完成 |
| 2 | 瀏覽器 `admin` → `manager` | 牽動登入 fixture、已存 state 與大量斷言 | 無 | 獨立 commit，含 state 遷移 |
| 3 | RBAC 六處落實其餘五處 | 需 Stage C2／C3 身分與 session | C2／C3 deployment authority | 待 C0 由 `revise` 轉 `pass` |
| 4 | 金額欄位級過濾（rbac-matrix §4.3） | **D-015 未核准** | 業主決定 | 不得先實作 |
| 5 | 臨床紀錄權限（§3.4） | **D-014 未核准** | 業主決定 | 不得先實作 |
| 6 | Q1～Q4 四題 | 需業主回答 | 業主決定 | 見下表 |
| 7 | Domain 深度審查（競態／重放／時區跨日） | 時間 | 無 | 下一輪 |
| 8 | 109 份 Markdown 整併 | 時間 | 無 | 依 document-lifecycle 分類逐份處理 |
| 9 | 架構圖 Current／Target 更新 | 時間 | 無 | 併入 ARCHITECTURE 既有體系 |

### 待業主回答的四題（rbac-matrix.md §7，本次未代為決定）

| # | 問題 | 目前處置 |
|---|---|---|
| Q1 | `case_manager`（個管師）與「諮詢師」是同一個職務嗎？ | **已假設為同一個**，集中在 `ASSUME_CASE_MANAGER_IS_CONSULTANT` 一個常數，答覆後一行可改 |
| Q2 | 醫師可否看到自己主治病患的金額？ | 未假設，`physician` 權限維持空集合 |
| Q3 | 管理者無臨床紀錄權是否可接受？ | 未假設，未實作 |
| Q4 | 櫃檯的「處理全部款項」是否含結算？ | 未假設，未實作 |

---

## 7. 標準來源矩陣：**未履行**

委託書 §三要求至少 18 份權威來源、其中 12 份第一方文件、涵蓋 8 個以上組織，
並附版本、日期、Final／Draft 狀態與適用性。

**本次完全沒有執行外部查證。** 報告中沒有任何一條結論引用 WCAG 2.2、
OWASP Top 10:2025／ASVS 5.0.0、NIST CSF 2.0／SSDF、ISO/IEC 25010／27001／27701、
台灣個人資料保護法或醫療機構電子病歷辦法等外部文件。

**因此以下項目在本報告中一律視為未評估，不得引用為已符合：**

- WCAG 2.2 AA 逐條符合性（本次只驗證了本專案自訂的 44px 規則與既有 axe 測試）
- OWASP／NIST／CISA 對照
- ISO 差距分析
- 台灣個資法與醫療法規適用性判定——**包含本系統究竟屬於一般行政預約系統、
  醫療資訊系統或電子病歷系統的定性**，這一項尚未判定，不得因專案名稱含
  clinic 就推定電子病歷規定適用
- HIPAA／GDPR／EAA 適用性

報告內既有的可及性判斷（SC 2.5.8 Inline 例外、`.visually-hidden` 寫法）
係依 repository 內既有測試與註解的既有論述，非本次獨立查證。

---

## 8. 自我校驗

| # | 委託書要求 | 狀態 |
|---|---|---|
| 1 | 完整掃描專案 | 是（420 檔結構、109 MD 清點） |
| 2 | 查看全部 Security Rules | 是（全域拒絕；66 rules 測試） |
| 3 | 直接網址守衛 | **否**——工作臺 hash 路由無 guard，已記於 R-1／未完成 3 |
| 4 | 區分 UI 權限與真正授權 | 是（R-2 明確記錄 `rbac.ts` 未接線） |
| 5 | 檢查 Admin SDK | 部分（`firestore/booking.repository.ts` 未接線） |
| 6 | 費用欄位級權限 | 未實作，受 D-015 阻擋 |
| 7 | 患者端與工作臺隔離 | 未深查 |
| 8 | Calendar 同步失敗情境 | 未查（未連線；既有 runbook 演練測試 3 項綠） |
| 9 | 實際執行測試 | 是，全部指令與結果見 §3 |
| 10 | 完成可安全完成的修正 | 是，6 項 |
| 11 | 補上相關測試 | 是，+30 測試 |
| 12 | 更新 README | 否 |
| 13 | 更新 AGENTS.md | 是（導航加入本報告） |
| 14 | 整併重複 Markdown | **否** |
| 15 | 更新 ARCHITECTURE.md | **否** |
| 16 | Mermaid 可渲染 | 不適用（本次未新增圖） |
| 17 | 區分 Current／Target | 不適用 |
| 18 | 18 個權威來源 | **否，見 §7** |
| 19 | 區分 Final／Draft | 不適用（無外部來源） |
| 20 | 揭露無法驗證的內容 | 是（§2 存取範圍、§7） |
| 21 | 避免洩漏 Secrets 與個資 | 是 |
| 22 | 避免誇大法規適用性 | 是（§7 明確聲明未評估） |
| 23 | 保留未提交修改 | 是（起始工作區乾淨，並由 HEAD 而非 main 分支） |
| 24 | 檢查最終 Git Diff | 是，每個 commit 前皆檢視 |
| 25 | 報告與程式碼一致 | 是 |

---

## 9. 上線前清單（增補既有 gate，非取代）

**必須完成**（既有 `unrouted-inventory.json` 與決策登錄已涵蓋大部分，此處只補本次新增）

1. Q1～Q4 由業主回答；在此之前 `ASSUME_CASE_MANAGER_IS_CONSULTANT` 不得被當成已確認。
2. 本系統的法規定性（行政預約／醫療資訊／電子病歷）必須判定，見 §7。
3. 瀏覽器角色收斂完成，否則金額可見性無法落實。

**強烈建議**

4. `responsive.spec.ts` 增加 Target Size 與文字截斷斷言，不只驗無水平捲軸。
5. 5 筆 dev-only moderate advisory 隨 `firebase-tools`／`vitest` 升版清掉。
6. 320×568 首屏資訊仍差 21px；若仍支援該尺寸則需再收 hero 垂直節奏。

**可後續處理**

7. 109 份 Markdown 整併、架構圖 Current／Target 更新。
8. Domain 競態／重放／時區跨日深度審查。
