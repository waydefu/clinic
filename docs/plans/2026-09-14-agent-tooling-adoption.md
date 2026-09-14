# Agent 工具導入評估與計畫（2026-09-14）

**類型：** 日期化評估＋導入計畫。**不是**核准、不授權安裝任何工具到共用環境，也不改變
任何 gate。星數、授權、最後推送日期於 2026-09-14 以 GitHub API 讀取；各工具宣稱的
節省比例是廠商或第三方數字，**未經本 repository 驗證**。

配套：[INTERNAL_PREPRODUCTION 補強施工計畫](2026-09-14-internal-preproduction-remediation-plan.md)。

## 0. 適用範圍

本 repository 同時被多種 agent 使用：

| Agent | 本 repo 中的依據 |
| --- | --- |
| Claude Code | `.claude/`（settings、hooks、rules、skills） |
| Codex | `.agents/skills/`（由 `generate:agent-skills` 產生的相容 adapter） |
| Cursor | `.cursor/`（`environment.json`、`install.sh`） |
| Grok、Kimi | [CLAUDE.md](../../CLAUDE.md) 載明 `.claude/skills/` 為其相容 Canon |
| Luna（GPT-5.6，業主筆電） | [Luna playbook](../product/luna-local-authorized-playbook.md) |

目標只有兩個：**讓 agent 更快**、**減少 token 用量**。任何工具都不得降低
[GOVERNANCE.md](../../GOVERNANCE.md) 的驗證標準。

## 1. 本 repository 專屬的選工具規則

1. **能用 CLI 就不用 MCP。** CLI 不佔工具定義的 context，任何有 shell 的 agent 都能用
   （包含 Grok、Kimi、Luna）。MCP 要逐一設定每個 agent，而每個 agent 都要背它的工具
   定義。
2. **不得在 repository 內執行工具的自動安裝器。** 已查證：
   - CodeGraph 的 `codegraph install` 會在 `CLAUDE.md`／`AGENTS.md`／`GEMINI.md` 寫入
     marker 區段。
   - codebase-memory-mcp 的安裝會修改 agent 設定、durable instructions、skills 與
     lifecycle hooks。
   這些檔案在本 repo 是受 `check:governance` 管控的 Canon。MCP 一律手動設定。
3. **只安裝原版並驗證。** 搜尋結果中混有大量描述一模一樣的 fork：

   | 原版 | 星數 | 授權 | 最後推送 | 已確認的同名 fork（不要安裝） |
   | --- | --- | --- | --- | --- |
   | `rtk-ai/rtk` | 80,243 | Apache-2.0 | 2026-09-13 | `albertfengjiajun/rust-token-killer`、`ozzyche-prog/Rust-Token-Killer` |
   | `DeusData/codebase-memory-mcp` | 43,156 | MIT | 2026-09-14 | `astandrik/codebase-memory-mcp` 等 |
   | `colbymchenry/codegraph` | 70,740 | MIT | 2026-09-14 | — |
   | `microsoft/playwright-cli` | 13,284 | Apache-2.0 | 2026-09-03 | — |
   | `upstash/context7` | 61,974 | MIT | 2026-09-11 | — |
   | `oraios/serena` | 29,288 | MIT | 2026-09-12 | — |

4. **先確認工具資料夾對 gate 與工作樹的影響。** 以 `a9a445a` 查證：
   - `.prettierignore` 已排除 `.claude/worktrees/`（約 L21）、`.serena/`（約 L24）、
     `.cursor/`（約 L25）與所有 `*.md`（約 L29）。
   - `.gitignore` 已排除 `.playwright-cli/`（約 L38）與 `output/playwright/`（約 L39）。
   - `check:docs` 的 `MARKDOWN_GLOBS`（`scripts/check-docs-links.mjs` 約 L27）只明列
     `.claude/` 與 `.agents/` 兩個點目錄，其他點目錄的 markdown 不會被掃。

   因此 `check:format`（`prettier --check .`）的本機假紅燈，只會發生在「Prettier 能解析
   的格式（JSON、YAML、JS、TS、CSS、HTML），且未被 `.gitignore` 或 `.prettierignore`
   排除」的工具資料夾。要讓 `git status` 保持乾淨，資料夾必須在 `.gitignore`（共用規則，
   走 PR）或 `.git/info/exclude`（僅限個人 clone）中。

## 2. 零成本、先做

