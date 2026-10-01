# C1 商務交付批次部署 packet（2026-10-01）

**狀態：** `SOURCE_READINESS_BLOCKED`；文件準備完成，尚無本 packet 的雲端操作或 exact-SHA 授權。
**範圍：** `OWNER-BATCH-2026-09-29B` 第 1、2、3 項；只限合成 C1。
**專案：** `beauessence-clinic-stg-c1a01`；**區域：** `asia-east1`。
**Firebase Hosting channel：** `internal-preproduction`；API 設定檔 `firebase.isolated-api-preview.json`；靜態回退設定 `firebase.isolated-preview.json`。
**資料庫：** `(default)`，Firestore Native；本 packet 不准建立另一個 production／正式資料庫。

本 packet 是供業主審閱與之後填值的執行文件，不是雲端或資料操作授權。OWNER-BATCH 要求 CP-03～CP-05 與日曆格式所需 source 先合併、業主到場一次、另核准精確 SHA 和時間窗。下列 `SOURCE_SHA`、開始／截止 UTC、操作者、核准人、私有設定檔路徑與讀回值均須在新的 exact-SHA 核准儀式填妥；未填或不一致就停止。最終 release SHA 可包含本 packet 的文件 commit；該文件 commit 單獨不構成 deployment 或 apply authority。

## 1. 綁定欄位與部署前置

