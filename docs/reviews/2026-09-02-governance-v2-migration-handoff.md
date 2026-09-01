# Governance v2 結構遷移交接紀錄（2026-09-02）

**狀態：** 日期化交接證據；不是 D-series、部署、真實資料或 GOV-R01 核准。
**日期：** 2026-09-02（Asia/Taipei）
**工作樹：** `F:\診所專案\clinic-governance-v2`
**分支：** `agent/governance-v2`（尚未 push、尚未開 PR）
**基準 HEAD：** `df97fd47b55169f24f66037da6e61172fb2cc41c`（`origin/main`）
**本文件所在 commit：** 尚未提交。查找方式：`git log -1 -- docs/reviews/2026-09-02-governance-v2-migration-handoff.md`

## 一句話

把 `origin/main` 上既有 harness 收成 Governance v2：根層只留 meta-governance 與精簡 boot kernel，八條 Safety Floor 仍是規範性島嶼，動態現況改為確定性產生投影，技能維持單一正文並以 Codex-safe frontmatter 產生 `.agents` 轉接，再把 `check:governance` 掛進既有 `verify`。有效政策等價；Stage、部署與真實資料權限不變。

## 階段／步驟與目前位置

- 階段／步驟編號：Governance v2 結構遷移；不是既有 Stage 切片的完成宣告。
- 對應執行書：CONTRIBUTING #10 與全專案執行書 §10.4。
- Stage 位置：**不變**。投影物化 `C0=revise`、C1～C6 `pending`，所有 `deploymentAuthorities=not_granted`。
- 本文件不能關閉 D-series、C0～C6、Expansion S、GOV-R01 或任何 Roadmap ID。

## 交付的修訂版本

- 基準：`df97fd47b55169f24f66037da6e61172fb2cc41c`。
- 工作分支：`agent/governance-v2`，相對基準僅有未提交的治理檔。
- PR／merge commit：無。
- 未更動 `apps/` 產品碼、Firestore、terraform、lockfile、workflow required jobs、UI、真實資料或雲端設定。

## 交付產物與 SHA-256

下列雜湊是寫入本文件當下工作區位元組；提交後以 `git log -1 -- <path>` 為準。

| 產物 | SHA-256 |
| --- | --- |
| `GOVERNANCE.md` | `54f5069456175fd98818f2def7465147a505aeff9799b726c8fe6262de239647` |
| `AGENTS.md` | `8067ae93a40d660584a954ad3bbfbcd514ee8bf658d0f012b49f74857ee52548` |
| `CLAUDE.md` | `c2a9c9aebc440854ab2f4f2934d03382ff591777f68721d70d0abc3b88f8888a` |
| `docs/INDEX.md` | `6c151a57f62f683fa559b547c86ad48e0d107edeae3b0f66c2f59cbf28427048` |
| `docs/state/current.json` | `56aee74700b75c880ac11bd1ab7b0d158098259c7f7490037c8a8f1e9830d9f5` |
| `docs/state/current.md` | `cc498240fda8c3213b749207d0906473af11c09f2e2c6767b9f13f60a6bb51be` |
| `docs/state/conflicts.md` | `ee4850c069fbe4d90dcd29bdc6e45ecc671667e037a40ae07f8debd1f17d78cd` |
| `docs/governance/waivers.json` | `7309dbb84d2861f995eb93ddfbee52e7a54930e6ce0ea96b6264f290f0d3a645` |
| `.github/CODEOWNERS` | `bcc1396272fc0331ecfa6aca62eafa7bea9b55004735e1579183f4b208016bd2` |
| `scripts/check-governance.mjs` | `eacb211bd9a39b49bfb0f56f402741d159e5d985778b410030053c33f21e4f3d` |
| `scripts/generate-governance-state.mjs` | `6a907810d1426916195dd5c52bc72d653eb1694dd0fb25dfa84e1ef6b976bdd4` |
| `scripts/generate-agent-skills.mjs` | `e419a5f57c908dbede34e323d6d3fe88e381d54c31c73b47b6a1843001d35fb6` |

SBOM 產物 `sbom.cdx.json` 依 `.gitignore` 不進版控：CycloneDX 1.6、920 components、80 runtime、3 筆已審視授權例外。

## 稽核覆蓋與未覆蓋面

**覆蓋：** 根治理檔、`docs/INDEX.md`、`docs/state/`、`docs/governance/waivers.json`、`.claude` 指標、產生的 `.agents/skills`、CODEOWNERS、`package.json` verify 鏈、新 gate 與單元測試、本機 structure／docs／governance／format／lint／types／unit／secrets／audit／SBOM。

**未覆蓋：** 遠端 GitHub protection／rulesets／required reviews、Dependabot 現況、preview 存活、cloud／production、`test:rules`、`test:e2e`、Grok Build runtime、`grok inspect`、在 `clinic-governance-v2` 上的 Cursor 技能發現（見對抗驗收 N）。

