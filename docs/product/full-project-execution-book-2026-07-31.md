# 全專案執行書（2026-07-31）

**狀態：執行書／逐步動作清單。** 本文件把
[全專案總體規劃書](full-project-master-plan-2026-07-31.md)的策略翻成**可以照著做**
的步驟。它**不核准任何事**——每一個標示「需授權」的步驟，在拿到書面核准前都不得
執行。

**閱讀順序：** 先看規劃書知道「為什麼」，再用本書知道「怎麼做」，核准狀態查
[決策登錄](phase-1-decision-register.md)，核准順序查
[後續執行與核准清單](current-execution-and-approval-plan.md)。

**2026-08-01 查核更新：** Stage 0 已完成，現況是 Stage 1。本書已覆蓋治理、技術補強、
C0／C1～C6、Calendar、公開服務、排班／個管／薪資、Production、Expansion S 與常態
維運的全部已知待辦。以下仍是條件式執行書，不代表已取得 deployment authority、
apply approval、真實資料或 production 授權。官方基準與控制來源集中列於附錄 B。

## 0. 每一步的四個要素

本書的每一個步驟都寫成同一種格式，缺一不可：

| 要素 | 意思 |
| --- | --- |
| **前置** | 沒有這個就不准開始 |
| **動作** | 實際要執行的事，能寫成指令就寫指令 |
| **驗收證據** | 做完後拿什麼證明它真的成了。口說無效 |
| **回滾** | 做壞了怎麼退回去。沒有回滾方案的步驟不准執行 |

而**每一個階段**（不是每一步）完成時，還必須額外產出一份日期化的交接紀錄，放進
`docs/reviews/` 並登記到 `docs/README.md`。模板與必備段落見 §10.4。這是
[開發與交接規約](../../CONTRIBUTING.md)第 10 條的要求：**沒有那份紀錄，該階段不算
完成**——因為驗收證據散在終端機輸出與對話裡，換一個人就等於從零開始。

### 0.1 全待辦狀態板

詳細 work-package 定義與來源覆蓋見規劃書 §10；本表是執行時唯一狀態入口。每次 PR
只更新受影響列，並附 decision／request／commit／evidence 連結。`DONE` 必須有證據，
`DEFERRED` 必須有 owner、原因、排除的 release scope 與重審條件。

| Work package | 目前狀態 | 下一動作 | 阻塞者 |
| --- | --- | --- | --- |
| GOV-01～06 全部業主／政策決定 | `WAITING_FOR_ANSWER` | 回收 39 題與 T14～T17 依賴答案，完成 §1-1～1-9 | clinic／operations／privacy／medical／finance／security |
| GOV-07 C0（T6～T13、業主 37～39） | `REVISE` | 填 reviewers、IAM、成本、DR、安全參數、告警 | named reviewers／billing owner |
| GOV-08 上線範圍重審（T20） | `NOT_DUE` | 到 release candidate 再重審 SEC-02、D-012、D-013、法規／vendor | release candidate |
| TW-01～03 gate 自測 | `READY` | 依 §1A 分三個可回滾 PR | 無政策阻塞 |
| TW-04 測試效能／穩定性 | `READY_TO_MEASURE` | 量 collect 並重現 API health test 批次逾時 | 無政策阻塞 |
| TW-05 人工無障礙 | `READY_TO_REHEARSE` | 合成環境先跑；Go 前對 release candidate 正式跑 | accessibility reviewer／release candidate |
| TW-06～07 多服務與完整 reason | `BLOCKED_BY_DECISION` | D-004／各資料域決策後進 OPS／S 切片 | GOV-03／04／06 |
| C1～C6（T18～T19 實作證據） | `NOT_AUTHORISED` | GOV-07 後只先送 C1 request | C0＋per-slice authority |
| CAL-01（T14～T17） | `BLOCKED` | C6＋D-009 後另送 request | GOV-05＋Stage 2 |
| PUB-01～03、OPS-01～03 | `BLOCKED` | 對應 D-series、官網接受／授權與 Stage 2 證據完成後逐片執行 | GOV-02～05＋C2～C6 |
| GO-01 | `NOT_DUE` | 所有 release-scope evidence 到齊後召開 | 五位 accountable owners |
| S-00～S-07 Expansion S | `PLAN_ONLY` | 先完成 GOV-06 與獨立 release-scope decision | D-014～D-016、finance／medical／privacy |
| 常態維運 | `PARTIAL` | repository 節奏現在執行；cloud／production 節奏在服務存在後啟用 | 各服務 G5 handoff |

---

## 階段 0：Repository 與品質收尾（已完成，保留作歷史證據索引）

這一階段已完成並併入 `main`；結果見
[Stage 0 交接紀錄](../reviews/2026-08-01-gate-script-test-coverage.md)。以下步驟保留用來說明
既有證據鏈，不得把其中的舊指令、舊 commit 或舊核准狀態當成下一階段的執行授權。

### 步驟 0-1　完成 2026-07-31 安全批次的驗證

- **前置**：無。
- **動作**：

  ```bash
  corepack pnpm run verify
  ```

  紅了就修根因，不繞過。本次已因此修掉三個真問題：`check:secrets` 在髒工作區
  ENOENT 崩潰、ESLint 誤檢 Semgrep 規則測試檔、`eslint.config.mjs` 仍指向已刪除的
  CodeQL 工作流程。
- **驗收證據**：`verify` 全綠的完整輸出，含檔案數與測試數。
- **回滾**：`git checkout --` 個別檔案；尚未 commit，風險低。

### 步驟 0-2　跑完 verify 之外的兩道關卡

- **前置**：步驟 0-1 全綠。
- **動作**：

  ```bash
  corepack pnpm run test:rules
  ```

  ```bash
  corepack pnpm run check:supply-chain
  ```

- **驗收證據**：Emulator 規則測試通過數；`audit:prod`／`audit:all` 結果與 SBOM 產出。
- **回滾**：不適用（唯讀檢查）。
- **Windows 注意事項**：Firestore Emulator 無法在含非 ASCII 字元的工作目錄啟動，
  會以 `FileNotFoundException` 立即結束。改從 ASCII 路徑執行，或用 `subst` 暫時
  對應一個磁碟代號、跑完再移除。這是本機環境限制，不是規則或測試的問題，也不能
  當作跳過這道 gate 的理由。
- **判讀提醒**：`check:supply-chain` 目前輸出 `1 high (1 ignored)`。那個 ignore 是
  `pnpm-workspace.yaml` 的 `auditConfig.ignoreGhsas` 設定，對應 SEC-03 仍待核准的
  `brace-expansion`。依 ENG-04（2026-08-01），`check:audit-exceptions` 會逐條印出
  被忽略的 advisory 與其核准編號、狀態與到期日，並在未登記、欄位不全或到期時擋下。
  綠燈代表「例外已登記且有時限」，不代表「風險已被具名接受」。

### 步驟 0-3　分兩個 commit 進版

- **前置**：0-1、0-2 全綠。
- **動作**：拆成兩個 commit，**不要混在一起**——風險等級不同，混在一起會讓回滾變成
  全有全無：
  1. SAST 換方案（刪 CodeQL 工作流程與證據腳本、新增 `sast.yml`、
     `generate-sast-evidence.mjs` 與測試、`security/semgrep/`、ESLint ignore 調整、
     `check-tracked-secrets.mjs` 修正）；
  2. 相依升級與文件（`package.json`／lockfile／workspace、建置腳本、`vitest.config.ts`、
     全部 `docs/` 變更）。
