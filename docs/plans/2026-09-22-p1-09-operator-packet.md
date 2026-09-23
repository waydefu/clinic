# P1-09 C1 有界操作與關帳 packet

狀態：DRAFT / NOT_AUTHORIZED。此文件及附件中的建議 APPROVE 文字不是實際核准。
基線見[主計畫](2026-09-22-current-project-acceptance-master-plan.md)；
驗收列見[矩陣](2026-09-22-current-project-acceptance-matrix.md)。
P1-09 只完成既有 Phase 1 門檻，不夾帶新 booking、BD、Google 真 restore、AWS 或官網。

## 先讀與不讀

FILES_TO_READ：

- AGENTS.md、CLAUDE.md、decision register 的現行C1/IP-001/WP-B段落。
- infra/terraform/c1-internal-test-run/README.md、main.tf、variables.tf、terraform.tfvars.example、noop.tftest.hcl。
- containers/internal-test.cloudbuild.yaml、scripts/internal-test-image-names.mjs。
- scripts/c1-calendar-sync-bootstrap.mjs、stage-f-acceptance-matrix.mjs、internal-preproduction-complete.mjs。
- candidate時讀 apps/api/src/calendar/calendar-pilot.controller.ts、clinic-calendar-review.application-service.ts、
  apps/api/src/firestore/clinic-calendar-review.repository.ts、
  apps/worker/src/calendar-sync/calendar-pilot-runtime.ts 與其測試。
- 429時讀 packages/domain/src 的 RATE_LIMIT_POLICIES 定義、apps/api/src/platform/runtime/wp-b2-rate-limiter.ts、
  durable-rate-limit-store.ts、apps/api/src/firestore/rate-limit.repository.ts 與 client-IP source。
- 只在整合對應證據時讀 monitoring/backup/migration/hosting inspectors，不重掃全部PR/商務文件。

不要讀.env/credentialcache、service-account JSONkey、真實patientcollections。
gcloud與ADC身分是兩套；驗證可用性時不輸出token。只在私有執行紀錄保存必要完整cloudJSON。
過往 c1-foundation runbook的createproject段落是歷史，**本包不重建專案或foundation**。

## 新授權草稿（尚未批准）

~~~text
PACKET = P1-09-C1-SYNTHETIC-CLOSEOUT
STATUS = DRAFT_NOT_AUTHORIZED
AUTHORITY_SHA = <execution-time fresh 40-char main SHA>
OPERATOR = <named>
APPROVER = <named>
VALID_FROM_UTC = <exact>
VALID_UNTIL_UTC = <exact>
PROJECT = beauessence-clinic-stg-c1a01
REGION = asia-east1
DATABASE = (default)
HOSTING_CHANNEL = internal-preproduction
SYNTHETIC_CALENDAR = <private verified reference, no real Calendar>
BOOKING_GATE_RENEWAL = <explicit yes/no and exact new expiry>
CONFIG_BOOTSTRAP = <explicit yes/no and exact source/expiry>
AUTHORIZED_MUTATIONS = <each gate below with expected complete scope>
STAGE1_EXPECTED_DIFF = <include existing API/outbox changes>
STAGE2_EXPECTED_DIFF = <complete, not only new resources>
SECRET_VERSION_AND_ACL = <exact resources/principal/role>
MANUAL_SYNC_INVOCATIONS = <exact finite count for baseline, changed, replay>
OTHER_SYNTHETIC_WRITES = <fixtures, staff transitions, outbox runs, totals>
RATE_LIMIT_REQUEST_LIMIT = 20
INBOUND_SCHEDULER = PAUSED
OUTBOX_SCHEDULER = <read-back baseline and explicitly approved changes, if any>
ROLLBACK = <verified revisions, traffic, pins, Hosting version/tag, state>
CLEANUP = <exact allowed targets or NONE>
STOP_ON_UNEXPECTED_CHANGE = true
~~~

