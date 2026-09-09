# 非 UI 工作流目前授權上限交接（owner 五題後）（2026-09-09）

**狀態：** 日期化交接證據。**不是** Stage 2、**不是** C0 通過、**不是** D-010
apply、**不是** production、**不是** 真實病患／臨床／薪資資料授權。
**日期：** 2026-09-09（Asia/Taipei）
**階段／步驟：** 非 UI 工作流收到 owner 五題後，執行至目前授權上限並停止。
**對應執行書：** §10.4 階段交接；§0.1 Safety Floor。
**基準 `origin/main`：** `a9d3ba8b3ffd3692c31d9fdb259f413326945957`
（[PR #104](https://github.com/waydefu/clinic/pull/104) squash）
**Exact-head CI on that SHA：** [verify run 34326772594](https://github.com/waydefu/clinic/actions/runs/34326772594)
**SUCCESS**（含 `Verification evidence`）。
**本文件所在 commit：** 寫入時尚未提交。查找：
`git log -- docs/reviews/2026-09-09-non-ui-max-authorized-handoff.md`

本紀錄**取代**同日較早的
[PR #86 授權上限交接](2026-09-09-non-ui-authorized-closure-handoff.md)
作為「下一步從哪裡開始」的現況。#86 文件仍是當時 PLAN_LOCKED 預設（五題未回）
的日期證據，不要當現況授權表。

---

## 一句話

Owner 已回答 Q-SCOPE／Q-D013／Q-SCM-R04／Q-STAGING／Q-BOOK；授權內的非 UI
切片已以測試與 exact-head `Verification evidence` 合併到 `main`。剩餘要嘛是
**ID 誠實保持 OPEN**（DATA-R03、SCM-R04），要嘛是 **HARD STOP**（C0／Stage 2／
production／真實資料／dual-write／把 BOOK-PILOT 當成 D-004／D-005）。這**不是**
工程就緒等於 Stage 2。

## 階段位置（不變）

- Stage 1。C0 = `revise`。C1–C6 `deploymentAuthorities=not_granted`。
- D-006／D-010 仍是核准目標，不是部署授權。
- BOOK-PILOT 是隔離、未掛入 production `AppModule` 的合成模組，**不是**
  production `/v1/bookings`。

## Owner 五題（已鎖定，不要重問）

| Q | 答案 | 落地 |
| --- | --- | --- |
| Q-SCOPE | DATA-R03 + SCM-R03 Gitleaks 納入既有 `Verification evidence`；不新增 GitHub required context；staging 只走 Q-STAGING | PR #89／#92、#95／#98／#99／#101／#102；文件 #100／#103 |
| Q-D013 | 採用 `enforce_admins=true`；Canon 對齊 live GitHub 後關 GC-002 | PR #88 |
| Q-SCM-R04 | Fresh-check；逐筆；同 major 可修；禁止 dismiss-to-clear；Dev Moderate 30d／Low 90d；High/Critical 升級；跨 major 至 **2026-10-09** 重審 | PR #94；js-yaml 4.3.2 隨 #101 |
| Q-STAGING | `beauessence-clinic-staging` **READ-ONLY**；secret **version ID only**；禁止 apply／deploy／IAM／secret 變更與 secret **值** | PR #97 初盤；PR #104 `gcloud` 重讀 |
| Q-BOOK | 續 BOOK-PILOT；獨立 `BookPilotModule`；不是 D-004／D-005；不是 production `/v1/bookings` | PR #96 |

## 交付的修訂（相對 #86 交接之後）

`origin/main` 現況 `a9d3ba8`。本工作流合併（squash SHA）：

| PR | squash | 做了什麼 |
| --- | --- | --- |
| [#88](https://github.com/waydefu/clinic/pull/88) | `9a7748e` | D-013 Canon `enforce_admins=true`；關 GC-002 |
| [#89](https://github.com/waydefu/clinic/pull/89)／[#92](https://github.com/waydefu/clinic/pull/92) | `6e91bda`／`e2e52a9` | Gitleaks 8.30.1 checksum-pinned 進同一 `verify`；`schemaVersion` 3 |
| [#94](https://github.com/waydefu/clinic/pull/94) | `ad58a61` | 同 major：`hono`／`postcss`／`undici@6`／`re2` |
| [#95](https://github.com/waydefu/clinic/pull/95) | `dbbeed7` | 未知 Calendar status → `INVALID_VALUE` 非重試 dead-letter |
| [#96](https://github.com/waydefu/clinic/pull/96) | `9b38bb1` | 未路由 `BookPilotModule`；kill-switch／expiry → 503 |
| [#97](https://github.com/waydefu/clinic/pull/97) | `6237653` | staging 唯讀初盤（當時無 `gcloud`） |
| [#98](https://github.com/waydefu/clinic/pull/98) | `21a3ee9` | `parseSlotSnapshot`／`parseAppointmentSnapshot` |
| [#99](https://github.com/waydefu/clinic/pull/99) | `3f726d8` | 冪等 `resourceType` 與 domain 對齊 |
| [#100](https://github.com/waydefu/clinic/pull/100) | `e484b52` | 三刀文件誠實；ID 仍開 |
| [#101](https://github.com/waydefu/clinic/pull/101) | `90c9c3e` | `parseOutboxSnapshot` fail-closed；js-yaml 4.3.2 同 major |
| [#102](https://github.com/waydefu/clinic/pull/102) | `0dae4ee` | CAL-PILOT 冪等 envelope 解析 |
| [#103](https://github.com/waydefu/clinic/pull/103) | `496da6e` | 五刀文件誠實 |
| [#104](https://github.com/waydefu/clinic/pull/104) | `a9d3ba8` | `gcloud` 重讀 Cloud Run／secret version／收斂 IAM／Hosting version／indexes |

未改：production `AppointmentController` 掛載、dual-write／`schemaVersion` backfill、
D-007／D-008 持久化、terraform apply、live-channel deploy、secret 值、C0 狀態。

User-level Luna：`clinic-luna-scout`（唯讀調查）、`clinic-luna-worker`（已鎖定切片）。
Grok 負責架構／安全／合併。`PLATFORM_APPROVAL_BYPASS=NO`。

## 驗收證據（`origin/main` `a9d3ba8`）

Venue = GitHub Actions `verify` workflow。本機完整 `pnpm verify` **`NOT_RUN`**
（有意交給 CI；PRoot worktree 資源限制不降低門檻）。

| Gate | 狀態 | 證據 |
| --- | --- | --- |
| `Verification evidence` | `PASS` | [run 34326772594](https://github.com/waydefu/clinic/actions/runs/34326772594) on `a9d3ba8` |
| 結構／文件／格式／lint／型別／單元 | `PASS` | 同上 run |
| Firestore Emulator | `PASS` | 同上 run |
| e2e-auth-rbac／appointments／patient-portal／mobile／accessibility／ui | `PASS` | 同上 run |
| supply-chain／tracked secrets | `PASS` | 同上 run |
| Gitleaks | `PASS` | 同上 run（SCM-R03 已聚合進 evidence） |
| Semgrep SAST | `PASS` | 同上 run |
| 本機 `check:docs`（本交接稿） | 寫入後跑；以該 PR exact-head CI 為準 | — |
| 本機 Gitleaks linux_x64 | `UNAVAILABLE` | PRoot `SIGILL`；改由 CI |
| terraform apply／firebase deploy／live Hosting | `NOT_RUN` | Safety Floor 8；無逐 commit 部署授權 |
| TW-05／WEB-30-02 人工 AT | `NOT_RUN` | 外部人工驗收 |
| Identity Toolkit Auth provider 清單 | `UNAVAILABLE` | 2026-09-09T07:50Z admin config `403`；未讀 users |

證據 rung：**`CI-VERIFIED`** 於 `a9d3ba8`。**未達** `DEPLOYED-NOT-SMOKED`／
`VERIFIED-PRODUCTION`。

### 已入庫日期證據檔 SHA-256（`a9d3ba8` 樹上）

| 檔 | SHA-256 |
| --- | --- |
| `docs/reviews/2026-09-09-staging-readonly-inventory.md` | `7b5da6fb8dfb0b9f2c04767c4236ddd17ce29000d4229192e83b96518c13ecb0` |
| `docs/reviews/2026-09-09-data-r03-engineering-slices.md` | `76c826ea4833d15714f6d3fa0f291395a5fa9b547948b2ffa923707466e58b47` |
| `docs/reviews/2026-09-09-scm-r03-gitleaks-evidence.md` | `567d3ef01a97f19965f4cae34eda4caf7a07cf00df13fb9672a507e84de03196` |
| `docs/reviews/2026-09-09-scm-r04-dependabot-triage.md` | `5726c4eb7e17a85b2b873c6f1e2c522df402a6ceae0bd60797876956318f5a0a` |

本交接檔不能引用自己的 commit hash。

## 稽核範圍與未覆蓋面

**讀到：** GitHub `waydefu/clinic` `origin/main`；CI `verify` on `a9d3ba8`；
staging 專案 `beauessence-clinic-staging` 的 Cloud Run／Secret **metadata**／
收斂 IAM／Hosting version／Firestore **index 中繼資料**。

**未覆蓋：** production 專案；secret **值**；Auth users；Firestore documents；
Identity Toolkit provider 完整清單（403）；CAL-PILOT 其餘 collection `documentData<T>`
執行時 corrupt 行為；corrupt-doc **alerting**（metrics backend 屬 Stage 2）；
真人輔具與實體裝置。

## 過程中確認的缺陷

| 症狀 | 分類 | 處置 |
| --- | --- | --- |
| Canon D-013 `enforce_admins=false` vs live GitHub `true`（GC-002） | `CONFIRMED` | Q-D013 採用 live；PR #88 關衝突 |
| 未知 Calendar status 被當 cancel | `CONFIRMED` | PR #95 fail-closed |
| slot／appointment／outbox／CAL-PILOT envelope 未解析即 `as T` | `CONFIRMED`（booking／outbox／envelope） | PR #98／#101／#102；其餘 CAL-PILOT collection **未**在本授權切片 |
| 文件仍寫 DATA-R03「三刀／尚未實作」 | `CONFIRMED` | PR #100／#103；**ID 仍 OPEN** |
| #101 不可讀 outbox 測試仍預期 claim 後才隔離 | `CONFIRMED` | 回歸改為交易內 dead-letter |
| staging 盤點缺 Cloud Run／secret version（無 `gcloud`） | `CONFIRMED` | PR #104 重讀 |
| `cal-pilot-api` `run.invoker=allUsers` | `OBSERVED` | 只記盤點；不是本工作流 hardening 授權 |
| GitHub Dependabot UI 曾顯示 8 moderate vs triage 文件 10 open | `OBSERVED` | 未 dismiss；以 triage 文件 + 2026-10-09 重審為準 |

## 未處理、仍屬 OPEN 或 HARD_STOP

**OPEN（誠實不關 ID，不是下一刀已授權工程）：**

- `DATA-R03`：booking 路徑 dual-reader 已落地；剩餘 CAL-PILOT `documentData`／worker
  calendar-sync casts、corrupt-doc **alerting**、dual-write 都要**新的 scope 決策**。
- `SCM-R04`：`stream-json@1`→3.x、`csv-parse@5`→7.x 綁 `firebase-tools` major；
  重審日 **2026-10-09**。禁止 dismiss-to-clear。

**HARD_STOP：**

- C0=`revise`；C1–C6 未授；production／live-channel／terraform apply／firebase deploy
- 真實病患／臨床／薪資資料；secret 值；IAM／secret／Cloud Run traffic **寫入**
- production `/v1/bookings`；把 BOOK-PILOT 當 D-004／D-005
- 削弱 gate／axe／perf；force-push `main`；繞過 branch protection
- Auth provider 清單：需要額外 Identity Platform 讀權，**仍禁止** user export

## 本機環境陷阱

- `gh pr merge --delete-branch` 可能把 worktree 簽出 `main`；立刻離開 `main`。
- 非互動 `gcloud auth login --no-launch-browser` 會 EOF；驗證碼必須餵進仍活著的
  login 行程。
- PRoot 上 Gitleaks linux_x64 可能 `SIGILL`；不要把本機紅當 gate 設計錯誤。
- 多數 `.claude/worktrees/*` 沒有完整 `node_modules`／Playwright；不要為了填表
  install。本機 `check:docs` 可用另一棵樹的 prettier。
- 工作臺 stylesheet gzip 預算貼 16 KiB。
- 盤點文件禁止寫入個人信箱與 secret 值。
- staging `allUsers` invoker 是觀察，不是「順便修」。

## 記錄的決策與剩餘風險

- 五題答案如上；未把 DATA-R03 ID 關掉。
- 剩餘風險：CAL-PILOT 其他 collection 仍可能把壞文件當合法型別；outbox／booking
  路徑已 fail-closed。Alerting 不存在（`NOOP_WORKER_METRICS`；roadmap 延到 Stage 2）。
- `cal-pilot-api` 對 `allUsers` 可 invoke：合成 pilot 暴露面，不是 production API。

## 下一個人的第一步

1. **不要**再開「把 DATA-R03 做完」或「修完 CAL-PILOT 所有 `as T`」的 PR，除非
   owner 另授 scope。
2. **2026-10-09**：SCM-R04 重審 `stream-json`／`csv-parse`（或等 `firebase-tools`
   同 major 可解）。仍禁止 dismiss。
3. Auth providers：若要補 Q-STAGING 最後一格，先給 Identity Toolkit **config 讀權**，
   仍禁止 `auth_get_users`。
4. 下一張**政策**票是 C0 審查資格補齊，或具名 D-004／D-005／D-010 部署授權——都
   不是本交接能宣布的。
5. UI/UX／TW-05 仍是**分開車道**。

目前 Stage 位置：**未改變**（Stage 1）。