- **驗收證據**：兩個 commit 的 hash 與各自的檔案清單。
- **回滾**：`git revert` 單一 commit 即可，不影響另一半。

### 步驟 0-4　push 並取得 CI 對同一 commit 的證據

- **前置**：0-3 完成。
- **動作**：push 分支，開 PR，等 `Verification evidence` 與 `sast.yml` 在 GitHub 上
  對**同一個 commit** 跑完。
- **驗收證據**：CI run 連結 + commit hash + 可下載的 SAST 產出檔。
- **回滾**：關閉 PR，分支保留。

### 步驟 0-5　併入 `main`，確認三筆 moderate 警示關閉

- **前置**：0-4 全綠；SEC-02 已具名核准（見階段 1）。ENG-02（2026-08-01）已確認
  維持這個前置，不採「先合併、SAST 設為非阻斷」的替代方案；ENG-01 追加的驗收條件
  （規則測試與證據產生器測試皆在阻斷式 gate 內）必須一併滿足。
- **動作**：合併 PR，等 GitHub 對新的 default branch 重新分析。
- **驗收證據**：Dependabot 頁面顯示三筆 moderate 由 open 轉 closed 的截圖或 API 輸出；
  `brace-expansion` 高風險項仍 open 且**未被 dismiss**。
- **回滾**：`git revert` 合併 commit。

### 步驟 0-6　同步公開鏡像

- **前置**：0-5 完成。
- **動作**：依
  [公開鏡像發布紀錄](../reviews/2026-07-29-sanitized-public-mirror-publication.md)
  的 release gate 重跑一次（密鑰、個資、內部資訊、Git 歷史、相依、測試、全新 clone）。
- **驗收證據**：新的日期化 gate 紀錄。
- **回滾**：撤下鏡像更新。

### 步驟 0-7　補齊把關腳本自己的測試（Stage 0 主要完成；剩餘轉 TW-01～03）

- **前置**：0-5 完成。
- **已完成**：高風險與可直接抽離的腳本已補測，Stage 0 因此可以結束。
- **仍未完成**：`check-architecture.mjs`、`check-web-ui.mjs` 的核心邏輯自測，以及
  `checkPublicPageConfiguration` 全組態 fixture。它們不阻擋 Stage 1，但必須依 §1A 的
  TW-01～03 追蹤，不得在「Stage 0 已完成」後消失。
- **共同驗收**：正常、髒工作區與全新 clone 三情境；正向／負向 fixture；測試在
  `test:unit` 與阻斷 gate 內。
- **回滾**：單獨 revert，不影響產品程式碼。

---

## 階段 1：把業主的答案收回來

技術上不阻塞，但**後面每一階段都靠它解鎖**。

### 步驟 1-1　送出兩份決定清單

- **前置**：確認接收人、回覆截止日與各部門 accountable owner。
- **動作**：把
  `業主決定事項清單-2026-07-31.docx`（39 題）與
  `技術資安決定事項清單-2026-07-31.docx`（T1～T21、C1～C6）分別送出，建立逐題
  tracker：answer／N/A／pending、owner、due date、decision ID、附件。
- **驗收證據**：39 題與 T1～T21 全數出現在 tracker；沒有空白列被誤讀成同意。
- **回滾**：收回錯誤版本並發新版；舊版保留 `superseded`，不覆寫簽核歷史。

### 步驟 1-2　優先追回四個矛盾點

不需要開會，四句話就能定案，但不定案會做錯方向（詳見
[業主需求彙整索引](owner-requests-consolidated-2026-07-31.md) §L）：

| # | 問題 | 目前程式行為 |
| --- | --- | --- |
| 1 | 週三至五收班 20:00 還是 20:30 | 20:00 |
| 2 | 止鼾時長固定 40–60 分，還是到診後才定 | 到診後才定 |
| 3 | 重複預約上限幾次、依什麼判定同一人 | 有上限機制，數值未經核定 |
| 4 | 手術自訂時段可否排在休診日／國定假日 | 未定義 |

四項答案寫回 D-004／GOV-03；若答案仍不明確，相關功能標 `deferred`，不可用現行 UI
或舊筆記代替。

### 步驟 1-3　確認已完成的技術決定不再是假 blocker

- **現況**：SEC-02 已核准並實作；SEC-03 的上游修補條件已成立、ignore 已移除；T1～T5
  與 T21 已完成。這些不再列為 Stage 1 待簽。
- **動作**：核對決策登錄、交接、GitHub evidence 與 dependency 狀態一致；只建立 GOV-08
  的「上線前重評 Semgrep 能力差距」待辦，不重開已完成工作。
- **驗收證據**：對應 decision／commit／CI／Dependabot 連結；目前 audit exception=0。
- **回滾**：若證據互相矛盾，將該項標 `REOPENED`，不得悄悄改歷史結論。

### 步驟 1-4　關閉隱私與資料治理（GOV-02／D-001～D-003）

- **前置**：業主題 1～2、28～32 由 clinic、privacy/legal、operations 回覆。
- **動作**：逐欄完成 controller／contact、notice version、rights request、retention／deletion、
  backup exception、vendor／region／cross-border、DPA／subprocessor、incident owner。法規依
  預計上線日的有效版本判定，Google DPA 的通知 email 與合約 owner 必須具名。
- **驗收證據**：D-001～D-003 三筆獨立 approval；資料類別 × purpose × retention × vendor
  mapping；法律適用性 memo。不得用一張「隱私同意」包辦三筆決策。
- **回滾**：任一決策撤銷即停止 PUB-01／02 與真資料 migration；已蒐集資料依有效法律與
  事故／權利流程處理，不直接刪除湮滅證據。

### 步驟 1-5　關閉預約政策（GOV-03／D-004～D-005）

- **前置**：步驟 1-2 四個矛盾有答案；operations／legal 可共同簽核。
- **動作**：定案服務／多服務占位、醫師／診間／設備容量、published slot、horizon、
  blackout、延誤、人工 override、取消／改期、no-show、費用／訂金與限制再預約。每個
  數值都要附生效日、適用服務與例外角色。
- **驗收證據**：D-004／D-005 approval；OR-07／22／37／48 closure；候選規則對現行
  synthetic 行為的差異表與 migration 影響。
- **回滾**：只可切回上一個已核准 policy version；不以硬改資料回復已發生預約。

### 步驟 1-6　關閉個管與薪資（GOV-04／D-007～D-008）

- **前置**：case-management、finance、operations owner 具名。
- **動作**：定案指派／改派／代理／離職、merge reviewer／restore、completed 定義、計薪
  source、rule version、生效日、period close、recompute／dispute 與 append-only adjustment。
- **驗收證據**：D-007／D-008 approval；角色 × action × field 草案；薪資／結算是否適用
  勞基法工資／出勤紀錄要求的 finance/legal memo。
- **回滾**：決策撤回時不建 write path；已鎖 period 只以新 adjustment 修正。

### 步驟 1-7　關閉 Calendar 與公開服務（GOV-05／D-009、D-011）

- **前置**：業主題 3～5、33～34；clinic、security、operations 可簽核。
- **動作**：定案 production shared calendar、credential owner／offboarding、最小 scope、事件
  欄位、同步失敗 owner；正式 URL、語言、人工預約、患者本人驗證、停機／網路中斷備援。
- **驗收證據**：D-009／D-011 approval；事件欄位 allowlist；人工電話／櫃檯流程桌上演練；
  正式網域與 DNS／certificate owner。
