# 合成預約網站模組化架構

## 目的

本架構只服務 Phase 1 合成測試版，但模組邊界刻意對齊未來 API、Android、iOS 與 NAS。瀏覽器資料層未來可替換成 `/v1` API client；排班、權限、預約、回診與個管規則不應被 UI 或 Firebase SDK 綁定。

## 模組地圖

| 模組 | 單一責任 | 未來替換方式 |
| --- | --- | --- |
| `modules/constants.js` | 時區、合成視窗、角色、權限與固定測試字典 | 由 contracts/config 提供版本化設定 |
| `modules/permissions.js` | 目前帳號、角色權限集合與動作授權 | 正式版由 API middleware／policy engine 執行 |
| `modules/schedule-engine.js` | 排班驗證、有效區間、時段產生與發布影響 | 移至 `packages/domain`，API 交易發布版本 |
| `modules/appointment-domain.js` | 建立、取消、完成到診、逐筆回診與 audit/outbox 意圖 | 移至 domain/API transaction |
| `modules/case-management.js` | 個管指派、月度不重複患者與待辦 | 移至 domain；月結鎖定由 API 管理 |
| `modules/workspace-domain.js` | 合成帳號、公告、維護排程與發布紀錄 | 正式 IAM、CMS 與 deployment service adapter |
| `modules/state-schema.js` | 合成 state schema、預設值與 localStorage | 替換成 versioned API DTO，不讓 UI 直接碰 Firestore |
| `staging-store-v2.js` | 合成 command/query dispatcher | 替換成 `api-client.js`，保留相同 command 語意 |
| `modules/admin-view.js` | 純 HTML renderer | 可沿用或替換為框架元件 |
| `admin-bootstrap.js` | 管理者 UI controller 與事件協調 | 呼叫正式 API client |
| `patient-app-v2.js` | 病患四步驟流程 | Web／Android／iOS 共用 API contract |

## 資料流

```text
Admin / Patient UI
        ↓ command
staging-store-v2（測試 adapter）
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
4. 櫃台可建立、取消與完成到診，但不能修改治理設定。
5. 回診決定必須綁定 completed appointment；系統不得自行推論。
6. 個管 credit 只來自 completed visit 加上有效個管指派，並依個管、患者、臺北月份與規則版本去重。
7. 病患取消先進入 cancellation_requested；櫃台確認後才 cancelled 並釋放時段。
8. 所有外部效果只產生 outbox 意圖；瀏覽器不直接呼叫 Calendar、Firebase DB 或 NAS。

## 開發導覽

- 改排班：先讀 `schedule-engine.js` 與對應測試。
- 改預約狀態：先讀 `appointment-domain.js`。
- 改個管統計：先讀 `case-management.js` 與 `docs/payroll/month-close-spec.md`。
- 改角色：先讀 `permissions.js`，不可只隱藏 HTML。
- 改管理頁：`admin-shell.html` 管語意結構、`admin-view.js` 管 rendering、`admin-bootstrap.js` 管事件。
- 改病患頁：不得新增姓名、電話、Email、病情或付款欄位，除非正式隱私與資料最小化決策已核准。