舊 booking gate 2026-09-22T11:58:18Z 已不作啟動依據。即使仍在其時間內，也不趕工沿用。
這份 docs PR 合併後 main 很可能改變，必須重新取得相應 SHA 核准。
operation window、booking expiry、config expiry 三者各自檢查；設定上限31天不是31天操作授權。
未填/未准欄位不以 agent best judgment 代填。完成只需回報不自動繼續下一包。

## 19 個 gates（依序，不跳步）

每次 mutation 前重做：fresh main==authority、時間窗有效、C1/resource正確、
rollback仍可用、完整預期diff無漂移。每個gate留下UTC與操作者。

### Gate 00 — fresh authority/source

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 唯讀 |
| 執行／成功條件 | fetch origin/main；記 currentmain/openPR/CI、UTC、repo dirty/state lineage；只C1 project/default DB/asia-east1 |
| 失敗／停止條件 | main已不同e387或approvalSHA→先對帳，不沿用附件範例 |
| 證據 | fresh-source.json、source diff、CI URL |
| 失敗後動作 | 無；未 mutation |

### Gate 01 — 新執行授權

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 無（等待具名核准） |
| 執行／成功條件 | 填下方待核准模板；每一operation都打勾並有start/end；booking/config expiry分別明列；operator/approver |
| 失敗／停止條件 | 未核准、過期、只說『照舊』、沒有bootstrap/手動job/cleanup範圍→STOP |
| 證據 | owner approval reference + packet hash |
| 失敗後動作 | 無；不把本PR或建議APPROVE當同意 |

### Gate 02 — rollback baseline

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 唯讀 |
| 執行／成功條件 | API/worker已知好revision、traffic、image、env與secret pins；Hosting version/rewrite/tag；outbox job state與設定；IAM最小範圍 |
| 失敗／停止條件 | revision存在但不healthy、其secret已失效、tag目標不同、無法恢復目前安全狀態→STOP |
| 證據 | rollback-baseline.json + private config custody |
| 失敗後動作 | 後續僅依這份snapshot回退，禁止猜 |

### Gate 03 — build + push

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | Cloud Build + Artifact Registry寫入 |
| 執行／成功條件 | clean exact approvedtree；用既有C1cloudbuild；build SOURCE_SHA對齊；build inputs不含本機.env/operatoroutput |
| 失敗／停止條件 | 任一未tracked輸入、錯project/repo、mutable latest、未准buildidentity→STOP |
| 證據 | build ID/source attestation/API+worker image tags |
| 失敗後動作 | 不刪共用images；失敗停止部署 |

### Gate 04 — immutable digest

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 唯讀 |
| 執行／成功條件 | 從build結果/AR讀API與worker sha256；三者 source/head/authority一致 |
| 失敗／停止條件 | 只得到tag或source標籤矛盾→STOP |
| 證據 | image-manifest.json |
| 失敗後動作 | 無 |

### Gate 05 — Stage 1 全 plan

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | Terraform plan（可能state lock；非apply） |
| 執行／成功條件 | 同步正式state backend，不用空local state；使用approved inputs；prerequisites=true、sync=false；審每個resource_change |
| 失敗／停止條件 | default not_granted導致destroy、stateprefix錯、replace/delete、未知IAM/secret/traffic/scheduler→STOP |
| 證據 | 完整 stage1.tfplan + private show-json + sanitized change table + hashes |
| 失敗後動作 | 丟棄未apply plan；不改state |

### Gate 06 — Stage 1 apply

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 已審saved plan |
| 執行／成功條件 | apply前再freshmain/time/state；僅套同hash saved plan；Stage1可能更新既有API/outbox，必須已在step05核准 |
| 失敗／停止條件 | plan已stale或出現未預期changes→STOP；不可自動replan再apply |
| 證據 | apply result、operation時間、resources touched |
| 失敗後動作 | 保護舊revision，必要按分項rollback；不destroy新prereq |

