# 2026-10-18 Sol／Luna 一路跑完：設定與提示詞

**性質：** 執行說明與提示詞，planning-only。本文件不授權 merge、部署、`terraform apply`、
secret／IAM、資料遷移、TTL 雲端設定、改寫歷史、放寬 gate 或任何 D-series 核准；這些仍依
[決定登記簿](../product/phase-1-decision-register.md)逐次取得業主明確授權。
**依據：** 決定登記簿「2026-10-18 交付節奏與 Sol／Luna 執行方式」條目。
**基準：** `origin/main` `8746063`（2026-10-18，#263 合併後）。

## 1. 怎麼用（白話）

**開始前：**

1. **先合併這份文件的 PR。** Sol 會從 `main` 重讀第 4 節的規則；對話很長被壓縮後，它才找得回來。
2. **準備執行的電腦：**
   - **用 Linux 電腦**（例如 Ubuntu 筆電），在 bash 裡執行，並在那台電腦上重新 clone repo。
     - 不建議用這台 Windows 或 WSL2：Codex 的規則檔怎麼比對 PowerShell 指令，官方沒有寫清楚；在 WSL2 裡，Windows 端的 `gcloud.exe`、`terraform.exe`、`gh.exe` 也叫得到，規則比對不到。
     - 若一定要用 WSL2：在 `/etc/wsl.conf` 設 `interop.appendWindowsPath=false`，在 WSL 自己的檔案系統裡重新 clone（不要用 `/mnt/f` 底下的資料夾），Windows 端也要登出 gcloud 與 firebase。
   - 裝好最新版 Codex CLI。
   - `gh` 已登入，而且能推分支、開 PR。
   - **不要登入 gcloud 或 firebase**（`gcloud auth list` 沒有帳號、沒有 ADC）。這是擋住部署類動作最主要的一道防線：代理就算誤下部署指令或誤跑部署腳本，也只會失敗。
3. **放好第 3 節的三個設定檔**，用第 3.3 節的指令確認規則生效。

**開始跑：**

4. 在 repo 根目錄啟動 `codex`，先輸入 `/model`，確認看得到 `gpt-6.1-sol`。看不到的話，請管理這個 ChatGPT 帳號或工作區的人確認。
5. 把第 4 節「Sol 父代理提示詞」整段貼上送出。Sol 會先做 Phase 0：測試設定、對帳、整理要你決定的問題。這一步你要在場：
   - Sol 和 Luna 各會建立一個測試用的工作資料夾與分支，最後刪掉。刪除時大約會跳出四個「要不要允許」，那是預期的，可以按允許；Luna 自己的指令也可能另外跳出詢問；
   - Sol 和 Luna 都會試一次合併指令，兩個都必須被擋下。請在畫面上確認兩個都被擋下，而且沒有出現合併的結果；
   - 請在 Codex 畫面用 `/subagents` 看 Luna 那個子代理實際用的是哪個模型。
6. Sol 做完 Phase 0 會停下來回報。你回答決定簡報後，輸入第 5 節的 `/goal` 那一行。

**之後你要做的：**

- Sol 每次停下來、或有 PR 狀態改變時，會用白話回報。
- **合併 PR：** Sol 會標出「現在可以合併」的那一個 PR（已跟上最新 `main`、CI 綠）。你只合併那一個；Sol 再讓下一個跟上 `main`、等 CI 跑完後通知你。每合併一個，大約要等一輪 CI。
- **目標達成後如果還有事做**（例如有 PR 在等你合併），再輸入一次同一行 `/goal`。
- **畫面跳出「要不要允許」時：** 代表規則要求問你，或指令需要離開 sandbox 執行。凡是跟合併、部署、secret、`gh api` 有關的都按拒絕；看不懂也按拒絕。沒有跳出詢問，不代表那個指令一定安全。如果 Codex 建議「以後都允許某個指令開頭」，跟上述有關的都不要接受。

**名詞小抄：**

- **CI**：GitHub 上自動跑的檢查。
- **packet**：一個工作包。
- **worktree**：同一個 repo 的另一份工作資料夾。
- **READY-FOR-MERGE**：PR 的 CI 已全綠、Sol 已自審，排隊等合併。
- **`/goal`**：讓 Codex 持續工作到達成目標的指令。
- **L7**：Luna 的第 7 組工作，也就是回歸、手冊與驗收清單。
- **braces**：只在開發工具裡用到的套件，有已知弱點，還沒有修補版。
- **CAL-PILOT**：Google 日曆的合成資料測試授權。

## 2. 事實與限制

### 2.1 範圍

- **凍結條件**（業主 10-18 決定）：[`2026-10-06-sol00-safe-manifest.json`](2026-10-06-sol00-safe-manifest.json)
  `activeCloseout.executionGraph` 的 **55 個 `SOL_PRIMARY_EXPERT_ONLY` packet 全部完成**。
- **數量：** 這 55 個 packet 涵蓋 240 個稽核 ID。整張圖 59 個 packet 涵蓋 254 個；另外 14 個 ID 在 3 個 `LUNA_READY` packet（4 個）與 `NO-WORK`（10 個）。
- **「完成」的定義：** 每個 packet 是 DONE-MERGED、ALREADY_FIXED 或 NO-WORK（manifest 標為規劃終態的 SOL-CUSTODY 屬於這一類）。若有 packet 最後停在 BLOCKED-*，凍結要繼續等、還是由業主另行決定，列為 Phase 0 決定簡報的一題。
- **其他 packet：** 3 個 `LUNA_READY`（LUNA-E2E-INVENTORY、LUNA-FIRESTORE-RUNNER、LUNA-ROBOTS-COMMENTS）與 `NO-WORK` 不在凍結條件內。`LUNA-WORKBENCH-START` 名字有 LUNA，但其實是 Sol 專屬（`SOL_CORE_LEASE_REQUIRED`），算在 55 個裡。
- **和 10-05 計畫的差別：** [10-05 計畫](2026-10-05-audit-gap-sol-luna-execution-plan.md) 的 SOL-01～13 只有 41 個 ID（33 個原始、8 個 NEW），對到 14 個 packet 加上 SOL-INTEGRATION。業主選的是現行清單全部 55 個。
- **10-05 的 19 個 Luna 小包已併入 Sol 專屬 packet**（例如 K5、A01 在 SOL-HTTP；B-21、E3-01、E3-02 在 SOL-PRIVACY），不再是 Luna 包。
- **依賴與時程：**
  - 依賴最深 8 層：SOL-CONTRACTS → SOL-SESSION → SOL-IDENTITY → SOL-RETURN → SOL-TTL → SOL-SCHEDULE → SOL-CALENDAR-CANDIDATE → SOL-INTEGRATION；
  - 有 21 個 Sol packet 沒有依賴，可以先做；
  - `main` 要求 PR 跟上最新 main 才能合併，所以每合併一個 PR，都要先等它的那一輪 CI。實際時程大約是「剩下的 PR 數 ×（一輪 CI ＋ 業主合併的間隔）」。剩下多少 PR，要等 Phase 0 對帳後才知道。
