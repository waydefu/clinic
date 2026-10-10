# 身份、工作階段與 API 邊界修補：CI 紅燈收尾交接

**日期：2026-10-11。狀態：DRAFT_REVIEW_ONLY / NOT_MERGE_READY。**

這是去敏工程交接，不是 production 驗收或部署授權。對應獨立分支 `agent/sol-auth-trust-boundary-20261008`，接續 [2026-10-10 Draft 交接](2026-10-10-auth-session-boundary-draft-handoff.md)，並取代它成為新的交接入口；舊文件保留當時的範圍與限制，不把舊 receipt 當本次證據。

本文不嵌入自己的 commit hash，也不預寫尚未發生的 CI。定位本文版本用 `git log -- docs/reviews/2026-10-11-auth-session-boundary-ci-closeout-handoff.md`；遠端 head、CI run 與讀回結果記錄在 PR 說明。不得借用其他 PR 的綠燈。

## 1. 上一個 head 的三個 CI 紅燈：根因與修正

上一個 head 的 CI 為 8 PASS／4 FAIL（第四個是彙總 `Verification evidence`）。三個失敗都先在本機重現，再修正。

| Gate | 分類與根因 | 修正 | 回歸證據 |
| --- | --- | --- | --- |
| Firestore Emulator | **CONFIRMED**。本分支把 `AppointmentController` 的 limiter 改為必需（缺少時拒絕啟動），但 `denied-access-audit.repository.emulator.test.ts` 與 `schedule.occupancy.emulator.test.ts` 自組的 Nest 模組沒有提供 limiter。Nest 預設 `abortOnError` 以 `process.abort()` 結束，Vitest worker 因此無訊息退出，兩檔 14 個案例未執行。 | 兩個 harness 明確提供全部放行的合成 limiter（改分支前它們本來沒有 limiter，語意不變；配額由專屬限流測試驗證），並設 `abortOnError: false`，讓啟動錯誤以 Nest 的實際訊息失敗。 | 本機重現 RED（2 檔、14 案例未執行，與 CI 相同）；關掉中止後取得直接錯誤：`AppointmentController` 第 5 個參數 `WpB2RateLimiter` 無法解析；修正後 2 檔 14/14 PASS。 |
| SAST（Semgrep） | **CONFIRMED**。9 處 `dynamic-code-execution` 全部由本分支新增：4 個前端測試以 `runInNewContext` 執行切下來的原始碼片段，`scripts/c1-firebase-auth-domain.mjs` 以 `vm.Script` 執行轉譯後的 API 原始碼。 | 改為正常 module 接點，不加豁免、不改規則（見 §2）。 | 全庫搜尋已無 `runIn*Context`／`compileFunction`／`new Function`／`eval`／`new Script`（`security/semgrep` 規則樣本除外）。7 個刻意破壞的變體全部由對應測試抓到。 |
| E2E `e2e-auth-rbac` | **CONFIRMED，fixture 落後**。`business-tab.spec.ts` 的 `enableServerSession` 只寫 sessionStorage 提示，沒有模擬 `/v1/calendar-session/me`。本分支規定身分只能由 server `/me` 確認，所以開機退回登入畫面（狀態「工作階段無法驗證，請重新登入。」），8 個案例都卡在這裡。 | fixture 補上 `/me`：與 API 相同，只對該合成 session 的 CSRF header 回應身分，否則 401。 | 本機重現 8 FAIL／1 PASS（唯一通過的是不呼叫 `enableServerSession` 的關閉模式案例）；修正後見 §3。 |

**同一支 spec 的一個預期寫的是修補前的漏洞行為。** `loads the deferred panel only after a manager selects its tab` 原本要求「點分頁前完全不載入 CAL-PILOT client 與樣式」。在 main 上，載入器看到快取 CSRF 就跳過 server 探測、直接相信快取，正是 X-C02 所描述的缺陷；本分支改為一律由 CAL-PILOT client 向 `/me` 驗證，因此它在 server 模式開機時必然載入。這個測試沒有只改 assertion：商務模組（business-view、business-reauth）延後載入與四個 chunk 的 gzip 總上限都保留；另外新增「工作臺出現前必須已讀 `/me`」與「點分頁時不得重複請求開機已載入的驗證資源」。

