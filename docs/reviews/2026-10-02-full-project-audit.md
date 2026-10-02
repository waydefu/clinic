# 全專案稽核紀錄 — 2026-10-02

**類型：日期證據；稽核紀錄完成，修正未完成。** 本次固定稽核
`waydefu/clinic` main `4ccc752e0235b10b9dc8e4b903a149354250fdac`，確認
**15 項問題：6 P1、9 P2，全部尚未修正**。同 SHA 的供應鏈與 required
`Verification evidence` 為 **FAIL**。本紀錄沒有改變決策、部署或真實資料權限，
也沒有把稽核完成當成產品交付完成。

## 修訂版本、範圍與保管

- 稽核日期：2026-10-02；雲端 metadata 讀回時間 14:26 UTC；Chrome 補充觀察
  14:54–14:57 UTC。顯示時區為 Asia/Taipei。
- Source 基線為上述完整 SHA；[同 SHA CI run](https://github.com/waydefu/clinic/actions/runs/37013633179)
  的 commit-bound artifact 結論為 failure。
- 本文件分支：`agent/full-project-audit-20261002`。文件自己的 commit 無法自我引用；
  使用 `git log -- docs/reviews/2026-10-02-full-project-audit.md` 查找。
  Merge commit 尚不存在，本 PR 僅新增日期紀錄與索引。
- 覆蓋 API、Worker、Web、domain/contracts、auth/RBAC、Firestore Rules 與交易、
  排班、Calendar 進出、重試、商務匯出/保留/終止、CI/供應鏈、IaC、治理文件，
  以及隔離 C1 的服務/revision metadata 與 Scheduler 畫面。
- 採風險導向的跨子系統審查；不是逐行驗收或滲透測試。新診斷只使用合成資料與
  DB/HTTP/DOM 替身；未讀患者、員工、Calendar 事件或匯出檔內容。
- 本 PR 可攜交付為本 Markdown 與[公開稽核摘要 JSON](2026-10-02-full-project-audit.json)。
  原始本機封存的檔名、SHA-256 及保管限制列於 JSON 的 `localEvidenceManifest`。
  原始 log、雲端輸出、畫面及診斷腳本沒有隨本 PR 發布；本紀錄不宣稱私有證據
  已上傳或完成保管交付。
- 依 [SECURITY.md](../../SECURITY.md)，新安全問題的具體重現細節保留於本機稽核資料。
  公開紀錄只保留識別碼、摘要、影響與待修狀態；沒有建立公開 exploit 或私有 advisory。

## 問題與責任範圍

全部分類為 **CONFIRMED**，修正狀態為 **OPEN / NOT_FIXED**。P1 表示相關功能驗收前
應優先處理；AUD-06 的優先序來自 blocking CI，不能解讀為 production 已有可利用路徑。
下表的 owner 是責任範圍，**具名 owner 尚未指派**，不是簽核。

| ID | 優先序 | 問題摘要 | Owner 範圍 | 後續驗證 |
| --- | --- | --- | --- | --- |
| AUD-01 | P1 | 預約身分一致性有缺口；詳細資料保留於本機 | Web/API 技術 owner | 以合成身分驗證跨流程隔離及衝突處理 |
| AUD-02 | P1 | 排班發布漏掉並行新增的預約 | API/Firestore 技術 owner | Emulator 並行發布與預約，驗證一致性邊界 |
| AUD-03 | P1 | Calendar 審核與預約更新可能部分提交 | API/Calendar 技術 owner | 並行審核與版本變更下的原子提交 |
| AUD-04 | P1 | 診所 Calendar 改期候選遺失目標時間 | Worker/API 技術 owner | outbound → inbound candidate → review 的跨層驗證 |
| AUD-05 | P1 | 舊工作重試可重建已取消的回診提醒 | Worker 技術 owner | 最新決定與舊工作競爭、重試及刪除情境 |
| AUD-06 | P1 | development dependency high advisory 阻擋 main CI | 供應鏈技術 owner | 相容的安全依賴解析、完整 CI、SBOM/attestation |
| AUD-07 | P2 | 患者封存邊界未完整涵蓋一般流程；細節保留於本機 | API/資料生命週期 owner | 封存、刪除、還原與並行新增的授權邊界 |
| AUD-08 | P2 | 回診預約的成功請求重試未重放原結果 | API 技術 owner | 應用及 HTTP 層同鍵重試、同鍵異內容 |
| AUD-09 | P2 | 診所 Calendar 審核的同鍵重試回衝突 | API/Calendar 技術 owner | 冪等重放、版本及狀態檢查順序 |
| AUD-10 | P2 | CAL-PILOT 工作領取未遵守 nextAttemptAt | Worker 技術 owner | 未到期、到期、缺欄位及競爭情境 |
| AUD-11 | P2 | 預約查詢遺失掛號別，改期選項消失 | Web 技術 owner | 查詢後的掛號別及 slot metadata 完整性 |
| AUD-12 | P2 | 改期後 ICS/Google 匯出仍用舊時間 | Web 技術 owner | 改期回應、結果畫面與兩種匯出時間一致 |
| AUD-13 | P2 | 工作臺 transport 未保留患者備註 | Web 技術 owner | 合成 intake → staff list → renderer |
| AUD-14 | P2 | Terraform 必要條件以非阻擋 check 表達 | IaC 技術 owner | 阻擋型條件及實際 CLI 失敗斷言 |
| AUD-15 | P2 | API 模式仍告知資料只存瀏覽器 | Web/隱私內容 owner | local/API 兩模式的正確合成測試告知 |

AUD-02、03、04、05、08、09、10、11、12、13 的來源定位在摘要 JSON 中，
綁定稽核 SHA；後續 source 改動不得沿用舊行號或舊結果。

### 已確認的主要流程結果

- AUD-02：實際 repository 的合成競爭診斷中，新增預約與空的新版排班均成功；
  domain planner 對相同新預約可正確拒絕。仍需 Emulator 的並行回歸。
- AUD-03：合成診斷出現預約已更新、候選已拒絕而核准回衝突的不同步狀態。
  只交換兩次提交順序不足以證明原子性。
- AUD-04：正常診所 projection 的 structured identity 可辨識事件，但持久化候選
  的目標時間為 null，review 未完成改期。需完整跨層測試。
- AUD-05：最新取消完成後，較舊重試再建立提醒；診斷未讀目前權威 follow-up 狀態。
- AUD-08/09：成功後的相同請求未回原結果；需在 owning transaction 保留冪等重放。
- AUD-10：尚未到期的工作可立即被領取。C1 Scheduler 暫停不能清除來源缺陷，
  也不能拿另一個 staging CAL-PILOT 的 cadence 推論 C1 目前在自動執行。
- AUD-11/12/13：查詢映射、成功結果 state 與 transport 欄位完整性各有缺口；
  後續測試必須涵蓋實際畫面及匯出內容。
- AUD-14：無 cloud provider 的獨立 Terraform probe 在必要 check 失敗時只警告，
  plan exit code 為 0；沒有 apply 或完整 C1 provider plan。
- AUD-15：問題只涉及合成 API 模式的儲存告知；本輪沒有證明真實資料事件或判定法律合規。

## 稽核的驗證與證據

**來源診斷 evidence rung：TEST-VERIFIED，僅限合成來源診斷。** 正式整體 CI 為 FAIL，
這個 rung 不代表新 repository regression、HTTP 整合、部署或 Google provider 驗收。
本文件 PR 的檢查與此歷史 source 稽核結果分開記錄。

| Gate/檢查 | 結果 | 實際數字、來源或限制 |
| --- | --- | --- |
| Source SHA CI verify | PASS | 195 files；2260 passed、1 skipped；docs 264；structure required 359；tracked secrets 1171 |
| Source SHA CI Firestore Emulator | PASS | 27 files、206 tests；本輪未在本機重跑 |
| Source SHA CI E2E | PASS | 6 組、446 tests：auth 20、appointments 43、patient 98、mobile 176、accessibility 25、UI 84 |
| Source SHA CI SAST/Gitleaks | PASS | 同 run、同 candidate；Gitleaks 掃完整 history |
| Source SHA CI audit:prod | PASS | 0 known vulnerabilities |
| Source SHA CI audit:all/supply-chain | FAIL | 9 moderate、1 high；development dependency 路徑 |
| Source SHA SBOM/attestation | NOT_RUN | 供應鏈前置步驟失敗，後續未執行 |
| Source SHA Verification evidence | FAIL | commit-bound JSON conclusion=failure；supply-chain=failure |
| 新來源診斷 | PASS | Node 24.20.0；Web 4、API 3、Worker 5，共 12 項；DB/HTTP/DOM 使用替身 |
| Terraform check 語意診斷 | PASS | invalid synthetic inputs；warning；plan exit 0；builtin resource only |
| main protection metadata | PASS | required Verification evidence、strict=true、enforce_admins=true；禁止 force push/deletion；review count=0 |
| C1 metadata readback | PASS | 3 services、3 active traffic revisions；只讀 metadata，非 smoke |
| C1 Scheduler/GitHub Chrome 畫面 | PASS | 2 個 Scheduler 工作均 Paused；GitHub 更新後 main 顯示 4ccc752/failure |
| 本機 dependency-backed verify/build/lint/unit/rules/E2E/supply-chain | NOT_RUN | 稽核 clone 沒有 node_modules，未隱含安裝；上列 CI 是 source SHA 的證據 |
| 完整 Terraform provider validate/test/plan | NOT_RUN | 只有獨立 check 語意 probe |
| Source SHA 部署/HTTP/Google provider acceptance | NOT_RUN | runtime SHA 不同；未部署或執行外部 mutation |
| 實體裝置/人工輔助科技/完整 penetration test | NOT_RUN | 此次稽核未涵蓋，不能由 axe/browser engine 推論 |

已知阻擋 advisory 為 [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r)，
本次解析為 `basic-ftp@5.3.1`，經 firebase-tools 的 development 依賴鏈進入。
已知修補版為 6.2.1；5.x 到 6.x 需評估相容性。此 PR 未升級依賴、增加 ignore、
降低門檻或 dismiss alert。當日另讀到 8 個 open development/medium Dependabot alerts，
與 audit:all 的 9 moderate 是不同來源快照，不能互相清除。

## C1 runtime 與 Chrome 補充

14:26 UTC 實際承接 100% 流量的 API source env 為
`ffa5d33b4faf8149dd419e8bee98b55e17178061`，booking=false，expiry 為
2026-09-30T10:00:00Z，沒有 BUSINESS_DELIVERY_ENABLED。Outbox 與 Calendar sync
的 source env 為 `ea1fbccc2932be8c8ba93c9a5328f3ae23d519f9`；Outbox processing=true。
這些與稽核 main 不同；service template/latestReadyRevision 不能代替 traffic revision。

14:54–14:57 UTC 的 Chrome 畫面補充：

| C1 Scheduler 工作 | cron/時區 | 狀態 | 上次執行欄 |
| --- | --- | --- | --- |
| Calendar sync | `*/5 * * * *` / UTC | Paused | 尚未執行 |
| Outbox drain | `* * * * *` / UTC | Paused | 尚未執行 |

目前兩個工作不會依 cron 自動觸發。Outbox processing=true 只允許合格 drain 呼叫，
不會恢復排程。暫停符合 [C1 控制](../../infra/terraform/c1-internal-test-run/variables.tf)
與 [bounded Calendar 驗證](../../infra/terraform/c1-internal-test-run/README.md)，沒有新增缺陷。
「尚未執行」只表示該畫面未顯示上次排程執行，不能否定直接 HTTP 呼叫或歷史驗收。

GitHub 原分頁過時，重新整理後 main 顯示 4ccc752/failure。沒有開著診所產品 UI，
因此本輪沒有補做介面實測。Hosting pinned rewrite、preview availability、Calendar
configuration expiry 仍為 **UNVERIFIED**。沒有修改、恢復或強制執行排程。

## 已確認的邊界與未處理事項

- [P1-09](2026-09-28-p1-09-closeout.md) 維持 2026-09-28 隔離 C1 合成關帳；
  本輪只核讀 closeout/custody manifest，沒有重新驗收私有 artifacts。
- CP-07 的已審查路徑沒有找到具體新增缺陷；不是無缺陷保證。
- Browser Firestore Rules 預設拒絕；正常 outbox 外部 effect 位於 transaction 外。
- Dedicated Calendar title fields/note 依現行 ADR-0002；舊記憶不能覆蓋最新 Canon。
- 15 個 findings 全部 OPEN。本 PR 未修 source，也未改 policy、權限、workflow、
  dependency、cloud、Hosting、Scheduler 或流量。
- 未確認的觀察獨立保留，不計入 15 項：CAL-PILOT 慢 provider 下的 lease/fencing
  為 NEEDS-RUNTIME-REPRODUCTION；正式回診預約後 reminder-cancel producer 為 LIKELY。
- 商務 source merge、CI、文件 PR 不能代替 BD runtime、Google 真還原、完整 C1 回歸、
  操作文件/截圖與業主驗收；各項需保留自己的證據。
- Production/go-live、真實資料、凍結 scope 及 D-series 狀態由現行 Canon 決定，
  本紀錄不新增或推論任何核准。

## 接手第一步與文件 PR 驗證

第一步是由各責任範圍的技術 owner 指派具名修正者，複核固定 SHA 的合成診斷，
把確認問題轉成 owning boundary 的 regression，再提交 scoped 修正 PR。
優先 AUD-01/02/03，接續完整 Calendar/follow-up 流程與供應鏈阻擋，再處理其餘項目。
新 findings 尚未配置正式 Roadmap ID，該 mapping 為 **UNVERIFIED**；AUD-01～15 是
本次追蹤 ID，不是 Roadmap 核准。現行 Roadmap 的 P1-09 維持 CLOSED，後續業主欄位、
BD runtime/Google 真還原與完整回歸仍沿用原順序；新部署須當時的 exact-SHA authority。

本機陷阱：工作區根目錄不是 checkout；歷史副本可能過時；node_modules 缺失時
不得把 package gate 變成隱含 install。文件 PR 使用既有 Node 24.20.0 直接執行
不依賴套件的 docs/governance/secret gates。來源診斷需要 experimental VM modules
的 runner，其 warning 不構成實際 provider 驗收。

本文件 PR 的 artifact、實際 local gates 與 candidate CI 結果在下方登記；
較早 source SHA 的 CI 不充當本文件 candidate 的 CI。

公開 JSON artifact：`2026-10-02-full-project-audit.json`，SHA-256：
`5f83c71bd8e2ddba8409e4e0cd6a4cf0a8d3d33155e6685f2abbe39c4dd01637`。
本 Markdown 的 hash 與包含它的 commit 可從 Git 取得，不做循環自我引用。

**文件 PR evidence rung：GATE-VERIFIED，僅限下列本機文件檢查。**

| 文件 PR Gate | 結果 | 數字、來源或限制 |
| --- | --- | --- |
| check:docs | PASS | 265 files；links/index/lifecycle checks |
| check:governance | PASS | AGENTS 8096 bytes/151 lines；INDEX 6124 bytes；現有 advisory size warnings，無新增 waiver |
| check:format 等價 CLI | PASS | 使用機器既有 Prettier 3.9.5，以本 checkout config 執行 `--check .`；全部 matched files 符合。Markdown 依既有 ignore 規則由 reviewer 排版 |
| tracked-secret | PASS | 1173 tracked files；新增檔案已先 stage，沒有漏掃新檔 |
| JSON/清單一致性/來源定位 | PASS | JSON parse；15=6+9；source 路徑/行號存在；公開 subset 無本機路徑、cloud 服務網址或保留的安全重現細節 |
| git diff --check | PASS | 本 PR 三個文件；無 whitespace errors |
| 本機 lint/完整 verify/Emulator/E2E/supply-chain | NOT_RUN | 此 checkout 沒有 node_modules；沒有隱含 install。正式完整驗證交由本 PR 的 required CI |
| 本文件 candidate Verification evidence | NOT_RUN | 寫入本紀錄時尚未提交或觸發；最終狀態以 exact candidate 的 PR checks 為準 |
| 部署/HTTP/Google provider/業主產品驗收 | NOT_RUN | 文件 PR，沒有 runtime 變更或新部署 authority |

本 PR 未修改測試或 enforcement，未以補文件宣稱產品關帳。Rollback 是移除這三個
文件變更，沒有部署回退需求；治理 state、Roadmap、D-series 與保護設定均未改。
