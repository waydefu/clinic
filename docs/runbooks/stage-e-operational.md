# Stage E 營運 runbook

**狀態：** 工程就緒、**尚未 cloud apply**。本文件是 Stage F isolated
部署後的操作手冊，不是部署授權。

```text
HUMAN_NOTIFICATION_PATH = IMPLEMENTED_NOT_DEPLOYED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
code ready ≠ production activated
```

禁止：Cloud Run／Firebase／GCP mutation、production Calendar、
`events.watch`、真實病患資料、production DNS、行銷官網接管。任何 cloud
apply 都要 fresh exact-SHA packet。

操作動詞必須分開，不得把 inspect 當 apply：

| 動詞 | 意思 |
| --- | --- |
| **inspect** | 讀現況（gcloud describe／Hosting channel／backup list）。零 mutation |
| **plan** | Terraform plan 或 Firebase 預覽。零 apply |
| **apply** | 具名 exact SHA 的雲端變更。本輪禁止 |
| **restore** | 還原到**新** database。覆蓋現況禁止 |
| **rollback** | 回到先前 Hosting 版本／Cloud Run revision／關閉 gate |

每份事故處置都含：症狀、偵測、立即止血、診斷、復原、rollback、驗證、升級、
禁止事項、要留下的證據。

## 共通禁止事項

- 真實病患／日曆／薪資資料
- 把 secrets、收件人 email、session、token 寫進 git、聊天或票證
- 宣稱 `HUMAN_NOTIFICATION_PROVEN` 或 `INTERNAL_PREPRODUCTION_COMPLETE = PASS`
- 對 `beauessence-clinic-staging` 做 isolated C1 操作
- 為了止血而關掉 CSRF、rate limit、audit 或 exact-SHA guard
- 把 widget 沒有 `X-Frame-Options: DENY` 讀成「目前可 iframe」。現況是
  `CURRENT_WIDGET_EMBED = DISABLED`：CSP `frame-ancestors 'none'` 已阻止
  任何 parent framing。未來 embed 必須等確認 origin、security review、
  CSP 回歸、iframe/widget E2E 與明確部署授權後，才改成明確 allowlist，
  禁止 `frame-ancestors *` 與臆測 vendor host

---

## API outage

**Symptom.** `/v1/health/live` 失敗、Cloud Run 無流量、或 5 分鐘內 HTTP 5xx ≥ 3
（不含 fail-closed `SERVICE_UNAVAILABLE`）。

**Detection.** WP-B4 `api_outage_or_5xx_burst`；`GET /v1/health/live`；
`GET /v1/health/operational`。

**Immediate containment.** 不要重啟只因 degraded。確認 liveness 與 readiness
分開：非致命 backlog 不得讓 probe 殺掉程序。必要時開維護 gate
（`SERVICE_UNAVAILABLE`），暫停 worker 排程。

**Diagnosis.** 看 structured log 的 `correlationId`、`errorCode`、`operation`。
404 表示 API 未掛載，不是健康的 fail-closed。Gate 關閉應為 503。

**Recovery.** 修根因後先恢復 health，再打開寫入。不要重放未確認的 booking。

**Rollback.** 回到前一個 exact-SHA Cloud Run revision。不要 `latest`。

**Verification.** live 200、ready 200、operational `healthy` 或預期
`degraded`、合成 GET `/v1/health`。

**Escalation.** SEV1：診所完全無法運作。見
[incident-response.md](incident-response.md)。

**Forbidden actions.** 把 404 當 PASS；對 staging 專案操作；打開 production
booking。

**Evidence to capture.** exact SHA、時間、environment、redacted
`gcloud run services describe`、`/v1/health/operational` body。

---

## Booking write failure

**Symptom.** 5 分鐘內 durable booking write 5xx ≥ 3；病患看到建立失敗。

**Detection.** WP-B4 `durable_booking_write_failure`；log
`operation=POST_v1_bookings` 且 `errorCode != SERVICE_UNAVAILABLE`。

**Immediate containment.** 保持 IP-001 gate 現況。不要用 localStorage 當
SoT。不要重試未帶同一 `idempotencyKey` 的建立。

