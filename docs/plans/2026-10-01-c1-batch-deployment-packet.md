# C1 商務交付批次部署 packet（2026-10-01）

**狀態：** `OPERATION_LIMITS_APPROVED / EXECUTION_BLOCKED_PENDING_AUDIT_SOURCE_AND_EXACT_PLANS`；單日方案與操作上限已核准，最終 release、部署／關閉／回退清單仍未核准，尚未執行本批雲端 mutation。

## 本次單日核准記錄（2026-10-05；尚未執行）

業主於本次對話核准單日最小方案，並採納後續整套建議；沒有另外提供 approval ID，不另造識別。此節與下文已填上限取代未填或七日 Hosting 方案，不取代 Safety Floor、個別 exact-plan 核准或 source／runtime 驗證。使用者要求先完成本文件 PR，再處理 AUD-01 → AUD-07 → source freeze；文件 PR 可先交付，但不能因此放行部署。

| 核准項目 | 本次條件／邊界 |
| --- | --- |
| 核准人／操作者 | `wayde.fu` 核准；Hermes 代理跑指令，使用者負責必要登入，不代表人工驗收已完成 |
| 雲端 mutation 時窗 | 2026-10-06 13:00–20:00 Asia/Taipei，即 `2026-10-06T05:00:00Z`–`2026-10-06T12:00:00Z`；時窗外不得 build、apply、deploy 或變更 secret／channel |
| 單日停止與收尾 | 測完立即關閉；19:00 停止新增測試、19:30 前完成關閉、20:00 前完成讀回。18:00 尚未具備安全短測與關閉條件，就不啟用新測試 |
| 成本停損 | NT$100，不自行提高；無法合理確認建置、測試與收尾可在額度內完成就不開測。這不是平台硬性帳單封頂，費用資料可能延遲，保留資源仍可能計費 |
| Source 基線 | #234 合併後候選 `1e26d3b257cd542ea4e3aee76f64a7a9ba87ecf3`；[main verify run 37222326362](https://github.com/waydefu/clinic/actions/runs/37222326362) success 只證明該 source snapshot 的 CI，不是最終部署授權 |
| 最終 source 前置 | AUD-01 仍 OPEN、AUD-07 部分完成，見[稽核交接](../reviews/2026-10-04-audit-closeout-handoff.md)；必要修正經核准合併、exact-release CI 通過後才 freeze。SHA 改變須重新綁定並核准 source、provenance、digest 與 plans，不沿用候選授權 |
| Hosting／預約期限 | 不採七日 Hosting；channel expiry、關閉方法與 booking gate expiry 須各自核實並核准，最晚當天 20:00 完成關閉讀回。`--expires 1d` 不等於當天 20:00 |
| 驗收範圍 | 少量 synthetic 登入、預約、CSV、封存／復原及必要報表／收據；worker、outbox drain、Calendar 寫入、永久刪除皆 0，不宣稱本次完成全部 C1 checkpoint |
| 關閉與回退 | 關閉 booking、Business Delivery、outbox processing，Scheduler 維持 PAUSED；保留 DB、PITR、備份、secret 與受保護資源。先備妥可核准的 fail-closed 關閉方案，再確認 fresh rollback targets |
| 排程與私有設定 | 未建立自動部署／關閉排程，不把文件時刻當成已設 timer。Secret payload、maintenance identity、tfvars、私有路徑、原始稽核敏感細節與 logs 不進聊天、PR 或 Git |

前兩批唯讀前置查詢 30 次與追加 10 次均已耗盡。另核准最多 60 次後續準備、source 溯源、plan refresh 與目標狀態讀回；失敗與重試計入，每次頂層 CLI 查詢記於受控本機 ledger，不宣稱能封頂 CLI 內部 HTTP requests。不讀 secret payload 或病患內容、不查其他雲端專案、不挪用 runtime API read 額度。Terraform backend lock、state 與 plan 敏感值的處理邊界須先確認；唯讀額度不是 backend write、secret、IAM 或 apply 授權。

**目前執行阻擋：** AUD 收尾與 final source freeze、完整費用估算、build 設定與 provenance、私有 numeric pins、各階段 fresh full saved plan、Hosting 單日關閉方法、shutdown／rollback targets 都未完成核實與核准。先證明可安全關閉才開測；未做的 12h session 到期、CP-06-E 真實還原、Calendar／worker runtime 與人工簽收保持 `NOT_RUN`／`NOT_SIGNED`，不以 code 或 CI 代替。

## 先前 source 整合讀回（2026-10-04，歷史）

`origin/main` 為 `e58e1c131e2c20607cce9e28f450fead1759bada`（#233 合併），main verify run `37199246153` success。它已包含 L1～L7（#208～#217）以及 2026-10-03～04 的稽核修正 #221～#233，逐項對照見[稽核修正收尾交接紀錄](../reviews/2026-10-04-audit-closeout-handoff.md)。下文 §1「依賴 source 狀態」各項所說的「未合併、待 Claude review」都已過時：#213～#216 已合併並經事後補審，#231 已修正本 packet 的 Stage 2a/2b 拆分、Terraform README 與維護名單 Secret 防刪。最終 release SHA 應為包含本次文件更新與交接紀錄的 main（合併後以 `git rev-parse origin/main` 取得），不得沿用本段的 SHA。source CI 仍不等同 cloud plan、部署、C1 runtime 或人員驗收；下列 2026-10-03 段落保留為日期證據。

## 先前 source 整合讀回（2026-10-03，歷史）

