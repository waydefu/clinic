# ADR-0011：商務交付合作終止與資料返還（CP-07）

**狀態：** 已接受（依 `BD-POLICY-2026-09-29` §6 與 `OWNER-BATCH-2026-09-29B` 第 7 項）
**日期：** 2026-10-01
**適用：** C1 合成隔離環境 `internal_synthetic`。
**不授權：** production、真實資料、雲端部署、服務停用、帳號撤銷或資料刪除。
production 套用仍需專業隱私／法律審閱及另行明確授權。

## 決定

1. `BD-POLICY-2026-09-29` 的 `minimumNoticeDays = 30` 與
   `controlledCopyRetentionDays = 30` 由版本化 policy 提供。建立通知要求今天的台北日期；
   伺服器時鐘記錄實際 UTC 開始時間並由現有 domain planner 計算 30 天邊界。
2. 所有寫入只限 `manager`，需要員工 session、CSRF 與 10 分鐘內 Google＋TOTP 重新驗證。
   每個成功操作在一筆 Firestore transaction 中保存版本、冪等結果與追加式稽核事件；close
   另要求 `expectedVersion`。
3. 資料返還簽收只帶伺服器匯出 ID。伺服器交易讀取 `bd_export_jobs`，要求 CSV 工作有成功下載、
   未撤銷、未到清除期限，並把工作中已記錄的 SHA-256、伺服器時間和目前 manager actor ref
   寫入收據。請求不能提供雜湊、簽收人或時間；同一匯出不能用於兩個終止案件。收據也記錄所返還
   匯出的日期範圍（`from`、`to`）、筆數（`rowCount`）與位元組大小（`byteLength`）；這只記錄事實，
   不定義何謂「完整」匯出，該定義仍是 `BD-POLICY-2026-09-29` 第 6 節下尚待業主決定的事項。
4. 同一個 acknowledgements 路由接受 `backup_disposition`、`audit_disposition` 與
   `access_revocation` 清單證據。每項只接受 opaque `evidenceRef`；操作者與時間由伺服器記錄。
   這代表經理在系統內留下人工完成聲明與證據參照，不證明雲端或身分供應商已執行相應變更。
   API 不呼叫 Google Cloud 或身分供應商，也不停止服務、不撤銷權限。
5. 資料返還簽收開始受控副本 30 天保存期。結案檢查由伺服器讀取返還收據、期限與三項清單
   證據；缺少步驟時回 409 並列出缺項。符合條件時，現有 domain planner 只允許進入
   `manual_close_review`。此狀態不是自動合約終止或刪除。備份依原保存政策自然到期，稽核紀錄
   依獨立政策保存；本 ADR 不排程或執行刪除。

## 路由

| 路由 | 權限 | 另外 |
| --- | --- | --- |
| `POST /v1/business-delivery/terminations` | `manage_business_termination` | 重新驗證；body 為冪等鍵與今天的台北 `noticeDate` |
| `GET /v1/business-delivery/terminations/:id` | 同上 | 回案件、收據、版本與結案缺項 |
| `POST /v1/business-delivery/terminations/:id/acknowledgements` | 同上 | 重新驗證；嚴格依 `receiptKind` 限制匯出 ID 或 opaque evidence ref |
| `POST /v1/business-delivery/terminations/:id/close` | 同上 | 重新驗證；只收冪等鍵與 `expectedVersion` |

功能開關、policy version、scope 或觀測起始設定不完整時，API 回 404。政策目前只核准
`internal_synthetic`；D-002 與專業隱私／法律審閱仍阻止 production 使用。

## 驗證與操作

- Firestore transaction 原子保存狀態、版本、冪等紀錄及稽核事件；所有 actor 值是 UID SHA-256。
- 收據 evidence ref 與下載匯出只用合成、不含身分的測試資料。
- 復原副本、備份到期、實際撤權、服務停止與刪除皆是其他明確人工／維運程序；CP-07 API
  不會代替它們或宣稱已發生。
