# UI 技能國際視覺標準補強交接

2026-10-08：補強設計、動效與文案技能，以經查證的評審獲獎作品研究及實際畫面批判
支援業主要求的國際比賽完成度；撤掉未獲業主接受的自製教學頁，沒有修改官網。

## 交付範圍與版本

分支 `agent/clinic-visual-direction-20261006`；[PR #243](https://github.com/waydefu/clinic/pull/243)。
本輪起點為 `a2886b58e39e81ff8e305098813402bc176db351`；main 來源為
`2f9360cf5d670879b98705cd9a3b04eb71fe20bd`。本次文件版本的 commit 須另查，
請用 `git log -- docs/reviews/2026-10-08-ui-skills-award-benchmark-handoff.md`
及 PR head 查交付版本。未授權合併 PR；沒有本輪 PR merge commit。
技能補強先提交於 `009c7e9bef6d5fd26036e71c1c22adf9c3d0b457`，隨後整合新 main
`ede751bd64d1ba213e5584908033aa51d8ee5ec9`（#241）。docs/README 同位置新增紀錄
造成 PR 衝突，已保留兩邊紀錄及 main 更新的 SDK 狀態；本地分支整合不是合併 PR。

- [ui-design](../../.claude/skills/ui-design/SKILL.md)：加入中文字體、比例、色彩與動作層級，
  以及[獲獎作品研究](../../.claude/skills/ui-design/reference/award-benchmarks.md)。
- [ui-motion](../../.claude/skills/ui-motion/SKILL.md)：以內容關係及正常播放研究選動效；
  相容性測試與現有輪播不代表達到視覺標準。既有 Anime.js 模組成本、CSP／Trusted Types
  與生命週期研究仍保留，沒有安裝框架或加入網站依賴。
- [ui-content](../../.claude/skills/ui-content/SKILL.md)：新增白話繁體中文、來源含義保留、
  真正的比較軸及完整圖像的 HTML 等價資訊方法，沒有虛構範例文案或醫療審閱授權。
- [ui-check](../../.claude/skills/ui-check/SKILL.md)：舊截圖只做技術回歸，不能定義視覺成功。
  `.agents` 使用現有 generator 的 8 份 SKILL adapter；reference 只留 `.claude` canonical copy。

## 證據與覆蓋限制

此紀錄寫入時的證據層級為 `GATE-VERIFIED`。完整 exact-head CI 從
[PR checks](https://github.com/waydefu/clinic/pull/243/checks) 及該 head 的
`Verification evidence` 另核，不能用舊 head 的綠燈代替。

| 關卡／研究 | 狀態 | 實際範圍 |
| --- | --- | --- |
| Skill schema | PASS | 4 次 quick_validate：ui-design、ui-motion、ui-content canonical，ui-check adapter；Python UTF-8 mode |
| Adapter generation | PASS | 8 份 SKILL.md 與現有 generator 一致，沒有複製 reference 或改 generator |
| Governance | PASS | 整合 main 後 INDEX 6127 bytes；既有 AGENTS 8096 bytes／151 lines、CLAUDE 10667 bytes／214 lines advisory 保留 |
| Structure | PASS | 361 required files、17 正式 reference PNG；verify 順序與 Node engine 宣告檢查 |
| Clinic freeze | PASS | 30 份 frozen files hash 檢查，沒有更動正式 clinic／booking |
| Docs／tracked secrets／whitespace | PASS | 整合 main 後 297 份文件的連結／index／lifecycle；1222 份 tracked files secrets 掃描；staged diff whitespace |
| Full verify／format／lint／rules／E2E／supply-chain／SAST | NOT_RUN | 本機 checkout 無 node_modules，Node 24.15.0 低於專案 24.20.0；不隱式安裝，移至 required PR CI |
| 獲獎來源 | PASS | 3 個 CSSDA WOTD 個別評審紀錄；Hyoumankind 的 AGDA 2024 Digital Distinction 官方結果；獎項與現行版分開 |
| 畫面研究 | PASS | Beethovenstrasse／Hyoumankind 現行 1440×1000、375×1000；Hyoumankind 發表之靜態圖；Praxis 1440×1000 與 375×812 首屏／選單 |
| 完整正常動效影片／手機全頁／實機無障礙 | NOT_RUN | Praxis 開場錄影未從頭到尾審閱、375 下方未抽樣；Beethovenstrasse 首屏影片停在 loading；Hyoumankind 歷史動效僅有作者描述 |
| 本診所國際等級視覺驗收／醫療審閱／production | NOT_RUN | 此輪只補技能及研究，不以文件、獎項連結、Luna 意見或 CI 代替實際設計與業主接受 |

可移轉的研究結果及來源已寫進 canonical reference；本機 PNG／WebM／觀察 JSON
在 `F:/診所專案/output/playwright/award-benchmark-20261008/`，沒有把第三方素材
放進 repo。未發佈研究媒體，沒有新的可攜正式驗收 artifact 或其 SHA-256 可宣稱。

## 真缺口與接手第一步

業主將自製範例評為 0 分：這些頁面不能作為後續設計 authority，已撤掉頁面、圖片副本、
範例連結及預覽 server。既有官網付費原圖沒有刪除。技能現在要求拿實際候選頁比較，
首頁先完成 screenshot → critique → structural revision，才延伸五個不同構圖。
本輪沒有把任何候選頁宣稱為已達國際比賽水準。

下一位先核 PR #243 當前 head 的完整 CI，然後在原設計／prototype 授權內檢視首頁
1440／375，依 canonical visual-review 記錄最弱三處並重新構圖。正式整合仍須八條
clinic route 回歸；醫療來源／審閱由診所負責。沒有新增 Roadmap ID、改 Stage 或
擴充 production authority；booking 是既有分開的專案邊界。保留既有字體 0 KiB 與
200 KiB／20 KiB JS／14 KiB CSS／180 KiB images／14 images 預算。

本機陷阱：quick_validate 預設 CP950 會讀 UTF-8 失敗，使用 `python -X utf8`；
generated SKILL 不含 reference 子目錄，必須連回 canonical；舊 CI 綠燈及獲獎網站
現行版都不能證明新 head 或歷史版本。PR API 的 base.sha 在本次未反映新 main，
須讀實際 main ref／fetch；有 merge conflict 時 pull_request 驗證不會啟動。
整體設計與實機驗收仍由後續實作／業主審閱關閉。