**Diagnosis.** 區分驗證失敗、slot 衝突（`SLOT_UNAVAILABLE` → API
`CONFLICT`）、交易失敗、gate 503。

**Recovery.** 交易衝突請病患重選時段。伺服器錯誤修根因後用同一冪等鍵。

**Rollback.** 回上一版 API；不要手動改 Firestore 預約列。

**Verification.** 合成 accountless create → server read-back → reload 仍在。

**Escalation.** 持續失敗影響當日門診 → SEV2。

**Forbidden actions.** 新增 CAPTCHA；要求一般預約登入／OTP。

**Evidence to capture.** opaque appointment id、idempotency key、error
code、SHA。禁止 phone／DOB／姓名。

---

## Firestore incident

**Symptom.** `/v1/health/ready` 503、operational `firestore=unhealthy`、交易
失敗尖峰。

**Detection.** WP-B4 `persistent_firestore_transaction_failure`；health
probe。

**Immediate containment.** 維護模式；暫停 worker。保留事故現場，不要
overwrite restore。

**Diagnosis.** 配額、Rules、emulator 誤連、IAM。C1 isolated 專案 id 必須是
`beauessence-clinic-stg-c1a01`。

**Recovery.** 依 [backup-and-restore.md](backup-and-restore.md)：inspect →
plan → restore 到新 database → 驗證 V1–V6 → 才切連線。

**Rollback.** 切回事故 database 連線；原庫保留 ≥ 7 天。

**Verification.** 合成預約可讀寫；pending outbox 以同一冪等鍵安全續跑。

**Escalation.** SEV1。

**Forbidden actions.** 在 Console 手動改預約當修復；restore 覆蓋現況。

**Evidence to capture.** PITR 時間點、backup id、SHA、RPO／RTO 實測。

---

## Calendar sync failure

**Symptom.** 投影落後、worker degraded、candidate 堆積。

**Detection.** operational `calendar_sync=degraded`；WP-B4 與 weekday
summary 的 candidate backlog。

**Immediate containment.** Calendar 是投影。不要把 Calendar 當鎖。不要註冊
production `events.watch`。

**Diagnosis.** 認證、配額、410 gone、outbox 死信。見下節 410 與 watch
renewal。

**Recovery.** 以同一 idempotency key `requeue`。人工補救走受稽核路徑。

**Rollback.** 停 outbound worker；Firestore SoT 不變。

**Verification.** create／arrived／completed 打**同一** Calendar event。

**Escalation.** 全面不同步 → SEV2。

**Forbidden actions.** 在真實 Calendar 建未連結事件；宣稱 production inbound
已啟用。

**Evidence to capture.** opaque appointment id、event id、error code。

`PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED`。程式就緒 ≠ 已啟用。

---

## Calendar 410 recovery

**Symptom.** Calendar API 410；sync token 失效。

**Detection.** log／metric `calendar_410_recovery`；operational
`calendarGoneRecoveryNeeded`。

**Immediate containment.** 停止用舊 sync token。不要重放 inbound 當 outbound。

**Diagnosis.** watch 過期、token 過期、資源刪除。

**Recovery.** 合成／CAL-PILOT 範圍內全量補償同步。Production inbound 仍
deferred，不得為了 410 去 register watch。

**Rollback.** 維持 candidate review，不要自動寫回 Firestore。

**Verification.** 後續增量同步不再 410。

**Escalation.** 反覆 410 → SEV2。

**Forbidden actions.** production `events.watch`；把 inbound 當 SoT。

**Evidence to capture.** 時間、SHA、是否走全量補償（無 PII）。

---

## Watch channel renewal

**Symptom.** watch 到期或重複 renewal。

**Detection.** worker 日誌；`WATCH_RENEWAL_DUPLICATE_PROTECTION`。

**Immediate containment.** Production watch **不要** renewal，因為 inbound
仍 `GO_LIVE_DEFERRED`。CAL-PILOT 合成範圍才可依既有 packet。