- **回滾**：Calendar 保持未接、public route 保留關閉；不可拿既有測試 calendar credential
  當 production approval。

### 步驟 1-8　關閉 Expansion S 決定（GOV-06／D-014～D-016）

- **前置**：業主題 21～27、35～36；medical、privacy/legal、finance、clinic、security、
  operations 具名參與。
- **動作**：定案臨床／病歷邊界、medical owner、最小欄位、保存／更正／匯出；payment／
  refund accounting source、對帳；settlement source；Calendar inbound reviewer、matching、
  unknown／delete／conflict 語意與 SLO。另決定 S3～S6 是否同一 release。
- **驗收證據**：D-014～D-016 approval；OR-40～61、OR-63～69 每項映射到 S-00～S-07
  或具名 deferred；資料域與欄位權限不混用。
- **回滾**：任何未定項只允許 plan-only／純 domain 無政策骨架；不得建立 route、真 Calendar
  watch、臨床或金額資料。

### 步驟 1-9　做決策完整性與相依審查

- **前置**：1-1～1-8 已執行；可以有 `deferred`，不能有無 owner 的空白。
- **動作**：以規劃書 §10.1 做 coverage review；逐筆比對 39 題、T1～T21、D-001～D-016、
  OR-01～69 與 ENG backlog。對每個 release-scope 工作包標 `READY／BLOCKED／DEFERRED`。
- **驗收證據**：零 unmapped open item、零互相矛盾 active answer；決策登錄 PR 與 reviewer
  簽核。這一步完成後才進 C0 snapshot。
- **回滾**：發現矛盾即回到對應 GOV 工作包，不以多數決或實作者猜測補值。

---

## 階段 1A：可與決策並行的技術補強

這一軌不建立 cloud、不處理真資料、不寫入待決政策。每項獨立 PR，避免大型 refactor
同時改變 gate 的判定結果。

### 步驟 1A-1　TW-01 `check-architecture.mjs`

- **動作**：先鎖既有輸入／輸出 golden fixtures，再抽 dependency-direction、allowlist、
  unrouted inventory 的純函式；補正常、違規、髒工作區與全新 clone 測試。
- **驗收證據**：改寫前後同一 fixture 結果一致；故意反轉相依方向會紅；完整 `verify`。
- **回滾**：revert 單一 PR，原 CLI 行為恢復。

### 步驟 1A-2　TW-02 `check-web-ui.mjs`

- **前置**：先列出 1070 行內每一類 guard，避免重構漏規則。
- **動作**：依 permissions、safety、accessibility、DOM／content 分離 pure review functions；
  fixture 必須包含每一條 rule 的正反案例。
- **驗收證據**：rule inventory 前後數量相同；每條至少一個會失敗的 mutation fixture；
  UI、E2E 與 `verify` 全綠。
- **回滾**：保留原 CLI adapter；pure function PR 可獨立 revert。

### 步驟 1A-3　TW-03 public-page 完整組態測試

- **動作**：建立 inventory、performance budgets、Firebase routes、server routes、scan matrix
  的最小 fixture builder；測缺漏、額外、重複、pretty path 漂移與不一致。
- **驗收證據**：`checkPublicPageConfiguration` 全分支 coverage；現有五 entry／八 route 通過。
- **回滾**：只 revert 測試／抽函式，不調低 production guard。

### 步驟 1A-4　TW-04 測試效能與穩定性

- **動作**：固定機器／Node／Vitest／cold-warm 條件，各跑至少三次；分別量 transform、collect、
  tests、environment／prepare。一次只改一個變因（pool、workers、test grouping、imports）。
  同時在完整批次與受控 CPU／I/O 負載下重現 `apps/api` health test 曾發生的 5 秒逾時，
  區分被測服務、測試隔離與 runner 排程的根因。
- **驗收證據**：median／p95 before-after、55 檔／820 項一致、連跑與 flaky rate；health test
  有可重現失敗與根因修復，或有足量長跑證明未再出現。若 collect 改法收益不足或不穩定，
  就保留現況並結案為「不改」；不得只提高 timeout。
- **回滾**：revert config；不得只提高 timeout 或刪測試換速度。

### 步驟 1A-5　TW-05 人工無障礙

- **動作**：先在合成 build 依既有 runbook 演練鍵盤、螢幕閱讀器、高對比、200%／400%、
  focus、error／status、timeout／reauth；每項記 WCAG 2.2 SC、browser／OS／AT 版本。
- **驗收證據**：缺陷單、修復 commit、同一場景重測。Go 前對 frozen release candidate
  完整重跑；W3C Easy Checks 只能作初查，不宣稱等同完整 conformance evaluation。
- **回滾**：文件／測試不適用；修復本身依 UI PR revert，但不能以 revert 恢復已知障礙後上線。

---

## 階段 2：C0 計畫審查

**C0 只核准「未來要怎麼做」，不建立任何資源、不花錢。**

### 步驟 2-1　備齊六份輸入

1. 具名 technical／security reviewer；
2. 最小 IAM 矩陣、臨時授權與覆核週期、資料庫層級權限的剩餘風險接受人；
3. staging 用量估算、容量、查價日期、月預算、50%／80%／100% 行動（預算金額由業主
   決定，見業主清單第 37–39 題）；
4. DR 方案：備援專案與地點、複製頻率、切換方式、完整性驗證、failback owner；
5. 身分安全參數（8 小時／30 分鐘維持 D-006；另由 security owner 決定是否加入抗釣魚
   驗證選項，或明列不宣稱完整 NIST AAL2 對齊，見規劃書 §4.1）；
6. 告警主要與備援接收者。

### 步驟 2-2　把結論由 `revise` 改為 `approved`

- **前置**：2-1 六項全到齊。
- **驗收證據**：兩位 reviewer 的簽核與日期。
- **回滾**：不適用（純文件決策，可再改為 revise）。

### 步驟 2-3　凍結「核准基線」

- **前置**：2-2 完成；決策登錄無互相矛盾的答案。
- **動作**：建立日期化 approval snapshot，逐筆列出 D-series／C0 結論、核准人與日期、
  適用範圍、明確排除項、剩餘風險、來源文件 commit；另列仍 pending 的決策，並把每筆
  核准映射到允許建立的 C1～C6 切片。任何無法映射或互相矛盾項一律標成 blocker。
- **驗收證據**：snapshot 的 PR／commit、兩位 reviewer 對「決策內容未被轉譯錯誤」的
  確認、決策登錄與 snapshot 的自動或人工逐筆比對表。
- **回滾**：snapshot 只可由新版取代，不覆寫舊版；結論回到 `revise` 時立即撤銷所有尚未
  執行的切片 request／approval。

### 步驟 2-4　只把 C1 標成 request-ready

- **前置**：2-3 完成；C0 只核准計畫，尚未建立任何雲端資源。
- **動作**：依 §10.2 建立 C1 deployment request，從 approval snapshot 引用允許範圍；
  C2～C6 只保留候選順序，不可預先取得一張涵蓋全部切片的 apply approval。
- **驗收證據**：C1 request 編號及 owner、operator、approver、成本、時間窗、資料分類、
  停止條件、逐資源回滾皆完整。
- **回滾**：撤銷 request；不應有任何雲端資源可清理。

---

## 階段 3：C1～C6 逐片建置

每一片都要獨立備妥：**精確範圍、明確排除項、成本、執行人、核准人、時間窗、
plan hash、逐資源回滾**。上一片的授權不會自動延伸到下一片。

