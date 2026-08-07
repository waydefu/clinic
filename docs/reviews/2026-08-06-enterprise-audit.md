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

### 法規定性：本系統目前**不是**電子病歷系統

先前未判定、也最容易誤判的一項，已於 §7.1 完成判定並附法源：醫療法 §67 的
**病歷**指醫事人員執行業務所製作的紀錄，而掛號預約屬行政管理資訊。本系統目前
只處理預約與到診，不產生任何臨床紀錄，故「醫療機構電子病歷製作及管理辦法」
**現階段不適用**。

**但 Expansion S（手術、麻醉、術後追蹤）一旦落地即適用**，屆時該辦法要求的
「雲端服務資料儲存地點應設置於我國境內」會直接約束 Firebase 區域選擇——
這必須在 D-014 核准**之前**納入架構決策，不能等功能做完再補。

個資法適用，但 2025-11-11 公布的修正條文**施行日期由行政院另定，至查證日仍未公告**，
故現行義務仍以修正前條文為準（§7.2）。

### 尚未完成（明確列出，未悄悄略過）

瀏覽器端角色改名、RBAC 六處落實的其餘五處、Domain 深度審查、109 份文件整併、
架構圖更新。WCAG 2.2 AA 本次只查證並套用 SC 2.5.8 一條，**其餘 SC 未逐條驗證**；
ISO 三項標準僅確認版本與適用邊界，未做逐項差距分析，且本專案**未取得任何認證**。

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
| 1 | WCAG 2.2 AA **逐條**符合性 | 本次僅查證並套用 SC 2.5.8 | 無，工作量＋人工驗收 | 自動掃描不等於符合，需鍵盤與螢幕閱讀器人工驗收 |
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

## 7. 2026 標準來源矩陣

查證日期 2026-08-06。共 **21 份來源、12 個組織**，其中第一方（標準組織、主管機關、
平台原廠、RFC）**17 份**。狀態一律以查證當日的官方頁面為準。

