# 文件生命週期與證據規則

**狀態：** 現行規則  
**適用範圍：** repository 內全部 Markdown 與由 CI／部署驗證產生的證據

這份規則用來回答兩件事：哪一份文件可以指揮現在的工作，以及一個「已通過」的說法
至少要帶什麼證據。文件很多不是問題；把過期檢查結果當成現況才是問題。

## 1. 文件類型

| 類型 | 可以做什麼 | 位置／例子 |
| --- | --- | --- |
| **現行權威** | 定義目前範圍、邊界與下一步；衝突時優先 | `roadmap.md`、Phase 1 執行計畫、決策登錄、ADR、runbook |
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
   權限讀遠端結果時，寫「未確認」，不得由本機成功推論遠端成功。

`scripts/check-docs-links.mjs` 會阻止斷鏈、漏登索引、review 漏放在證據區、archive
漏放在 Superseded，以及已知的過期現況敘述重新出現。

## 3. 機器產生的證據

| 證據 | 產生方式 | 保存 |
| --- | --- | --- |
| CI 完整驗證 | `verify` workflow 的 `Verification evidence` job | GitHub artifact 90 天；同時寫 job summary |
| CodeQL | `codeql` workflow 的 `codeql-verification-evidence` | GitHub artifact 90 天；finding 留在 code scanning |
| 合成預覽 | `pnpm verify:preview -- <preview-url>` | 本機 `output/evidence/`，依 review／交付需要另行保存 |

證據 JSON 至少綁定 commit SHA、時間、執行／部署網址、必要檢查與結論。
`output/evidence/` 不進版控，避免每次執行產生沒有審查價值的 diff；正式交付時應保存
CI artifact 或把摘要登記到新的 dated review。

## 4. 不可越界的結論

- Emulator 的邏輯還原演練不等於 cloud backup、PITR、IAM 或跨區災難復原成功。
- preview 驗證不等於 production deployment，也不授權處理真實資料。
- workflow 設定存在不等於 GitHub run 成功；CodeQL 是否可用仍要看實際 repository
  權限／方案。
- 自動 axe 成功不等於螢幕閱讀器、強制色彩及人工鍵盤驗收成功。
- D-001～D-011 只有[決策登錄](product/phase-1-decision-register.md)能關閉。
