# Stage 2 C0 readiness artifacts（2026-07-29）

**狀態：Proposal ready／approval pending／plan-only。**

本文件把 Stage 2 C0 可在核准前完成的五類產物整理成可審查版本：logical resource
manifest、Cloud IAM matrix proposal、成本輸入模型、災難復原方案比較，以及測試／
回滾證據模板。它不代表任何人已核准內容，也不建立 project、連結帳務、啟用 API、
建立身分或 secret、執行 Terraform，或產生 cloud 實測證據。

權威邊界仍是
[Stage 2 身分與 Cloud change plan](stage-2-identity-and-cloud-change-plan-2026-07-28.md)
與[決策登錄](../product/phase-1-decision-register.md)。本文件使用下列狀態，避免把
提案、待決策與實測混在一起：

| 狀態 | 意義 |
| --- | --- |
| `RECORDED` | 已在決策登錄或現行權威文件明確記錄，可作為提案輸入 |
| `PROPOSED` | 可供技術／資安審查的工程提案，尚未核准或實作 |
| `TBD — approval` | 必須由具名 owner／reviewer 選定或核准，不由工程端推定 |
| `TBD — engineering` | 核准範圍確定後仍須完成的技術選型、量測或 provider 驗證 |
| `TBD — evidence` | 只有 C1 request 取得 authority 後，實際連結／操作獲准 cloud slice 才能填入的結果 |

產物順序不得倒置：

1. C0 review 核准 plan-only 選案、owner 值、成本與風險；
2. C0 approved 後準備 C1 request packet：凍結 C1-only manifest／排除項、
   Terraform source proposal、決策級成本、具名 operator／approver、兩階段
   plan/apply gate 與 rollback；仍不連 cloud；
3. C1 deployment authority 明確授予後，才產生／審查 provider-backed Terraform
   plan，符合獲准 request 且 apply approver 再確認後才 apply；actual IDs、plan
   hash、apply／test／rollback 結果都是 post-authority evidence。

## 1. 固定輸入與邊界

| 項目 | 值 | 狀態／限制 |
| --- | --- | --- |
| 環境 | isolated synthetic-only staging | `RECORDED`；不建立 production、不放真實員工／患者資料 |
| project 所有權 | 診所為法定與帳務擁有者 | `RECORDED`；具名 billing principal 仍為 `TBD — approval` |
| primary region | `asia-east1` | `RECORDED`；Firestore database location 建立後不可變更 |
| resilience target | RPO 1 小時／RTO 4 小時 | `RECORDED`；適用 database、whole-project、regional failure，但尚無達標證據 |
| staff identity baseline | Google federated sign-in＋診所自管帳號；全員 MFA；local TOTP | `RECORDED`；recovery 與 provider 細節仍待審查 |
| session baseline | idle 30 分鐘／absolute 8 小時；停權後下一個 protected request 拒絕 | `RECORDED`；尚未實作 |
| emergency access | 不建立 break-glass path | `RECORDED` 的 fail-closed planning default；另行核准前不配置 binding |
| data boundary | synthetic opaque values only | `RECORDED`；不得以 preview fixture 當用量或正式政策 |
| 現有 Hosting preview | `beauessence-clinic-staging` 只作 expiring static preview | `RECORDED`；不得把它默認成 Stage 2 application project |
| Calendar resources | 不納入 C1 apply candidate | D-009 尚未核准；只可在本文件列為 Stage 3 conditional inventory |
| Firestore resources | **不納入 C1 isolated-foundation candidate** | database、indexes、Rules、backup／PITR 與 database IAM binding 只能在後續獨立獲准 slice 建立 |

## 2. Logical resource manifest

### 2.1 使用規則

這是**邏輯清單，不是 Terraform manifest 或 apply authority**。logical ID 只用來
審查依賴、成本、權限與回滾；實際 project ID、billing account、principal、bucket
name、secret name、hostname 與 resource ID 一律保持 `TBD`，也不得加入 secret
payload。

C1 deployment request 只能選取下表明列為 C1 candidate 且通過 C0 的列。C2～C6
與 Stage 3 列是為了看見後續依賴和成本，不能因出現在 manifest 就提前建立。
**C1 明確排除 Firestore database、`firestore.googleapis.com`、database IAM binding、
indexes、Rules、backup／PITR 與任何 application document。**