### 3.1 通用執行順序（每一片都一樣）

| 關卡 | 動作 | 必備證據 |
| --- | --- | --- |
| Request | 依 §10.2 寫範圍、排除、資料分類、成本、owner、時窗、停止與逐資源回滾 | request 編號、approval snapshot commit |
| Authority | 取得該切片 deployment authority | 核准人、時間、範圍、到期時間 |
| Provider plan | 只在 authority 後連到目標；初始化受限 remote state，跑 provider-backed plan 與政策／成本檢查 | plan artifact、SHA-256、source commit、provider lock、state serial、project ID、預估差異 |
| Apply approval | approver 審閱**同一 hash** 的 plan；operator 不得自批 | 核准紀錄及短時效 window |
| Apply | 由核准的短期 WIF 身分執行；保存實際 diff，不在 log 顯示 secret | workflow run、actor、時間、actual resource IDs、artifact digest |
| Verify／rollback | 跑正向、負向、告警、drift 與切片回滾演練；資料資源依核准方式 quarantine／restore／forward-fix | 實際數字、拒絕證據、drift=0 或已解釋、回滾耗時／結果 |
| Stabilize／handoff | 維持核准觀察窗，交付 dashboard、runbook、主要／備援 owner | §10.5 營運交接、handoff commit |

Terraform state、plan 與 output 都視為敏感 artifact：只給最小必要人員、設定保存期、禁止
貼進 PR／ticket。若 source commit、configuration、variables、provider lock、state serial、
目標 project、執行 identity、成本或核准 window 任一改變，舊 plan 與 apply approval 立即
失效，重新 plan／hash／審查。`terraform destroy` 不是通用回滾。

### 3.2 全階段停止條件

任一切片出現下列情況即停止：plan 含 scope 外資源、production、非核准 location、過寬
IAM、公開 Firestore／route 或 destructive change；secret 進入 state／log／artifact；實際
成本超出核准容忍；主要或備援 owner 不在；負向測試、告警、drift 或回滾失敗；發現真實
病患資料。保全證據、撤銷曝光或隔離資源，由 approver 決定回滾／forward-fix／另案處理，
不得暫時關閉 MFA、revocation、authz 或 audit 讓測試變綠。

### 3.3 C1　隔離 staging 地基

- **前置**：C0 approved、§2-3 snapshot 完成、C1 request 獨立取得 authority；具名
  operator／approver、決策級成本、IAM、告警與 rollback 已核准。
- **動作**：建立 clinic-owned staging project、受版本控管的 remote Terraform state、
  最小 IAM／service identities、以 GitHub repo／branch／workflow 及數字 ID claim 限制的
  WIF、空 Secret Manager 容器、baseline logging／monitoring／budget。stateful 資源開啟
  可用的 deletion protection；不建立長期 service-account key。
- **明確不做**：Firestore database／API／Rules／backup、Identity Platform、application
  runtime、Calendar、DR secondary、production、真實資料、secret payload。
- **驗收證據**：actual resource manifest；WIF 冒用、未核准 principal impersonation、
  deployer 讀 secret payload／資料的拒絕測試；C1 排除資源的「不存在」清單；state 非公開、
  versioning／權限證據；budget 與主要／備援通知管道的合成訊息演練。**不得為觸發 50%
  門檻而故意產生費用**，也不得把 budget 寫成硬上限。
- **回滾**：先撤銷 WIF／impersonation、停用 service identities、隔離 project，再依逐資源
  計畫處理；保留 audit／state version。未經額外 cleanup authority 不刪 project 或 state。

### 3.4 C2　合成員工身分

- **前置**：C1 G5 完成；IdP 成本、local／Google provider、email verification、TOTP
  enrollment、遺失／重綁／recovery 與無 break-glass 預設流程已核准；C2 自有 request／plan／
  approval。security owner 已決定抗釣魚選項，或明列不宣稱完整 NIST AAL2。
- **動作**：只建立合成 staff 身分；設定 Google＋local provider、email verification、全員
  MFA、TOTP 與已核准 recovery。recovery 不得比正常登入更弱，變更 factor 要重新驗證、通知、
  audit 並撤銷既有 session。
- **驗收證據**：verified／unverified email、MFA 缺失、錯誤 TOTP、clock-skew 邊界、重放、
  遺失／重綁、停權、刪除合成帳號的正負案例；一次「裝置遺失 → 具名覆核 → 安全救回」演練；
  對齊聲明／偏差決定連結。測試數與 actor／timestamp 齊備。
- **回滾**：停止新登入、撤銷 session／factor、停用新增 provider，保留稽核後刪除合成帳號；
  不回退成繞過 MFA 的帳號。

### 3.5 C3　伺服器連線階段安全

- **前置**：C2 G5、threat model 與 C3 獨立授權完成；測試仍只用合成 staff。
- **動作**：session secret 由伺服器簽發與驗證；cookie 設 `Secure`、`HttpOnly`、
  `SameSite=Lax`／`Strict`、最小 domain／path，可行時 `__Host-`；POST／PUT 驗證 CSRF。
  伺服器強制 30 分鐘 idle、8 小時 absolute、logout、停權／撤銷後下一個 protected request
  拒絕；session secret 不進 URL 或 `localStorage`，登入後換發 session ID。
- **驗收證據**：記錄 ASVS `v5.0.0` requirement ID 與結果；29:59／30:00、7:59:59／
  8:00:00 邊界；logout、上一頁、重放、CSRF、cookie flags、session fixation、IdP session
  尚存但 RP session 已逾時等負向測試。只改瀏覽器時鐘不得繞過伺服器逾時。
- **回滾**：將 route 設為不可達或切回前一個已驗證、仍符合 D-006 的版本，撤銷受影響
  session；不得以延長逾時或停用 CSRF 作回復。

### 3.6 C4　伺服器端權限

- **前置**：C3 G5；角色／action fixture、授權碼 KDF／限流／expiry／unlock 參數及 C4
  request 已核准。
- **動作**：伺服器端實作 default-deny RBAC、resource scope、active-account check、停權／
  撤銷、memory-hard KDF、有限次數與逐步等待；每個 protected request 都重新套用權限與
  account 狀態，不信任瀏覽器 role 或 timer。
- **驗收證據**：`administrator`／`front_desk`／`physician` × action × resource 的 allow／deny
  矩陣；跨角色、跨資源、停權中、撤銷後、錯誤／過期／重放授權碼、不同 IP 繞過限流等
  負向案例。無權者的 API response **不含受限欄位本身**，不只是在 UI 隱藏。
- **回滾**：route fail closed，回到前一個已驗證 policy／runtime revision並撤銷 session；
  若任何 action fail-open，停止整個 Stage 2。

### 3.7 C5　持久化與不可變稽核

- **前置**：C4 G5；Firestore 所在地再次核對 D-010 `asia-east1`（建立後不可變）；資料庫、
  PITR／backup／restore、Rules／IAM、D-002 access／export 與 C5 authority 皆已明列。C1 的
  「Firestore 不存在」證據不可重用。
- **動作**：建立核准範圍內的 Firestore；開 deletion protection、direct client deny、最小
  database IAM；在同一 transaction 寫 domain change 與 append-only audit，建立查閱投影、
  容量告警、永久 deletion deny。正式鍵採 database-generated document ID，營運連號另欄，
  並先完成 ADR。若 backup／PITR 在本片 scope，依核准參數設定並 restore 到新 database。