目前 `origin/main` 為 `6131c7fc54f09369842f6edf73a26d42fed4c729`，已包含 #213、#214、#215、#216、#218、#219、#220 的合併提交。#214 head `e089b55ee2847ae06d9e7c356125264bc8a61207`、#215 head `331992eeea8366b412ebe64591358f209a2e6f17`、#216 head `1197f0c43a6a8fb1ed01960e01e9a59cac151656` 的各自 CI 均為 12/12 PASS；main verify run `37051691984` 亦已 12/12 PASS。這些 source CI 不等同 cloud plan、部署、C1 runtime 或人員驗收。

本 packet 的舊 head、CI 與「尚未合併」文字是歷史 snapshot；它們保留作為日期證據，不可代替上面的 current source。此次合併由業主在對話中明確授權 Codex 依 #214→#215→#216→#217 執行；Chrome 通道回覆 `User unavailable`，#214～#216 改以已登入 GitHub CLI 完成，沒有新增 Claude review 證據，也沒有 cloud mutation。
**範圍：** `OWNER-BATCH-2026-09-29B` 第 1、2、3 項；只限合成 C1。
**專案：** `beauessence-clinic-stg-c1a01`；**區域：** `asia-east1`。
**Firebase Hosting channel：** `internal-preproduction`；API 設定檔 `firebase.isolated-api-preview.json`；靜態回退設定 `firebase.isolated-preview.json`。
**資料庫：** `(default)`，Firestore Native；本 packet 不准建立另一個 production／正式資料庫。

本 packet 記錄已核准的單日條件與操作數量，不是未來 exact plans 或資料操作的全面授權。OWNER-BATCH 的 source prerequisites 仍適用；本次使用者負責必要登入，不推論全部人工驗收已完成。最終 `SOURCE_SHA`、私有設定檔與讀回值須於新的 exact-SHA／exact-plan 核准儀式核實；已填的時窗、操作者與上限不得擴張。文件 commit 單獨不構成 deployment 或 apply authority。

## 1. 綁定欄位與部署前置