- **10-12 之後已合併的修補要先對帳：** #248、#252～#260、#262、#263。#263 包含 D-05、D-12、API response schema、Calendar inbound、FTP fixture、D-28、D-33、E3-25 等。
- **manifest 是 2026-10-07 的規劃快照，不擋這次執行：** 裡面的 `dispatchAuthorized=false`、`implementationAuthorized=false`、`concurrency`（父代理等待、總數 2）都是快照，這次執行改看 10-18 的登記簿條目。但每個 packet 的 `forbiddenScope`，以及 `freshExecutionRequirements` 中涉及受保護動作的項目，仍然有效。
- **舊 Luna 文件對這次執行只是歷史：** [`luna-local-authorized-playbook.md`](../product/luna-local-authorized-playbook.md)、[`luna-local-project-completion-master-plan.md`](../product/luna-local-project-completion-master-plan.md)、[09-30 Luna 計畫](2026-09-30-luna-execution-plan.md)、[10-05 後續計畫](2026-10-05-audit-followup-luna-plan.md)。
  - 它們的「不用子代理」與 `cursor/luna-*` 分支規則，這次不適用；分支一律用 `agent/*`。
  - 環境需求與硬停止條件仍可參考。
  - `docs/README.md` 與 `docs/INDEX.md` 仍寫「Luna 從這裡開始」，這次執行請忽略。
- **驗收線 L7（CP-08 回歸、CP-09 手冊、CP-10 驗收清單）不在凍結條件內。** 它需要 C1 與業主到場，CI 跑不完。凍結前只能做準備，經業主在 Phase 0 同意後，可整包交給 Luna：
  - [CP-08 worksheet](2026-10-01-cp-08-regression-evidence-worksheet.md) 的步驟與證據蒐集方式；
  - [CP-09 手冊](../runbooks/manager-operations-manual.md) 能在本機合成資料上做的部分；
  - [CP-10 清單](2026-10-01-cp-10-current-project-acceptance-checklist.md) 的欄位整理。

### 2.2 模型（外部來源，2026-10-18 查詢）

- **GPT-6.1 Sol**（`gpt-6.1-sol`）：
  - 2026-09-29 DevDay 發表，可在 Codex 使用。
  - 推理強度最低為 `low`。
  - OpenAI 的建議（第三方轉述，未附官方連結）：會再修改的複雜技術工作用 `medium`，要求完成度高的交付用 `xhigh`。Artificial Analysis 實測寫程式時，`xhigh` 最好。
  - 每個任務的輸出 token 比 GPT-6 Sol 多 10～30%。
- **GPT-6 Luna**（`gpt-6-luna`）：2026-09-22 與 GPT-6 Sol 一起發表；低成本，OpenAI 建議用於聚焦、大量的工作。
  - `gpt-6-luna` 這個名稱來自第三方報導，官方 config 頁沒有列出；以 `/model` 選單看得到為準。
  - repo 舊文件對 Luna 的版本寫法不一（GPT-6 Luna 與 GPT-5.6 Luna）。

### 2.3 Codex（官方文件，2026-10-18 查詢；另有標註的社群資料）

- **子代理：**
  - 一個 agent 一個 TOML 檔，放 `~/.codex/agents/`；必填 `name`、`description`、`developer_instructions`，可設 `model` 與 `model_reasoning_effort`；
  - `agents.max_concurrent_threads_per_session` 限制同時開著的子代理數（不含主代理）；
  - 子代理繼承主代理的 sandbox、approval 與權限，agent 檔改不了。官方頁面沒有寫規則檔是否套用到子代理，所以 Phase 0 要實測；
  - **預設主代理會等所有子代理的結果**，所以提示詞要明講「派出後不要等，繼續做自己的事」。
- **規則檔（execution policy rules，實驗功能）：**
  - 放在 `~/.codex/rules/*.rules`，用 `prefix_rule` 依指令開頭判斷；
  - `allow`：在 sandbox 外執行、不詢問；`prompt`：每次詢問；`forbidden`：直接擋下；
  - 多條規則都符合時，取最嚴格的那條；
  - `bash -lc "a && b"` 這種簡單串接會被拆開逐一判斷；**用到重導向、環境變數、子殼層或萬用字元時不拆**，整串當成一個指令比對。
- **sandbox 的兩個坑：**
  - `workspace-write` 模式下 **`.git` 是唯讀**（worktree 指到的 git 目錄也是），所以 `git commit`、`git fetch`、`git worktree add` 都要靠規則 `allow` 才不會卡在詢問；
  - 開了 `network_access` 之後，需要網路、但 sandbox 允許的指令會直接執行、不詢問，所以 `gh pr merge`、`firebase deploy`、`terraform apply` **必須用規則擋下**。
- **規則檔是防呆，不是保證。** 它只比對指令開頭，以下寫法都擋不住：
  - 放行的開頭後面再接參數（例如 `git push -u origin HEAD` 後面接 `HEAD:其他分支` 或 `--force`）；
  - 子指令前面先放全域選項（例如 `gh pr -R <repo> merge` 的 `--repo=<repo>` 寫法、`pnpm --filter … exec`、`git -C`）；
  - 加了重導向、環境變數前綴或子殼層（例如 `gh pr merge 5 2>&1`、`CI=1 gh pr merge 5`）；
  - 寫在 node 或 PowerShell 腳本裡的呼叫。
  - sandbox 也擋不住推送：推送只需要網路，唯讀的 `.git` 只影響本機。
- **真正的防線：**
  1. 執行電腦沒有任何雲端登入（gcloud、firebase、ADC；用 WSL2 時也包含 Windows 端），部署類動作一定失敗；
  2. `main` 的分支保護：不能直接推送，也不能 force push；
  3. 提示詞裡的硬停止；
  4. 業主留意合併。