| # | 組織 | 文件 | 版本 | 日期 | 狀態 | 適用性 | 用於本報告哪項判斷 |
|---|---|---|---|---|---|---|---|
| 1 | OWASP | [Top 10:2025](https://owasp.org/Top10/2025/) | 2025 | 2025-11 發布，2026-01 定版 | Final | 適用 | A01 存取控制 → R-1／R-2；**A03 軟體供應鏈失效（新類別）** → §3 SBOM／audit／SHA pinning |
| 2 | OWASP | [ASVS](https://github.com/OWASP/ASVS/tree/v5.0.0) | 5.0.0 | 2025-05-30 | Final | 適用（V1 架構、V4 存取控制） | 授權必須在伺服器端 → R-2 不接線的理由 |
| 3 | OWASP | [API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) | 2023 | 2023 | Final（現行版） | 適用於未來 API | API1:2023 BOLA → `rbac.ts` 的 `own_patient` scope 設計 |
| 4 | W3C | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | 2.2 | 2023-10-05 發布，2024-12-12 更新 | W3C Recommendation | 適用 | **SC 2.5.8 Target Size (Minimum)，AA，24×24 CSS px** → M-3 修正 |
| 5 | ISO/IEC | WCAG 2.2 採認為 [ISO/IEC 40500:2025](https://www.w3.org/WAI/standards-guidelines/wcag/) | 2025 | 2025-10-21 | Final | 參考 | 佐證 WCAG 2.2 的國際標準地位 |
| 6 | NIST | [SP 800-218 SSDF](https://csrc.nist.gov/projects/ssdf) | 1.1 | 2022-02 | Final | 適用 | PS.1／PW.4 供應鏈與相依性 → §3 audit／SBOM |
| 7 | NIST | [SP 800-218r1 SSDF 1.2](https://www.nist.gov/news-events/news/2025/12/secure-software-development-framework-ssdf-version-12-available-public) | 1.2 | 2025-12 | **Initial Public Draft** | **前瞻參考，不得當強制要求** | 僅記錄方向 |
| 8 | ISO/IEC | [25010:2023](https://www.iso.org/obp/ui/en/#!iso:std:78176:en) | 2023（第二版） | 2023-11 | Final | **僅差距分析** | 九大特性；本專案未取得任何認證 |
| 9 | ISO/IEC | [27701:2025](https://www.iso.org/standard/27701) | 2025 | 2025-10-14 | Final | **僅差距分析** | 已改為獨立標準，非 27001 延伸 |
| 10 | CISA / FBI | [Product Security Bad Practices](https://www.cisa.gov/news-events/alerts/2025/01/17/cisa-and-fbi-release-updated-guidance-product-security-bad-practices) | 更新版 | 2025-01-17 | Final（自願性指引） | 參考 | 預設密碼、缺 MFA、無 CVE 揭露 → 對照本專案 C2 MFA 尚未實作 |
| 11 | CISA | [Secure by Design Pledge](https://www.cisa.gov/securebydesign/pledge) | 七項目標 | 現行 | 自願承諾 | 參考 | fail-closed 設計理念 → A-1 修法方向 |
| 12 | OpenSSF | [SLSA](https://slsa.dev/) | **v1.2** | 2025-11 核准 | Final（Source track 由實驗轉正） | 參考 | 建置來源可追溯 → 目前僅有 SBOM，無 provenance |
| 13 | OpenSSF | [Scorecard](https://openssf.org/) | 現行 | 2025-2026 | Final | 參考 | branch protection／code review → 已有 `check:branch-protection` |
| 14 | IETF | [RFC 9700](https://www.rfc-editor.org/info/rfc9700) | — | 2025-01 | **Best Current Practice** | **暫不適用**（尚未接 OAuth） | 未來 Calendar OAuth 必須用 Authorization Code + PKCE |
| 15 | Google | [Firebase Security Rules 基礎](https://firebase.google.com/docs/rules/basics) | 現行 | 2026 查證 | 原廠文件 | 適用 | 「無規則匹配即拒絕」→ 佐證現行全域 deny 正確 |
| 16 | Google | [Avoid insecure rules](https://firebase.google.com/docs/rules/insecure-rules) | 現行 | 2026 查證 | 原廠文件 | 適用 | 禁止 `allow read, write: if true` → 本專案無此問題 |
| 17 | Google | [Calendar API 同步指南](https://developers.google.com/workspace/calendar/api/guides/sync) | v3 | 現行 | 原廠文件 | **暫不適用**（未連線） | syncToken 失效回 **410**，必須丟棄並重跑完整同步 |
| 18 | Google | [Calendar API Push Notifications](https://developers.google.com/workspace/calendar/api/guides/push) | v3 | 現行 | 原廠文件 | **暫不適用** | **channel 每 7 天到期且無自動續訂**，必須主動重新 watch |
| 19 | Google | [Core Web Vitals](https://web.dev/articles/vitals) | 現行門檻 | 2026 | 原廠 | 適用 | LCP ≤2.5s／INP ≤200ms／**CLS ≤0.1**（p75）→ M-2 保留 width/height 的理由 |
| 20 | 全國法規資料庫 | [醫療機構電子病歷製作及管理辦法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0020121) | 現行 | **2022-07-18 修正**（無更新） | Final | **經判定不適用**，見 §7.1 | 依醫療法 §69 授權；規範對象為實施電子病歷之醫療機構 |
| 21 | 個資會籌備處 | [個資法修正條文公布](https://www.pdpc.gov.tw/News_Content/20/1010/) | 部分條文修正 | 2025-11-11 總統公布 | **已公布、尚未施行** | 見 §7.2 | 施行日期由行政院另定，查證當日仍未定 |

### 7.1 法規定性判定：本系統目前**不是**電子病歷系統

這是先前未判定、也是最容易被誤判的一項。判定依據：

1. 醫療法 §67 定義的**病歷**，是醫師及各類醫事人員**執行業務所製作的紀錄**
   （診斷紀錄、住院紀錄、護理紀錄、同意書、檢驗檢查報告等）。
2. 「醫療機構電子病歷製作及管理辦法」§1 明定依醫療法 **§69** 授權訂定，
   規範對象是**以電子文件方式製作及貯存病歷**的醫療機構。
3. 掛號與預約資料屬醫療機構的**行政管理資訊**，非醫事人員製作的臨床紀錄，
   一般不落入病歷範圍。

**本系統目前只處理預約、改期、取消、到診與個案指派，不產生任何臨床紀錄**
（臨床相關功能全部受 D-014 阻擋且未實作）。因此：

- 電子病歷辦法的境內儲存、24 小時內電子簽章、交換平臺同意等要求
  **現階段不適用**；
- **但這是會改變的**。Expansion S（手術、麻醉、術後追蹤）一旦落地，
  只要開始記錄醫事人員製作的臨床內容，本辦法即行適用，屆時
  「雲端服務資料儲存地點應設置於我國境內」會直接約束 Firebase 區域選擇。
  這一點必須在 D-014 核准前先納入架構決策，不能等功能做完再回頭補。

**信心程度：高度可能，但非法律意見。** 最終定性應由診所的法律或法遵顧問確認。

### 7.2 個資法：適用，但**修正條文尚未生效**

- 個資法本身適用：系統處理姓名、電話、生日、身分證號／護照號等個人資料。
- 2025-11-11 總統公布的修正條文（新增 §1-2、§20-1、§21-1～21-5、§51-1、
  §53-1，修正多條，刪除 §27），其**施行日期依 §56 由行政院另定，查證當日
  （2026-08-06）行政院仍未公告**。
- 因此：**現行義務仍以修正前條文為準**，不得宣稱已符合修正後規定；
  但修正條文新增的**資料外洩通報與紀錄保存義務**方向明確，
  `docs/runbooks/incident-response.md` 應據此預先對齊，屬「準備」而非「已符合」。
- 2026-01-22 個資會籌備處已預告施行細則修正案及三項子法草案，屬 Draft，
  **前瞻參考，不得當作現行要求**。

### 7.3 明確判定為不適用的境外規範

- **HIPAA**：適用對象為美國 covered entity 及其 business associate。本診所位於臺北，
  無跡象涉及美國醫療給付或相關契約 → 不適用。
- **GDPR**：需有歐盟境內資料主體或設立據點。目前系統無真實使用者、無跨境傳輸
  → 不適用；若未來開放歐盟旅客線上預約則須重新評估。
- **EAA／EN 301 549**：EAA 自 2025-06 生效，但拘束的是在歐盟市場提供產品或服務者。
  EN 301 549 現行仍為 **v4.1.0 Draft（2025-11 公眾諮詢）**，納入 WCAG 2.2 AA 的
  **v4.1.1 預計 2026 年才會被引用於歐盟官方公報** → 對本專案
  **不適用，且該版本本身尚未定案**，只能作前瞻參考。

### 7.4 以標準回檢本次修正

| 判斷 | 依據來源 | 結論 |
|---|---|---|
| M-3 新增連結的可點尺寸 | WCAG 2.2 SC 2.5.8（AA，24×24） | WCAG 只要求 24×24；本專案自訂 44×44 更嚴。修正後為 44px，**同時滿足兩者**。Inline 例外不適用——該例外要求目標位於文字行內且 line-height ≥ 1.5×字級，而電話／地址是 `dd` 內的獨立連結 |
| M-2 保留 `width`/`height` 屬性 | Core Web Vitals CLS ≤ 0.1（p75） | 保留載入前佔位是 CLS 預算的前提，修正時刻意未動 |
| Firestore 全域拒絕 | Firebase 官方 Rules 文件 | 與原廠「無匹配即拒絕、勿用 `if true`」一致，**現行姿態正確** |
| A-1 閘門 fail-closed | OWASP Top 10:2025 A03、CISA Secure by Design | 供應鏈與可達性保證失效屬 A03 範疇；fail-closed 符合 secure-by-design |
| 未接 OAuth | RFC 9700 | 未來 Calendar 授權須用 Authorization Code + PKCE，且該 RFC 已棄用部分舊模式 |
| Calendar 同步設計 | Google 官方 sync／push 指南 | 410 必須觸發完整重建、channel 7 天到期無自動續訂 → 現有 plan-only 文件需確認已涵蓋這兩點 |

### 7.5 仍未評估的項目

- WCAG 2.2 AA **逐條**符合性：本次只查證並套用了 SC 2.5.8。其餘 SC 僅有既有
  axe 自動掃描與專案自訂規則，**自動掃描不等於符合**（既有 runbook 亦如此聲明）。
- ISO/IEC 25010／27001／27701 的**逐項差距分析**未做，僅確認版本與適用邊界。
  本專案**未取得任何 ISO 認證**，不得作此宣稱。
- OpenSSF Scorecard 未實跑；SLSA provenance 未產生（目前只有 SBOM）。

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
| 18 | 18 個權威來源 | 是——21 份、12 個組織、17 份第一方，見 §7 |
| 19 | 區分 Final／Draft | 是——SSDF 1.2、EN 301 549 v4.1.0、個資法子法草案均標為 Draft，僅作前瞻參考 |
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
2. §7.1 的法規定性請診所法遵顧問覆核。工程判定為「目前非電子病歷系統」，
   但那是依法源推導的結論，不是法律意見。
3. **在 D-014 核准前先決定 Firebase 區域。** 一旦開始記錄臨床內容，電子病歷辦法
   要求雲端儲存地點設於我國境內；等 C1 建完 staging 再搬遷的代價遠高於現在選對。
4. 瀏覽器角色收斂完成，否則金額可見性無法落實。

**強烈建議**

4. `responsive.spec.ts` 增加 Target Size 與文字截斷斷言，不只驗無水平捲軸。
5. 5 筆 dev-only moderate advisory 隨 `firebase-tools`／`vitest` 升版清掉。
6. 320×568 首屏資訊仍差 21px；若仍支援該尺寸則需再收 hero 垂直節奏。

**可後續處理**

7. 109 份 Markdown 整併、架構圖 Current／Target 更新。
8. Domain 競態／重放／時區跨日深度審查。