| 欄位 | 目前值／完成條件 |
| --- | --- |
| 最終 source commit | `<必要 AUD 修正與文件經核准合併、exact-release CI 通過後填入並核准的 40 位 freeze SHA>`；#234 SHA 只是候選基線 |
| 本地 `origin/main` | 必須等於核准 SHA、API/worker 建置 SHA 與 Terraform `exact_apply_authority_sha`；任何差異即 `AUTHORITY_INVALIDATED` |
| API / worker image | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/{api,worker}@sha256:<Cloud Build readback>`；不接受 tag 或 `latest` 作部署值 |
| Terraform apply 授權時窗 | `2026-10-06T05:00:00Z`–`2026-10-06T12:00:00Z`；只涵蓋另核准 exact plans 的列明 mutation |
| Hosting channel expiry | `<經核實支援方法並另核准的當日 expireTime／關閉 target>`；不採七日，20:00 前完成關閉讀回，不假設相對 expiry 可達成 |
| Booking gate expiry | `<私有設定中的另核准 UTC expiry，不晚於 2026-10-06T12:00:00Z>`；與 Hosting expiry、apply 時窗分開核對 |
| 操作者／核准人 | Hermes 代理／`wayde.fu`；使用者負責必要登入，不記 credential identity |
| C1 專案／區域 | `beauessence-clinic-stg-c1a01` / `asia-east1`；`beauessence-clinic-staging`、live channel、正式網域一律拒絕 |
| 既有 revision／Hosting version | `<apply 前於私有 manifest fresh-read；空值即停>` |
| 私有 tfvars | `<本機受控路徑；不得提交、貼入 PR 或聊天>` |
| 計費上限 | 本次建置與測試 NT$100 操作停損，非帳單硬封頂；CP-06-E 的 NT$500 與專屬授權不能挪用，本 packet 不執行 CP-06-E |

### 依賴 source 狀態與仍需處理的事項

1. CP-07 source 在 PR #213 head `e517f387705d5b90fe0bef78ff4991548192314a`，已帶入 shared Gitleaks patch；CI799 / run `36852875693` 通過 12/12。舊 head `7397f8e…` 的 CI787 / run `36805449273` 12/12 成功保留為歷史證據。PR READY、未合併、未部署；baseline `0870a5fd16c720cafc085f29594bef7afb30a71b` 不含此 source。尚需 designated Claude review → owner merge；之後仍需 merged-release CI 和 C1 runtime 驗證。
2. CP-03～CP-05 API source 已合併；L6 Terraform / API wiring 在 PR #214 head `2e3edf70c050e6e4f161cfa8f37892ffa39123c7`，CI795 / run `36846590947` 12/12 jobs passed。不是 TTL-only：除 C5 `export_chunk_ttl` 外，含 Business Delivery API env、maintenance Secret Manager container、API-only IAM 與兩階段 prerequisites opt-in；allowlist ingress 與 monthly capture-gap fail-closed 已納入。Terraform v1.16.4、Google provider 7.46.1 fmt/validate、34 mock tests、83 gap-focused tests、exact CI emulator checks 均 passed。這些不是 cloud plan 證據；PR 尚待 Claude review 和 owner merge，fresh cloud plan/apply/readback 仍 `NOT_RUN`。
3. `BUSINESS_DELIVERY_OBSERVED_SINCE` 必須是第一筆 **complete classified capture** 的實際 UTC instant。missing/invalid allowlist 與 bootstrap gaps 不構成完整 coverage；capture gap 要呈現 partial/null fee，並在既有 `bd_milestones` 記錄 marker，不帶 PII。不可回填合成事件或猜測 maintenance identity。CI795 已驗證這個 source head；Claude source review、最終 merged diff、private tfvars schema 和完整 cloud plan 尚待檢閱。
4. L3 Workbench source 在 PR #216 head `91da1cce6147be76c010bd1935362c091e30b3d4`，含商務分頁、月用量／里程碑、封存、終止、預約 CSV、reauth UI 與 deferred-chunk gate 修補。Listener cleanup 通過獨立檢查（14 focused units、9 business E2Es，Chromium 151）；gate-fix commit `c1658660cdfe5a25f1fd30372e350043a20b2c2f` 的 32 focused tests PASS，含實際 esbuild CSS minify + `planHashedBuild` 回歸；最後一次獨立 gate review PASS，確認 minified CSS `@import"./extra.css"` 會被追蹤。CI800 / run `36853002771` 通過 12/12；PR READY、未合併／部署。private integration snapshot `b759097c4ebddfcfe0386dd26d3b8ef710170213` 的全套 `pnpm verify` PASS，197 files / 2,351 tests PASS + 1 skipped (2,352 total)，4-resource deferred report 65,327 gzip B / 69,632 B PASS；這不是 PR exact-head CI 或 release proof。Product bundle was unchanged by gate checker fixes; integrated measurement was 95,812 B (93.6 KiB; script 66,648 B; style 16,395 B; document 10,119 B; image 2,650 B), shared budgets total/script/style 95/67/18 KiB and +3 KiB total against approved +5 KiB. PR #216 awaits designated Claude review and owner merge. 全域 COOP 依 `COOP-POPUP-REAUTH-2026-10-03` 改為 `same-origin-allow-popups`，讓 reauth popup 能回傳結果；其他安全標頭不變。
5. L2b source 在 PR #215 current head `972be99d5a0eb2965f03e6cc3a485cb655427cb5`，CI796 / run `36850157553` 12/12 jobs PASS；PR READY、待 Claude review 和 owner merge、未合併／部署。該 head 保留 visible Overview navigation 後的 suggestion state，並含 bounded budget。較早 CI794 / run `36845682914` 的 12/12 PASS 僅適用舊 `636204f…` snapshot。Shared SHA gate token-kind patch `10c` independent review 與 root 6-file/31-test check PASS。Gitleaks 4 focused tests、independent review、CI795 job 均 PASS；官方 v8.30.1 pinned `detect --all --full-history` 於 2026-10-01 11:02 UTC 掃描當時 source refs 共 720 commits、0 findings、exit 0；這是具體 source snapshot 結果，不代表未來新增 commit。
6. L5 合作終止 API/domain source 在 PR #213 final head `e517f387705d5b90fe0bef78ff4991548192314a`，帶入 shared Gitleaks patch；CI799 / run `36852875693` 通過 12/12。舊 head `7397f8e…` 的 CI787 / run `36805449273` 12/12 PASS 只適用舊 snapshot。PR READY、未合併／部署；L5 source CI 不替代 L3 UI exact CI 或 C1 runtime。L2b/L3/L5/L6 sources 均不在 baseline `0870a5fd16c720cafc085f29594bef7afb30a71b`。
7. `OWNER-BATCH-2026-09-29B` 將 CP-06-E 真正還原安排在 test-delivery 後 tuning；它仍是 `CURRENT_PROJECT_ACCEPTANCE` 必要條件。執行須另核 exact SHA、restore window、source/new destination database、recovery Calendar、cleanup ID 與預算，不得套用本批 authority。

基線中的 CP-03/04/05 source、L2a PR #210 與 L4 PR #212 不等於當前 C1 runtime/UI acceptance。PR #210/#212 為已合併來源，parent reports CI passed；#212 是 isolated recovery verifier，不是真正 Google restore。CP-05 #208 API 只收單一 patient ID，無 preview/fingerprint 或 hash-bound confirmation contract；此缺口保持明確，不能造不存在的 preview test。CP-03 synthetic C1 event 可驗證 runtime-vs-maintenance 分類，但不等於正式財務用量，也不能推定所有 synthetic 類別都排除於月報。
## 2. 功能設定與單一批次邊界

以下是應用程式實際讀取的設定名稱。值只用本節及已接受的 C1 synthetic scope。maintenance identities/payload 絕不放入 Terraform variables、tfvars 或 Terraform state；owner 以私有檔提供 payload，Terraform 僅接收數字版本 pin。Wiring 已整合至 #234 候選，但尚非最終 freeze SHA；按必要 AUD 修正後的 final landed diff 與新核准重新確認所有值。

| Runtime setting | C1 值／來源 | 用途與檢查 |
| --- | --- | --- |
| `BUSINESS_DELIVERY_ENABLED` | Stage 1 與 Stage 2a 固定 `false`；Stage 2b 只能在 owner 授權後 `true` | Stage 1 先建必要安全前置、Stage 2a 只 mount 數字 pin，都不啟用功能；空值／未知值必須 fail closed |
| `BUSINESS_DELIVERY_POLICY_VERSION` | Stage 1、2a 空字串；Stage 2b `BD-POLICY-2026-09-29`（依最終 source schema） | 未啟用時不提供政策；啟用僅此核准版本 |
| `BUSINESS_DELIVERY_SCOPE` | Stage 1、2a 空字串；Stage 2b `internal_synthetic` | 不可設成 production 或任意 scope |
| `BUSINESS_DELIVERY_OBSERVED_SINCE` | Stage 1、2a 空字串（此 instant 在 2a apply 前尚不存在）；Stage 2b 由 owner 填入 2a 之後實際量得的第一筆 complete classified capture 的 UTC instant | gaps 造成 partial/null fee 及 `bd_milestones` marker（無 PII）；不得回填 bootstrap/missing-invalid allowlist 時段或 fixture 時間 |
| `BUSINESS_DELIVERY_MAINTENANCE_EMAILS` | runtime value 只可由 `c1-business-delivery-maintenance-emails` 的精確 numeric Secret Manager version 注入；payload 由 owner 私下建立並以 private file 上傳 | tfvars/state 只含版本 pin；maintenance identities 不得進 Terraform value、state、Git、plan output、screenshot 或 chat |
| `INTERNAL_TEST_BOOKING_ENABLED` | `true`，僅在 owner 單獨核准的 gate 期間 | 需要單獨核准的 `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC`；另記錄 Hosting expiry 與 apply 授權時窗 |
| `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC` | owner 單獨核准的實際 UTC gate expiry（private tfvars） | 不重用舊 expiry；不以 apply 時窗或 channel expiry 代替 |
| `worker_processing_enabled` / `worker_schedule_paused` | `false` / `true` | 預設不處理 outbox 且 Scheduler 暫停；啟用或手動 drain 需獨立有界核准 |
| `calendar_sync_enabled` / `calendar_sync_prerequisites_enabled` | runtime 固定 `false`；prerequisites 依 fresh state 保留既有受保護資源，不盲用 `false` | 不啟用 inbound Calendar／Scheduler；若 flag 會刪除既有 calendar-sync prerequisites，就停止並另核完整 plan |
| API／worker Secret Manager version pins | 從 C1 現況與核准 source 私下 fresh-read，逐項輸入數字版本 | 不用 `latest`；不共用已退休 `secret_resource_version`；不得猜缺少值 |

C5 Firestore module 的 TTL 欄位是 `google_firestore_field.export_chunk_ttl`，collection `bd_export_chunks`、field `purgeAt`。該模組的 plan 仍須確認無 DB／backup schedule 替換或其他 drift。TTL best-effort；API 仍必須在 `purgeAt` 後拒絕讀取。另有 PR #214 Business Delivery env/secret/IAM 變更；整個 C1 Terraform 批次不是 TTL-only。任何 apply plan 都須對實際 state fresh-read，逐資源核對。

### C1 Business Delivery env 與維護身份：三階段（Stage 1／2a／2b），完整 plan，禁止 `-target`

Stage 1 以 `business_delivery_maintenance_prerequisites_enabled=true` opt-in provision maintenance Secret Manager container 與 API-only IAM；runtime gate 保持 off，version pin 使用 `not_granted`，API 不 mount secret，worker 不獲 maintenance secret 權限。Stage 2a：owner 私下提供 payload 並取得 numeric version 後，完整 plan 只 mount 該固定版本，runtime gate 仍 `false`。Stage 2b：量得 `business_delivery_observed_since` 之後，另一份完整 plan 才啟用 API runtime gate 與業務 env。此順序依 PR #214 exact head；CI795/run `36846590947` passed 12/12. Terraform CLI local fmt/validate/mock checks 已跑，不等於 cloud plan/readback。

**為何 Stage 2 要拆成 2a 與 2b。** `infra/terraform/c1-internal-test-run/main.tf` 的 precondition 要求 `business_delivery_enabled=true` 時 `business_delivery_observed_since` 非空；而這個值是第一筆 complete classified capture 的 UTC instant，只有在 maintenance allowlist 已 mount、API 實際分類第一筆員工登入或預約事件之後才存在（有效 allowlist 下，事件即使報表路由關閉仍會寫入，見 [ADR-0008](../adr/0008-business-delivery-usage-and-milestones.md)）。單一「Stage 2 enable」plan 因此在 plan 時不可能知道該值。不可用部署時間、apply 時間、估計值或回填值代替。

| Terraform input（候選已知名稱） | Stage 1 prerequisites plan | Stage 2a mount-pin plan | Stage 2b enable plan |
| --- | --- | --- | --- |
| `business_delivery_enabled` | `false` | `false` | `true`，必須由本次新 exact-SHA 核准明確授權 |
| `business_delivery_policy_version` | `""` | `""` | `"BD-POLICY-2026-09-29"` |
| `business_delivery_scope` | `""` | `""` | `"internal_synthetic"` |
| `business_delivery_observed_since` | `""` | `""`；此 instant 尚不存在，不可預填 | `<OWNER_FILLED_MEASURED_UTC_INSTANT>`：owner 填 2a apply 之後實際量得的第一筆 complete classified capture 的 UTC instant；bootstrap／missing-invalid allowlist gaps 不是 coverage 起點 |
| `business_delivery_maintenance_emails_secret_version` | `"not_granted"`；secret 不 mount | Owner 私下建立 payload 後填入實際 numeric version；不能使用 `latest` | 與 2a 相同的 numeric version |
| `business_delivery_maintenance_prerequisites_enabled` | `true`；明確建立 Secret Manager container 與 API-only IAM | `true`；保留 prerequisite，數字 pin 才令 API mount 生效 | `true`；保留 prerequisite |

Stage 1 完整 plan/apply 僅可在最終 source/CI/owner 核准後 provision上述 container + API-only IAM，並讀回 gate false、API 無 maintenance secret mount、worker 無該 secret IAM/mount。其後 owner 以私有檔案執行 `gcloud secrets versions add ... --data-file=<PRIVATE_OWNER_CONTROLLED_SECRET_PAYLOAD_FILE>`；payload 不放 tfvars、Terraform state、命令列內容或 evidence。tfvars 只存 numeric version。

再建立 Stage 2a **完整** plan（只加入 numeric pin），reviewer 檢查 gate 仍 false、policy/scope/observedSince 仍為空、API-only mount 固定讀該 numeric version、worker 不得 mount/access maintenance secret、無其他 drift；2a 另取得 exact-plan owner 核准與自己的 mutation budget（§3 預算表「C1 Stage 2a mount-pin apply」）後才 apply。2a 讀回 gate 仍 off、API 已 mount 該版本、worker 無 mount/IAM。

2a 之後，API 以 mount 的 allowlist 分類員工登入與預約事件。第一筆事件所需的合成登入或預約共用 §3 已填的同類上限，不另增額。owner 再以核准 readback 取得第一筆 complete classified capture 的 UTC instant，記於私有 evidence manifest；具體方法於 2a 核准明列，計入追加 60 次 nonmutating readbacks。Payload 無效只產生 gap；停止後續 enable，不自動新建版本或重做 apply。若需新 numeric version／plan，先檢查剩餘上限並另取得具體操作核准。

最後建立 Stage 2b **完整** plan，不重用 2a plan；reviewer 檢查 gate true、政策/env 值、`business_delivery_observed_since` 等於 owner 記錄的 instant，以及 2a 的同一 numeric pin；API-only mount 讀該版本，worker 仍不得 mount/access maintenance secret。2b 另取得 exact-plan owner 核准與自己的 mutation budget（「C1 Stage 2b enable apply」）後才 apply。2b 後路由若仍回 404，先檢查 Cloud Run log 是否有單一結構化紀錄 `BUSINESS_DELIVERY_DISABLED_ALLOWLIST_INVALID`（只含穩定代碼，不含 payload、email 或數量），它表示 allowlist 無法使用、功能因此保持關閉。

三階段都禁止 `terraform -target` 及 Console/gcloud env 直改。任何 IAM/mount/plan 與最終 merged source 不一致即停止。

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

三種身分（gcloud CLI、ADC、Firebase CLI）分別確認由已核准 operator 使用，目標都只指向 `beauessence-clinic-stg-c1a01`。不得複製 token 作為證據。`origin/main`、實際建置 checkout 的 `HEAD`、Terraform SHA 與 Cloud Build source SHA 必須一字不差相等；只有核對 remote ref 或通過 Terraform source gate 不足以證明 build input。任何差異停止並更新／重批 packet。

### B. 建置 immutable API／worker images

**目前 `BLOCKED_MACHINE_TYPE_UNVERIFIED`，不提供可執行的 submit 指令。** `containers/internal-test.cloudbuild.yaml` 目前只設定 logging，未明確設定 machine type；不能因此聲稱它已落實核准的 e2-standard-2。先按安裝版本與 provider 行為核實對應 build options／pool、10 分鐘 timeout、source upload 排除與成本，產生具體 submission 清單並另核准；不猜 CLI flag、不換機型或改 build config 來繞過此阻擋。本 PR 不改 build config、不提交 build。

即使機型阻擋解除，也只能從核准 SHA 新建的乾淨 detached checkout 建置，不從目前工作目錄盲目上傳。以下只準備與核對本機 source，不會提交建置；placeholder 未填不可執行，不切換或覆寫其他人的分支：

```bash
APPROVED_SOURCE_SHA='<OWNER_APPROVED_40_HEX_SOURCE_SHA>'
BUILD_SOURCE_DIR='<NEW_OWNER_CONTROLLED_DETACHED_WORKTREE_PATH>'
git worktree add --detach "$BUILD_SOURCE_DIR" "$APPROVED_SOURCE_SHA" || exit 1
cd "$BUILD_SOURCE_DIR" || exit 1
test "$(git rev-parse HEAD)" = "$APPROVED_SOURCE_SHA" || exit 1
test -z "$(git symbolic-ref -q HEAD)" || exit 1
BUILD_STATUS="$(git status --porcelain=v1 --untracked-files=all)" || exit 1
test -z "$BUILD_STATUS" || exit 1
BUILD_SOURCE_SHA="$(git rev-parse HEAD)"
```

具體 submission 的 `_SOURCE_SHA` 必須由上述核對後的 `BUILD_SOURCE_SHA` 派生，不手填另一個標籤；上傳內容只准是核准 commit 的受控 tracked-source archive，不混入 ignored／untracked 私有設定、憑證、其他檔案或 evidence。提交前重核來源與 archive 一致；提交後核對 provenance 與實際 build options。以下 digest 查詢只在唯一核准 build 成功後執行：

```bash
gcloud artifacts docker images describe \
  "asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/api:${BUILD_SOURCE_SHA}" \
  --project=beauessence-clinic-stg-c1a01 \
  --format='value(image_summary.digest)'
