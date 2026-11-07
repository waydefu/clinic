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

| 環節         | 提案                                                                                                                                                    | 狀態                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| publisher    | 隔離專案內**待有權操作者確認的 Cloud Monitoring notification publisher**；確認後只提案對 `c1-application-alerts` 一個 topic 授 `roles/pubsub.publisher` | **未確認**：不能從 budget topic 推定 principal，也不把服務代理的名稱模式當成已確認身分。確認前不寫 Terraform、不猜 principal、不給其他 topic 或身分任何權限 |
| subscription | 一個 pull subscription，只授權單一 worker service account 為 subscriber；browser 與 API 無權讀取                                                        | 提案，未建立                                                                                                                                                |
| consumer     | worker 內的 [alert-notification-consumer](../../apps/worker/src/alert-notification-consumer.ts)：解析、白名單投影、去重、呼叫 sender port               | 來源已寫，只接 fake                                                                                                                                         |
| DLQ          | 另一個 dead-letter topic（暫名 `c1-application-alerts-dlq`）與對應 subscription，僅供人工檢視                                                           | 提案，名稱未核准                                                                                                                                            |
| human email  | 沿用既有 `human_email` channel，與 Pub/Sub 路徑並行，不經 worker                                                                                        | 已存在（未部署）                                                                                                                                            |

worker 只有一條職責：把告警轉成給維運人員的通知。實際 sender（任何簡訊、LINE、email provider）
沒有核准，程式只有 `AlertSenderPort` 介面。

## 3. 冪等與重試

- Pub/Sub 至少送一次，所以以 `incident_id + state` 為去重鍵：同一事件的 open 與 closed 各發一次，
  重送同一組只回 `duplicate`。去重鍵的持久儲存（建議沿用 Firestore，且要有保留期，期間須長於
  subscription 最長重送期）是外部/後續工作；來源只定義 `claim`/`release` port。
- 送出失敗：先 `release` 去重鍵再回 `retry`（nack），由 subscription 的 exponential backoff 重送；
  不在 consumer 內自旋、不加 timer。
