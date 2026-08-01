# 專案後續執行與核准清單

**狀態：現行權威／Stage 1／尚未授權雲端或真實資料。**  
**最後更新：2026-08-01（Asia/Taipei）**

這份文件把後續工作收斂成一條可執行的路徑，並用白話列出需要業主、診所、法務、
資安、營運或技術負責人核准的事項。細節仍以
[決策登錄](phase-1-decision-register.md)、
[全專案總體規劃書 §10](full-project-master-plan-2026-07-31.md)、
[全專案執行書 §0.1](full-project-execution-book-2026-07-31.md)、
[正式化後續實作規劃](production-readiness-delivery-plan-2026-07-23.md)與
[Stage 2 change plan](../architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md)
為準；本文件不自行關閉任何 D-series 決策，也不授權 `terraform apply`、建立
Cloud／Firebase 資源、連接 Calendar 或處理真實病患資料。

## 一句話說明

Stage 0 的 repository／安全證據已完成；現在同時走兩條不衝突的路：回收 39 題業主
答案與完成 C0，以及處理 TW-01～TW-05 的 repository／測試／人工無障礙補強。
C0 通過後才可逐片申請只放合成資料的 staging，後續再依決策走 Calendar、公開服務、
排班／個管／薪資、Production 與獨立的 Expansion S。

## 固定執行順序

### 0. Repository 與品質收尾（主要工作已完成）

Stage 0 已合併，私有與公開端證據見
[Stage 0 交接紀錄](../reviews/2026-08-01-gate-script-test-coverage.md)。仍有五個**不阻塞
決策、但不得遺失**的技術工作包，可在 Stage 1 並行：

1. TW-01：替 `check-architecture.mjs` 補核心邏輯自測。
2. TW-02：拆分 `check-web-ui.mjs` 並補 permission／safety／a11y／DOM fixture。
3. TW-03：補 `checkPublicPageConfiguration` 的完整組態 fixture。
4. TW-04：量測 Vitest collect，並查清 API health test 批次逾時；不得只提高 timeout。
5. TW-05：先在合成環境預演人工無障礙；Production 前對 release candidate 正式執行。

每項的完成定義、回滾與證據格式以[執行書 §1A](full-project-execution-book-2026-07-31.md)
為準。

### 1. 回收全部決策並完成 C0 plan-only 審查

先逐題回收業主決定清單 39 題與技術資安清單 T1～T21；其中 12 筆 pending D-series
（D-001～D-005、D-007～D-009、D-011、D-014～D-016）必須各有具名答案、日期、
適用範圍與排除項。OR-07、OR-22、OR-37 與多服務時長矛盾須由 owner 明確定案，不得由
實作者用現況或多數決猜值。詳細分組與完成定義見執行書 §1。

C0 只核准「未來要怎麼做」，不連 cloud、不建立資源。決策基線齊備後，以下缺一不可：

1. 具名 technical reviewer、security reviewer、billing owner、主要與備援告警
   接收者。
2. 核准最小 IAM matrix、JIT／覆核方式與 Firestore database-scope residual risk。
3. 填入 staging 人數、用量、Cloud Run 容量、查價日期、月預算與
   50%／80%／100% 告警後要做的事。
4. 選定 regional failure 的 DR 方案、secondary project／location、資料複本頻率、
   routing、完整性驗證與 failback owner。
5. 核准 MFA recovery、TOTP clock-skew、授權碼限流／鎖定／解鎖／expiry／rotation
   與是否維持無 break-glass 的 fail-closed 設計。
6. technical／security reviewer 將 C0 結論從 `revise` 改為 `approved`。

### 2. C0 通過後，逐片申請 Stage 2

Stage 2 不是一次核准全部資源。每一片都要有精確 request、明確排除項、成本、
operator、approver、兩階段 plan/apply gate 與逐資源 rollback。

| 切片 | 白話內容 | 進入前核准 | 這片明確不做 |
| --- | --- | --- | --- |
| C1 | 建立隔離 staging 地基、短期 CI 身分、空 secret 容器、基本 log／monitoring／budget | C0 approved＋C1 request＋deployment authority＋apply approval | 不建 Firestore、Identity Platform、API runtime、Calendar、DR secondary 或 production |
| C2 | 合成員工 Google／自管帳號、email verification、MFA 與 recovery | C1 證據＋IdP 成本／recovery 核准＋C2 authority | 不接患者登入 |
| C3 | 安全 cookie、CSRF、30 分鐘 idle、8 小時 absolute session | C2 證據＋threat-model review＋C3 authority | 不信任瀏覽器角色或計時器 |
| C4 | server-side RBAC、停權／撤銷、授權碼 KDF 與限流 | C3 證據＋角色／action fixture＋安全參數核准＋C4 authority | 不用 UI 隱藏代替 API 403 |
| C5 | append-only audit、查閱投影、容量告警與 deletion deny | C4 證據＋D-002 access／export 對齊＋C5 authority | 不允許一般管理者修改／刪除 audit |
| C6 | staff-only 合成 staging API、Web 與端到端驗證 | C1～C5 證據＋C6 authority | 不開 public booking、不放真資料 |