gcloud artifacts docker images describe \
  "asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/worker:${BUILD_SOURCE_SHA}" \
  --project=beauessence-clinic-stg-c1a01 \
  --format='value(image_summary.digest)'
```

只提交 1 個 combined job，API／worker 各建 1 個映像；e2-standard-2 與 10 分鐘 timeout 須先核對實際 build config／支援參數及費用，沒有對應設定就停止，不自行換建置環境或另送 job。兩個 digest 只在本機核對後填入私有 tfvars 與 evidence manifest。source/tag/digest 不符、build failed、image 非該 C1 registry 或 provenance 無法對上 exact source SHA 時停止，不自動再 build。

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

### D. C1 Business Delivery prerequisites、mount-pin 與 enable：三份完整 Terraform plan

本批 C1 Terraform 不是 TTL-only mutation：PR #214 head `2e3edf70c050e6e4f161cfa8f37892ffa39123c7` 已由 CI795 / run `36846590947` 12/12 jobs 驗證，含 C5 `export_chunk_ttl`、Cloud Run Business Delivery env、maintenance Secret Manager container/API-only IAM、兩階段 prerequisites、allowlist ingress 和 monthly capture-gap fail-closed。Terraform v1.16.4／Google provider 7.46.1 fmt/validate、34 mock tests、83 gap-focused tests、exact CI emulator checks PASS。這不代表 cloud plan；只有最終合併 source、fresh full plan/readback 和新的明確授權都核實後才可執行。文件 commit 本身不是 apply authority。

於核准時窗開始前建立三份不同的 private tfvars：`<PRIVATE_C1_STAGE1_TFVARS_PATH>`、`<PRIVATE_C1_STAGE2A_TFVARS_PATH>` 與 `<PRIVATE_C1_STAGE2B_TFVARS_PATH>`。第一份以 `business_delivery_maintenance_prerequisites_enabled=true` opt-in provision prerequisites，但 gate 明確 `false`、政策/scope/observedSince 為空、maintenance secret version 為 `not_granted`，API 不 mount secret；Stage 1 tfvars 不含任何 secret payload。owner 另以 private file 保管 payload，不放入 Terraform variables/state；只有取得 secret version 後，Stage 2a tfvars 才加入 numeric version pin（gate 仍 `false`、政策/scope/observedSince 仍為空），不能寫入 maintenance identities。Stage 2b tfvars 只在量得 `business_delivery_observed_since` 後才建立。初始化只做一次：

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

只把最後核對出的 numeric version 放入 Stage 2a private tfvars；不允許 `latest`。Stage 2a 只填該 numeric secret pin（`business_delivery_enabled=false`，政策/scope/observedSince 為空），使用 Stage 1 更新後的 full state 再 plan，不重用 Stage 1 plan：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run plan -input=false \
  -var-file=<PRIVATE_C1_STAGE2A_TFVARS_PATH> \
  -out=<PRIVATE_EVIDENCE_DIR>/c1-stage2a-mount-pin.tfplan
terraform -chdir=infra/terraform/c1-internal-test-run show -json \
  <PRIVATE_EVIDENCE_DIR>/c1-stage2a-mount-pin.tfplan \
  > <PRIVATE_EVIDENCE_DIR>/c1-stage2a-mount-pin.plan.json
```