### 2.2 C1 isolated-foundation candidate

| Logical ID | Resource class | 用途／必要控制 | Location／data | Rollback class | 尚未完成的 gate |
| --- | --- | --- | --- | --- | --- |
| `stg.project` | isolated Google Cloud/Firebase project | 與 static preview、dev、production 分離；標籤含 environment 與 synthetic-only | project metadata global；regional resources 依各列 | 先停用新增能力並 quarantine；project deletion 不是預設回滾 | project ID、parent organization/folder、billing link：`TBD — approval` |
| `stg.billing-link` | billing account attachment | 診所帳務所有權；不可由 CI 自行更換 | 不含業務資料 | detach 需另行核准，不作自動 rollback | billing account、billing principal、月預算：`TBD — approval` |
| `stg.api-allowlist` | enabled-service allowlist | 只啟用獲准 slice 所需 API；禁止「先全開再說」；C1 allowlist 不含 `firestore.googleapis.com` | project scope | 關閉未使用 API 前先查依賴 | 精確 C1 API allowlist：`TBD — engineering`；須隨 C1 request 審查 |
| `stg.tfstate` | versioned GCS remote-state bucket | uniform bucket-level access、versioning、無 public access；state 不進 Git | bucket location：`TBD — engineering`；不得含 app data | 保留版本供調查；不以刪 bucket 回滾 | bootstrap project/location、retention、state operator：`TBD — approval` |
| `stg.wif.github` | Workload Identity Federation pool/provider | GitHub CI 使用短期 federated identity；不建立長期 SA key | global identity metadata | disable provider／移除 binding | repository/environment claims 與 reviewer：`TBD — approval` |
| `stg.sa.terraform` | Terraform CI service account | 只對受審核 C1 plan 操作；不得讀 Firestore application data | staging project only | disable SA、移除 WIF binding | exact role/custom-role permissions：`TBD — engineering`＋資安核准 |
| `stg.sa.deployer` | application deployer service account | 未來部署 artifact/runtime；不得讀 Firestore data或 secret payload | staging project only | disable SA、移除 WIF binding | C1 是否只建立 identity、不授予 deploy：`TBD — approval` |
| `stg.sa.api-runtime` | API runtime service account | 未來 C3～C6 使用；C1 不部署 API、**不授予 database permission** | staging project；C1 無 database | disable SA、撤銷未來 slice 才可能加入的 access | 後續 Firestore／secret permission set：`TBD — engineering`；見 §3 residual risk |
| `stg.secret-containers` | Secret Manager API與空容器 | C1 最多建立獲准名稱的空容器；不建立 secret version／payload | staging project；secret residency/provider 行為需驗證 | disable version；空容器可保留 | 實際 secret inventory、rotation owner：`TBD — approval` |
| `stg.logging-monitoring` | baseline logs/metrics/alerts | 無患者識別；只建立有 runbook 的告警 | staging project | disable policy／回復前一版設定 | notification channel、security-log retention：`TBD — approval` |
| `stg.budget` | billing budget and alerts | 50%／80%／100% 為提案門檻；budget 不等於硬性停用 | billing metadata only | 恢復前一版 threshold／recipient | 月預算、primary/backup recipient、各 threshold 處置：`TBD — approval` |

### 2.3 C2～C6 conditional inventory

| Logical ID | Slice | Resource class／目的 | 固定輸入 | 不得提前推定的值 |
| --- | --- | --- | --- | --- |
| `stg.identity-platform` | C2 | Google＋local staff IdP、email verification、MFA | 全員 MFA、local TOTP | provider configuration、Google managed-MFA evidence、recovery flow、cost quantity |
| `stg.firestore.primary` | C5/C6 | Firestore Native source of truth、delete protection、PITR／backup | primary `asia-east1`、synthetic-only、direct client deny；**C1 明確排除** | database ID、edition、backup/PITR final configuration，以及後續 slice 的獨立 authority |
| `stg.session-state` | C3 | server-side session version／last-activity state | idle 30m／absolute 8h | persistence technology、capacity、expiry implementation |
| `stg.rate-limit-state` | C4 | shared authorization-code／API throttling state | fail closed、不能只依 IP | shared-store technology、window/backoff parameters、capacity |
| `stg.artifact-registry` | C6 | versioned API image artifacts | commit-bound、no embedded secrets | repository location、retention、build provenance |
| `stg.cloud-run.api` | C6 | staff-only API runtime | primary `asia-east1`、no public booking route | CPU/RAM、min/max instance、concurrency、ingress、image digest |
| `stg.staff-web` | C6 | authenticated staff staging surface | synthetic-only；不得依 browser role switch 授權 | Hosting/runtime target、hostname、cache/auth boundary |
| `stg.audit-capacity-alert` | C5 | permanent append-only audit growth alert | audit permanent；application role 無 update/delete path | threshold、notification owner、projection/export access pending D-002 |
| `stg.synthetic-seed-reset` | C6 | operator-only synthetic reset/seed | staging only、具名 audit | operator action、runtime identity、retention |