### Gate 07 — Stage 1 readback

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 唯讀 |
| 執行／成功條件 | dedicatedsync identity、emptysecretcontainer及bindings存在；syncservice/job仍不存在；API/outbox狀態對計畫 |
| 失敗／停止條件 | 只有apply成功但實際狀態不符→STOP |
| 證據 | stage1-readback.json |
| 失敗後動作 | 按實際已變更項恢復，保留新未啟用容器 |

### Gate 08 — pseudonym version + ACL

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 兩個分開記帳的mutation |
| 執行／成功條件 | (a)批准產fresh randomsecret，私有輸入新增numeric version；(b)只給dedicatedsync identity syntheticCalendar所需reader，outbox原writer不變 |
| 失敗／停止條件 | 值將進log/git、ACL指錯Calendar、要求SA JSONkey/domain delegation/broad role→STOP |
| 證據 | secret resource/version/status（無payload）；ACL principal/role安全摘要 |
| 失敗後動作 | 先確認無consumer再禁用本包version/移除本包ACL；不動舊version或outboxACL |

### Gate 09 — bounded config bootstrap

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | Firestore transaction寫3個docs |
| 執行／成功條件 | 確認 activeconfig/source 都不存在；依已准expiry執行既有bootstrap；會寫configuration/source/audit，不是readback |
| 失敗／停止條件 | 任一已存在就STOP並分析是否同source；腳本拒覆寫不可用刪除繞過 |
| 證據 | config/source metadata與audit action/sourceSha；私有fullsnapshot |
| 失敗後動作 | 無自動delete；保留audit，停inbound；如需關閉config另列精確mutation |

### Gate 10 — Stage 2 fresh full plan

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 新Terraform plan |
| 執行／成功條件 | 重新refresh state；sync=true/prereq=true/numericsecretpin；inboundpaused=true；API/outbox變更亦全審 |
| 失敗／停止條件 | 沿用Stage1plan、只grep新sync資源、state drift、Scheduler變ENABLED→STOP |
| 證據 | stage2.tfplan全量JSON/sanitizeddiff/hashes |
| 失敗後動作 | 丟棄未套plan |

### Gate 11 — Stage 2 apply

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 已審savedplan |
| 執行／成功條件 | 再次確認sha/time/rollback、apply同planhash；建syncservice+pausedjob與明列runtime變更 |
| 失敗／停止條件 | 自動修改plan/隱含新expiry/不明traffic→STOP |
| 證據 | apply operation/resource diff |
| 失敗後動作 | 分項rollback；停止新sync，不stackdestroy |

### Gate 12 — 完整runtime readback

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 唯讀 |
| 執行／成功條件 | API/worker/sync三個revision與digest、source、env、IAM/secretpin；syncentrypoint；Scheduler PAUSED retry0；outbox維持核准baseline |
| 失敗／停止條件 | secret mounted latest、sync使用outboxidentity、TRUSTED_PROXY_HOPS不是2、權限變寬→STOP |
| 證據 | deployment-graph/readback JSON |
| 失敗後動作 | 依baseline恢復受影響service，inbound維持PAUSED |