檢閱完整 Stage 2a plan：必須顯示 exact source SHA、C1 `project_id`、`asia-east1`、已核准 API revision digest、gate false（`BUSINESS_DELIVERY_ENABLED=false`，政策/scope/observedSince 為空）、單獨核准的 booking gate expiry、numeric secret version、API-only secret mount 固定至該 version、worker 無 maintenance secret access、worker processing false、Scheduler paused、calendar sync disabled；不得 create/replace/delete 無關資源。payload 只由 owner private file 供 gcloud 讀取；numeric version readback 不唯一、sequence 或 resource diff 非 final source 所預期時停止。Owner 必須再審閱這份新保存的 exact plan 並給予該 stage 明確核准；只有之後 operator 才可：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false \
  <PRIVATE_EVIDENCE_DIR>/c1-stage2a-mount-pin.tfplan
```

Stage 2a readback 與第一筆 complete classified capture 的量測完成、owner 把該 UTC instant 記入 Stage 2b private tfvars 的 `business_delivery_observed_since`（見上節）之後，才建立 Stage 2b plan。Stage 2b 填 `business_delivery_enabled=true`、`business_delivery_policy_version=BD-POLICY-2026-09-29`、`business_delivery_scope=internal_synthetic`、`business_delivery_observed_since=<OWNER_FILLED_MEASURED_UTC_INSTANT>` 及同一個 numeric secret pin，使用 Stage 2a 更新後的 full state 再 plan，不重用 2a plan：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run plan -input=false \
  -var-file=<PRIVATE_C1_STAGE2B_TFVARS_PATH> \
  -out=<PRIVATE_EVIDENCE_DIR>/c1-stage2b-enable.tfplan
terraform -chdir=infra/terraform/c1-internal-test-run show -json \
  <PRIVATE_EVIDENCE_DIR>/c1-stage2b-enable.tfplan \
  > <PRIVATE_EVIDENCE_DIR>/c1-stage2b-enable.plan.json
```