**加嚴後的檢查抓到一個真實的重複載入（CONFIRMED）。** 點商務分頁時 `calendar-pilot.css` 被請求第二次：`business-reauth.js` 只辨識自己掛的樣式，不認得開機載入器掛的那份。修正為載入器的 `<link>` 加上 `data-calendar-pilot-style`，再驗證模組看到任一份就不再掛。回歸證據是上述 E2E 檢查，修正前實跑為 RED。

## 2. SAST 修正後的 module 接點

所有接點都是把原本的程式碼原樣搬到可匯出的函式，執行順序與行為不變；原檔改為呼叫該函式。

| 原本被切片執行的程式碼 | 新接點 | 測試改為 |
| --- | --- | --- |
| `admin-bootstrap.js` 最後的工作臺開機區塊 | `modules/workspace-tabs.js` 的 `bootStaffWorkbench(workbench)`；`state`／`client`／`serverAuthority` 仍由 `admin-bootstrap` 持有，透過存取函式讀寫，`serverAuthority` 的寫回時機與原本相同 | `bootstrap-authority-order.test.ts` 直接 import |
| `admin-bootstrap.js` 的週曆定位 | `modules/week-view.js` 的 `initialWeekStart(state, prior)` | `frontend-policy-evidence.test.ts` 直接 import |
| `business-view.js` 內部的 `runWrite` | 同檔匯出 `createBusinessWriteRunner(...)`；所有寫入與建立匯出共用同一個 `writeLock`，單一進行中的保護不變 | 同上 |
| `src/calendar-pilot-entry.js` 的 `boot()` | 新檔 `src/calendar-pilot-boot.js` 的 `bootCalendarPilot(ops)`；Firebase SDK 與畫面操作由入口檔以 `ops` 注入 | `frontend-session-authority.test.ts` 直接 import，以 `vi.stubGlobal` 提供瀏覽器全域 |
| `src/calendar-pilot-entry.js` 的 `reviewCandidate()` | 新檔 `src/calendar-pilot-candidate-review.js` 的 `createCandidateReview(...)` | `frontend-trust-boundary.test.ts` 直接 import |
| `public/calendar-pilot-entry.js` 整支載入器 | 不改原始碼 | 以 `vi.stubGlobal` 換掉 `location`／`fetch`／`document`／`sessionStorage`，`vi.resetModules()` 後以字面路徑動態 import 真實模組 |
| `scripts/c1-firebase-auth-domain.mjs` 執行 API 原始碼 | 改以 TypeScript parser 檢查語法樹：必須有匯出的核准清單陣列（內容與授權清單完全相同），以及匯出的比對函式（引用該清單、有拒絕分支、沒有無條件 `return true`）；註解不是語法，因此只寫在註解裡的政策不會通過 | `scripts/c1-firebase-auth-domain.test.mjs` 新增 5 個語法樹案例；比對函式的實際行為改由 `apps/api/src/platform/runtime/c1-firebase-auth-domain.test.ts` 以正常 import 驗證，並補上原本只在 `vm` 中探測的路徑、後綴、萬用字元與未核准主機案例 |

`src` 的兩個新模組會被 `bundleCalendarPilot` 打進同一個 bundle，不增加請求。工作臺開機函式最初放在獨立新模組時，`/index.html` 總量實測 95.2 KiB，超過 95 KiB 預算；改放進只有工作臺載入的 `workspace-tabs.js` 後為 94.9 KiB。**沒有調整任何預算數字**，但工作臺總量只剩約 0.1 KiB。

## 3. 本機驗證（Node 24.15.0；repo 要求 ≥24.20，只出現警告）