### 2.4 C0 DR 與 Stage 3 conditional inventory

| Logical bundle | 範圍 | 狀態 |
| --- | --- | --- |
| `dr.secondary-project`／`dr.secondary-location`／`dr.data-copy`／`dr.runtime-bootstrap`／`dr.routing` | whole-project／regional failure 的 secondary project、資料複本、IAM／secret bootstrap、API/Web 與 routing | `TBD — approval`；須先選 §5 方案，任何真實資料跨區另受 D-001～D-003 |
| `stage3.worker-runtime`／`stage3.scheduler`／`stage3.calendar-secret`／`stage3.reconciliation` | Calendar outbox runner、每分鐘觸發、credential 與對帳 | D-009 pending；不是 Stage 2 base cost，也不是 C1 resource |

## 3. Cloud IAM matrix proposal

### 3.1 邊界

本節描述的是 **Google Cloud IAM**，不是 D-006 的 application role matrix。
`administrator`、`front_desk`、`physician` 不因應用程式角色而取得 Cloud Console
或 service-account 權限。

Firestore server client／Admin SDK 會繞過 Firestore Security Rules。Firestore IAM
可依 database 做 condition，但本計畫不把「只允許某幾個 collection」宣稱為已由
IAM 強制成立。API／worker 的 collection path 必須在 adapter allowlist、application
authorization 與 negative tests 守住；若 runtime identity 被接管，database-scope
permission 仍是 residual risk，須由技術／資安 reviewer 明確接受或以額外隔離設計
降低。

### 3.2 主體與能力

| Principal class | 允許能力（proposal） | 明確禁止 | 身分控制／覆核 | 未決欄位 |
| --- | --- | --- | --- | --- |
| Clinic billing owner | 管理 clinic-owned billing relationship、核准 budget 與 recipient | 不因 billing 權限取得 Firestore、secret 或 deploy 權限 | human MFA；與 deploy identity 分離 | named principal、backup principal、review cadence：`TBD — approval` |
| Technical/security reviewer | 讀 plan、resource metadata、IAM policy、logs/metrics 設定；核准或退回 | 不作日常資料瀏覽；reviewer 不自動取得 apply | human MFA；具名 review record | principals、read-only/JIT role set：`TBD — approval` |
| Human cloud administrator | 經 change record 的低頻治理；必要時撤銷 service identity | 無共享帳號；無常駐 patient-data read；不得用 Owner／Editor 取代 matrix | human MFA、time-bounded elevation、每次有 ticket/audit | named principal、elevation mechanism、cadence：`TBD — approval` |
| Terraform CI | 對 staging approved plan 建立／更新明列資源 | 無 production、無 Firestore entity read、無 secret payload read、無長期 key | WIF、repository/environment claim、plan/apply 分離 | exact custom/predefined roles：`TBD — engineering` |
| Application deployer CI | 上傳獲准 artifact、部署明列 runtime、必要的 runtime `actAs` | 不讀 Firestore entities、不管理 IAM/billing、不讀 secret payload | WIF；deploy artifact 綁 commit／digest | exact role set、apply approver：`TBD — approval` |
| API runtime | 依 application service 讀寫 primary database、寫 application log/metric、讀指定 API secret | 無 IAM/billing/backup admin；不列舉其他 secret；不得由應用路徑修改／刪除 audit | dedicated SA、無 key、每個 protected request server-side authz | database permission design、secret list：`TBD — engineering` |
| Worker runtime | **現行程式需要讀 `appointments`，並讀寫 `outbox_jobs`**；D-009 後才增加 Calendar secret／`calendar_links` 對帳 | 不管理 staff identity、billing、IAM；D-009 前不建立 Calendar credential | dedicated SA、無 key、低基數 metrics | Stage 3 only；D-009、exact permission set |
| Restore drill operator | 在獲准 drill window 列出備份／PITR、export/import/restore 到**新 database**並執行驗證 | 不作 in-place delete/restore、不刪 source/backup、不常駐讀取 | JIT、human MFA、雙人或具名批准、每次留 evidence | named operator、approver、exact restore/storage roles：`TBD — approval` |
| Observability service identity | 寫低基數 metrics/logs、使用指定 notification integration | 不讀 application documents、不取得通用 secret access | dedicated identity、指定 secret only | channel technology、recipient：`TBD — approval` |
| Emergency/break-glass | **無** | 不建立隱藏 bypass、共享緊急帳號或預先綁定高權限 | fail closed | 另有核准前維持 `NOT PROVISIONED` |
| Google-managed service agents | 只保留 provider 建立且官方要求的 service-agent binding | 不把 service-agent role 授予 human 或自建 runtime SA | 由 manifest 明列並驗證 drift | 實際 agent／role 於 C1 plan 產生後核對 |