檢閱完整 Stage 2b plan：必須顯示 exact source SHA、C1 `project_id`、`asia-east1`、已核准 API revision digest、gate true、單獨核准的 booking gate expiry、owner policy/scope、與 owner 記錄一致的 `business_delivery_observed_since`、與 2a 相同的 numeric secret version、API-only secret mount 固定至該 version、worker 無 maintenance secret access、worker processing false、Scheduler paused、calendar sync disabled；不得 create/replace/delete 無關資源，也不得有 maintenance secret container 的 destroy 或 replace。Owner 必須再審閱這份新保存的 exact plan 並給予該 stage 明確核准；只有之後 operator 才可：

```bash
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false \
  <PRIVATE_EVIDENCE_DIR>/c1-stage2b-enable.tfplan
```

Stage 1、2a 和 2b 都用完整 Terraform plan/apply；禁止 `terraform -target`、Console/gcloud env 直改、把 secret payload 貼入 terminal argument、artifact、PR 或聊天，也不可讓 worker 綁 secret IAM。

### E. 部署 C1 isolated Hosting preview

```bash
firebase hosting:channel:deploy internal-preproduction \
  --config=firebase.isolated-api-preview.json \
  --expires <OWNER_APPROVED_VERIFIED_SINGLE_DAY_EXPIRY_DURATION> \
  --project=beauessence-clinic-stg-c1a01
```

此命令仍含未核准 placeholder，不可直接執行。Channel 對應 `internal-preproduction`；不使用 `synthetic-review`、`live`、預設 staging rewrite 或官方網站網域。先核實單日 expiry／關閉支援方法並核准 exact target；不把 `--expires 1d` 當成當天 20:00，不擅自刪除重建 channel。部署後讀回 channel version／`expireTime`／rewrite target，分別核對 Hosting、booking gate 與 apply 時窗。API target、CSP 或 expiry 不符時停止新增測試，按已核准 safe-close／rollback plan 與額度處理，不把異常當成無界回退授權。

### 已核准的操作數量上限（exact plans／targets 仍未核准）

以下由 `wayde.fu` 在本次對話核准；雲端 mutation 與 runtime 測試只在 `2026-10-06T05:00:00Z`–`2026-10-06T12:00:00Z` 內依最終 source／exact plans／targets 核准執行。上限不是 artifact、plan 或 fixture 已就緒的證明；失敗與重試計入同類上限，不自動補額。唯讀前置可另記 ledger 使用，不從 runtime read 挪用；永久刪除、worker 執行、Calendar 寫入仍未授權。

