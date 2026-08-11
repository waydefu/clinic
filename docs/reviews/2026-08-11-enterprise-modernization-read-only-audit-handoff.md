# 企業級現代化唯讀稽核交接紀錄（2026-08-11）

**狀態：** 日期化稽核與文件交接證據；不是實作、上線或真實資料核准。  
**稽核日期：** 2026-08-11（Asia/Taipei）  
**基準分支／commit：** `agent/clinic-homepage-seo`／`cf597af977c9a96759552ee1e401bb784782cd70`  
**權威基準狀態：** 暫定，仍需 `GOV-R01`／Q-01 由 owner 確認。

## 一句話

以唯讀方式完成 repository、前後端、資料、SRE、AppSec、供應鏈、QA、無障礙與隱私的企業級現代化稽核，交付共用 ID 的 Markdown／Word／Excel；本輪只獲准更新 Markdown 文件，沒有修正 47 項程式或部署 finding。

## 階段／步驟與目前位置

- 階段／步驟編號：2026-08-11 enterprise modernization read-only audit；不是既有 Stage 的完成宣告。
- 對應執行書：§10.4 階段交接格式；後續執行以報告 `GOV-R01` 起始。
- Stage 位置：**不變**。仍為 Stage 1 owner decisions；C0 為 `revise`、C1～C6 為 pending，無 cloud／real-data／protected-route authority。
- 本文件不能關閉 D-series、C0～C6、Expansion S 或任何 Roadmap ID。

## 交付的修訂版本