每一片只解除自己列明的工作；上一片的 authority 不會自動授權下一片。
這一段同時承接 T18～T19 的實作證據；T20 要在 release candidate 的 GOV-08 重審，
不能因 C1～C6 完成就自動關閉。

### 3. Stage 3：專用測試 Calendar

先完成 Stage 2 並核准 D-009，才可接專用測試日曆。必須驗證最小 scope、事件無
病患 PII、lost-ACK 冪等、重試／死信／補回、告警與 credential rotation。Google
Calendar 仍只是投影，不是預約量能或衝突的 source of truth。
這一段承接 T14～T17；Calendar request 與 C1～C6 分開核准。

### 4. Stage 4：公開預約與真實病患資料

先核准 D-001～D-005、D-011，並完成已核准 D-006/D-010 的實作證據及 Stage 2。
然後才能發布正式隱私政策、建立患者身分／權利請求／保存刪除流程、開 public API，
並把完整 PII 從 `localStorage` 移除。診所官網另須完成 C1 業主實機接受、C2 圖片來源／
授權證據與 WebP／responsive 壓縮，且維持 560 KiB／3 檔影像預算，才可併入 public release。

### 5. Stage 5：個管、排班與薪資正式化

先核准 D-004、D-007、D-008；若薪資／結算使用付款實收或退款資料，還須先關閉
D-015 的財務權威邊界。再接 versioned schedule、指派／改派、病患 merge review、
薪資 rule version、月結 lock 與 append-only adjustment。

### 6. Stage 6：Production Go／No-Go

所有 release-scope 決策、前置 stage、人工無障礙、備份還原、regional failure、
事故桌上演練、負載／積壓、rollback 與完整安全證據都通過後，才由 clinic、
privacy、security、operations、technical owners 共同決定 Go／No-Go。

### 7. Expansion S：手術、付款、結算與 Calendar inbound

Expansion S 預設不插入 Phase 1 關鍵路徑。先完成 D-014～D-016 與獨立 scope decision，
再依 S-00～S-07 執行：領域／安全基線、合成手術排程、臨床時間軸、付款退款 ledger、
人員結算、Calendar inbound review、整合 Go／No-Go。每片仍需自己的 request、資料分類、
負向測試、回滾與具名醫療／財務／隱私／資安簽核；詳見執行書 §8。

### 8. 常態維運

Repository gate 現在就按每次 PR／每月／每季節奏執行；cloud、Calendar、真資料與
production 的告警、secret rotation、restore、DR、法規／vendor 重審，只在相應服務
存在且完成營運交接後啟用。頻率與 owner 見執行書 §9。

## 需要核准的項目

### A. Repository 與安全證據

| 核准項目 | 狀態 | 白話問題 | 建議方向 | 核准人 |
| --- | --- | --- | --- | --- |
| SEC-01 repository 位置 | **已決定** | 現在要不要把私有 repository 移到組織？ | 2026-07-31 業主方向為「目前不轉移」；維持個人私有 repository，未來再重評 | Repository owner |
| SEC-02 私有 SAST 證據政策 | **已核准 2026-08-01**（含 ENG-01 追加條件；由業主一人兼任技術與資安負責人簽核，非兩組獨立審查） | GitHub Security 頁面不能收 CodeQL 結果時，可否先以 Semgrep CE 專案規則的 JSON／SARIF＋摘要 artifact 作為阻斷證據？ | 接受固定版本、規則正反測試、rules hash 與 commit-bound artifact；任何 finding／掃描／解析／規則測試失敗仍阻斷；明確認知 CE 不是 CodeQL 跨檔案分析的等價替代，上線前重評。**ENG-01（2026-08-01）追加：Semgrep 規則測試與證據產生器測試必須都在阻斷式 gate 內執行，任一失敗即紅。** 追加原因是 2026-08-01 發現證據產生器的測試落後於實作，分類邏輯在修好前從未被驗證 | Technical owner＋security owner |
| SEC-03 `brace-expansion` 暫時例外 | **已解除 2026-08-01**（核准當日 advisory 修訂補上各 major 修補版，解除條件成立；已改為逐 major 鎖定並移除忽略設定，目前無任何 audit 例外） | 舊 major 沒有相容修補時，是否接受目前限定路徑的暫時風險？ | 保持 alert 可見、不 dismiss；只接受目前 dev-only／未掛路由且不接收攻擊者 glob 的路徑，直到上游舊 major 修補或父套件可移到 5.x；每次升版重查 | Technical owner＋security owner |