| 操作類別 | 本次上限 | 執行狀態／邊界 |
| --- | --- | --- |
| Synthetic booking create / update / cancel | 各 5 次 | `BLOCKED`：部署後、僅核准 synthetic fixtures |
| API read / auth negative / stale reauth attempts | 分別 50 / 5 / 5 次 | `BLOCKED`：只供 runtime 測試，不轉為 metadata 額度 |
| Staff sign-in | 2 次 | `BLOCKED`：必要登入，非人工簽收證明 |
| Worker invoke / outbox drain / retries | 各 0 次 | `NOT_AUTHORIZED` |
| Calendar create / update / delete writes | 各 0 次 | `NOT_AUTHORIZED` |
| CSV export create / download / retry / revoke | 各 2 次 | `BLOCKED`：部署後 synthetic 驗收 |
| Retention archive / restore / permanent delete | 分別 2 / 2 / 0 次 | `BLOCKED`：archive／restore；permanent delete `NOT_AUTHORIZED` |
| Termination notice / receipt / close | 各 1 次 | `BLOCKED`：先確認 synthetic fixture，不發真實通知 |
| Combined Cloud Build job / API image / worker image | 1 個 job；各 1 個 image，不另送 job | `BLOCKED`：source、build 設定、provenance 與費用前置待核實 |
| C5 Terraform TTL apply | 1 次，只在確有需要時 | `BLOCKED`：fresh exact full saved plan 待核准 |
| C1 Stage 1 prerequisites apply | 1 次 | `BLOCKED`：fresh full saved plan 與 IAM／secret 邊界待核准 |
| Secret payload version creation | 1 次 | `BLOCKED`：具體操作另核准、payload 僅用私有檔案，不輪替既有 secrets |
| C1 Stage 2a mount-pin apply（gate false、numeric pin） | 1 次 | `BLOCKED`：fresh exact full saved plan 待核准 |
| C1 Stage 2b enable apply（實測 observed-since 之後） | 1 次 | `BLOCKED`：量得 complete classified capture 後才產生並核准新 plan |
| Hosting deploy / close-or-shorten-expiry / static rollback deploy | 各 1 次 | `BLOCKED`：支援方法與 fresh exact targets 待核准，不擅自刪除重建 |
| Cloud Run safe-close apply / rollback apply | 各 1 次 | `BLOCKED`：各自的 fresh full saved plan／target 待核准，不當作前三階段的額外重試 |
| 前兩批唯讀前置查詢 | 30 + 10 次，均已耗盡 | `EXHAUSTED`：失敗與重試已計入，不自行續額 |
| 後續準備／source 溯源／plan refresh／nonmutating readbacks | 追加最多 60 次 | `AUTHORIZED_READ_ONLY`：本機 ledger 計數，不讀 secrets／病患內容或其他雲端專案；backend 邊界須先核實 |

CP-02 若需 worker processing/drain/retry，或任何 Calendar create/update/delete，必須先取得獨立的 bounded approval，明列 worker processing 與 Scheduler 狀態、各操作調用上限、專用 synthetic calendar 與 rollback。不得一邊保持 worker processing false 又宣稱 Calendar projection 已完成；也不得將 CP-02 寫入本批預設 deploy authority。

## 4. 候選驗收 checkpoints（本次不全跑）

每一項只使用該次核准新建的 synthetic fixture；絕不直接寫 Firestore 或套用全選器。需在 private evidence manifest 記 `sourceSha`、API/worker revision＋digest、Hosting version/channel/expiry、UTC window、policy version、操作數、結果與 evidence hash。對外 PR 只放去識別 artifact 索引。

各 checkpoint 共用 §3 已核准的同類額度，不是每列都新增一份上限。只跑已具備 prerequisites 的少量路徑；12h session、24h／30d 等真實時間到期與多階段 termination 不以短測、改系統時鐘或直接造 DB 狀態假裝完成。不能完成的 assertion 單獨列 `NOT_RUN`，不能整列標 PASS。既有 source CI／review 只屬歷史證據，最終 source 核驗依本次 freeze SHA。

