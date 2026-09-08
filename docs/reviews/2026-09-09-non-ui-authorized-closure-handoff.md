# 非 UI 工作流目前授權上限交接（2026-09-09）

**狀態：** 日期化交接證據；不是 Stage 2、C0、部署、真實資料或任何 D-series 核准。
**日期：** 2026-09-09（Asia/Taipei）
**基準：** `origin/main` 在規劃時為 `49efeda4ea2a598ba5e1e0d3d53bafe4b917b8ec`（PR #83）。
**交付 merge：** `69b56e997765e4b1737955a5ae1adca35fe963e8`（[PR #86](https://github.com/waydefu/clinic/pull/86)，2026-09-08T17:34:33Z）
**Exact-head CI：** [verify run 34257564731](https://github.com/waydefu/clinic/actions/runs/34257564731) 對 `5af406ee7d0073ca94497e54f4df8535f9b4fbb7` **SUCCESS**（含 `Verification evidence`）。
**本文件所在 commit：** 寫入時尚未提交。查找方式：`git log -- docs/reviews/2026-09-09-non-ui-authorized-closure-handoff.md`

## 一句話

目前授權的非 UI 工作已收到文件現況對帳（WEB-P0／SCM-R02 已關、GC-002 記錄 D-013 與 live GitHub `enforce_admins=true` 衝突）並合併；剩餘全部是 owner／部署／政策 HARD_STOP，不是下一支工程 PR。

## 階段位置（不變）

- Stage 1。C0 = `revise`。C1–C6 `deploymentAuthorities=not_granted`。
- D-006／D-010 仍是核准**目標**，不是部署授權。BOOK-PILOT 仍是 plan-only。
- 本紀錄**不能**把工程就緒讀成 Stage 2 或 production 授權。

## 鎖定範圍（PLAN_LOCKED 預設，owner 未回覆五題）

| Q | 套用預設 |
| --- | --- |
| Q-SCOPE | A — 文件 + GC-002；不做 DATA-R03、不把 Gitleaks 加進 required CI、不上 staging |
| Q-D013 | C — 只記錄衝突；不改 GitHub、不改 D-013 狀態值 |
| Q-SCM-R04 | A — 9 筆 low/moderate dev advisory 維持開放 |
| Q-STAGING | A — 不做 cloud read/apply |
| Q-BOOK | A — BOOK-PILOT 維持 plan-only |

## 交付的修訂

分支 `agent/doc-truth-non-ui-closure`，相對 `49efeda`：

1. `430d1e684a342a0e98abcad903b4f0c65f0ad1a5` — 文件：關閉 WEB-P0／SCM-R02 Node floor 的過期「未完成」敘述；README 把 Dependabot 殘餘改指 SCM-R04；D-009/D-016 標明 2026-08-31 apply 是日期證據、新 apply 需要新 SHA；新增 **GC-002**。
2. `884adb93657ae415eaa876cc5a5929ac010b7cdc` — 嘗試給篩選器加 `scroll-margin`（**失敗**：axe 仍紅，且 `/index.html` stylesheet gzip 16.0 KiB 超過 16 KiB 預算）。
3. `5af406ee7d0073ca94497e54f4df8535f9b4fbb7` — 撤回該 CSS；只在 `tests/e2e/ui-redesign.spec.ts` 於 axe 掃描前把 `#appointment-status-filter` 置中。相對 `origin/main` 的產品 CSS **淨差異為空**。

未改：D-series Status 儲存格、C0/C1–C6、`apps/api` 寫入路由、workflow、HSTS、terraform、booking 掛載、GitHub `enforce_admins`、audit ignore、預算上調。

## 過程中確認的缺陷

| ID／症狀 | 分類 | 處置 |
| --- | --- | --- |
| 文件仍把已合併的 WEB-P0-01..03、SCM-R02 Node floor 寫成未完成；SCM-R02 ID 曾與 CSP/headers 碰撞 | `CONFIRMED` | 文件修正，PR #86 |
| README 把 Dependabot 殘餘算在 SCM-R03（Gitleaks） | `CONFIRMED` | 改指 SCM-R04 |
| D-013 Canon 要 `enforce_admins=false`；live GitHub 為 `true`；`check-branch-protection.mjs` 不斷言該欄 | `CONFIRMED` | **GC-002**；不改 GitHub |
| `e2e-ui` 768px axe `target-size`：`#appointment-status-filter` 被 sticky `.workspace-nav` 遮成約 11.3px（docs-only `430d1e6` 與 CSS `884adb9` 皆紅；同測試在 `49efeda` 曾綠） | `LIKELY`（CI 兩次重現；本機 Chromium GPU／無 Playwright 套件，未在本機重跑 spec） | 不削弱 axe、不加 CSS；掃描前 `scrollIntoView({block:'center'})`。根因是 Playwright actionability `block:start` 把控制項捲進 sticky nav 底下，不是 select 本身小於 24px |
| `/index.html` stylesheet 16.0 KiB > 16 KiB | `CONFIRMED` | 撤回額外 CSS，不調預算 |

## 關卡（對 exact head `5af406e`，venue = required PR CI）

| Gate | 狀態 | 證據 |
| --- | --- | --- |
| `Verification evidence` | `PASS` | job 102168051197 |
| `pnpm verify`（結構／文件／格式／lint／型別／單元） | `PASS` | job 102167115885 |
| Firestore Emulator `test:rules` | `PASS` | job 102167116240 |
| e2e-auth-rbac | `PASS` | job 102167116542 |
| e2e-appointments | `PASS` | job 102167116571 |
| e2e-patient-portal | `PASS` | job 102167116268 |
| e2e-mobile | `PASS` | job 102167116603 |
| e2e-accessibility | `PASS` | job 102167116464 |
| e2e-ui | `PASS` | job 102167116705（含先前紅燈的 768px spec） |
| supply-chain | `PASS` | job 102167116140 |
| SAST | `PASS` | job 102167116290 |
| 本機 `check:docs` / `check:governance` / `check:ui` / `check:tokens` / `check:pages` / `check:e2e-groups` | `PASS` | 在 CSS 嘗試期間對 worktree 跑過；`5af406e` 的權威是 CI |
| 本機 `check:perf` | `NOT_RUN` | worktree 無 `apps/web/dist`；改由 CI `pnpm verify` 覆蓋 |
| 本機 `test:e2e` | `UNAVAILABLE` | worktree 無 `node_modules`／Playwright 瀏覽器；本機先前 Chromium GPU 不穩。改由 CI e2e-ui |
| 本機完整 `pnpm verify` | `NOT_RUN` | 無 worktree `node_modules`；有意交給 CI |
| terraform / firebase apply / preview Hosting | `NOT_RUN` | Safety Floor 8；Q-STAGING=A |
| Gitleaks 作為 required check | `NOT_RUN` | Q-SCOPE=A；SCM-R03 仍非 required CI |
| TW-05 / WEB-30-02 人工 AT | `NOT_RUN` | 外部人工驗收 |
| live `remoteCloud` CAL-PILOT | `UNVERIFIED` | 2026-08-31 紀錄是日期證據，不是新 SHA 的 apply 授權 |

證據 rung：**`CI-VERIFIED`** 於 `5af406e`；merge commit `69b56e9` 的 required check 是該 head 的 `Verification evidence`。**`DEPLOYED-NOT-SMOKED` / `VERIFIED-PRODUCTION` 皆未達到。**

## 未做、仍屬 HARD_STOP

- C0 `revise`；C1–C6 部署授權未授。
- 公開預約寫入路由維持未掛載；BOOK-PILOT 維持提案。
- SCM-R04：9 筆 Dependabot low/moderate（dev）。
- DATA-R03、把 Gitleaks 加進 required CI。
- D-013 vs live `enforce_admins`（GC-002）；GC-001（公開鏡像 vs 未退役 Rule 1）。
- T0-DEP-02 / T0-SMK-01 / T4-DEP-01 仍是 INTERRUPT OWNER。
- 任何 production／live channel／真實病患或薪資資料。

## 本機陷阱

- 規劃時本機 `/root/projects/clinic` 在 `agent/scm-r02-node-floor`，**不是** `origin/main`。以 `git fetch` 的 `origin/main` 為準。
- `.claude/worktrees/doc-truth` 無 `node_modules`；不要為了填表去 install。
- 工作臺 stylesheet gzip 預算貼齊 16 KiB；任何多幾行 CSS 都會讓 `check:perf` 紅。
- `required_approving_review_count=0`，但 `enforce_admins=true`，沒有管理員繞過。

## 下一個人的第一步

不要再開「把非 UI 工程做完」的 PR。下一動是 **owner 回答五題中任何要擴張授權的選項**（SCOPE B/C、D013 A/B、SCM-R04 triage、STAGING B/C、BOOK B/C）。在那之前，唯一仍授權的工程是文件生命週期／衝突紀錄的後續更正，以及 UI/UX Round 2 **分開的**視覺車道。
