# 2026-10-18 Sol／Luna 一路跑完：設定與提示詞

**性質：** 執行說明與提示詞，planning-only。本文件不授權 merge、部署、`terraform apply`、
secret／IAM、資料遷移、TTL 雲端設定、改寫歷史、放寬 gate 或任何 D-series 核准；這些仍依
[決定登記簿](../product/phase-1-decision-register.md)逐次取得業主明確授權。
**依據：** 決定登記簿「2026-10-18 交付節奏與 Sol／Luna 執行方式」條目。
**基準：** 寫於 `origin/main` `8746063`（2026-10-18，#263 合併後），#264 合併後更新（`origin/main` `cee408a`）。
**執行環境：** 業主的 Hermes Agent，實際用的是 Hermes Desktop（桌面版，Windows）；CLI 的終端機是 Git Bash，列為備用。`<HERMES_HOME>` 指 `%LOCALAPPDATA%\hermes`。
若改用 Codex CLI，見[附錄 A](#附錄-a若改用-codex-cli)。
**2026-10-19 更新：** clinic guard 依審查結果修成 2.1 版，再補成 2.2 版（第 3.2 節）；Hermes 的壓縮、輔助任務與 MCP 設定做了效能調整（第 3.1 節）；新增第 3.4 節。
**2026-10-19 夜間更新：** 業主用的是桌面版，第 1 節改寫成桌面版的用法；clinic guard 補成 2.3 版（工具白名單、依對話資料夾判斷範圍）；業主選了「全部工具都經過」，hook 的 matcher 已改成 `.*`（第 3.1、3.2 節），Desktop 要完全結束再重開一次才會生效；`clinic_guard.py` 已核可，`hermes.cmd hooks list` 顯示 `✓ allowed`（10-19 讀回）；第 2.3 節新增「桌面版的對話資料夾」一項。

## 1. 怎麼用（白話）

**開始前：**

1. **先合併這份文件的 PR。** Sol 會從 `main` 重讀第 4 節的規則；對話很長被壓縮後，它才找得回來。
2. **一律用專用資料夾 `sol-run` 開對話，不要用 repo 主資料夾。** 擋指令的 hook 要靠對話的資料夾判斷「現在在診所專案」，`sol-run` 在診所專案底下，符合。業主用的是 Hermes Desktop（桌面版），依下面三小步做：

   **(a) 先把 `sol-run` 更新到最新的 `main`**（要等第 1 步的 PR 合併之後再做，才拿得到合併後的這份文件）。開 PowerShell，兩個指令分開貼：

   ```powershell
   cd "F:\診所專案\beauessence-appointment-platform-fresh\.claude\worktrees\sol-run"
   ```

   ```powershell
   git fetch -q origin; git checkout -q --detach origin/main
   ```

   **(b) 完全結束 Desktop，再重新開啟（只要做一次）。** hook 的 matcher 已經在 2026-10-19 夜間改成 `.*`（你選的「全部工具都經過」，第 3.1 節）。但 matcher 是後端啟動時才讀入，所以要完全結束、再開一次才生效；如果改設定時 Desktop 已經開著，重開之前它還在用舊的 matcher。hook 檔本身每次呼叫都重新執行，之後只改檔案不用重開。Claude 不會代為重啟 Hermes 或 Desktop。

   **(c) 在 Desktop 選（或新增）一個專案（Project），資料夾指到 `sol-run`。** 新對話要在這個專案裡開（第 5 步）。
   - 資料夾是 `F:\診所專案\beauessence-appointment-platform-fresh\.claude\worktrees\sol-run`。
   - 沒有選專案、直接開的新對話，Desktop 視為沒有工作資料夾（"No workspace"）。**這次執行不要用那種對話。**
   - 另一個做法是把 Desktop 設定裡的預設專案資料夾設成 `sol-run`（或診所專案）。那樣所有 Desktop 對話（含沒選專案的）都受 clinic guard 管，補得上下面「殘餘風險」那一項；代價是你平常在 Desktop 做別的事也會被擋。這個設定由你自己決定與操作。

   白話說明：
   - `sol-run` 是同一個 repo 的另一份工作資料夾。每次開跑前都先更新到最新的 `main`，只拿來當對話的資料夾，沒有人會改裡面的檔案。
   - 不用主資料夾的原因：主資料夾目前停在別人舊的分支（`agent/retire-public-mirror`，遠遠落後 `main`），從那裡開對話會載入舊的 AGENTS.md 與舊的技能。
   - **桌面版怎麼知道這是診所專案：** Desktop 只有一個後端程序，用「預設專案資料夾」（沒設就是家目錄）啟動，不會跟著每個對話換資料夾，所以 hook 收到的資料夾不是對話的資料夾。clinic guard 2.3 版改成去讀 Hermes 替每個對話記下的資料夾（`<HERMES_HOME>/state.db` 的 `sessions.cwd`，唯讀），子代理沿用父代理的。選了 `sol-run` 專案的對話，這個資料夾在第一次用工具之前就已記下，所以一開始就在範圍內（第 2.3、3.2 節）。
   - **桌面版不能用 `-t`：** Desktop 沒有「這個對話只開哪些工具」的選項。它讀的是設定檔的 `platform_toolsets.cli`，是全域設定，所有對話共用。所以工具改由 clinic guard 在診所專案範圍內用白名單管：不在名單上的工具一律擋下，顯示 `(protected: tool)`，子代理也一樣。名單共 27 個工具（第 3.2 節）：終端機、讀檔、搜尋、寫檔、patch、行程管理、子代理、待辦、技能（只讀）、查過去對話、向你提問（`clarify`）、網頁搜尋與擷取、看圖，加上三個 MCP 的唯讀工具。
   - 不開的工具和原因（桌面版靠白名單擋，CLI 另外用 `-t` 關，兩者同時有效）：
     - `browser`、`image_gen`、`tts`：這次工作用不到；
     - `computer_use`：可以控制桌面，風險太大；
     - `code_execution`：這次用不到，關掉能少一條可能繞過 hook 的路（見第 2.7 節；即使開著，hook 也一律擋 `execute_code`）；
     - `memory`：會寫進業主全域的 Hermes 記憶，不該讓這次執行去寫；
     - `cronjob`：會留下排程，這次不需要；
     - `connections`：遠端連接器的探索、執行與帳號授權，不該在這次執行裡動用；
     - kanban 與 `start_chat`：這次執行用不到；
     - repomap MCP：profile 自己的 `hermes-coding-efficiency` 技能寫明，RepoMap 在效能測試後已停用（設定檔裡也是關的）。
   - 三個 MCP（serena、context7、codebase-memory）要在 Hermes 設定裡是啟用的才有作用，這三個在 2026-10-19 都已啟用（第 3.1 節）：
     - serena：程式碼查詢，只開唯讀的 4 個工具；
     - context7：查套件文件，2 個工具；
     - codebase-memory：程式碼索引與搜尋，只開 6 個查詢類工具（它會替專案建索引）。
   - **桌面版的 MCP 可能起不來（推論，沒驗證）：** serena 與 codebase-memory 以「工作資料夾」為準，並拒絕家目錄與 Hermes 資料夾，codebase-memory 還要求那是 git 專案的根目錄。桌面版的 MCP 伺服器是跟著後端程序起的，它們看到的可能是後端的資料夾（預設專案資料夾或家目錄），不是對話的 `sol-run`。若是這樣，這兩個會自己退出，工具不出現。不影響這次執行，Sol 會改用 `rg`、`cat`，Phase 0 會看到結果。
   - **殘餘風險：** 沒有專案資料夾、又沒有提到任何診所路徑的 Desktop 對話，不在 hook 的範圍內；它的第一個動作若是 `computer_use`，會被放行。徹底的做法是改設定：把 browser、computer_use 這些工具組從 `platform_toolsets.cli` 拿掉，或用上面 (c) 的第三點把預設專案資料夾設成診所專案。這次執行請只用 `sol-run` 專案的對話。

   **備用：用 CLI 啟動（Git Bash）。** CLI 可以用 `-t` 限定這次對話能用的工具組，沒列的都關掉，子代理繼承同一組；clinic guard 的白名單同樣有效。在 Git Bash 裡，整行貼上：

   ```bash
   cd /f/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/sol-run && git fetch -q origin && git checkout -q --detach origin/main && hermes.cmd -t terminal,file,delegation,todo,skills,session_search,clarify,web,vision,mcp-serena,mcp-context7,mcp-codebase-memory
   ```

   Git Bash 裡沒有 `hermes` 這個指令，只有 `hermes.cmd` 能用（本文其他 Hermes 子指令，例如 `hermes.cmd update`，在 Git Bash 也這樣寫）；PowerShell 可以直接寫 `hermes`。

   CLI 的三個 `mcp-…` 是 MCP 工具組，名字就是 `mcp-` 加上設定檔裡的伺服器名稱；沒啟用的伺服器會被無聲略過。從 `sol-run` 啟動時，serena 與 codebase-memory 認得到工作資料夾；從家目錄或 Hermes 資料夾啟動，這兩個會自己退出，工具就不會出現。
3. **確認 hook 已核可（2026-10-19 已核可，這一步只要看一眼）。**
   - 用 `hermes.cmd hooks list`（PowerShell 可寫 `hermes hooks list`）看 `clinic_guard.py` 那一項。2026-10-19 讀回時，matcher 是 `.*`，並顯示 `✓ allowed`，所以 hook 會執行，不需要再核可。
   - 同一項還會出現一行 `⚠ script modified since approval`（核可之後 hook 檔改過）。**這只是提醒，不會擋，hook 照常執行。** 原因：Hermes 核可時記下 hook 檔的修改時間，之後 clinic guard 補成 2.3 版，檔案時間變了。核可紀錄存在 Hermes 資料夾（`<HERMES_HOME>/shell-hooks-allowlist.json`）。
   - 以後如果又有人改 clinic guard（例如再補一版），開跑前用 `hermes.cmd hooks list` 再看一次：確認還是 `✓ allowed`、matcher 還是 `.*`，並確認那次改動是你或 Claude 做的。
   - 如果哪天（例如 Hermes 更新之後）看到 `✗ not allowlisted`，hook 就不會執行，**請不要開跑**。核可是安全同意的動作，只有你能做（Claude 不會代為設定 `HERMES_ACCEPT_HOOKS` 或改核可紀錄）：用 CLI 核可一次，第一次啟動時按允許；沒有跳出詢問的話，改用 `hermes.cmd --accept-hooks` 啟動。桌面版會不會跳出詢問，沒有確認過。
   - 修改已核可的 hook 檔，**不需要**重新核可：核可紀錄以「事件＋指令」為鍵，這兩項沒變就沿用。`hermes.cmd hooks doctor` 也只會在 hook 檔的修改時間和核可時不同時提出警告，不會擋，也不會要求重新核可。10-19 把 matcher 加上 `read_file`、`search_files`，以及夜間改成 `.*`，改的都是 matcher，不是事件或指令，所以同樣不需要重新核可。
   - 所以 hook 檔被改動時，Hermes 不會停下來問你。代理被明確禁止修改 Hermes 與 hook 設定（第 4 節的硬停止）；看到修改時間的警告時，請確認那是你或 Claude 做的改動。
4. **雲端帳號維持登入**（業主 10-18 決定）。所以部署類動作主要靠 hook 擋，見第 2.7 節。

**開始跑：**

5. 在第 2 步 (c) 的 `sol-run` 專案裡開新對話（不要用沒選專案的對話），輸入 `/model`，確認是 `gpt-6.1-sol`。
6. 把下面這段短訊息貼上送出。Sol 會自己從 `main` 分段讀第 4、6 節；第 4 節就是它的完整指示，所以不用貼整份提示詞（讀不到時，再把第 4 節「Sol 父代理提示詞」整段貼上）。Sol 會先做 Phase 0：測試設定、對帳、整理要你決定的問題。

   ```text
   你是這次執行的 Sol 父代理。先從 main 分段讀 docs/plans/2026-10-18-sol-luna-autorun-prompts.md 的第 4 節和第 6 節：先用 git show origin/main:docs/plans/2026-10-18-sol-luna-autorun-prompts.md | rg -n '^## ' 找行號，再用 sed -n 'A,Bp' 分段印。第 4 節就是你的完整指示，照做。只做 Phase 0，做完停下來回報，等我回覆。
   ```

   Phase 0 這一步你要在場：
   - Sol 和一個 Luna 子代理都會試一次合併指令，兩個都必須被擋下，畫面會出現「BLOCKED by clinic guard (protected: merge)」；
   - 請在畫面上確認 Luna 子代理用的模型是 `gpt-6-luna`；
   - 三個 MCP 是背景啟動的，第一回合可能還沒連上，第二回合起才會出現。請看 Sol 回報有沒有看到 serena、context7、codebase-memory 的工具。這是 10-19 才啟用的設定，還沒有在 `sol-run` 實際跑過；沒出現也不影響這次執行，Sol 會改用 `rg`、`cat` 這些指令。
7. Sol 做完 Phase 0 會停下來回報。你回答決定簡報後，把第 5 節的 `/goal` 那幾行一起貼上送出。

**之後你要做的：**

- Sol 每次停下來、或有 PR 狀態改變時，會用白話回報。
- **合併 PR：** Sol 會標出「現在可以合併」的那一個 PR（已跟上最新 `main`、CI 綠）。你只合併那一個；Sol 再讓下一個跟上 `main`、等 CI 跑完後通知你。每合併一個，大約要等一輪 CI。
- **Sol 停下來的時候**（目標達成、300 輪用完、或在等你）：處理完你那邊的事，輸入 `/goal resume` 讓它繼續。
- **看到「BLOCKED by clinic guard」** 是規則擋下了指令，屬於正常情況。括號裡分兩種：
  - `(protected: …)`：擋下的是受保護動作。Sol 會寫進決定簡報或標 BLOCKED-EXTERNAL，不會換寫法再試。其中 `(protected: tool)` 是用了這次不開的工具，Sol 會改用 terminal 與允許的指令完成工作；
  - `(form)`：不是受保護動作，只是指令寫法不在 hook 允許的範圍（hook 只放行簡單、單純的指令）。Sol 與 Luna 會照訊息改寫成允許的寫法再試，不用你處理。

**名詞小抄：**

- **CI**：GitHub 上自動跑的檢查。
- **packet**：一個工作包。
- **worktree**：同一個 repo 的另一份工作資料夾。
- **hook**：Hermes 每次執行指令前會先跑的檢查程式，這裡用來擋危險指令。
- **白名單（allowlist）**：只有列在清單上的簡單指令才放行，沒列的一律擋下；與「列出要擋的指令」相反。
- **protected／form**：clinic guard 擋下指令時的兩種原因。protected 是受保護動作，記錄後不重試；form 只是指令寫法不被接受，改寫後重試。
- **READY-FOR-MERGE**：PR 的 CI 已全綠、Sol 已自審，排隊等合併。
- **`/goal`**：讓 Hermes 持續工作到達成目標的指令。
- **L7**：Luna 的第 7 組工作，也就是回歸、手冊與驗收清單。
- **braces**：只在開發工具裡用到的套件，有已知弱點，還沒有修補版。
- **Desktop／專案（Project）**：Hermes Desktop 用「專案」決定一個對話的工作資料夾；沒選專案的對話沒有工作資料夾。
- **matcher**：hook 設定裡指定「哪些工具的呼叫要經過這個 hook」的條件；`.*` 表示全部工具。
- **工具白名單**：clinic guard 在診所專案範圍內，只放行名單上的 27 個工具，其餘一律擋下（`(protected: tool)`）。
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
### 2.3 Hermes（依本機安裝的 Hermes Agent 原始碼與文件，2026-10-18 讀取）

- **模型：** 這台的 Hermes 主模型已是 `gpt-6.1-sol`，子代理模型是 `delegation.model: gpt-6-luna`（推理強度 `xhigh`），provider 都是 `openai-codex`。
- **子代理（`delegate_task`）：**
  - 每次呼叫可帶多個 task 並行，同時上限由 `delegation.max_concurrent_children` 決定（這台是 2）；
  - **這個上限不會自動排隊，也不會擋住新的呼叫：** 背景子代理已經到上限時，再呼叫 `delegate_task`，新的這批會改成同步執行，總數因此超過 2，父代理也會被卡住，直到這批做完。所以 Sol 要等上一批 Luna 的完成訊息回來，才能再呼叫；
  - 沒有「每個 task 指定模型」的參數，所有子代理都用 `delegation.model`；
  - 呼叫後會立刻回傳；整批做完後，結果會在之後的回合一次送回。父代理不必空等，也不應該輪詢；
  - 子代理拿得到 repo 的 AGENTS.md，但拿不到父代理的記憶、SOUL 與這份提示詞，所以每個 task 的內容都要附上 Luna 規則；
  - 子代理受同樣的 hook 約束。
  - 來源：`website/docs/user-guide/features/delegation.md`、`tools/delegate_tool.py`。
- **確認提示（approvals）：**
  - 這台的 Hermes 設定是 `approvals.mode: off`。在這個模式下，所有「要求人工確認」的請求都會直接放行（`tools/approval.py` 的 `_run_approval_gate`）；
  - 所以原本的 `<HERMES_HOME>/governance/hooks/authority_gate.py`（它的做法是要求人工確認）在這台實際上不會擋任何東西；
  - hook 回「擋下」（exit 2 加 `{"action":"block"}`）則不受這個模式影響，一定生效。
  - 來源：`agent/shell_hooks.py`、`tools/approval.py`、`website/docs/user-guide/features/hooks.md`。
- **hook 的核可：** 新 hook 要經本人同意才會執行，否則會被略過（`hermes.cmd hooks list` 顯示 `✗ not allowlisted`）。核可紀錄在 `<HERMES_HOME>/shell-hooks-allowlist.json`。這台的 `clinic_guard.py` 已在 2026-10-19 核可，現在顯示 `✓ allowed`。
  - 核可以「事件＋指令」為鍵。已核可的 hook 改檔案內容**不需要**重新核可；`hermes.cmd hooks doctor` 只會在修改時間和核可時不同時提出警告，不會擋，也不會要求重新核可。`hooks list` 上的 `⚠ script modified since approval` 就是這個提醒，hook 照常執行。
- **長時間執行：**
  - `/goal` 每回合結束後由判斷模型決定「完成、繼續、卡住」，預設上限 20 回合，這台已調成 300（`goals.max_turns`）；
  - 目標內容與完成條件會跟著對話保存，壓縮與 `/resume` 後都還在。
  - 來源：`website/docs/user-guide/features/goals.md`。
- **對話壓縮：** `compression.protect_first_n` 現在是 0。10-18 曾調成 3，10-19 的效能調整又改回 0（10-18 之前本來就是 0，其他四個 profile 也一直是 0）。
  - 0 表示第一次壓縮時，開頭的訊息（包含貼上的第 4 節提示詞）就可能被摘要掉，**提示詞不保證一直都在**。10-18 的 3 也只保護到第一次壓縮之前，不是保證；
  - 所以安全網是兩層，缺一不可：第 4 節提示詞要求每次壓縮後、每開始一個 packet 都從 `main` 重讀第 4 節；`/goal` 的 `constraints` 欄（第 5 節）重複寫了最關鍵的硬停止，因為 `/goal` 的內容會跟著對話保存，不會被摘要掉；
  - 壓縮門檻是視窗的一半：有效視窗被設成 272000 token，所以約在 136000 時壓縮（`compression.threshold_tokens` 設的 256000 比這高，沒有作用，沒動）。壓縮一次大約回到 35K～45K，長時間執行會壓縮很多次；
  - 如果想恢復 10-18 的保護，把 `protect_first_n` 改回 3 即可，但它只延後淡出的時間。
- **專案說明檔：** Hermes 只載入一種：repo 有 AGENTS.md 時會載入它，**不會載入 CLAUDE.md**。所以提示詞要求 Sol 自己讀 CLAUDE.md。來源：`website/docs/user-guide/features/context-files.md`。
- **桌面版（Desktop）的對話資料夾**（2026-10-19 夜間讀取）：
  - **後端程序：** Desktop 用 `resolveHermesCwd()` 啟動 `hermes serve`。資料夾的順序是「預設專案資料夾」設定、環境變數 `HERMES_DESKTOP_CWD`、（只有開發版）`INIT_CWD` 與程序目前的資料夾、最後是家目錄。每個 profile 一個後端，不會隨專案或對話重啟；
  - **hook 收到的 `cwd`：** 就是後端程序的資料夾（`Path.cwd()`）。hook 子程序沒有另外指定資料夾，繼承同一個，所以 hook 自己查到的資料夾也一樣。`extra` 只有 `task_id`、`tool_call_id`、`turn_id`、`api_request_id`；
  - **terminal 工具的資料夾：** 來自對話的資料夾，不是後端程序。Desktop 建立對話時把 `cwd` 與 `cwd_explicit` 送給 gateway，gateway 記成對話的工作資料夾，並在第一次呼叫工具之前存進 `state.db` 的 `sessions.cwd`。`workdir` 只有模型自己帶才會有；
  - **選專案：** 要選一個專案，或設定預設專案資料夾。沒選專案的新對話維持 "No workspace"；
  - **舊版 guard 的缺口：** Desktop 在診所專案裡的對話，hook 收到的 cwd 是預設專案資料夾或家目錄，要等指令或路徑提到診所專案才算在範圍內。2.3 版補上了（第 3.2 節）；
  - 來源：`apps/desktop/electron/main.ts`、`agent/shell_hooks.py`、`apps/desktop` 前端的 `use-session-actions/index.ts`、`tui_gateway/session_workdir.py`、`tui_gateway/server.py`、桌面版 README「Projects are the workspace abstraction」。
- **工具：**
  - **CLI：** 啟動時用 `-t` 指定這次對話要開的工具組，沒列的都關掉；子代理繼承父代理的工具組（來源：`website/docs/user-guide/features/delegation.md`）；
  - **桌面版：** 沒有每個對話各自的工具組選項。它讀設定檔的 `platform_toolsets.cli`（環境變數 `HERMES_TUI_TOOLSETS` 可覆寫，`agent.disabled_toolsets` 會扣掉，程式碼模式可能換成 `coding` 加 MCP；`project`、`desktop_ui`、`catalog` 一律加上）。這是全域設定，Capabilities 分頁也是全域，不是每個對話一份。這台的 `cli` 清單包含 browser、computer_use、cronjob、image_gen、tts、memory、start_chat、code_execution。所以桌面版的工具限制只能靠 clinic guard 的工具白名單（第 3.2 節）；
  - 這次要用（CLI 開、桌面版放行）：terminal、file、delegation、todo、skills、session_search、clarify、web、vision，加上 MCP 的 serena、context7 與 codebase-memory；
  - 這次不用（CLI 關、桌面版擋成 `(protected: tool)`）：browser、computer_use（可以控制桌面）、code_execution、image_gen、tts、memory（會寫進業主全域的 Hermes 記憶）、cronjob、connections、kanban、start_chat；repomap MCP 則是設定檔已關（profile 自己的 `hermes-coding-efficiency` 技能寫明，RepoMap 在效能測試後已停用）。
- **MCP 伺服器：**
  - 設定在預設設定（`mcp_servers`）：serena（只開 4 個唯讀工具）、context7（2 個）、codebase-memory（6 個查詢類工具：`search_graph`、`trace_path`、`get_code_snippet`、`get_architecture`、`list_projects`、`check_index_coverage`）。repomap 仍是關的。serena 原本在預設設定是關的，只有其他 profile 開著；`-t mcp-serena` 在它沒啟用時會無聲失效，所以 2026-10-19 已把它在預設設定打開（審查 d1）。codebase-memory 是從 `cbmcanary` profile 照抄過來的設定；
  - 互動式對話（CLI、桌面版）**不會被 MCP 啟動卡住**：連線在背景進行，第一次建立代理最多等 1.5 秒，還沒連上的伺服器會在回合之間補上。所以 serena 光 import 就要 12～15 秒，最壞的情況是前一兩個回合看不到它的工具；
  - serena（經 workspace_guard 包裝）與 codebase-memory（轉接程式自帶守門）都以對話的工作資料夾（`${workspaceFolder}`）為準，並拒絕家目錄與 Hermes 資料夾；codebase-memory 還要求那是 git 專案的根目錄。所以從 `sol-run` 啟動才有用，從別處啟動它們會立刻退出（不會狂重啟，只是工具不出現）；
  - **還沒有在 `sol-run` 實際跑過。** 10-19 套用設定後只做了唯讀檢查（`hermes.cmd mcp list` 顯示三個都是 enabled），沒有實際啟動 serena 與 codebase-memory，所以 `sol-run`（git 的工作資料夾，不是主資料夾）能不能起來，是推論，要看 Phase 0 的結果（第 1 節第 6 步）；codebase-memory 建的索引放在哪裡，也還沒確認；
  - **桌面版的 MCP 可能起不來（推論，沒驗證）：** 桌面版只有一個後端程序，MCP 伺服器是跟著後端起的，它們看到的「工作資料夾」可能是後端的資料夾（預設專案資料夾或家目錄），不是對話的 `sol-run`。若是這樣，serena 與 codebase-memory 會自己退出，工具不出現；不影響這次執行（Sol 改用 `rg`、`cat`），Phase 0 會看到結果；
  - 每個伺服器的閒置回收與連線上限見第 3.1、3.4 節。
- **技能：**
  - repo 的專案技能要先執行 `hermes.cmd skills trust` 才會載入，核可紀錄存在 `skills.trusted_project_dirs`；
  - `sol-run` 已核可，載入 repo 的 8 個技能：closeout、handoff-record、root-cause、verify-gates、ui-check、ui-content、ui-design、ui-motion。它們的優先順序高於 profile 裡同名的技能；
  - profile 會自動載入一個叫 `hermes-coding-efficiency` 的技能，和這次執行有三處衝突：它寫可用最多五個子代理（設定實際限制是 2）、它提到 AI_STATE 檔（這個 repo 沒有）、它描述 start_chat／CBM canary 的交接流程（這次沒有這個流程；codebase-memory 雖然開著，只當查詢工具用）；
  - 業主 2026-10-04 的治理紀錄已把這個技能退役，但它在 2026-10-13 又被重新啟用並改過，所以 Claude 沒有動它，列為業主要決定的事；
  - 治理同步工具回報 `skills.disabled` 偏移，就是這個原因。
- **終端機：** Windows 上的 terminal 工具透過 Git Bash 執行，要用 bash 語法。來源：`website/docs/user-guide/windows-native.md`。

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
### 2.5 執行電腦（2026-10-18 讀回）

- Toshiba Satellite U940：Intel i5-3317U，2 核心 4 執行緒，16 GB 記憶體。讀回時 CPU 已用掉 59%，可用記憶體 4.9 GB。
- C 槽只剩 6.8 GB（2026-10-19 再讀只剩 5.5 GB），Hermes 的紀錄與快取放在 C 槽；專案所在的 F 槽是外接 USB 硬碟，剩 111 GB，讀寫很慢；沒有偵測到電池，必須一直插電。
- 沒有安裝 Docker 與 WSL。
- **結論：** 模型的思考在雲端進行，不吃這台電腦；吃這台電腦的是代理下的指令。所以本機預設不裝套件、不跑測試，驗證全部交給 CI。真的需要本機確認時，整台電腦同時間只跑一個最小的單一測試。跑起來還是太卡的話，Luna 減成 1 個。

### 2.6 到期日

- CAL-PILOT：2026-11-28T04:51:37Z。
- braces 開發工具例外：2026-11-30。沒有修補版時，到期前要業主再決定。
### 2.7 雲端帳號維持登入（業主 10-18 決定）

- 執行電腦已登入 gcloud（含 ADC）與 Firebase。業主決定不登出，由規則把關。
- **防線：**
  1. clinic guard hook 只放行白名單內的簡單指令，受保護的指令直接擋下（第 3.2 節）；
  2. `main` 的分支保護：必須經過 PR、不能 force push、不能刪除；
  3. 提示詞裡的硬停止；
  4. 業主留意合併。
- **殘餘風險：** 2.3 版起 hook 掛在所有工具上（matcher `.*`），診所專案範圍內不在白名單的工具一律擋下（第 3.2 節），所以 MCP 與桌面版專用工具也看得到；白名單內的 MCP 工具只做路徑引數檢查，另有各自的工作資料夾守門（第 2.3 節）。它看不到的有兩類。（1）範圍外的對話：沒有專案資料夾、又沒有提到任何診所路徑的桌面版對話，第一個動作若是 `computer_use` 就會放行（第 3.2 節「已知限制」）。（2）寫進 repo 檔案、之後再被執行的程式碼，例如 `package.json` 的 script（用 `pnpm test` 跑）、用 `node` 執行的 `.mjs` 檔、vitest 測試。寫成程式碼、再透過這些方式間接使用已登入憑證的做法，可能擋不到。這是業主接受的取捨。另有一項已知限制是這次補記的，還沒請業主逐項確認：白名單內的 `web_search`、`web_extract` 不檢查引數，網址可以把資料帶出去（第 3.2 節「已知限制」）。

## 3. Hermes 設定（Claude 於 2026-10-18 套用，2026-10-19 再調整）

### 3.1 設定檔的改動

`<HERMES_HOME>/config.yaml`。每一批改動前都先備份，備份在同資料夾，由舊到新共五份：

| 備份檔 | 備份的是哪個時間點 |
|---|---|
| `config.yaml.20261018-182956-before-clinic-guard.bak` | 2026-10-18 動手之前的原檔 |
| `config.yaml.20261018-after-clinic-guard.bak` | 加完 clinic guard 與各項上限之後、改技能信任（第 3.3 節）之前 |
| `config.yaml.20261018-before-guard-v2.bak` | 把 hook 改寫成第二版（白名單）之前 |
| `config.yaml.20261019-before-perf-tuning.bak` | 2026-10-19 效能調整之前；和下一份（`before-desktop`）的差別就是下面「10-19 效能調整」那一批 |
| `config.yaml.20261019-before-desktop.bak` | 2026-10-19 夜間把 hook matcher 改成 `.*`（桌面版）之前；和現在的差別就是下面「10-19 夜間：桌面版」那一批 |

- 要還原時，把想要的備份複製回 `config.yaml`。只想撤銷 10-19 夜間的 matcher 改動，用最新的那份（`before-desktop`）；想撤銷整個 10-19 效能調整，用 `before-perf-tuning` 那份。較舊的備份不含後來才改的設定（例如技能信任），還原前先比對差異。
- 備份檔留在 Hermes 資料夾，不進 repo。

**10-18 的改動：**

| 設定 | 改成 | 原本 | 為什麼 |
|---|---|---|---|
| `delegation.max_concurrent_children` | 2 | 5 | 業主決定 Luna 最多 2 個；電腦硬體也只撐得住這樣 |
| `goals.max_turns` | 300 | 預設 20 | 讓 `/goal` 能長時間執行 |
| `hooks.pre_tool_call` | 新增 `clinic_guard.py`（`fail_closed: true`，`timeout` 25 秒，排在 `authority_gate.py` 前面）。matcher 原本是 `terminal\|execute_code\|write_file\|patch\|process_manage\|skill_manage\|read_file\|search_files`（後兩個是 10-19 加的；10-19 夜間改成 `.*`，見下面桌面版那一批） | 只有 `authority_gate.py` | 確認提示關閉時仍能擋下危險指令 |

**10-19 效能調整**（依本機設定唯讀稽核，只動這些鍵，不重啟任何程式）：

| 設定 | 改成 | 原本 | 為什麼 |
|---|---|---|---|
| `compression.protect_first_n` | 0 | 3（10-18 曾改成 3） | 長時間滾動的對話，開頭已不相關；其他四個 profile 本來就是 0。代價是提示詞不再受保護，安全網見第 2.3 節 |
| `auxiliary.compression.reasoning_effort` | high | xhigh | 摘要的輸入有上限，不需要 xhigh；xhigh 容易撞到「60 秒沒進展就失敗」的逾時 |
| `auxiliary.compression.no_progress_timeout` | 120（新增） | 預設 60 秒 | 給較慢的摘要多一點餘裕。只影響 Codex Responses 串流，也就是這台的 provider |
| 其他輔助任務的 `reasoning_effort` | `low`：title_generation、approval、mcp、skills_hub、tts_audio_tags、memory_query_rewrite、triage_specifier、profile_describer、voice_chat。`medium`：kanban_decomposer、curator | 全部 xhigh | 輔助任務預設逾時多半只有 30 秒，推理太久會逾時；kanban_decomposer、curator 對品質有影響，只降到 medium。`auxiliary.web_extract` 這版 Hermes 不讀，所以不算在這次的調整裡 |
| `mcp.discovery_concurrency` | 2（新增） | 預設 4 | 電腦只有 2 核心，同時連線的 MCP 不要超過核心數 |
| `mcp_servers.context7` | 加 `idle_timeout_seconds: 900`、`max_lifetime_seconds: 86400` | 無 | 閒置 15 分鐘就回收，最長 24 小時重起；工具保持註冊，下次呼叫時自動重起 |
| `mcp_servers.serena.enabled` | true，加 `idle_timeout_seconds: 600` | false | 讓 `-t mcp-serena` 有作用（審查 d1）。唯讀工具清單與 workspace_guard 包裝沒動 |
| `mcp_servers.codebase-memory` | 新增，`enabled: true`、`idle_timeout_seconds: 600` | 無 | 從 `cbmcanary` profile 照抄（只有路徑，沒有 secret），只開 6 個查詢類工具。它自己的 `--idle-seconds 300` 只收掉內部的索引引擎，不會讓轉接程式退出，所以不會和 Hermes 的 600 秒回收互相拉扯 |

- 不變的設定：`model.default: gpt-6.1-sol`、`delegation.model: gpt-6-luna`（`reasoning_effort` 仍是 xhigh）、`approvals.mode: off`、`compression.threshold_tokens`、`review` 輔助任務（沒有這個鍵）、repomap（仍關閉）。
- 稽核還建議把 `delegation` 的推理強度降到 high，以及調整 `compression.threshold_tokens`（現在沒有作用），這兩項沒套用。
- 套用後的唯讀檢查：`hermes.cmd config check` 無錯誤；`hermes.cmd mcp list` 顯示 serena（4 個工具）、context7（2 個）、codebase-memory（6 個）啟用，repomap 關閉；`hermes.cmd hooks list` 顯示 matcher 已更新。當時 `clinic_guard.py` 還是 `not allowlisted`；之後已核可，現況見下面「10-19 夜間：桌面版」。
- 治理同步工具（`governance/tools/sync.py --check`）在 10-18 的改動後不會判成偏移：它只要求 `authority_gate.py` 排在最後。它回報的 `skills.disabled` 偏移是原本就有的，與這次無關（原因見第 2.3 節「技能」一項）。10-19 的調整之後尚未重跑這個檢查。

**10-19 夜間：桌面版**（業主選定之後才套用；只動這一個鍵，Claude 沒有重啟任何程式）：

| 設定 | 改成 | 原本 | 為什麼 |
|---|---|---|---|
| `hooks.pre_tool_call` 裡 `clinic_guard.py` 那一項的 `matcher` | `.*` | `terminal\|execute_code\|write_file\|patch\|process_manage\|skill_manage\|read_file\|search_files` | Hermes 用完整比對（`re.fullmatch`）工具名稱，`.*` 讓每個工具（含 MCP 與桌面版專用工具）都經過 hook，白名單才擋得到。舊的八個工具 matcher 讓其他工具繞過 hook |

- **業主的選擇：** 業主選了「全部工具都經過」，原話「改成全部工具都經過」。Claude 據此套用 `.*`（Claude 的解讀，未經業主逐項確認：包括 MCP 與桌面版專用工具在內，每個工具呼叫前都先過 clinic guard）。
- **業主接受的代價：** 每個工具呼叫都多跑一次 hook，每次約 0.45 秒（第 3.2 節「速度」）。所有 Hermes 對話的每個工具呼叫都一樣，不只 `sol-run` 的對話；範圍外的呼叫，hook 只是回傳放行。
- **備份：** 改之前先備份成 `config.yaml.20261019-before-desktop.bak`（上面表格的第五份）；要撤銷這一改，把它複製回 `config.yaml`。
- 只改 `matcher`；`command`、`timeout`、`fail_closed` 與 `authority_gate.py` 那一項都沒動。用 ruamel 保留原本的格式改，設定檔前後只有這一行不同。
- hook 的核可紀錄以「事件＋指令」為鍵，這項改動不需要重新核可（第 1 節第 3 步）。
- **套用後的讀回（10-19）：** `hermes.cmd hooks list` 顯示 `clinic_guard.py` 的 matcher 是 `.*`，並顯示 `✓ allowed`（核可時間 2026-10-19）。另有一行 `⚠ script modified since approval`，只是提醒，不會擋；原因是核可之後 hook 檔補成了 2.3 版。
- **還要做一件事：** matcher 在後端啟動時讀入，所以業主要完全結束 Desktop 再重開一次才生效（第 1 節第 2 步）。Claude 不會代為重啟。

### 3.2 clinic guard hook

- **位置：** `<HERMES_HOME>/clinic-guard/clinic_guard.py`，測試在同資料夾的 `test_clinic_guard.py`。這是本機設定，不在 repo 裡。2026-10-18 把第一版「列出要擋的」改寫成第二版的白名單；2026-10-19 依審查找到的 8 項主要與 10 項次要問題修成 2.1 版，之後再依審查補成 2.2 版，10-19 夜間為了桌面版補成 2.3 版（下面兩項）。舊版備份在同資料夾：`clinic_guard.v1.py.bak`（第一版）、`clinic_guard.v2.py.bak`（第二版，2.1 版修改前）、`clinic_guard.v21.py.bak`（2.1 版，2.2 版修改前）與 `clinic_guard.v22.py.bak`（2.2 版，2.3 版修改前）。
- **2.3 版的改動（2026-10-19 夜間，為了桌面版）：**
  1. **工具白名單（只在診所專案範圍內）。** 工具名稱不在 `TOOL_ALLOWLIST` 上，一律 protected，類別是 `tool`，訊息是「the tool 'X' is off for this run」（嘗試 `execute_code` 時另附「改用 terminal 工具與允許的指令」的提示）。共 27 個：
     - 一般工具 15 個：`terminal`、`read_file`、`search_files`、`write_file`、`patch`、`process_manage`、`delegate_task`、`todo_list`、`skills_list`、`skill_view`、`session_search`、`clarify`、`web_search`、`web_extract`、`vision_analyze`；
     - MCP 唯讀工具 12 個，名稱是 `mcp__<伺服器>__<工具>`，伺服器或工具名稱裡的連字號換成底線：
       - serena 4 個：`get_symbols_overview`、`find_symbol`、`find_referencing_symbols`、`search_for_pattern`；
       - context7 2 個：`resolve_library_id`、`query_docs`；
       - codebase-memory 6 個：`search_graph`、`trace_path`、`get_code_snippet`、`get_architecture`、`list_projects`、`check_index_coverage`；
     - 待辦工具在桌面版叫 `todo_list`，不是 `todo`；沒有 `send_message` 這個工具（Hermes 刻意不讓代理呼叫）；
     - 擋下的包括：`computer_use`、`browser_*`（navigate、snapshot、click、type、scroll、back、press、get_images、vision、console、cdp、dialog、exec，以及 `browser_vault_*`）、`image_generate`、`text_to_speech`、`cronjob_manage`、`memory`、`start_chat`、`kanban_*`、`execute_code`、`skill_manage`、`manage_connections`、`manage_catalog`、`desktop_project`、desktop_ui 的工具，以及其他所有 MCP 工具。
  2. **MCP 工具的路徑引數也套用敏感路徑規則**（`relative_path`、`path`、`paths` 等）。
  3. **範圍判斷改強。** 桌面版的 hook 收到的資料夾不是對話的資料夾（第 2.3 節），所以以下任一出現診所專案都算在範圍內：
     - 任何像路徑的工具引數，包括 V4A patch 裡的路徑，以及 `BEAUES~1` 這種短檔名；
     - Hermes 替這個對話記下的工作資料夾：hook 從 `<HERMES_HOME>/state.db` 讀 `sessions.cwd`，子代理沿著 `parent_session_id` 往上找，最多 6 層。唯讀，逾時 0.5 秒；讀不到、沒有紀錄或資料庫打不開，都當成「沒有訊號」，不會擋；
     - 訊息裡的自由文字和其他專案仍然不算。
  4. **matcher 改成 `.*`**，每個工具都經過 hook（見下面「掛在哪些工具上」與第 3.1 節）。
- **2.2 版的改動（2026-10-19，依後續審查補的六項）：**
  1. **家目錄底下一律是憑證區（`credentials`）。** 使用者家目錄底下的任何路徑，不分寫法都是 protected：`~`、`$HOME`、`${HOME}`、`%USERPROFILE%`，以及磁碟機代號開頭、`/c/`、`/mnt/c/`、`//?/` 開頭後面接使用者資料夾的寫法；反斜線與大小寫變化也算。
     - 適用於 `read_file`、`search_files`、`write_file`、`patch`、指令裡的路徑、`>`、`>>`、`tee`、`cp`、`mv`；
     - 例外只有兩個：`AppData/Local/Temp`（和 `/tmp` 同一個資料夾），以及下一項的溢出檔；
     - 登入資料的明確標記另外補上：`.clasprc.json`、`.gemini`、`.copilot`、`.cursor`、`.trae`、`.antigravity*`、`_netrc`、`.pgpass`、`.pypirc`、`.vault-token`、`.cargo/credentials.toml`；
     - 當成輸入檔或訊息檔的路徑也照一般路徑檢查：`git commit -F`、`--file`、`-t`，`gh` 的 `--body-file`、`-F`，`gh api` 的 `--input`、`-F`／`-f body=@檔`。指到家目錄裡的檔案就是 protected。
  2. **溢出檔的唯讀例外。** Hermes 會把太長的指令輸出存成 `<HERMES_HOME>/cache/terminal-output/out-*.log`。只有目前這個使用者的這個資料夾，而且只能讀：
     - 放行：`read_file`、`search_files`、`cat`、`head`、`tail`、`rg`、`grep`、`sed -n`；家目錄的任何寫法都認得；
     - 仍是 protected：`>`、`>>`、`tee`、`cp`、`mv`、`rm`、`jq`、`wc`、`ls`、`write_file`、`patch`；`sed -i` 是 form，一樣擋下；
     - 同一資料夾的其他檔案（例如 `out-1.log.bak`）、Hermes 資料夾的其他路徑，以及別的使用者的家目錄，都仍是 protected；
     - 代理仍應先在指令裡過濾長輸出（`| rg -n …`、`| head -200`），要重讀就用 `sed -n 'N,Mp'` 分段（第 4、6 節都這樣要求）。
  3. **寫入範圍縮小**（取代 2.1 版的「整個診所專案」）。寫入只放行 `F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/**`（`f:\…`、`/f/…`、`/mnt/f/…` 的寫法都認得）、`/tmp` 與使用者的暫存資料夾 `AppData/Local/Temp`。診所專案底下的其他位置一律 protected（`user-config`），包括：`F:/診所專案/CLAUDE.md`、repo 主資料夾、`.claude/settings.local.json`、`.claude/hooks`、`診所倉儲`、舊副本資料夾、公開鏡像資料夾。
     - 相對路徑照 terminal 的 `workdir` 或前面的 `cd` 解析；兩者都沒有時，當成在 worktree 裡面解析；從 worktree 往上爬出去的（例如 `../../CLAUDE.md`）會被擋；
     - commit 說明與 PR 說明檔一樣放在 `/tmp/<不重複的名稱>`，不放進 repo 或 worktree（第 4、6 節都這樣寫）。
  4. **拼接寫法先正規化，再做路徑檢查。** `${V:-x}`、`${V-x}` 換成 `x`；`$V`、`${V}` 去掉；`{a,b}` 展開成各個選項。所以 `${X:-.env}`、`${X-.env}`、`.e${Z}nv`、`$Z.env`、`~/.npmrc$Z`、`{.env,x}`、`{a,.env}`、`~/{a,b}` 都照一般路徑擋下；寫入時 `{a,.git}` 也一樣。
     - Windows 短檔名：寫入時 `GIT~1`、`git~2` 視同 `.git`，相對路徑（`GIT~1/hooks/x`）也一樣；
     - 讀的檔案內容看不到的選項改判 form：`jq -f`、`-nf`、`--from-file`，以及 `sort`、`wc`、`du` 的 `--files0-from`；`jq . 檔`、`sort 檔` 照常放行；
     - 指令名稱本身被拼接（例如 `fire${X}base`）一律是 form，不是 protected；一樣擋下。
  5. **名稱過濾的值不當路徑。** `--exclude*`、`--exclude-dir*`、`--include*`，以及反向的 `-g`／`--glob`（值以 `!` 開頭）的值，不做路徑檢查，所以 `grep --exclude='.env*' .` 放行。真正的檔案運算元仍然檢查：`grep foo .env`、`rg -g '!x' foo .env` 是 protected，沒有 `!` 的 `-g '.env'` 也是。
  6. **`command -v` 與雲端腳本。**
     - `command -v`、`type` 探測 `node`、`tsx`、`git` 是 form（訊息是「this run does not probe tools」），改用 `which`，或直接執行該工具；探測 `firebase`、`gcloud`、`curl`、`hermes`（含 `type -p gcloud`）是 protected；
     - 會碰雲端的腳本（第 4 節提示詞列的清單，例如 `scripts/seed-cal-pilot.mjs`、`scripts/phase0-snapshot.mjs`）：`cp`、`mv`、`rm`、`git add`、`git restore` 這類編輯動作，在寫入範圍內放行；另一邊在寫入範圍之外（例如 `cp` 到家目錄）則是 protected。執行它們是 protected（`cloud`），包括 `node`、`tsx`、`node --check`、`pnpm exec node --check`。
- **作用範圍：** 只在診所工作區生效，也就是以下任一情況：
  - Hermes 的後端程序或 hook 收到的資料夾是診所專案；
  - Hermes 替這個對話記下的工作資料夾（桌面版選的專案）是診所專案；讀不到就當沒有這個訊號，不擋（2.3 版）；
  - 指令的工作目錄、檔案路徑引數（包括 V4A patch 裡的路徑與 `BEAUES~1` 這種短檔名）或指令內容提到診所專案；
  - 同一個對話先前已經碰過診所專案。
  訊息裡的自由文字與其他專案不受影響。
- **掛在哪些工具上：** 所有工具。`hooks.pre_tool_call` 的 matcher 是 `.*`（Hermes 對工具名稱做完整比對 `re.fullmatch`；每個工具呼叫都經過 `_dispatch_authorized_once`，所以每個工具都會到 hook）；`timeout` 25 秒，`fail_closed: true`。2.2 版以前的 matcher 只列 terminal、execute_code、write_file、patch、process_manage、skill_manage、read_file、search_files 八個工具，其他工具（包括 MCP 與桌面版專用工具）完全繞過 hook。在診所專案範圍內，工具先過白名單，名單上的再依各自的規則檢查（下面「允許的指令」）；範圍外的呼叫，hook 輸出 `{}` 放行。
  - `read_file`、`search_files` 是 10-19 才加上的。之前讀檔工具完全不經過 hook，Hermes 自己的讀檔黑名單又只涵蓋 Hermes 的憑證與 `.env`，所以憑證檔其實讀得到；現在這兩個工具的 `path`、`file_glob`，以及檔名搜尋時的 `pattern`，都套用下面的敏感路徑規則。內容搜尋的 `pattern` 是正規式，不檢查；`path` 是家目錄或磁碟根目錄也擋（protected）。2.2 版起，家目錄底下的任何路徑都擋，只有溢出檔可讀（上一項的第 1、2 點）。
  - 所以本節講憑證與敏感路徑的規則，現在對 terminal 與這兩個讀檔工具都成立。
- **做法是白名單：** 只放行列在清單上的簡單指令，其餘一律擋下。terminal 指令依序過三關：
  1. **寫法檢查（先做）：** 以下寫法一律判 form：
     - 反引號、`$(…)`、`<(…)`、`>(…)`、`<<<`、`$'…'`；
     - 沒加引號的括號、單字中間的 `#`、結尾或背景執行的 `&`；
     - 接收端不是 `cat > 檔`、`cat >> 檔`、`git commit -F -` 的 heredoc，以及引號或註解裡的 `<<`。放行的 heredoc，本文不當成指令檢查；但結束字沒加引號時，本文會被 shell 展開，所以本文裡的 `$(`、反引號與機密變數仍會被擋（form）。

     重導向（`>`、`>>`、`<`、`&>`、`>&N`）會被拆開，目標路徑另外檢查（寫入範圍見下面「寫入範圍」一項）。
     - `/dev/null`、`/dev/stdin`、`/dev/stdout`、`/dev/stderr` 沒問題；
     - 導向 `/dev/tcp`、`/dev/udp` 是在對外連線，是 protected（`network`），`/dev/./tcp` 這類繞過寫法也算；其他 `/dev/*` 的寫入是 protected（`system`）。

     路徑裡的反斜線當成 `/`（Windows 路徑）；但單引號裡的 sed 腳本不改寫，保持原樣再檢查。

  2. **指令開頭必須在允許清單上：** 沿用 `authority_gate.py` 的邏輯把指令拆成簡單指令（可以用 `&&`、`;` 串接，或用管線），再看每一段的開頭（取檔名、轉小寫、去掉 `.exe`、`.cmd`）。
     - 開頭可以有環境變數，但只限 `COREPACK_ENABLE_DOWNLOAD_PROMPT`、`pnpm_config_verify_deps_before_run`、`CI`、`FORCE_COLOR`、`NO_COLOR`、`TZ`、`NODE_ENV`、`GIT_PAGER`、`PAGER` 這 9 個，且 `PAGER`、`GIT_PAGER` 的值只能是空、`cat`、`less`、`more`；
     - 不認識的開頭是 form；`for`、`while`、`if` 等 shell 關鍵字，以及 `eval`、`exec`、`source`、`.` 也是 form；
     - 雲端、憑證、代理、網路、系統類的指令（gcloud、firebase、terraform、curl、ssh、hermes、codex、sudo 等）是 protected；
     - 藏在 `bash -c`、`eval`、`xargs`、`find -exec`，或 `timeout`、`nohup`、`sudo`、`command` 後面的受保護動作，仍然判成 protected。
  3. **受保護動作檢查（最後做）：** 對清理過的指令再跑一次 `authority_gate.evaluate`，有任何發現就是 protected。Phase 0 測試 worktree 的清理是例外，會放行；`authority_gate` 自己查 HEAD 的功能被關掉，不會從 hook 所在的資料夾去判斷。
- **兩種擋法：** 訊息都以 `BLOCKED by clinic guard` 開頭，並附英文與中文各一行說明；結尾附上指令的前 160 個字元。

  | 種類 | 訊息開頭 | 意思 | 代理該怎麼做 |
  |---|---|---|---|
  | 受保護動作 | `BLOCKED by clinic guard (protected: <類別>)` | 這是受保護動作 | 記成 BLOCKED-EXTERNAL，或寫進業主決定簡報；不要換寫法重試 |
  | 寫法不被接受 | `BLOCKED by clinic guard (form)` | 不是受保護動作，只是指令的寫法不在允許範圍；訊息一定指出有問題的那一段（`Offending part`） | 照訊息改寫成允許的簡單指令（單一指令，或只讀工具的管線；也可以用 `&&`、`;` 串接），再試 |

  - protected 的類別：`merge`、`cloud`、`credentials`、`environment`、`agent-cli`、`network`、`remote-access`、`system`、`shell`、`push`、`worktree`、`history`、`config`、`hooks`、`github`、`exec`、`deploy`、`data`、`migration`、`publish`、`secrets`、`visibility`、`tool`、`process-input`、`user-config`、`guard-error`；
  - 其中 `data`、`migration`、`publish`、`secrets`、`visibility` 五類來自 `authority_gate.py` 的規則：`data` 是資料庫資料的變更，`migration` 是資料庫或 schema 遷移，`publish` 是發布套件、容器映像或 GitHub release，`secrets` 是建立或變更機密與登入資料，`visibility` 是 repo 公開、私有或所有權的變更；
  - `tool` 是 2.3 版新增的：呼叫的工具不在白名單上。`execute_code` 與 `skill_manage` 以前各有自己的類別（`execute_code`、`skill`），現在也歸在這裡；
  - hook 自己出錯時是 `(protected: guard-error)`，結束碼 2。
- **允許的指令：**
  - 唯讀工具：`cat`、`head`、`tail`、`wc`、`ls`、`pwd`、`cd`、`echo`、`printf`、`grep`、`rg`、`sort`、`uniq`、`cut`、`tr`、`diff`、`cmp`、`comm`、`basename`、`dirname`、`realpath`、`readlink`、`file`、`stat`、`du`、`df`、`date`、`true`、`false`、`test`、`[`、`which`、`jq`、`tree`、`xxd`、`od`、`sha256sum`、`sha1sum`、`md5sum`、`sleep`（60 秒以內）；
  - 會寫出檔案的選項不放行：`sort -o`／`--output`、`uniq 輸入 輸出`、`xxd -r` 或帶第二個檔、`tree -o`、`git … --out*`（例如 `git log --output=…`）都是 form；輸出檔在寫入範圍之外或在 `.git` 裡時，先判成 protected（`user-config`、`system` 或 `worktree`）；
  - `sed` 只放行這幾種寫法：`-n 'N,Mp'`、`'Np'`、`'$p'`、`'/字串/p'`，以及純文字的取代 `s<分隔字元>字串<分隔字元>字串<分隔字元>`（旗標只能是 `g`、`p`、`i`、`I`；分隔字元只能是 `/ | # , : @ %`；腳本裡不能有反斜線）。其他一律 form：任何 `e`、`w`、`r`、`W`、`R` 指令或旗標、自訂的位址分隔字元、`-i`、`--in-place`、`-f`、`--file`、縮寫或不認識的長選項，以及沒加 `-n` 的印出腳本。測試用真的 GNU sed 驗證過：放行的寫法只會印出，被拒絕的 `w` 腳本真的會寫檔；
  - `find`：不能用 `-exec*`、`-ok*`、`-fprint*`、`-fls`、`-delete`；
  - `rg`、`grep`、`git grep`，以及 `git log／diff／show` 的 `-S`／`-G`／`--grep`／`--author`／`--committer`：搜尋字串（pattern）不當路徑檢查，所以 `rg -n 'process\.env' src` 這類常見搜尋可以直接下。`jq` 的過濾式也不檢查。`rg`、`grep` 的 `-f` 值是樣式檔，仍然當路徑檢查；
  - 檔案工具：`mkdir`、`touch`、`cp`、`mv`、`tee`、`rm`（寫入範圍見下面「寫入範圍」一項）。`rm -rf /tmp/<名稱>` 放行；`rm -rf /tmp` 與 `rm -rf /tmp/*` 不行；
  - `git`、`gh`、`pnpm`、`corepack pnpm`、`npm`（只有 `--version` 與 `run`）、`node`、`tsx`，各有子規則：
    - git 只放行常用的子指令；沒列的（例如 `rebase`、`cherry-pick`、`revert`、`rm`、`mv`、`symbolic-ref`）是 form。
      - 唯讀的 `for-each-ref`、`show-ref`、`check-ignore`、`name-rev`、`cherry` 放行；`ls-remote` 只接受設定好的遠端名稱；
      - `git pull` 是 form，訊息提示「use git fetch then git merge」；
      - `git fetch` 只接受遠端名稱與單純的分支名。含 `:` 或 `+` 的 refspec（例如 `main:main`、`+main:main`）和 `-f`／`--force` 都是 protected，因為它們能覆蓋沒有簽出的本機分支；
      - `git grep` 的選項是白名單（`n i l c w E F P v I h H a o q z W p L`、`-e`、`-A`、`-B`、`-C`、`--max-depth`、`--no-index`、`--cached` 等）。任何含 `O` 的短選項群組（`-O` 會執行外部程式，`-nOsh` 也算）、`--open-files-in-pager*`，以及其他沒列的選項，都是 form；
      - `git config` 只能讀值；`git remote` 只能查看；
    - gh 只放行 `waydefu/clinic` 的唯讀與 PR、CI 指令，例如 `pr view／list／checks／diff／create／edit／ready／comment`、`run list／view／download／rerun／watch`。
      - `gh api` 與 `pr`、`run` 的子指令（合計 16 個），旗標都是各自的白名單；附值寫法（`-ftitle=x`、`-Ftitle=x`、`-f=title=x`、`--header=…`、`-XPUT`）與短旗標群組都會拆開檢查，長旗標用「唯一前綴」解析；不認識的 `--field*`、`--raw-field*`、`--input*`、`--method*`、`--header*` 是 protected。URL 與 `-R` 必須指向 `waydefu/clinic`，`gh repo view` 的目標也一樣；
      - **`gh api` 的範圍**只有四種路徑：`repos/waydefu/clinic/…`、`graphql`（只能查詢）、`rate_limit`、`user`。而且只能讀：不能帶 `-f`／`-F` 欄位（要查詢就把參數寫在網址裡）、不能用 `--input`、不能用非 GET 的方法或覆寫方法的標頭、不能指定別的主機（`--hostname=` 的附值寫法也會檢查）。完整 URL、`..`、`%2e` 編碼的路徑、`{owner}` 這類佔位符都不放行；
      - `gh auth status` 只能看狀態：旗標群組裡有 `t`，或帶 `--show-token*`，是 protected（會印出 token）；
      - `gh pr close`、`gh pr reopen` 是 protected，類別 `merge`；
      - `gh pr checkout`、`gh label list`、`gh repo clone`、`gh browse`、`gh run cancel`，以及 `gh api -X GET … -f` 不是受保護動作，是 form，訊息附有改寫提示；要看某個分支的內容，可以改用 `git fetch` 加 `git worktree add`；
    - pnpm 不接受 `--registry`、`--userconfig`、`--globalconfig`、`--config.*`，也不接受指令前面不認識的旗標（form）；每一個位置參數（包含 `--` 之後的）都會檢查是不是會碰雲端的別名。`pnpm add -g`、`pnpm dlx` 是 protected；`playwright install`（會下載瀏覽器）是 form；`pnpm add` 加網址、git 規格或 `user/repo` 是 form；
    - node 與 tsx 的腳本必須是**相對路徑**，不含 `..`，不在 `node_modules` 底下，而且終端機的 `workdir`（或前面的 `cd`）要在診所工作區內，腳本才算落在 repo 裡。
      - 絕對路徑或落在 repo 外的腳本是 protected（`exec`）；腳本在 `node_modules` 底下、路徑又點名雲端 CLI（例如 firebase-tools）時，是 protected（`cloud`）；含 `..` 是 form；
      - `--env-file`、`--env-file-if-exists` 一律 form，檔案是敏感檔時則是 protected；
      - 只接受少數旗標（例如 `--no-warnings`、`--max-old-space-size=`、`--test-*`）加一個腳本檔；`-e` 等執行內嵌程式碼的寫法是 protected（`exec`）。
- **寫入範圍（2.1 版新增，2.2 版縮小）：** 所有「會寫東西」的目標，都必須落在 `F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/**`、`/tmp` 或使用者的暫存資料夾底下（細節與不放行的位置見上面「2.2 版的改動」第 3 項），否則 protected：診所專案裡的其他位置是 `user-config`，使用者家目錄底下依位置判成 `credentials` 或 `user-config`，其他地方是 `system`。
  - 適用於：重導向（`>`、`>>`、`&>`）、`tee`、`cp`（目的地；用 `-t` 時是每個運算元）、`mv`（每個運算元）、`mkdir`、`touch`、`rm`、`git worktree add <路徑>`、`gh run download -D`，以及 `write_file`、`patch`（含 V4A 內文的路徑）；
  - 相對路徑照 terminal 的 `workdir` 或前面的 `cd` 算。已知的資料夾在寫入範圍之外，就是 protected；不知道資料夾時，當成在 worktree 裡面解析，所以往上爬出 worktree 的路徑（例如 `../../CLAUDE.md`）一樣擋下；
  - 用變數組出來的路徑（例如 `$TMPDIR/x`）是 form；
  - `/tmp` 在 Git Bash 裡就是 Windows 的暫存資料夾，它在使用者資料夾底下的另一種寫法也認得。那裡的檔案不在 repo 裡，`git add -A` 不會 commit 到；
  - **commit 說明與 PR 說明的檔案放 `/tmp/<不重複的名稱>`**（例如 `/tmp/sol-<packet>-commit.txt`、`/tmp/sol-<packet>-pr.md`），不要放在 repo 或 worktree 裡。用 `write_file` 或 `cat > /tmp/… <<'EOF'` 寫，再用 `git commit -F /tmp/…`、`gh pr create --body-file /tmp/…`、`gh pr edit --body-file /tmp/…`；`git commit -F - <<'EOF'` 也可以。用完可以 `rm -f /tmp/<檔名>` 清掉。
- **推送：** 只放行 `git push [-u] origin agent/<分支名>`，不接受其他旗標。
  - **為什麼一定要明寫分支名：** 寫 `HEAD` 或不寫分支時，hook 得先知道現在在哪個分支，確定是 `agent/*` 才放行。但 hook 看不到終端機目前所在的資料夾，只能從 `git -C <路徑>`、同一行前面的 `cd <路徑>`，或 terminal 的 `workdir` 判斷。這些都沒有時（例如在 detached 的 `sol-run` 下指令），HEAD 無法檢查，就當 form 擋下，並提示「write the branch name: git push -u origin agent/<name>」。所以第 4、6 節的推送指令都明寫分支名，不用 `HEAD`（附錄 A 是改用 Codex 時的另一套規則，不在此限）；
  - protected：別的遠端或網址；`來源:目的` 形式的 refspec；以 `:` 或 `+` 開頭的 refspec；目標不是 `agent/*`（包含 `main`）；`--force*`、`-f`、`--delete`、`-d`、`--mirror`、`--all`、`--tags`、`--no-verify`、`--prune`、`--follow-tags`，連縮寫（例如 `--forc`）也算；
  - form：其他旗標（例如 `--dry-run`、`-n`）；單獨寫的 `refs/heads/…`；`HEAD` 解析得出來、但不是 `agent/*` 分支。
- **毀掉工作的 git 指令，在任何地方都擋下**（protected），不分自己的或別人的工作資料夾：`git reset --hard`（含 `--merge`、`--keep`）、`git clean`、`git stash`（只放行 `list`、`show`）、`git checkout -- .`、`git restore .`、`git branch -d／-D／-m／-M／-c／-f`、`git worktree remove／prune／move`、`find -delete`，以及對 `.claude/worktrees` 底下路徑的 `rm -r`。
  - `..` 也算整棵樹：`git restore ..`、`git checkout origin/main -- ..` 一樣擋下；
  - 還原單一個會碰雲端的腳本（`git checkout -- <腳本>`、`git restore <腳本>`）是允許的，只擋「執行」那些腳本；
  - 唯一的例外是 Phase 0 的測試：路徑結尾是 `.claude/worktrees/sol-smoke` 或 `luna-smoke` 的 `git worktree remove`，以及名稱符合 `agent/sol-smoke-<8 位日期>`、`agent/luna-smoke-<8 位日期>` 的 `git branch -D`；
  - 所以 Sol 刪不掉做完的 worktree，它會把清單列在最後報告裡，由業主清理（第 7 節）。
- **其他會擋成 protected 的主要類別：**
  - 合併、關閉、重新開啟 PR（`merge`）；`gh api` 的寫入呼叫或範圍之外的呼叫，以及 gh 的 secret、auth（`status` 除外）、alias、release、workflow 寫入類指令（`github`）；
  - 雲端與部署（`cloud`、`deploy`）：gcloud、firebase、terraform 等，包含透過 npx、`pnpm dlx`、`pnpm exec` 的寫法；repo 裡會碰雲端的腳本與 pnpm 別名，只擋執行（含 `node --check`）；在寫入範圍內可以修改、複製、移動、刪除、還原與 commit（「2.2 版的改動」第 6 項）。腳本清單 10-19 補上 `scripts/phase0-snapshot.mjs`（它會呼叫 `gcloud` 與 `firebase`）；`scripts/` 裡其他腳本檢查過，沒有再多會碰雲端的；
  - 憑證與設定（`credentials`、`config`、`user-config`）：ADC、gcloud、firebase、Hermes、Codex、SSH 的讀寫；讀寫使用者家目錄底下的任何路徑（系統暫存資料夾與溢出檔除外，2.2 版起，見「2.2 版的改動」第 1、2 項）；`cd` 或 `workdir` 落在敏感資料夾、家目錄或磁碟根目錄；`git config` 的寫入；`--no-verify` 與 hook（`hooks`）。2.1 版把「家目錄」的認法補完整：
    - 家目錄的各種寫法都認得：Windows 的磁碟機代號開頭、`/c/`、`/mnt/c/`、`//?/`、`//./`、UNC 的 `c$` 共用，後面接使用者資料夾；另外有 `/Users/<名稱>`、`/home/<名稱>`、`$HOME`、`$HOMEPATH`、`~`、`%USERPROFILE%`。之前只認得 `~` 與 `$HOME`；
    - 家目錄底下的路徑，2.1 版起只要含萬用字元或方括號（`*`、`?`、`[`）就是 protected；2.2 版起不論有沒有萬用字元，一律 protected（「2.2 版的改動」第 1 項）；
    - 敏感標記新增 `.aws`、`.azure`、`.kube`、`.docker`、`.gnupg`、GitHub CLI 在 Windows 的設定資料夾，以及 Chrome、Edge、Firefox 的設定檔資料夾；
    - 對 `.config` 或應用程式資料資料夾做遞迴的 `rg`、`grep`、`find`、`git grep --no-index` 是 protected；`cd` 進敏感資料夾也一樣；
    - 系統暫存資料夾的 `Local/Temp` 寫法視同 `/tmp`；
  - `env`、`printenv`、`set`、`export`（`environment`）；另外 `echo`、`printf` 印出名稱含 TOKEN、KEY、SECRET、PASS、CRED、AUTH、URL、DSN 的變數，以及讀 `/proc/*/environ`，也是 `environment`；
  - 其他程式（`agent-cli`、`network`、`remote-access`、`system`、`shell`）：hermes、codex、curl、ssh、sudo、PowerShell、cmd 等；
  - 改寫歷史（`history`）；執行內嵌程式碼，例如 `node -e`（`exec`）；寫入 `.git` 內部（`worktree`）。
- **其他工具：**
  - `execute_code`、`skill_manage`：2.3 版起不在工具白名單上，一律 protected（`(protected: tool)`）。`skill_manage` 會改全域技能，這次執行中不改技能；
  - `process_manage`：`list`、`poll`、`log`、`status`、`wait`、`kill`、`handoff` 放行；`write`、`submit`、`stdin`、`close`、`send`、`input` 這些輸入類動作，以及其他沒列的動作、沒寫 action 的呼叫，都是 protected（`process-input`）。對跑著的程序輸入，等於繞過指令檢查；
  - `write_file`、`patch`：套用敏感路徑規則與 `.git/` 規則，檢查 `path`、`file_path` 等欄位。`patch` 的內文（V4A 格式）裡，`*** Add File:`、`*** Update File:`、`*** Delete File:`、`*** Move to:`、`*** Move File: a -> b` 的每個路徑也同樣檢查。寫入的目標另外受「寫入範圍」限制（只能在診所工作區或 `/tmp`）；
  - `read_file`、`search_files`（10-19 起）：對 `path`、`file_glob`，以及檔名搜尋時的 `pattern` 套用敏感路徑規則；`path` 是家目錄或磁碟根目錄時 protected。
- **沿用與失敗時的處理：**
  - 拆解指令的邏輯沿用原本的 `authority_gate.py`；它認出的類別，在診所工作區一律改成擋下（protected）；
  - 在診所工作區內，hook 自己出錯時也擋下（fail-closed）；
  - 輸入與輸出都固定為 UTF-8。否則 Windows 會把「診所專案」讀成亂碼，造成判斷失敗而全部放行。
- **測試：** 2.3 版有 166 項測試方法（2.2 版的 141 項加新增 25 項），全部通過（`unittest test_clinic_guard`）。表格形式的案例逐列斷言，2.2 版共 3,437 列，每列寫明預期的結果與種類（放行、form 或 protected）。2.1 版是 108 項（原有 82 項加新增 26 項）與 2,413 列（原本 1,518 列）。涵蓋：
  - 第一版仍有效的案例，以及審查中找到的各項弱點；
  - 在真實的暫存 git repo 上做 detached HEAD 的推送、用 `workdir` 解析 HEAD、`cd` 與 `git -C` 的追蹤；
  - process_manage、skill_manage、V4A patch；
  - Windows 反斜線與環境變數路徑；
  - 端到端的子程序執行，包含以原始位元組送出的 UTF-8 與格式錯誤的輸入；
  - 2.1 版新增：sed、`git grep`、gh 旗標、node 腳本、家目錄寫法、`/dev/tcp`、寫入範圍等。其中 sed 的測試用真的 GNU sed 確認放行的寫法只會印出、被拒絕的 `w` 腳本真的會寫檔；
  - 2.2 版新增：家目錄的各種寫法、溢出檔的讀與寫、縮小後的寫入範圍、拼接與大括號展開、名稱過濾、`command -v`、雲端腳本的編輯與執行。測試表之外，另外對 `decide` 與 `check_terminal` 跑了約 330 條新探測，並有 10 次經過 `main()` 的端到端實跑（見下面「速度」）。探測腳本放在 Claude 的暫存資料夾，不在 repo。
  - 2.3 版新增 25 項：工具白名單（名單上的放行、名單外的擋下，兩個方向都測）、MCP 的路徑引數、從 `state.db` 讀對話資料夾（含沿 `parent_session_id` 往上找、唯讀、讀不到時不擋）、V4A patch 路徑與短檔名的範圍判斷。測試用暫存資料庫，沒有開過真實的 `state.db`；全部跑完約 56 秒。

  2.1 版當時驗證新測試真的抓得到舊問題：把這 26 項新測試拿去跑第二版的備份，全部失敗（417 個失敗、12 個錯誤）。另外：
  - 對真實的 `sol-run` 實測（第二版時做的）：它是 detached，所以寫 `HEAD` 的推送得到 form 擋下；
  - 模糊測試：第二版約 40 萬條指令；2.1 版 6 萬條變異指令，每條各用有、沒有 `workdir` 跑一次，兩次都沒有當機；
  - 誤擋檢查：119 條日常指令，有、沒有 `workdir` 各跑一次，一條都沒被誤擋；審查列出的誤擋範例也都放行了。

  用 Hermes 的 Python 在 hook 資料夾執行：

  ```bash
  ../hermes-agent/venv/Scripts/python.exe -m unittest test_clinic_guard -v
  ```

- **速度（2.3 版）：** 每次 hook 呼叫約 0.42～0.53 秒，和 2.2 版的 0.41～0.51 秒相近；單是啟動 Python 就要 0.27～0.37 秒。量測用 5 萬列的合成資料庫，沒有開真實的 `state.db`。matcher 改成 `.*` 之後，所有 Hermes 對話的每個工具呼叫都要付這個成本（約 0.45 秒，業主接受）。
- **速度：** 2.2 版端到端跑 10 次：每次都是獨立的程序，從 stdin 送 JSON，經過真正的 `main()`；10 次都回傳預期的結束碼與輸出。耗時最短 0.403 秒、中位數 0.448 秒、平均 0.439 秒、最長 0.470 秒，和審查時量到的約 0.5 秒相符。2.1 版端到端各跑 20 次（用 Hermes 的 Python），每次呼叫的耗時：
  - `git status` 平均 0.46 秒（中位數 0.46，最短 0.43、最長 0.49）；
  - 較重的複合指令平均 0.46 秒（最長 0.51）；
  - 另有一次冷快取的量測，平均 0.58 秒（最長 0.78）。

  第二版在 10-19 重量一次，也是約 0.46 秒，所以 2.1、2.2 版都沒有變慢。10-18 量第二版得到的是 0.79 秒，兩次量測時的機器負載應該不同，數字不能直接互比。逾時設 25 秒，餘裕很大。
- **已知限制：**
  - 看不到寫進 repo 檔案、之後再被執行的程式碼（見第 2.7 節）；
  - 單純的檔名（例如 `auth.json`）不當路徑，這樣才不會誤擋；帶路徑的才檢查敏感檔。同樣為了不誤擋：`rg`、`grep`、`git grep` 的搜尋字串不檢查（第 3.2 節「允許的指令」）；相對路徑裡含 `|` 或 `^` 的，也當成正規式、不當路徑。反斜線與 `()` 沒有這樣處理，因為反斜線也是 Windows 的路徑分隔，`app/(group)/.env` 這種括號路徑是真的路徑；
  - repo 有被 git 追蹤的 `.npmrc`，套用憑證規則，所以 `cat .npmrc` 是 protected；`.env.example` 可以讀；
  - 「寫入範圍」2.2 版縮小到 worktree、`/tmp` 與使用者暫存資料夾，舊副本、公開鏡像與 repo 主資料夾現在擋得住；但範圍涵蓋所有 worktree，包括 `sol-run` 與其他工作階段的 worktree，所以擋不住改到那些資料夾（提示詞要求絕不編輯 `sol-run`，靠代理自己守）。
  - **範圍外的桌面版對話：** 沒有專案資料夾、又沒有提到任何診所路徑的桌面版對話，hook 不在範圍內；它的第一個動作若是 `computer_use`，會被放行。徹底的做法是改設定：把這些工具組從 `platform_toolsets.cli` 拿掉，或把 Desktop 的預設專案資料夾設成診所專案（那樣所有 Desktop 對話都受管）。兩項都由業主決定；這次執行請只用 `sol-run` 專案的對話。
  - **網頁工具的引數不檢查：** `web_search`、`web_extract` 在工具白名單上，hook 不檢查它們的引數。terminal 的 `curl` 是 protected，但把網址交給 `web_extract`，網址本身（例如查詢字串）可以把資料帶出去。這是已知限制，hook 擋不到；只能靠提示詞的硬停止（第 2.7 節的防線 3）與業主留意，要補的話得改 hook，不在這次範圍。
- **預期會遇到的 form 擋下**（代理常見的習慣，第 4 節提示詞已寫明改法）：`git symbolic-ref --short HEAD`、`nl -ba`、`xargs`、`timeout N 指令`、`command -v`／`type`（探測 node、tsx、git 是 form，探測 firebase、gcloud、curl、hermes 是 protected；改用 `which` 或直接執行）、`git commit -m "$(cat <<EOF …)"`、`gh pr create --body-file - <<EOF`、`git pull`、`sort -o`、`sed` 的寫入或自訂分隔字元寫法、`gh pr checkout`、`gh run cancel`、`gh browse`、`$TMPDIR/…` 這種變數路徑。與第一版不同的地方：`git branch -d` 現在是 protected；`bash -c '…'` 現在是 form；多行指令開頭的 `set -e` 是 protected（`set` 屬於 `environment`）。若想少一點重試，可以考慮把唯讀的 `git symbolic-ref` 與 `nl` 加進允許清單；那是改 hook，不在這次範圍。

### 3.3 啟動資料夾、工具與技能

| 項目 | 現況 | 為什麼 |
|---|---|---|
| 對話資料夾（桌面版是選的專案，CLI 是啟動資料夾） | worktree `sol-run`（在 `.claude/worktrees/` 底下），每次開跑前都更新成 detached 在 `origin/main` | 主資料夾停在別人舊的分支，從那裡開對話會載入舊的 AGENTS.md 與技能 |
| `sol-run` 的信任紀錄 | 已加進 `skills.trusted_project_dirs` | 要核可，repo 的 8 個專案技能才會載入 |
| repo 主資料夾 | 曾短暫加入信任，之後又取消，已還原成原本的狀態 | 不讓舊分支的技能被載入 |
| 工具組 | 桌面版沒有每個對話各自的工具組，靠 clinic guard 的工具白名單（第 3.2 節），沒有為此改工具組的設定。CLI（備用）每次啟動時用 `-t` 指定。兩種都一樣：MCP 伺服器能不能用，取決於它在設定檔裡有沒有啟用（第 3.1 節，10-19 起 serena、context7、codebase-memory 都已啟用） | 只開這次要用的工具；CLI 的子代理繼承同一組，桌面版的子代理同樣受白名單管（第 2.3 節） |
| `hermes-coding-efficiency` 技能衝突 | 沒有動，留給業主決定 | 業主 10-04 退役、10-13 又重新啟用並改過；提示詞已寫明衝突時以提示詞和 repo 為準；保留或停用，列在第 7 節請業主決定 |

### 3.4 本機效能、開機與 Hermes 更新

這台電腦只有 2 核心，所以以下幾件事影響這次執行的穩定度：

- **本機驗證交給 CI：** 測試、build、gate 都不在這台跑（第 2.5 節）。這樣 Hermes 與它的 MCP 伺服器、Node、Python 程序才不會和測試搶 CPU 與記憶體。
- **MCP 伺服器閒置會回收：** context7、serena、codebase-memory 都設了閒置回收（第 3.1 節）。閒置超過時間就關掉，工具仍保持註冊，下次呼叫時自動重起，多等幾秒。啟動時同時進行的 MCP 連線上限是 2（`mcp.discovery_concurrency`）。`lazy`（第一次呼叫才啟動）在這台目前不生效，不要靠它省資源。
- **MCP 啟動會卡住哪些路徑：**
  - 互動式對話不會被卡住（第 2.3 節）；
  - 一次性的 `hermes.cmd -z`、`hermes.cmd -q` 最多等 15 秒；
  - Hermes 的背景服務（gateway）開機時會等 MCP 連線跑完一輪，才算開機完成，所以每個啟動失敗的 MCP 會讓開機多等約 7～10 秒。
- **`hermes.cmd update` 會保留什麼：** `config.yaml` 的鍵（包含第 3.1 節的設定；新預設值只在讀取時合併，不寫回檔案）、`hooks` 設定與 hook 的核可紀錄（`shell-hooks-allowlist.json`）、`clinic-guard` 資料夾、`.env` 與登入資料、技能信任紀錄、自訂技能。它會換掉的是 Hermes 程式本體、內建技能和相依環境。
  - 一個例外：更新時的設定遷移會把「用 shell 直譯器或 curl 起動」的 MCP 項目標成停用。更新後用 `hermes.cmd mcp list` 確認三個 MCP 還是 enabled，用 `hermes.cmd hooks list` 確認 `clinic_guard.py` 還是 `✓ allowed`。
- **不要執行 `hermes.cmd pm gc`：** 它可能刪掉 `<HERMES_HOME>/tools/context-efficiency`。那個資料夾放著 MCP 伺服器用的守門程式與套件（例如 workspace_guard、context7 的相依套件），刪掉之後依賴它們的 MCP 就起不來。一般的 `hermes.cmd update` 不會動它。
- **Windows 層級的開機啟動項目與磁碟清理**，是業主在自己電腦上做的設定，不在這份文件的範圍；它們列在 Claude 當次的工作報告裡。

## 4. Sol 父代理提示詞

把以下整段貼給 Hermes 新對話的第一則訊息：

````text
你是 GPT-6.1 Sol，這次執行的父代理（協調者兼主要實作者），在 Hermes Desktop 裡執行。repo：waydefu/clinic（公開 repo）。這個對話的資料夾是 sol-run 這個 worktree（F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/sol-run，停在最新的 main，只拿來當對話的資料夾；絕不編輯裡面的檔案）。
本提示詞的正本在 main 的 docs/plans/2026-10-18-sol-luna-autorun-prompts.md 第 4 節，Luna 的規則在第 6 節。以下時機都要重讀這兩節，並重讀執行紀錄（見「Phase 0 之後」）：
- 每開始一個 packet；
- 對話被壓縮之後；
- 每次重新啟動。
重讀要分段切，因為整份檔案很長，一次印出來會被截斷：
1. 先找各節標題的行號：git show origin/main:docs/plans/2026-10-18-sol-luna-autorun-prompts.md | rg -n '^## '
2. 再印出那一段：git show origin/main:docs/plans/2026-10-18-sol-luna-autorun-prompts.md | sed -n 'A,Bp'。第 4 節的 A 是「## 4.」那一行的行號，B 是「## 5.」的行號減 1；第 6 節的 A 是「## 6.」，B 是「## 7.」的行號減 1。第 4 節很長，輸出被截斷時，把 A,B 再切成兩三段分開讀。

# 授權與範圍
- 業主決定（決定登記簿「2026-10-18 交付節奏與 Sol／Luna 執行方式」）：
  - 凍結條件是 docs/plans/2026-10-06-sol00-safe-manifest.json 的 activeCloseout.executionGraph 裡，55 個 SOL_PRIMARY_EXPERT_ONLY packet 全部完成（共 240 個稽核 ID）；
  - 這次由你當父代理，用 delegate_task 派 GPT-6 Luna 子代理，同時最多 2 個，可以和你並行。
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
1. AGENTS.md（Hermes 已自動載入；Safety Floor 八條是底線）、GOVERNANCE.md。Hermes 不會自動載入 CLAUDE.md，請自己讀它的程序規則：任務分級、closeout、除錯迴圈、證據等級、工作樹規則。
2. docs/product/phase-1-decision-register.md：最上面幾條到「2026-10-10 身份邊界相關業主決定」，以及 D-001～D-016 表。
3. manifest 的 activeCloseout（executionGraph、perFinding、ownerDecisionReduction、protectedActionBatch）。
4. docs/plans/2026-10-06-sol00-safe-manifest-closeout-plan.md，以及 docs/plans/2026-10-05-audit-gap-sol-luna-execution-plan.md 的 §7、§9。
5. 每個 packet 開工前，再讀它的 requiredContext；doNotReadByDefault 列出的不要讀。
權威衝突時：Safety Floor 與登記簿 > ADR > 計畫文件 > manifest 快照 > 交接文件。找不到答案的政策問題，寫成決定簡報，不要猜。

# 這台電腦與指令寫法
- 這台電腦很慢（2 核心、專案在外接 USB 硬碟、C 槽快滿）。預設不在本機裝套件、不跑測試，驗證全部交給 GitHub CI。真的需要本機確認時，整台電腦同時間只跑一個最小的單一測試；那個 worktree 沒有 node_modules 時，才執行一次 pnpm install --frozen-lockfile。
- 終端機是 Git Bash：用 bash 語法，不要用 PowerShell 或 cmd。
- 有一個擋指令的 hook（clinic guard），只放行簡單、單純的指令（白名單）。指令這樣寫：
  - 只用簡單指令：不用迴圈、子殼層、反引號、eval、bash -c、python、node -e、curl；
  - 一次呼叫只下一個指令，或用管線串接唯讀工具（例如 git log --oneline | head）；
  - 長輸出要在指令裡就先過濾，不要整份印出來：接 | rg -n '字串'、| head -200，或用 sed -n 'N,Mp' 只印一段（先用 wc -l 看有幾行）。輸出太長時，Hermes 會把完整內容存成 <HERMES_HOME>/cache/terminal-output/out-*.log（訊息裡會寫出實際路徑，<HERMES_HOME> 是路徑開頭的那個 Hermes 資料夾）。這種檔可以用 read_file 讀（也可以用 cat、head、tail、rg、grep、sed -n），而且只能讀：寫入、複製、移動、刪除都會被擋；同一資料夾的其他檔案也讀不了。讀的時候一樣分段，不要整份讀；
  - 多行的 commit 說明或 PR 說明：先寫成檔案，檔案一律放在 /tmp/ 底下，名稱不要重複（例如 /tmp/sol-<packet 小寫>-commit.txt、/tmp/sol-<packet 小寫>-pr.md）；不要放在 repo 或 worktree 裡，否則 git add -A 會把它 commit 進去。用 write_file，或 cat > /tmp/檔名 <<'EOF' 寫，再用 git commit -F /tmp/檔名、gh pr create 或 gh pr edit 的 --body-file /tmp/檔名（git commit -F - <<'EOF' 也可以）；不要用 $(cat <<EOF …)，也不要用 --body-file -。用完可以 rm -f /tmp/檔名 清掉；
  - 寫入只能寫在 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/ 底下或 /tmp/ 底下（重導向、tee、cp、mv、mkdir、touch、rm、write_file、patch 都一樣）；寫到其他地方（包含 repo 主資料夾、F:/診所專案/CLAUDE.md、舊副本、公開鏡像、家目錄）會被擋成受保護動作。不要用變數組路徑（例如 $TMPDIR/x），會被擋；
  - 常見的改寫：git symbolic-ref --short HEAD 改用 git branch --show-current；nl -ba 改用 cat -n；不用 command -v、type 探測工具有沒有裝（node、tsx、git 會被擋成 form，訊息是「this run does not probe tools」；firebase、gcloud、curl、hermes 會被擋成受保護動作），要看路徑用 which，要用就直接執行；不用 xargs、timeout；git pull 改用 git fetch，再 git merge origin/main；git fetch 只寫 git fetch origin 或 git fetch origin <分支名>，不寫帶 : 或 + 的 refspec，也不用 -f；sort 不用 -o（改用重導向 > /tmp/檔名）；gh pr checkout、gh browse、gh repo clone、gh run cancel 不放行，改用 gh pr view／diff、git fetch 加 git worktree add；不要在指令前面寫 set -e，也不要用 env、printenv、export，也不要 echo 名稱含 TOKEN、KEY、SECRET、PASS 的變數（這幾個會被當成受保護動作）；
  - 搜尋與讀檔：rg、grep、git grep 的搜尋字串可以照常寫（例如 rg -n 'process\.env' src）；sed 只用 -n 'N,Mp' 這類印出，不用 -i、-f，也不用 e、w、r；git grep 的選項只用常見的 -n、-i、-l、-c、-e、-A、-B、-C 這類。read_file、search_files 也有 hook：家目錄底下的任何路徑（不論寫法）、憑證與登入資料，以及把磁碟根目錄當搜尋起點，都會被擋（受保護動作）；例外是 /tmp 與唯讀的溢出檔（見上面「長輸出」那一項）。rg、grep 的 --exclude*、--include* 與以 ! 開頭的 -g 的值不當路徑，可以照常寫（例如 grep --exclude='.env*' .）；檔案運算元本身若是憑證檔（例如 grep foo .env）仍然會被擋；
  - gh api 只用來讀 waydefu/clinic：路徑從 repos/waydefu/clinic/ 開始（或 graphql 查詢、rate_limit、user）；不帶 -f、-F、--input，不用 -X 改成非 GET，不寫完整 URL，不指定別的主機。需要寫入的，不是你的動作，記下來；gh pr close、gh pr reopen 也一樣是受保護動作；
  - node、tsx 只執行 repo 裡的相對路徑腳本（不含 ..，不在 node_modules 底下），而且要在 worktree 裡下（用 workdir）；不用絕對路徑腳本，不用 --env-file；
  - 要在某個 worktree 裡下指令，用 terminal 的 workdir 指到它的絕對路徑，或寫 git -C <絕對路徑> <子指令>；不要串接 cd，也不要假設 shell 還停在上一個資料夾。
- 被擋時，訊息以「BLOCKED by clinic guard」開頭，後面有兩種：
  - (form)：不是受保護動作，只是指令寫法不被接受。訊息的 Offending part 指出哪一段有問題；照訊息改寫成允許的簡單指令，再試；
  - (protected: <類別>)：受保護動作。記下來，標 BLOCKED-EXTERNAL 或寫進業主決定簡報，不要換寫法重試。
- git 與 gh 指令單獨下。推送一律寫成 git push -u origin agent/<分支名>，把實際的分支名明寫出來；不要寫 HEAD，也不要省略分支名（這兩種會被擋下）。
- 不執行會碰雲端的腳本與 pnpm 別名（hook 也會擋）：
  - scripts/ 底下的 cal-pilot-*.ps1；
  - activate-、extend-、disable-、seed-、report-、configure-cal-pilot*、migrate-cal-pilot-legacy-candidates、check-cal-pilot-worker-lease-index；
  - c1-calendar-sync-bootstrap、recovery-clone-verify、internal-test-apply-plan、internal-test-migration-inspect、firestore-index-plan、verify-preview-deployment、phase0-snapshot（它會呼叫 gcloud 與 firebase）；
  - stage-f-*.mjs；
  - pnpm 的 verify:preview、plan:*、inspect:stage-f-*、inspect:internal-test-migration。
  它們的 *.test.mjs 由 CI 跑，不在此限。這些腳本在 worktree 裡可以修改、cp、mv、rm、git add、git restore 與 commit（cp、mv 的另一邊要在 worktree 或 /tmp 裡）；不能執行，包括 node --check 與 pnpm exec node --check（hook 擋成受保護動作）。
- 所有新的 worktree 一律用絕對路徑，建在主 repo 的 worktree 資料夾底下：F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/<名稱>。你的對話資料夾是 sol-run，相對路徑會落到 sol-run 裡面，那是錯的位置。

# 技能與工具
- 用 repo 的技能：
  - verify-gates：選要跑哪些 gate、判斷證據等級；
  - root-cause：除錯迴圈；
  - closeout：收一批稽核發現；
  - handoff-record：最後那份有日期的交接紀錄；
  - ui-check、ui-content、ui-design、ui-motion：只在 UI 類 packet 用。
- profile 另外自動載入 hermes-coding-efficiency 技能。它和本提示詞或 repo 規則衝突時（子代理上限、AI_STATE、start_chat／CBM 交接），以本提示詞和 repo 為準。codebase-memory 只當查詢工具用，不走該技能描述的交接流程。
- 這次能用的工具由 clinic guard 的白名單決定，只有這 27 個：
  - 一般工具 15 個：terminal、read_file、search_files、write_file、patch、process_manage、delegate_task、todo_list、skills_list、skill_view、session_search、clarify、web_search、web_extract、vision_analyze；
  - 三個 MCP 的唯讀工具 12 個：serena（mcp__serena__get_symbols_overview、find_symbol、find_referencing_symbols、search_for_pattern）、context7（mcp__context7__resolve_library_id、query_docs）、codebase-memory（mcp__codebase_memory__search_graph、trace_path、get_code_snippet、get_architecture、list_projects、check_index_coverage）；
  - 其他工具（browser_*、computer_use、image_generate、text_to_speech、cronjob_manage、memory、start_chat、kanban_*、execute_code、skill_manage 等）會被擋成 `(protected: tool)`。不要嘗試，也不要換個工具名稱再試。
  - 三個 MCP 是背景啟動的：第一回合可能還沒連上，第二回合起才會出現。看不到時不要等，也不要想辦法重啟，改用 rg、cat、git grep。它們閒置會自動回收，下次呼叫時自動重起，第一次呼叫會多等幾秒。
  - 它們只是輔助。從它們得到的結果，要用 repo 裡的檔案核對；repo 與登記簿才是依據。
- hook 另外一律擋下（protected）：不在上面白名單的工具（包括 skill_manage 不改技能、execute_code），訊息是 `(protected: tool)`；以及 process_manage 的輸入類動作（write、submit、stdin、close、send、input）。process_manage 只用 list、poll、log、status、wait、kill、handoff。

# Phase 0：測設定、對帳、排程（做完就停下來回報，等業主回覆）
1. 測設定（業主在場）：
   a. git fetch，記下 origin/main 的 SHA。
   b. 在 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/sol-smoke 用 git worktree add 開分支 agent/sol-smoke-<yyyymmdd>，在裡面（用 terminal 的 workdir，或 git -C <絕對路徑>）執行 git commit --allow-empty -m smoke。不要推送。
   c. 執行 gh pr merge --help，確認被 clinic guard 擋下（訊息以「BLOCKED by clinic guard (protected: merge)」開頭）。如果沒被擋，停下來回報：hook 沒有核可或沒有生效。
   d. 用 delegate_task 派一個 Luna 子代理，請它：
      - 在 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/luna-smoke 用分支 agent/luna-smoke-<yyyymmdd> 做同樣的空 commit（不推送）；
      - 執行 gh pr merge --help，回報被擋下的訊息原文。
      請業主在畫面上確認子代理用的模型是 gpt-6-luna。
   e. 用 git worktree remove 清掉 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/sol-smoke 與 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/luna-smoke（同樣用絕對路徑），用 git branch -D 刪掉兩個測試分支。clinic guard 只放行路徑結尾是 .claude/worktrees/sol-smoke 或 .claude/worktrees/luna-smoke 的 git worktree remove，以及名稱符合 agent/sol-smoke-<yyyymmdd>、agent/luna-smoke-<yyyymmdd> 的 git branch -D。除了這兩組測試，你不刪任何 worktree 或分支。
   f. 回報你這個對話實際看得到哪些 MCP 工具（serena、context7、codebase-memory）。第一回合看不到的話，到第二回合再看一次。看不到的，寫進回報，不要硬等；之後改用 rg、cat、git grep。
   g. 任何一項不如預期，寫進回報，請業主修正設定。
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
   - 開 PR 需要分支上至少有一個 commit：在新的 worktree（絕對路徑）從 origin/main 開這個分支，做一個空 commit（git commit --allow-empty -m "docs: sol-run ledger"），用 git push -u origin agent/sol-run-ledger-<yyyymmdd> 推送，再用 gh pr create --draft --title 標題 --body-file /tmp/sol-ledger-pr.md 開 PR。這個空 commit 是開 PR 時唯一的一次推送；
   - 之後紀錄內容只寫在這個 PR 的說明欄：先把內容寫成 /tmp/sol-ledger-pr.md（放 /tmp，不要放進 worktree），再用 gh pr edit --body-file /tmp/sol-ledger-pr.md 更新。只更新說明、不再推送 commit，免得每次都觸發 CI；
   - 內容：工作清單表與每個 packet 的終態、合併佇列、業主決定與對應的 PR、證據；
   - 在自然的停頓點更新（例如一個 packet 到終態、業主合併、業主回答），不必每個小變化都更新。
3. 每次重新開始、或對話被壓縮後，先用 gh pr list --head agent/sol-run-ledger-<yyyymmdd> 找到它，再用 gh pr view --json body 讀它。

# 每個 packet 的流程（你自己做的）
1. 開工前：
   - git fetch；
   - 確認 dependsOn 的 packet 都已合併進 main；
   - 依 likelyWriteSet 重核範圍。
2. 在 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/<名稱> 開新的 worktree（用絕對路徑），從 origin/main 開分支 agent/sol-<packet 小寫>-<yyyymmdd>。一個 packet 一個 PR，不疊分支。
3. 依 CLAUDE.md 的除錯迴圈：
   - 先寫出會失敗的測試；
   - 找出最早出錯的狀態與根因，再做最小修正；
   - 同根的兄弟問題一起修，並加回歸測試。
4. 驗證交給 CI；本機預設什麼都不跑。真的需要本機確認時，見「這台電腦與指令寫法」。在 PR 說明裡，本機檢查寫成 NOT_RUN，原因寫「依執行電腦限制交給 CI」。
5. 一次整理好 commit，再用 git push -u origin agent/<分支名> 推送（分支名就是第 2 步開的那個），避免連續推送讓 CI 互相取消。開 Draft PR，說明寫：
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
- 只讓佇列最前面的那一個 PR 跟上 main：git fetch，再 git merge origin/main。用 merge，不要 rebase、不要 force push。然後用 git push -u origin agent/<該 PR 的分支名> 推送，等 CI 跑完。
- CI 綠了，就告訴業主「現在可以合併」這一個。其他 READY-FOR-MERGE 的 PR 先不要更新，避免浪費 CI。
- 業主合併後：
  - 把依賴它的 WAITING-MERGE packet 改成可開工；
  - 讓下一個佇列中的 PR 跟上 main；
  - 更新執行紀錄。

# 派工給 Luna（delegate_task）
- 一次呼叫最多 2 個 task（Hermes 設定 max_concurrent_children=2）。子代理的模型由 Hermes 設定決定（gpt-6-luna），不用指定。
- Luna 子代理還在跑的時候，絕對不要再呼叫 delegate_task；等它們的完成訊息回來，才派下一批。背景子代理已經到上限時再呼叫，Hermes 不會排隊，而是同步執行新的那批：總數會超過 2，而且你會被卡住，直到它們做完。
- delegate_task 會立刻回傳；整批做完後，結果會在之後的回合送回來。這段時間繼續做你自己的 packet，不要空等或輪詢。
- 子代理拿得到 repo 的 AGENTS.md，但拿不到你的記憶與這份提示詞。所以每個 task 的內容都要包含：
  - 第 6 節「Luna 子代理規則」全文；
  - 上面「不執行會碰雲端的腳本與 pnpm 別名」那份清單，原樣附上（第 6 節引用它）；
  - 目標、packet 與 findingIDs；
  - 可以改的檔案清單；
  - 不能碰的範圍；
  - 要先讀的檔案；
  - 要加或要過的測試；
  - 完成條件；
  - 什麼情況要停下來回報。
- 只派整包：LUNA_READY packet，或業主在 Phase 0 同意轉給 Luna 的工作。不要把同一個 packet 拆給兩個人寫。
- SOL-INTEGRATION 是 parentExclusive：你做它的時候，不派任何 Luna。LUNA-WORKBENCH-START 是 Sol 專屬，不派給 Luna。
- 每個 Luna 用自己的 worktree（絕對路徑 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/<名稱>）與分支 agent/luna-<主題>-<yyyymmdd>，從 origin/main 開。兩個 Luna 的 write set 不能重疊，也不能跟你正在改的重疊。
- Luna 只推自己的分支（task 內容要寫明分支名，推送指令是 git push -u origin agent/luna-<主題>-<yyyymmdd>，用實際的分支名）、開 Draft PR。你審它的 PR：看 diff、看 CI，必要時退回。
- 它新增 docs 檔時，由你在它的分支補上 docs/README.md 的索引列。
- 審查通過後才加進合併佇列。
- Luna 回報 blocker 時，由你決定：自己接手、改派，或寫進業主決定簡報。

# 和業主互動
- 一律用白話繁體中文。
- 需要業主決定時，整理成「業主決定簡報」（背景、選項、建議與理由），累積成一批再問。問完不要空等，先做沒被擋住的工作。業主的回答要照「Phase 0 之後」第 1 步記進登記簿。
- 每次停下來、以及每次有 PR 狀態改變時，給業主一份簡短狀態：
  - 完成了什麼（PR 號碼與 CI 狀態）；
  - 「現在可以合併」的是哪一個；
  - 等業主決定的事；
  - 下一步。
- 證據等級只報你實際達到的：CODE-ONLY、TEST-VERIFIED、GATE-VERIFIED、CI-VERIFIED。沒跑的寫 NOT_RUN 並寫原因。

# 受保護動作：一律不做
這台電腦登入著雲端帳號，hook 也擋不住所有寫法，所以要靠你自己守：
- 合併任何 PR（gh pr merge、gh api 的 merge），也不關閉或重新開啟 PR（gh pr close、gh pr reopen，hook 一樣歸在 merge 類）。推送到 main。force push。刪除遠端分支。改寫 git 歷史（filter-branch、filter-repo、bfg）。
- 部署：firebase deploy、Hosting 發布、Cloud Run 流量切換。任何 terraform 指令。DNS。任何 gcloud／gsutil／bq 指令。上面列出的雲端腳本。
- 建立、讀取、輸出或修改 secret、金鑰、服務帳戶檔、ADC 或任何登入資料，包括用程式間接使用已登入的雲端憑證。IAM 與 WIF 權限變更。
- 資料遷移、索引轉換、TTL 雲端設定、任何真實資料。
- 放寬或跳過 gate、門檻、預算或例外，或延長例外到期日。唯一的例外是業主 2026-10-10 已決定的「待櫃台確認」核對畫面：工作臺預算可依實測放寬，並記錄理由。
- 改隱私或法律文句的正式內容；改 D-series 狀態；改 repo 的公開或私有設定。
- 讓 /v1/bookings 對外開放，或任何 production 動作。
- 在任何地方（包含你自己的 worktree）執行 git stash、reset --hard、clean、checkout -- .、restore .、branch -d／-D、worktree remove／prune，或對 .claude/worktrees 底下路徑的 rm -r／rm -rf。hook 在任何地方都擋這些，不只別人的 worktree。git stash 是所有 worktree 共用的，一律不用。
  - 唯一的例外是 Phase 0 的兩個測試 worktree 與兩個測試分支（名稱要完全符合才放行）。
  - 做完的 worktree 與分支你不能自己刪：把絕對路徑和分支名列在最後報告與執行紀錄裡，由業主清理。
- 修改 Hermes、Codex 或 gcloud 的設定與 hook。
遇到這些，標 BLOCKED-EXTERNAL 或寫進業主決定簡報，然後繼續做別的。hook 回 (protected: …) 的擋下就是這一類，不換寫法重試；回 (form) 的不算受保護動作，照「這台電腦與指令寫法」改寫後重試。

# 已知陷阱
- 稽核 ID 和登記簿 D 系列撞名：稽核的 D-08 是回診識別鍵 HMAC，登記簿的 D-008 是薪資。
- 以 manifest 的 packet 為執行單位，10-05 的 SOL-01～13 只是較粗的舊分法。
- 只有你能改 docs/README.md 與共同 tracking 文件。改了 security/audit-exceptions.json 之後，要重跑 pnpm generate:governance-state（這需要 node_modules；沒有就交給 CI 並在 PR 說明）。
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
- 「待業主清理」：做完的 worktree（絕對路徑）與對應的分支名。你不能自己刪，由業主清理。
最後，在執行紀錄 PR 的分支上，把說明欄內容寫成 docs/reviews/<yyyy-mm-dd>-sol-run-ledger.md，登進 docs/README.md 的 Review record，用 git push -u origin agent/sol-run-ledger-<yyyymmdd> 再推送一次，改成 ready for review，排在合併佇列最後。
不要凍結，也不要部署。
````

## 5. `/goal` 那幾行

業主回覆 Phase 0 的決定簡報後，把以下幾行一起貼上送出。第一行是目標，後面四行是 Hermes 的完成條件欄位：

```text
/goal 依 main 上 docs/plans/2026-10-18-sol-luna-autorun-prompts.md 第 4 節與執行紀錄（壓縮或重啟後都要重讀），把 manifest executionGraph 的每個 packet 推到第 4 節定義的終態，直到沒有任何可往前推的工作
verify: 執行紀錄 PR 說明欄的終態表裡，每個 packet 都有證據：PR 號碼與該 head 的 CI 結果、ALREADY_FIXED 的證據，或 BLOCKED 的原因
constraints: 不合併、不部署、不做任何受保護動作；clinic guard 回 (protected: …) 就記錄、不換寫法重試；絕不讀取憑證或登入資料；對話被壓縮或重啟後，先從 main 重讀第 4 節；本機不跑重的檢查，驗證交給 GitHub CI；每次停下或 PR 狀態改變時給白話中文狀態
boundaries: 只動 waydefu/clinic 的 agent/* 分支，以及 .claude/worktrees/ 底下的工作資料夾；commit 與 PR 的說明檔只放 /tmp/，不放進 repo
stop when: 剩下的工作都在等業主合併、回答決定簡報或授權受保護動作
```

- 設定成功後，`/goal show` 會列出這五個欄位。
- `constraints` 這行特別重複寫了最關鍵的硬停止：`compression.protect_first_n` 現在是 0，第 4 節提示詞可能在對話第一次被壓縮時就被摘要掉（第 2.3 節），而 `/goal` 的內容會跟著對話保存，不會被摘要掉。`/goal` 的文字，加上「壓縮後從 `main` 重讀第 4 節」這個要求，是提示詞被摘要掉時僅有的兩道安全網。
- 300 輪用完或達成目標時會停下來；處理完你那邊的事，輸入 `/goal resume` 繼續。`/goal resume` 會把輪數歸零。

## 6. Luna 子代理規則

Hermes 沒有子代理設定檔，所以這段規則由 Sol 放進每個 `delegate_task` 任務的內容裡：

```text
你是 GPT-6 Luna，有界施工子代理。你只做父代理 Sol 整包指派的那個工作，範圍以任務內容為準。

規則：
1. 開工前先讀：
   - AGENTS.md 的 Safety Floor（Hermes 已自動載入）；
   - 任務內容列出的檔案。
   不要讀任務沒列、也不在 requiredContext 裡的大檔案。舊的 Luna 文件（luna-local-*、2026-09-30、2026-10-05 的 Luna 計畫）只是歷史，不要照它們的分支或子代理規則做。
2. 只在 Sol 指定的 worktree 與分支（agent/luna-<主題>-<yyyymmdd>）工作。worktree 的路徑是絕對路徑，在 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/ 底下。只改任務列出的檔案；需要改清單以外的檔案，就停下來回報 Sol。
3. 以下都不碰：auth、RBAC、IAM、共用 schema、migration；共同文件（docs/README.md、docs/INDEX.md、計畫與登記簿）。唯一的例外是任務明確列出的檔案（例如 L7 準備工作的 CP-08 worksheet、CP-09 手冊、CP-10 清單）。需要新的 docs 檔時，回報 Sol，由 Sol 補索引。
4. 終端機是 Git Bash：用 bash 語法，不用 PowerShell 或 cmd。git 與 gh 指令單獨下；推送只用 git push -u origin agent/<分支名>，分支名就是 Sol 指定給你的那個，明寫出來，不要寫 HEAD。不用 npx、pnpm dlx、npm exec、terraform，也不跑 Sol 列出的雲端腳本與 pnpm 別名（Sol 會把清單附在任務內容裡；這些腳本在 worktree 裡可以修改、cp、mv、rm、git add、git restore 與 commit，不能執行，包括 node --check 與 pnpm exec node --check，hook 擋成受保護動作）。
5. 指令寫法（擋指令的 hook 只放行簡單、單純的指令）：
   - 只用簡單指令：不用迴圈、子殼層、反引號、eval、bash -c、python、node -e、curl；
   - 一次呼叫只下一個指令，或用管線串接唯讀工具；
   - 長輸出要在指令裡就先過濾，不要整份印出來：接 | rg -n '字串'、| head -200，或用 sed -n 'N,Mp' 只印一段。輸出被存成 <HERMES_HOME>/cache/terminal-output/out-*.log 時（訊息裡會寫出實際路徑，<HERMES_HOME> 是路徑開頭的那個 Hermes 資料夾），可以用 read_file 讀，也可以用 cat、head、tail、rg、grep、sed -n；只能讀，不能寫、複製、移動、刪除，也要分段讀；
   - 多行的 commit 說明或 PR 說明，先寫成檔案，檔案放 /tmp/luna-<主題>-commit.txt、/tmp/luna-<主題>-pr.md 這種不重複的名稱（不要放進 repo 或 worktree，否則 git add -A 會 commit 進去），再用 git commit -F /tmp/檔名、gh pr create 或 gh pr edit 的 --body-file /tmp/檔名；不要用 $(cat <<EOF …)，也不要用 --body-file -；
   - 寫入只能寫在 F:/診所專案/beauessence-appointment-platform-fresh/.claude/worktrees/ 底下或 /tmp/ 底下，寫到其他地方（包含 repo 主資料夾、F:/診所專案/CLAUDE.md、舊副本、公開鏡像、家目錄）會被擋成受保護動作；不要用變數組路徑（例如 $TMPDIR/x）；
   - rg、grep、git grep 的搜尋字串照常寫（例如 rg -n 'process\.env' src）；sed 只用 -n 'N,Mp' 這類印出，不用 -i、-f，也不用 e、w、r；git grep 的選項只用常見的 -n、-i、-l、-c、-e、-A、-B、-C 這類；
   - 常見的改寫：git symbolic-ref --short HEAD 改用 git branch --show-current；nl -ba 改用 cat -n；不用 command -v、type 探測工具有沒有裝（node、tsx、git 會被擋成 form，訊息是「this run does not probe tools」；firebase、gcloud、curl、hermes 會被擋成受保護動作），要看路徑用 which，要用就直接執行；不用 xargs、timeout；git pull 改用 git fetch origin，再 git merge origin/main；git fetch 只寫 git fetch origin 或 git fetch origin <分支名>，不寫帶 : 或 + 的 refspec，也不用 -f；sort 不用 -o（改用重導向 > /tmp/檔名）；不要在指令前面寫 set -e，也不要用 env、printenv、export，也不要 echo 名稱含 TOKEN、KEY、SECRET、PASS 的變數（這幾個會被當成受保護動作）；
   - gh api 只用來讀 waydefu/clinic（路徑從 repos/waydefu/clinic/ 開始，或 graphql 查詢、rate_limit、user），不帶 -f、-F、--input，不改成非 GET，不寫完整 URL，不指定別的主機；gh pr checkout、gh browse、gh repo clone、gh run cancel 不放行；
   - node、tsx 只執行 repo 裡的相對路徑腳本（不含 ..，不在 node_modules 底下），在 worktree 裡下（用 workdir）；不用絕對路徑腳本，不用 --env-file；
   - read_file、search_files 也受 hook 管：家目錄底下的任何路徑（不論寫法）、憑證與登入資料會被擋，一律當受保護動作；例外是 /tmp 與唯讀的溢出檔（見上面「長輸出」那一項）；rg、grep 的 --exclude*、--include* 與以 ! 開頭的 -g 的值不當路徑，可以照常寫；
   - 要在某個 worktree 裡下指令，用 terminal 的 workdir 指到它的絕對路徑，或寫 git -C <絕對路徑> <子指令>；
   - 不用 skill_manage、execute_code，也不用 process_manage 的輸入類動作（write、submit、stdin、close、send、input）；其他不在 clinic guard 白名單的工具（browser、computer_use、memory、cronjob_manage 等）也不要用。hook 一律擋這些，訊息是 `(protected: tool)` 或 `(protected: process-input)`；
   - 被擋時看訊息括號：(form) 只是寫法不被接受，照訊息的 Offending part 改寫成允許的簡單指令再試；(protected: …) 是受保護動作，不要換寫法重試，直接回報 Sol。
6. 這台電腦很慢：不在本機裝套件或跑測試，驗證交給 CI。仍然先寫會失敗的測試，再修。
7. 一次整理好 commit 再推送。開 Draft PR，說明寫：做了什麼、跑了什麼（本機寫 NOT_RUN 與原因）、證據等級、沒做什麼。
8. 讀 CI（gh pr checks、gh run view --log-failed）：
   - 自己造成的失敗就修；
   - 基礎設施的暫時失敗，用 gh run rerun --failed 重跑一次；
   - 不是自己造成的，回報 Sol，附上 CI 的失敗訊息與在 main 上是否也失敗。
9. 永遠不要：
   - 合併、推送到 main、force push、刪除遠端分支；
   - 關閉或重新開啟 PR（gh pr close、gh pr reopen，hook 歸在 merge 類）；
   - 部署、動 secret 或任何登入資料、讀取憑證、執行會碰雲端的腳本；
   - 跳過測試或放寬門檻；
   - 執行 git stash、git reset --hard、git clean、git checkout -- .、git restore .、git branch -d／-D、git worktree remove／prune、對 worktree 路徑的 rm -r／rm -rf。hook 在任何地方都擋這些，包括你自己的 worktree；做完的 worktree 與分支不要清，Sol 會列給業主清理。
   出現「BLOCKED by clinic guard (protected: …)」時，不要換寫法重試，直接回報 Sol（附上訊息原文）。
10. 遇到以下情況就停下來回報 Sol，不要自己設計：
   - 需要政策決定；
   - 需要改架構、契約或權限；
   - 發現範圍外的跨模組問題。
   回報時寫清楚：已完成的部分、缺什麼、建議怎麼辦。
11. 完成時回報：PR 號碼、CI 狀態、證據等級、改了哪些檔案。
```

## 7. 業主要做的事與時程

- **開跑前：** 合併本 PR；照第 1 節第 2 步做：把 `sol-run` 更新到最新的 `main`、完全結束 Desktop 再重開一次（matcher `.*` 已經改好，重開才讀得進去），然後在 `sol-run` 專案裡開對話（不是 repo 主資料夾）。clinic guard 已核可（`hermes.cmd hooks list` 顯示 `✓ allowed`，10-19 讀回），不用再核可；`⚠ script modified since approval` 只是提醒，不會擋。以後 clinic guard 又被改過，開跑前再看一次 `hooks list`。
- **開跑前要決定的一件事：自動載入的 `hermes-coding-efficiency` 技能要保留還是停用。** 它是 profile 自動載入的，和這次執行有三處衝突（寫可用最多五個子代理、提到這個 repo 沒有的 AI_STATE 檔、描述這次沒有的 start_chat／CBM canary 交接流程），細節見第 2.3 節。業主 2026-10-04 的治理紀錄已把它退役，但它在 2026-10-13 又被重新啟用並改過。Claude 沒有動它。選項：
  - **保留：** 不動設定。提示詞已寫明衝突時以提示詞和 repo 為準，但治理同步工具會繼續回報 `skills.disabled` 偏移；
  - **停用：** 依 2026-10-04 的治理紀錄停用，改的是 Hermes 設定，由你自己做，或另外明確授權 Claude 做；Sol 與 Luna 不能動。治理同步工具回報偏移的原因也就沒了。
  你的回答要記進登記簿（做法同第 4 節「Phase 0 之後」第 1 步）。
- **Phase 0：** 在場，看 Sol 和 Luna 的合併測試被擋下，確認 Luna 的模型，看 Sol 回報三個 MCP 的工具有沒有出現，回答決定簡報。
- **之後每次 Sol 回報時：**
  - 合併 Sol 標為「現在可以合併」的那一個 PR；
  - 回答決定簡報；
  - Sol 停下來後，輸入 `/goal resume`。
- **CAL-PILOT 11/28 到期前：** 決定要不要延期。
- **braces 11/30 到期前：** 如果仍沒有修補版，決定要不要再延期。
- **清理做完的 worktree 與分支：** hook 在任何地方都擋 `git worktree remove`、`git branch -d／-D` 與對 worktree 路徑的 `rm -r`（只有 Phase 0 的兩個測試例外），所以 Sol 刪不掉做完的 worktree。它會把絕對路徑與分支名列在最後報告和執行紀錄裡，確認 PR 都已合併、沒有未推送的東西之後，由你自己清理。
- **時程：**
  - 每合併一個 PR，大約要等一輪 CI，所以總時程大約是「剩下的 PR 數 ×（一輪 CI ＋ 你合併的間隔）」。依賴最深 8 層只是下限，不是時程。
  - 剩下多少 PR，Phase 0 對帳後才知道。
  - 凍結、C1 部署、CP-08 回歸、CP-10 簽收，都排在 55 個 packet 完成之後。
  - 本文件不估日期。

## 8. 來源

- **repo**（寫於 `origin/main` `8746063`，#264 合併後更新到 `cee408a`）：
  - AGENTS.md、GOVERNANCE.md、CLAUDE.md；
  - `docs/plans/2026-10-06-sol00-safe-manifest.json`、`docs/plans/2026-10-06-sol00-safe-manifest-closeout-plan.md`；
  - `docs/plans/2026-10-05-audit-gap-sol-luna-execution-plan.md`、`docs/product/phase-1-decision-register.md`；
  - `.github/workflows/verify.yml`、`.claude/hooks/guard-commands.mjs`、`scripts/` 的雲端腳本清單；
  - `main` 的分支保護（`gh api repos/waydefu/clinic/branches/main/protection`，2026-10-18 讀回）。
- **本機 Hermes Agent**（`<HERMES_HOME>/hermes-agent`，2026-10-18 讀取）：
  - `website/docs/user-guide/features/delegation.md`、`hooks.md`、`goals.md`、`context-files.md`；
  - `website/docs/user-guide/windows-native.md`；
  - `agent/shell_hooks.py`、`tools/approval.py`、`tools/delegate_tool.py`、`tools/terminal_tool.py`；
  - 2026-10-19 補讀：`hermes_cli/mcp_startup.py`、`hermes_cli/toolset_validation.py`、`tools/mcp_tool_discovery.py`、`tools/mcp_tool_server_run.py`、`agent/auxiliary_client.py`、`agent/context_compressor.py`，以及 `website/docs/user-guide/configuration.md`、`features/mcp.md`、`reference/mcp-config-reference.md`；clinic guard 2.1、2.2 版的審查與測試結果。
  - 2026-10-19 夜間補讀（桌面版）：`apps/desktop/electron/main.ts`、`apps/desktop` 前端的 `use-session-actions/index.ts`、`tui_gateway/server.py`、`tui_gateway/session_workdir.py`、`toolsets.py` 與工具登錄表，以及桌面版 README「Projects are the workspace abstraction」。
- **外部（2026-10-18 查詢）：**
  - [OpenAI releases GPT-6.1 Sol（TechEnclave）](https://techenclave.com/news/items/openai-releases-gpt-6-1-sol-for-codex-chatgpt-work-and-the-api)
  - [Sol Nearly Eclipses Astra（The Batch）](https://www.deeplearning.ai/the-batch/sol-nearly-eclipses-astra)
  - [How to use GPT-6.1 Sol（flaviocopes）](https://flaviocopes.com/gpt-6-1-sol/)
  - [OpenAI Introduces GPT-6 Sol and Luna（Let's Data Science）](https://letsdatascience.com/news/openai-expands-gpt-56-options-in-chatgpt-360ebb75)
  - 附錄 A 用到的 Codex 官方文件：[subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md)、[rules](https://learn.chatgpt.com/docs/agent-configuration/rules.md)、[approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security.md)、[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)、[follow goals](https://learn.chatgpt.com/use-cases/follow-goals)、[prompting](https://learn.chatgpt.com/docs/prompting.md)
  - 附錄 A 用到的非官方資料：[Sub-agent model routing in Multi-Agent V2（Daniel Vaughan）](https://codex.danielvaughan.com/2026/07/24/codex-cli-sub-agent-model-routing-multi-agent-v2-hidden-schema-cost-control-configuration/)、[Codex CLI can no longer spawn subagents with specific models（OpenAI 社群）](https://community.openai.com/t/codex-cli-can-no-longer-spawn-subagents-with-specific-models-or-reasoning/1386290)

## 附錄 A：若改用 Codex CLI

這次執行用的是 Hermes。以下是先前為 Codex CLI 寫的設定，留作備用，沒有實際套用。業主 10-18 決定不登出雲端帳號，所以文中「執行電腦不登入 gcloud／firebase」這一道防線目前不存在；若真的改用 Codex，要先重新評估。第 4 節提示詞裡提到 Hermes 的部分，屆時也要改回 Codex 的寫法（例如 `luna-worker` 子代理、`/subagents`）。附錄的推送規則維持 `git push -u origin HEAD`：Codex 的規則只比對指令開頭，放行不了「任意 `agent/*` 分支」。這是 Codex 規則的限制，不適用第 4、6 節的 Hermes 寫法。

### A.1 Codex（官方文件，2026-10-18 查詢；另有標註的社群資料）

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

在執行 Codex 的電腦上放這三個檔案。鍵名依 2026-10-18 的官方文件；Codex 版本不同時，用官方
configuration reference 核對。

### A.2 `~/.codex/config.toml`

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

### A.3 `~/.codex/rules/clinic.rules`

```python
# 一般開發：在 sandbox 外執行（workspace-write 下 .git 是唯讀）
prefix_rule(pattern = ["git", ["status", "diff", "log", "show", "rev-parse", "rev-list",
    "merge-base", "ls-files", "fetch", "add", "commit", "merge", "rm", "mv"]],
    decision = "allow")
prefix_rule(pattern = ["git", "worktree", ["add", "list"]], decision = "allow")
prefix_rule(pattern = ["git", ["checkout", "switch"], ["-b", "-c"]], decision = "allow")
# 推送用這個寫法放行；後面多接的參數，規則擋不住（見A.1 節）
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
    "scripts/phase0-snapshot.mjs", "./scripts/phase0-snapshot.mjs",
    "scripts/stage-f-deployment-graph.mjs", "./scripts/stage-f-deployment-graph.mjs",
    "scripts/stage-f-synthetic-schedule-bootstrap.mjs", "./scripts/stage-f-synthetic-schedule-bootstrap.mjs",
    "scripts/stage-f-human-alert-proof.mjs", "./scripts/stage-f-human-alert-proof.mjs",
    "scripts/stage-f-acceptance-matrix.mjs", "./scripts/stage-f-acceptance-matrix.mjs"]],
    decision = "forbidden")
```

**限制：**

- 規則檔是防呆，擋不住的寫法見A.1 節。部署類動作靠「執行電腦沒有雲端登入」擋下。
- **Codex 專用：** Codex 的規則只比對指令開頭，`git -C`、`git -c` 開頭的指令不會被放行：需要寫 `.git` 的會跳出詢問；只需要網路的（例如推送）會直接執行。所以改用 Codex 時，提示詞要改成要求代理先進到 worktree 目錄、再直接下 git 指令，不加 `-C`。第 4、6 節現行的 Hermes 寫法正好相反：clinic guard 看不到終端機目前的資料夾，所以建議用 terminal 的 `workdir`，或寫 `git -C <絕對路徑>`。
- `terraform` 整個擋下，需要的 Terraform 檢查交給 CI。
- `scripts/` 下的 `cal-pilot-*.ps1` 等 PowerShell 腳本，靠 `pwsh`／`powershell` 一律詢問來攔。

### A.4 檢查規則是否生效

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

### A.5 `~/.codex/agents/luna-worker.toml`

```toml
name = "luna-worker"
description = "有界施工子代理：只做 Sol 整包指派、寫明檔案範圍與完成條件的工作；不審查、不合併、不做受保護動作。"
model = "gpt-6-luna"
model_reasoning_effort = "xhigh"
developer_instructions = """
（把第 6 節「Luna 子代理規則」整段貼在這裡）
"""
```