### 3.3 IAM 驗收提案

- project policy 不含 human／custom service account 的 primitive Owner／Editor；
- WIF claim 不符合 repository、branch/environment 時不能 impersonate；
- Terraform CI 與 deployer 都不能讀 Firestore entity 或 secret payload；
- API runtime 不能管理 IAM、billing、backup、Identity Platform configuration；
- worker runtime 的測試必須覆蓋「可讀 appointment＋可更新 outbox」以及禁止未列
  cloud capability；不能用舊文件的 `outbox/calendar_links only` 當證據；
- restore operator grant 到期後再次操作必須拒絕；Firestore IAM propagation
  latency 要在演練時間軸中量測；
- direct mobile/web Firestore read/write 維持 deny；
- application tests 另證明 audit path 無 update/delete command；這不是 Cloud IAM
  collection-level guarantee。

## 4. Cost-input model

### 4.1 計算規則

本節只建立**輸入與公式**，不填任意單價、用量、免費額度或月總額。正式試算必須
記錄 pricing source、查價日期、region、幣別、稅／匯率、是否含 credit，以及
low/base/high 三種量；不能把當下免費額度當成成本上限。

```text
monthly line cost = billable monthly quantity × unit price at recorded date
scenario total = sum(in-scope line cost)
DR incremental cost = selected DR scenario total - Stage 2 base total
budget percentage = forecast monthly total / approved monthly budget
```

Billing budget 的 50%／80%／100% 是 `PROPOSED` 告警門檻，不會自動停止費用；
月預算與各門檻處置仍是 `TBD — approval`。

### 4.2 情境

| Scenario | 包含 | 明確排除 |
| --- | --- | --- |
| C1 foundation | project baseline、state、WIF／service identities、empty secret containers、baseline logging/monitoring、budget | Identity Platform、**Firestore database/API/database IAM/indexes/Rules/backup/PITR**、runtime、Calendar、DR secondary |
| Stage 2 base | C1＋C2～C6 的 approved synthetic staff API resources | production、真實資料、Calendar Stage 3 |
| DR option | Stage 2 base＋§5 被選定的 secondary/data-copy/routing bundle | 未選定方案不得混入 base |
| Stage 3 conditional | worker/scheduler/Calendar secret/reconciliation | D-009 前不納入 approved Stage 2 estimate |

### 4.3 輸入表