## 每道關卡的實際結果

環境：Windows worktree `clinic-governance-v2`，Node v24，pnpm 11.9.0。因本 worktree 對 `@axe-core/playwright` LICENSE 的 `pnpm install` 為 EPERM，**沒有**用 `corepack pnpm run verify` 一條指令跑完（該入口會先做 modules purge）。下列結果是同一條 `verify` 腳本展開後、以 `node`／`.bin` 執行的等價鏈，外加選定的 `check:supply-chain`。

| Gate／檢查 | 狀態 | 實際數字／理由 |
| --- | --- | --- |
| `check:structure` | `PASS` | 233 required files；17 C6 reference PNGs；clean-clone ordering |
| `check:clinic-freeze` | `PASS` | 30 frozen files |
| `check:architecture` | `PASS` | 3 層依賴方向、未接線清單 9 筆 |
| `check:ui` | `PASS` | modular test-only UI guard |
| `check:pages` | `PASS` | 5 進入點、8 條資料驅動官網路由 |
| `check:tokens` | `PASS` | clinic-site 間距字面值 9/9 |
| `check:docs` | `PASS` | 166 files（交接檔入庫前；入庫後須重跑） |
| `check:governance` | `PASS` | AGENTS 6423 bytes／122 lines（warn＞6144、lines advisory＞120，未達 8192 fail）；INDEX 3738 bytes；CLAUDE advisory 9476 bytes／190 lines |
| `check:e2e-groups` | `PASS` | 18 specs／6 groups |
| `check:secrets` | `PASS` | 647 **已追蹤**檔。未追蹤新檔不在 `git ls-files` 內；新檔人工抽查無 private key／AKIA |
| `check:format` | `PASS` | `prettier --check .` |
| `check:capture-config` | `PASS` | tsc on `playwright.screenshots.config.ts` |
| `check:types`／build | `PASS` | packages/config、contracts、domain、apps/api、apps/worker tsc；`sync:domain` 19 files；`build:web` 81 files／57 content-hashed |
| `check:lint` | `PASS` | `eslint .`（修了 3 筆新腳本 lint 後） |
| `check:sync` | `PASS` | vendored domain 19 files |
| `check:perf` | `PASS` | 5 進入點 gzip 預算 |
| `test:unit` | `PASS` | 79 files／1185 tests |
| `check:audit-exceptions` | `PASS` | 沒有被忽略的 advisory |
| `audit:prod` | `PASS` | No known vulnerabilities found（lockfile 隔離目錄，`CI=true`） |
| `audit:all` | `PASS` | 9 vulnerabilities：1 low／8 moderate；`--audit-level high` 綠 |
| SBOM／license | `PASS` | 920 components、80 runtime、3 reviewed exceptions |
| 聚合 `corepack pnpm run verify` | `FAIL`（入口） | `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；等價鏈如上 `PASS` |
| `test:rules` | `NOT_RUN` | 未改 Rules／產品寫入路徑；CJK 路徑 Emulator 陷阱仍在 |
| `test:e2e` | `NOT_RUN` | 未改 UI／runtime |
| `check:branch-protection` | `NOT_RUN` | 遠端 GitHub 設定非本任務授權 |
| preview／deploy／cloud | `NOT_RUN` | 無 per-commit 部署授權 |
| `grok inspect` | `UNAVAILABLE` | PATH 與 repo 皆無 grok CLI／`.grok/` |
| GitHub `Verification evidence` | `UNAVAILABLE` | 尚未 push／無此 commit 的 CI |
| Cursor skill-name uniqueness on this tree | `NOT VERIFIED` | 見對抗驗收 N |

## 發現並修好的缺陷

1. 產生器測試誤找 `generated projection, not Canon`；正文是 `deterministic projection, not Canon`。已改正測試。
2. Prettier 未過：6 支新腳本與 `waivers.json`。已對這些檔做 targeted `prettier --write`，不是 `prettier --write .`。
3. ESLint：未使用的 `ADAPTER_ROOT` import、YAML indent regex 空格、`existingNames` 無用初值。已修。

## 對抗驗收 A–N

| ID | 結果 | 證據 |
| --- | --- | --- |
| A UI 任務不載入後端安全史 | `PASS`（結構） | `docs/INDEX.md` frontend/UI 路由只指 design／ADR-0001／0003／ui-check |
| B API／domain 仍看得到安全不變式 | `PASS`（結構） | INDEX API/domain 路由 + `.claude/rules/domain-and-api.md` 仍列 write path／outbox／Calendar／Rules／roles／UTC／completed |
| C 部署任務仍看見部署禁令 | `PASS`（結構） | INDEX deployment 路由 + AGENTS Safety Floor 第 8 條與 Remain disabled |
| D D-series 不得猜 | `PASS`（結構） | Safety Floor 第 7 條；INDEX「Owner input is not approval」 |
| E 歷史證據不得覆蓋 live Canon | `PASS`（結構） | `GOVERNANCE.md` 衝突解析第 4 點 |
| F 產生現況不得覆蓋決策登錄 | `PASS`（結構＋機械） | 投影標 `generated: true`；`check:governance` 比對來源 hash；不解析 D-series 核准 |
| G Claude 仍發現 rules／skills | `PASS`（結構）／runtime `NOT VERIFIED` on this tree | `.claude/rules` 與五個 skills 仍在；`move_agent_to_root` 未成功，本 session 工作區仍是 booking checkout |
| H Grok 發現 AGENTS 與 Claude 相容層 | 結構相容；runtime `NOT VERIFIED` | 無 `grok inspect`、無 Grok Build |
| I Codex／Kimi adapter 結構 | `PASS`（機械） | 五個 `.agents/skills/*/SKILL.md` 僅 Codex-safe keys；`metadata.*` 皆字串；Kimi 發現路徑仍是 `.claude/skills` |
| J 沒有兩份獨立維護的 skill 正文 | `PASS` | `.claude/skills` 為 Canon；`.agents` 由產生器 `--check` 釘住 |
| K 無關中文不變 | `PASS` | 既有中文檔的 diff 僅 `document-lifecycle.md` 表格加列與 `docs/README.md` 索引；無 U+FFFD、無 BOM、新檔 LF |
| L CI 執行力未削弱 | `PASS`（本機） | `verify` 在 `check:docs` 之後插入 `check:governance`；未刪既有 gate；未改 workflow required jobs |
| M 無產品／runtime／cloud 變更 | `PASS` | `git status` 無 `apps/` 產品、lockfile、terraform、workflow |
| N Cursor 技能名稱唯一性 | `NOT VERIFIED`／若雙根皆載入則 `FAIL` | Cursor 3.18.9（VS Code 1.128.0，distro `d5c0e77a`）。交付樹上 `.claude/skills` 與 `.agents/skills` 同名五個（verify-gates、root-cause、ui-check、closeout、handoff-record）是設計如此。**不得為未驗證的 client 改 Canon。** 本 conversation 的 Cursor 工作區仍是 `beauessence-appointment-platform-fresh`，不是此 worktree。 |

## 未處理事項

1. `SECURITY.md`：沒有已核准的安全聯絡／披露政策。
2. 遠端 GitHub：CODEOWNERS 只是 ownership declaration; non-blocking approval。未改 branch protection／rulesets。
3. Rule 1 出版衝突：仍未廢止；見 `docs/state/conflicts.md` GC-001。CONTRIBUTING 仍寫「私有且唯一」。
4. Production provenance／attestation：非本任務。
5. GOV-R01：非本遷移核准。
6. 尚未 commit／push／開 PR；因此沒有此變更的 `CI-VERIFIED`。
7. Cursor 在交付樹上的技能發現尚未演練。

## 本機環境陷阱

1. `clinic-governance-v2` 的 `corepack pnpm install --frozen-lockfile` 在複製 `@axe-core/playwright` LICENSE 時 EPERM（pnpm store `F:\.pnpm-store`）。
2. `corepack pnpm run …` 看到 junctioned `node_modules` 會要 purge；**禁止**對 junction 設 `CI=true` 後再 `pnpm run`，以免沿 junction 清掉 `beauessence-appointment-platform-fresh` 的依賴。
3. 本機驗證是用 `node`／`node_modules/.bin` 展開 `verify`，外加 lockfile 隔離目錄跑 `pnpm audit`。
4. `test:rules` 的 Firestore Emulator 仍不能在 CJK 路徑工作；需 `subst` ASCII 盤符。
5. 容器 `F:\診所專案\` 不是 git repo。不要改 `beauessence-appointment-platform`（另一 Windows 帳號）。不要從私有 repo 複製到 public mirror。

## 本階段記錄的決策與剩餘風險

- 權威是 **scope 矩陣**，不是 enforcement 總排序。hooks／tests／CI 不是 Canon。
- 出版不變式：Every committed file MUST be safe for publication. Repository visibility is dynamic state and must not be inferred from AGENTS.md.
- CODEOWNERS 可影響 reviewer routing，**不**啟用 required code-owner approval。
- 剩餘風險：Cursor 若同時載入 `.claude/skills` 與 `.agents/skills`，同名技能會重複曝光。這是 adapter 設計，不是授權去刪 `.agents`。

## 下一位接手者的第一步

1. 在 `F:\診所專案\clinic-governance-v2` 檢視 `git status`，確認只含治理檔。
2. 若要提交：依 CONTRIBUTING 開 commit（本交接未授權 commit）。
3. Push 後看該 commit 的 `Verification evidence`；綠了才能稱 `CI-VERIFIED`。
4. 下一個已授權 Roadmap ID：**無**。待核准：GOV-R01、Rule 1 廢止或恢復私有、SECURITY.md 聯絡政策、遠端 protection。

目前 Stage 位置是否改變：**否**。
