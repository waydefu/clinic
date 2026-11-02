# ADR-0012：application 告警的來源配對與隔離後確認

**狀態：** 提案（source-only，待負責人隨正常 PR 審閱；不是已接受的維運或 IAM 決定）
**日期：** 2026-11-02
**依據：** 登記簿「2026-10-31 Sol：四項來源決定及剩餘等待邊界」B-08，
及 [owner checkpoint](https://github.com/waydefu/clinic/pull/268#issuecomment-6561809243)。
**不授權：** 實際 Pub/Sub、IAM、sender、worker 接線、C1 工作或部署。

## 背景

既有 application topic 與 Monitoring channel 宣告不證明 publisher 有權發佈，
亦不代表 subscription、DLQ 或 consumer 已接線。既有 worker consumer 只有純決策
與 fake ports；來源提案必須與真實身分／投遞證據分開。

## 來源提案

1. 只在既有 WP-B4 module 補 application topic 的 Monitoring publisher binding、
   worker pull subscription、broker dead-letter forwarding 權限及 DLQ review subscription。
   每個 grant 限個別 topic／subscription；不授 project-wide IAM，不改 API 或 budget path。
2. `application_delivery` 預設 null，保留既有 resource address、email path 與 default-SHA
   零資源。未明確提供配對輸入時不建立新 transport；channel 存在也只能報 `UNCONFIGURED`。
3. principal 由後續受權操作者明確提供。檢查同一輸入 project number 的 service-agent 格式，
   worker 只採 repo 既有 `internal-test-outbox` 命名；格式不是實際存在、project 對應或權限證據。
   不查雲端、不建立身分、不借 budget principal，也不從 API／browser 消費告警。
4. 保留 `consumeAlertMessage` 與 fake sender/dedupe，加入純 `alertAckDecision`：
   success／duplicate 可建議 ack；retry 必須 nack；永久或格式錯誤只有在持久隔離成功後可 ack。
   未隔離時 nack，交 broker retry／DLQ 政策，不直接丟訊息。本 PR 不執行這些 transport 動作。
5. 明列 30 秒 ack deadline、7 天訊息 retention、10–600 秒 backoff、5 次 broker delivery
   attempts 的工程提案；attempt threshold 是 provider best effort，不是嚴格的執行次數保證。
   DLQ review subscription 不授任何 reader；營運套用及外部驗收仍另行授權。
6. 有合法輸入也只報 `SOURCE_ONLY_NOT_DEPLOYED`，`runtime_verified` 永遠 false。
   缺 principal、錯 publisher／consumer／broker 的負向測試，與正常配對及 no-op 正向測試，
   由既有 required CI 的 credential-free mock job 與 worker fake tests 執行。

## 未解與證據限制

真實 principal 與 project number 對應、持久去重／隔離 adapter、sender、pull/ack/nack
接線與實際投遞／DLQ 證據尚未完成；本 ADR 不選擇實際 store、收件者或 provider 設定。
來源 PR 與 CI 綠燈不給 B-08 整包 closure credit，不改任何 D-series 核准狀態。
細節與測試位置見 [notification design §8](../plans/2026-10-30-sol-notification-design.md#8-2026-11-02-已核准來源施工配對提案與正反測試)。
