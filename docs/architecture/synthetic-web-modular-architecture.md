# 預約網站模組化架構

## 目的

本架構服務 Phase 1 測試版，但模組邊界刻意對齊未來 API、Android、iOS 與 NAS。瀏覽器資料層未來可替換成 `/v1` API client；排班、權限、預約、回診與個管規則不應被 UI 或 Firebase SDK 綁定。

**規則單一來源（2026-07-22 起）**：預約規則只存在 `packages/domain`。其編譯產物由 `scripts/sync-domain-vendor.mjs` 同步到 `apps/web/public/vendor/domain/`，瀏覽器透過 `modules/domain-rules.js` 呼叫共用斷言，並把錯誤碼翻成中文訊息。改規則只改 `packages/domain` 一處，`check:sync` 會擋下未同步的 vendor（ADR-0004）。

## 模組地圖

| 模組 | 單一責任 | 未來替換方式 |
| --- | --- | --- |
| `modules/constants.js` | 時區、掛號別、時段格、服務與手術項目、標籤、角色與權限 | 由 contracts/config 提供版本化設定 |
| `modules/permissions.js` | 目前帳號、角色權限集合與動作授權 | 正式版由 API middleware／policy engine 執行 |
| `modules/schedule-engine.js` | 瀏覽器端排班投影、時段產生與發布影響；共享 invariant 來自 `packages/domain/schedule` | 正式版由 API 交易發布版本，瀏覽器只保留呈現轉換 |
| `modules/appointment-domain.js` | 建立、取消、改期、未到、到診、逐筆回診與 audit/outbox 意圖；規則來自共用斷言 | 移至 API transaction；規則已與伺服器共用 |
| `modules/domain-rules.js` | 呼叫 `packages/domain` 的共用斷言，並把錯誤碼翻成中文訊息 | 正式版由 API 回傳錯誤碼，前端做 i18n |
| `modules/patient-registry.js` | browser-local 患者登錄 facade；識別驗證、比對與遮罩規則來自 `packages/domain/patient-identity` | 正式版由 API 驗證與保存，瀏覽器不保有 identity registry |
| `modules/calendar-export.js` | `.ics` 與 Google 日曆連結 | 純前端，正式版沿用 |
| `modules/case-management.js` | 個管清單投影；指派／改派與工作量規則來自 `packages/domain/case-assignment` | 正式版由 API 保存有效期間，月結鎖定由 API 管理 |
| `modules/workspace-domain.js` | 合成帳號、公告、維護排程與發布紀錄 | 正式 IAM、CMS 與 deployment service adapter |
| `modules/state-schema.js` | 合成 state schema、預設值與 localStorage | 替換成 versioned API DTO，不讓 UI 直接碰 Firestore |
| `store.js` | browser-local synthetic command/query transport | 正式版不由 controller 直接匯入；只作 `api-client.js` 的 Stage 0 transport |
| `modules/api-client.js` | 可注入 transport、標準錯誤 metadata、安全 GET retry；POST 不自動重放 | 注入 HTTPS `/v1` transport，保留 controller request 語意 |
| `modules/async-action.js` | pending 文案、disabled／重複送出守衛與明確 retry handoff；狀態由 `role="status"` 公告，按鈕不設 `aria-busy` | 正式 API client 沿用；只有 server 標為 retryable 才顯示重試 |
| `modules/workspace-tabs.js` | 工作臺分頁切換（一次只顯示一個工作區） | 正式版若改多頁路由，只換這一個檔 |
| `modules/taipei-time.js` | Asia/Taipei 的日期／分鐘／ISO 換算單一來源 | 改時區或時間格式只改這裡；避免各檔重寫同一組 formatter（data clump） |
| `modules/week-view.js` | 預約週檢視（動態分軌、休診斜線、目前時間線）；CSSOM 定位 | 正式版可沿用或換框架元件 |
| `modules/admin-view.js` | 純 HTML renderer | 可沿用或替換為框架元件 |
| `admin-bootstrap.js` | 管理者 UI controller 與事件協調 | 呼叫正式 API client |
| `patient-app.js` | 患者四步驟流程與逐欄驗證 | Web／Android／iOS 共用 API contract |