| Checkpoint | 正向路徑 | 負向／邊界路徑與停損 | 數量預算 | 狀態 |
| --- | --- | --- | --- |
| API／Booking | `/v1/health/live` 200；核准數量的 C1 accountless synthetic booking create/readback | gate off/expired、錯誤 source、舊版 preview API target 不得成功；404 rewrite 為 FAIL，gate 關閉應 503 | create／update／cancel 各 5；read 共用 50；執行仍 `BLOCKED` | `NOT_RUN` |
| Staff auth | 核准次數內依 final source 的 Google／必要驗證建立允許 role session | 錯／過期驗證、disabled staff、無 cookie、錯 CSRF 或無權角色拒絕且無寫入；不猜未解驗證政策 | sign-in 2；auth negative／stale reauth 各 5，共用 §3；執行仍 `BLOCKED` | `NOT_RUN` |
| CP-03 用量／里程碑 | 核准的 synthetic report readback；測試 C1 runtime-vs-maintenance 分類與 server event/ack | coverage 缺口分類 `insufficient_evidence`；非 manager、stale/異人 reauth、重播異 payload 不通過。分類行為可由 C1 synthetic events 驗證，不能將測試事件直接視為正式財務用量或聲稱所有 synthetic 類別皆不入月報 | read 共用 50；negative／stale 各共用 5；執行仍 `BLOCKED` | `NOT_RUN`：Stage 2a／2b、final source 與 runtime 前置未完成 |
| CP-04 CSV | 核准 manager fresh reauth 後按核准數量建立／下載 CSV；確認 UTF-8 中文及欄位 | XLSX、非 manager、stale reauth、跨 scope、超 24 小時／第 4 次下載拒絕；撤銷禁止再下載；只匯出白名單預約欄位，不得匯出病歷或稽核資料 | create／download／retry／revoke 各 2；第 4 次下載等超出本批額度的 runtime assertion 不跑；執行仍 `BLOCKED` | `NOT_RUN`：final source 與部署未完成，短測不證明 24h expiry |
| CP-05 lifecycle | 核准 synthetic patient 封存與／或於 30 日內復原；現行 API 無 preview/fingerprint endpoint，不得聲稱做過此檢查 | 未 reauth／未授權角色拒絕；scope／患者／預約讀回不符即停；永久刪除相關 assertion 不在本次 runtime 範圍 | archive／restore 各 2；permanent delete 0；執行仍 `BLOCKED` | `NOT_RUN`：final source 與部署未完成，不聲稱永久刪除已驗收 |
| CP-02／日曆格式 | 僅在獨立 bounded approval 後，以核准調用數由 worker 投影至指定 synthetic calendar 並 read back | 不出現來源／AS／LI；Calendar auth/ACL/target 不同即停；不動正式 Calendar；未另核准不執行、不標 PASS | worker／Calendar 各 0；本批 `NOT_AUTHORIZED` | `NOT_RUN`：不在本批範圍 |
| 匯出 TTL | 核准次數 readback `bd_export_chunks.purgeAt` TTL 與 API expiry guard | 不以 TTL eventual deletion 當即時刪除；過 purgeAt 仍不得下載；TTL drift 超 scope 即停 | metadata 共用追加 60；runtime read 共用 50；執行仍 `BLOCKED` | `NOT_RUN`：fresh C5 plan／state 與部署前置未完成 |
| CP-07 receipt | 對核准 exact release 僅跑當天已具備前置的合成路徑；30 日通知、期限後 receipt、再保留 30 日才 close 至 `manual_close_review` 的完整 sequence 不在單日內完成 | 缺 receipt／step 或期限未到，close 應拒絕（409）；download 不等於 receipt；人工聲明不證明實際 cloud delete／revoke，不實際終止服務或刪除資料 | notice／receipt／close 各最多 1，不為用滿額度而跳過期限；執行仍 `BLOCKED` | `NOT_RUN`：不聲稱單日完成完整 termination sequence |
| Source／security headers | 核准次數內由部署後 response 讀回 image SHA、API target、CSP、COOP、CORP、noindex 與 no-store 狀態 | COOP 必須正好是 `same-origin-allow-popups`（`COOP-POPUP-REAUTH-2026-10-03`）；不得再放寬 COOP 或 CSP；安全設定不符即停 | HTTP read 共用 50；cloud metadata 共用追加 60；執行仍 `BLOCKED` | `NOT_RUN`：尚未部署 |

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
  --expires <OWNER_APPROVED_VERIFIED_SINGLE_DAY_ROLLBACK_EXPIRY_DURATION> \
  --project=beauessence-clinic-stg-c1a01
```

C1 Cloud Run 回退必須用 final source 的 Stage 1 private tfvars（gate false、secret pin `not_granted`、`business_delivery_maintenance_prerequisites_enabled=true`；flag 不可改成 `false`，否則 plan 會刪除 maintenance secret container 與全部版本）建立新的完整 plan；不得用手改 service、`-target` 或舊 plan。核對 plan 保留正確 C1 專案、只回復核准的 API/worker digest 並移除 Secret mount、保留安全 prerequisites、TTL、database/PITR 與其他無關服務：

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

Stage 1、2a、2b 的部署 authority 不會自動等於 rollback authority；只有在同一份新 exact-SHA 批次核准裡明確列出 rollback target、UTC window 和完整 rollback plan review，才可執行以上回退命令。

部署後保存但不公開：build provenance、immutable image digest、Terraform plan／apply transcript、C5 TTL readback、Cloud Run revisions／env-key names（隱去值）、Hosting version／channel expiry、HTTP headers/status 及逐項 CP08 evidence。`BUSINESS_DELIVERY_MAINTENANCE_EMAILS`、cookie、CSRF、TOTP、token、secret 值、完整病患資料與私有 Drive identifier 永遠不進 repository。

## 6. 本 packet 的 gate

| Gate | 狀態 | 原因 |
| --- | --- | --- |
| Source commits | `BLOCKED_PENDING_AUDIT_CLOSEOUT_AND_FREEZE` | #234 候選 `1e26d3b` 已整合先前 sources；AUD-01／AUD-07 必要修正、合併與 final freeze 尚未完成。文件 PR 不是稽核關帳 |
| Exact-CI | `PASS`（候選 `1e26d3b`）；最終 release `NOT_RUN` | Main verify run `37222326362` success 只屬候選；本文件與必要修正合併後的 freeze SHA 須取得自己的 main verify，不借用舊 SHA 的綠燈 |
| 操作條件／數量 | `APPROVED`，執行仍 `BLOCKED` | 本次對話核准 wayde.fu、單日時窗、NT$100、上限與提早收尾；不等於各 exact plan／target 已核准 |
| Exact-SHA／plan authority | `NOT_AUTHORIZED`（最終 release） | 候選固定意圖不自動適用修正後的 SHA；source、digest、各 saved plan、IAM／secret 操作、Hosting 與 rollback targets 仍待核實與另核准 |
| Terraform plan／apply | `NOT_RUN` | Fresh full saved plans 與逐階段 owner approval 尚未取得；不以舊 preflight metadata 代替 |
| Hosting deploy | `NOT_RUN` | 無 fresh per-commit/project/channel/expiry approval |
| Runtime／human acceptance | `NOT_RUN` | 未執行 C1 deployment、CP08、操作手冊 walk-through 或 owner acceptance |
| Production／real data | `NOT_AUTHORIZED` | 不屬本 packet；D-series、專業審閱及另行批准仍是前置條件 |