| Service／cost driver | 月用量輸入 | 已知值 | 尚待填寫 |
| --- | --- | --- | --- |
| Identity Platform | Google/local MAU、每月 sign-in／MFA activity、provider-specific charge | Google＋local staff、全員 MFA | synthetic staff count、MAU、provider price/date：`TBD` |
| Firestore operations | document reads/writes/deletes、index writes、transaction retry multiplier | primary `asia-east1`；synthetic only | monthly operations and peak multiplier：`TBD` |
| Firestore storage | documents、indexes、permanent audit monthly growth | audit retention permanent | initial size、monthly growth、index factor：`TBD` |
| Firestore PITR/backups | protected bytes、PITR window、backup retained bytes、restore bytes | PITR 7d、daily backup retention 30d are `PROPOSED` | actual bytes、price/date、restore-drill frequency：`TBD` |
| Managed export/import | documents exported/read、export bytes、import bytes | recurring export charges reads; only selected DR option includes it | frequency、collections/whole DB、duration、price/date：`TBD` |
| Cloud Run API | requests、vCPU-s、GiB-s、instance hours、egress | region `asia-east1` | CPU/RAM、min/max、concurrency、request duration：`TBD` |
| Artifact Registry/build | image storage、egress/build minutes | commit/digest-bound required | build system、image size/retention、price/date：`TBD` |
| Cloud Storage | tfstate versions、DR export/copy bytes、operations、egress | state must be versioned/non-public | bucket locations、retention、DR copy volume：`TBD` |
| Secret Manager | active versions、access operations、rotation overlap | no payload in C1; per-secret accessor | secret inventory、versions、access rate、price/date：`TBD` |
| Logging | ingestion GiB、retained GiB、exclusions | application logs 30d are `PROPOSED`; no patient identifiers | security-log retention、volume、price/date：`TBD` |
| Monitoring/alerts | metric samples/time series、notification integration | low-cardinality labels required | metric volume、channel cost：`TBD` |
| Network/routing | regional/inter-region egress、DNS/edge requests | primary `asia-east1` | hostname/routing、DR transfer and egress：`TBD` |
| Stage 3 worker | invocations、vCPU/GiB-s、Scheduler jobs、Calendar calls | design: 60s trigger, max 1 instance, 300s timeout | D-009 approval and measured batch duration；separate scenario only |

### 4.4 Owner／measurement inputs

```text
Pricing as-of date: TBD — engineering
Billing currency／tax／FX source: TBD — approval
Synthetic staff count and monthly active staff: TBD — approval
Monthly API requests / Firestore reads / writes / deletes: TBD — measurement
Initial data / index / audit size and monthly growth: TBD — measurement
Cloud Run CPU / RAM / min / max / concurrency: TBD — engineering review
Selected DR option and copy frequency: TBD — approval
Approved staging monthly budget: TBD — approval
50% action / 80% action / 100% action: TBD — approval
Primary alert recipient / backup recipient: TBD — approval
Decision-grade monthly estimate: TBD — evidence
```

## 5. Disaster-recovery option analysis

### 5.1 三種 failure class 的共同驗收

每個方案都必須分別說明 database loss、whole-project failure、regional failure，
並量測：

- source 最後一筆可驗證資料時間與實際 recovery point；
- incident start、decision、restore/import、validation、route switch、service
  available 各時間點；
- IAM、service identity、secret／encryption bootstrap 是否依賴已失效 project；
- API/Web、Firestore indexes/Rules、outbox/idempotency/audit 是否完整；
- failback、重複寫入、遺失操作與人工紙本補登程序；
- 實際 RPO 是否 ≤ 1 小時、實際 RTO 是否 ≤ 4 小時。

沒有合成 cloud drill 前，所有方案都只能標 `PROPOSED`。

### 5.2 方案比較

| Option | 設計摘要 | 可涵蓋的 failure class | 主要限制／成本 | 結論 |
| --- | --- | --- | --- | --- |
| A — same-location backup＋PITR | `asia-east1` daily backup、PITR、restore/clone 到新 database | database loss；同 project 可用時的誤刪／損壞 | backup 與 source 同 location；排程時間不可指定；不能單獨處理 whole-project／regional failure | 必要 baseline，但**不是**完整 D-010 DR |
| B — scheduled managed export＋secondary project/location | 至少每小時觸發 export；export artifact 位於獨立 project，依目的地要求複製到適合 bucket，再 import/validate 到 secondary Firestore；預先保存 IaC／IAM bootstrap | 可提案涵蓋 whole-project／regional failure | export 不是 export-start 的精確 snapshot、每份文件產生讀取成本；完成／copy/import 時間可能超過窗口；secondary location、跨境與 routing 未決 | 可審查候選；RPO/RTO 必須用實際資料量演練 |
| C — application/outbox asynchronous replica | primary transaction 只寫本地 intent；獨立 idempotent replicator 依序寫 secondary，量測 lag 並對帳 | 可提案涵蓋 whole-project／regional failure，RPO 潛力較低 | 新增 ordering、schema/version、poison message、reconciliation、雙邊 failback 複雜度；不得在 booking transaction 直接呼叫 secondary | 高複雜候選；需新 threat/model、code、cost review |
| D — supersede primary with Firestore multi-region | 建立時直接選 multi-region，由平台處理跨 region replica | regional infrastructure outage | 與已核准 `asia-east1` primary 不相容；資料位置、延遲、成本與跨境需重開 D-010 及 D-001～D-003 | 不是現行 plan 的可直接選項 |