| Gate | 結果 |
| --- | --- |
| Firestore Emulator 完整套件（`test:rules`） | PASS：31/31 檔、320/320 案例，464 秒 |
| 受影響的兩個 Emulator 檔 | RED 重現後 PASS：14/14 |
| E2E `auth-rbac` 群組（3 個 spec，與 CI 同一組檔案） | 補 `/me` 後先為 28 PASS／1 FAIL（延後載入案例）；最終 29/29 PASS |
| E2E `appointments` 群組（Calendar 開機、舊登入閃爍、週曆、工作臺生命週期） | 44/44 PASS |
| 完整 unit（Windows 本機，`test:unit` 同一組排除條件） | 最終 2675 PASS／1 FAIL／1 SKIP，共 2677 個、213 個檔。唯一 FAIL 是既有的 Windows FTP 相容性測試（`ECONNRESET`），先前基準相同，不 skip、不 waive。第一次整套執行另有兩個失敗：`staff-booking-surfaces` 讀的開機字串已搬到 `calendar-pilot-boot.js`，已改為讀取該模組並保留同樣的檢查；`recovery-clone-verify` 的 `getAll` 案例在高負載下逾時，單獨與第二次整套執行皆通過，以 Linux CI 為準 |
| 刻意破壞檢查（7 個變體） | 7/7 被抓到；每次執行後原檔還原 |
| ESLint（所有變更檔）、Prettier（所有變更檔）、`git diff --check` | PASS |
| `check-structure`、`check-architecture`、`check:ui`、`check:pages`、`check:tokens`、`check:docs`、`check:governance`、`check:secrets`、`check:e2e-groups`、`check:sync` | PASS |
| `check:perf` | PASS；`/index.html` 文件 9.9、script 66.4／67、樣式 16.0、圖片 2.6、總量 94.9／95 KiB |
| 本機 Semgrep | NOT_RUN：本機未安裝；以 exact-head CI 的 `sast` job 為準 |
| 其餘 E2E 群組、完整 Linux unit | 交給 exact-head CI |

**本機 Emulator 的兩個舊失敗。** 先前紀錄的「direct run timeout 300 秒」：這台機器跑完整套件需約 464 秒，外層 300 秒上限必然中斷，屬執行方式問題，不是測試組合問題；本次不包外層 timeout 即完整通過。`stdin is not a tty`：本次把 stdin 接到空裝置並關閉 corepack 下載提示後**未重現**，只能記為 NOT REPRODUCED，不宣稱已修。

## 4. 29 個 ID 逐列狀態

狀態只代表本分支的 source/test 與本機證據；exact-head CI、合併、部署與線上實測分欄看待，任何一列都還沒有 merge 或 runtime 證據。「SOURCE_FIXED」＝程式修補加回歸測試已在分支、本機通過、等 exact-head CI；不是結案。

