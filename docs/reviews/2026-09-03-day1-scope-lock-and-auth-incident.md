# Day 1：Scope lock 與 Google 登入事故調查

**狀態：** 一次性、read-only、owner-authorized 的 dated 調查證據。**不是**
Product Canon、D-series 核准、Roadmap ID、部署授權或 Stage 變更。
**日期：** 2026-09-03（Asia/Taipei）
**授權：** 《企業級專案章程暨 7 日交付計畫 v2.0》（2026-09-02）業主簽署
2026-09-03；本週目標完成日 2026-09-09；Production **不包含**在本週承諾。
**調查基準（source）：** `origin/main` `c2a50139ef220a21f0cfc768846c54373729df57`
（2026-09-03 `git fetch` 後 HEAD；含已合併 Product Excellence Audit v1）。
**Staging 目標：**
`https://beauessence-clinic-staging--cal-pilot-pk9yyofq.web.app/`
**本文件不得引用自己的 commit hash。** 查本檔提交：`git log --
docs/reviews/2026-09-03-day1-scope-lock-and-auth-incident.md`

本文件修正先前口頭／計畫稿的證據階梯表述：

- 既有 staging channel 的部署狀態：**DEPLOYED-NOT-SMOKED**（已對該 URL
  做讀取與點擊到 Google 帳號頁；**未**完成選帳後 callback／TOTP／session
  smoke）。
- Day 1 **產品程式**變更 rung：**N/A**（read-only investigation；產品
  code diff **NONE**）。本 dated 文件本身是文件變更，gate 另計，不得把
  staging 的 DEPLOYED-NOT-SMOKED 說成本文件的驗證等級。

姊妹文件：[Function Inventory 與 Acceptance
Matrix](2026-09-03-function-inventory-and-acceptance-matrix.md)。

## 0. 一句話

舊登入頁閃現已 **CONFIRMED**（現行 `index.html` 合成登入在
`client-config` 回來前可見）。Google「選完帳號後回到登入頁」只重現到
IdP 帳號輸入頁（**PARTIAL**）；最高信心假設是 authDomain
（`beauessence-clinic-staging.firebaseapp.com`）與實際 Hosting preview
網域（`*.web.app`）不一致，屬 Firebase 官方 `web.app` Option 1
hypothesis class，**不是** CONFIRMED root cause。本週不開始 Day 2 實作。

## 1. Scope lock

### 1.1 本週固定 scope（章程 A；業主 Q1／Q20／Q21／Q22）

功能完成 + exact-head CI + synthetic／staging 驗證。停在 **VERIFIED
STAGING**。缺 production gate 時不上 production。一般技術細節允許小 PR
→ CI → 修正 → 再驗證。新增非 P0 必須交換同等工作量或延後。

鎖定的產品方向（不得在本文件重猜）：

- 身分：Google 為主、診所管理 local account 備援、兩者 MFA；public 與
  staff 入口分離；staff 最小改動優先 `/staff`。
- 預約：患者取消 = A（立刻取消並釋放時段）；自助截止 = 預約當日 10:00
  Asia/Taipei；線上改期開放；先成功保留新時段再釋放舊時段；horizon 往後
  1 個月；capacity 每時段 1 位；醫美暫時移出本 booking 產品；每病患最多
  2 筆未完成預約；證件可作來源，原始值不得出現在一般 UI、log、URL、
  analytics、CI artifact；no-show 本週只記錄、不自動限制。
- Calendar：不是 availability source of truth；inbound 先成 review
  candidate。業主 Q15 提出未來可能要姓名／電話／病歷／麻醉／付款——
  **這是需求輸入，不是 activation**。本週不可把真實敏感資料寫入
  Calendar。Production Calendar 不在本週承諾。
- 臨床／財務：本週只做 module／synthetic UI／RBAC／tests／data
  boundary；不寫入真實臨床或真實財務資料。

### 1.2 Out of scope

Governance v3、重寫 AGENTS／Canon、mass rewrite、真病患／真臨床／真金流、
production 上線、以 CI 綠假裝 production smoke、把歷史 audit 當 current
authority。

### 1.3 未解 authority（隔離，不猜、不改 Canon）

下列是 **exact conflict**，不是實作細節。

