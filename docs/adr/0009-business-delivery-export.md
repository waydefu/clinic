# ADR-0009：商務交付安全匯出（CP-04）

**狀態：** 已接受（依業主決定 `BD-POLICY-2026-09-29`、`OWNER-BATCH-2026-09-29B`、
`EXPORT-CONTACT-STORAGE-2026-09-29`、`BOOKING-NOTE-STORAGE-2026-09-29`）
**日期：** 2026-09-30

## 背景

業主核准：只限管理者匯出、建立前重新以 Google＋TOTP 驗證（10 分鐘內）、只能在工作臺登入後
下載、24 小時內最多 3 次、檔案 7 天清除、本期只做 CSV。欄位為姓名、電話、生日月日、國籍、
預約時間、初診／回診、服務、狀態、備註。
（見[決策登記](../product/phase-1-decision-register.md)。）

## 決定

### 路由（全部要員工 session；POST 另需 CSRF）

| 路由 | 權限 | 另外 |
| --- | --- | --- |
| `POST /v1/business-delivery/exports` | `export_business_data` | `x-reauth-id-token`；body 只有 `idempotencyKey`、`format:"csv"`、`from`、`to` |
| `GET /v1/business-delivery/exports/:id` | 同上 | 回狀態，不回內容 |
| `GET /v1/business-delivery/exports/:id/download` | 同上 | 每次重查狀態；`text/csv`、`attachment`、`no-store` |
| `POST /v1/business-delivery/exports/:id/revoke` | 同上 | 立即刪檔並禁止下載 |

- 權限只給 `manager`。功能關閉、ID 格式不對或查無此檔一律 404。
- 欄位由伺服器固定（`BUSINESS_EXPORT_COLUMNS`），用戶端不能選欄位或格式；`xlsx` 直接拒絕。
- 日期為台北日曆日（含頭尾），單檔最長 366 天（工程上限，讓一個檔案在一個交易內完成）。

### 產檔與儲存

- 讀預約（依 `startsAt` 範圍）、以 ID 讀病患（姓名、`phoneDigits`、`birthMonthDay`），轉成 CSV：
  UTF-8 BOM、中文標題、公式字元防護、逗號與換行加引號；電話以連字號分組，讓 Excel 保留開頭 0。
- 伺服器沒有的值（例如保存電話之前建立的病患）留空，不猜、不從雜湊反推。
- `bd_export_jobs` 存中繼資料（無病患值）；檔案切成 `bd_export_chunks`（每塊 200 000 字元，
  最多 20 塊）。工作、全部檔塊與一筆紀錄在**同一個交易**寫入，失敗就什麼都不留。
- 冪等：ID 由冪等鍵雜湊而來；同鍵同日期回原檔（`replayed:true`），同鍵異日期回 409。

### 下載、過期與清除

- 下載在一個交易內讀完全部檔塊、核對 SHA-256、再扣一次次數；讀取失敗不扣次數，
  兩個同時請求搶最後一次只會成功一個。
- 狀態：`ready`／`exhausted`（3 次用完）／`expired`（超過 24 小時）／`revoked`／
  `purged`（超過 7 天）。只有 `ready` 可以下載。
- 檔塊帶 `purgeAt`，Firestore TTL（`infra/terraform/c5-firestore`，隨批次部署套用）在 7 天後刪除；
  TTL 不是即時的，所以 API 在 `purgeAt` 之後也一律拒絕。
- 撤銷在同一交易內刪除所有檔塊。
- `bd_export_log` 只記匯出 ID、動作、操作人雜湊與時間，不記任何病患值。

## 不在本 ADR

- 工作臺畫面（另一個 PR）。
- 把檔案放進雲端硬碟：由操作的 agent 或業主下載後手動上傳，系統不接 Google Drive。
- 部署與 C1 驗證：依 `OWNER-BATCH-2026-09-29B` 第 1 項一次部署。

## 後果

- 匯出內容含病患個資，存於 C1 Firestore 最多 7 天；Firestore 規則預設拒絕直接讀取。
- 一年內預約量若大到超過 20 個檔塊，要縮短日期範圍。