- **驗收證據**：location／database ID／deletion protection；web／mobile direct read-write
  被拒；各 application role（含 administrator）update／delete audit 被拒；transaction 失敗
  不留下半套資料；備份／PITR 的時間點、restore 新 database、筆數／checksum／index 驗證。
  記錄「backup 與來源同 location，不證明 regional DR」。
- **回滾**：先停止寫入並 quarantine；規則／程式可回前版，已寫 audit 不刪。資料錯誤採
  restore 到新 database 或核准的 forward-fix，不把 database delete／in-place overwrite
  當一般回滾。

### 3.8 C6　合成 staging 端到端

- **前置**：C1～C5 各自 G5 完成；C6 request、不可變 artifact digest、流量步驟、健康檢查、
  schema 相容性、rollback revision 與觀察窗已核准。
- **動作**：部署 staff-only synthetic API／Web 到 0% traffic 的 Cloud Run revision；先驗證
  startup／readiness、migration compatibility 與 synthetic smoke，再依核准百分比逐段移轉
  流量。維持前一個已驗證 revision 可回切；不開 public booking、不放真資料。
- **驗收證據**：source commit、SBOM、image digest、revision ID、startup／readiness、每段
  traffic 與觀察時間；完整 staff flow、權限／稽核／outbox、效能、積壓與告警實測；流量切回
  舊 revision 後功能與資料完整。注意流量調整有傳播時間，in-flight request 可能完成。
- **前置提醒**：ENG-03（2026-08-01）已定案 database-generated document ID；ADR 與 C5
  實作未完成就不得做有意義的效能量測。
- **回滾**：新 revision 先切 0%，流量回前一個已驗證 revision；若 schema 不相容，停止
  寫入並執行預演過的 forward-fix／restore。不得只宣稱「revision 已回退」就算系統回滾。

---

## 階段 4：Stage 3 專用測試 Calendar

- **前置**：Stage 2 完成 + D-009 核准；D-009 明列事件可含欄位、Calendar owner、最小
  OAuth scope、測試日曆、credential owner／rotation、輪詢頻率、配額／成本、刪除與事故處理。
  本階段仍須比照 §3 另有 request、provider plan、apply approval、觀察與交接。
- **動作**：建立專用測試 Calendar 與最小身分；Calendar 只是投影，預約容量／衝突仍由
  本系統判斷。以 transactional outbox 發出冪等工作，保存 sync token，push 只作喚醒、
  polling 作收斂；服務不在事件 description／attendees／extended properties 寫入未核准 PII。
- **動作與驗收證據**（依 Google 官方同步模型，見規劃書 §6）：

| 必測項目 | 通過標準 |
| --- | --- |
| 最小 scope | 申請的權限範圍逐項列出並可解釋為何需要 |
| 事件無病患 PII | 抽樣事件內容，確認不含療程名稱等敏感欄位 |
| syncToken 持久化 | 重啟服務後仍能增量同步 |
| 410 Gone 分支 | 人為使 token 失效，確認自動退回完整同步而非報錯 |
| 推播不可靠的補償 | 關閉推播後，輪詢仍能在 SLO 內收斂 |
| lost-ACK 冪等 | 同一事件重送 100 次只產生一筆 |
| 死信與補回 | 連續失敗進死信、恢復後可安全補回 |
| credential rotation | 新 secret version 指定版本小流量部署並驗證，之後停用舊版；觀察窗後才銷毀，流程可重入／回切 |
| watch channel lifecycle | 記錄 resource ID、channel ID、expiration；續租失敗時 polling 仍收斂，舊 channel 可安全停止 |
| 配額／退避 | 429／5xx 使用有上限的 exponential backoff＋jitter；重試不突破 idempotency |
| 對帳 | 系統 source of truth 與 Calendar 投影可列出差異、補回並留下 audit |

- **停止條件**：事件出現未核准 PII、Calendar 回寫改變本系統容量、重送產生重複事件、
  410 分支資料遺失、polling 無法在 SLO 內收斂，或舊 credential 尚未可回切。
- **回滾**：停止 worker／watch channel，route 回前一版，切回已驗證 secret version，對帳
  並清理**專用測試 Calendar**；撤銷 credential 前先確保沒有其他核准用途共用。

---

## 階段 5：Stage 4 公開預約與真實病患資料

### 5.1 OPS-01　先正式化預約／排班規則

- **前置**：D-004／D-005；TW-06 多服務 ADR；Stage 2 auth／database；仍只用合成資料。
- **動作**：實作 versioned service catalog、published slot block、multi-service occupation、
  practitioner／room／equipment capacity、horizon／blackout、delay、admin override、取消／改期／
  no-show。Google Calendar 不參與容量鎖；寫入走 idempotent transaction。
- **驗收證據**：每個已核准 rule 的 decision ID／effective date；boundary、property、競態、
  blackout／DST／`Asia/Taipei`、override／reason、取消期限正負測試；舊 single-service 合成資料
  的 expand／migrate／verify／contract rehearsal。
- **回滾**：切回上一個 policy version；已成立預約不被無痕重算，差異進人工 review。

### 5.2 PUB-01　建立隱私、供應商與資料生命週期

- **前置**：D-001～D-003；privacy／legal owner 已依規劃書 §5.4 鎖定預計上線日的有效
  法規版本、診所／醫院辦法適用性、受託處理與事件通知責任。
- **動作**：建立欄位級 data inventory：蒐集目的、類別、必要性、告知文字、利用期間／
  地區／對象／方式、權利管道、owner、保存／刪除／備份例外；維護 Google Cloud DPA、
  subprocessor／location、notification email 與 contract owner。建立查詢、更正、停止、
  刪除、匯出、申訴、事件通知與 processor management runbook。
- **驗收證據**：data inventory × notice mapping；版本化政策與接受證據；DSR／retention／
  deletion／backup exception、data incident、processor change 的桌上演練與實際 owner 回應。
- **回滾**：政策未核准即不收資料；政策變更發新版，不覆寫舊版／同意歷史。

### 5.3 PUB-02　患者身分、public API 與人工備援

- **前置**：D-005／D-011、D-006／D-010 實作證據、5.1／5.2、獨立 public release request；
  患者本人驗證方式已經 security／privacy／operations 核准。
- **動作**：移除 `localStorage`、URL、analytics、error log、Calendar 與非必要 audit 的完整
  PII；public API 加 rate／abuse、idempotency、generic error、bot／重送控制與 kill switch。
  建立電話／櫃檯人工預約、離線紙本、恢復後補登／去重與通知流程；正式 URL／language／
  DNS／certificate 依 D-011。
- **驗收證據**：本人／冒用、重複送出、取消期限、rate／abuse、offline／補登、kill switch、
  staff-only 回復；browser／URL／logs／analytics／Calendar 抽樣無未核准 PII。
- **回滾**：先關 public route 回到 staff-only；保留權利／incident／audit 處理能力。

### 5.4 PUB-03　診所官網實機接受與授權素材

- **前置**：GOV-05／D-011；clinic content owner、圖片權利人／授權證據與可接受的實機驗收
  裝置已具名。不得以「官網上看得到」推定可複製、改作或再散布。
- **動作**：請業主在代表性桌機／手機接受 C1 的版面與內容邊界；對 C2 每張候選圖記來源、
  權利基礎、允許用途／期限，再轉 WebP／responsive size。保持排除未核准醫美內容，先壓進
  `/clinic.html` 560 KiB／3 檔影像預算；真的要改預算須另附量測與核准理由。