1. **Decision Register 仍 `pending` vs 2026-09-03 章程答案。**
   [`phase-1-decision-register.md`](../product/phase-1-decision-register.md)
   前言：39 題業主答案是 recorded input, not approval；D-004／D-005 狀態
   仍為 `pending`。章程 Q5–Q12 已給取消 A、當日 10:00、改期、1 個月、
   capacity 1、醫美移除、上限 2、no-show 不自動限制。治理要求：owner
   input 未完成核准格式前不得假裝 register 已 `approved`。
2. **PEA v1 R-P0-2 vs 業主 Q5。**
   [Product Excellence Audit v1](2026-09-02-product-excellence-audit-v1.md)
   建議把患者 UI 改為 `request_cancellation`。業主選 **A 立刻取消**。
   PEA 不是 Canon。對齊方向是 API／RBAC／測試遷就 A，不是把 UI 改回
   request。在 register 對帳完成前，這是 reconciliation，不是實作授權。
3. **AGENTS「Must remain disabled」vs 本週功能完成。**
   [`AGENTS.md`](../../AGENTS.md) 仍禁止 public／staff booking write
   route，以及未另核准的 Cloud Authentication。章程要把登入→預約→工作臺
   做成可驗證服務。不在本文件選邊；Day 2+ 每個寫入路徑仍須核對當時
   register 與部署授權。
4. **Staff URL。** 章程 Q4：優先 `/staff`。PEA 建議 404 改 `/clinic`，且
   「不改 `/` 作為工作臺 URL」。兩者可並存（`/` 改 redirect 到 `/staff`
   是另一切片），但尚未寫入 register。
5. **Q13 booking retention** 延後；法務／隱私未核准。不得自訂 production
   retention。
6. **Q15 production Calendar 欄位** 與 Safety Floor／ADR-0002 最小欄位
   衝突：僅記錄需求，不授權寫入。
7. **GC-001**（[`state/conflicts.md`](../state/conflicts.md)）：canonical
   repo 已 public，Rule 1 未退休。本文件不處理。

## 2. 調查環境（runtime）

| 項 | 值 |
| --- | --- |
| Staging URL | `https://beauessence-clinic-staging--cal-pilot-pk9yyofq.web.app/` |
| Hosting HTML Last-Modified | 2026-09-01T11:06:50 GMT（**早於** 調查當日 `origin/main`） |
| `client-config` | HTTP 200 JSON：`authDomain` = `beauessence-clinic-staging.firebaseapp.com`，`projectId` = `beauessence-clinic-staging`。**不轉錄 apiKey。** |
| HTML Cache-Control | `no-cache` |
| JS／CSS Cache-Control | `public, max-age=31536000, immutable` |
| CSP `frame-src` | `https://beauessence-clinic-staging.firebaseapp.com` |
| COOP／CORP | `same-origin` / `same-origin` |
| Service worker | 無（`navigator.serviceWorker.controller === null`，registrations 空） |
| 調查瀏覽器 | Cursor 內建 Electron／Chrome 144。**不是**使用者一般 Chrome。 |
| 無痕／一般 Chrome 矩陣 | `NOT_RUN`（RESOURCE_LIMITED：無獨立 Chrome 控制權完成選帳） |
| 產品 code 變更 | **NONE** |

`/__/auth/handler` 在 preview `web.app`、`beauessence-clinic-staging.web.app`
與 `beauessence-clinic-staging.firebaseapp.com` 均 HTTP 200。

## 3. Google Auth incident

- **reproduced：** PARTIAL
- **exact steps：** 開 `/` → 合成登入閃現數秒 → CAL-PILOT「使用 Google
  帳號登入」→ 狀態「正在前往 Google 登入…」→ 到達
  `accounts.google.com`，畫面「to continue to
  beauessence-clinic-staging.firebaseapp.com」。OAuth `redirect_uri` =
  `https://beauessence-clinic-staging.firebaseapp.com/__/auth/handler`；
  `prompt=select_account`。**未輸入帳號、未完成 callback。** 不保存
  OAuth `state` 或 token。
- **root cause status：** bounce 終態 **未 CONFIRMED**
- **confidence：** G／H = **LIKELY**；其餘見下表

`origin/main` 實作（[`apps/web/src/calendar-pilot-entry.js`](../../apps/web/src/calendar-pilot-entry.js)）：

- 有 `signInWithRedirect` 與 `getRedirectResult`
- **沒有** `onAuthStateChanged`、`initializeAuth`、`setPersistence`、
  `signInWithPopup`
- `boot()` 先 `loginView()`，再讀 `sessionStorage` CSRF，再
  `completeGoogleSignIn()`
- 使用者 = `result?.user ?? auth.currentUser`；兩者皆 null 則回
  `false`，停在登入頁且不一定有錯誤文字
