# C1 商務交付批次部署 packet（2026-10-01）

**狀態：** `SOURCE_READINESS_BLOCKED`；文件準備完成，尚無本 packet 的雲端操作或 exact-SHA 授權。
**範圍：** `OWNER-BATCH-2026-09-29B` 第 1、2、3 項；只限合成 C1。
**專案：** `beauessence-clinic-stg-c1a01`；**區域：** `asia-east1`。
**Firebase Hosting channel：** `internal-preproduction`；API 設定檔 `firebase.isolated-api-preview.json`；靜態回退設定 `firebase.isolated-preview.json`。
**資料庫：** `(default)`，Firestore Native；本 packet 不准建立另一個 production／正式資料庫。

本 packet 是供業主審閱與之後填值的執行文件，不是雲端或資料操作授權。OWNER-BATCH 要求 CP-03～CP-05 與日曆格式所需 source 先合併、業主到場一次、另核准精確 SHA 和時間窗。下列 `SOURCE_SHA`、開始／截止 UTC、操作者、核准人、私有設定檔路徑與讀回值均須在新的 exact-SHA 核准儀式填妥；未填或不一致就停止。此文件自己的 commit 不會成為 apply SHA，也不會自行產生部署核准。

## 1. 綁定欄位與部署前置

| 欄位 | 目前值／完成條件 |
| --- | --- |
| 最終 source commit | `<業主於 CP-03～CP-07 與日曆 source 全部合併後填入 40 位 SHA；不得使用本文件 commit>` |
| 本地 `origin/main` | 必須等於核准 SHA、API/worker 建置 SHA 與 Terraform `exact_apply_authority_sha`；任何差異即 `AUTHORITY_INVALIDATED` |
| API / worker image | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/{api,worker}@sha256:<Cloud Build readback>`；不接受 tag 或 `latest` 作部署值 |
| 授權開始／截止 | `<業主填入 UTC start/end；只涵蓋一次到場批次；未核准前不得建置或 apply>` |
| Hosting expiry | 新 channel deployment 使用 `--expires 7d`；部署後把實際 `expireTime`（UTC）記入 evidence。啟用中的 booking gate expiry 必須不晚於該 Hosting expiry |
| 操作者／核准人 | `<由業主記入；不猜姓名或身分>` |
| C1 專案／區域 | `beauessence-clinic-stg-c1a01` / `asia-east1`；`beauessence-clinic-staging`、live channel、正式網域一律拒絕 |
| 既有 revision／Hosting version | `<apply 前於私有 manifest fresh-read；空值即停>` |
| 私有 tfvars | `<本機受控路徑；不得提交、貼入 PR 或聊天>` |
| 計費上限 | CP-06-E 演練另受 NT$500 上限及專屬授權約束；此 packet 不執行 CP-06-E |

### 必須先關閉的 source blockers

1. CP-07 termination／資料返還 receipt source 尚未出現在 baseline `0870a5fd16c720cafc085f29594bef7afb30a71b`。L6 所稱 L1～L5 全部合併前置條件尚未證明。先完成 CP-07 source 與 exact CI，再重新讀取 `origin/main`。
2. CP-03～CP-05 API 已讀取 `BUSINESS_DELIVERY_ENABLED`、`BUSINESS_DELIVERY_POLICY_VERSION`、`BUSINESS_DELIVERY_SCOPE`、`BUSINESS_DELIVERY_OBSERVED_SINCE`；登入分類也讀取 `BUSINESS_DELIVERY_MAINTENANCE_EMAILS`。本 branch 的 baseline `infra/terraform/c1-internal-test-run` 尚未暴露這些 inputs。Infra source 初始提交 `8ebbe840ad875e27d2c453036e0956f172de8b72` 加入 typed inputs、maintenance-email Secret Manager reference/container 與 API-only IAM/env mount，但 parent review 發現 first-enable sequencing gap；該提交沒有 CI，也不可部署。獨立修正提交正在準備中。必須檢閱修正後最終 diff、exact CI、private tfvars schema 與完整 plan，確認兩階段 fail-closed sequencing 和無 Console／gcloud env mutation 繞過 Terraform，再按最終來源更新本 packet。
3. CP-03/04/05 商務操作的 Workbench UI 尚未落地。本 packet 的 API readback 不等於診所可用畫面；CP08／CP09 仍須等實際 UI 與 C1 操作證據。
4. `OWNER-BATCH-2026-09-29B` 將 CP-06-E 真正還原安排在測試交付後微調期；它仍是 `CURRENT_PROJECT_ACCEPTANCE` 的必要證據。執行須另核准 exact SHA、restore 時窗、source／新 destination database、recovery Calendar、清理 ID 與預算；不得把本批 deploy authority 套用到還原。

## 2. 功能設定與單一批次邊界

以下是應用程式實際讀取的設定名稱。值只用本節及已接受的 C1 synthetic scope；maintenance identities 由業主私下提供，保存於本機 tfvars，絕不進 repository。註記 `SOURCE WIRING REQUIRED` 的變數在已檢查的 C1 Terraform baseline 尚未提供，需待相鄰 infra source PR 合併並按 landed diff 更新 packet 後才能供 plan 使用。

| Runtime setting | C1 值／來源 | 用途與檢查 |
| --- | --- | --- |
| `BUSINESS_DELIVERY_ENABLED` | 第一階段固定 `false`；第二階段只能在 owner 授權後 `true`（final source wiring pending） | 第一階段先建必要安全前置，不啟用功能；空值／未知值必須 fail closed |
| `BUSINESS_DELIVERY_POLICY_VERSION` | 階段一空字串；階段二 `BD-POLICY-2026-09-29`（依最終 source schema） | 未啟用時不提供政策；啟用僅此核准版本 |
| `BUSINESS_DELIVERY_SCOPE` | 階段一空字串；階段二 `internal_synthetic` | 不可設成 production 或任意 scope |
| `BUSINESS_DELIVERY_OBSERVED_SINCE` | 階段一空字串；階段二由 owner 指定的實際 C1 ingress UTC instant | 不得填本文件日期、過去推測日期或未來 fixture 時間 |
| `BUSINESS_DELIVERY_MAINTENANCE_EMAILS` | runtime value 只可由 `c1-business-delivery-maintenance-emails` 的精確 numeric Secret Manager version 注入；payload 由 owner 私下建立 | Terraform source pins version reference; no plaintext identities in tfvars, Git, plan output, screenshot, or chat |
| `INTERNAL_TEST_BOOKING_ENABLED` | `true`，僅在 exact-SHA C1 到期視窗內 | 需要 `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC`；到期不可晚於 Hosting channel expiry |
| `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC` | 與此輪短期核准相符的實際 UTC 值（私有 tfvars） | 不重用任何舊 expiry |
| `worker_schedule_paused` | `true` | 不啟動週期 drain；任何 worker 執行由 packet 的有界步驟逐次記錄 |
| `calendar_sync_enabled` / `calendar_sync_prerequisites_enabled` | `false` / `false` | inbound Calendar、Scheduler 不屬本批 |
| API／worker Secret Manager version pins | 從 C1 現況與核准 source 私下 fresh-read，逐項輸入數字版本 | 不用 `latest`；不共用已退休 `secret_resource_version`；不得猜缺少值 |

Terraform source diff 確認 `infra/terraform/c5-firestore/main.tf` 新增的資源是單一 Firestore TTL 欄位 `google_firestore_field.export_chunk_ttl`，collection `bd_export_chunks`、field `purgeAt`。只有在 C5 完整 plan 確認這是唯一新增變更、沒有 DB／backup schedule 替換或其他 drift 時，才可把該 plan 交業主審閱。TTL best-effort；API 仍必須在 `purgeAt` 後拒絕讀取。Terraform plan 是對實際 state 的 fresh read；以上 source diff 不代表實際 apply diff 必然只有一項。

### C1 Business Delivery env 與維護身份：兩階段 prerequisites，完整 plan，禁止 `-target`

第一階段先以明確 opt-in provision 必需的 maintenance Secret Manager container 與 API-only IAM；runtime 功能 gate 必須保持 off，maintenance version pin 使用 `not_granted`，不得 mount／讀取不存在的 secret payload。最終 source 尚待獨立 sequencing fix；下表的 bootstrap opt-in Terraform 變數名稱必須照該最終 source 填入，不能猜名。

| Terraform input（候選已知名稱） | 階段一 prerequisites plan | 階段二 enable plan |
| --- | --- | --- |
| `business_delivery_enabled` | `false` | `true`，必須由本次新 exact-SHA 核准明確授權 |
| `business_delivery_policy_version` | `""` | `"BD-POLICY-2026-09-29"` |
| `business_delivery_scope` | `""` | `"internal_synthetic"` |
| `business_delivery_observed_since` | `""` | Owner 在核准時窗內指定的 ingress 啟用 UTC instant |
| `business_delivery_maintenance_emails_secret_version` | `"not_granted"`；secret 不 mount | Owner 私下建立 payload 後填入實際 numeric version；不能使用 `latest` |
| final-source explicit prerequisite opt-in | `<按最終 source 真實變數名填入；未核實就停止>` | 不得新增或重用未核准的其他 opt-in |

階段一 plan/apply 僅允許在完整 source/CI/owner 核准後 provision 上述 container + API-only IAM，並須讀回 gate 仍 false、無 Secret mount、worker 無 secret 權限。Owner 私下提供 payload 後，重新建立第二份**完整** Terraform plan，reviewer 檢查唯有核准的 numeric version、業務 env 與 gate true，以及必要的既有資源讀回；再次取得該精確 plan 的 owner 核准後才可 apply。兩階段都禁止 `terraform -target`、Console/gcloud env 直改與把 secret value 放進 repository。任一 stage 變數名、IAM principal、mount 條件或 plan 差異無法從最終 merged source 與新核准精確重現時停止，不以 placeholder 部署。

預期部署邊界：C1 API `internal-test-api`、既有 outbox `internal-test-outbox`、Firestore TTL，以及 `internal-preproduction` preview 上的 `/v1/**` rewrite。Calendar 只用專屬 synthetic test calendar。不得開啟 Calendar inbound、`events.watch`、正式 Calendar、正式流量或 Cloud Run production service。匯出僅 CSV；不建立 XLSX 或 Drive 整合。

## 3. 執行指令（僅列給之後獲核准的 C1 operator）

每個 `<...>` 都是要在受控 terminal／私有路徑填入的資料。source prerequisite、核准 SHA、credential identity、fresh plan、UTC window 或 expiry 任一缺漏時，不可執行變更命令。不得輸出 ADC token、secret 值、明文 maintenance email 或 tfvars。

### A. 身分與 exact source 核對（唯讀）

```bash
gcloud config get-value project
gcloud auth list
gcloud auth application-default print-access-token >/dev/null
firebase login:list
git fetch origin main
git rev-parse origin/main
node scripts/terraform-sha-gate.mjs
```

三種身分（gcloud CLI、ADC、Firebase CLI）分別確認由已核准 operator 使用，目標都只指向 `beauessence-clinic-stg-c1a01`。不得複製 token 作為證據。`origin/main`、Terraform SHA、Cloud Build source SHA 必須一字不差相等；否則停止並更新／重批 packet。

### B. 建置 immutable API／worker images

```bash
gcloud builds submit . \
  --project=beauessence-clinic-stg-c1a01 \
  --config=containers/internal-test.cloudbuild.yaml \
  --substitutions=_SOURCE_SHA=<APPROVED_40_HEX_SOURCE_SHA>
gcloud artifacts docker images describe \
  asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/api:<APPROVED_40_HEX_SOURCE_SHA> \
  --project=beauessence-clinic-stg-c1a01 \
  --format='value(image_summary.digest)'
gcloud artifacts docker images describe \
  asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/worker:<APPROVED_40_HEX_SOURCE_SHA> \
  --project=beauessence-clinic-stg-c1a01 \
  --format='value(image_summary.digest)'
```

兩個 digest 只在本機核對後填入私有 tfvars 與 evidence manifest。source/tag/digest 三者不符、build failed、image 不是該 C1 Artifact Registry，或 build provenance 無法對上 exact source SHA 時停止。

### C. C5 Firestore TTL 完整 plan

```bash
terraform -chdir=infra/terraform/c5-firestore init \
  -backend-config=bucket=beauessence-clinic-stg-c1a01-tfstate \
  -backend-config=prefix=c5-firestore
terraform -chdir=infra/terraform/c5-firestore plan -input=false \
  -var-file=<PRIVATE_C5_TFVARS_PATH> \
  -out=<PRIVATE_EVIDENCE_DIR>/c5-firestore.tfplan
terraform -chdir=infra/terraform/c5-firestore show -json \
  <PRIVATE_EVIDENCE_DIR>/c5-firestore.tfplan \
  > <PRIVATE_EVIDENCE_DIR>/c5-firestore.plan.json
```

先本機人工檢閱 plan；唯一預期增量為 `(default)` 的 `bd_export_chunks.purgeAt` TTL 與 single-field index exemption。發現任何 delete／replace、IAM、project/API、database、PITR、backup schedule、region 或其他資源變動都停。只有業主核准了這份 exact plan 之後，operator 才能在批准時窗執行：

```bash
terraform -chdir=infra/terraform/c5-firestore apply -input=false \
  <PRIVATE_EVIDENCE_DIR>/c5-firestore.tfplan
```

### D. C1 Business Delivery prerequisites 與 enable：兩份完整 Terraform plan

本批 C1 Terraform 不是 TTL-only mutation：除 C5 `export_chunk_ttl` 外，最終 C1 source 會接線 Cloud Run Business Delivery env，並建立 maintenance-email Secret Manager container/API-only IAM。第一個 source commit `8ebbe840ad875e27d2c453036e0956f172de8b72` 的 first-enable ordering 有缺口且沒有 CI，不可拿來 apply；只有 follow-up fix 合併並按 final diff/CI 更新本 packet 後才可進入新 exact-SHA 核准。任何變數名以最終合併 source 為準。

於核准時窗開始前建立兩份不同的 private tfvars：`<PRIVATE_C1_STAGE1_TFVARS_PATH>` 與 `<PRIVATE_C1_STAGE2_TFVARS_PATH>`。第一份 opt-in provision prerequisites，但 gate 明確 `false`、政策/scope/observedSince 為空、maintenance secret version 為 `not_granted`，不 mount secret。所有輸入與 secret payload 都留在 owner-controlled private file；不提交 `terraform.tfvars`。初始化只做一次：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run init \
  -backend-config=bucket=beauessence-clinic-stg-c1a01-tfstate \
  -backend-config=prefix=c1-internal-test-run
terraform -chdir=infra/terraform/c1-internal-test-run plan -input=false \
  -var-file=<PRIVATE_C1_STAGE1_TFVARS_PATH> \
  -out=<PRIVATE_EVIDENCE_DIR>/c1-stage1-prerequisites.tfplan
terraform -chdir=infra/terraform/c1-internal-test-run show -json \
  <PRIVATE_EVIDENCE_DIR>/c1-stage1-prerequisites.tfplan \
  > <PRIVATE_EVIDENCE_DIR>/c1-stage1-prerequisites.plan.json
```

Stage 1 的完整 plan 只能包含核准 C1 服務/API 的 digest pin、明確 prerequisites opt-in、secret container 與 API-only IAM；需由 reviewer 確認 `BUSINESS_DELIVERY_ENABLED=false`、maintenance version pin `not_granted`、API 沒有 secret mount、worker 無 secret access、scheduler/calendar inbound 都 paused、無 DB／PITR replacement、無 delete/replace、無 `-target` 或其他 drift。先把此 exact plan、SHA、project 與 diff 交 owner 審核；僅新核准後才可：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false \
  <PRIVATE_EVIDENCE_DIR>/c1-stage1-prerequisites.tfplan
```

Stage 1 readback 證明 gate 仍 off、secret mount absent、API-only IAM scope exact 後，owner 私下建立所需 maintenance identity payload。只將本機受控私有檔案路徑交給 gcloud，不輸出內容：

```bash
gcloud secrets versions add c1-business-delivery-maintenance-emails \
  --project=beauessence-clinic-stg-c1a01 \
  --data-file=<PRIVATE_OWNER_CONTROLLED_SECRET_PAYLOAD_FILE>
gcloud secrets versions list c1-business-delivery-maintenance-emails \
  --project=beauessence-clinic-stg-c1a01 \
  --filter='state:ENABLED' \
  --format='value(name)'
```

只把最後核對出的 numeric version 放入 Stage 2 private tfvars；不允許 `latest`。第二階段填 `business_delivery_enabled=true`、`business_delivery_policy_version=BD-POLICY-2026-09-29`、`business_delivery_scope=internal_synthetic`、owner 指定的實際 ingress `business_delivery_observed_since` 及該 numeric secret pin，使用 Stage 1 更新後的 full state 再 plan，不重用 Stage 1 plan：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run plan -input=false \
  -var-file=<PRIVATE_C1_STAGE2_TFVARS_PATH> \
  -out=<PRIVATE_EVIDENCE_DIR>/c1-stage2-enable.tfplan
terraform -chdir=infra/terraform/c1-internal-test-run show -json \
  <PRIVATE_EVIDENCE_DIR>/c1-stage2-enable.tfplan \
  > <PRIVATE_EVIDENCE_DIR>/c1-stage2-enable.plan.json
```

檢閱完整 stage 2 plan：必須顯示 exact source SHA、C1 `project_id`、`asia-east1`、已核准 API revision digest、gate true、明確期限、owner policy/scope、numeric secret version、API-only secret mount 和 default-off scheduler/calendar inbound；不得 create/replace/delete 無關資源。未提供 owner 私下 secret payload、numeric version readback 不唯一、sequence 或 resource diff 非 final source 所預期時停止。Owner 必須再審閱這份新保存的 exact plan 並給予該 stage 明確核准；只有之後 operator 才可：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false \
  <PRIVATE_EVIDENCE_DIR>/c1-stage2-enable.tfplan
```

Stage 1 和 Stage 2 都用完整 Terraform plan/apply；禁止 `terraform -target`、Console/gcloud env 直改、把 secret payload 貼入 terminal argument、artifact、PR 或聊天，也不可讓 worker 綁 secret IAM。

### E. 部署 C1 isolated Hosting preview

```bash
firebase hosting:channel:deploy internal-preproduction \
  --config=firebase.isolated-api-preview.json \
  --expires 7d \
  --project=beauessence-clinic-stg-c1a01
```

此 channel 對應 `internal-preproduction`；不使用 `synthetic-review`、`live`、`firebase.json` 預設 staging rewrite、`beauessence-clinic-staging`、或官方網站網域。部署後 fresh-read Hosting channel URL／version／`expireTime` 及 rewrite target；若 expiry 長於本 packet 時窗、API rewrite 不是 `internal-test-api`/`asia-east1`、CSP 含 staging forbidden auth origin，立即回退並停止。

## 4. 到場驗收 checkpoints

每一項只使用該次核准新建的 synthetic fixture；絕不直接寫 Firestore 或套用全選器。需在 private evidence manifest 記 `sourceSha`、API/worker revision＋digest、Hosting version/channel/expiry、UTC window、policy version、操作數、結果與 evidence hash。對外 PR 只放去識別 artifact 索引。

| Checkpoint | 正向路徑 | 負向／邊界路徑與停損 | 狀態 |
| --- | --- | --- | --- |
| API／Booking | `/v1/health/live` 200；C1 accountless synthetic booking 成功並由新 session reload server readback | gate off/expired、錯誤 source、舊版 preview API target 不得成功；404 rewrite 為 FAIL，應用 gate 關閉應 503 | `NOT_RUN` |
| Staff auth | 新鮮 Google + TOTP 建立允許 role session | 錯／過期 TOTP、disabled staff、無 cookie、錯 CSRF 或無權角色拒絕且無寫入 | `NOT_RUN` |
| CP-03 用量／里程碑 | 完整 synthetic report 和 server event/ack readback | coverage 缺口分類為 `insufficient_evidence`；非 manager、stale/異人 reauth、重播異 payload 不通過 | `NOT_RUN`；UI pending |
| CP-04 CSV | 授權 manager 新鮮 reauth 建立 CSV；唯登入後可下載；人工確認 UTF-8 中文及 synthetic 欄位 | XLSX、非 manager、stale reauth、跨 scope、超 24 小時／第 4 次下載拒絕；撤銷禁止再下載；不得輸出病歷以外／稽核值 | `NOT_RUN`；UI pending |
| CP-05 lifecycle | 單筆已批准 synthetic patient/archive 後 30 日內 restore | 未 reauth、未授權角色、未達期、future confirmed/arrived booking 或 legal hold 時永久刪除拒絕；scope/hash 改變即停 | `NOT_RUN`；刪除另需 per-scope approval |
| CP-02／日曆格式 | 一筆 synthetic event 依目前核准標題規則投影並 read back；same-event update | 不出現來源／AS／LI；Calendar auth/ACL/target 不同即停；不動正式 Calendar | `NOT_RUN`；calendar write 按本批明確額度 |
| 匯出 TTL | readback `bd_export_chunks.purgeAt` 欄位 TTL 啟用；API expiry guard 保持有效 | 不以 TTL eventual deletion 當即時刪除；過 purgeAt 仍不得下載；TTL drift 超 scope 即停 | `NOT_RUN` |
| CP-07 receipt | source/UI 若已合併：核對單份 synthetic export hash、負責人系統簽收、操作人／時間 | 無 receipt、hash 不符、尚未完成層處置均不可 close；不得真實終止或撤真帳號 | `NOT_RUN`；baseline source 缺 |
| Source／security headers | 由部署後實際 response 讀回 image SHA、API target、CSP、COOP、CORP、noindex 與 no-store 狀態 | 不能因 popup 失敗而放寬 COOP/CSP；安全設定不符即停 | `NOT_RUN` |

任何 mandatory assertion 首次失敗即停止受影響 sequence，不重試流量、不臨時改 Terraform／IAM／安全標頭。CP-06-E 真正 restore 不在這些 checkpoints 中，必須使用單獨授權與 recovery packet。

## 5. 回退與保存證據

| 觸發 | 回退 |
| --- | --- |
| 新 Hosting/API 版本不健康、`/v1/health/live` 404，或 forbidden origin／expiry 不符 | 停止測試；把 preview channel 依另核准 rollback 重新部署 `firebase.isolated-preview.json` 靜態版本，保留 channel 到期上限；不要碰 `live` |
| API／worker source 行為失敗 | 不 destroy C1/C5 stack；以 plan 前 fresh-read 的 exact previous revision/digest 回到前一 C1 revision；將 business feature gate fail closed，worker processing 依 rollback plan 關閉、scheduler 保持 paused |
| C5 plan/apply 不符合 scope或出現 DB/backup drift | 停止，不執行後續 runtime 流程；保留原 DB/PITR/backup，不用 `not_granted` apply 試圖「清除」資源；由 infra owner 另行修正與重新核准 |
| 任一資料、範圍或操作人錯誤 | 立即停、保留 audit；只按該次明確核准範圍進行 synthetic fixture cleanup；不得全刪或以回退代替刪除授權 |

### 回退命令（僅 owner 對 exact rollback plan 核准後）

Hosting 靜態回退仍留在同一短期 isolated preview channel：

```bash
firebase hosting:channel:deploy internal-preproduction \
  --config=firebase.isolated-preview.json \
  --expires 7d \
  --project=beauessence-clinic-stg-c1a01
```

C1 Cloud Run 回退必須用 final source 的 Stage 1 private tfvars（gate false、secret pin `not_granted`）建立新的完整 plan；不得用手改 service、`-target` 或舊 plan。核對 plan 保留正確 C1 專案、只回復核准的 API/worker digest 並移除 Secret mount、保留安全 prerequisites、TTL、database/PITR 與其他無關服務：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run plan -input=false \
  -var-file=<PRIVATE_C1_STAGE1_TFVARS_PATH> \
  -out=<PRIVATE_EVIDENCE_DIR>/c1-fail-closed-rollback.tfplan
terraform -chdir=infra/terraform/c1-internal-test-run show -json \
  <PRIVATE_EVIDENCE_DIR>/c1-fail-closed-rollback.tfplan \
  > <PRIVATE_EVIDENCE_DIR>/c1-fail-closed-rollback.plan.json
```

只有 owner 對這份完整 rollback plan 核准後才可 apply：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false \
  <PRIVATE_EVIDENCE_DIR>/c1-fail-closed-rollback.tfplan
```

Stage 1/2 的部署 authority 不會自動等於 rollback authority；只有在同一份新 exact-SHA 批次核准裡明確列出 rollback target、UTC window 和完整 rollback plan review，才可執行以上回退命令。

部署後保存但不公開：build provenance、immutable image digest、Terraform plan／apply transcript、C5 TTL readback、Cloud Run revisions／env-key names（隱去值）、Hosting version／channel expiry、HTTP headers/status 及逐項 CP08 evidence。`BUSINESS_DELIVERY_MAINTENANCE_EMAILS`、cookie、CSRF、TOTP、token、secret 值、完整病患資料與私有 Drive identifier 永遠不進 repository。

## 6. 本 packet 的 gate

| Gate | 狀態 | 原因 |
| --- | --- | --- |
| Source commits | `BLOCKED` | CP-07 source 與 C1 Business Delivery env Terraform wiring 未在 2026-10-01 baseline 全部證明 |
| Exact-CI | `NOT_RUN` | source-prerequisite 合併後才有最終 deploy SHA；本 packet 不重新執行 CI |
| Exact-SHA authority | `NOT_AUTHORIZED` | OWNER-BATCH 只授權另行提出一份 exact-SHA packet；無 SHA/window/apply 核准 |
| Terraform plan／apply | `NOT_RUN` | 無 credentials、fresh cloud state 或 owner-approved plan |
| Hosting deploy | `NOT_RUN` | 無 fresh per-commit/project/channel/expiry approval |
| Runtime／human acceptance | `NOT_RUN` | 未執行 C1 deployment、CP08、操作手冊 walk-through 或 owner acceptance |
| Production／real data | `NOT_AUTHORIZED` | 不屬本 packet；D-series、專業審閱及另行批准仍是前置條件 |
