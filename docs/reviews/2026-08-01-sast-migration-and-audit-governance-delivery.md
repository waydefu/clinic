# 階段交接紀錄：SAST 換軌、稽核例外治理與相依修補 — 2026-08-01

**狀態：已交付並併入 `main`。這是有日期的交付證據，不是上線核准。**
本階段對應[全專案執行書](../product/full-project-execution-book-2026-07-31.md)的
**階段 0 步驟 0-1 至 0-5**。步驟 0-6（公開鏡像同步）與 0-7（把關腳本補測試）尚未執行。

## 1. 一句話

把無法產生證據的 CodeQL 關卡換成綁定 commit 的 Semgrep 掃描、修掉三筆中風險相依
漏洞、替稽核例外建立具名且有到期日的治理閘門，並補上四份規劃與導航文件；全部通過
本機與 CI 驗證後併入 `main`。

## 2. 交付的修訂版本

| 欄位 | 值 |
| --- | --- |
| 分支 | `agent/local-hardening-and-handoff` → `main` |
| Pull request | [#1](https://github.com/waydefu/clinic/pull/1) |
| Merge commit | `f653535` |
| 合併時間 | 2026-08-01 03:39（Asia/Taipei） |
| 合併方式 | merge commit（保留三個 commit，可逐一 revert） |

| commit | 內容 |
| --- | --- |
| `007d808` | CodeQL 工作流程換成 Semgrep CE、重寫證據產生器測試、修 `check:secrets` 崩潰、ESLint 排除規則 fixture |
| `066cc2a` | 三筆 moderate 相依升級、稽核例外治理閘門、四份新文件與導航更新 |
| `7497ef2` | SEC-02 與 SEC-03 的核准紀錄 |

## 3. 驗收證據

### 本機

| 關卡 | 結果 |
| --- | --- |
| `verify` | 全綠。結構 190 檔、架構、UI 守衛、對外頁面、設計 token、文件 98 檔、密鑰 374 檔、格式、lint、型別建置、效能預算 |
| `test:unit` | 46 檔 / 667 項通過（起點 45 檔 / 654 項） |
| `test:rules` | 6 檔 / 66 項通過（Emulator，需 ASCII 路徑，見 §5.2） |
| `check:supply-chain` | 通過。SBOM 920 components／80 runtime，授權政策 3 筆已審視例外 |

### CI（對同一 commit）

六個必要檢查全部通過，含 `Verification evidence`。Semgrep 首次實跑結果：
**82 條規則掃 150 個檔案，0 findings**，載入規則數與設定宣告的 82 相符。

### 相依漏洞

合併後 Dependabot 狀態：

| 套件 | 嚴重性 | 狀態 |
| --- | --- | --- |
| `@opentelemetry/core` | moderate | fixed |
| `@hono/node-server` | moderate | fixed |
| `tar` | moderate | fixed |
| `brace-expansion` | high | 警示已 withdrawn，原因見 §6 |

## 4. 過程中發現並修好的真缺陷

這些不是需求，是執行時撞出來的。四項都已修復並附測試。

1. **`check:secrets` 在髒工作區崩潰。** `git ls-files` 讀的是 index，會列出「已在版控、
   工作區已刪除」的檔案，直接 `readFile` 會 ENOENT，讓整個 gate 以「掃描失敗」結束。
   把本機刪檔誤報成掃描失敗，久了會有人習慣性跳過這道關卡。已改為明確跳過並回報
   跳過數量。
2. **ESLint 誤檢 Semgrep 規則測試檔。** 那些 `eval` 與 shell 注入是故意放的正向測試
   案例，用來證明規則抓得到。誤檢只會逼人加 disable 註解，反而弱化規則測試本身。
   已排除並寫明理由。
3. **`eslint.config.mjs` 註解仍指向已刪除的 CodeQL 工作流程。**
4. **SAST 證據產生器的測試從未對現行程式跑通過。** 測試用的是已被拆成 local／upstream
   兩組的舊 `SAST_RULE_CONFIGS`，且未傳入 `ruleFiles` 與 `ruleManifestRaw`，導致所有
   案例都停在 `invalid-evidence`——**分類邏輯一條都沒有被驗證過**。這對 SEC-02 有實質
   影響，因為該核准的前提之一就是「規則正反測試」。已改寫並補上四個原本零覆蓋的路徑：
   規則檔缺漏、manifest 被重排、規則測試失敗、SARIF 載入規則數與宣稱數不符。

**尚未處理的一項**：`apps/api/src/health.controller.test.ts` 在高負載批次中曾 5 秒
逾時，單獨執行僅 327 毫秒。這是把 `scripts/**` 納入同一個 `maxWorkers: 1` 執行序後的
負載效應。**不應以調高 timeout 掩蓋**；應拆分執行序或明確標記追蹤。列為待辦。

## 5. 本機環境發現（給下一位接手者）

### 5.1 `D:\診所專案\` 底下三個相似資料夾，只有一個是現行的

| 資料夾 | 用途 |
| --- | --- |
| `beauessence-appointment-platform-fresh` | **現行工作區**，對應私有權威 repo `waydefu/clinic` |
| `beauessence-appointment-platform` | 停用的舊副本，最後修改 2026-07-28 |
| `appointment-platform-public` | 公開去識別化鏡像的本機副本，與私有 repo 無自動同步 |

關於舊副本，2026-08-01 查證結果：

1. **它屬於另一個 Windows 帳號**（SID `S-1-5-21-4168444489-…`，現行帳號為
   `S-1-5-21-2675489711-…`），git 以 `dubious ownership` 拒絕操作。專案負責人表示
   **可能是 Codex 在使用**。
2. **資料上沒有獨有內容。** 三個分支 `main`、`clinic-site-integration`、
   `web-standards-remediation-2026-07-26` 的 commit（`4349a659c5`、`f40b5aed38`、
   `c196b9aee2`）全部都能在現行工作區或 `origin` 找到；工作區乾淨。20.7 MB，扣除
   `node_modules` 僅 351 檔。
3. `D:\診所專案\.codex-review\` 是 Codex 於 2026-07-23 產生的審查素材，與舊副本無關，
   未更動。

**結論：刪除的阻礙不是資料遺失風險，而是「可能有其他工具或帳號正在使用」加上權限
不足。** 未經專案負責人再次明確確認前不得刪除，也不得以提權方式繞過。

### 5.2 Firestore Emulator 無法在含非 ASCII 字元的路徑啟動

從 `D:\診所專案\…` 執行 `test:rules` 會立即失敗：

```text
java.io.FileNotFoundException: D:\????\beauessence-appointment-platform-fresh\firestore.rules
```

同一個 emulator、同一個 jar（v1.22.0）、同一份 `firestore.rules`，從 ASCII 路徑啟動
成功、從含中文的路徑失敗；`JAVA_TOOL_OPTIONS=-Dsun.jnu.encoding=UTF-8` 無效。繞法是
`subst` 一個磁碟代號、跑完移除。**這是本機限制，Linux CI 不受影響，絕不能當作跳過
這道 gate 或宣稱規則未測試的理由。**

## 6. 合併後立即出現的變化：SEC-03 的前提已不成立

合併完成後查核 Dependabot，`brace-expansion` 的高風險警示（#4）回傳
`Alert number 4 has been withdrawn`。追查後確認：

- advisory **本身沒有被撤回**（`withdrawn_at` 為 null）；
- 它在 **2026-07-31T19:37:57Z**（合併前約兩分鐘）被更新；
- 更新後的受影響範圍與修補版為：

| 受影響範圍 | 首個修補版 |
| --- | --- |
| `< 1.1.17` | 1.1.17 |
| `>= 2.0.0, < 2.1.3` | 2.1.3 |
| `>= 3.0.0, < 3.0.3` | 3.0.3 |
| `>= 4.0.0, < 5.0.8` | 5.0.8 |

本專案 lockfile 目前解析到 `1.1.16`、`2.1.2` 與 `5.0.8`，其中前兩者仍低於修補版。

**因此 SEC-03 的核准理由「舊 major 沒有相容修補版」已不成立**，而登記表所寫的解除
條件「上游舊 major 發布修補後即移除」已經達成。目前 0 個 open alert 很可能只是重新
分析前的暫時狀態。

**建議處置（尚未執行，待核准）**：以 override 將 `brace-expansion` 拉到 `1.1.17` 與
`2.1.3`，同時移除 `pnpm-workspace.yaml` 的 `auditConfig.ignoreGhsas` 條目與
`security/audit-exceptions.json` 的登記，讓 SEC-03 從「已接受的風險」轉為「已解決」。

## 7. 本階段記錄的決策

| ID | 內容 |
| --- | --- |
| SEC-02 | 已核准 2026-08-01，含 ENG-01 追加條件 |
| SEC-03 | 已核准 2026-08-01，2026-08-31 到期；但見 §6 |
| ENG-01～ENG-04 | 技術負責人工程實務決策，見決策登錄 |

三項剩餘風險已如實記錄，未被淡化：Semgrep CE 不具備 CodeQL 的跨檔案汙染追蹤；
SEC-02／SEC-03 由同一人兼任兩個核准角色，等於單次審查而非兩組獨立審查；ENG-03 的
識別碼設計仍需在持久化切片前補 ADR。

## 8. 下一位接手者從這裡開始

| 順序 | 待辦 | 卡在哪 |
| --- | --- | --- |
| 1 | §6 的 `brace-expansion` 升版與例外移除 | 待核准，需新分支與新 PR |
| 2 | 步驟 0-6：公開鏡像同步 | 需重跑完整 release gate，不會自動發生 |
| 3 | 步驟 0-7：其餘把關腳本補測試 | 依 CONTRIBUTING 第 8 條，優先 `check-structure.mjs`、`check-docs-links.mjs` |
| 4 | §4 最後一項：API 健康檢查測試的不穩定性 | 需決定拆執行序或標記追蹤 |
| 5 | 回收兩份決定清單、召開 C0 | 需業主與各負責人 |

目前位置不變：**Stage 1**。本階段沒有建立任何雲端資源、沒有開啟任何路由、沒有接觸
任何真實病患資料。