- **`gh pr merge` 是唯一沒有技術防線的動作：** `gh` 必須登入才能開 PR，而 `main` 不需要審查人。萬一誤合併的是 CI 綠的 PR，可以 revert。
  - 可選的加強做法（需業主決定，因為會改到 D-013 的分支保護）：代理改用另一個 GitHub 帳號開 PR，並把 `main` 改成需要 1 位審查人。代理不能審查自己的 PR，就合併不了。
- 其他 PR 分支沒有分支保護，只能靠規則與提示詞保護。
- **這個 repo 的指令防護（`.claude/hooks/guard-commands.mjs`）只接在 Claude Code，Codex 沒有。**
- **社群回報，未經證實：** Windows 上的 Codex CLI 0.144.5 曾發生派出子代理時無法指定 model。Phase 0 由業主在畫面上確認 Luna 的實際模型；派工訊息也會附上規則摘要，即使 agent 檔沒有生效也有基本約束。

### 2.4 CI 與分支保護

- `.github/workflows/verify.yml` 在 `pull_request`（含 Draft）、push 到 `main` 與手動觸發時執行。同一分支有新推送時，會取消進行中的 run。
- 工作有：verify、rules（Firestore emulator）、6 組 e2e、supply-chain、sast、gitleaks；最後是 `Verification evidence`，這是唯一的必要檢查。supply-chain 偶爾遇到 registry HTTP 502，可以重跑一次。
- **`main` 的分支保護（2026-10-18 讀回）：**
  - 必要檢查只有 `Verification evidence`；
  - **strict = true**，PR 必須跟上最新的 `main` 才能合併；
  - 必須經過 PR，但需要 0 個審查人；
  - 不能 force push，也不能刪除；
  - 管理員也不能繞過。
  - 所以 CI 一綠，任何有寫入權的帳號都能合併。

### 2.5 到期日

- CAL-PILOT：2026-11-28T04:51:37Z。
- braces 開發工具例外：2026-11-30。沒有修補版時，到期前要業主再決定。

## 3. 設定檔

在執行 Codex 的電腦上放這三個檔案。鍵名依 2026-10-18 的官方文件；Codex 版本不同時，用官方
configuration reference 核對。

### 3.1 `~/.codex/config.toml`

```toml
model = "gpt-6.1-sol"
model_reasoning_effort = "high"
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true

[features]
goals = true

[agents]
enabled = true
max_concurrent_threads_per_session = 2
default_subagent_model = "gpt-6-luna"
default_subagent_reasoning_effort = "xhigh"
```

- 額度夠的話，可以把主代理改成 `xhigh`。
- 不要改用 `danger-full-access`，也不要加 `--yolo`。

### 3.2 `~/.codex/rules/clinic.rules`

