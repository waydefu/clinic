# 文件生命週期與證據規則

**狀態：** 現行規則  
**適用範圍：** repository 內全部 Markdown 與由 CI／部署驗證產生的證據

這份規則用來回答兩件事：哪一份文件可以指揮現在的工作，以及一個「已通過」的說法
至少要帶什麼證據。文件很多不是問題；把過期檢查結果當成現況才是問題。

## 1. 文件類型

| 類型 | 可以做什麼 | 位置／例子 |
| --- | --- | --- |
| **現行權威** | 定義目前範圍、邊界與下一步；衝突時優先 | `roadmap.md`、Phase 1 執行計畫、決策登錄、ADR、runbook、根目錄 `GOVERNANCE.md`（僅 meta-governance）、`AGENTS.md` Safety Floor、根目錄 `SECURITY.md`（僅報告受理程序） |
| **產生的現況投影** | 由機器來源產生的檢索輔助；不可覆蓋決策登錄、ADR、roadmap 或 Safety Floor | `docs/state/current.json`、`docs/state/current.md` |
| **未決治理衝突** | 記錄尚未由 owner 關閉的 dated／current 衝突；不是 Canon | `docs/state/conflicts.md` |
| **受決策限制的設計** | 描述核准後怎麼做；不得被當成已啟用 | 標有 `plan-only`／「計畫」的架構文件與 IaC |
| **日期證據** | 證明某日期、某 commit 做過什麼；不自動代表現在仍相同 | `docs/reviews/` 中的 dated review／checkpoint |
| **草稿／待核准** | 供審核，不代表診所已同意 | 隱私政策草稿、approval packet |
| **已取代** | 只保留脈絡，不得用來決定新工作 | `docs/archive/` 與索引的「Superseded」 |

`docs/reviews/phase-1-approval-gate.md` 是路徑上的歷史例外：它是**現行 gate**，不是
日期證據。新文件不得再把 live register 放進 `reviews/`。

## 2. 閱讀與更新規則

1. 先讀[文件索引](README.md)的「Start here」，再讀任務直接涉及的現行權威文件。
2. 日期證據只能回答「當時驗證了什麼」。若現況已變，新增較新的證據，並更新
   roadmap／runbook 的現況；不得只改舊 review 讓歷史看似一直正確。
3. 已取代文件只可由「Superseded」索引，不得從現行操作步驟引用。
4. `plan-only`、草稿、未演練及未接線必須直接寫在狀態或相鄰段落，不能藏在頁尾。
5. 動態事實（測試數、部署網址、掃描結果、雲端設定）要附日期與可追溯來源；沒有
   權限讀遠端結果時，claim 寫 `UNVERIFIED`，不得由本機成功推論遠端成功。

狀態語意不得混用：`NOT_RUN` 表示本輪有意未執行檢查；`UNAVAILABLE` 表示檢查所需的
系統、權限、URL 或環境不可存取；`UNVERIFIED` 表示某一動態 claim 缺少足以支持它的
同 commit／environment 證據。前兩者是 gate／attempt 狀態，後者是 claim／evidence
狀態；不能用 `UNAVAILABLE` 暗示 claim 為真，也不能把 `UNVERIFIED` 當成 gate 通過。

任何能力的狀態必須拆成四個互不替代的維度：

1. **決策是否核准**；
2. **是否完成實作**；
3. **是否有同一 commit／environment 的驗證證據**；
4. **是否取得部署或真實資料 authority**。

例如「SEC-02 policy approved」不等於 SAST 已是 required merge check；「D-010 target
approved」不等於已建立 cloud resource 或達成 RPO/RTO。動態陳述至少要記錄 `as-of`、
commit／environment、涵蓋範圍、owner、evidence 及 expiry／next review。無法讀遠端時
使用 `UNVERIFIED`，不能只寫「目前」或「已完成」。

`scripts/check-docs-links.mjs` 會阻止斷鏈、漏登索引、review 漏放在證據區、archive
漏放在 Superseded，以及已知的過期現況敘述重新出現。

## 3. 機器產生的證據

| 證據 | 產生方式 | 保存 |
| --- | --- | --- |
| CI 完整驗證 | `verify` workflow 的 `Verification evidence` job | GitHub artifact 90 天；同時寫 job summary |
| Semgrep CE SAST | `sast-scan.yml` 的 commit-bound JSON／SARIF／summary（由 `verify` workflow 的 `sast` job 在同一個 run 內產生；每週排程與手動觸發走 `sast.yml`） | GitHub artifact 90 天；**自 2026-08-18（`SCM-R01`）起被唯一 required 的 `Verification evidence` 依賴**，紅的 SAST 會擋下合併 |
| 合成預覽 | `pnpm verify:preview -- <preview-url>` | 本機 `output/evidence/`，依 review／交付需要另行保存 |

證據 JSON 至少綁定 commit SHA、時間、執行／部署網址、必要檢查與結論。
`output/evidence/` 不進版控，避免每次執行產生沒有審查價值的 diff；正式交付時應保存
CI artifact 或把摘要登記到新的 dated review。

## 4. 不可越界的結論

- Emulator 的邏輯還原演練不等於 cloud backup、PITR、IAM 或跨區災難復原成功。
- preview 驗證不等於 production deployment，也不授權處理真實資料。
- workflow 設定存在不等於 GitHub run 成功或 required。Semgrep CE 是規則式分析，
  不等同 CodeQL 的跨檔 taint/data-flow；兩者是否可用、是否 required 仍須讀實際
  repository 權限、ruleset 與同一 commit 的 run。
- 自動 axe 成功不等於螢幕閱讀器、強制色彩及人工鍵盤驗收成功。
- 所有 D-series 決策只有[決策登錄](product/phase-1-decision-register.md)能關閉。