- 不可重試的錯誤（`AlertSendError(false)`）與格式錯誤：不重送，直接當 dead-letter 處理。
- subscription 的 `max_delivery_attempts`、retention、ack deadline 與 backoff 必須在
  operator packet 明寫，不沿用 provider 預設值。outbox 的 3600 秒上限**不能直接套用**：
  [Pub/Sub exponential backoff](https://docs.cloud.google.com/pubsub/docs/subscription-retry-policy)
  的可設定範圍是 0～600 秒；這是技術限制，不是本提案已核定的營運數值。
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

| 項目                                                    | 狀態                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 事件範圍、消費路徑、冪等/重試、不送內容、PII 防護的設計 | **來源完成**（本文與測試），待負責人審閱                                     |
| consumer 決策邏輯（fake）                               | **來源完成**                                                                 |
| publisher IAM 綁定、subscription、retry/DLQ 資源        | **外部未完成**：須先由有權者在隔離專案確認身分；Terraform 與部署另行逐項授權 |
| 去重鍵持久儲存與保留期                                  | **外部/後續**：需另一個來源 PR 與保留期核定                                  |
| 實際 sender 與送達、重送、重試、DLQ 的 operator 證據    | **外部未核准**；mock 與 CI 不能當送達證明                                    |

B-08 因此**不標 DONE、不標 FIXED**：runtime 證明（`runtimeProofRequired`）尚未取得，
`HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED` 標籤維持不變。

## 7. 不含 secret 的來源配對清單（2026-11-01）

這是供負責人審閱的 source proposal，不是雲端 inventory，也不把「程式有資源宣告」
寫成「資源已建立」。實測 SHA 由操作者填當天 main；目標只用登記簿已核准的隔離專案
`beauessence-clinic-stg-c1a01`，任何實際建立、IAM、訂閱、送信仍要新的精確授權。

| 環節                 | repo 的來源事實                                                                                                                                             | 配對提案與缺項                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| application topic    | WP-B4 `google_pubsub_topic.application_alerts`，名稱 `c1-application-alerts`                                                                                | notification channel 的 `topic` 已引用它；default SHA `not_granted` 時不建立                                                                                |
| Monitoring publisher | WP-B4 **沒有**此 topic 的 publisher IAM declaration                                                                                                         | 實際 principal 未確認；不能借用 budget topic 身分，也不能把 channel 存在當成功送達                                                                          |
| pull subscription    | WP-B4 尚無 subscription declaration                                                                                                                         | 提案只訂閱 application topic，明列 ack deadline、retention、retry 與 dead-letter policy；不開 browser 或 API 的讀取權限                                     |
| worker               | [C1 runtime](../../infra/terraform/c1-internal-test-run/main.tf) 宣告 `google_service_account.worker`，`account_id = internal-test-outbox`；與 API 身分分開 | 可審閱是否沿用這個 worker 身分，但這不是實際已部署身分的確認。若採用，只在該 subscription 授 subscriber；不把 Calendar outbox 當告警佇列，不修改它的 writer |
| consumer             | `consumeAlertMessage` 只回決策，使用 fake sender/dedupe；沒有 Pub/Sub transport                                                                             | 未接 pull/ack/nack，不啟動 timer、排程或 sender；不能把 `sent` 決策當真人已收到                                                                             |
| dead letter          | 尚無 DLQ topic/subscription declaration                                                                                                                     | 暫名 `c1-application-alerts-dlq`，只供另行核准的人工檢視者；不自動把 raw payload 轉寄收件者                                                                 |
| human email          | WP-B4 `google_monitoring_notification_channel.human_email`，收件值由未提交的設定提供                                                                        | 與 worker 路徑分開驗收；不在 Git 記錄收件者或連線設定                                                                                                       |

後續 transport 的必要條件：成功或已完成的重送才 ack；可重試失敗 nack；
格式錯誤或永久失敗必須先有持久的隔離／DLQ 記錄才 ack。DLQ 寫入失敗不能 ack 丟訊息。
這些是待實作接線的驗收條件，現有純 consumer **沒有執行** ack、nack 或 DLQ 寫入。

外部驗收仍照[測試單 §2](2026-10-25-external-acceptance-runsheet.md)：操作者先確認
publisher 與 topic 的精確配對及 subscription/worker/DLQ，再用合成事件記錄送達、重送、
重試與隔離。未知 principal、缺 publisher binding、未核准收件者、provider 失敗或缺 DLQ
記錄一律不能報 delivered；只保留去識別結果與必要的資源名稱，不提供 token、cookie、
raw payload、PII 或私有 log。這是 2026-11-01 的來源快照；下節補上 IaC 提案，
不以此聲稱 principal 已確認、已接線或整包 SOURCE-DONE。

## 8. 2026-11-02 已核准來源施工：配對提案與正反測試

依登記簿最上方「2026-10-31 Sol：四項來源決定及剩餘等待邊界」B-08 列，
及 [2026-11-02 owner checkpoint](https://github.com/waydefu/clinic/pull/268#issuecomment-6561809243)，
正常來源 PR 可補 publisher binding、subscription、DLQ 與 worker consumer 配對。
這取代上節對來源施工的等待；不改實際資源、IAM、worker 接線或部署的未授權狀態。

- [WP-B4 module](../../infra/terraform/wp-b4-alerting/README.md) 新增可選
  `application_delivery`；預設 null、default SHA no-op。每個新資源沿用原 exact-SHA gate。
- 明確輸入 Monitoring publisher、Pub/Sub service agent、既有 worker 的 member，
  只在 application topic／subscription／DLQ 的個別資源授權；沒有 project-wide IAM，
  不改 budget path、API 身分或 C1 module。
- 格式與同一輸入 project number 的驗證不是實際身分確認；project number 對 project id
  的對應、principal 是否存在與真實權限仍待外部證據。測試只用全零合成 project number。
- 提案的 pull subscription 有明列 ack deadline、retention、backoff 與 broker DLQ；
  DLQ review subscription 不授權任何 reader，保留後續受權操作者的邊界。
- `application_delivery_pairing` 明列來源 consumer，`runtime_verified` 永遠 false。
  沒有 binding 輸入時，即使既有 channel 有宣告也只能報 `UNCONFIGURED`；
  有輸入也只能報 `SOURCE_ONLY_NOT_DEPLOYED`，不能報 delivered。
- `alertAckDecision` 只回 ack/nack 建議，不執行 transport。永久／格式錯誤必須先
  持久隔離才可 ack；隔離未記錄時 nack，避免丟訊息，交 broker 的 retry/DLQ 政策處理。
  沒有新增 sender、dedupe store、SDK、timer、排程或 entrypoint import。
- `delivery.tftest.hcl` 涵蓋正常配對、default SHA 零資源、缺 binding 不冒稱就緒、
  public publisher、API consumer 與跨 project broker 拒絕；由既有 required CI mock job 執行。
  Worker fake 測試涵蓋 ack/nack、隔離與既有投影／去重，不等於投遞或雲端驗收。

本 PR 的結果與 exact-head CI 證據記在 PR／#268；此節不預先宣告測試成功。
B-08 的 runtime operator 證據仍缺，整包不給 closure credit，也不安排 C1 部署。
