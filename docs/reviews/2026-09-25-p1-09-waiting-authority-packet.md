# P1-09 待核准 packet（2026-09-25 最終唯讀準備）

**紀錄日期：** 2026-09-25
**紀錄性質：** CP-00 核准前準備。下面的 APPROVE 區塊是提案，不是業主簽署，不是部署授權，不是關帳。
**階段狀態：** `WAITING_AUTHORITY`。`P1_09 = NOT_CLOSED`。`CLOUD_MUTATIONS = NONE`。

本文件不能記錄自己的 commit hash。提交後用
`git log -- docs/reviews/2026-09-25-p1-09-waiting-authority-packet.md` 查找。

操作書仍是 [P1-09 operator packet](../plans/2026-09-22-p1-09-operator-packet.md)。
本頁不取代那 19 個 gates，也不覆寫
[2026-09-22 驗收矩陣](../plans/2026-09-22-current-project-acceptance-matrix.md)
或 [2026-09-24 未關帳交接](2026-09-24-p1-09-unclosed-source-fix-handoff.md)。

標籤：`OBSERVED FACT` 是這次讀到的。`PROPOSED MUTATION` 要等業主把文末區塊原樣簽回。`OWNER-TO-FILL` 不能由這份文件代填。`BLOCKER` 未解除就不執行。`HISTORICAL_ONLY` 不能當這次的 rollback。

## 預檢事實（OBSERVED FACT，2026-09-25T04:43Z）