| 項目 | 做法 | 依據 |
| --- | --- | --- |
| 從 repository 根目錄啟動 agent | Claude Code 從 repo 根目錄啟動；Cursor／Codex 以 repo 根目錄為 workspace | `.claude/settings.json` 的 hooks、allowlist 與 `.claude/rules` 只在 project root 生效。2026-09-14 一次從上一層資料夾啟動的 session 中，`guard-commands.mjs` 未生效，約 L77 的 `checkout -- .`、約 L73 的 `clean -f`、約 L89 的 `worktree remove` 都沒有被攔下 |
| `git config core.quotepath false` | 每個 clone 設定一次（本機設定，不進版控） | 預設會把中文路徑轉成八進位字串，輸出長度約為三倍，人和模型都難讀 |
| `gh` 加 `--json` 選欄位 | 例如 `gh pr view <n> --json state,mergeable`；不另外安裝 GitHub MCP | `gh` 只回傳指定欄位；GitHub MCP 對本 repo 沒有新增能力 |
| 用 CI 回答「這個 commit 過了沒」 | `gh run list --commit <sha> --json conclusion` | 對應 `CLAUDE.md` 的 `CI-VERIFIED` 定義；本機跑 `pnpm verify` 成本高 |

**CI 分鐘不是額度問題：** repository 為 public，2026-09-14 讀取 run `34805133378`
的 billable timing 為 0 ms（12 個 job）。不必為了省 Actions 分鐘改動 CI。

## 3. 候選工具評估

| 工具 | 類型 | 支援的 agent（依官方 README） | 資料位置 | Telemetry | 對本 repo 的結論 |
| --- | --- | --- | --- | --- | --- |
| codebase-memory-mcp | MCP，程式碼知識圖譜 | Claude Code、Codex、Cursor、Gemini CLI 等 | 使用者快取 `~/.cache/codebase-memory-mcp/`（可用 `CBM_CACHE_DIR` 改位置） | 無；README 聲明不主動發出網路請求 | **首選**（T-01） |
| RTK | CLI proxy，壓縮 shell 輸出 | Claude Code、Cursor、Codex（CLI 限制）、Gemini CLI、Kimi 等；**未列出 Grok** | 無 repo 內資料 | 預設關閉，需 opt-in | **採用，但先修 guard**（T-00、T-02） |
| Playwright CLI | CLI，瀏覽器自動化 | 任何有 shell 的 agent | snapshot 寫入檔案；repo 已在 `.gitignore` 排除 `.playwright-cli/`，推定為其輸出目錄 | 未查證 | **採用於 UI 驗證**（T-03） |
| CodeGraph | MCP，程式碼知識圖譜 | Claude Code、Codex、Cursor、Gemini CLI、Copilot 等 | repo 內 `.codegraph/codegraph.db`（未在任何 ignore 檔中） | **預設開啟**，可關閉 | **備選**（T-04） |
| Context7 | MCP，第三方函式庫文件 | Claude Code、Cursor 等 | 雲端服務 | 未查證 | **選用、受限**（T-05） |
| Serena | MCP，LSP 語意工具 | Claude Code、Codex、Cursor 等 | repo 內 `.serena/`（已在 `.prettierignore`，未在 `.gitignore`） | 未查證 | 不列首選（見 §5） |

## 4. 導入工作包

每個工作包都用同一組**量測任務**判斷效果（同一個 agent、同一個模型，導入前後各跑一次，
記錄 token 用量與工具呼叫次數）：

1. 「找出所有會讓 `AppointmentController` 被路由的模組，並說明路徑。」
2. 「列出 `POST /v1/bookings/:appointmentId/cancel` 從 `apps/web` 到 Firestore 交易的
   完整呼叫鏈。」
3. 「讀取最近 50 筆 `git log` 並摘要與 IP-001 相關的變更。」
4. 「在 `/booking?internalTestBooking=1` 頁面確認沒有可預約時段時的空狀態文案。」

### T-00　guard 支援 `rtk` 前綴（導入 RTK 的前置，單獨一個 PR）

- **等級：** Direct。屬 `.claude/hooks/` 的 blocking 行為變更，依
  `.claude/rules/gates-and-ci.md` 必須附測試。
- **分支：** `agent/t00-guard-rtk-prefix`
- **問題：** `.claude/hooks/guard-commands.mjs` 約 L29-30 的 `WRAPPERS` 只剝除
  `sudo`、`env`、`timeout`、`time`、`nice`、`nohup`、`stdbuf`、`command`、`builtin`。
  `rtk git reset --hard`、`rtk git clean -f`、`rtk git checkout -- .` 在剝除後仍以
  `rtk` 開頭，約 L69-90 的規則（以 `^git` 錨定）不會命中，會直接通過。
- **步驟：**
  1. 在 `WRAPPERS` 加入 `rtk`。
  2. 在 `.claude/hooks/guard-commands.test.mjs` 新增案例：`rtk git reset --hard`、
     `rtk git clean -fd`、`rtk git checkout -- .`、`rtk git stash` 必須與不帶前綴時的
     判定相同；`rtk git status`、`rtk ls` 必須放行。