- **驗收證據**：C1 具名實機接受；C2 asset manifest／授權附件／SHA-256；`check:perf`、SEO、
  keyboard／screen-reader、responsive visual、broken-link 與已授權 preview 驗證全綠。
- **回滾**：移除未核准素材並回前一個已接受版本；權利撤回或來源存疑立即停止散布，保留
  處理紀錄但不繼續部署該檔。

### 5.5 真資料 migration 與小流量釋出

- **前置**：5.1～5.4 完成；migration 與 public release 分開核准；backup／restore 已實測。
- **動作**：expand → synthetic rehearsal → 受控 migrate → count／checksum／抽樣 → 切讀 →
  觀察 → contract；先內部／限定小流量，再按核准比例擴大。
- **驗收證據**：migration 可重入、失敗 resume、前後筆數／checksum／抽樣、data owner signoff；
  每段流量的錯誤／延遲／重複／abuse／告警／成本與使用者支援紀錄。
- **停止條件**：任何欄位無 purpose／retention、法規或 DPA 未定、PII 出界、權利請求無
  owner、migration 不可重跑、人工備援／kill switch 失效。
- **回滾**：停止新寫入／流量、回向後相容 read path或 restore／forward-fix。關 route 不等於
  可任意刪除已蒐集資料。

---

## 階段 6：Stage 5 個管與薪資

### 6.1 OPS-02　個管指派、改派與 patient merge

- **前置**：D-007、C4／C5、合成資料與獨立 request；醫療／財務欄位仍按 D-014／D-015
  fail closed。
- **動作**：實作 assignment lifecycle、未指派 queue／SLA、改派／代理／離職、resource
  scope；merge 先候選比對與差異 preview，再由核准角色覆核，保留 source IDs 與可逆映射。
- **驗收證據**：同一人／不同人 false-positive／false-negative fixtures、跨個管 BOLA、代理
  到期、離職撤權、merge 雙人覆核與完整 restore；audit 含 actor、before／after、reason。
- **回滾**：撤銷 route／policy；錯 merge 走預演的 restore command，不直接手改 documents。

### 6.2 OPS-03　薪資 rule、月結與調整

- **前置**：D-008；若計算引用 payment／refund，另需 D-015 與 S-04，否則明確排除金額；
  finance/legal 已判定工資／出勤紀錄適用性。
- **動作**：每筆 credit 綁 source event／assignment snapshot／rule version；period 依
  `open → review → locked → adjustment_open` 前進。locked snapshot 不重算；錯誤只新增
  adjustment／reason／approver。病患付款與人員結算使用不同資料域與欄位。
- **驗收證據**：rule effective-date／backfill、取消／no-show／duplicate、rounding、period
  close concurrency、recompute diff、dispute／adjustment、角色／欄位 BOLA；如適用，工資明細、
  五年清冊與出勤至分鐘的保存／調閱流程演練。
- **回滾**：未鎖期可切回前一版 rule並產生差異報告；已鎖期只追加 adjustment。

### 6.3 TW-07　補齊所有異動理由與 correction inventory

- **前置**：release scope 的 appointment／case／payroll 決策已定；Expansion 欄位可標 N/A。
- **動作**：逐一列出改期、取消、改服務、換人、merge、金額、退款、結算、Calendar candidate
  的 command；定義 reason 是否必填、actor、before／after、approval、correction／reversal。
- **驗收證據**：OR-68／69 coverage=100%；每個 command 有 allow／deny／audit assertion；
  任何資料域都沒有 generic update endpoint 可繞過 command。
- **回滾**：route fail closed；不以移除 reason／audit 要求作回復。

---

## 階段 7：Stage 6 Production Go／No-Go

先設定 release freeze；production plan、image digest、migration、config／secret version 與
runbook 在會前凍結。任何變更都使相關證據失效。全部通過後，才由 clinic、privacy、
security、operations、technical owners 對**同一 release candidate**共同決定。

| 關卡 | 通過標準 |
| --- | --- |
| 人工無障礙 | WCAG 2.2 AA 的人工驗證（自動掃描不足以證明，見規劃書 §5.3） |
| 效能 | Core Web Vitals 第 75 百分位達標；操作回應符合 0.1／1／10 秒分級 |
| 備份還原 | 實際還原一次並比對完整性 |
| Database／project／regional failure | 依 C0 選定方案分開演練；記錄實際 recovery point、RPO、RTO、failback，不以同區 backup 代替 regional DR |
| 事故桌上演練 | 含告警接收、升級與對外溝通 |
| 負載與積壓 | 依 Firestore 500/50/5 規則暖機後量測，非全速冷打 |
| Runtime／schema rollback | Cloud Run 流量回切與資料 schema 向前／向後相容均實測；不可只驗 revision |
| 安全證據 | SAST、相依、SBOM、artifact digest、ASVS 版本化 control、授權負向矩陣、稽核完整、secret rotation |
| 隱私／法遵 | 有效法規版本、適用性 memo、data inventory、告知／權利請求／事件流程與處理者清單均具名核准 |
| 營運接手 | dashboard、告警主備、on-call／升級、供應商聯絡、成本處置、停機紙本／補登程序可執行 |
| Change integrity | production plan hash、source commit、provider lock、state serial、image digest 與核准紀錄完全一致 |

**No-Go／撤銷 Go：** 任一證據超過核准有效期、owner 缺席、plan 失效、重大弱點未處置、
回滾／restore 未達標、未解 drift、真實 PII 邊界不明或告警收不到，一律 No-Go。Go 決定後
若 release candidate 改變，必須重新評估受影響關卡。

**上線與 hypercare：** 先 0% revision 驗證，再依核准比例移轉；每段觀察錯誤、延遲、
積壓、auth denial、audit failure 與成本。指定 hypercare 結束條件與交接時間；在結束前
technical／operations owner 不得同時離線。達停止門檻立即切回／關閉 public route並啟動
事故流程。

---

## 階段 8：Expansion S（手術、付款、結算、雙向 Calendar）

**不得併入前述階段，除非業主明確決定合併。**

### 8.1 S-00　凍結 Expansion release scope

- **前置**：GOV-06；可以只核准部分 S 切片，不要求一次全做。
- **動作**：把 OR-40～61、OR-63～69 映射到 S-01～S-07；列 data classification、domain
  owner、角色／欄位、commands／events、依賴、明確排除、migration 與分批 release。S3～S6
  是否同一 release 必須明確決定。
- **驗收證據**：零 unmapped expansion item；每片 request／owner／decision／stop／rollback。
- **回滾**：scope 變更發新版；未獲准項保持 plan-only。

### 8.2 S-01　領域與安全基線

- **前置**：D-004、D-014／D-015 中該 slice 必要的規則已核准；仍無 route／真資料。
- **動作**：分開 `surgery`、`clinical timeline`、`payment ledger`、`staff settlement` 模組，
  定義只可透過 command 改變的狀態機、interval conflict、money invariants、event／audit、
  field projection。病患財務與人員結算不得共用欄位。
- **驗收證據**：ADR／architecture gate、property-based／state-machine／RBAC projection tests；
  no route、no persistence、no real data 證據。
- **回滾**：revert pure-domain commit，不碰既有 Phase 1 資料。

### 8.3 S-02　合成手術排程