- 稽核基準：`cf597af977c9a96759552ee1e401bb784782cd70`。
- 本文件與完整稽核 Markdown 會位於本輪 documentation commit；commit hash 無法自我寫入同一 commit，請以 `git log -- docs/reviews/2026-08-11-enterprise-modernization-read-only-audit-handoff.md` 取得。
- PR：沿用既有 Draft PR [#14](https://github.com/waydefu/clinic/pull/14)，branch 為 `agent/clinic-homepage-seo`；本輪 documentation commit 以 `git log -- <本檔>` 取得，merge 仍未獲核准。
- 未更動任何 runtime source、test source、workflow、JSON/YAML、lockfile、database、cloud 或 deployment 設定。

## 交付產物與 SHA-256

| 產物 | 位置／SHA-256 | 備註 |
| --- | --- | --- |
| Repository Markdown 敘事／索引 | `docs/reviews/2026-08-11-enterprise-modernization-audit.md`／`A1480942F7A264A8BAAFF0A8C0A90602CD1ACDE2E1577BE56747AC3FC35BC4AE` | GitHub 可攜、20 章、共用 ID；內容與外部 Markdown 相同，不替代 Excel 的 field-level tables。 |
| 外部 Markdown 敘事／索引 | `D:\診所專案\audit-deliverables-2026-08-11\診所網站企業級現代化技術稽核與Roadmap_2026-08-11.md`／`A1480942F7A264A8BAAFF0A8C0A90602CD1ACDE2E1577BE56747AC3FC35BC4AE` | 本機交付副本；已同步為與 repository 版逐位元組相同；不可作唯一可攜位置。 |
| Word | `D:\診所專案\audit-deliverables-2026-08-11\診所網站企業級現代化技術稽核與Roadmap_2026-08-11.docx`／`8B1289C769F6BB75C05D0C63959AC511CFAC9210E59820FB41F110C5BC9C10EA` | 67 頁敘事版；產生於 14:32 GitHub 補查前。 |
| Excel | `D:\診所專案\audit-deliverables-2026-08-11\outputs\audit-20260811\診所網站企業級現代化技術稽核工作簿_2026-08-11.xlsx`／`E128BB5FFD811C732BD41DD822F1219B4B31875CEEB57D7072F3B36E520F52CC` | 21 sheets；47 issues、29 capabilities、87 option rows、38 roadmap rows；產生於 GitHub 補查前。 |

Word／Excel 位於 repository 外的 `D:\診所專案\audit-deliverables-2026-08-11`（Excel
在其 `outputs\audit-20260811` 子目錄），不會被本次 Git commit 或 push 自動上傳。
兩個 binary 是同日較早快照；其中 QA-02、SCM-006/007、UV-04 的遠端狀態由最新
repository／external Markdown 的 14:32 GitHub 補查取代。本輪僅獲准更新 Markdown，
未重產 Word／Excel。

**Markdown 之後追加的兩項更正（binary 沒有，以 Markdown 為準）：**

1. `SCM-006` 補上稽核基準 commit 自身 CI 的 `pnpm audit` 結果——10 筆、含 1 筆
   high（`postcss@8.5.20` 帶入的 `nanoid 3.3.16`，`GHSA-2v37-7h3g-55p8`）。
   Dependabot API 的 9 筆不含 high，兩者不一致以 CI 為準；嚴重度由「中」提高為
   「高（阻擋 merge）」。
2. 新增 P0 項 `SCM-R05`（修綠 dependency audit gate，並為 `SCM-R01` 的前置）。
   Roadmap 因此由 38 筆增為 **39 筆**；Excel `Roadmap` 仍是 38 筆的較早快照。
   同時修正三處把 Dependabot triage 誤指到 `SCM-R03`（該 ID 實為 Gitleaks 密鑰掃描）
   的引用：稽核報告 §1、`docs/roadmap.md`、`docs/architecture/web-quality-gates-2026-07-24.md`。

除上述兩項與該 ID 更正外，問題 ID、能力、選項與 Roadmap 結構未變。仍未修改任何
程式、lockfile、workflow 或部署設定。

## 稽核覆蓋

- README、規則、ADR、decision register、architecture/product/legal/runbook/review 文件。
- Monorepo/module、runtime/package/lockfile、build/lint/type/format 設定。
- Public routes、API、auth seam、RBAC、data flow、Firestore transaction/audit/idempotency/outbox、Calendar adapter。
- CI/CD、SAST、SCA、secrets、SBOM、IaC plan、Hosting/CSP/noindex。
- Unit/Rules/E2E/performance/accessibility 測試原始碼與 dated evidence。
- CSS、tokens、responsive、SEO/i18n、assets、dead-code candidates。
- 46 筆 2026-08-11 官方技術、標準、lifecycle、安全與法規來源。
- 2026-08-11 14:32 +08:00 唯讀 GitHub repository metadata、branch protection、PR #14 checks 與 Dependabot alerts；未變更任何遠端設定。

## 每道關卡的實際結果

| Gate／檢查 | 狀態 | 實際數字／理由 | 後續 owner／authority |
| --- | --- | --- | --- |
| Build／format／lint／type／unit | `NOT_RUN` | 唯讀稽核明確禁止 package command；沒有以舊結果冒充 HEAD。 | User 核准具名 Roadmap ID 後由 QA＋FE/BE owner 執行。 |
| Firestore Rules／integration | `NOT_RUN` | 未啟動 Emulator；只讀原始碼與 dated evidence。 | User 核准 `DATA-R01/02` 或 `ARC-R01` 後由 Backend＋Data＋QA 執行。 |
| E2E／browser／axe／performance | `NOT_RUN` | 未啟 server/browser；人工 AT／實體裝置亦 0 次。 | User 核准 `WEB-P0-02/03` 或 `WEB-30-02` 後由 QA＋A11Y＋FE 執行。 |
| SAST／SCA／secrets／SBOM regeneration | `NOT_RUN` | 未跑 scanner、audit 或 generator；只核對 workflow/code/evidence wiring 與既有 CI log。 | User 核准 `SCM-R05`（先）、`SCM-R01/03/04` 後由 AppSec＋CI owner 執行。 |
| DAST／load／chaos／restore／failover | `NOT_RUN` | 無 authority、runtime 或 cloud access。 | Clinic/Product deployment authority＋AppSec/SRE owner；不得由文件核准取代。 |
| GitHub repository metadata | `PASS` | `main`=`27645a3`；唯一 required context=`Verification evidence`；無 ruleset；PR #14 head=`cf597af`；9 open dev-scope Dependabot alerts。 | Repository owner；快照到期即重查。 |
| 稽核基準 commit 的遠端 CI 狀態 | `FAIL`（唯讀讀取，未重跑） | PR #14 head `cf597af`：11 檢查中 9 綠；`Tracked secrets、dependency audit 與 inventory` 與 required `Verification evidence` 為紅。原因為 `pnpm audit --audit-level high` 的 `10 vulnerabilities — 1 low / 8 moderate / 1 high`，high 是 `nanoid`（`<3.3.17`，`GHSA-2v37-7h3g-55p8`）經 `postcss@8.5.20` 進入 dev 工具鏈；`audit:prod` 為 0 筆。**該 branch 目前無法 merge。** | User 核准 `SCM-R05` 後由 AppSec＋Maintainer 執行；本輪未修。 |
| 正式／staging／GCP/Firebase read-only | `UNAVAILABLE` | 未提供 URL 或雲端只讀權限；不由 source tree／GitHub 狀態推論。 | Clinic/Product＋Cloud owner 提供具名只讀 authority、URL／project／environment。 |
| 靜態 repository 稽核 | `PASS` | 已完成且帶 findings：47 issues、29 capabilities、87 decision rows、18 refactors、6 dead-code candidates、15 optimizations、**39** roadmap items（含後補的 `SCM-R05`；Excel 快照仍為 38）。 | Architect＋各 finding owner；不等於 finding 已修。 |
| 文件產物驗證 | `PASS` | Word 67 頁、Excel 21 sheets／21 previews；Markdown 20 章；binary 的 GitHub remote 欄位是 14:32 前快照。 | Document owner；以 SHA-256 與交接限制驗收。 |

最近一次可引用但不能外推的歷史證據為 2026-08-10：60 test files、958 unit tests，以及該交接所列部分 E2E；它不是本輪執行結果。

## 發現的真缺陷與是否已修

以下均為靜態高信心 finding，**本輪未修程式**：

1. `DATA-001`：Firestore slot release 寫 `reservationId:null`，domain 將任何 defined 值視為 reserved；取消／no-show／改期後可能無法重訂。
2. `DATA-002`：audit/outbox occurrence ID 由狀態／target 派生；合法狀態循環會重用 ID，audit `create` 令整筆 transaction 回滾或 outbox 覆寫。
3. `ARC-001`：worker lease 無 owner/fencing，A 過期、B 接手後 A 仍可 unconditional settle 覆蓋 B。
4. `QA-02`：Semgrep workflow 獨立，唯一 required `Verification evidence` 不依賴 SAST；GitHub branch protection／PR #14 已確認，SEC-02 是 approved policy，但 merge enforcement 尚未成立。
5. `SCM-006`：稽核基準 `cf597af` 的 dependency audit job 為紅——`pnpm audit --audit-level high` 抓到 1 筆 high `nanoid 3.3.16`（`postcss@8.5.20` 帶入，patched `>=3.3.17`），連帶讓唯一 required 的 `Verification evidence` 失敗，branch 無法 merge。修法只是 manifest／lockfile 提版，不動 runtime source；對應新增的 P0 `SCM-R05`，且它是 `SCM-R01` 的前置。
6. `FE-SEO-01`：未生效 privacy 草稿被標 `indexable:true`、進 sitemap，並和 global release switch 耦合。
7. `PERF-01`：clinic timing budget 已宣告，E2E 因 URL mapping 缺失直接跳過。
8. `A11Y-02`：axe 只阻擋 serious/critical，minor/moderate 也未保存或輸出。
9. `SCM-005`：Node engine floor 仍容許已知未修補的 24.14.0，CI 浮動 major。

完整 47 項見同日完整稽核報告 §6；所有修正均需 user 指定 Roadmap ID 後才可進入實作。

## 本輪文件修正

本輪只修正能由現有程式或本次稽核證明的 live documentation；不回寫舊 dated review。修訂方向：

- SEC-02 從「已核准且已強制」拆成「政策已核准／required-check enforcement 待修」。
- CodeQL 已被 Semgrep CE 取代；明列 CE 非跨檔 taint 等價物及 current required-check gap。
- 測試數與 preview/GCP availability 改為 dated／`UNVERIFIED`；GitHub branch protection／alerts 則綁定 2026-08-11 14:32 +08:00 快照，不再寫成永續現況。
- Node 24.14.0 不再當安全安裝指引；2026-08-11 文件驗證基準採 24.18.0，真正 enforcement 仍待 `SCM-R02`。
- Privacy 草稿只可存在具名核准、noindex synthetic preview；D-003 前不得索引或進 sitemap。
- Calendar 從「零 PII」改為「無直接識別欄位，但含 P2 linkable 作業資料」。
- Slot、occurrence ID、worker fencing 的規則與未驗證狀態寫回 current architecture guidance。
- 交接允許 `PASS／FAIL／NOT_RUN／UNAVAILABLE`，並要求 scope、hash、未覆蓋範圍與 next Roadmap ID。
- **稽核基準 commit 的 CI 紅燈由「已知但未定位」改為具名 finding：** `SCM-006` 寫入
  `nanoid` high 與失敗的 job 名稱，新增 P0 `SCM-R05` 負責修綠，並在 `SCM-R01`
  標明相依。原本只在報告 §2.2 用一句「supply-chain 與聚合 evidence 失敗」帶過，
  沒有 owner、沒有 ID，等於沒有人負責。
- **修正誤指的 Roadmap ID：** 三處把「逐筆 triage Dependabot alerts」指向
  `SCM-R03`，但該 ID 是密鑰掃描（Gitleaks，對應 `SCM-002`）。改指 `SCM-R05`
  （立即修綠）與 `SCM-R04`（長期 patch SLA）。`SCM-R05` 原為空號。

### 實際 Markdown 變更清單

- Repository 規則／入口：`AGENTS.md`、`CONTRIBUTING.md`、`README.md`、`docs/README.md`、`docs/document-lifecycle.md`、`docs/phase-0-local-development.md`、`docs/roadmap.md`。
- 架構：`docs/architecture/calendar-event-id.md`、`firestore-local-baseline.md`、`rbac-matrix.md`、`test-strategy.md`、`web-quality-gates-2026-07-24.md`、`worker-runtime-and-reconciliation-plan-2026-07-24.md`。
- 法務／產品／runbook：`docs/legal/phase-1-privacy-approval-packet.md`、`privacy-policy-draft.md`、`docs/product/current-execution-and-approval-plan.md`、`full-project-execution-book-2026-07-31.md`、`phase-1-decision-register.md`、`docs/runbooks/synthetic-online-preview.md`。
- Review：live exception `docs/reviews/phase-1-approval-gate.md`，以及新增本稽核 Markdown 與本交接。其他 dated reviews 未回寫。

## 未處理、未跑或繞過的事項

- 47 項 finding 全部未修改 runtime；本輪不是任何 Roadmap implementation。
- 沒有執行或繞過 CI；狀態是 `NOT_RUN`，不是 pass。
- GitHub 只讀到 repository metadata／protection／PR checks／Dependabot；沒有存取 GCP/Firebase、production/staging、Calendar、telemetry、backup 或真實資料。
- 無 traffic/capacity/team/budget/lock-in 輸入；TCO 只作相對區間。
- 無人工 AT、實體裝置、DAST、pen test、load、cloud restore 或 incident exercise。
- Q-01～Q-08 尚未由 owner 回答；法規結論維持條件式。
- Word／Excel 在 repository 外，不會隨 Git push 上傳；repository 只含 20 章敘事／索引 Markdown，field-level tables 仍以 Excel 為必要附件。

## 本機環境陷阱

- Repository 位於含 CJK 的 `D:\診所專案`；既有規約已記錄 Windows Firestore Emulator 在非 UTF-8 locale 下可能無法解析 CJK working directory。需要 Rules 時改用經核准的 ASCII fresh clone／`subst`，不可藉此跳過 gate。
- 本輪沒有碰 `node_modules`；read-only status 不得用 pnpm 作檢查，避免 implicit install。
- 外部交付目錄含 generated previews/cache，不屬 repository，不得 `git add -A` 跨目錄誤帶。
- Markdown 與 Word/Excel 路徑含中文；跨機器應以 repository Markdown 與 SHA-256 核對，不依賴固定 drive path。

## 記錄的決策與剩餘風險

- 沒有新 D-series、C0、deployment 或法規核准。
- 保留現有 API-only、pure domain、transactional outbox、Calendar projection、deny-all direct-client 與 modular monolith 方向。
- 不建議全面 rewrite、Kubernetes、微服務、event sourcing、Redis locks 或 direct card/clinical schema。
- 最大剩餘風險：錯誤基準、提前 route/真資料、三個 correctness defect、auth/RBAC 未實作、privacy draft index、SAST bypass、**required gate 現為紅燈導致 branch 無法 merge**、RPO/RTO 未證明、無 telemetry/on-call/manual A11Y。

## 下一位接手者從這裡開始

1. 先由 owner 核准 `GOV-R01`，回答 Q-01～Q-08並固定權威 commit、URLs、主體、scope、容量、owner 與 SLO。
2. 若核准程式修正，三項可平行：`DATA-R01`、`DATA-R02`、`ARC-R01`；route/worker 仍保持 0%。
3. CI／runtime：**先 `SCM-R05`**（把 dependency audit gate 修綠，branch 才 merge 得了），再 `SCM-R01`，其「故意失敗 PR」驗證 required boundary 才有意義；`SCM-R02` 與兩者無相依，可平行。
4. 文件／frontend safety 可平行核准：`WEB-P0-01`、`WEB-P0-02`、`WEB-P0-03`。
5. 真實資料或 public release 前必須完成 `PRIV-R01`、`SRE-R01` 與對應 D/C gates。

在 user 明確核准上述某個 Roadmap ID 前，停止於文件與規劃，不自行實作。