| 欄位 | 目前值／完成條件 |
| --- | --- |
| 最終 source commit | `<業主於相依 source 合併後填入 40 位 release SHA；可包含本 packet 文件 commit>` |
| 本地 `origin/main` | 必須等於核准 SHA、API/worker 建置 SHA 與 Terraform `exact_apply_authority_sha`；任何差異即 `AUTHORITY_INVALIDATED` |
| API / worker image | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/{api,worker}@sha256:<Cloud Build readback>`；不接受 tag 或 `latest` 作部署值 |
| Terraform apply 授權時窗 | `<業主填入 UTC start/end；只涵蓋已列明的 apply 與核准 mutation；時窗外不得 apply>` |
| Hosting channel expiry | channel 使用 `--expires 7d`；此七日期限須另行核准並記錄 fresh `expireTime`。它是 Hosting channel 的期限，不是短期 apply 時窗 |
| Booking gate expiry | `<在私有設定及讀回中單獨填入 UTC expiry；不得以 apply 時窗或 Hosting expiry 代替>` |
| 操作者／核准人 | `<由業主記入；不猜姓名或身分>` |
| C1 專案／區域 | `beauessence-clinic-stg-c1a01` / `asia-east1`；`beauessence-clinic-staging`、live channel、正式網域一律拒絕 |
| 既有 revision／Hosting version | `<apply 前於私有 manifest fresh-read；空值即停>` |
| 私有 tfvars | `<本機受控路徑；不得提交、貼入 PR 或聊天>` |
| 計費上限 | CP-06-E 演練另受 NT$500 上限及專屬授權約束；此 packet 不執行 CP-06-E |

### 必須先關閉的 source blockers

1. CP-07 source 存在於 PR #213 head `7397f8e59553dc5022d0f29be20e56857104509d`；CI787 / run `36805449273` 的 12/12 jobs 成功。該 PR ready for review，但未合併、未部署；baseline `0870a5fd16c720cafc085f29594bef7afb30a71b` 不含此 source。最終 merged-release CI 和 C1 runtime 仍待驗。
2. CP-03～CP-05 API source 已合併；L6 Terraform / API wiring candidate 在 PR #214。該 source 不是 TTL-only：除 C5 `export_chunk_ttl` 外，包含 Business Delivery API env、維護 Secret Manager container、API-only IAM 與兩階段 prerequisites opt-in。最新 source candidate 前綴 `f29ead5…` 含 allowlist ingress 與 monthly capture-gap fail-closed 修正。較早 teardown/emulator head `f6ee…` 的 CI789 12/12 jobs passed；目前 CI791 因 Terraform SHA formatter checker 與 historical Gitleaks full-ref false positive 失敗，窄修正及最終 exact-head CI pending。不得宣稱最終 source/CI 已通過。Terraform v1.16.4、Google provider 7.46.1 的 local fmt/validate 和 34 mock tests passed；未使用 backend state，這不等於 cloud plan。Terraform CLI blocker 已解除，但 fresh cloud plan/apply/readback 仍 `NOT_RUN`。
3. `BUSINESS_DELIVERY_OBSERVED_SINCE` 必須是第一筆 **complete classified capture** 的實際 UTC instant。missing/invalid allowlist 與 bootstrap gaps 不構成完整 coverage；capture gap 要呈現 partial/null fee，並在既有 `bd_milestones` 記錄 marker，不帶 PII。不可回填合成事件或猜測 maintenance identity。最終 merged diff、exact CI、private tfvars schema 和完整 plan 尚待檢閱。
4. L3 UI candidate `48e35ffe…` 已加入 Workbench「商務與驗收」分頁、用量／里程碑、封存與終止流程，以及實際標籤「預約 CSV 匯出」。timezone gate 已通過，初始 component budget 增 1、deferred asset 為 64,219 gzip bytes；獨立 review、exact CI、merge、C1 runtime、blind walk 仍 pending。合併 integration 初始 bundle 93.2 KiB 超過 93 KiB cap；等待 L2b 最終測量後只能作最小修正，最多使用已核准 5 KiB。整合 performance 未 PASS。全域 COOP `same-origin` 是 reauth popup 的已知阻礙；不得以放寬安全標頭繞過。
5. L2b PR #215 candidate `0fece25…` 的 opaque-import architecture guard / canonical permission change，CI790 unit/fixture 與 suggestion E2E race 修正待辦；L5 PR #216 candidate `bb916811…` 的 CSV post-await guard / reauth-CSRF retry map，CI792 unit fixture、navigation/mobile 與 auth E2E 修正待辦。這些都不是 main baseline 的 source。最終 exact heads/CI 由 root 完成 readback 前保持 `PENDING_ROOT_FINAL_READBACK`。
6. `OWNER-BATCH-2026-09-29B` 將 CP-06-E 真正還原安排在 test-delivery 後 tuning；它仍是 `CURRENT_PROJECT_ACCEPTANCE` 必要條件。執行須另核 exact SHA、restore window、source/new destination database、recovery Calendar、cleanup ID 與預算，不得套用本批 authority。

基線中的 CP-03/04/05 source、L2a PR #210 與 L4 PR #212 不等於當前 C1 runtime/UI acceptance。PR #210/#212 為已合併來源，parent reports CI passed；#212 是 isolated recovery verifier，不是真正 Google restore。CP-05 #208 API 只收單一 patient ID，無 preview/fingerprint 或 hash-bound confirmation contract；此缺口保持明確，不能造不存在的 preview test。CP-03 synthetic C1 event 可驗證 runtime-vs-maintenance 分類，但不等於正式財務用量，也不能推定所有 synthetic 類別都排除於月報。
## 2. 功能設定與單一批次邊界

以下是應用程式實際讀取的設定名稱。值只用本節及已接受的 C1 synthetic scope。maintenance identities/payload 絕不放入 Terraform variables、tfvars 或 Terraform state；owner 以私有檔提供 payload，Terraform 僅接收數字版本 pin。candidate wiring 尚未合併，按最終 landed diff 與新核准重新確認所有值。

| Runtime setting | C1 值／來源 | 用途與檢查 |
| --- | --- | --- |
| `BUSINESS_DELIVERY_ENABLED` | 第一階段固定 `false`；第二階段只能在 owner 授權後 `true` | 第一階段先建必要安全前置，不啟用功能；空值／未知值必須 fail closed |
| `BUSINESS_DELIVERY_POLICY_VERSION` | 階段一空字串；階段二 `BD-POLICY-2026-09-29`（依最終 source schema） | 未啟用時不提供政策；啟用僅此核准版本 |
| `BUSINESS_DELIVERY_SCOPE` | 階段一空字串；階段二 `internal_synthetic` | 不可設成 production 或任意 scope |
| `BUSINESS_DELIVERY_OBSERVED_SINCE` | 階段一空字串；階段二由 owner 填入修正後第一筆 complete classified capture 的實際 UTC instant | gaps 造成 partial/null fee 及 `bd_milestones` marker（無 PII）；不得回填 bootstrap/missing-invalid allowlist 時段或 fixture 時間 |
| `BUSINESS_DELIVERY_MAINTENANCE_EMAILS` | runtime value 只可由 `c1-business-delivery-maintenance-emails` 的精確 numeric Secret Manager version 注入；payload 由 owner 私下建立並以 private file 上傳 | tfvars/state 只含版本 pin；maintenance identities 不得進 Terraform value、state、Git、plan output、screenshot 或 chat |
| `INTERNAL_TEST_BOOKING_ENABLED` | `true`，僅在 owner 單獨核准的 gate 期間 | 需要單獨核准的 `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC`；另記錄 Hosting expiry 與 apply 授權時窗 |
| `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC` | owner 單獨核准的實際 UTC gate expiry（private tfvars） | 不重用舊 expiry；不以 apply 時窗或 channel expiry 代替 |
| `worker_processing_enabled` / `worker_schedule_paused` | `false` / `true` | 預設不處理 outbox 且 Scheduler 暫停；啟用或手動 drain 需獨立有界核准 |
| `calendar_sync_enabled` / `calendar_sync_prerequisites_enabled` | `false` / `false` | inbound Calendar、Scheduler 不屬本批 |
| API／worker Secret Manager version pins | 從 C1 現況與核准 source 私下 fresh-read，逐項輸入數字版本 | 不用 `latest`；不共用已退休 `secret_resource_version`；不得猜缺少值 |

C5 Firestore module 的 TTL 欄位是 `google_firestore_field.export_chunk_ttl`，collection `bd_export_chunks`、field `purgeAt`。該模組的 plan 仍須確認無 DB／backup schedule 替換或其他 drift。TTL best-effort；API 仍必須在 `purgeAt` 後拒絕讀取。另有 PR #214 Business Delivery env/secret/IAM 變更；整個 C1 Terraform 批次不是 TTL-only。任何 apply plan 都須對實際 state fresh-read，逐資源核對。

### C1 Business Delivery env 與維護身份：兩階段 prerequisites，完整 plan，禁止 `-target`

第一階段以 `business_delivery_maintenance_prerequisites_enabled=true` opt-in provision maintenance Secret Manager container 與 API-only IAM；runtime gate 保持 off，version pin 使用 `not_granted`，API 不 mount secret，worker 不獲 maintenance secret 權限。Stage 2 owner 私下提供 payload 並取得 numeric version 後，完整 plan 才可同時啟用 API runtime gate、固定版本 mount 與業務 env。此順序依 PR #214 candidate source；exact full head/CI 最終修正待 root readback。Terraform CLI local fmt/validate/mock checks 已跑，不等於 cloud plan/readback。

| Terraform input（候選已知名稱） | 階段一 prerequisites plan | 階段二 enable plan |
| --- | --- | --- |
| `business_delivery_enabled` | `false` | `true`，必須由本次新 exact-SHA 核准明確授權 |
| `business_delivery_policy_version` | `""` | `"BD-POLICY-2026-09-29"` |
| `business_delivery_scope` | `""` | `"internal_synthetic"` |
| `business_delivery_observed_since` | `""` | Owner 填第一筆修正後 complete classified capture 的 UTC instant；bootstrap/missing-invalid allowlist gaps 不是 coverage 起點 |
| `business_delivery_maintenance_emails_secret_version` | `"not_granted"`；secret 不 mount | Owner 私下建立 payload 後填入實際 numeric version；不能使用 `latest` |
| `business_delivery_maintenance_prerequisites_enabled` | `true`；明確建立 Secret Manager container 與 API-only IAM | `true`；保留 prerequisite，數字 pin 才令 API mount 生效 |

Stage 1 完整 plan/apply 僅可在最終 source/CI/owner 核准後 provision上述 container + API-only IAM，並讀回 gate false、API 無 maintenance secret mount、worker 無該 secret IAM/mount。其後 owner 以私有檔案執行 `gcloud secrets versions add ... --data-file=<PRIVATE_OWNER_CONTROLLED_SECRET_PAYLOAD_FILE>`；payload 不放 tfvars、Terraform state、命令列內容或 evidence。tfvars 只存 numeric version。再建立 Stage 2 **完整** plan，reviewer 檢查 gate true、政策/env 值與精確 numeric pin；API-only mount 應讀該版本，worker 仍不得 mount/access maintenance secret。Stage 2 另取得 exact-plan owner 核准後才 apply。兩階段都禁止 `terraform -target` 及 Console/gcloud env 直改。任何 IAM/mount/plan 與最終 merged source 不一致即停止。

預期部署邊界：C1 API `internal-test-api`、既有 outbox `internal-test-outbox`、Firestore TTL，以及 `internal-preproduction` preview 上的 `/v1/**` rewrite。Calendar 只用專屬 synthetic test calendar。不得開啟 Calendar inbound、`events.watch`、正式 Calendar、正式流量或 Cloud Run production service。匯出僅 CSV；不建立 XLSX 或 Drive 整合。

## 3. 執行指令（僅列給之後獲核准的 C1 operator）

每個 `<...>` 都是要在受控 terminal／私有路徑填入的資料。source prerequisite、核准 SHA、credential identity、fresh plan、apply UTC window、channel expiry、booking gate expiry 或任何 mutation budget 任一缺漏時，不可執行變更命令。不得輸出 ADC token、secret 值、明文 maintenance identity、payload 或 tfvars。

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

本批 C1 Terraform 不是 TTL-only mutation：除 C5 `export_chunk_ttl` 外，PR #214 candidate 還接線 Cloud Run Business Delivery env，並建立 maintenance-email Secret Manager container/API-only IAM 及兩階段 prerequisites。較早 teardown/emulator head `f6ee…` 的 CI789 12/12 jobs passed；目前 PR #214 candidate prefix `f29ead5…` 含 allowlist 與 monthly capture-gap fail-closed 修正，但 CI791 因 Terraform SHA formatter checker 和 historical Gitleaks full-ref false positive 失敗，修正及最終 exact CI pending。Terraform v1.16.4／Google provider 7.46.1 local fmt/validate、34 mock tests passed，不含 backend state/cloud plan。只有最終 source、review、exact CI 和 fresh full plan/readback 均核實後才可重新核准並執行；本文件 commit 不能單獨作為 apply authority。

於核准時窗開始前建立兩份不同的 private tfvars：`<PRIVATE_C1_STAGE1_TFVARS_PATH>` 與 `<PRIVATE_C1_STAGE2_TFVARS_PATH>`。第一份以 `business_delivery_maintenance_prerequisites_enabled=true` opt-in provision prerequisites，但 gate 明確 `false`、政策/scope/observedSince 為空、maintenance secret version 為 `not_granted`，API 不 mount secret；Stage 1 tfvars 不含任何 secret payload。owner 另以 private file 保管 payload，不放入 Terraform variables/state；只有取得 secret version 後，Stage 2 tfvars 才加入 numeric version pin，不能寫入 maintenance identities。初始化只做一次：

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

Stage 1 的完整 plan 只能包含核准 C1 服務/API 的 digest pin、explicit prerequisites opt-in、secret container 與 API-only IAM；需由 reviewer 確認 `BUSINESS_DELIVERY_ENABLED=false`、maintenance version pin `not_granted`、API 沒有 maintenance secret mount、worker 無該 secret IAM/mount、`worker_processing_enabled=false`、Scheduler paused、calendar sync disabled、無 DB／PITR replacement、無 delete/replace、無 `-target` 或其他 drift。先把此 exact plan、SHA、project 與 diff 交 owner 審核；僅新核准後才可：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false \
  <PRIVATE_EVIDENCE_DIR>/c1-stage1-prerequisites.tfplan
```

Stage 1 readback 證明 gate 仍 off、maintenance secret mount absent、API-only IAM scope exact、worker 無該 secret 權限後，owner 私下建立所需 maintenance identity payload。只將本機受控私有檔案路徑交給 gcloud，不輸出內容：

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

檢閱完整 stage 2 plan：必須顯示 exact source SHA、C1 `project_id`、`asia-east1`、已核准 API revision digest、gate true、單獨核准的 booking gate expiry、owner policy/scope、numeric secret version、API-only secret mount 固定至該 version、worker 無 maintenance secret access、worker processing false、Scheduler paused、calendar sync disabled；不得 create/replace/delete 無關資源。payload 只由 owner private file 供 gcloud 讀取；numeric version readback 不唯一、sequence 或 resource diff 非 final source 所預期時停止。Owner 必須再審閱這份新保存的 exact plan 並給予該 stage 明確核准；只有之後 operator 才可：

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

此 channel 對應 `internal-preproduction`；不使用 `synthetic-review`、`live`、`firebase.json` 預設 staging rewrite、`beauessence-clinic-staging`、或官方網站網域。部署後 fresh-read Hosting channel URL／version／`expireTime` 及 rewrite target，並分別核對此 channel expiry 的獨立 owner approval、apply 時窗和 booking gate expiry。apply 時窗結束只代表不得再執行 apply，不要求七日 channel 同時到期。API rewrite 不是 `internal-test-api`/`asia-east1`、CSP 含 staging forbidden auth origin，或實際 channel expiry 不符另行核准時，立即回退並停止。

### Mutation 與測試數量上限（owner 尚待填；未核准一律 BLOCKED）

每個 C1 checkpoint 開始前，owner 必須替以下每一類填入非空、明確數字上限，並把批准人、authority reference 和 UTC window 綁到 exact release。`<OWNER_APPROVED_LIMIT>` 是空白核准欄，不代表任何數量已授權；任何未填欄位使依賴該類操作的 checkpoint 保持 `BLOCKED`。重試也計入相應上限，除非預先另列。

| 操作類別 | 本次上限 | Owner／authority／UTC window | 初始狀態 |
| --- | --- | --- | --- |
| Synthetic booking create / update / cancel | `<OWNER_APPROVED_LIMIT>` 各自填數量 | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| API read / auth negative / stale reauth attempts | `<OWNER_APPROVED_LIMIT>` 各自填數量 | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| Worker invoke / outbox drain / retries | `<OWNER_APPROVED_LIMIT>` 各自填數量；預設 0 | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| Calendar create / update / delete writes | `<OWNER_APPROVED_LIMIT>` 各自填數量；預設 0 | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| CSV export create / download / retry / revoke | `<OWNER_APPROVED_LIMIT>` 各自填數量 | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| Retention archive / restore / permanent delete | `<OWNER_APPROVED_LIMIT>` 各自填數量；permanent delete 須另列 fixture | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| Termination notice / receipt / close | `<OWNER_APPROVED_LIMIT>` 各自填數量 | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| Cloud Build API / worker image creation | `<OWNER_APPROVED_LIMIT>` image builds | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| C5 Terraform TTL apply | `<OWNER_APPROVED_LIMIT>` applies of this exact saved plan | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| C1 Stage 1 prerequisites apply | `<OWNER_APPROVED_LIMIT>` applies of this exact saved plan | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| Secret payload version creation | `<OWNER_APPROVED_LIMIT>` new versions; payload handled only from owner-private file | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| C1 Stage 2 enable apply | `<OWNER_APPROVED_LIMIT>` applies of this exact saved plan | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| Hosting channel deploy / static rollback deploy | `<OWNER_APPROVED_LIMIT>` each; rollback is separately authorized | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |
| C5 TTL/API readback and other nonmutating checks | `<OWNER_APPROVED_LIMIT>` checks/requests | `<OWNER_APPROVAL_REQUIRED>` | `BLOCKED` |

CP-02 若需 worker processing/drain/retry，或任何 Calendar create/update/delete，必須先取得獨立的 bounded approval，明列 worker processing 與 Scheduler 狀態、各操作調用上限、專用 synthetic calendar 與 rollback。不得一邊保持 worker processing false 又宣稱 Calendar projection 已完成；也不得將 CP-02 寫入本批預設 deploy authority。

## 4. 到場驗收 checkpoints

每一項只使用該次核准新建的 synthetic fixture；絕不直接寫 Firestore 或套用全選器。需在 private evidence manifest 記 `sourceSha`、API/worker revision＋digest、Hosting version/channel/expiry、UTC window、policy version、操作數、結果與 evidence hash。對外 PR 只放去識別 artifact 索引。

| Checkpoint | 正向路徑 | 負向／邊界路徑與停損 | 數量預算 | 狀態 |
| --- | --- | --- | --- |
| API／Booking | `/v1/health/live` 200；核准數量的 C1 accountless synthetic booking create/readback | gate off/expired、錯誤 source、舊版 preview API target 不得成功；404 rewrite 為 FAIL，gate 關閉應 503 | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED` | `NOT_RUN` |
| Staff auth | 核准次數內新鮮 Google + TOTP 建立允許 role session | 錯／過期 TOTP、disabled staff、無 cookie、錯 CSRF 或無權角色拒絕且無寫入 | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED` | `NOT_RUN` |
| CP-03 用量／里程碑 | 核准的 synthetic report readback；測試 C1 runtime-vs-maintenance 分類與 server event/ack | coverage 缺口分類 `insufficient_evidence`；非 manager、stale/異人 reauth、重播異 payload 不通過。分類行為可由 C1 synthetic events 驗證，不能將測試事件直接視為正式財務用量或聲稱所有 synthetic 類別皆不入月報 | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED` | `NOT_RUN`；L3 UI candidate 存在，merge/CI/runtime pending |
| CP-04 CSV | 核准 manager fresh reauth 後按核准數量建立／下載 CSV；人工確認 UTF-8 中文及欄位 | XLSX、非 manager、stale reauth、跨 scope、超 24 小時／第 4 次下載拒絕；撤銷禁止再下載；只匯出白名單預約欄位，不得匯出病歷或稽核資料 | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED` | `NOT_RUN`；L3 UI candidate 存在，merge/CI/runtime pending |
| CP-05 lifecycle | 核准 synthetic patient 封存與／或於 30 日內復原；現行 API 無 preview/fingerprint endpoint，不得聲稱做過此檢查 | 未 reauth、未授權角色、未達期、future confirmed/arrived booking 或 legal hold 時永久刪除拒絕；scope/患者／預約讀回不符即停 | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED`；permanent delete 另需逐筆 approval | `NOT_RUN`；L3 UI candidate 存在，merge/CI/runtime pending |
| CP-02／日曆格式 | 僅在獨立 bounded approval 後，以核准調用數由 worker 投影至指定 synthetic calendar 並 read back | 不出現來源／AS／LI；Calendar auth/ACL/target 不同即停；不動正式 Calendar；worker invoke/drain 或 Calendar write 未獨立核准時不執行、不標 PASS | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED` | `NOT_RUN` |
| 匯出 TTL | 核准次數 readback `bd_export_chunks.purgeAt` TTL 與 API expiry guard | 不以 TTL eventual deletion 當即時刪除；過 purgeAt 仍不得下載；TTL drift 超 scope 即停 | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED` | `NOT_RUN` |
| CP-07 receipt | 若 PR #213 合併入最終 release/UI 已交付：先建立30日通知，再於期限後記錄資料返還receipt；receipt後受控保留30日；到期與所需receipt俱全後 close 只能到 `manual_close_review` | 缺 receipt/step 或期限未到，close 應拒絕（409）；download 不等於 receipt；backup/audit/access 人工聲明不證明實際 cloud delete/revoke。不得實際終止服務或刪除資料 | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED` | `NOT_RUN`；PR #213 source/CI proven, baseline absent |
| Source／security headers | 核准次數內由部署後 response 讀回 image SHA、API target、CSP、COOP、CORP、noindex 與 no-store 狀態 | 不能因 popup 失敗而放寬 COOP/CSP；安全設定不符即停 | `<OWNER_APPROVED_LIMIT>`；目前 `BLOCKED` | `NOT_RUN` |

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
| Source commits | `BLOCKED` | PR #213 source CI787 12/12 passed but unmerged; PR #214 current candidate has CI791 formatting SHA checker and historical Gitleaks false-positive failures pending repair; PR #215 CI790 and PR #216 CI792 repairs pending. L3 independent review/exact CI pending; final release head: `PENDING_ROOT_FINAL_READBACK` |
| Exact-CI | `NOT_RUN` | source-prerequisite 合併後才有最終 deploy SHA；本 packet 不重新執行 CI |
| Exact-SHA authority | `NOT_AUTHORIZED` | OWNER-BATCH 只授權另行提出一份 exact-SHA packet；無 SHA/window/apply 核准 |
| Terraform plan／apply | `NOT_RUN` | 無 credentials、fresh cloud state 或 owner-approved plan |
| Hosting deploy | `NOT_RUN` | 無 fresh per-commit/project/channel/expiry approval |
| Runtime／human acceptance | `NOT_RUN` | 未執行 C1 deployment、CP08、操作手冊 walk-through 或 owner acceptance |
| Production／real data | `NOT_AUTHORIZED` | 不屬本 packet；D-series、專業審閱及另行批准仍是前置條件 |