### B. Stage 1 決策

| Decision | 要核准什麼 | 白話問題 | Owner |
| --- | --- | --- | --- |
| D-001 | 法定資料控制者、隱私聯絡與權利請求流程 | 病患要找誰查詢、更正或刪除資料？診所如何留下處理紀錄？ | Clinic＋privacy/legal |
| D-002 | 保存、刪除、查閱／匯出、供應商與資料區域 | 預約資料留多久、誰能刪、Google 會處理哪些資料、備份如何跟著刪除政策？ | Privacy/legal＋operations |
| D-003 | 最終隱私政策版本與發布流程 | 哪一版文字正式生效？誰核准、如何保留舊版與同意證據？ | Clinic＋privacy/legal |
| D-004 | 服務、資源、slot／容量、horizon、blackout、overrun | 同一時間到底能收幾人、多服務怎麼佔容量、延誤怎麼處理？ | Clinic operations |
| D-005 | 取消、逾時、no-show 與費用 | 24 小時內如何處理、誰能取消、未到是否收費？ | Operations＋legal |
| D-007 | 個管指派、改派、merge review 與例外 | 誰能指派／改派？同一病患重複資料由誰確認合併？ | Case management＋operations |
| D-008 | 薪資規則、月結 owner、覆核與調整 | 怎麼算、誰關帳、關帳後誰能用什麼理由調整？ | Finance＋case management |
| D-009 | Calendar owner、calendar、scope、欄位與失敗責任 | 用哪本專用日曆、誰管 credential、事件允許放什麼、同步失敗誰處理？ | Clinic＋security |
| D-011 | 正式 URL、語言／無障礙與人工預約備援 | 正式網址是什麼、英文版做到哪裡、不會用網路的人打哪支電話？ | Clinic operations |
| D-014 | 手術／臨床紀錄邊界 | 哪些是正式醫療紀錄、由哪位 medical owner 負責、保存／更正／匯出多久？ | Medical＋privacy/legal |
| D-015 | 付款／退款／結算權威 | 哪一套帳是錢的 source of truth、誰對帳、員工結算依什麼資料？ | Finance/accounting＋clinic |
| D-016 | Calendar inbound review | 外部修改要自動套用還是先審？誰審未知事件、刪除與衝突怎麼處理、多久要收斂？ | Clinic＋security＋operations |

D-006 與 D-010 已核准的是目標；仍須 C0 與各切片 deployment authority 才能實作。
D-012 只核准合成 preview 上的健保署署徽；production domain 前要重評。D-013 已
核准並要求 `main` 的 `Verification evidence`，管理者 bypass 保留。

### C. C0 與每次部署

| 核准項目 | 必填答案 |
| --- | --- |
| C0 reviewers | Technical reviewer、security reviewer、日期與 `approved/revise` |
| 帳務與告警 | Billing owner、staging 月預算、50%／80%／100% 行動、主要／備援接收者 |
| IAM | 具名 principals、exact roles/custom roles、JIT／覆核週期與 residual-risk acceptance |
| DR | 選定方案、secondary project/location、複本頻率、routing、failback 與 owner |
| 身分安全參數 | MFA recovery、TOTP window、授權碼限流／鎖定／解鎖／expiry／rotation、break-glass |
| 每一個 C1～C6 request | 精確 scope／排除項、預算、operator、apply approver、window、plan hash、rollback |

## 核准紀錄格式

每個核准項目都要留下以下欄位，口頭「可以」不足以解除 gate：

```text
Approval ID / Decision ID:
Answer:
Approved by:
Approval date (Asia/Taipei):
Evidence / policy / request reference:
Scope and explicit exclusions:
Residual risk accepted:
Follow-up implementation issue:
```

## 現在仍禁止

- 真實病患、薪資、Calendar、社群訊息或 NAS 資料；
- public／staff booking write route；
- Cloud Firestore、Authentication、Identity Platform、Calendar 或 NAS 接線；
- `terraform apply`、Firebase live-channel deployment 或 production credential；
- 以 synthetic UI、Emulator、preview、綠色 public mirror 或文件提案冒充 production
  安全、隱私、備份、IAM 或上線證據。
