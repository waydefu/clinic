# P1-09 未關帳完整交接

**紀錄日期：** 2026-09-24（Asia/Taipei）
**紀錄性質：** 日期化證據與交接；不是核准、部署授權或關帳判定。
**階段狀態：** P1-09 OPEN。2026-09-23 C1 runtime 的 Gate 14 / P09-09 為 `FAIL`；合併後 SHA 尚未部署或重驗（`NOT_RUN`），不得關帳。

## 一句話

C1 的拒絕更新路徑未排入 Calendar restore outbox，Gate 14 因此失敗；source 修復 PR #163 已合併至 `main`（`f5bc805dd199324a149421159ac9f22cd944a6a4`），該 SHA 的 verify CI 成功，但尚未部署或重新執行 C1 runtime 驗收，P1-09 仍未關帳。

## 階段、範圍與修訂版本

- **階段／步驟：** P1-09；本次交接聚焦 Gate 14 / P09-09 與待驗 source fix。
- **原交接基線：** `caaa69e550a915842db5e959ec4ee3fc77f2dfe2`；交接分支已更新至目前 `main` `f5bc805dd199324a149421159ac9f22cd944a6a4`。
- **既有 source-fix PR：** [PR #163](https://github.com/waydefu/clinic/pull/163)，branch `agent/p1-09-rejected-update-restore-fix`，source head `b6c88a4e3cace9d42ab8df6da817a3d7239cbc88`；**MERGED**。
- **Merge commit／目前 main：** `f5bc805dd199324a149421159ac9f22cd944a6a4`。
- **本文件所在 commit：** 本文件不能記錄自己的 commit hash；提交後用 `git log -- docs/reviews/2026-09-24-p1-09-unclosed-source-fix-handoff.md` 查找。
- **歷史快照：** 2026-09-22 master plan、acceptance matrix 與 operator packet 保留原樣；本紀錄只新增較新的交接證據。

## Gate 與驗收證據

| Gate／檢查 | 結果 | 日期、修訂版本、環境與證據 |
| --- | --- | --- |
| Gate 14 / P09-09：人工改動同一 synthetic Calendar event、inbound candidate、staff reject、系統 restore 並讀回同一 event | **HISTORICAL FAIL；merged-SHA revalidation NOT_RUN** | 2026-09-23，隔離 C1 synthetic 環境。拒絕 `update_appointment` candidate 後沒有 restore outbox；同一 Calendar event 當時仍保留外部改動。操作者後來人工把該 event 改回 SoT 時間，獨立 readback 相符，但這是人工補救，不是系統 restore 能力，不能改判 Gate PASS。原 candidate 與 reject audit 保留。29 筆既有 unmatched candidates 的 metadata hash 前後未變：`ABC3991489EFC8B06BDB254366E84D7419935792A259EC67E989C986C1D6689B`。 |
| PR #163 GitHub `verify` workflow | **PASS — 12/12 jobs** | 2026-09-23，source head `b6c88a4e3cace9d42ab8df6da817a3d7239cbc88`；[run 35897232581](https://github.com/waydefu/clinic/actions/runs/35897232581)。成功項目：workspace verify/unit、Firestore Emulator、六個 E2E（auth/RBAC、appointments、patient portal、mobile、accessibility、UI）、supply-chain、Semgrep、Gitleaks、Verification evidence。這只證明該 SHA 的 CI；**不代表 Gate 14 runtime PASS**。 |
| 合併後 `main` verify workflow | **PASS — 12/12 jobs** | head／merge SHA `f5bc805dd199324a149421159ac9f22cd944a6a4`；run `35998718456` 已完成成功。這只證明 source CI；**不代表 C1 部署或 Gate 14 runtime PASS**。 |
| C1 API 部署基線 | **PARTIAL；不是修復版** | 2026-09-24T14:11Z fresh readback：service `internal-test-api`、revision `internal-test-api-p109durable1`、100% traffic、Ready/ContainerHealthy；image digest `sha256:2250015b779b410ec63d58bc49676bb538448c6cc575e6eebe9454563a06820a`；service account `internal-test-api@beauessence-clinic-stg-c1a01.iam.gserviceaccount.com`；`TRUSTED_PROXY_HOPS=2`，booking enabled、expiry `2026-09-30T10:00:00Z`。這是 #163 merge 前 image，沒有 source provenance。 |
| C1 worker services | **PARTIAL；不是修復版** | 同一 fresh readback：`internal-test-outbox-00012-vzl` 與 `internal-test-calendar-sync-00001-422` 均 100% traffic、Ready/ContainerHealthy，兩者仍用舊 worker digest `sha256:f44c61c710497f1a10437ee659ec7934ab197365caf72fb262ad415f0f3ab17d`。Calendar-sync entrypoint 為 `node dist/calendar-sync/calendar-pilot-main.js`。存在與健康不等於 P09-05 rollout/source graph 驗收。 |
| C1 scheduler／Firestore config | **PARTIAL** | 2026-09-24T14:11Z：`internal-test-calendar-sync` PAUSED（每 5 分鐘；`retryCount` 缺省，Cloud Scheduler 預設 0，`maxRetryDuration=0s`），`internal-test-outbox-drain` ENABLED（每分鐘、retryCount=2）。`calendar_pilot_configuration/active` 為 synthetic、version 1、inbound/outbound enabled、expiry `2026-09-30T10:00:00Z`、無 active lease；其 `sourceSha` 仍是舊基線 `caaa69e550a915842db5e959ec4ee3fc77f2dfe2`。見 [Cloud Scheduler retry defaults](https://docs.cloud.google.com/scheduler/docs/configuring/retry-jobs)。 |
| C1 Hosting target | **PARTIAL；仍指舊 API** | 2026-09-24T14:08Z：`internal-preproduction` version `4f2b6f65fe8cc288` FINALIZED，expiry `2026-10-19T20:38:03.699747700Z`；`/v1/**` rewrite 指向 `internal-test-api`／`asia-east1`／tag `fh-4f2b6f65fe8cc288`，目前 tag 對應舊 API revision。Hosting web artifact/source SHA 與 rollback version 未證明。 |
| Exact-main SHA build lookup | **NO MATCH FOUND；因此 build/provenance NOT_RUN** | 2026-09-24T14:41Z read-only lookup：Cloud Build `_SOURCE_SHA=f5bc805dd199324a149421159ac9f22cd944a6a4` 無匹配紀錄；Artifact Registry 的 API/worker package 也沒有同 SHA tag。這只記錄查詢結果，不排除其他未標記或不同來源的 artifact；不得當成 build receipt。 |
| C1 secret references／direct IAM | **PARTIAL；舊 runtime readback** | 2026-09-24T14:36Z：目前三個 Cloud Run service template 的 secret refs 均使用數字版本且版本 ENABLED：API `c1-staff-manager-allowlist/1`、`c1-staff-firebase-web-api-key/1`、`c1-staff-front-desk-allowlist/1`；outbox `c1-synthetic-calendar-id/2`；Calendar sync `c1-synthetic-calendar-id/2`、`c1-calendar-pseudonym-key/1`。各 secret 的直接 `roles/secretmanager.secretAccessor` policy 只列出對應 API／outbox／Calendar-sync service account；三個 service account 的 project bindings 分別為 API custom Firebase Auth runtime role + `roles/datastore.user`、兩個 worker 各 `roles/datastore.user`。未讀 secret payload；未核對 folder/org inherited IAM，也未證明這些 pin/ACL 與新 SHA runtime 一致，故 P09-03 仍非 PASS。 |
| 9/22 matrix 與現況差異 | **需 reconcile；不能據此判 PASS** | 9/22 dated matrix 把部分 C1 service/job 記為未建；2026-09-24 fresh readback 已看到 API、outbox、calendar-sync 服務及兩個 Scheduler jobs。Terraform remote plan/apply receipt、設定/source 對應仍未核對，故保留原 dated snapshot並以新 evidence 對帳。 |
| Terraform 本機 mock validation | **VALIDATE_BLOCKED；test NOT_RUN** | 2026-09-24 Windows 上 init 後，`terraform validate` 遇到 Google provider cached package 與 lockfile checksum 不符；改用全新暫存 `TF_DATA_DIR` 重試仍相同。tracked lockfile 未變，WSL 無可用 distribution；remote plan 未執行。 |
| 修復後 C1 rollout／Gate 14 runtime | **NOT_RUN** | 尚無合併 SHA 的 API／worker immutable build digest、部署 readback或修復後 Gate 14 證據。 |
| PR #163 本機格式與 diff 檢查 | **PASS** | 實作者回報 Prettier 與 `git diff --check` 通過；不屬於 C1 runtime 證據。 |
| PR #163 本機 build、unit 與 Firestore Emulator 測試 | **NOT_RUN** | 實作者回報依賴初始化遇 `ERR_PNPM_EPERM`，且當時 Node 為 24.15，低於 repository 要求的 24.20；沒有本機測試數可報。GitHub CI 結果另列於上。 |
| 本交接 PR 本機 `check:docs` | **NOT_RUN** | 新 worktree 起初沒有本機依賴；命令轉入 workspace dependency 安裝，尚未執行文件檢查即停止。由本 PR CI 驗證文件連結與索引。 |
| 修復後 C1 deploy、Gate 14 end-to-end、P1-09 其餘 gates、P09-14 closure | **NOT_RUN** | 本交接未執行雲端操作或 runtime 重驗。必須先完成下方新 exact-SHA C1 packet 與適用授權；PR #163 CI 不替代這些驗收。 |

本次沒有產生需列 SHA-256 的交付 artifact；不補造 artifact hash、測試數或 finding count。

## Gate 14 缺陷與 PR #163 修復內容

**已在 C1 runtime 重現的缺陷：** 拒絕 `update_appointment` candidate 後，資料庫保留拒絕狀態與 audit，但沒有建立 restore outbox。人工將同一 synthetic event 改回原時間後，readback 與 SoT 相符；candidate/audit 仍留存，29 筆 unmatched candidates 的 metadata hash 未變。人工修復不能證明自動 restore、重試或冪等能力。

PR #163 是獨立 source-fix PR，變更四個檔案：

- `apps/api/src/firestore/calendar-pilot.repository.ts`：candidate reject transaction 先處理既有 idempotency response；對拒絕的 `update_appointment`，驗證仍 confirmed 的 SoT appointment、mirror 關聯與 ETag，再以冪等方式排入 restore outbox。
- `apps/worker/src/calendar-sync/calendar-pilot-runtime.ts`：restore 從 confirmed SoT 讀取要恢復的投影，更新原 mirror 的 `externalEventId`，並帶 `If-Match`；缺失、取消、錯鏈或 ETag 漂移時 fail closed。
- `apps/worker/src/calendar-sync/calendar-pilot-runtime.test.ts`：加入 worker restore 投影、事件識別、關聯及 ETag 防護的回歸案例。
- `tests/firestore/calendar-candidate-review.test.ts`：加入拒絕更新、restore outbox、同請求重送與衝突等 Firestore Emulator 案例。

這些是 PR 內容與 CI 證據，不是修正已在 C1 部署的證據。部署後仍須以同一個 event 執行一次有界 Gate 14 readback。

## 稽核涵蓋與未涵蓋面

- 已查證 PR #163 已合併、merge SHA 與該 SHA 的 12/12 main verify run；記錄 source PR 的 CI 仍不等於 runtime 驗收。
- C1 的實際拒絕結果、人工恢復、candidate/audit 留存及 unmatched hash，依 2026-09-23 execution evidence 記錄。
- 2026-09-24 fresh-readback API/outbox/calendar-sync revisions、digest、health、service account、少量非敏感 env、scheduler state、Firestore config 欄位、Hosting version/rewrite/expiry；沒有在本次操作 API、Firestore、Google Calendar、IAM、Terraform remote state、AWS、production 或 public site，也沒有重新執行已修復版本的 C1 runtime。
- 不把 PR CI、先前人工修復或舊版 C1 readback 推論為修復後能力。

## 未完成事項

- PR #163 已合併；最新 `main` 已 fresh fetch 並核對為 `f5bc805dd199324a149421159ac9f22cd944a6a4`，main verify run `35998718456` 成功。
- 合併 SHA 的 exact-SHA C1 packet 目前只有未核准草稿；build digest/provenance、完整 Hosting target、rollback readback、fresh Terraform plan/drift 解法等仍未完成。草稿不是授權，不可據以部署。
- 草稿原提案操作窗 `2026-09-24T14:00:00Z–15:30:00Z` 已過開始時間，依 packet 規則不可再批准；需待阻擋項補齊後另提新窗。repo overlay 也明定 2026-09-22 起需新的 exact-SHA/時間窗/完整 mutation/expiry/rollback 明確批准，舊廣泛授權不沿用。
- 尚未以合併 SHA 建置 API／worker immutable image，亦未部署或更新 isolated Hosting preview。
- 尚未用新版本完成一次 Gate 14 end-to-end：synthetic event edit → inbound → staff reject → idempotency replay → restore dispatch → 同一 Calendar event 的獨立 readback；也未證明重送不增加 audit/outbox。
- Gate matrix 的 `CI_PROVEN`／`SOURCE_PROVEN`／`CLOUD_READBACK_PROVEN` 是證據類型，不是 gate PASS。最新 overlay 狀態與逐列缺口見下方「P09 gate-by-gate closeout status」；該表不改寫或覆蓋 2026-09-22 dated matrix。舊 SHA 證據不得沿用為新 SHA PASS。
- 未部署 source、未建立 fresh C1 fixture、未作 Gate 14 修復後 readback。
- 未進行任何 production、AWS 或 public site actions。

## P09 gate-by-gate closeout status

Closure set: **all P09-01–P09-14 rows** in the dated [acceptance matrix](../plans/2026-09-22-current-project-acceptance-matrix.md), plus all 11 Stage F cases required by P09-12. Operational dependencies are the 19 sequential gates in the [operator packet](../plans/2026-09-22-p1-09-operator-packet.md); no row is excluded. This 2026-09-24 overlay is for target `main` SHA `f5bc805dd199324a149421159ac9f22cd944a6a4` and does not replace or rewrite the dated matrix. `SOURCE_PROVEN`, `CI_PROVEN` and `CLOUD_READBACK_PROVEN` describe evidence type only. No row below is promoted to PASS without its required acceptance evidence.

| ID | Current acceptance status | What is proven / what is still required |
| --- | --- | --- |
| P09-01 | **NOT_RUN** | Main verify run `35998718456` is 12/12 CI; no exact-SHA build/deployment manifest or immutable API/worker digests. The 2026-09-24T14:41Z read-only lookup found no matching `_SOURCE_SHA` build record or matching image tags. |
| P09-02 | **NOT_RUN** | Source evidence exists and current services/jobs are present, unlike the 9/22 snapshot; no current complete Terraform plan/readback reconciliation against the approved inputs is available. Historical mutations/readbacks do not prove this target-SHA state. |
| P09-03 | **NOT_RUN** | A partial old-runtime readback at 2026-09-24T14:36Z found numeric, ENABLED secret versions and the direct Secret Manager policies listed above. Target-SHA parity, complete least-reader/inherited IAM review and acceptance-matrix reconciliation remain absent. |
| P09-04 | **NOT_RUN** | Bootstrap source exists; no target-run transaction/audit/config readback proves expiry, source, synthetic flag and no-overwrite behavior. |
| P09-05 | **NOT_RUN** | Three current services and Scheduler state were read back, but images are pre-fix; no exact-SHA digest/entrypoint graph or full plan/runtime proof. |
| P09-06 | **NOT_RUN** | `internal-preproduction` `/v1/**` still targets the old API tag. No target-SHA before/after Hosting release, web-source provenance, authDomain/network proof or verified rollback version. |
| P09-07 | **NOT_RUN** | Source path is proven; no target-SHA synthetic edit→pending chain or before/after event/candidate/appointment snapshots. |
| P09-08 | **NOT_RUN** | Source path is proven; no target-SHA staff reject, audit/response reconciliation or unauthorized-denial runtime receipt. |
| P09-09 | **NOT_RUN** | Historical C1 Gate 14 **FAIL** on 2026-09-23 because reject did not enqueue restore. PR #163 fixed source and merged, but no target-SHA deployment or same-event independent Calendar readback has revalidated it. |
| P09-10 | **NOT_RUN** | Idempotency/lease source evidence exists; no target-SHA replay, concurrency bounds or no-duplicate before/after counts, attempts and audit receipts. |
| P09-11 | **NOT_RUN** | Limiter source evidence exists; no target-SHA bounded durable-429 request ledger, `Retry-After`, stable-key hash and persistent-store/branch proof. |
| P09-12 | **NOT_RUN** | None of the 11 Stage F cases is accepted for the target SHA; strict Stage F and legacy completeness-evaluator outputs/exit codes, backup inspect and required human inbox proof are absent. See the per-case checklist below. |
| P09-13 | **NOT_RUN** | Old revisions were healthy and no active lease was seen in the dated readback; complete rollback execution/target, monitoring and human alert, lease/DLQ/duplicate state proof remain absent. |
| P09-14 | **NOT_RUN (matrix state: BLOCKED)** | Requires every applicable P09 row complete, exact-head CI, a dated portable artifact manifest and a true closure handoff. PR #164 is explicitly an interim unclosed handoff, not closure evidence; prior rows remain incomplete. |

## Stage F case evidence still required

The following cases are all **NOT_RUN / NOT_PROVEN on `f5bc805dd199324a149421159ac9f22cd944a6a4`**. For each, the private evidence receipt must record exact SHA, UTC, environment, expected and actual result, and a reviewable artifact reference; redacted hashes alone do not replace an accessible evidence artifact.

| Stage F case ID | Status for target SHA |
| --- | --- |
| `general_booking_page_create_reload` | **NOT_RUN** |
| `workbench_arrived_completed` | **NOT_RUN** |
| `calendar_outbound_same_event` | **NOT_RUN** |
| `return_lookup_existing` | **NOT_RUN** |
| `return_required_unscheduled_follow_up` | **NOT_RUN** |
| `candidate_review_synthetic_manual_change` | **NOT_RUN** |
| `security_rate_limit` | **NOT_RUN** |
| `security_anti_enumeration` | **NOT_RUN** |
| `security_denial_audit` | **NOT_RUN** |
| `security_one_real_human_alert` | **NOT_RUN** |
| `persistence_reload_server_readback` | **NOT_RUN** |

Closeout requires the strict Stage F evaluator **and** legacy completeness inspector JSON/output plus exit codes. `security_one_real_human_alert` additionally requires actual human inbox proof; an evaluator boolean or “notification path implemented” is insufficient. Backup inspection must remain labelled inspection, never restore-test evidence. Keep raw inbox evidence in restricted storage; publish only a redacted manifest and access-controlled reference.

## Private evidence custody and access

- `F:\診所專案\tmp\P1-09-20260923-execution-ledger.md` contains the dated Gate 14 result beginning at the 2026-09-23T17:09Z section (around line 765), followed by cleanup and source-fix boundary notes. It is outside this repository and is not attached to PR #164.
- `F:\診所專案\tmp\P1-09-C1-exact-SHA-approval-packet-20260924.md` is the owner-local draft packet. It remains **NOT APPROVED / BLOCKED**; its 14:00Z–15:30Z proposed window expired. It now includes the 14:36Z old-runtime secret/IAM readback, but still lacks build provenance/digests, fresh Terraform plan/drift resolution, full rollback proof and a new approved exact-SHA window.
- These absolute paths are local pointers, not portable delivery. PR #164 includes the sanitized summary but not the private evidence files; do not assume a successor can read them. Before a runtime handoff, the owner must grant the named acceptance operator access to a controlled evidence store and the packet must record its location/access check. If evidence is unavailable, treat that gate as missing and create a new evidence set; do not infer PASS from a hash or this summary. Do not put credentials, raw logs, patient/staff values or Calendar identifiers in the public repository.

## 風險、停止條件與回復

- **主要風險：** Calendar event、mirror 與 SoT 可能在拒絕至 restore 執行間再次改變。worker 的 ETag 前置條件應阻止覆寫較新的外部變更；任何 ETag 衝突都視為失敗，不可標成已恢復。
- **停止條件：** 找不到原 event、候選與 appointment/mirror 關聯不符、出現取消或非 confirmed 狀態、ETag 不符、restore outbox 缺失／重複、出現第二個 event，或獨立讀回不等於 SoT，任一發生即停止 Gate 14；保留證據並判 `FAIL`／`NOT PASS`。不得人工改 Calendar 或直接改 Firestore 來補成通過。
- **回復：** 部署前的新 C1 packet 必須記錄原 API/worker revision 與回復步驟。發生停止條件時，由 C1 operator 依該 packet 停止本次處理並回到記錄的前一個隔離 revision；不要碰 production 或 live channel。若合併後發現 source regression，走獨立 revert/review，並重新建立 exact-SHA packet。

## 責任角色

| 工作 | 責任角色 |
| --- | --- |
| PR #163 review／merge | 已完成；merge SHA `f5bc805dd199324a149421159ac9f22cd944a6a4` |
| 合併後 main reconcile 與 exact-SHA packet 完成／核准 | source maintainer；C1 project/channel/expiry 由 clinic owner 明確核定 |
| 隔離 C1 deploy、唯一一次有界重驗與回復執行 | C1 operator |
| 獨立 Calendar readback、Gate 判定、其餘 gates 與 P09-14 closure | P1-09 acceptance owner；文件由 docs maintainer 更新 |

本紀錄未指定個人姓名，也未替上述角色核准任何操作。

## 下一位接手者的第一步

**不要直接重試 Gate 14。** P09-09 是主要歷史失敗項，不代表現在已可執行。最新 operator packet 規定 Gate 00–13 先完成並逐項留下 UTC/操作者證據；其中新 exact-SHA authority、rollback baseline、fresh Terraform plan/drift 對帳、build/provenance、deployment graph、必要 preview 準備都尚未具備。舊 packet 的操作窗已過期，不能沿用。

1. 先以唯讀方式確認 `main`、verify CI、目前雲端 target 和私有證據可讀性；更新本交接 overlay，不覆寫 9/22 歷史 matrix。
2. 依 [19-gate operator packet](../plans/2026-09-22-p1-09-operator-packet.md) 的 Gate 00–13 順序處理前置項。每個 mutation 前都需重新核對 exact source、有效 UTC 窗、C1 project/channel、expiry、完整 diff 和 rollback；任何前置 gate 未過即停止，不進 Gate 14。
3. 前置證據齊全後，才由 owner 提出並明確批准新的 exact-SHA packet，逐項列出 project/channel、expiry、mutation scope/budget、rollback command/target、operator/approver 與有效時間窗。repo `CLAUDE.md` 規定 build/deploy 命令由 owner 執行；本交接不是授權。
4. 僅在 Gate 00–13 PASS 且 packet 有效後，以核准 SHA build immutable API/worker images；read back provenance, digest, revision, traffic, health, Hosting target and rollback, then compare with approved plan. Any mismatch stops execution.
5. Gate 14 只執行一次有界序列：同一 synthetic event 人工改動 → inbound → staff reject → 相同 idempotency input replay → restore dispatch → 獨立讀回同一 event。核對一筆 reject audit、一筆 restore outbox、SoT/version 與 external event ID 不變、沒有第二個 event、29 筆 unmatched metadata hash 不變。任一 assertion 失敗即停止，不以手動 Calendar/Firestore 修補補成 PASS。
6. P09-09 通過後，依 operator packet 續行 Gate 15–17，完成 P09-10～13、Stage F 11 cases、strict Stage F 與舊 completeness inspect，並封存可攜、可讀的 redacted artifact manifest；任一列不是 PASS，不進 Gate 18。
7. P09-01～13 全部適用門檻均有 exact-SHA 證據後，才建立真正 P09-14 closure PR，附 exact-head CI、逐列狀態、artifact manifest、cloud mutation/readback 與 rollback record，並作獨立 closeout handoff。PR #164 目前只交接未關帳狀態。

截至 2026-09-24，P1-09 尚未關帳。任何後續狀態須新增 dated evidence；本文件不授予 cloud、deployment、production、AWS 或 public-site 權限。
