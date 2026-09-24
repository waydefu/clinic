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
| C1 API 部署基線 | **PARTIAL；不是修復版** | 2026-09-24 fresh readback：service `internal-test-api`、latest-ready `internal-test-api-p109durable1`、100% traffic、Ready/ContainerHealthy；image digest `sha256:2250015b779b410ec63d58bc49676bb538448c6cc575e6eebe9454563a06820a`。Booking enabled=`true`，expiry=`2026-09-30T10:00:00Z`。該 image 是 #163 merge 前版本，不能證明修復已部署。 |
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
- 2026-09-24 僅讀回 API service/revision、image digest、health、booking enabled/expiry；沒有在本次操作 API、Firestore、Google Calendar、IAM、Terraform、AWS、production 或 public site，也沒有重新執行已修復版本的 C1 runtime。
- 不把 PR CI、先前人工修復或舊版 C1 readback 推論為修復後能力。

## 未完成事項

- PR #163 已合併；最新 `main` 已 fresh fetch 並核對為 `f5bc805dd199324a149421159ac9f22cd944a6a4`，main verify run `35998718456` 成功。
- 合併 SHA 的 exact-SHA C1 packet 目前只有未核准草稿；build digest/provenance、完整 Hosting target、rollback readback、fresh Terraform plan/drift 解法等仍未完成。草稿不是授權，不可據以部署。
- 尚未以合併 SHA 建置 API／worker immutable image，亦未部署或更新 isolated Hosting preview。
- 尚未用新版本完成一次 Gate 14 end-to-end：synthetic event edit → inbound → staff reject → idempotency replay → restore dispatch → 同一 Calendar event 的獨立 readback；也未證明重送不增加 audit/outbox。
- P09-10 replay、P09-12 Stage F 11 cases/evaluators、P09-13 current-SHA rollback proof、P09-14 closure 尚未完成；舊 SHA 證據不得沿用為新 SHA PASS。
- 未部署 source、未建立 fresh C1 fixture、未作 Gate 14 修復後 readback。
- 未進行任何 production、AWS 或 public site actions。

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

**下一個 Roadmap ID：P09-09 修復後重驗；目前仍待完成 exact-SHA C1 packet、必要核准與 owner-run build。** 依下列順序執行：

1. 確認 `main` 仍為 `f5bc805dd199324a149421159ac9f22cd944a6a4` 且 verify run `35998718456` 成功；source CI 不替代 runtime gate。
2. 由 C1 owner/operator 完成 fresh readback、immutable image build/provenance、完整 Hosting target、rollback target 與 Terraform plan/drift review；任何未解 drift 或非零／超範圍 plan 先停止處理。
3. 填妥唯一 C1 project/channel、expiry、mutation budget、回復命令與停止條件，取得綁定 exact SHA 的必要明確核准。依 `CLAUDE.md`，build/deploy 命令由 owner 執行；未核准前不可執行。
4. 僅部署核准的隔離 source，使用新的 synthetic fixture；部署後先讀回實際 revision、digest、traffic 與健康狀態。
5. 僅執行一次有界序列：改動同一 event → inbound → reject → 同一 idempotency request replay → dispatch restore → 獨立讀回同一 event。確認只有一筆拒絕 audit、一筆 restore outbox、appointment SoT/version 未變、外部 event ID 未變、沒有第二個 event，且 29 筆 unmatched candidates metadata hash 不變。
6. 任一斷言失敗即停止，不補手動 Calendar 變更或 Firestore 寫入。只有所有 readback 都符合才將 P09-09 更新為 PASS；再按現行 matrix 完成 P09-10～13，全部 PASS 後才可進行 P09-14 closure 與獨立 closeout handoff。

截至 2026-09-24，P1-09 尚未關帳。任何後續狀態須新增 dated evidence；本文件不授予 cloud、deployment、production、AWS 或 public-site 權限。
