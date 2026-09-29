# ADR-0008：商務交付用量與里程碑（CP-03）

**狀態：** 已接受（依業主決定 `BD-POLICY-2026-09-29`）
**日期：** 2026-09-29

## 背景

業主 2026-09-29 決定：每月「完全未使用」以伺服器紀錄判定、排除測試／維護帳號、
月底後 5 天截止、缺漏改人工確認；`CURRENT_PROJECT_ACCEPTANCE` 只是工程驗收，
尾款需真實運行滿一個日曆月＋負責人確認；測試期 20 天（含當天）＋最多調 10 天
（見[政策封板](../product/2026-09-29-business-delivery-policy-decisions.md)）。
#149／#152 已有純 domain 計算，但沒有事件來源、儲存、API 與權限。
本 ADR 固定 CP-03 的技術映射，不改政策。

## 決定

### 事件在同一個交易裡寫

- **員工登入：** `CalendarPilotSessionService.create` 在同一個 Firestore 交易裡建立
  session、`bd_usage_events` 的 `staff_login`，以及第一次 runtime 登入時的
  `bd_milestones/first_eligible_use`（測試期起算）。
- **預約建立：** `FirestoreBookingRepository.reserve` 在預約交易裡寫
  `booking_created`，文件 ID 由預約 ID 雜湊而來、用 `set` 冪等；重送在寫入前就返回，
  所以一筆預約只算一次。病患或員工建立的預約都算，因為兩者都走同一條寫入路徑。
- 事件不含 email、UID、姓名、電話、生日。員工以 UID 的 SHA-256 代表，只用來算人數。
- 維護／開發帳號由 `BUSINESS_DELIVERY_MAINTENANCE_EMAILS` 在**登入當下**分類，
  之後改設定不會改寫歷史。
- 事件寫入永遠開啟，不跟報表開關綁在一起，覆蓋率才不會因為開關而出現缺口。

因為事件與業務動作同交易，資料缺漏只剩兩種：「觀測還沒開始」與「晚到事件還可能進來」。
`assessMonthlyUsageCompleteness` 據此判定 `complete`／`partial`／`unknown`；
非 `complete` 一律 `insufficient_evidence`，維護費顯示為 `null`（要人工確認），
絕不當成零。

### 里程碑

- 測試期：由 `first_eligible_use` 算，20 天含當天。
- 正式上線日：**業主確認**的日期（第一次用真實資料開放病患預約），不由系統推定。
- 正式運行滿月：上線日＋1 個日曆月（月底夾到較短月份）。
- 尾款：滿月前一律 `blocked`，滿月後仍要業主確認；時間經過本身永遠不會付款。
- 維護費：尾款確認的隔天（台北日期）起算。

確認寫在 `bd_milestones/acknowledgements`（樂觀版本號＋冪等鍵，同鍵異內容回 409），
並在同一個交易裡建立 `bd_milestone_acknowledgement_log` 的只增紀錄。人與時間由伺服器
session 與時鐘決定，請求只帶證據參照與上線日期。

### 路由與權限

| 路由 | 權限 |
| --- | --- |
| `GET /v1/business-delivery/monthly-usage?month=YYYY-MM` | `read_business_delivery` |
| `GET /v1/business-delivery/milestones` | `read_business_delivery` |
| `POST /v1/business-delivery/milestones/:id/acknowledgements` | `acknowledge_business_milestone`＋重新驗證 |

- 兩個權限只給 `manager`（連 `system_admin` 都不給）。
- 所有路由需要 Google＋TOTP 員工 session（POST 另需 CSRF）。
- 確認動作另需 `x-reauth-id-token`：重新登入取得的 ID token，須未撤銷、同一人、
  有 TOTP，且登入時間在 10 分鐘內。token 不儲存、不記錄。
- `BUSINESS_DELIVERY_ENABLED`、`_POLICY_VERSION`、`_SCOPE`、`_OBSERVED_SINCE`
  任一缺漏或不合法，路由一律回 404，並且在授權檢查之前就回。
- 政策版本只有已核准的 `BD-POLICY-2026-09-29`，且只核准 `internal_synthetic`。

## 不在本 ADR

- **工作臺 UI。** `/index.html` 的傳輸預算只剩 5 B，加任何入口都超過。要不要另開
  staff 頁（自己的預算）或調整預算，需另外決定；API 先交付。
- 雲端部署、設定 `BUSINESS_DELIVERY_*`、C1 runtime 證據，都依 R-DEPLOY 另外核准。
- 自動開帳單、扣款、停權。

## 後果

- 登入從一次寫入變成一個交易，並多讀一份文件。
- 月報每次查詢都讀該月全部事件；一間診所一個月的量不大，目前不另建彙總表。
- 事件文件與預約／session 同生命週期規則，保存與刪除屬 CP-05。