| 項目 | 值 |
| --- | --- |
| `CURRENT_MAIN` | `716aaf4f97d77eb87aead6d15b70a2936e676831` |
| `LATEST_MAIN_CI` | [verify 36094959216](https://github.com/waydefu/clinic/actions/runs/36094959216)，12/12 `success`，head 就是該 SHA |
| `OPEN_PRS` | 只有 #165，draft，不合併 |
| 帳號 | `wayde.fu@gmail.com` |
| API | `internal-test-api-p109durable1`，100% traffic，Ready。image `sha256:2250015b779b410ec63d58bc49676bb538448c6cc575e6eebe9454563a06820a`。SA `internal-test-api@beauessence-clinic-stg-c1a01.iam.gserviceaccount.com`。`TRUSTED_PROXY_HOPS=2`。booking enabled。expiry `2026-09-30T10:00:00Z`。流量 tag `fh-4f2b6f65fe8cc288` |
| outbox | `internal-test-outbox-00012-vzl`，100%，Ready。worker `sha256:f44c61c710497f1a10437ee659ec7934ab197365caf72fb262ad415f0f3ab17d`。SA `internal-test-outbox@…` |
| calendar-sync | `internal-test-calendar-sync-00001-422`，100%，Ready。同一 worker digest。entrypoint `node dist/calendar-sync/calendar-pilot-main.js`。SA `internal-test-calendar-sync@…` |
| Scheduler | inbound `internal-test-calendar-sync` `PAUSED`（`*/5 * * * *`，`retryCount` 缺省，`maxRetryDuration=0s`）。outbox `internal-test-outbox-drain` `ENABLED`（每分鐘，`retryCount=2`） |
| Firestore config | `calendar_pilot_configuration/active`：synthetic、version 1、inbound/outbound enabled、expiry `2026-09-30T10:00:00Z`、`sourceSha` `caaa69e550a915842db5e959ec4ee3fc77f2dfe2`、health `healthy`、lease owner 與 lease expiry 皆空。`lastSuccessfulSyncAt` `2026-09-23T17:09:42.404Z` |
| secret pins | 三個 API secret version `1` ENABLED。`c1-synthetic-calendar-id` version `2` ENABLED。`c1-calendar-pseudonym-key` version `1` ENABLED。沒有讀 payload |
| IAM | API：`roles/datastore.user` 與 `clinicC1FirebaseAuthSessionRuntime`。兩個 worker：各 `roles/datastore.user`。沒有改 binding |
| Hosting | `internal-preproduction`，version `4f2b6f65fe8cc288` `FINALIZED`，channel expiry `2026-10-19T20:38:03.699747700Z`。`/v1/**` → `internal-test-api` / `asia-east1` / tag `fh-4f2b6f65fe8cc288`（就是目前 100% 的 API revision tag）。上一筆 release version `253c6586b218bc63` 只作歷史，不當這次 rollback |
| build | `_SOURCE_SHA=716aaf4…` 在 `asia-east1` Cloud Build 沒有匹配。沒有建映像 |
| Cloud Tasks | API 未啟用。沒有為了查 DLQ 去開啟它。lease 已讀到為空 |

與 #165 前次預檢（約 04:32Z）相比：API、worker、Scheduler、config、secret pin 是 `UNCHANGED`。Hosting 從 `UNAVAILABLE` 變成這次讀到，分類 `EXPECTED_DRIFT`（先前是 quota project 未帶，不是雲端被改）。沒有 `UNEXPECTED_DRIFT`。

這些映像仍是 #163 修復前。`SOURCE_FIX = MERGED`。`TARGET_SHA_RUNTIME = NOT_PROVEN`。Gate 14 重驗 `NOT_RUN`。2026-09-23 的 Gate 14 維持歷史 `FAIL`。

## Rollback 基線（OBSERVED FACT）

`ROLLBACK_BASELINE = COMPLETE`（這次讀到的目前狀態就是退回目標）。

| 目標 | 退回值 |
| --- | --- |
| API | revision `internal-test-api-p109durable1`，digest `sha256:2250015b779b410ec63d58bc49676bb538448c6cc575e6eebe9454563a06820a`，100% |
| outbox | `internal-test-outbox-00012-vzl`，digest `sha256:f44c61c710497f1a10437ee659ec7934ab197365caf72fb262ad415f0f3ab17d`，100% |
| calendar-sync | `internal-test-calendar-sync-00001-422`，同一 worker digest，100% |
| inbound scheduler | 維持 `PAUSED` |
| outbox scheduler | 維持 `ENABLED`。未來 apply 不得因 Terraform 預設 `worker_schedule_paused=true` 把它改成暫停，除非業主在核准區塊另寫 |
| config | 不刪、不覆寫。維持現有 active doc |
| Hosting | 現行 version `4f2b6f65fe8cc288`、tag `fh-4f2b6f65fe8cc288` |
| secret pins | 維持上表數字版本，不新增、不輪替 |

## 預計建置（PROPOSED，這輪不執行）

```text
PROPOSED_BUILD_SCOPE
config = containers/internal-test.cloudbuild.yaml
project = beauessence-clinic-stg-c1a01
region = asia-east1
repository = asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test
API image tag uses commit 716aaf4f97d77eb87aead6d15b70a2936e676831
worker tag = worker:716aaf4f97d77eb87aead6d15b70a2936e676831
build-arg = SOURCE_SHA=716aaf4f97d77eb87aead6d15b70a2936e676831
deploy pin = 上述兩個映像的 sha256 digest，禁止只用 tag
```

命令只列在操作書。這輪沒有 `gcloud builds submit`。

## Terraform（PROPOSED，這輪沒有 plan/apply）

`TERRAFORM_PLAN = BLOCKED_ENVIRONMENT`。這台環境沒有 `terraform` 執行檔，也沒有已核准的私有 tfvars。沒有改 lockfile，沒有連 remote state。

日後必須在有 Terraform、遠端 state、以及核准 tfvars 的環境做出完整 saved plan，審過才可 apply。

`BLOCKER`：現在的雲端已經有 calendar-sync 服務與 PAUSED job。若拿 Stage 1 定義（`calendar_sync_enabled=false`）去 plan，`for_each` 變空會計畫刪除該服務與 job。這不是這次要核准的動作。

因此這次提案不是「先套會刪除的 Stage 1」。提案是一份 Stage 2 形狀的 in-place plan：

- `calendar_sync_enabled=true`，`calendar_sync_schedule_paused=true`（inbound 維持 PAUSED）
- `calendar_sync_pseudonym_secret_version=1`（沿用現有 pin，不新建 secret）
- `worker_schedule_paused=false`，對齊目前 `ENABLED` 的 outbox drain
- API 與 worker image 換成新 digest；既有 API、outbox、calendar-sync 都在 diff 裡，不只新資源
- booking expiry 維持 `2026-09-30T10:00:00Z`，這次不延長
- config bootstrap 不跑。active doc 已存在，腳本會拒絕覆寫

若 saved plan 出現 destroy、replace、secret `latest`、inbound 變成 ENABLED、outbox 被暫停、或 image digest 與 build 結果不一致，停止，不 apply。

## 合成寫入預算（PROPOSED，這輪是 0）

| 動作 | 上限 |
| --- | --- |
| 新 fixture | 最多 1 筆合成預約，而且只有在找不到可重用的既有合成預約時 |
| Calendar 編輯 | 1 次，同一個 synthetic event 的時間或標題 |
| 手動 inbound `jobs.run` | 最多 2（必要時 1 次 baseline，編輯後 1 次）。每次之後 job 仍須讀回 `PAUSED` |
| staff reject | 1 次 |
| 同一 idempotency replay | 1 次 |
| restore / outbox | 1 次處理。outbox drain 目前 `ENABLED`，提案不改這個狀態；若要另手動跑 drain，算在這 1 次裡 |
| 獨立 Calendar readback | 1 次，同一個 external event |
| HTTP 送出（429） | 最多 20，含客戶端自動重試 |

`INBOUND_SCHEDULER_MUST_REMAIN = PAUSED`。不假設 outbox 該暫停。

## Gate 14 單次重驗（PROPOSED，不執行）

同一個 synthetic event：外部改時間或標題 → inbound 產生一筆 pending update → staff 拒絕該筆 → 用同一 idempotency 重送 → restore outbox 送出 → 獨立讀回同一個外部 event。

必須同時成立：恰一筆 reject audit、恰一筆 restore outbox、appointment 仍是 SoT、版本沒有被意外改掉、同一個 `externalEventId`、沒有第二個 Calendar event、回復後的標題與時間等於目前 confirmed SoT、重送不增加 audit/outbox、錯 ETag / 錯連結 / 缺失或取消的 appointment 都 fail closed、既有 unmatched candidate 集合不變、沒有碰到正式 Calendar。任一項失敗就停。不可以手改 Calendar 或 Firestore 來做成 PASS。

## 429（PROPOSED，不執行）

同一 lookup、同一 client identity、`TRUSTED_PROXY_HOPS=2`。偽造的最左 `X-Forwarded-For` 必須被忽略。同一個 durable key 要累加。20 次送出內出現 429 與 `Retry-After` 才停；滿 20 次仍沒有預期結果就是 FAIL，沒有新核准不能再送。日誌不得留下可識別個資。只看到 in-memory burst 429 時，標 `HTTP_429_PROVEN` / `DURABLE_REJECTION_NOT_PROVEN`，P1-09 仍不關帳。

## 待業主核准的區塊

業主已於 2026-09-25 簽回，`APPROVER = PROJECT_OWNER`，並把時窗改為台北時間 2026-09-26 13:00 至 2026-09-30 20:00。換算 UTC 是 `2026-09-26T05:00:00Z` 至 `2026-09-30T12:00:00Z`。2026-09-25T05:11Z 時窗尚未開始，所以仍不執行。`main` 若在開始前前進，這份 SHA 失效。

```text
APPROVE P1-09-C1-SYNTHETIC-CLOSEOUT

AUTHORITY_SHA = 716aaf4f97d77eb87aead6d15b70a2936e676831
OPERATOR = wayde.fu@gmail.com
APPROVER = PROJECT_OWNER
VALID_FROM_UTC = 2026-09-26T05:00:00Z
VALID_UNTIL_UTC = 2026-09-30T12:00:00Z
VALID_FROM_TAIPEI = 2026-09-26 13:00
VALID_UNTIL_TAIPEI = 2026-09-30 20:00

PROJECT = beauessence-clinic-stg-c1a01
REGION = asia-east1
DATABASE = (default)
HOSTING_CHANNEL = internal-preproduction

BOOKING_GATE_EXPIRY = 2026-09-30T10:00:00Z
CONFIG_SOURCE_SHA = caaa69e550a915842db5e959ec4ee3fc77f2dfe2
CONFIG_EXPIRY = 2026-09-30T10:00:00Z

AUTHORIZED_BUILD = cloudbuild containers/internal-test.cloudbuild.yaml API+worker tagged with AUTHORITY_SHA; deploy by sha256 only
AUTHORIZED_STAGE1_MUTATIONS = NONE. Do not apply calendar_sync_enabled=false; that would plan-destroy the existing sync service
AUTHORIZED_SECRET_VERSION_ACL = NO NEW VERSIONS. keep API pins v1, synthetic calendar id v2, pseudonym key v1
AUTHORIZED_STAGE2_MUTATIONS = one reviewed saved plan: sync enabled, inbound paused, outbox drain remains ENABLED, images replaced in place with the new digests, no destroy/replace
AUTHORIZED_HOSTING_SWITCH = internal-preproduction /v1/** only, to the new API revision tag; web release must match AUTHORITY_SHA
AUTHORIZED_SYNTHETIC_CALENDAR_WRITES = 1 edit on one existing synthetic event, or 1 fixture only if none exists
AUTHORIZED_MANUAL_SYNC_INVOCATIONS = 2
AUTHORIZED_RATE_LIMIT_REQUESTS = 20

INBOUND_SCHEDULER_MUST_REMAIN = PAUSED
OUTBOX_SCHEDULER_CURRENT_STATE = ENABLED

API rollback revision is internal-test-api-p109durable1 at digest sha256:2250015b779b410ec63d58bc49676bb538448c6cc575e6eebe9454563a06820a and 100% traffic
ROLLBACK_OUTBOX = internal-test-outbox-00012-vzl @ sha256:f44c61c710497f1a10437ee659ec7934ab197365caf72fb262ad415f0f3ab17d 100%
ROLLBACK_CALENDAR_SYNC = internal-test-calendar-sync-00001-422 @ same worker digest 100%
ROLLBACK_HOSTING = version 4f2b6f65fe8cc288 tag fh-4f2b6f65fe8cc288
ROLLBACK_CONFIG = no delete and no overwrite of calendar_pilot_configuration/active

FORBIDDEN =
production,
real patient data,
live Hosting channel,
production Calendar,
AWS,
public website,
unbounded traffic,
terraform destroy,
broad IAM,
scheduler resume unless explicitly listed

STOP_ON_UNEXPECTED_CHANGE = true
```

`READY_FOR_OWNER_APPROVAL = YES` 只表示上面的觀察與提案已經齊，可以拿去簽。簽回之前仍然不准執行。#165 維持 draft、不合併。CP-01、BD runtime、Google 真還原、AWS、官網都不在這包。