| ID | 群組 | 狀態 | 證據／剩餘 |
| --- | --- | --- | --- |
| K2 | 身分 | SOURCE_FIXED | intake 在預約交易內準備與套用；失敗預約不留 patient 或索引（Emulator 案例）。不含任何既有資料修復。業主 2026-10-10 另選「身分衝突改為待櫃台確認」，屬後續新功能，未實作 |
| NEW-01 | 身分 | SOURCE_FIXED（fail-closed） | 未綁定的 Firebase UID 不再取得病患身分（`sol29-boundaries`）。合法綁定來源尚未設計，病患 Firebase 路徑目前等於關閉；其他呼叫端是否依賴此路徑尚未搜尋 |
| B-34 | 身分 | OPEN | domain 正規化已加嚴，但 `packages/contracts` 的 wire schema 未變；收緊屬公開契約變更，需相容性評估 |
| D-10 | 身分 | SOURCE_FIXED | 電話位數、有效月日與短識別值遮罩（`patient-identity.sol29`） |
| K4 | 回診 | PARTIAL | full-key namespace、舊 alias 保守沿用、並發不超額（`rate-limit.repository`）。到期清除與爭用回應契約未做；key 切換方式業主已選「下次部署直接切」，仍需部署授權 |
| D-08 | 回診 | BLOCKED | HMAC 只有候選向量測試；未建 secret、未做識別鍵轉換，需另行授權 |
| E3-19 | 回診 | OPEN | 限流文件仍未記錄完整速率參數；本分支未處理 |
| K3 | session | OPEN（政策） | 停用帳號仍與一般驗證失敗共用對外分類；與 A10 同根，新增專用代碼沒有政策授權。簽發途中帳號狀態改變已有拒絕案例，但不等於本列結案 |
| E4-14 | session | PARTIAL | limiter 已改為必需並有「缺少即拒絕啟動」案例；`accountActive` 寫死仍在商務服務中，需重新判定 |
| C02 | session | SOURCE_FIXED | 工作臺只顯示 server 確認的 actor（`staff-booking-surfaces`、`bootstrap-authority-order`、E2E） |
| NEW-02 | session | SOURCE_FIXED | staff Bearer 不能取代 server session（`auth-boundary.regression`） |
| NEW-03 | session | SOURCE_FIXED | allowlist 任何重疊即拒絕，不退回 manager（`sol29-boundaries`） |
| NEW-07 | session | SOURCE_FIXED | `lastSeenAt` 節流寫入（`sol29-boundaries`） |
| NEW-08 | session | SOURCE_FIXED | 建立 session 前先做 IP 與帳號配額（`calendar-session-authority`）。多實例容量未證明 |
| X-C02 | session | SOURCE_FIXED | 快取 CSRF 只是提示，一律由 `/me` 驗證（`frontend-session-authority`、business-tab／legacy-login-flash E2E） |
| B-03 | 入口 | BLOCKED | 需要實際 ingress／XFF 形狀的唯讀證據，屬受保護的線上操作 |
| E1-04 | 入口 | NO_CHANGE（現行 source 為精確集合） | 本分支未改此檢查；現行 `evaluateC1FirebaseAuthDomain` 以精確主機集合判定，並有本分支新增的拒絕案例。歷史 claim 本身未驗證 |
| E1-14 | 入口 | SOURCE_FIXED | 不再以子字串推斷；改為語法樹檢查加比對函式自身的 import 測試（本次） |
| K6 | 入口 | SOURCE_FIXED | IPv6 正規化、不做 /64 聚合（SOL-00 §3 已定）；與 K4 的 key 切換同一部署批次 |
| K9 | 入口 | SOURCE_FIXED | 隔離測試 gate 改為 UTC 與 loopback emulator 約束（`auth-boundary.regression`） |
| X-C06 | 入口 | SOURCE_FIXED | 預覽主機判定由排除清單改為核准主機規則（`frontend-trust-boundary`） |
| C03 | session UI | SOURCE_FIXED | 遠端探測失敗不顯示本機帳密提示（`frontend-policy-evidence`、legacy-login-flash E2E） |
| C09 | session UI | SOURCE_FIXED | 病患 transport 不繼承 staff 或 Calendar 再驗證 token（`frontend-trust-boundary`） |
| X-C04 | session UI | SOURCE_FIXED | 候選審核與商務寫入失敗後恢復同一個控制項、維持單一進行中 |
| X-C05 | session UI | NOT_A_BUG（工程判定） | 週曆以最早資料定位是刻意的；SOL-00 §3 判定沒有 Canon 缺陷證據，保留現行預設並以測試釘住 |
| A01 | HTTP | SOURCE_FIXED | 非法 booking 路徑 ID 回安全的 400（`sol29-http-boundary`） |
| A11 | HTTP | SOURCE_FIXED | 非法 Calendar 路徑 ID 回安全的 400，且不改動資料 |
| K5 | HTTP | SOURCE_FIXED | 全域例外處理由根模組持有，不依附試行模組 |
| NEW-04 | HTTP | SOURCE_FIXED | 損壞的 session cookie 視為驗證失敗並清除（`auth-boundary.regression`） |

小計（共 29）：SOURCE_FIXED 20、PARTIAL 2、OPEN 3（含 K3 政策題）、BLOCKED 2、NO_CHANGE 1、NOT_A_BUG 1。

## 5. Blockers 與已記錄的決定

1. **限流 key 切換**：業主 2026-10-10 選「下次 C1 部署時直接切換，舊計數作廢」（已記入決定登記簿）。不再是政策 blocker，但部署本身仍需該次精確版本的授權，且不得混跑新舊 writer。
2. **HMAC 金鑰與識別鍵轉換（D-08）**：BLOCKED，需建立 secret 與資料轉換的另行授權。
3. **線上 ingress／provider 實證（B-03、NEW-08 容量）**：BLOCKED，需受保護的唯讀線上操作。
4. **政策**：session 實體保存期限（A05）業主已選 24 小時，屬 SOL-04 範圍，尚未實作也尚未記入登記簿；K3 停用帳號分類維持現狀，無政策授權不新增代碼。
5. **新功能**：身分衝突改為「待櫃台確認」已記入登記簿，未實作；保存期限、可見範圍與稽核需另行設計。

## 6. 不在本次範圍

沒有 merge、deploy、修改 secret／IAM、執行 migration 或接觸真實資料；沒有啟動 Luna。`/clinic` 官網與其他 Sol 工作包不在本分支。

## 7. 下一步

1. 讀回本分支新 head 的完整 required CI（verify、rules、六個 E2E 群組、audit、SAST、Gitleaks 與彙總），結果寫在 PR 說明。
2. 全綠後做一次獨立的唯讀審查，再交業主 review；合併需業主另行決定。
3. 合併後依序處理 OPEN／PARTIAL 列（B-34、E3-19、K4 剩餘、E4-14），各自開新的工作包。