## 工作臺分頁：為什麼用 hash 而不是 History 路由（2026-07-22 決定）

工作臺的七個工作區改為一次只顯示一個（`modules/workspace-tabs.js`），路由用
`location.hash`。曾評估 History API（`/schedule` 這種路徑），**不採用**：

| 面向 | hash（採用） | History 路徑 |
| --- | --- | --- |
| 伺服器設定 | 不需要 | `firebase.json` 要加 `rewrites`，`server.mjs` 也要改 fallback（目前無副檔名的路徑一律 404）——兩份設定必須永遠一致 |
| 失敗模式 | 無 | 兩邊漂移 → **子頁重新整理變 404**，典型 SPA 部署 bug |
| 無 JS 時 | 仍是可用的錨點連結 | 需要攔截點擊，退化較差 |
| URL 美觀／SEO | 較差 | 較好——但本站全域 `noindex`，且預覽網址本身就是隨機字串 |

改用 History 的**唯一觸發條件**：需要把 hash 讓給頁內錨點時（例如深連結到
某一筆預約卡 `#appointment_001`）。屆時建議走 `?tab=` + `pushState` 的折衷，
同樣不需要伺服器 rewrite，且只需改 `workspace-tabs.js` 一個檔。

分頁與權限的關係集中在一處：管理者專屬區塊由 `admin-bootstrap.js` 標上
`data-restricted`，實際 `hidden` 一律由 `workspace-tabs.js` 決定。兩邊各自寫
`hidden` 會互相蓋掉——櫃台帳號切到排班會看到空白頁，而不是被導回營運首頁。

## 資料流

```text
Admin / Patient UI
        ↓ command
api-client.js（controller 唯一資料 seam）
        ↓ synthetic transport
store.js（browser-local command/query）
        ↓
permission / schedule / appointment / case modules
        ↓
state-schema → browser localStorage
        ↓
derived snapshot → UI renderer
```

正式版替換為：

```text
Web / Android / iOS / NAS adapter
        ↓ HTTPS /v1
apps/api：auth + authorization + validation + transaction + audit/outbox
        ↓
Firestore source of truth
        ↓
apps/worker → Calendar / notification / NAS projection
```

## 核心不變量

1. 病患時段只來自已發布排班；草稿不影響患者。
2. 發布排班不得移除 confirmed 或 cancellation_requested 預約所使用的時段。
3. 只有管理者可管理排班、回診、個管、帳號與患者端治理。
4. 櫃台可建立、取消、改期、標記未到與到診，但不能修改治理設定。
5. 回診決定必須綁定 completed appointment；系統不得自行推論。
6. 個管 credit 只來自 completed visit 加上有效個管指派，並依個管、患者、臺北月份與規則版本去重。
7. 病患取消先進入 cancellation_requested；櫃台確認後才 cancelled 並釋放時段。
8. 所有外部效果只產生 outbox 意圖；瀏覽器不直接呼叫 Calendar、Firebase DB 或 NAS。

## 開發導覽

- 改排班：先讀 `schedule-engine.js` 與對應測試。
- 改預約狀態：先讀 `appointment-domain.js`。
- 改個管統計：先讀 `case-management.js` 與 `docs/payroll/month-close-spec.md`。
- 改角色：先讀 `permissions.js`，不可只隱藏 HTML。
- 改管理頁：`index.html` 管語意結構、`admin-view.js` 管 rendering、`admin-bootstrap.js` 管事件。
- 改患者頁：欄位採允許清單（`scripts/check-web-ui.mjs`）。2026-07-21 首次核准
  姓名、電話、生日與身分證；2026-07-27 擴充為姓名、電話、生日（月日必填、
  年份選填）、身分證／居留證或護照、健保卡攜帶意向、患者備註，以及本次門診
  與來源標籤。**新增任何其他欄位**（Email、LineID、性別、付款等）仍須先取得
  隱私與資料最小化決策。
- 改領域規則：只改 `packages/domain/src/appointment-rules.ts`，再 `pnpm build` 同步 vendor；瀏覽器透過 `modules/domain-rules.js` 呼叫同一份，不需要（也不應）另寫一份。