### 5.3 待選與共同 bootstrap

```text
Selected option: TBD — approval
Secondary project logical owner: clinic; exact project ID TBD — approval
Secondary location: TBD — approval
Maximum replica/export age: TBD — approval (must be compatible with RPO 1h)
Encryption/CMEK decision: TBD — security review
Independent state/IaC access when primary project is unavailable: TBD — engineering
Secret bootstrap and rotation: TBD — security review
API/Web standby mode (cold/warm): TBD — approval and cost review
DNS/routing mechanism and hostname: TBD — approval
Integrity validation and failback owner: TBD — approval
```

Stage 2 可以用合成資料演練被選方案；任何真實資料離開 `asia-east1` 或臺灣前，仍須
D-001～D-003 的處理者／區域／跨境審查。

## 6. Test and rollback evidence template

### 6.1 Change evidence

```markdown
# Stage 2 change evidence

| Field | Value |
| --- | --- |
| Change ID / slice | TBD |
| Authorised scope / explicit exclusions | TBD |
| Applicable verification sections | common / C1 / later slice / DR; TBD |
| Manifest version / commit SHA | TBD |
| Environment / project logical ID | synthetic staging / TBD |
| Actual project / resource IDs | TBD — evidence after authority |
| Terraform plan artifact and SHA-256 | TBD — evidence after authority |
| Apply authority / approver / date | TBD — approval |
| Operator identity | TBD — evidence |
| Start / finish time (Asia/Taipei + UTC) | TBD — evidence |
| Synthetic-only confirmation | TBD — evidence |
| Cost forecast / approved budget reference | TBD |
| Result | not_run / pass / fail / rolled_back |

## Pre-change

- [ ] No production resource is in the manifest.
- [ ] The project is distinct from the static preview project.
- [ ] No real staff/patient data or secret payload is in repository/state/plan output.
- [ ] IAM diff contains no primitive Owner/Editor grant to human/custom SA.
- [ ] WIF claims, apply approver and per-resource rollback are reviewed.
- [ ] Selected DR design, cost and stop conditions are referenced when this is a DR
      slice; otherwise the approved scope records DR as `N/A` and excluded.

## Verification — common

| Check | Expected | Actual | Evidence reference |
| --- | --- | --- | --- |
| Unapproved principal cannot impersonate CI SA | denied | TBD | TBD |
| Terraform/deployer cannot read Firestore data or secret payload | denied | TBD | TBD |
| Budget/alerts target the reviewed recipient | configured | TBD | TBD |

## Verification — C1 isolated foundation only

| Check | Expected | Actual | Evidence reference |
| --- | --- | --- | --- |
| Firestore database/API/database IAM/indexes/Rules/backup/PITR | absent | TBD | TBD |
| Identity Platform and application runtime | absent | TBD | TBD |
| Public/patient route and Calendar effect | absent | TBD | TBD |

## Verification — later authorised slice only

| Check | Expected | Actual | Evidence reference |
| --- | --- | --- | --- |
| Direct mobile/web Firestore read/write | denied when the authorised slice includes a database | TBD | TBD |
| Runtime can perform only the authorised synthetic path | allowed/denied cases pass when runtime is in scope | TBD | TBD |
| Backup/PITR/restore smoke | V1–V6 when the authorised Firestore/backup slice is in scope | TBD | TBD |
| Database/project/regional drill | RPO ≤1h / RTO ≤4h only for the separately authorised DR slice | TBD | TBD |

Only execute the section(s) named by `Applicable verification sections`. Every
other section must be marked `N/A` with the authority/scope reference; a C1
absence result must never be reused as evidence that a later Firestore/runtime
slice passed, and later-slice evidence must never be inserted into a C1 record.

## Rollback / stop

| Trigger | Action | Started | Finished | Result / evidence |
| --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

## Residual risk and sign-off

Technical reviewer: TBD
Security reviewer: TBD
Billing reviewer: TBD
Open findings / accepted risk: TBD
```

