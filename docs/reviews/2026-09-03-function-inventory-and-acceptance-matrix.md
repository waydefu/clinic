# Day 1：Function Inventory 與 Acceptance Matrix

**狀態：** dated 盤點與可驗收切片。**不是** Canon、不是 D-series 核准、
不是實作授權。
**日期：** 2026-09-03（Asia/Taipei）
**Source 基準：** `origin/main`
`c2a50139ef220a21f0cfc768846c54373729df57`
**Runtime 基準：** CAL-PILOT staging
`https://beauessence-clinic-staging--cal-pilot-pk9yyofq.web.app/`
（Hosting Last-Modified 2026-09-01T11:06:50 GMT）
**業主要求來源：** 章程 v2.0 業主 2026-09-03 簽署的 Q1–Q22
**本文件不得引用自己的 commit hash。** 查提交：`git log --
docs/reviews/2026-09-03-function-inventory-and-acceptance-matrix.md`

調查細節與 hypothesis 表見
[Day 1 scope lock 與 auth 事故](2026-09-03-day1-scope-lock-and-auth-incident.md)。

產品程式在本 Day 1 交付：**NONE**。本檔只記錄現況。

狀態列舉：`IMPLEMENTED` / `PARTIAL` / `MISSING` / `BROKEN` /
`BLOCKED_BY_AUTHORITY` / `NOT_APPLICABLE`。

Day target：D2 = Auth／front door；D3 = Booking；D4 = API／RBAC；D5 =
Workbench／Calendar；D6 = Hardening；D7 = RC。`—` = 非本週或須先對帳。

## 1. 摘要計數

§2.1–2.7 列計數（不是品質分數；§2.8 條件式列另計）：

- IMPLEMENTED：16
- PARTIAL：43
- MISSING：1（患者改期）
- BROKEN：3（404 recovery、Google bounce／未完成 callback、取消跨層）
- BLOCKED_BY_AUTHORITY：2（production Calendar PII、真人 AT／usability 本週宣稱）
- NOT_APPLICABLE：0（§2.8 另有 1 列：不得把 RC 標成 VERIFIED-PRODUCTION）

§2.8 另列 MISSING `/staff` 與正式 local+MFA IdP，以及多項真實資料
BLOCKED。舊登入 flash 含在 IDENTITY session restore／PUBLIC 入口，不另
佔一列。

最重要缺口：Google bounce（LIKELY、未 CONFIRMED）、舊登入 flash
（CONFIRMED）、404 回到 staff `/`、取消／cutoff／horizon／醫美／上限 2
跨層不一致、患者改期缺失、booking 寫入 API 未 routed。

## 2. Function Inventory

### 2.1 PUBLIC

| 功能 | 狀態 | Source | Test | Runtime | Owner | Day | PR slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| clinic | IMPLEMENTED | `clinic.html` 路由 | e2e／UI 既有 | staging `/clinic` HTTP 200 | 公開站 | D6 polish | 非 D2 |
| doctors | IMPLEMENTED | `/clinic/doctors` | 既有 | 本 session 未點入 | 公開站 | D6 | 非 D2 |
| service pages | IMPLEMENTED | `/clinic/nasal/*` | 既有 | 未點入 | 公開站 | D6 | 非 D2 |
| privacy | PARTIAL | `privacy.html` 草稿政策 | 既有 | 未點入 | Q14 要正式 email+電話 | D6／法律 | 文案非 D2 |
| booking entry | PARTIAL | `/booking` → patient.html | e2e 合成 | staging `/booking` 200；CAL-PILOT 可覆蓋 | 預約入口 | D3 | 與 catalogue 同 PR 棧 |
| 404 品牌頁 | PARTIAL | `404.html` | PEA 本機 0-byte | staging 品牌 404 1344 bytes | Q4 front door | D2 | Hosting 已送品牌頁 |
| 404 recovery | BROKEN | `href="/"` | PEA | 「回到首頁」進 staff `/` | 不得進 staff | D2 | `404.html` → `/clinic` |

### 2.2 IDENTITY