```python
# 一般開發：在 sandbox 外執行（workspace-write 下 .git 是唯讀）
prefix_rule(pattern = ["git", ["status", "diff", "log", "show", "rev-parse", "rev-list",
    "merge-base", "ls-files", "fetch", "add", "commit", "merge", "rm", "mv"]],
    decision = "allow")
prefix_rule(pattern = ["git", "worktree", ["add", "list"]], decision = "allow")
prefix_rule(pattern = ["git", ["checkout", "switch"], ["-b", "-c"]], decision = "allow")
# 推送用這個寫法放行；後面多接的參數，規則擋不住（見第 2.3 節）
prefix_rule(pattern = ["git", "push", "-u", "origin", "HEAD"], decision = "allow")
prefix_rule(pattern = ["gh", "pr", ["view", "list", "checks", "diff", "create", "edit",
    "ready", "comment", "status"]], decision = "allow")
prefix_rule(pattern = ["gh", "run", ["list", "view", "download", "rerun", "watch"]], decision = "allow")
# 每個新 worktree 安裝一次相依（pnpm store 在工作區外）
prefix_rule(pattern = ["pnpm", "install", "--frozen-lockfile"], decision = "allow")
prefix_rule(pattern = ["corepack", "pnpm", "install", "--frozen-lockfile"], decision = "allow")

# 會毀掉工作的指令：每次都要問
prefix_rule(pattern = ["git", ["reset", "clean", "stash", "restore", "rebase", "gc", "prune",
    "reflog"]], decision = "prompt")
prefix_rule(pattern = ["git", "checkout", ["--", "."]], decision = "prompt")
prefix_rule(pattern = ["git", "branch", ["-D", "-d", "--delete", "-f", "--force"]], decision = "prompt")
prefix_rule(pattern = ["git", "worktree", ["remove", "prune", "move"]], decision = "prompt")
prefix_rule(pattern = [["rm", "rmdir"]], decision = "prompt")
prefix_rule(pattern = [["curl", "wget"]], decision = "prompt")
prefix_rule(pattern = ["gh", ["api", "workflow", "release", "variable", "label", "issue", "repo",
    "auth"]], decision = "prompt")
prefix_rule(pattern = [["pwsh", "pwsh.exe", "powershell", "powershell.exe"]], decision = "prompt")

# 受保護動作：直接擋下
prefix_rule(pattern = ["git", ["filter-branch", "filter-repo"]], decision = "forbidden")
prefix_rule(pattern = ["git", "push", ["origin", "--set-upstream", "-d", "--force", "-f",
    "--force-with-lease", "--delete", "--mirror", "--all", "--tags"]], decision = "forbidden")
prefix_rule(pattern = ["git", "push", "-u", ["-f", "--force", "--force-with-lease"]], decision = "forbidden")
prefix_rule(pattern = ["git", "push", "-u", "origin", ["HEAD:main", "HEAD:refs/heads/main",
    "+HEAD", ":main", "--delete", "-d"]], decision = "forbidden")
prefix_rule(pattern = ["git", "push", "-u", "origin", "HEAD", ["HEAD:main",
    "HEAD:refs/heads/main", ":main", "-d", "--delete", "--force", "-f", "--force-with-lease",
    "--mirror", "--all", "--tags"]], decision = "forbidden")
prefix_rule(pattern = [["gh", "gh.exe"], "pr", ["merge", "close", "reopen", "-R", "--repo"]],
    decision = "forbidden")
prefix_rule(pattern = [["gh", "gh.exe"], ["secret", "ssh-key", "gpg-key", "ruleset"]],
    decision = "forbidden")
prefix_rule(pattern = [["firebase", "firebase.cmd", "gcloud", "gcloud.cmd", "gcloud.exe",
    "gsutil", "bq", "bfg", "terraform", "terraform.exe"]], decision = "forbidden")
prefix_rule(pattern = [["npx", "npx.cmd", "pnpx"]], decision = "forbidden")
prefix_rule(pattern = ["npm", "exec"], decision = "forbidden")
prefix_rule(pattern = ["pnpm", ["dlx", "firebase", "terraform"]], decision = "forbidden")
prefix_rule(pattern = ["corepack", "pnpm", ["dlx", "firebase", "terraform"]], decision = "forbidden")
prefix_rule(pattern = ["pnpm", "exec", ["firebase", "firebase-tools", "terraform"]], decision = "forbidden")
prefix_rule(pattern = ["corepack", "pnpm", "exec", ["firebase", "firebase-tools", "terraform"]],
    decision = "forbidden")
prefix_rule(pattern = [["./node_modules/.bin/firebase", "node_modules/.bin/firebase"]],
    decision = "forbidden")
# 會碰雲端的 pnpm 別名
prefix_rule(pattern = ["pnpm", ["verify:preview", "plan:internal-test-apply",
    "inspect:internal-test-migration", "inspect:stage-f-matrix", "inspect:stage-f-graph",
    "inspect:stage-f-schedule", "inspect:stage-f-alert-proof", "plan:firestore-indexes"]],
    decision = "forbidden")
prefix_rule(pattern = ["corepack", "pnpm", "run", ["verify:preview", "plan:internal-test-apply",
    "inspect:internal-test-migration", "inspect:stage-f-matrix", "inspect:stage-f-graph",
    "inspect:stage-f-schedule", "inspect:stage-f-alert-proof", "plan:firestore-indexes"]],
    decision = "forbidden")
prefix_rule(pattern = [["pnpm", "corepack"], ["run", "pnpm"], ["verify:preview",
    "plan:internal-test-apply", "inspect:internal-test-migration", "inspect:stage-f-matrix",
    "inspect:stage-f-graph", "inspect:stage-f-schedule", "inspect:stage-f-alert-proof",
    "plan:firestore-indexes"]], decision = "forbidden")
# 會碰雲端的腳本（第 4 節提示詞列的是同一份清單）
prefix_rule(pattern = ["node", [
    "scripts/activate-cal-pilot.mjs", "./scripts/activate-cal-pilot.mjs",
    "scripts/extend-cal-pilot.mjs", "./scripts/extend-cal-pilot.mjs",
    "scripts/disable-cal-pilot.mjs", "./scripts/disable-cal-pilot.mjs",
    "scripts/configure-cal-pilot-identity.mjs", "./scripts/configure-cal-pilot-identity.mjs",
    "scripts/seed-cal-pilot.mjs", "./scripts/seed-cal-pilot.mjs",
    "scripts/migrate-cal-pilot-legacy-candidates.mjs", "./scripts/migrate-cal-pilot-legacy-candidates.mjs",
    "scripts/report-cal-pilot-state.mjs", "./scripts/report-cal-pilot-state.mjs",
    "scripts/check-cal-pilot-worker-lease-index.mjs", "./scripts/check-cal-pilot-worker-lease-index.mjs",
    "scripts/c1-calendar-sync-bootstrap.mjs", "./scripts/c1-calendar-sync-bootstrap.mjs",
    "scripts/recovery-clone-verify.mjs", "./scripts/recovery-clone-verify.mjs",
    "scripts/internal-test-apply-plan.mjs", "./scripts/internal-test-apply-plan.mjs",
    "scripts/internal-test-migration-inspect.mjs", "./scripts/internal-test-migration-inspect.mjs",
    "scripts/firestore-index-plan.mjs", "./scripts/firestore-index-plan.mjs",
    "scripts/verify-preview-deployment.mjs", "./scripts/verify-preview-deployment.mjs",
    "scripts/stage-f-deployment-graph.mjs", "./scripts/stage-f-deployment-graph.mjs",
    "scripts/stage-f-synthetic-schedule-bootstrap.mjs", "./scripts/stage-f-synthetic-schedule-bootstrap.mjs",
    "scripts/stage-f-human-alert-proof.mjs", "./scripts/stage-f-human-alert-proof.mjs",
    "scripts/stage-f-acceptance-matrix.mjs", "./scripts/stage-f-acceptance-matrix.mjs"]],
    decision = "forbidden")
```

**限制：**

- 規則檔是防呆，擋不住的寫法見第 2.3 節。部署類動作靠「執行電腦沒有雲端登入」擋下。
- `git -C`、`git -c` 開頭的指令不會被放行：需要寫 `.git` 的會跳出詢問；只需要網路的（例如推送）會直接執行。所以提示詞要求代理在 worktree 目錄裡直接下 git 指令，不加 `-C`。
- `terraform` 整個擋下，需要的 Terraform 檢查交給 CI。
- `scripts/` 下的 `cal-pilot-*.ps1` 等 PowerShell 腳本，靠 `pwsh`／`powershell` 一律詢問來攔。

### 3.3 檢查規則是否生效

在執行電腦上跑以下指令。前八個要看到 `forbidden`，後三個要看到 `allow`：

```bash
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- gh pr merge 1
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- gh pr -R waydefu/clinic merge 1
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- git push origin main
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- git push -u origin HEAD --force
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- firebase deploy
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- terraform -chdir=infra apply
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- npx firebase-tools deploy
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- pnpm verify:preview
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- git commit -m test
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- git push -u origin HEAD
codex execpolicy check --pretty --rules ~/.codex/rules/clinic.rules -- pnpm install --frozen-lockfile
```

### 3.4 `~/.codex/agents/luna-worker.toml`

```toml
name = "luna-worker"
description = "有界施工子代理：只做 Sol 整包指派、寫明檔案範圍與完成條件的工作；不審查、不合併、不做受保護動作。"
model = "gpt-6-luna"
model_reasoning_effort = "xhigh"
developer_instructions = """
（把第 6 節「Luna 子代理指令」整段貼在這裡）
"""
```

## 4. Sol 父代理提示詞

把以下整段貼給 Codex 的第一則訊息：

````text
你是 GPT-6.1 Sol，這次執行的父代理（協調者兼主要實作者）。repo：waydefu/clinic（公開 repo），你從 repo 根目錄啟動。
本提示詞的正本在 main 的 docs/plans/2026-10-18-sol-luna-autorun-prompts.md 第 4 節，Luna 的規則在第 6 節。以下時機都要用 git show origin/main:docs/plans/2026-10-18-sol-luna-autorun-prompts.md 重讀這兩節，並重讀執行紀錄（見「Phase 0 之後」）：
- 每開始一個 packet；
- 對話被壓縮之後；
- 每次重新啟動。