- session 建立失敗（非白名單、缺 TOTP claim、停權）→ 同一 HTTP 401
  `AUTHENTICATION_REQUIRED`

### 3.1 Hypothesis 表

每一列：Supporting／Contradicting／How tested／Result／Confidence。

**A. OAuth／Firebase redirect 本身失敗**

- Supporting：無（本次 click 已離開應用、進入 Google）。
- Contradicting：已到達 Google identifier 頁。
- How tested：點「使用 Google 帳號登入」，讀 `location.href`。
- Result：OAuth 啟動成功。
- Confidence：**REJECTED**（本環境、本次 click）。

**B. redirect 成功但 Firebase auth state 沒 restore**

- Supporting：官方 Manage Users（查證 2026-09-03，頁面 2026-09-01）：
  `currentUser` 在 init 中間可為 null；建議 `onAuthStateChanged`。程式
  只用 `getRedirectResult` + `currentUser`。
- Contradicting：未觀察 callback 後的 `getRedirectResult` 回傳值。
- How tested：source only。
- Result：仍可能。
- Confidence：**POSSIBLE**。

**C. auth state 成功，但 app 過早當 signed-out**

- Supporting：`boot()` 先畫 `loginView()`；`completeGoogleSignIn` 回
  `false` 時不進 `renderApplication`。
- Contradicting：未看到 callback 後的最終 UI。
- How tested：source。
- Result：可解釋「回到登入頁」，需 callback 才能與 B／E 分開。
- Confidence：**POSSIBLE**。

**D. auth 成功，但 server session 交換失敗**

- Supporting：`POST /v1/calendar-session` 失敗會把錯誤寫進
  `[data-login-status]`。
- Contradicting：未完成 callback，無 network 證據。
- How tested：source + controller。
- Result：可能；應有可見錯誤，與「沉默回到登入」不完全相同。
- Confidence：**POSSIBLE**。

**E. RBAC／allowlist 失敗被誤當未登入**

- Supporting：[`calendar-pilot-session.ts`](../../apps/api/src/auth/calendar-pilot-session.ts)
  非白名單／缺 TOTP → `AuthenticationRequiredError`（401），與未登入同一
  句「請先登入後再操作。」
- Contradicting：使用者描述「有時」，若每次都用同一白名單帳號則較弱。
- How tested：source + tests。
- Result：可造成 bounce 外觀。
- Confidence：**POSSIBLE**。

**F. persistence 設定錯誤**

- Supporting：未呼叫 `setPersistence`；走 SDK 預設。
- Contradicting：無 runtime 證明預設在此 Hosting 失敗。
- How tested：`git grep` 無 persistence API。
- Result：未證實。
- Confidence：**POSSIBLE**。

**G. authDomain／authorized domain／redirect URI mismatch**

- Supporting：官方 *Best practices for signInWithRedirect*（查證
  2026-09-03，頁面 2026-09-01）：Hosting 在 `web.app` **必須** Option 1，
  `authDomain` = 實際服務網域。Staging 服務網域是 preview `web.app`；
  `client-config.authDomain` 是 `*.firebaseapp.com`。Google 畫面也顯示
  continue to firebaseapp.com。Identity 設定 script 會把 preview domain
  加進 authorized domains，但 **沒有**把 `authDomain` 改成 preview 網域。
- Contradicting：未證明 callback 後 `getRedirectResult === null`。部分
  瀏覽器仍允許第三方 storage，故「有時」成功與官方描述相容。
- How tested：HTTP `client-config` + OAuth URL + 官方文件。
- Result：與使用者觀察最吻合的 class。
- Confidence：**LIKELY**（非 CONFIRMED）。

**H. third-party storage／privacy**

- Supporting：同一官方文件：Chrome M115+ 等會擋跨來源 iframe storage；
  這正是 `authDomain` ≠ 應用網域時 redirect 失敗的機制。
- Contradicting：本次瀏覽器是 Electron；未測使用者 Chrome／無痕。
- How tested：文件對照設定；未改瀏覽器隱私開關。
- Result：G 的機制，不是獨立已證根因。
- Confidence：**LIKELY**（依附 G）。

**I. service worker／cache／舊 bundle**

- Supporting：JS 為 immutable 一年；理論上可留舊 hash。
- Contradicting：無 SW；HTML `no-cache`；本次資源為該 channel
  Last-Modified 的 hashed 檔名。
