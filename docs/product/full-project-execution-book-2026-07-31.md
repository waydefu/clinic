# 全專案執行書（2026-07-31）

**狀態：執行書／逐步動作清單。** 本文件把
[全專案總體規劃書](full-project-master-plan-2026-07-31.md)的策略翻成**可以照著做**
的步驟。它**不核准任何事**——每一個標示「需授權」的步驟，在拿到書面核准前都不得
執行。

**閱讀順序：** 先看規劃書知道「為什麼」，再用本書知道「怎麼做」，核准狀態查
[決策登錄](phase-1-decision-register.md)，核准順序查
[後續執行與核准清單](current-execution-and-approval-plan.md)。

**2026-08-01 查核更新：** Stage 0 已完成，現況是 Stage 1。以下 C0、C1～C6 與後續
步驟仍是條件式執行書，不代表已取得 deployment authority、apply approval、真實資料或
production 授權。官方基準與控制來源集中列於附錄 B。

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

### 步驟 0-7　補齊把關腳本自己的測試（維護性第一順位）

- **前置**：0-5 完成。
- **動作**：為 `scripts/` 下每一支阻斷式檢查補測試，優先順序：
  `check-tracked-secrets.mjs`（已出過事）→ `check-structure.mjs` →
  `check-docs-links.mjs` → `check-public-pages.mjs` → 其餘。
  每支至少覆蓋三種情境：正常、髒工作區（有刪除／新增未 commit）、全新 clone。
- **驗收證據**：新測試檔與其在 `test:unit` 中的通過數增量。
- **回滾**：單獨 revert，不影響產品程式碼。

---

## 階段 1：把業主的答案收回來

技術上不阻塞，但**後面每一階段都靠它解鎖**。

### 步驟 1-1　送出兩份決定清單

- **動作**：把
  `業主決定事項清單-2026-07-31.docx`（39 題）與
  `技術資安決定事項清單-2026-07-31.docx`（T1–T21、C1–C6）分別送出。
- **驗收證據**：回填後的文件，每題都有核准人與日期。

### 步驟 1-2　優先追回四個矛盾點

不需要開會，四句話就能定案，但不定案會做錯方向（詳見
[業主需求彙整索引](owner-requests-consolidated-2026-07-31.md) §L）：

| # | 問題 | 目前程式行為 |
| --- | --- | --- |
| 1 | 週三至五收班 20:00 還是 20:30 | 20:00 |
| 2 | 止鼾時長固定 40–60 分，還是到診後才定 | 到診後才定 |
| 3 | 重複預約上限幾次、依什麼判定同一人 | 有上限機制，數值未經核定 |
| 4 | 手術自訂時段可否排在休診日／國定假日 | 未定義 |

### 步驟 1-3　先簽掉不需診所端的兩項

- **動作**：SEC-02（Semgrep 證據政策）與 SEC-03（`brace-expansion` 風險接受）由
  technical owner + security owner 具名簽核。
- **驗收證據**：依核准紀錄格式填寫的兩份紀錄。
- **注意**：SEC-02 未簽而先合併 SAST 換方案，等於在沒有證據政策的情況下換掉把關
  方式。步驟 0-5 因此把它列為前置。

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

- **前置**：D-001～D-005、D-011 核准；D-006／D-010 實作證據齊備；Stage 2 完成；
  privacy／legal owner 已依規劃書 §5.4 鎖定預計上線日的有效法規版本、診所／醫院辦法
  適用性、受託處理與事件通知責任。真實資料 migration 與 public release 各自有核准。
- **動作**：
  1. 建立欄位級 data inventory：蒐集目的、類別、必要性、告知文字、利用期間／地區／
     對象／方式、權利管道、owner、保存／刪除／備份例外；未映射欄位不得收集。
  2. 發布版本化隱私告知並保存同意／告知版本；建立查詢、更正、停止、刪除、匯出、申訴、
     事件通知與處理者管理 runbook，指定主要／備援人與時限。
  3. **把完整 PII 從 `localStorage`、URL、analytics、error log、Calendar 與非必要 audit 移除**；
     public API 加 rate limit、abuse control、idempotency、generic error 與 kill switch。
  4. 資料變更採 expand → synthetic rehearsal → migrate → count／checksum／抽樣 → 切讀 →
     觀察 → contract；不可逆 migration 與 public route 首次開放不得綁成一個步驟。