- **前置**：S-01、Stage 2 auth／API、D-004 surgery slot／休診 override 已定；只用 synthetic。
- **動作**：實作週三～五／週六核准時段、自訂時段、surgeon／room／patient overlap、到診後
  轉手術、檢查不建手術、改期釋放原時段；admin override 仍不可繞過資源衝突。
- **驗收證據**：OR-40～50 mapping；同時預約競態、跨午夜／休診、override reason、改期／
  取消／restore、顏色之外的文字辨識與 a11y E2E。
- **回滾**：關閉 surgery route／feature flag，保留既有 Phase 1 appointment。

### 8.4 S-03　臨床時間軸與回診

- **前置**：D-001～D-003、D-014、S-02；medical／privacy owner 具名。
- **動作**：只存核准的 surgery／anesthesia／actual time／follow-up 欄位；每筆有 accountable
  medical owner、access log、correction／export／retention。回診只有 completed 才計數，
  原事件保留，改期／取消不覆寫。
- **驗收證據**：OR-51／52／60／61／68／69；field inventory、跨角色 BOLA、minimum-necessary
  projection、correction、病歷／非病歷分流、retention／DSR／export drill。
- **回滾**：停止新 clinical write、quarantine；correction／restore 不刪歷史。

### 8.5 S-04　付款與退款 ledger

- **前置**：D-015；accounting source／currency／rounding／refund／reconciliation owner 已定。
- **動作**：append-only entries 表示 total approved price、deposit、balance、payment、refund；
  derived balance／status 由 ledger 計算，不能手改狀態。每筆綁外部帳本 reference／reason／actor。
- **驗收證據**：OR-53～55／57～60／66／68～69；decimal／rounding、partial／overpayment、
  refund pending／complete、duplicate／idempotency、reconciliation、field-level BOLA property tests。
- **回滾**：不刪 ledger；錯誤以 reversal／correction entry，必要時關閉 payment route。

### 8.6 S-05　人員結算

- **前置**：D-008、D-015、S-04；finance/legal 的工資／稅務／會計適用性 memo。
- **動作**：consultant／physician／customer-service 分開 settlement；fixed／total-%／received-%／
  manual 只啟用核准方法；rule version、source snapshot、lock／adjustment 與 patient payment
  資料域分離。
- **驗收證據**：OR-63～67；退款後 basis、三角色拆分、rounding、跨期、lock concurrency、
  dispute／adjustment、self-only／finance-all／nurse-deny field BOLA。
- **回滾**：已鎖 settlement 不重寫，只追加 adjustment；route 可關閉、ledger 保留。

### 8.7 S-06　Google Calendar inbound review

- **前置**：D-009／D-016、CAL-01 穩定、專用 Calendar／scope／reviewer／SLO 核准。
- **動作**：watch＋incremental sync；unknown／modified／delete 轉 candidate，不直接改 system；
  review command 重新檢查版本、角色、營業時間與衝突，留下 approved／rejected／superseded。
  `410 Gone` 清 token 全量重同步；push 遺失由 polling／reconciliation 補回。
- **驗收證據**：OR-43～45；channel renewal／expiration、sync-before-watch-response、410、lost／
  duplicate notification、unknown／delete／conflict、RBAC／reason、SLO／DLQ／reconciliation drill。
- **回滾**：停止 watch／worker，保留 outbound projection；未 review candidate 不影響正式預約。

### 8.8 S-07　Expansion 整合與 Go／No-Go

- **前置**：本次 scope 選中的 S-02～S-06 全部完成；未選項明確 deferred。
- **動作**：依 §7 對 Expansion release candidate 重跑 security、privacy、medical、finance、
  accessibility、migration、load、DR、rollback、operational handoff。
- **驗收證據**：OR-40～69 coverage；各 data domain owner 聯合簽核；跨域查詢不洩露 medical／
  payment／settlement 欄位；事故與錯 merge／refund／Calendar conflict 演練。
- **回滾**：按 slice feature／route 關閉；資料域各自 correction／restore，不做跨域 destroy。

---

## 階段 9：常態維護節奏

維護性不是一次性工作，以下是固定節奏。

| 頻率 | 要做的事 | 為什麼 |
| --- | --- | --- |
| **每次 PR** | `verify` 全綠；新頁面先進效能預算表；新欄位先過翻譯與欄位守衛 | 這三項都曾實際漏過 |
| **每週** | 看 Dependabot 新警示；看死信佇列與 outbox 最舊未處理項目 | 相依漏洞是時間函數，不是程式碼函數 |
| **每月** | 相依升級；重查安全例外；抽查 secret 指定版本／rotation；核對費用與 forecast | 例外與 credential 都必須有 owner、到期／輪替與回復路徑 |
| **每季** | 全新 clone 驗證；覆核 IAM／WIF condition；restore smoke；權利請求與告警演練；重評效能預算 | 防止只在既有環境能過的假綠燈 |
| **每半年** | database／project／regional recovery 與 failback 演練；適用法規與處理者清單重審 | backup 存在不等於在 RPO／RTO 內可恢復 |
| **每次上游改版** | 重新確認 Core Web Vitals 門檻與 WCAG 版本 | 標準會演進（WCAG 2.2 已移除 4.1.1） |

---

## 階段 10：表單模板

### 10.1 核准基線快照

```text
Snapshot ID／版本：
來源文件 commit：
建立人／建立時間（Asia/Taipei）：

每筆決定：
- 決定編號／答案：
- 核准人（姓名／職稱）／日期：
- 依據文件或證據：
- 適用範圍／明確排除項：
- 接受的剩餘風險：
- 解鎖的切片／仍禁止的切片：

仍 pending／互相矛盾的決定：
Reviewer 1／日期：
Reviewer 2／日期：
被新版取代時的 successor snapshot：
```

### 10.2 外部狀態變更申請（C1～C6、Calendar、真資料與 production 每一片一份）

```text
切片編號：
Request ID／approval snapshot commit：
精確範圍：
明確不做：
資料分類（synthetic／個資／特種個資／財務／secret／metadata）：
目標 environment／project／region：
預估成本／月：
單價查價日／幣別／稅匯率來源：
成本容忍範圍與 50%／80%／100% 處置：
執行人（operator）：
核准人（approver，不得與 operator 同人）：
主要／備援營運 owner：
執行時間窗：
停止條件：
Provider plan artifact／SHA-256：
source commit／provider lock／state serial／target project／identity：
Apply approval 人／時間／到期：
逐資源回滾步驟：
回滾已實測日期：
證據保存位置／存取權／保存期限：
```

### 10.3 步驟完成紀錄

```text
步驟編號：
前置是否齊備：
實際執行指令／動作：
執行人／開始／結束時間：
source commit／artifact digest／plan SHA-256：
Actual resource／revision／secret version IDs：
正向測試（數量／結果／證據）：
負向測試（數量／結果／證據）：
告警／成本／drift 結果：
回滾或回復演練（觸發、耗時、結果）：
觀察窗與退出指標：
未完成的部分與原因：
偏差／事故／剩餘風險與 owner：
```

### 10.4 階段交接紀錄（每個階段完成時必備）

依[開發與交接規約](../../CONTRIBUTING.md)第 10 條，**沒有這份紀錄，該階段不算完成**。
檔名為 `docs/reviews/YYYY-MM-DD-<主題>.md`，並登記到 `docs/README.md` 的 Review
record。範例見
[2026-08-01 SAST 換軌與稽核例外治理](../reviews/2026-08-01-sast-migration-and-audit-governance-delivery.md)。

必備段落如下。判斷標準只有一個：**一個沒參與過的人讀完能不能接手。**