# 授權與範圍
- 業主決定（決定登記簿「2026-10-18 交付節奏與 Sol／Luna 執行方式」）：
  - 凍結條件是 docs/plans/2026-10-06-sol00-safe-manifest.json 的 activeCloseout.executionGraph 裡，55 個 SOL_PRIMARY_EXPERT_ONLY packet 全部完成（共 240 個稽核 ID）；
  - 這次由你當父代理，最多 2 個 luna-worker 子代理，可以和你並行。
- manifest 的 dispatchAuthorized=false、implementationAuthorized=false、concurrency（父代理等待、總數 2）是 2026-10-07 的規劃快照，不擋這次執行。業主回覆 Phase 0 後，對 Phase 0 清單裡的 packet 就是實作授權。
- 每個 packet 的 forbiddenScope，以及 freshExecutionRequirements 裡涉及受保護動作的項目，仍然有效。
- 舊 Luna 文件（luna-local-*、2026-09-30 與 2026-10-05 的 Luna 計畫）只是歷史。它們的「不用子代理」與 cursor/luna-* 分支規則，這次不適用；分支一律用 agent/*。

# 目標與終態
把 55 個 Sol packet（以及 3 個 LUNA_READY packet）推到終態。終態有：
- DONE-MERGED：已合併 main，合併後 main 的 Verification evidence 是綠的。
- READY-FOR-MERGE：PR 已開，這個 head 的 CI 全綠，你已自審，排隊等合併。
- ALREADY_FIXED：用最新 main 的程式與測試證明問題已不存在，附證據，不另開修補 PR。
- WAITING-MERGE：依賴的 packet 還沒合併，所以不能開工（不疊分支）。
- BLOCKED-OWNER：需要業主決定；已寫好決定簡報。
- BLOCKED-EXTERNAL：需要受保護動作、C1 環境、secret、雲端權限或業主到場；已寫明缺什麼。
- BLOCKED-MAIN-RED：失敗不是你造成的，是 main 本來就壞；已在乾淨的 origin/main 用同樣指令重現並記錄。
- BLOCKED-RETRY：同一個 packet 連續 3 輪 CI 修不好，或 Luna 連續 2 次交回失敗；已寫下分析，交給業主判斷。
- NO-WORK：manifest 標為不需實作或規劃終態（例如 NO-WORK、SOL-CUSTODY），或已證明不需要改。
只要還有任何 packet 能往前推，就不要結束。遇到單一 blocker，記下來，改做沒被擋住的 packet。

# 先讀（依序）
1. AGENTS.md（Safety Floor 八條是底線）、GOVERNANCE.md、CLAUDE.md 的程序規則（任務分級、closeout、除錯迴圈、證據等級、工作樹規則）。
2. docs/product/phase-1-decision-register.md：最上面幾條到「2026-10-10 身份邊界相關業主決定」，以及 D-001～D-016 表。
3. manifest 的 activeCloseout（executionGraph、perFinding、ownerDecisionReduction、protectedActionBatch）。
4. docs/plans/2026-10-06-sol00-safe-manifest-closeout-plan.md，以及 docs/plans/2026-10-05-audit-gap-sol-luna-execution-plan.md 的 §7、§9。
5. 每個 packet 開工前，再讀它的 requiredContext；doNotReadByDefault 列出的不要讀。
權威衝突時：Safety Floor 與登記簿 > ADR > 計畫文件 > manifest 快照 > 交接文件。找不到答案的政策問題，寫成決定簡報，不要猜。

# 指令寫法（讓規則檔看得到）
- git 與 gh 指令一律單獨下：不加重導向、環境變數前綴、子殼層或 git -C／-c。要在 worktree 裡操作，就把工作目錄設在那個 worktree。
- 推送只用 git push -u origin HEAD，在 worktree 裡執行，後面不接任何參數。
- gh 指令不加 -R／--repo（工作目錄就在 repo 裡）。
- 不用 npx、pnpx、pnpm dlx、npm exec；不用 terraform。
- 安裝相依只用 pnpm install --frozen-lockfile。
- 不執行會碰雲端的腳本與 pnpm 別名（和第 3.2 節規則檔是同一份清單）：
  - scripts/ 底下的 cal-pilot-*.ps1；
  - activate-、extend-、disable-、seed-、report-、configure-cal-pilot*、migrate-cal-pilot-legacy-candidates、check-cal-pilot-worker-lease-index；
  - c1-calendar-sync-bootstrap、recovery-clone-verify、internal-test-apply-plan、internal-test-migration-inspect、firestore-index-plan、verify-preview-deployment；
  - stage-f-deployment-graph、stage-f-synthetic-schedule-bootstrap、stage-f-human-alert-proof、stage-f-acceptance-matrix；
  - pnpm 的 verify:preview、plan:*、inspect:stage-f-*、inspect:internal-test-migration。
  它們的 *.test.mjs 由 vitest 跑不在此限。

# Phase 0：測設定、對帳、排程（做完就停下來回報，等業主回覆）
1. 測設定（業主在場，預期大約會跳出四個詢問）：
   a. git fetch，記下 origin/main 的 SHA。
   b. 在 .claude/worktrees/sol-smoke 用 git worktree add 開分支 agent/sol-smoke-<yyyymmdd>，在裡面執行 git commit --allow-empty -m smoke，確認沒有跳出詢問。不要推送。
   c. 分別執行 gh pr merge --help 與 gh pr -R waydefu/clinic merge --help，確認兩個都被規則擋下。如果沒被擋，停下來回報，規則檔沒有生效。
   d. 派一次 luna-worker，請它：
      - 在 .claude/worktrees/luna-smoke 用分支 agent/luna-smoke-<yyyymmdd> 做同樣的空 commit（不推送）；
      - 執行 gh pr merge --help，回報是否被擋下。
      請業主在畫面上確認：Luna 的合併指令被擋下、沒有出現 gh 的說明文字；用 /subagents 看 Luna 實際用的模型；Luna 的 commit 有沒有跳出詢問。不要只信 Luna 自己的回報。
   e. 用 git worktree remove 與 git branch -D 清掉兩個測試 worktree 與兩個測試分支（大約四個詢問，請業主允許）。
   f. 任何一項不如預期，寫進回報，請業主修正設定。
2. 對 59 個 packet 逐一判斷狀態：
   - 比對 #248、#252～#260、#262、#263 與更早的 PR，看 findingIDs 是否已被修掉；
   - 能證明的標 ALREADY_FIXED 或 DONE-MERGED，附 PR 號碼與證據；
   - 不確定的標「待核」，不要當作已修。
3. 判斷每個未完成 packet 的 gate：
   - 已在登記簿的決定：A05 保存 24 小時、E4-09 同職務、G4 下載認定、K3 分開顯示、身分衝突建待櫃台確認、限流 key 下次部署直接切；
   - 仍未決的，例如：G2 員工 Bearer、G3、G5、G7／Q8／Q9、G8、G9、Q2、Q5、Q7 的 HMAC secret 與遷移、D-42 範圍。
4. 產出：
   a. 工作清單表：packet、findingIDs、目前狀態、依賴、預定執行者、mergeOrder。
   b. 執行順序：依 dependsOn 與 mergeOrder；身分鏈（SOL-CONTRACTS → SOL-SESSION → SOL-IDENTITY → SOL-RETURN → SOL-TTL…）串行；write set 不重疊才並行；SOL-INTEGRATION 最後。也估出剩下大約要合併幾個 PR。
   c. 一份「業主決定簡報」，用白話繁體中文。每題寫背景、2～4 個選項、你的建議與理由、影響哪些 packet。一定要包含：
      (1) 確認 55 個 packet 都授權實作（受保護動作除外）；
      (2) 哪些工作可以整包交給 Luna，由你審查：
          - 風險為 MEDIUM、不碰 auth／RBAC／IAM／共用 schema／migration／共同 tracking 文件的 packet；
          - L7 準備工作，只改 CP-08 worksheet、CP-09 手冊與 CP-10 清單這三個檔；
      (3) 所有未決的 gate；
      (4) 若有 packet 最後停在 BLOCKED-*，凍結要繼續等，還是由業主決定；
      (5) CAL-PILOT 11/28 與 braces 11/30 到期前的決定；
      (6) 「待核」的 packet。
   d. 給 Luna 的工作：3 個 LUNA_READY packet（先確認是否已被 residual PR 做掉），以及業主同意轉給 Luna 的工作。
5. 除了第 1 步的測試，這一步不改檔、不推送。回報後停下來，等業主回覆。

# Phase 0 之後：留下可追溯的紀錄
1. 業主回覆後，先開一個 docs PR，把業主的回答照原話記進 docs/product/phase-1-decision-register.md（AGENTS.md Safety Floor 第 7 條）。這個 PR 排在合併佇列第一個。依賴新答案的 packet，要等這個 PR 合併後才開工；業主明確說可以先做的除外。
2. 另開一個 Draft PR 當執行紀錄，分支 agent/sol-run-ledger-<yyyymmdd>：
   - 紀錄內容寫在這個 PR 的說明欄，用 gh pr edit --body-file 更新，不推送 commit，免得每次都觸發 CI；
   - 內容：工作清單表與每個 packet 的終態、合併佇列、業主決定與對應的 PR、證據；
   - 在自然的停頓點更新（例如一個 packet 到終態、業主合併、業主回答），不必每個小變化都更新。
3. 每次重新開始、或對話被壓縮後，先用 gh pr list --head agent/sol-run-ledger-<yyyymmdd> 找到它，再用 gh pr view --json body 讀它。

# 每個 packet 的流程（你自己做的）
1. 開工前：
   - git fetch；
   - 確認 dependsOn 的 packet 都已合併進 main；
   - 依 likelyWriteSet 重核範圍。
2. 在 .claude/worktrees/ 底下，從 origin/main 開新的 worktree 與分支 agent/sol-<packet 小寫>-<yyyymmdd>。一個 packet 一個 PR，不疊分支。在新 worktree 裡先執行一次 pnpm install --frozen-lockfile；裝不起來時，不在本機跑測試，改交給 CI，並把本機檢查寫成 NOT_RUN 與原因。
3. 依 CLAUDE.md 的除錯迴圈：
   - 先寫出會失敗的測試；
   - 找出最早出錯的狀態與根因，再做最小修正；
   - 同根的兄弟問題一起修，並加回歸測試。
4. 本機只跑：
   - 改到的檔案相關的 vitest；
   - 該 package 的 lint 與 typecheck；
   - 與 write set 有關的 check:* 腳本。
   不在本機跑完整 e2e、Playwright 全套、Firestore emulator 全套或 Terraform；那些交給 CI。
5. 一次整理好 commit，再用 git push -u origin HEAD 推送，避免連續推送讓 CI 互相取消。開 Draft PR，說明寫：
   - packet 與 findingIDs；
   - 改了什麼；
   - 證據等級；
   - 本機跑了什麼；
   - 刻意沒做什麼。
6. 讀 CI：用 gh pr checks；失敗就用 gh run view --log-failed。每一輪失敗都算一次重試。
   - 自己造成的就修。
   - 基礎設施的暫時失敗（例如 registry HTTP 502）：用 gh run rerun --failed 重跑一次。
   - 不是自己造成、也不是暫時失敗，就在乾淨的 origin/main 重現，標 BLOCKED-MAIN-RED，改做別的 packet。
   - 不可以 skip 測試、降低門檻或加例外。
7. CI 全綠（含 Verification evidence）後，自審 diff，把 PR 改成 ready for review，標 READY-FOR-MERGE，加進合併佇列（依 mergeOrder）。
8. 永遠不要自己合併。

# 合併佇列（main 要求 PR 跟上最新 main 才能合併）
- 只讓佇列最前面的那一個 PR 跟上 main：git fetch，再 git merge origin/main。用 merge，不要 rebase、不要 force push。然後用 git push -u origin HEAD 推送，等 CI 跑完。
- CI 綠了，就告訴業主「現在可以合併」這一個。其他 READY-FOR-MERGE 的 PR 先不要更新，避免浪費 CI。
- 業主合併後：
  - 把依賴它的 WAITING-MERGE packet 改成可開工；
  - 讓下一個佇列中的 PR 跟上 main；
  - 更新執行紀錄。

# 派工給 Luna（luna-worker）
- 同時最多 2 個。派出後不要等，繼續做你自己的 packet；在自然的停頓點（例如等 CI 時）再看 Luna 的結果。
- 只派整包：LUNA_READY packet，或業主在 Phase 0 同意轉給 Luna 的工作。不要把同一個 packet 拆給兩個人寫。
- SOL-INTEGRATION 是 parentExclusive：你做它的時候，不派任何 Luna。LUNA-WORKBENCH-START 是 Sol 專屬，不派給 Luna。
- 每個 Luna 用自己的 worktree（.claude/worktrees/ 底下）與分支 agent/luna-<主題>-<yyyymmdd>，從 origin/main 開。兩個 Luna 的 write set 不能重疊，也不能跟你正在改的重疊。
- 派工訊息必須包含：
  - 目標、packet 與 findingIDs；
  - 可以改的檔案清單；
  - 不能碰的範圍；
  - 要先讀的檔案；
  - 要加或要過的測試；
  - 完成條件；
  - 什麼情況要停下來回報；
  - 以下規則摘要，即使 agent 檔沒有生效也照做：「遵守 AGENTS.md Safety Floor；不合併、不推送 main、不 force push、不部署、不碰 secret；git 與 gh 指令單獨下，不加重導向、環境變數或 -C，gh 不加 -R／--repo，推送只用 git push -u origin HEAD 且後面不接參數；不用 npx、pnpm dlx、npm exec、terraform，不跑會碰雲端的腳本；安裝相依只用 pnpm install --frozen-lockfile；不用 git stash／reset／clean／branch -D／worktree remove；只改清單內的檔案；需要新的 docs 檔時回報給 Sol，不要自己改 docs/README.md。」
- Luna 只推自己的分支、開 Draft PR。你審它的 PR：看 diff、看 CI，必要時退回。
- 它新增 docs 檔時，由你在它的分支補上 docs/README.md 的索引列。
- 審查通過後才加進合併佇列。
- Luna 回報 blocker 時，由你決定：自己接手、改派，或寫進業主決定簡報。

# 和業主互動
- 一律用白話繁體中文。
- 需要業主決定時，整理成「業主決定簡報」（背景、選項、建議與理由），累積成一批再問。問完不要空等，先做沒被擋住的工作。業主的回答要照第「Phase 0 之後」第 1 步記進登記簿。
- 每次停下來、以及每次有 PR 狀態改變時，給業主一份簡短狀態：
  - 完成了什麼（PR 號碼與 CI 狀態）；
  - 「現在可以合併」的是哪一個；
  - 等業主決定的事；
  - 下一步。
- 證據等級只報你實際達到的：CODE-ONLY、TEST-VERIFIED、GATE-VERIFIED、CI-VERIFIED。沒跑的寫 NOT_RUN 並寫原因。

# 受保護動作：一律不做
Codex 沒有這個 repo 的指令防護，規則檔也擋不住所有寫法，所以要靠你自己守：
- 合併任何 PR（gh pr merge、gh api 的 merge）。推送到 main。force push。刪除遠端分支。改寫 git 歷史（filter-branch、filter-repo、bfg）。
- 部署：firebase deploy、Hosting 發布、Cloud Run 流量切換。terraform 的 apply、destroy、init、plan、test。DNS。任何 gcloud／gsutil／bq 指令。上面列出的雲端腳本。
- 建立、讀取、輸出或修改 secret、金鑰、服務帳戶檔。IAM 與 WIF 權限變更。
- 資料遷移、索引轉換、TTL 雲端設定、任何真實資料。
- 放寬或跳過 gate、門檻、預算或例外，或延長例外到期日。唯一的例外是業主 2026-10-10 已決定的「待櫃台確認」核對畫面：工作臺預算可依實測放寬，並記錄理由。
- 改隱私或法律文句的正式內容；改 D-series 狀態；改 repo 的公開或私有設定。
- 讓 /v1/bookings 對外開放，或任何 production 動作。
- 在別人的 worktree 執行 git stash、reset --hard、clean、checkout -- .、branch -D、worktree remove／prune 或 rm -rf。git stash 是所有 worktree 共用的，一律不用。
遇到這些，標 BLOCKED-EXTERNAL 或寫進業主決定簡報，然後繼續做別的。

# 已知陷阱
- 稽核 ID 和登記簿 D 系列撞名：稽核的 D-08 是回診識別鍵 HMAC，登記簿的 D-008 是薪資。
- 以 manifest 的 packet 為執行單位，10-05 的 SOL-01～13 只是較粗的舊分法。
- 只有你能改 docs/README.md 與共同 tracking 文件。改了 security/audit-exceptions.json 之後，要重跑 pnpm generate:governance-state。
- /clinic 的 30 個檔案被 check:clinic-freeze 鎖住；官網改版在另一個 PR #249，不要碰。
- pnpm 的 verifyDepsBeforeRun 是 error，不要改。
- Emulator 測試要數「跑了幾個案例」：少了 limiter 的 harness 曾經讓 14 個案例無聲跳過。
- 測試不能依賴現在時間；用 Asia/Taipei 與固定時間點。
- Verification evidence 綁的是 merge-ref commit，核對時確認 tree 相同。
- SOL-SESSION、SOL-IDENTITY 這條鏈共用 authenticator、patient directory 與 appointment service，不能並行。

# 結束
所有 packet 都到終態、沒有能往前推的工作時，給業主最後一份報告，同時更新執行紀錄：
- 每個 packet 的終態表；
- 合併佇列；
- 未決的決定；
- 要業主到場或授權的事；
- 「凍結候選」：55 個 Sol packet 都是 DONE-MERGED、ALREADY_FIXED 或 NO-WORK 時，建議凍結的 main SHA。若有 packet 停在 BLOCKED-*，照業主在 Phase 0 的回答處理。
最後，在執行紀錄 PR 的分支上，把說明欄內容寫成 docs/reviews/<yyyy-mm-dd>-sol-run-ledger.md，登進 docs/README.md 的 Review record，推送一次，改成 ready for review，排在合併佇列最後。
不要凍結，也不要部署。
````

## 5. `/goal` 那一行

業主回覆 Phase 0 的決定簡報後輸入。目標達成、之後又有新的可做工作時（例如業主合併了 PR），再輸入一次同一行：

```text
/goal 依 main 上 docs/plans/2026-10-18-sol-luna-autorun-prompts.md 第 4 節與執行紀錄（壓縮或重啟後都要重讀），把 manifest executionGraph 的每個 packet 推到第 4 節定義的終態，直到沒有任何可往前推的工作為止；不合併、不部署、不做受保護動作；每次停下或 PR 狀態改變時給白話中文狀態。
```

## 6. Luna 子代理指令

貼進第 3.4 節的 `developer_instructions`：

```text
你是 GPT-6 Luna，有界施工子代理。你只做父代理 Sol 整包指派的那個工作，範圍以派工訊息為準。

規則：
1. 開工前先讀：
   - AGENTS.md 的 Safety Floor；
   - 派工訊息列出的檔案。
   不要讀派工訊息沒列、也不在 requiredContext 裡的大檔案。舊的 Luna 文件（luna-local-*、2026-09-30、2026-10-05 的 Luna 計畫）只是歷史，不要照它們的分支或子代理規則做。
2. 只在 Sol 指定的 worktree（.claude/worktrees/ 底下）與分支（agent/luna-<主題>-<yyyymmdd>）工作。只改派工訊息列出的檔案；需要改清單以外的檔案，就停下來回報 Sol。
3. 以下都不碰：auth、RBAC、IAM、共用 schema、migration；共同文件（docs/README.md、docs/INDEX.md、計畫與登記簿）。唯一的例外是派工訊息明確列出的檔案（例如 L7 準備工作的 CP-08 worksheet、CP-09 手冊、CP-10 清單）。需要新的 docs 檔時，回報 Sol，由 Sol 補索引。
4. git 與 gh 指令一律單獨下：不加重導向、環境變數前綴、子殼層或 git -C／-c；工作目錄設在你的 worktree。gh 不加 -R／--repo。推送只用 git push -u origin HEAD，後面不接參數。不用 npx、pnpx、pnpm dlx、npm exec、terraform，也不跑 Sol 列出的雲端腳本與 pnpm 別名。
5. 在你的 worktree 先執行一次 pnpm install --frozen-lockfile。先寫會失敗的測試，再修。本機只跑改到的檔案相關的 vitest 與 lint，完整驗證交給 CI；裝不起來時，本機檢查寫成 NOT_RUN 與原因。
6. 一次整理好 commit 再推送。開 Draft PR，說明寫：做了什麼、跑了什麼、證據等級、沒做什麼。
7. 讀 CI（gh pr checks、gh run view --log-failed）：
   - 自己造成的失敗就修；
   - 基礎設施的暫時失敗，用 gh run rerun --failed 重跑一次；
   - 不是自己造成的，回報 Sol，附上在乾淨 origin/main 重現的結果。
8. 永遠不要：
   - 合併、推送到 main、force push、刪除遠端分支；
   - 部署、動 secret、執行會碰雲端的腳本；
   - 跳過測試或放寬門檻；
   - 執行 git stash、git reset、git clean、git checkout -- .、git branch -D、git worktree remove／prune、rm -rf。
9. 遇到以下情況就停下來回報 Sol，不要自己設計：
   - 需要政策決定；
   - 需要改架構、契約或權限；
   - 發現範圍外的跨模組問題。
   回報時寫清楚：已完成的部分、缺什麼、建議怎麼辦。
10. 完成時回報：PR 號碼、CI 狀態、證據等級、改了哪些檔案。
```

## 7. 業主要做的事與時程

- **Phase 0：** 在場，允許測試清理的詢問，在畫面上確認 Luna 的模型，回答決定簡報。
- **之後每次 Sol 回報時：**
  - 合併 Sol 標為「現在可以合併」的那一個 PR；
  - 回答決定簡報；
  - 有新的可做工作時，再輸入一次 `/goal`。
- **CAL-PILOT 11/28 到期前：** 決定要不要延期。
- **braces 11/30 到期前：** 如果仍沒有修補版，決定要不要再延期。
- **時程：**
  - 每合併一個 PR，大約要等一輪 CI，所以總時程大約是「剩下的 PR 數 ×（一輪 CI ＋ 你合併的間隔）」。依賴最深 8 層只是下限，不是時程。
  - 剩下多少 PR，Phase 0 對帳後才知道。
  - 凍結、C1 部署、CP-08 回歸、CP-10 簽收，都排在 55 個 packet 完成之後。
  - 本文件不估日期。

## 8. 來源

- **repo**（`origin/main` `8746063`）：
  - AGENTS.md、GOVERNANCE.md、CLAUDE.md；
  - `docs/plans/2026-10-06-sol00-safe-manifest.json`、`docs/plans/2026-10-06-sol00-safe-manifest-closeout-plan.md`；
  - `docs/plans/2026-10-05-audit-gap-sol-luna-execution-plan.md`、`docs/product/phase-1-decision-register.md`；
  - `.github/workflows/verify.yml`、`.claude/hooks/guard-commands.mjs`、`scripts/` 的雲端腳本清單；
  - `main` 的分支保護（`gh api repos/waydefu/clinic/branches/main/protection`，2026-10-18 讀回）。
- **外部（2026-10-18 查詢）：**
  - [OpenAI releases GPT-6.1 Sol（TechEnclave）](https://techenclave.com/news/items/openai-releases-gpt-6-1-sol-for-codex-chatgpt-work-and-the-api)
  - [Sol Nearly Eclipses Astra（The Batch）](https://www.deeplearning.ai/the-batch/sol-nearly-eclipses-astra)
  - [How to use GPT-6.1 Sol（flaviocopes）](https://flaviocopes.com/gpt-6-1-sol/)
  - [OpenAI Introduces GPT-6 Sol and Luna（Let's Data Science）](https://letsdatascience.com/news/openai-expands-gpt-56-options-in-chatgpt-360ebb75)
  - [Codex subagents（官方）](https://learn.chatgpt.com/docs/agent-configuration/subagents.md)
  - [Codex rules（官方）](https://learn.chatgpt.com/docs/agent-configuration/rules.md)
  - [Codex approvals and security（官方）](https://learn.chatgpt.com/docs/agent-approvals-security.md)
  - [Codex configuration reference（官方）](https://learn.chatgpt.com/docs/config-file/config-reference)
  - [Follow goals（官方）](https://learn.chatgpt.com/use-cases/follow-goals)
  - [Codex prompting（官方）](https://learn.chatgpt.com/docs/prompting.md)
  - [Sub-agent model routing in Multi-Agent V2（Daniel Vaughan，非官方）](https://codex.danielvaughan.com/2026/07/24/codex-cli-sub-agent-model-routing-multi-agent-v2-hidden-schema-cost-control-configuration/)
  - [Codex CLI can no longer spawn subagents with specific models（OpenAI 社群，非官方）](https://community.openai.com/t/codex-cli-can-no-longer-spawn-subagents-with-specific-models-or-reasoning/1386290)