**Diagnosis.** 重複 channel、過期 channel、錯誤 calendar id。

**Recovery.** 合成環境依 CAL-PILOT runbook。Production：停止。

**Rollback.** 刪除誤建的 watch channel（僅限已授權的合成專案）。

**Verification.** 沒有重複 channel；沒有 production webhook。

**Escalation.** 成本暴衝 → SEV2。

**Forbidden actions.** 對真實病患 Calendar register watch。

**Evidence to capture.** channel id、expiry、SHA。

---

## Outbox dead-letter

**Symptom.** dead-letter > 0；outbox 最老年齡 ≥ 60s。

**Detection.** WP-B4 `outbox_dead_letter`、`excessive_outbox_age`；worker
`/health` 可為 `degraded` 且仍 HTTP 200。`/live` 必須繼續 200。

**Immediate containment.** 不要刪死信。不要無限重試（`MAX_ATTEMPTS = 6`）。

**Diagnosis.** Calendar 5xx、衝突、payload 損壞。

**Recovery.** `OutboxProcessor.requeue(jobId, operatorId)`，同一把鑰匙。

**Rollback.** 維持死信，不要手改 job payload 塞 PII。

**Verification.** 死信歸零；最老年齡回到門檻下。

**Escalation.** 死信持續增加 → SEV2。

**Forbidden actions.** 重設 attempt 計數來繞過上限。

**Evidence to capture.** job id、appointment id、idempotency key、operator
id。

---

## Backup restore

見 [backup-and-restore.md](backup-and-restore.md)。Stage E **不 apply**。

**Symptom.** 備份失敗告警，或需要還原。

**Detection.** WP-B4 `backup_failure`；
`pnpm inspect:internal-test-backup`（inspect，不是 apply）。

**Immediate containment.** 停寫入。

**Diagnosis.** 先 inspect 備份是否存在、PITR 是否開。

**Recovery.** restore 到新 database；驗證 bookings 可讀、pending outbox
以冪等鍵續跑。

**Rollback.** 不切換連線。

**Verification.** V1–V6。Stage F 才做 cloud 證據。

**Escalation.** SEV1。

**Forbidden actions.** 把 inspect 輸出當作「備份已演練」；對 staging 專案
restore。

**Evidence to capture.** backup id、restore target id、SHA、命令與工具版本。

---

## Auth incident

**Symptom.** 5 分鐘內 `AUTHENTICATION_REQUIRED` ≥ 10。

**Detection.** WP-B4 `auth_failure_spike`；denied-access audit。

**Immediate containment.** 不要放寬 cookie／CSRF。可暫時收緊 rate limit。

**Diagnosis.** 憑證過期、錯誤 authDomain、攻擊、gate 誤判。Staff 與 public
booking 必須分流：一般預約仍 accountless。

**Recovery.** 修 IdP／session。撤銷被盜 session。disabled account 維持拒絕。

**Rollback.** 回上一版 session 程式；不要關 HttpOnly／Secure／SameSite=Strict。

**Verification.** Staff 無 cookie → 401／403；public create 仍可不登入。

**Escalation.** 憑證外洩疑慮 → SEV1。

**Forbidden actions.** 日誌寫入 token、cookie、Authorization、TOTP。

**Evidence to capture.** 計數、route family、SHA。禁止 IP 原樣當高基數
label 以外的 PII。

---

## Rate-limit abuse

**Symptom.** return lookup 429、lock、或一般寫入被限流。

**Detection.** metric `return_lookup_rate_limited`；weekday summary。

**Immediate containment.** 維持 5 次／15 分失敗、15 分 lock、generic miss。
不要改成「帳號不存在」枚舉。

**Diagnosis.** 單一 IP／actor 掃描 phone+DOB。

**Recovery.** 維持既有 WP-B2 limiter。必要時加長 lock（需新決策才改
Canon）。

**Rollback.** 不要關 limiter。

**Verification.** 合成錯誤 lookup 仍 generic miss；成功 lookup 不回 OTP。

**Escalation.** 成本／配額 → SEV2。

**Forbidden actions.** 新增未授權 CAPTCHA；日誌寫 phone／DOB。