- How tested：CDP `getRegistrations` + 回應標頭。
- Result：不是 flash 的原因；不是本次 bounce 的必要原因。
- Confidence：**REJECTED**（SW 作為 flash／bounce 主因）；舊 JS 混部仍
  **POSSIBLE**（見 K）。

**J. Hosting rewrite 吃掉 callback**

- Supporting：無。
- Contradicting：`/__/auth/handler` HTTP 200；`firebase.json` 未把
  `/__/**` rewrite 到 SPA。
- How tested：HEAD／GET handler。
- Result：不是。
- Confidence：**REJECTED**。

**K. mixed deployment／stale asset**

- Supporting：channel Last-Modified 2026-09-01；`origin/main` 於
  2026-09-02／03 仍有文件合併。產品 auth 路徑在 cal-pilot 程式，不一定
  被那些 docs commit 改變。
- Contradicting：未對 hashed bundle 做與 `origin/main` 的 byte 比對
  （本調查未建置 dist）。
- How tested：標頭日期。
- Result：部署比 main 舊是事實；未證明是 bounce 根因。
- Confidence：**POSSIBLE**。

**L. 其他**

- MFA 註冊／驗證 UI 失敗、擴充套件改 `location`（2026-08-30 部署紀錄曾
  將部分 console 歸因為擴充）。皆無本次證據。
- Confidence：**POSSIBLE**，未測。

**禁止當成根因的句子：** 「大概是 race」「看起來像 cache」。本調查不使用。

## 4. Legacy-login flash（獨立缺陷）

- **reproduced：** YES（可重現）
- **source：** **current source**，不是 stale service worker。
  [`apps/web/public/index.html`](../../apps/web/public/index.html) 含
  `#login-view`「登入營運工作臺」與測試帳密。
  [`admin-bootstrap.js`](../../apps/web/public/admin-bootstrap.js) 會解除
  `hidden`。CAL-PILOT 要等
  `GET /v1/calendar-session/client-config` 成功才加
  `calendar-pilot-active`。本 session 該 fetch 首次 **2939 ms**。
- **何時發生：** auth 完成**之前**的 app bootstrap（覆蓋層尚未套上）。
- **與 bounce：** **不同根因。**
- **第二閃現（未與合成舊頁混為一談）：** `boot()` 在
  `getRedirectResult` 前必先 `loginView()`，callback 後可能再閃
  CAL-PILOT 登入卡。
- **confidence：** 合成舊頁閃現 **CONFIRMED**。CAL-PILOT 登入卡閃現
  **LIKELY**（source 必然；時長未在 callback 測量）。

404「回到首頁」`href="/"`：staging Hosting **有**品牌 404（1344
bytes，標題「找不到這個頁面」），不是本機 test server 的 0-byte。打開
`/` 後仍是員工合成登入 + CAL-PILOT 覆蓋。這是 front-door 問題，不是
flash 的根因。

## 5. 外部來源（查證日 2026-09-03）

| Source | 查了什麼 | 對本 repo |
| --- | --- | --- |
| Firebase *Best practices for signInWithRedirect*（頁面 Last updated 2026-09-01） | `web.app` 必須 Option 1 | 與 staging `authDomain` 設定直接衝突；hypothesis G |
| Firebase *Authenticate Using Google*（2026-09-01） | redirect 後呼叫 `getRedirectResult` | 程式有呼叫 |
| Firebase *Manage Users*（2026-09-01） | 應用 `onAuthStateChanged`；`currentUser` 可能因未 init 而 null | 程式沒有 observer |
| Google OAuth 2.0 Web Server | `redirect_uri` 須精確匹配 | 實測 URI 是 firebaseapp.com handler |
| OWASP Authentication／Session Cheat Sheets | MFA、timeout、登出後拒絕 | CAL-PILOT cookie 有 30 分 idle／8 時 absolute；正式 staff IdP 未落地 |
| Chrome COOP 說明 | `same-origin` 影響 **popup** opener | 本流程是 redirect；COOP 列為次因 **POSSIBLE**，不當 bounce 主結論 |
| GitHub／Stack Overflow Firebase issues | `getRedirectResult` null 常見討論 | **只當 hypothesis**，不當 correctness authority |

## 6. P0／P1 對 current main 與本 staging 重驗

PEA v1 稽核 SHA 是 `b180082`，不是調查當日 HEAD `c2a5013`。Google 登入
**不在** PEA P0 清單；本週另列。