- **驗收證據**：法規版本／適用性 memo；data inventory 與隱私告知逐欄 mapping；一輪
  查閱／更正／停止／刪除演練及備份例外說明；處理者清單；事故桌上演練；browser／URL／
  logs／analytics／Calendar 抽樣無未核准 PII；migration 前後筆數／checksum／失敗重跑；
  public abuse、重送、kill switch 與 staff-only 回復實測。
- **停止條件**：任何欄位無目的／保存依據、法規版本或適用性未定、權利請求無 owner、
  處理者契約／責任不明、PII 出現在非核准位置、migration 無法重跑或 kill switch 失效。
- **回滾**：先關閉 public route 回到 staff-only、停止新資料寫入並保全 audit；資料以預演
  的向後相容路徑／restore／forward-fix 處理。關 route 不等於可以任意刪已蒐集資料。

---

## 階段 6：Stage 5 個管、排班與薪資

- **前置**：D-004、D-007、D-008 核准。
- **動作**：versioned schedule、指派／改派、病患 merge review、薪資 rule version、
  月結 lock、append-only adjustment。
- **驗收證據**：每一版規則的生效日、核准人與回算差異；關帳後的調整必定留下理由、
  核准人與前後金額；合併病患先預覽差異、雙人覆核並做還原演練；角色矩陣證明個管、
  薪資與一般櫃檯欄位分離。
- **回滾**：規則版本回退；已關帳資料不得直接改寫，只能以新增調整紀錄修正。

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

- **前置**：D-008、D-009、D-014、D-015、D-016 全部核准。
- **動工前必須先完成的設計工作**（規劃書 §2 缺口欄）：
  1. 手術／付款／結算的模組邊界與相依方向，先過 `check:architecture`；
  2. 金額計算的 property-based 測試策略（樣例測試不足以涵蓋退款與部分付款組合）；
  3. 病患財務資料與人員結算資料的**欄位分離**設計（業主已明確要求不得共用欄位）；
  4. 醫療欄位的保存年限設計，需分開處理預約資料與病歷（醫療法第 70 條：至少七年、
     未成年至成年後再七年、人體試驗永久）。
- **驗收證據**：每一項都要有獨立的設計文件與測試，不接受「跟著預約一起做完了」。

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

### 10.2 部署申請（C1～C6 每一片一份）

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
| Firebase session | [Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) | CSRF 保護、Secure／HttpOnly cookie、server verify／revocation |
| Terraform／state | [Security best practices](https://docs.cloud.google.com/docs/terraform/best-practices/security)、[Structure](https://cloud.google.com/docs/terraform/best-practices/general-style-structure) | remote restricted state、secret 不入 state／log、pre-apply policy、post-apply audit、deletion protection |
| CI cloud identity | [WIF for deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines) | 短期憑證、attribute condition、數字 ID、repo／branch／workflow 限制 |
| Runtime release | [Cloud Run rollout／rollback](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)、[Health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks) | 0% revision、health／smoke、分段流量、可回切 revision |
| Firestore | [Locations](https://docs.cloud.google.com/firestore/native/docs/locations)、[Backups](https://docs.cloud.google.com/firestore/native/docs/backups)、[Export／import](https://docs.cloud.google.com/firestore/native/docs/manage-data/export-import) | location 建立後不可變、restore 到新 DB、同區 backup 非 regional DR、實測 RPO／RTO |
| Secret rotation | [Secret Manager rotation recommendations](https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations) | 指定 version、漸進驗證、先 disable 後 destroy、reentrant rotation |
| 成本 | [Cloud Billing budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets) | budget 是有延遲的告警，不是硬上限 |
| 台灣個資 | [個資法第 8 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=8)、[第 11 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=11)、[第 12 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=I0050021&flno=12) | 告知、正確／更正／刪停、事故流程；上線日前鎖定實際生效版本 |
| 醫療資料 | [醫療法第 70 條](https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0020021&flno=70)、[衛福部醫院個資安全維護辦法](https://www.mohw.gov.tw/fp-18-54747-1.html) | 病歷保存與個資安全控制；辦法是否適用診所由 privacy／legal owner 判定 |