### 6.2 Per-resource rollback classes

| Resource class | 預設 rollback proposal | 不可接受的作法 |
| --- | --- | --- |
| IAM/WIF binding | revoke binding／disable provider，驗證舊 principal 被拒絕 | 保留過寬權限等下次再修 |
| Service account | disable、撤銷 impersonation／secret access，保留 audit | 刪除後失去歸因證據 |
| Secret version | 先切回已驗證版本，再停用問題版本 | 先刪所有版本；把值貼入 Git／ticket |
| Cloud Run revision | route 0%／切回前一個已驗證 revision | 關閉 MFA/revocation/authz 讓服務「恢復」 |
| Budget/alert/log policy | 回復前一版 policy；保留 change evidence | 用停用 production 當成本控制 |
| Firestore database | 停止寫入、quarantine、restore 到新 database／forward fix | 以 database delete 或 in-place overwrite 當一般 rollback |
| Terraform state | 使用 versioned state 調查並修正，保留 plan/apply artifacts | 刪除 bucket/state 讓 drift 消失 |
| Project | 停止後續 slice、disable exposure、quarantine 等待具名決策 | 未經額外授權直接刪 project |

`terraform destroy` 不是本計畫的通用 rollback。資料、database location、Identity
Platform 使用者狀態與某些 provider 設定可能不可逆或有傳播延遲；每個 C1 request
必須逐資源選擇 disable、revert、forward-fix、quarantine 或另行授權 cleanup。

## 7. Readiness status and approval blockers

| Artifact | C0 review 尚缺 | C1 request prerequisite | Post-authority evidence |
| --- | --- | --- | --- |
| Logical resource manifest | owner 選定 scope、billing、C1 API allowlist 與後續 DR bundle；**C1 不含 Firestore** | 凍結 C1-only manifest／排除項、requested window、operator／approver | actual project/resource IDs、provider-backed plan/hash、apply result |
| Cloud IAM matrix | named principals、exact role/custom role、JIT/review cadence與 residual-risk acceptance | 凍結 C1 binding diff；不得含 Firestore database binding | actual policy diff、WIF／impersonation negative tests、撤銷 evidence |
| Cost-input model | quantities、unit prices/as-of、budget、recipient/actions | 依核准 C1 範圍提出 decision-grade forecast | actual budget/alert recipients、observed cost；不能以實際花費取代事前核准 |
| DR option analysis | selected option、secondary project/location、cost/privacy/routing approval | C1 request 明列 DR secondary／data copy 排除 | 後續獨立 authority 下的 restore／routing／RPO-RTO drill |
| Test/rollback template | reviewer 核准 pre-change、stop、rollback 與 slice applicability criteria | request 附空白 evidence template、逐資源 rollback 與兩階段 plan/apply gate | 只填適用的 plan/apply/test/restore/rollback artifact；不適用須附 scope reference，未執行不得填 pass |

仍須具名填寫：

```text
Technical reviewer / date: TBD — approval
Security reviewer / date: TBD — approval
Billing owner / approved staging monthly budget: TBD — approval
Primary alert recipient / backup recipient: TBD — approval
Selected DR option / secondary project / location: TBD — approval
MFA recovery / authorization-code limit, unlock, expiry and rotation parameters: TBD — approval
C0 conclusion: revise (until the above are resolved)
C1 request packet: NOT READY
C1 apply authority: NOT GRANTED
Connected-cloud evidence: NOT RUN
```

本文件完成只關閉「附件不存在」的文件缺口。它不關閉 owner decision、C1 request
packet、deployment approval 或 connected-cloud evidence 缺口。Provider-backed
Terraform plan 是 authority 後的證據，不是 C0／C1 request 前置；本文件也不得用來
宣稱 D-010 RPO/RTO target 已實現。