### Gate 13 — isolated Hosting切換

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | preview release寫入 |
| 執行／成功條件 | 只internal-preproduction；確認reviewed /v1/** target新API/tag，webasset版本同source；authDomain仍isolatedhost |
| 失敗／停止條件 | live channel/官方DNS/未准預覽續期/alias指錯→STOP |
| 證據 | before/after hosting version + rewrite/tag→revision + health |
| 失敗後動作 | 恢復已讀回preview version/tag；不可改live |

### Gate 14 — candidate一次生命週期

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 合成Calendar/Firestore/必要手動job |
| 執行／成功條件 | 依下方fixture chain：manual edit→一次inbound→pending→staffreject→outboxrestore→同event回復；核准範圍內一次replay |
| 失敗／停止條件 | 跨C1、extraevent、approved而非rejected、SoT被Calendar偷偷改、任一assertionFAIL→STOP |
| 證據 | P09-07～10全部鏈式receipts；前後eventhash |
| 失敗後動作 | 停manualruns；保留candidate/audit；restore失敗先報不要手改Firestore掩蓋 |

### Gate 15 — 最多20 requests的429

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 有界synthetic查詢/limiter寫入 |
| 執行／成功條件 | 固定lookup+同clientidentity；按照下面limiter驗證拆分計數；HTTP429與Retry-After、durablestore綁同key |
| 失敗／停止條件 | 達20未命中、identity碎裂、跨window、無法證明durable而只有burst→STOP |
| 證據 | 每次ordinal/UTC/status + safe stablekeyhash + store before/after |
| 失敗後動作 | 停止送出，等bucket自然過期；不得清limiter冒充新測 |

### Gate 16 — 監控與required regression

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 只已授權synthetic測試 |
| 執行／成功條件 | 核對healthy/noDLQ/lease/lag、alerts恢復與收件；StageF11cases補缺，所有額外寫操作先列budget |
| 失敗／停止條件 | 新告警/重複投影/人證pending/需要未准mutation→STOP相關門檻 |
| 證據 | monitoring、incident→human receipt、regression manifest |
| 失敗後動作 | 停止測試；outbox回baseline；不得resumeinbound |

### Gate 17 — 完整evidence/evaluators

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | 本機文件/唯讀assessment |
| 執行／成功條件 | 整合source/CI/runtime/cloud/human；舊completenessinspect + strictStageF11cases；backup只inspect不冒稱restore |
| 失敗／停止條件 | 舊report寫pending、證據不存在、onlyboolean無附件、executor CLI no-op→不得PASS |
| 證據 | P1-09 private manifest + sanitizedreview + evaluator JSON/exitcode |
| 失敗後動作 | 保留failure packet；不刪歷史 |

### Gate 18 — closeout PR與交接

| 欄位 | 要求 |
| --- | --- |
| 操作類型 | git/docs PR |
| 執行／成功條件 | 所有必須項PASS才P1_09=PASS；datedrecord+README索引、exactheadCI；報cloudmutation逐項與remainingCP |
| 失敗／停止條件 | 任一requireditem缺→P1_09=NOT_CLOSED；不可開下一包施工充作閉合 |
| 證據 | PR URL/head/CI、finalverdict、rollbackstate、下一包入口 |
| 失敗後動作 | 不自動merge；文件錯誤用追補record |

## 可用命令與前提

以下是**待核准操作說明，不在此規劃PR執行**。placeholder 必須由已核准packet實值取代；
不把範例當runtime值。shell在repository root，使用專案支援Node/pnpm。

### source tests 與非mutation helper

~~~powershell
corepack pnpm exec vitest run scripts/c1-calendar-sync-bootstrap.test.mjs scripts/stage-f-acceptance-matrix.test.mjs scripts/stage-f-source-closeout.test.mjs scripts/stage-f-source-remediation.test.mjs
terraform -chdir=infra/terraform/c1-internal-test-run init -backend=false
terraform -chdir=infra/terraform/c1-internal-test-run validate
terraform -chdir=infra/terraform/c1-internal-test-run test
node scripts/internal-test-image-names.mjs
node scripts/stage-f-deployment-graph.mjs
node scripts/stage-f-human-alert-proof.mjs
corepack pnpm run inspect:internal-test-backup -- inspect <private-backup-snapshot.json>
corepack pnpm run inspect:internal-preproduction -- inspect <private-complete-snapshot.json>
~~~

Terraform source tests 只在無live tfvars/不連production的isolatedsource工作區做mocked tests；
執行realplan前另對正確remote backend初始化，不能拿上面backend=false的state做apply。
human-alert helper永遠plan-only，--execute會拒絕；不會送出通知。
backup inspect只看保護設定；不是restore。完整snapshot欄位先讀各assembler，不能依文字report自填true。

### build / digest

~~~text
gcloud builds submit --project=beauessence-clinic-stg-c1a01 --region=asia-east1 --config=containers/internal-test.cloudbuild.yaml --substitutions=_SOURCE_SHA=<AUTHORITY_SHA>
~~~

既有 exported function planInternalTestImageBuild 可輸出此命令，必須用 import 傳入 packet；
node scripts/internal-test-image-names.mjs 只跑 source inspect，沒有 build planner CLI mode，它自身不 build。
檢查Cloud Build上傳清單不含operatoroutput/private tfvars/credentials。
tag必須exactSHA；部署使用 asia-east1-docker.pkg.dev/<C1>/internal-test/api@sha256:…、
worker@sha256:…，不能tag-only。不要重建Artifact Registry或混入cal-pilot repository。

### Terraform inputs 與 plan/apply

共用inputs（私有檔案，禁止入git）：exact_apply_authority_sha、project_id、region、
api_image、worker_image、firebase_auth_domain、api_secret_versions、worker_secret_versions、
internal_test_booking_enabled、internal_test_booking_expires_at_utc、
worker_processing_enabled、worker_schedule_paused。

| 階段 | prerequisites | sync enabled | sync schedule paused | pseudonym pin |
| --- | --- | --- | --- | --- |
| Stage 1 | true | false | true | not_granted（不建立runtime mount） |
| Stage 2 | true | true | true | Gate08已建立的numeric version |

實際variable名稱：calendar_sync_prerequisites_enabled、calendar_sync_enabled、
calendar_sync_schedule_paused、calendar_sync_pseudonym_secret_version。
api/worker secret map 每個mount各自numeric pin；不用退休的secret_resource_version或latest。
authDomain為README限制的isolatedpreviewhost，不自猜firebaseapp.com。

~~~text
terraform -chdir=infra/terraform/c1-internal-test-run plan -input=false -var-file=<approved-stage1.tfvars> -out=<private-stage1.tfplan>
terraform -chdir=infra/terraform/c1-internal-test-run show -json <private-stage1.tfplan>
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false <private-stage1.tfplan>
# Gate07～09完成後，用不同檔案與fresh state重新plan：
terraform -chdir=infra/terraform/c1-internal-test-run plan -input=false -var-file=<approved-stage2.tfvars> -out=<private-stage2.tfplan>
terraform -chdir=infra/terraform/c1-internal-test-run show -json <private-stage2.tfplan>
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false <private-stage2.tfplan>
~~~

完整plan必須比較：project/region/state、所有create/update/delete/replace、API/outboxtraffic/image/env、
IAMrole與member、secretcontainer/mount、deletionprotection、Schedulerstate/retry、network與APIenablement。
不只看新增resources。Stage1雖不建syncservice，**仍可能切換API/outbox revision**。
本對話 2026-09-22 dated readback 的 outboxdrain 為 ENABLED，執行時以 Gate02 fresh readback 為準；
不可用預設 true 暫停它而聲稱只有 prerequisites 變化。
若計畫要暫停／恢復outbox，逐步明列授權；不要把「all inbound paused」解作outbox也必須paused。
絕不對已存在stack套not_granted以「關閉」；for_each變空可能plan destroy。

### config bootstrap 是寫入

腳本沒有CLI flags。先確認兩個doc皆不存在、該環境無 emulator host且 ADC 已驗證：

~~~powershell
$env:GOOGLE_CLOUD_PROJECT = 'beauessence-clinic-stg-c1a01'
$env:C1_CALENDAR_SYNC_BOOTSTRAP_CONFIRM = 'YES'
$env:C1_CALENDAR_SYNC_AUTHORITY_SHA = '<approved-40-char-sha>'
$env:C1_CALENDAR_SYNC_EXPIRES_AT = '<approved-exact-UTC-expiry>'
node scripts/c1-calendar-sync-bootstrap.mjs
~~~

會transaction create calendar_pilot_configuration/active、
calendar_pilot_sources/c1_synthetic_calendar、calendar_pilot_audit_events/<randomId>。
config會inboundEnabled=true/outboundEnabled=true；排程PAUSED仍是獨立控制。
expire須future且≤31days，sourceSha採輸入；腳本**不會自行查main或讀owner核准**，操作者仍須外部守門。
已存在任一doc即拒絕；不可先delete再重跑。這是授權草稿需補上的明確Firestore mutation。

### 單次 sync

既有Scheduler job：internal-test-calendar-sync，target /tasks/calendar-sync，
region asia-east1，OIDC使用dedicated scheduler identity；自動retry_count=0。
手動觸發paused job是一個獨立寫操作，須列MANUAL_SYNC_INVOCATIONS數量。
Stage 2 建立並 readback job 後，已批准的單次入口如下；使用既有已准 CLI caller 的
cloudscheduler.jobs.run 權限，讓 job 自帶 OIDC 呼叫 worker，不輸出 token：

~~~text
gcloud scheduler jobs run internal-test-calendar-sync --location=asia-east1 --project=beauessence-clinic-stg-c1a01
~~~

命令是立即 dispatch，回應成功不等於 worker 完成；須等待對應 worker run/lease/audit 結果。
job 尚在執行時不得再 run，避免重疊。執行時先核對 CLI 版本及 paused job 的實際結果；
若拒絕則 STOP，不用 resume 繞過，不私自擴 IAM 或開 unauthenticated。
每次讀回 job 仍 PAUSED。沒有現成「一鍵P1-09」helper。
來源：[gcloud 單次執行](https://docs.cloud.google.com/sdk/gcloud/reference/scheduler/jobs/run)、
[jobs.run API 權限與 dispatch](https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs/run)（2026-09-22 核對）。

## Candidate fixture／判定

1. 選**同一個已核准synthetic appointment**，記Firestore版本/時間、linkedeventID、已完成outbox、
   Calendar基準etag/安全event欄位及目前candidate數；資料仍與default SoT一致。
2. 在核准次數內先建立sync baseline（若需initial fullsync）；讀syncToken狀態但不把值入git。
3. 操作者只修改該synthetic event的一個可控欄位（例如核准時段），不碰正式Calendar。
4. 單次sync後恰一個pending candidate指向原appointment/event/source；originalappointment未自動採納外部變更。
5. 已授權staff Workbench **拒絕**此candidate，不能approve充作同一案例。
6. 記audit actor-role/action（不輸出rawUID）、candidate rejected、restore outbox與linkedappointment關係。
7. outbox恢復投影到Firestore既定值；同一eventID、沒有第二個新event，appointment版本符合拒絕語意。
8. 在預先批准範圍內做一次同一輸入/replay，candidate不多生、projection不重複；attempt/finalcount對帳。
9. 不只截UI。缺獨立Calendar readback就NOT_PROVEN，不以outbox completed替代外部event內容。
10. 每階段失敗停止；不得手改candidate為rejected或補一筆completed outbox偽造通過。

## 429 與 durable 證據（最多20次）

準備時讀RATE_LIMIT_POLICIES，選現有lookup_or_auth_failure的已核准安全查詢路徑，
計算命中上限所需N；若N>20或無法安全測durable，先報計畫缺口，不提高上限或改server threshold。
body固定同一無真資料synthetic lookup，走同一isolatedHosting URL及client。
不得改每次lookup、IP、proxy headers、identity，以免不同durablekey使測試無效。
不使用測試限定的x-test-actor-id等header去冒充正式auth。

記錄每次送出序號/UTC/status，client自動重試也計入20；工具失敗但可能送出亦計入。
固定window開始/結束與bucket TTL，避免跨window以致永不命中。命中expected429即停，
不是為湊滿20繼續打。驗Retry-After合理、response generic、沒有被拒卻產booking/session。

**重要：現有WpB2RateLimiter先跑in-memory burst，再寫durablestore。**
看到429加上Firestore已有counter，仍可能只有burst拒絕，不能單憑此稱durable拒絕已證明。
計畫必須預先選下列一種可歸因證據且不超原授權：

- 用已核准、固定同source/digest但全新process／獨立instance的請求，在同一window和同key下
  讀取已累積durablecounter並由它拒絕；額外revision/traffic mutation必須寫在新packet，
  保持Hosting proxy chain一致，不能隨機改URL繞過clientidentity。
- 或使用目前實際可取得的stage-specific安全trace，能排除burst分支並證明Firestore consume拒絕。
  若source沒有此可歸因trace，就不能假設它存在。

若新packet沒有前者權限而後者不可得：只標HTTP_429_PROVEN／DURABLE_REJECTION_NOT_PROVEN，
P1-09不完整；先提最小診斷source或可審測試方案，不私自冷啟動/調concurrency/擴流量。
bucket raw key若含IP/identifier僅存私有；公開摘要只用安全hash，不新增PIItelemetry。

## Evaluator 正確使用

Gate16 必須另補 P1-04 fail-closed smoke（矩陣 SEC-13）、CSP/disabled staff（SEC-14）及原 F-01～14 對帳。
missing settings 的 boot failure 用 source/emulator 證明；deployed off/expired gate 要另列
有界 negative revision/env 變更及回退授權，不為測503停掉目前安全主服務。
未在新packet批准的配置變更不可做，相關驗收保留NOT_PROVEN；不能只因11case布林過關就關帳。

stage-f-acceptance-matrix.mjs直接CLI只用空snapshot；Windows也有其direct-run guard限制。
inspect:stage-f-matrix 不會讀入你提供的snapshot，也不會執行UI。
需在私有evidence runner中import evaluateStageFAcceptanceMatrix並傳入已驗證snapshot。
runner必須檢查11個case各有artifact、UTC、source、expected/actual，不可只編11個pass:true。
回傳ok=false要nonzero exit code；入口設計有差異時先修本機runner，不修改required矩陣來過關。

~~~text
general_booking_page_create_reload
workbench_arrived_completed
calendar_outbound_same_event
return_lookup_existing
return_required_unscheduled_follow_up
candidate_review_synthetic_manual_change
security_rate_limit
security_anti_enumeration
security_denial_audit
security_one_real_human_alert
persistence_reload_server_readback
~~~

human案例同時要humanInboxProof且綁incident；「已收到」未對應incident不可自行補齊。
backup inspector取databases陣列第一項：有clone後組snapshot必須明確選(default)，
不能把clone排列第一而誤驗其他DB。P1-09在source門檻只要求backup設定inspect；
Google真還原V1～V6另由CP-06完成，兩者不混淆。

## 分項 rollback / handoff

- API：恢復已驗證known-goodrevision的traffic與對應env/pins；不是只寫revision仍存在。
- worker：還原baseline版本與processing設定；若事故需要暫停outbox，須在packet列緊急停寫權限。
- Hosting：僅隔離channel回已核對version/tag/target；先readback可用，無可用即STOP。
- inbound：始終PAUSED；不再手動run；不做terraform destroy、不刪candidate/audit掩蓋證據。
- newsecret/ACL：未被用才可依已准cleanup禁用新版本/移除新binding；不可撤舊outboxCalendar權限。
- config/Firestore：無預設rollback刪除；保留audit與失敗現場，另提precision repair。
- restore/刪資料/AWS/officialHosting/productionIAM永不落在本包rollback授權。

~~~text
AUTHORITY_SHA =
AUTHORITY_EXPIRES_AT =
DEPLOYED_API =
DEPLOYED_WORKER =
CALENDAR_SYNC =
INBOUND_SCHEDULER = PAUSED
OUTBOX_SCHEDULER =
HOSTING_TARGET =
CANDIDATE_LIFECYCLE =
RATE_LIMIT_REQUESTS =
RATE_LIMIT_HTTP_429 =
RATE_LIMIT_DURABLE_REJECTION =
ROLLBACK_READY =
STRICT_STAGE_F =
OLD_COMPLETENESS_INSPECT =
P1_09 =
CLOUD_MUTATIONS =
UNEXPECTED_MUTATIONS =
SOURCE_MUTATION = NONE
NEXT_ACTION =
~~~