| ID | Severity | Current status | Source | Runtime | Authority | Readiness |
| --- | --- | --- | --- | --- | --- | --- |
| R-P0-1 空白 404 | P0 | 本 Hosting channel **未重現** 0-byte；品牌 404 有送出 | PEA 本機 curl bytes=0 | staging 404 length 1344 | 無 D-series | 空白 404：**NOT_REPRODUCED**（此 channel） |
| R-P0-1 recovery → `/` | P0 | **仍在** | `404.html` `href="/"` | 品牌頁「回到首頁」進 `/` | 無 D-series | **READY**（改 `/clinic`；staff 另開 `/staff`） |
| R-P0-2 取消語意 | P0 | UI = `cancel`（A）；API／RBAC = `request_cancellation` | patient-booking-management／rbac.ts | 未在 staging 走完患者取消（CAL-PILOT 覆蓋） | 業主 Q5 = A；D-005 pending | **NEEDS_AUTHORITY**（register 對帳）＋方向已明確 |
| R-P0-3 cutoff | P0 | 仍 `SELF_CANCEL_CUTOFF_MINUTES = 20` | patient-booking-management.js | 未在 staging 患者流重跑 | 業主 Q6 = 當日 10:00；D-005 pending | **NEEDS_AUTHORITY** |
| Google bounce | P0（本週） | PARTIAL／LIKELY G+H | calendar-pilot-entry.js | 到 Google identifier | D-006 政策已核准；staging Identity 改設定需操作授權 | **NOT_REPRODUCED** 終態；Day 2 優先但不可把 LIKELY 當 CONFIRMED |
| 舊登入 flash | P0（本週） | CONFIRMED | index.html + boot() | 2939 ms config 前可見合成登入 | 無 | **READY** |
| R-P1-4 horizon | P1 | 仍 60 天 | constants.js `SYNTHETIC_WINDOW_DAYS` | 工作臺 a11y 見「60 個可預約時段」 | 業主 Q8 = 1 個月；D-004 pending | **NEEDS_AUTHORITY** |
| R-P1-5 醫美 | P1 | 仍在 catalogue | `service_aesthetic` | 未點患者 booking（pilot 覆蓋） | 業主 Q10 移除 | **NEEDS_AUTHORITY**／對帳後 READY |
| R-P1-6 appointment.id | P1 | 未在本 session 重跑工作臺欄位 | admin-view.js（PEA） | CAL-PILOT 覆蓋後未進合成工作臺主畫面 | 無 | **READY**（低優先） |
| R-P1-7 患者改期 | P1 | 患者端仍無 | patient-app.js | 未測 | 業主 Q7 開放 | **READY** 等 Day 3 domain 切片 |
| R-P1-8～10 | P1 | 未在本 session 重跑 | PEA | CAL-PILOT 覆蓋 | 無 | **READY** 排 Day 5 |
| R-P1-11／12 | P1 | 真人 AT／成效指標仍缺 | PEA | 本調查不做 usability 研究 | 章程 R8 | **OUT_OF_SCOPE** 本週 |

## 7. Day 2 建議（本文件不實作）

1. 合成登入 first paint 隱藏／cal-pilot 建置不含測試帳密 markup。
2. `404.html`「回到首頁」→ `/clinic`。
3. bounce：**先**用一般 Chrome（可加無痕）走完選帳 callback。若
   `getRedirectResult` 為 null，再做 staging Option 1（`authDomain` =
   實際 preview 網域 + 對應 OAuth redirect URI）。**不要**以 popup 當
   正式解法。必要時加 `onAuthStateChanged`。Diagnostic 不得記錄 token／
   PII。

## 8. Verification（本調查）

| Gate | Status | 說明 |
| --- | --- | --- |
| staging HTTP／瀏覽器 | PASS | 見 §2–§4 |
| 官方文件 fetch | PASS | 見 §5 |
| 一般 Chrome 選帳後 bounce | NOT_RUN | RESOURCE_LIMITED |
| `pnpm verify` | NOT_RUN | 調查當下無產品 diff；避免 read-only 觸發 rebuild |
| emulator／SAST／SBOM | NOT_RUN | 與本調查無關 |

**Evidence rung（調查對象 staging）：** `DEPLOYED-NOT-SMOKED`

**Evidence rung（產品程式變更）：** `N/A`（diff NONE）

**STOP／GO：** **GO_DAY_2**（flash + 404 recovery 可施工）。Bounce 正式
patch 綁 callback 證據。本文件交付時 **不開始** Day 2 實作。