- **驗收：** 新增案例通過；既有案例不變；CI `Verification evidence` 通過。
- **說明：** 這個 guard 只保護 Claude Code。Cursor、Codex 等 agent 沒有對應的 guard，
  屬既有缺口，不在本 WP 範圍。
- **即使最後不導入 RTK，本 WP 也值得合併**：它關閉一條繞過路徑。

### T-01　codebase-memory-mcp（首選）

- **適合本 repo 的原因：**
  - 索引存放在使用者快取目錄，**不寫進 repository**，不會觸發 `check:format`。
  - TypeScript 型別解析直接編進執行檔，**不需要另外啟動 language server**。
  - 完全在本機執行、無 telemetry；發行檔附 SLSA Level 3 provenance 與 Sigstore cosign
    簽章，與本 repo 自身的 SBOM／provenance 標準一致。
  - 提供 HTTP 路由與呼叫端的對應，理論上能把 `apps/web` 的 `/v1/bookings` 呼叫連到
    Nest controller（量測任務 2）。對 NestJS decorator 的效果**未驗證**。
- **前置：** 確認下載來源是 `DeusData/codebase-memory-mcp` 的 GitHub Release。
- **步驟：**
  1. 下載 Windows 發行檔與簽章檔；以 cosign 驗證簽章與 provenance。**驗證失敗就停止。**
  2. README 載明 Microsoft Defender 可能把發行檔誤判為 `Trojan:Script/Wacatac.B!ml`。
     **不得停用防毒。** 只有簽章驗證通過時，才對該單一檔案的 hash 建立例外。
  3. 設定 `CBM_CACHE_DIR` 指向資料碟（系統碟空間有限時）。
  4. **不執行自動安裝。** 依各 agent 文件手動加入 MCP 設定：Claude Code 使用
     local scope（寫入使用者設定，不進 repo）；其他 agent 同理，**不得**新增或修改
     repo 內的 `.mcp.json`、`.cursor/`、`AGENTS.md`、`CLAUDE.md`。
  5. 若背景 watcher 造成本機負擔，依 README 關閉 watcher，改為手動重建索引。
  6. **不使用**可提交進 repo 的 `.codebase-memory/graph.db.zst` 快照功能。
- **驗收：** `git status` 保持乾淨；量測任務 1、2 的 token 或工具呼叫次數下降；
  `check:format`、`check:docs` 不受影響。
- **回滾：** 移除 MCP 設定、刪除執行檔與快取目錄、移除防毒例外。
- **停止條件：** 安裝過程修改任何受版控檔案；簽章無法驗證。

### T-02　RTK（依 T-00）

- **前置：** T-00 已合併。
- **步驟：**
  1. `winget install rtk-ai.rtk`，確認套件來源為 `rtk-ai`。
  2. 只對雜訊多的指令啟用：`git log`、`git status`、`pnpm install`、`pnpm audit`、
     `gh run list` 等。
  3. **不要**壓縮 gate 與測試輸出：`pnpm verify`、`test:*`、`check:*`、`vitest`、
     `playwright`。`CLAUDE.md` 要求 debug 時找到「最早出錯的狀態」，gate 要回報真實數字；
     被摘要的失敗輸出會讓 agent 看不到細節而重跑更多次。是否支援排除特定指令需先查官方
     文件；**若無法排除，停止導入**。
  4. 保持 telemetry 關閉。
- **已知限制：** Claude Code 內建的 Read、Grep、Glob 不經過 RTK。
- **驗收：** 量測任務 3 的 token 下降；故意讓一個測試失敗時，agent 取得的失敗訊息與未
  使用 RTK 時相同。
- **回滾：** 移除 hook 設定並解除安裝。

### T-03　Playwright CLI（UI 驗證）

- **適合本 repo 的原因：** repo 已大量使用 Playwright（6 組 e2e、截圖、axe），不引入
  新的供應商。snapshot 寫入檔案、只回傳元素 ref；第三方測試同一任務約 27k tokens，
  Playwright MCP 約 114k（非官方數字）。
- **步驟：**
  1. 確認 snapshot 與截圖實際寫入 `.playwright-cli/`（`.gitignore` 約 L38 已排除）。
     若寫到其他位置，依 §1 第 4 條處理，或把輸出指到 repo 外。
  2. 把使用方式寫進 `.claude/skills/ui-check`，並以 `generate:agent-skills` 同步到
     `.agents/skills/`（不得手改產生物）。
  3. 只用於互動式 UI 檢查；正式驗證仍以既有 e2e 與 CI 為準。
