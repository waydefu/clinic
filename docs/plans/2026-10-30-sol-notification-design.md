# SOL-NOTIFICATION：application 告警通知的 publisher 範圍與 consumer 路徑提案

日期：2026-10-30（Asia/Taipei）。狀態：**DESIGN-PROPOSED（工程提案）**，供負責人在本 PR 審閱；
不是業務問題，不是部署，不是送達證明。Packet：SOL-NOTIFICATION，finding：B-08。
依據：[safe manifest B-08](2026-10-06-sol00-safe-manifest.json)、
[外部驗收測試單 §2](2026-10-25-external-acceptance-runsheet.md)、
[登記簿「工程提案不冒充業務問題」](../product/phase-1-decision-register.md)、
[WP-B4 Terraform](../../infra/terraform/wp-b4-alerting/main.tf)、
[Stage E 監控](../architecture/stage-e-monitoring.md)。

## 範圍

本提案只談**維運告警**：Cloud Monitoring alert policy 開啟或關閉時，經 Pub/Sub topic
`c1-application-alerts` 通知人。**病患端提醒（簡訊、LINE、email）不在此範圍，也沒有核准**；
現有 `outbox_jobs` 只投影 Calendar，本提案不改它。

已確認的來源事實：WP-B4 建了 topic 與 `pubsub` notification channel，但沒有任何 topic IAM、
subscription、retry 或 DLQ；唯一的 Monitoring publisher 綁定在另一個 budget topic
（[c1-foundation](../../infra/terraform/c1-foundation/main.tf)），不能代替。

## 1. 哪些事件會發通知、哪些不會

會發（已在 `application_policies` 與其他三條 policy 中，共 9 條，每條 `OPENED` 與 `CLOSED` 各一次）：
API 5xx、預約寫入失敗、Firestore transaction 失敗、備份失敗、outbox dead-letter、
登入失敗暴增、授權拒絕暴增、outbox 最舊工作超過 60 秒、IAM SetIamPolicy。

不發：

- 單筆請求錯誤、單次重試、單筆預約的正常狀態變化（沒有 policy 就沒有通知）。
- 資料缺漏（`EVALUATION_MISSING_DATA_INACTIVE`）不當成警報也不當成健康；本提案不改它。
- 病患提醒、預約確認、回診提醒：未核准、未設計。
- budget 通知：維持既有 `c1-budget-notifications` 路徑，不合併、不改。

## 2. 事件放哪裡、誰消費

不新建 Firestore outbox：告警事件的佇列就是 Pub/Sub 本身，避免第二套佇列。

| 環節 | 提案 | 狀態 |
| --- | --- | --- |
| publisher | Cloud Monitoring 服務代理（`service-<project number>@gcp-sa-monitoring.iam.gserviceaccount.com`，與 budget topic 同一模式），只對 `c1-application-alerts` 一個 topic 授 `roles/pubsub.publisher` | **未確認**：須有權者在隔離專案確認實際身分。確認前不寫 Terraform、不猜 principal、不給其他 topic 或身分任何權限 |
| subscription | 一個 pull subscription，只授權單一 worker service account 為 subscriber；browser 與 API 無權讀取 | 提案，未建立 |
| consumer | worker 內的 [alert-notification-consumer](../../apps/worker/src/alert-notification-consumer.ts)：解析、白名單投影、去重、呼叫 sender port | 來源已寫，只接 fake |
| DLQ | 另一個 dead-letter topic（暫名 `c1-application-alerts-dlq`）與對應 subscription，僅供人工檢視 | 提案，名稱未核准 |
| human email | 沿用既有 `human_email` channel，與 Pub/Sub 路徑並行，不經 worker | 已存在（未部署） |

worker 只有一條職責：把告警轉成給維運人員的通知。實際 sender（任何簡訊、LINE、email provider）
沒有核准，程式只有 `AlertSenderPort` 介面。

## 3. 冪等與重試

- Pub/Sub 至少送一次，所以以 `incident_id + state` 為去重鍵：同一事件的 open 與 closed 各發一次，
  重送同一組只回 `duplicate`。去重鍵的持久儲存（建議沿用 Firestore，且要有保留期，期間須長於
  subscription 最長重送期）是外部/後續工作；來源只定義 `claim`/`release` port。
- 送出失敗：先 `release` 去重鍵再回 `retry`（nack），由 subscription 的 exponential backoff 重送；
  不在 consumer 內自旋、不加 timer。
- 不可重試的錯誤（`AlertSendError(false)`）與格式錯誤：不重送，直接當 dead-letter 處理。
- subscription 建議 `max_delivery_attempts` 與 backoff 區間沿用 outbox 精神
  （`MAX_ATTEMPTS = 6`、30 秒起、上限 3600 秒）；實際數值於 operator packet 核定，不在此猜。
- 失敗保留不丟：DLQ 有訊息時沿用既有 `outbox dead-letter` 類告警思路另行提案，不在本 PR。

## 4. 刻意不送的內容

- 不送告警原文：`summary`、`documentation`、resource labels、URL、threshold 數字都丟掉。
- 不送病患、員工、預約、電話、email、LINE 識別、金額、臨床內容；這些本來就不會進 alert payload，
  也不允許從 log 補。
- 不送給未核准收件者；收件目標由 sender 設定提供，不入 Git。
- 不因告警自動執行修復動作（不改 IAM、不重啟、不停機）。

## 5. 如何避免 PII

1. **白名單投影**：`projectAlert` 只取 `incident_id`、`policy_name`、`state`；其餘欄位根本不讀。
2. `policy_name` 必須在 9 條 WP-B4 名單內（測試與 Terraform 原文逐項比對，名單漂移會失敗）；
   `incident_id` 須符合 `^[A-Za-z0-9._:-]{1,128}$`。任何不符一律拒絕，不寫入通知。
3. 測試用含姓名與電話的假 `summary` 驗證輸出不含它們。
4. 收件者與連線設定不入 Git（沿用 `alert_email_address` 規則）；log 只記去重鍵與結果代碼。

## 6. 本 PR 做了什麼、沒做什麼

來源與合成測試已完成：consumer 決策函式與 fake 測試
（[test](../../apps/worker/src/alert-notification-consumer.test.ts)），涵蓋投影、去重、
open/closed 區分、可重試失敗釋放去重、不可重試與格式錯誤不重送。

| 項目 | 狀態 |
| --- | --- |
| 事件範圍、消費路徑、冪等/重試、不送內容、PII 防護的設計 | **來源完成**（本文與測試），待負責人審閱 |
| consumer 決策邏輯（fake） | **來源完成** |
| publisher IAM 綁定、subscription、retry/DLQ 資源 | **外部未完成**：須先由有權者在隔離專案確認身分；Terraform 與部署另行逐項授權 |
| 去重鍵持久儲存與保留期 | **外部/後續**：需另一個來源 PR 與保留期核定 |
| 實際 sender 與送達、重送、重試、DLQ 的 operator 證據 | **外部未核准**；mock 與 CI 不能當送達證明 |

B-08 因此**不標 DONE、不標 FIXED**：runtime 證明（`runtimeProofRequired`）尚未取得，
`HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED` 標籤維持不變。