| 段落 | 內容 | 常見的寫壞方式 |
| --- | --- | --- |
| 一句話 | 這個階段到底做了什麼 | 寫成待辦清單而不是已完成的事 |
| 交付的修訂版本 | 分支、PR、每個 commit 與 merge commit | 只寫「已合併」，沒有 hash |
| 驗收證據 | 每道關卡的**實際數字**與 CI 連結 | 寫「全部通過」，沒有檔數、測試數、掃描規則數 |
| 發現的真缺陷 | 執行時撞出來的問題與是否已修 | 只記需求，把缺陷當成不好意思說的事 |
| **未處理事項** | 明確列出沒修的、沒跑的、繞過的 | **最常被省略，也是交接失敗的主因** |
| 本機環境陷阱 | 換一台機器或換個人就會踩到的坑 | 留在某個人的腦袋裡 |
| 記錄的決策與剩餘風險 | 核准編號、核准人、如實的剩餘風險 | 把單人簽核寫成兩組審查 |
| 下一位從這裡開始 | 有順序的待辦，每項標明卡在哪 | 寫「請參考其他文件」 |

```text
階段／步驟編號：
對應執行書段落：
分支／PR／merge commit：
每道關卡的實際結果（含數字）：
發現並修好的缺陷：
未處理、未跑或繞過的事項：
本機環境陷阱：
本階段記錄的決策與剩餘風險：
下一位接手者的第一步：
目前 Stage 位置是否改變：
```

### 10.5 營運交接紀錄

```text
服務／切片／版本：
目前流量／資料分類／公開程度：
Dashboard／SLI／SLO：
告警名稱、門檻、主要／備援接收者：
日常檢查與頻率：
常見故障與 runbook：
停機、kill switch、rollback／restore／failback 步驟：
Secret／certificate／WIF／IAM owner 與覆核日期：
Backup／PITR／DR 最近實測日期與 RPO／RTO：
費用基準、budget 與 50%／80%／100% 行動：
供應商／privacy／security／technical 升級聯絡：
已知限制／未處理風險／到期日：
移交人／接手人／日期：
接手人實際演練的項目與結果：
```

### 10.6 Production Go／No-Go 會議紀錄

```text
Release candidate commit／image digest／production plan SHA-256：
Approval snapshot／決策版本：
Release freeze 開始時間：
每一道 §7 gate 的證據連結、執行日、有效期限：
未關閉弱點／例外／drift／剩餘風險與接受人：
Rollback target revision／schema 相容性／restore 證據：
上線百分比、觀察窗、停止門檻、hypercare 時間：
clinic owner：GO / NO-GO（簽名／時間）
privacy owner：GO / NO-GO（簽名／時間）
security owner：GO / NO-GO（簽名／時間）
operations owner：GO / NO-GO（簽名／時間）
technical owner：GO / NO-GO（簽名／時間）
最終結論／限制／下一次重審條件：
```

### 10.7 全待辦 tracker

`docs/product/` 中的實際 tracker 可使用下列欄位；§0.1 只保留管理摘要。任何新待辦先判斷
是否已由既有 work package 覆蓋，避免替同一件事另開一張卡。

```text
Work-package ID：
標題：
來源編號（業主題號／D／T／OR／C／handoff）：
Release scope（Phase 1／Expansion／BAU／deferred）：
狀態（WAITING_FOR_ANSWER／READY／BLOCKED／NOT_AUTHORISED／IN_PROGRESS／DONE／DEFERRED）：
Accountable owner／執行人／覆核人：
前置決策／request／authority：
相依 work package：
目標完成日／重審日：
明確範圍／排除項：
目前 blocker／下一個具體動作：
完成定義：
commit／PR／CI／測試／演練／簽核證據：
剩餘風險／接受人／到期日：
successor／handoff：
最後更新（Asia/Taipei）：
```

---

## 附錄 A：Repository 常用指令

```bash
corepack pnpm run verify
```

```bash
corepack pnpm run test:rules
```

```bash
corepack pnpm run check:supply-chain
```

```bash
corepack pnpm run test:e2e
```

這些只驗 repository，不能替代 provider plan、connected-cloud 負向測試、restore、rollback、
法遵適用性或 Go／No-Go 證據。

## 附錄 B：官方與權威控制來源

| 主題 | 來源 | 本執行書採用的控制 |
| --- | --- | --- |
| 身分／session | [NIST SP 800-63B-4 AAL](https://pages.nist.gov/800-63-4/sp800-63b/aal/)、[Session Management](https://pages.nist.gov/800-63-4/sp800-63b/session/) | 8h／30m 保留；AAL2 抗釣魚選項或偏差決定；cookie／CSRF／server timeout |
| 應用安全驗收 | [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | 固定使用穩定版 5.0.0 與 versioned requirement ID |
| 安全開發生命週期 | [NIST SP 800-218 SSDF](https://csrc.nist.gov/pubs/sp/800/218/final) | 安全實務嵌入各切片；gate、供應鏈、缺陷與證據不留到上線前一次補 |
| Firebase session | [Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) | CSRF 保護、Secure／HttpOnly cookie、server verify／revocation |
| Terraform／state | [Security best practices](https://docs.cloud.google.com/docs/terraform/best-practices/security)、[Structure](https://cloud.google.com/docs/terraform/best-practices/general-style-structure) | remote restricted state、secret 不入 state／log、pre-apply policy、post-apply audit、deletion protection |
| CI cloud identity | [WIF for deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines) | 短期憑證、attribute condition、數字 ID、repo／branch／workflow 限制 |
| Runtime release | [Cloud Run rollout／rollback](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)、[Health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks) | 0% revision、health／smoke、分段流量、可回切 revision |
| Firestore | [Locations](https://docs.cloud.google.com/firestore/native/docs/locations)、[Backups](https://docs.cloud.google.com/firestore/native/docs/backups)、[Export／import](https://docs.cloud.google.com/firestore/native/docs/manage-data/export-import) | location 建立後不可變、restore 到新 DB、同區 backup 非 regional DR、實測 RPO／RTO |
| Secret rotation | [Secret Manager rotation recommendations](https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations) | 指定 version、漸進驗證、先 disable 後 destroy、reentrant rotation |
| 成本 | [Cloud Billing budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets) | budget 是有延遲的告警，不是硬上限 |
| 雲端處理者 | [Google Cloud Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum) | 簽約主體、subprocessor 通知、聯絡信箱、資料區域與變更重審均有 owner |
| 無障礙 | [W3C WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)、[WAI Easy Checks](https://www.w3.org/WAI/test-evaluate/preliminary/) | 自動檢查加人工鍵盤、縮放、高對比與螢幕閱讀器；留 AT／browser／SC／重測證據 |
| 台灣個資 | [個資法第 8 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=8)、[第 11 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=11)、[第 12 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=12) | 告知、正確／更正／刪停、事故流程；上線日前鎖定實際生效版本 |
| 醫療資料 | [醫療法第 70 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0020021&flno=70)、[衛福部醫院個資安全維護辦法](https://www.mohw.gov.tw/fp-18-54747-1.html) | 病歷保存與個資安全控制；辦法是否適用診所由 privacy／legal owner 判定 |
| 工資／出勤 | [勞動基準法第 23 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=23)、[第 30 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=30) | 若 finance／legal 判定適用，工資明細／清冊與逐分鐘出勤紀錄依規保存五年；工程端不自行推定適用性 |