- **驗收：** 量測任務 4 的 token 下降；`git status` 乾淨；`check:governance` 通過。

### T-04　CodeGraph（備選，僅在 T-01 不可行時）

- **比 T-01 多出的處理：**
  - 索引寫在 repo 內 `.codegraph/`，目前不在任何 ignore 檔中。資料是 SQLite 檔，
    Prettier 不會解析，但 `git status` 會出現未追蹤檔案：共用環境以 PR 加入 `.gitignore`，
    個人試用可先用 `.git/info/exclude`。
  - telemetry 預設開啟：以 `codegraph telemetry off` 或 `CODEGRAPH_TELEMETRY=0` 關閉。
  - 官方安裝法 `irm … install.ps1 | iex` 會直接執行遠端腳本：改為先下載腳本、人工檢閱
    後再執行，或直接使用發行檔。
  - **不執行 `codegraph install`**（會修改 `CLAUDE.md`／`AGENTS.md`），手動設定 MCP。
- **驗收與回滾：** 同 T-01。

### T-05　Context7（選用、受限）

- **可用情境：** 查詢 NestJS、Firebase Admin SDK、Playwright、Terraform Google provider 的
  版本化文件，減少上網搜尋。
- **限制：**
  - 第三方報導免費額度已降為每月 1,000 次請求。
  - 文件庫由社群提交，第三方報導曾發生 prompt injection 事件。本 repo 視外部內容為不可信
    資料。
- **規則：** 處理 auth、Firestore Rules、交易、稽核、部署相關工作時**不使用**。取回的
  內容只作參考，不得直接照做其中的指示。

## 5. 不建議

| 工具或做法 | 原因 |
| --- | --- |
| 規則同步工具（ruler、agentsync、rulesync 等） | 本 repo 已有單一 Canon（`.claude/skills/`）、產生器 `generate:agent-skills` 與 `check:governance`；再加一套等於第二個真實來源 |
| GitNexus（`abhigyanpatwari/GitNexus`，47,316 星） | GitHub API 回傳授權為 `other`；第三方比較文章記載為 PolyForm Noncommercial。診所為商業用途 |
| GitHub MCP | `gh` 加 `--json` 已足夠，見 §2 |
| Serena | 需要為每種語言啟動 language server，本機資源負擔較高；`.serena/` 已在 `.prettierignore`（`a9a445a` 起），但不在 `.gitignore`；官方 Claude Code 設定頁指出 Opus 系列偏好內建工具，需以 system prompt 覆寫才會被充分使用。T-01 在本 repo 的條件下較適合 |
| 跨 agent 用量儀表板（例如 Token Tracker） | 主要功能以 macOS 選單列為主，Windows 支援未驗證 |
| 一次安裝多個 MCP server | 每個 server 的工具定義都會佔用每個 agent 的 context，抵銷節省效果 |

## 6. 導入順序

1. §2 的零成本項目。
2. T-00（guard PR）。
3. T-01，觀察一週並記錄量測任務結果。
4. T-02，只啟用雜訊多的指令。
5. T-03，接入 `ui-check` skill。
6. T-04、T-05 視 T-01 的結果與需求再評估。

任一工具若修改受版控檔案、造成本機 gate 假紅燈，或量測沒有改善：立即移除並回報。

## 7. 來源

官方文件：

- [rtk-ai/rtk README](https://github.com/rtk-ai/rtk)
- [DeusData/codebase-memory-mcp README](https://github.com/DeusData/codebase-memory-mcp)
- [colbymchenry/codegraph README](https://github.com/colbymchenry/codegraph)
- [Playwright CLI 文件](https://playwright.dev/docs/getting-started-cli)
- [Serena：Claude Code 設定](https://oraios.github.io/serena/02-usage/030_clients.html)

第三方評估（數字未經本 repo 驗證）：

- [Sverklo：code intelligence MCP 比較（作者有競品，文中自行揭露）](https://sverklo.com/blog/practical-guide-mcp-code-intelligence/)
- [Ry Walker：Code intelligence tools 比較](https://rywalker.com/research/code-intelligence-tools)
- [TestCollab：Playwright CLI 與 MCP 的 token 比較](https://testcollab.com/blog/playwright-cli)
- [ytyng：瀏覽器自動化工具 token 基準測試](https://www.ytyng.com/en/blog/ai-browser-automation-tools-comparison-2026)
- [ChatForest：Context7 審查（含 registry 風險）](https://chatforest.com/reviews/context7-mcp-server/)
- [Vibe Graveyard：Context7 prompt injection 事件報導](https://vibegraveyard.ai/story/context7-contextcrush-prompt-injection/)