**Evidence to capture.** 計數與 lock 狀態，opaque actor/ip bucket。

---

## Authorization denial spike

**Symptom.** 5 分鐘內 `AUTHORIZATION_DENIED` ≥ 10。

**Detection.** WP-B4 `authz_denial_spike`；append-only denied audit。

**Immediate containment.** 不要為了「能過」而擴大角色。角色字串只來自
`packages/domain/src/roles.ts`。

**Diagnosis.** 錯誤角色、CSRF 失敗被算成 auth、跨病患存取。

**Recovery.** 修授權；保留 audit。

**Rollback.** 回上一版 RBAC。

**Verification.** Staff complete 仍需授權；replay 不改寫 audit。

**Escalation.** 大規模越權嘗試 → SEV1。

**Forbidden actions.** 把 patient 角色寫進 staff allowlist。

**Evidence to capture.** opaque actor id、action、reasonCategory。

---

## IAM mutation alert

**Symptom.** `SetIamPolicy`。

**Detection.** 既有 C1 `c1-iam-setiampolicy`（budget Pub/Sub）以及 WP-B4
application channel（apply 後才會到人）。

**Immediate containment.** 不要在當下再改 IAM「修回來」除非指揮同意。先
inspect。

**Diagnosis.** 誰、哪個 resource、是否在 exact-SHA packet 內。

**Recovery.** 依核准 packet 撤回未授權 binding。

**Rollback.** 回到 packet 記載的 IAM。

**Verification.** `pnpm inspect:internal-test-monitoring`。

**Escalation.** 未授權 Owner／Editor／datastore.user → SEV1。

**Forbidden actions.** 把 email 收件人寫進 repo；忽略告警因為「只是
Pub/Sub」。

**Evidence to capture.** policy name、時間、SHA。無 member email 進 git。

---

## Rollback

**Symptom.** 新 SHA 行為錯誤。

**Detection.** health、E2E、告警。

**Immediate containment.** 停 apply。不要疊下一個 SHA。

**Diagnosis.** 對照 exact SHA 與先前 PASS revision。

**Recovery.** Hosting 回上一版；Cloud Run `--revision`；gate 關回 fail-closed
503。

**Rollback.** 本節即主程序。

**Verification.** smoke：gate 關閉 503，不是 404；staff 未登入 401／403。

**Escalation.** 無法回到上一 SHA → SEV1。

**Forbidden actions.** `terraform apply` 用 `not_granted` 試圖「清掉」已存在
資源；刪 C5 backup。

**Evidence to capture.** from-SHA、to-SHA、命令、結果。

---

## Isolated preview deployment

**Symptom.** Stage F 需要 isolated Hosting + API。

**Detection.** 本節是計畫，不是授權。

**Immediate containment.** 沒有 exact-SHA packet 就 STOP。

**Diagnosis.** 確認 channel `internal-preproduction`、project
`beauessence-clinic-stg-c1a01`、config `firebase.isolated-preview.json`。
Hosting rewrite 到 Cloud Run 是 Stage F 工作，Stage E 故意不寫進 isolated
JSON。

**Recovery.** 依 Safety Floor 8 新 packet：靜態 + 具名 SHA 的 Run 服務。
到期必須設定。禁止 live channel。

**Rollback.** `firebase hosting:channel:delete internal-preproduction`
（preview only）。不要 destroy C1／C5 stack。

**Verification.** `/v1/health` 200；gate 關閉時 POST `/v1/bookings` 503；
gate 開啟時 accountless create 2xx 且 reload 仍在。

**Escalation.** 誤部到 staging／live → SEV1。

**Forbidden actions.** 重用過期 preview packet；官方 DNS；行銷官網接管。

**Evidence to capture.** channel URL、expireTime、SHA、CI run URL。

---

## Weekday summary

低噪音摘要由 `pnpm render:weekday-summary` 產生 structured payload。Stage E
**不寄信**。欄位：rate limits、auth／authz denial、retries、recoveries、
outbox／candidate backlog、API p95、成本訊號。禁止 PII。