| 功能 | 狀態 | Source | Test | Runtime | Owner | Day | PR slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Google sign-in | BROKEN | `calendar-pilot-entry.js` redirect | 無 bounce e2e | 到 Google identifier；callback 未完成 | Google 為主 | D2 | 先重現 callback，再 Option 1 |
| local fallback | PARTIAL | 合成 `#login-view`；非 Firebase password | `test-only-auth.test.ts` | 合成頁仍在 HTML | Q2 備援+MFA | D4 | 不可把合成帳密當正式 IdP |
| MFA | PARTIAL | CAL-PILOT TOTP enroll／sign-in | session tests | UI 文案要求 TOTP；未走完 | Q2 兩者 MFA | D2／D4 | Pilot 已強制；local 未做 |
| session restore | PARTIAL | CSRF sessionStorage + cookie | session tests | 先畫 login 再 restore | 選帳後可進系統 | D2 | 等 auth 完成再決定 route |
| idle timeout | IMPLEMENTED | `IDLE_SESSION_MS` 30 分 | calendar-pilot-session.test.ts | 未等到期 | D-006 | D4 回歸 | 不改值 |
| absolute timeout | IMPLEMENTED | `ABSOLUTE_SESSION_MS` 8 時 | 同上 | 未測 | D-006 | D4 | 不改值 |
| account disable | PARTIAL | authenticate 檢查 disabled | 有單元測試 | 未測 | 下一個 request 拒絕 | D4 | 保持 server 拒絕 |
| logout | IMPLEMENTED | `DELETE /calendar-session` | 有 | 未點 | 登出後不可用 | D2 驗收 | 加回歸 |
| RBAC bootstrap | PARTIAL | email 白名單；非 profile doc | session tests | 未完成登入 | 未授權 server 拒 | D2／D4 | 401 勿偽裝成「沒登入」而無說明 |

### 2.3 PATIENT

| 功能 | 狀態 | Source | Test | Runtime | Owner | Day | PR slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| first visit | IMPLEMENTED | 合成 patient-app | e2e | staging 被 pilot 覆蓋，未走完 | 初診 | D3 | 合成旅程回歸 |
| return visit | IMPLEMENTED | 同上 | e2e | 同上 | 回診 | D3 | 同上 |
| service selection | PARTIAL | `PATIENT_SERVICES` 含醫美 | UI | 未點 | Q10 醫美移除 | D3 | 刪 `service_aesthetic` |
| availability | PARTIAL | 合成時段；horizon 60 天 | e2e 60 天 | 工作臺見 60 個時段 | Q8 = 1 個月 | D3 | 改 window + 測試 |
| create booking | PARTIAL | 瀏覽器 locally；API 寫入未 routed | e2e 合成 | 未建立 | 可提交 | D3／D4 | 不啟用真後端除非授權 |
| lookup | PARTIAL | 患者查詢 UI | e2e | 未測 | 可查 | D3 | |
| cancel | BROKEN | UI `cancel`；RBAC `request_cancellation` | e2e 走 cancel | 未測患者取消 | Q5 = A | D3 | 對齊契約+RBAC+測試 |
| reschedule | MISSING | 患者端無；staff 有 | 無患者 e2e | 未測 | Q7 開放；先佔新 | D3 | 新患者改期流 |
| duplicate-submit | PARTIAL | idempotency／active limit 1 | domain tests | 未測 | 重複送出防護 | D3 | limit 改 2 時一起測 |
| errors／retry | PARTIAL | 合成錯誤文案 | 部分 | 未測 | 章程 DoD | D3 | 明確失敗／重試 |

### 2.4 STAFF

| 功能 | 狀態 | Source | Test | Runtime | Owner | Day | PR slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| overview | PARTIAL | workbench | e2e／UI | a11y 見區塊；被 pilot CSS 藏 | Q4 `/staff` | D5 | 指標語意 R-P1-8 |
| appointments | PARTIAL | 同上 | 同上 | 同上 | | D5 | R-P1-6 勿顯示技術 id |
| queue | PARTIAL | 櫃台清單 | 同上 | 同上 | | D5 | |
| schedule | PARTIAL | 營業時間草稿 | 同上 | 同上 | | D5 | |
| case | PARTIAL | 個管區塊存在 | 視 isolation 分支 | 見「0 筆個案」 | D-007 pending | D5 | 真個案 BLOCKED |
| accounts | PARTIAL | 合成帳號生命週期 | test-only-auth | 見測試帳密 | 非正式 IdP | D4 | 移除公開測試帳密於 staff 入口 |
| communications | PARTIAL | 公告／維護 | 既有 | 見區塊 | | D5 | |
| audit | PARTIAL | 瀏覽器稽核清單 | 既有 | 見區塊 | 不可刪改 | D4／D5 | server audit 另軌 |
| role-based actions | PARTIAL | 合成權限；server 僅 CAL-PILOT | rbac tests | 未登入 staff | Q4／D-006 | D4 | server 拒絕未授權 |

### 2.5 BACKEND

| 功能 | 狀態 | Source | Test | Runtime | Owner | Day | PR slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| API | PARTIAL | AppModule 僅 health + CAL-PILOT | API tests | `/v1/calendar-session/client-config` 200 | 受保護經 API | D4 | 不偷偷接 booking write |
| persistence | PARTIAL | Emulator／pilot Firestore | rules／transaction tests | 未連 production | 真資料 BLOCKED | D4 | |
| transaction | IMPLEMENTED | domain booking-transaction | 單元+emulator | 未對 staging 預約寫入 | 同時段／同患者 | D3／D4 | |
| idempotency | IMPLEMENTED | 契約+測試 | 有 | 未測 staging 寫入 | 重複送出 | D3／D4 | |
| audit | PARTIAL | audit v2 骨架 | 有 | 未測 | 可追溯 | D4 | |
| outbox | IMPLEMENTED | worker 骨架 | 有 | CAL-PILOT 路徑 | 外部 effect 不進 txn | D4／D5 | |
| worker | PARTIAL | CAL-PILOT worker | 有 | 未跟本次登入 | | D5 | |
| retry | PARTIAL | runbook+code | 有 | 未製造失敗 | | D5 | |
| dead-letter | PARTIAL | 工作臺示範＋worker | 有 | 未測 | 人工復原 | D5 | |

### 2.6 CALENDAR

| 功能 | 狀態 | Source | Test | Runtime | Owner | Day | PR slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| outbound projection | PARTIAL | CAL-PILOT | 部署紀錄 | 本調查未跟 event | 最小欄位 | D5 | 不寫真實 PII |
| inbound candidate | PARTIAL | controlled correction | 有 | 未測 | Q16 review | D5 | |
| review | PARTIAL | staff candidates UI | 有 | 未登入 | 授權 staff | D5 | |
| conflict／etag | PARTIAL | fence stale updates | 有 | 未測 | | D5 | |
| cursor | PARTIAL | syncToken／410 | 有／runbook | 未測 | | D5 | |
| full resync | PARTIAL | runbook | 有限 | 未測 | | D5 | |
| kill switch | PARTIAL | 30 天 pilot 到期／文件 | 部署紀錄 | 未操作 | | D5 | |
| production Calendar PII | BLOCKED_BY_AUTHORITY | ADR-0002＋Safety Floor | — | — | Q15 僅需求 | — | **禁止**本週啟用 |

### 2.7 QUALITY

| 功能 | 狀態 | Source | Test | Runtime | Owner | Day | PR slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mobile | PARTIAL | UI 規則+e2e 部分 | 既有 | 本調查桌面 Electron | 360／390 | D6 | |
| keyboard | PARTIAL | UI 規則 | e2e keyboard | 未做完整鍵位 | | D6 | |
| accessibility | PARTIAL | axe 自動化 | 既有 | 未做報讀器 | R-P1-11 OUT | D6／D7 smoke | 不宣稱真人 AT |
| visual states | PARTIAL | PEA R-P1-10 | 部分 | 登入卡有警告 | empty／loading | D5／D6 | |
| performance | PARTIAL | budgets | check | 未測 CWV | 不退步 | D6 | |
| SAST | IMPLEMENTED | Semgrep CE merge-blocking | CI | 本調查 NOT_RUN | 不退步 | D7 | 文件 PR 走 CI |
| dependency | IMPLEMENTED | audit gates | CI | NOT_RUN | 不退步 | D7 | |
| secret scan | IMPLEMENTED | tracked-secret | CI | NOT_RUN | 無 secret 進檔 | D1 本檔自檢 | 不寫 apiKey／token |
| SBOM | IMPLEMENTED | supply-chain | CI | NOT_RUN | | D7 | |
| provenance | IMPLEMENTED | attest job | CI | NOT_RUN | | D7 | |
| rollback | PARTIAL | runbooks | 未演練本次 | 未演練 | 可執行 | D7 checklist | |
| smoke | PARTIAL | preview／pilot 紀錄 | 歷史 | 本調查未登入後 smoke | D7 | staging smoke | |
| 真人 usability／AT | BLOCKED_BY_AUTHORITY | PEA | 無 | 無 | R8 本週不造假 | — | NOT_APPLICABLE 當「本週完成宣稱」 |

### 2.8 條件式／阻擋（章程 §5）

| 功能 | 狀態 | 說明 |
| --- | --- | --- |
| 真實病患資料 | BLOCKED_BY_AUTHORITY | Safety Floor 1；D-001～D-003 pending |
| 手術／麻醉／真實臨床 | BLOCKED_BY_AUTHORITY | Q17 = 本週只做 synthetic；D-014 pending |
| 真付款／退款／薪資入帳 | BLOCKED_BY_AUTHORITY | Q18；D-015 pending |
| production identity／secrets | BLOCKED_BY_AUTHORITY | Q20／D-006 實作證據 pending |
| 正式對外 production domain | BLOCKED_BY_AUTHORITY | 本週停 staging |
| no-show 自動限制權益 | BLOCKED_BY_AUTHORITY | Q12 本週不做 |
| booking retention 政策 | BLOCKED_BY_AUTHORITY | Q13 延後 |
| `/staff` 路由 | MISSING | Q4 要；現況 `/` = 工作臺 |
| 患者線上改期 | MISSING | 見 PATIENT |
| 正式 local+MFA IdP | MISSING | 合成帳密不是備援策略的實作 |

`NOT_APPLICABLE`：把本週 RC 宣稱成 VERIFIED-PRODUCTION（章程明確禁止）。

## 3. Acceptance Matrix（Day 2–7）

準則：二元、可測；能自動化就自動化；不能則標 `manual`。禁止「看起來正常」。

### 3.1 Day 2 — Auth／front door

| ID | PASS 當且僅當 | Auto／manual |
| --- | --- | --- |
| A-D2-01 | 點 Google 後到達 Google 帳號選擇／identifier，`redirect_uri` 主機與當時 `authDomain` 一致 | auto 可抓起始導向；選帳 `manual` |
| A-D2-02 | 選完帳號後 callback 回到原 Hosting 網域，無無限 redirect loop | `manual` 至有測試帳；之後盡力 auto |
| A-D2-03 | `getRedirectResult` 完成或 `onAuthStateChanged` 離開 intermediate **之後**，才做 protected-route 決定 | auto（單元／組件時序） |
| A-D2-04 | 白名單角色進入 staff／pilot 應用面 | `manual`＋API 契約測試 |
| A-D2-05 | 非白名單：server 拒絕；訊息不是沉默空白登入 | auto API＋一則 UI |
| A-D2-06 | idle 內 refresh 不丟 session | auto／`manual` cookie |
| A-D2-07 | 登出後同一個 protected `/v1/calendar-*` 再呼叫失敗 | auto |
| A-D2-08 | 首次載入 **0 ms 起** 使用者看不到「登入營運工作臺」或測試帳密（含 CAL-PILOT 啟用時） | auto（first-paint／CSS／markup） |
| A-D2-09 | 無 CAL-PILOT 無限閃爍 loginView | auto 時序 |
| A-D2-10 | 未知路徑品牌 404；「回到首頁」→ `/clinic`；「前往線上預約」→ `/booking`；兩者都不進 staff 登入 | auto HTTP＋href |
| A-D2-11 | 無痕模式結果有紀錄（成功或明確失敗 class） | `manual` |
| A-D2-12 | 一般 Chrome vs 內建 Electron 結果分開記，不混為同一證據 | `manual` |
| A-D2-13 | 回歸測試可在 CI 重跑 A-D2-03／07／08／10 | auto |

**FAIL 例子：** 只證明「有跳到 Google」；或把 popup 換成 PASS。

### 3.2 Day 3 — Booking

| ID | PASS 當且僅當 | Auto／manual |
| --- | --- | --- |
| A-D3-01 | 患者取消後狀態 `cancelled` 且時段可再預約（語意 A） | auto domain+e2e |
| A-D3-02 | `request_cancellation` 若仍存在，只用於明確的非患者路徑，並有測試 | auto |
| A-D3-03 | 自助取消截止 = 預約當日 10:00 Asia/Taipei；09:59 可、10:00 後不可 | auto 固定時鐘 |
| A-D3-04 | 患者改期：新時段 reserve 成功才 release 舊；新失敗則舊單不變 | auto |
| A-D3-05 | horizon 與 UI／e2e 同為「1 個月」定義（文件寫明日曆規則） | auto |
| A-D3-06 | 同時段第二位 → `SLOT_UNAVAILABLE` | auto |
| A-D3-07 | catalogue 無醫美；公開站與 booking 同一清單 | auto |
| A-D3-08 | 同一患者未完成預約上限 2；第 3 筆被拒 | auto |
| A-D3-09 | 證件原文不出現在 URL、前端一般畫面、測試 artifact | auto grep＋UI |
| A-D3-10 | 重複送出：第二次不建立第二筆成功預約 | auto |
| A-D3-11 | 失敗有明確錯誤與可重試路徑，無靜默成功 | auto／`manual` |

Day 3 **先**完成 register 對帳紀錄，再改程式。對帳文件仍不是 Canon 重寫，
除非另有核准格式。

### 3.3 Day 4 — API／persistence／RBAC

| ID | PASS 當且僅當 | Auto／manual |
| --- | --- | --- |
| A-D4-01 | 瀏覽器不直連 Firestore（既有 ADR／architecture gate） | auto `check:architecture` |
| A-D4-02 | 未授權 action HTTP 403／401 由 server 決定，不是只藏按鈕 | auto |
| A-D4-03 | 寫入具 idempotency key 行為測試 | auto |
| A-D4-04 | 停權後下一個 protected request 失敗 | auto |
| A-D4-05 | 不把真實病患／薪資資料寫進 emulator 以外的雲端 | `manual` 審查 diff |

### 3.4 Day 5 — Workbench／Calendar

| ID | PASS 當且僅當 | Auto／manual |
| --- | --- | --- |
| A-D5-01 | staff 深層連結／refresh／back-forward 不進錯頁（對當時 staff URL） | auto |
| A-D5-02 | empty／loading／success／permission denied 各有可斷言節點 | auto |
| A-D5-03 | Calendar 事件無真實姓名／電話／病歷／麻醉／付款 | auto fixture＋`manual` staging |
| A-D5-04 | inbound 變更先成 candidate，未審核不寫回 availability 正本 | auto |
| A-D5-05 | kill switch／dead-letter 有 runbook 步驟可執行（演練可 `manual`） | `manual` |

### 3.5 Day 6 — Hardening

| ID | PASS 當且僅當 | Auto／manual |
| --- | --- | --- |
| A-D6-01 | axe serious／critical = 0（自動化證據，不宣稱真人 AT） | auto |
| A-D6-02 | 360／390 核心流無 blocking overflow | auto＋`manual` |
| A-D6-03 | 既有 performance budget 不退步 | auto |
| A-D6-04 | SAST／secret／dependency／SBOM 既有門檻不放寬 | auto CI |

### 3.6 Day 7 — RC

| ID | PASS 當且僅當 | Auto／manual |
| --- | --- | --- |
| A-D7-01 | 該 RC **exact head** 的 `Verification evidence` 綠 | CI |
| A-D7-02 | staging smoke 清單逐項記 PASS／FAIL／NOT_RUN | `manual`＋auto 子集 |
| A-D7-03 | rollback checklist 存在且步驟可執行 | `manual` |
| A-D7-04 | 若任一 production 核准缺失 → 狀態停在 VERIFIED STAGING，不標 VERIFIED-PRODUCTION | 文件＋`manual` |

## 4. 建議 Day 2 PR 順序（本週未開工）

1. P0 flash：first paint 隱藏合成登入。
2. P0 404 recovery：`href` → `/clinic`。
3. P0 bounce：僅在 callback 證據後做 authDomain Option 1 與
   `onAuthStateChanged`；禁止 popup 當正式解法。

## 5. Verification

本檔與事故調查一同提交。產品 code **NONE**。

**Staging 既有部署：** `DEPLOYED-NOT-SMOKED`

**產品程式變更 rung：** `N/A`
