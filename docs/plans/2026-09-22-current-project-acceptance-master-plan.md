# 現有診所專案完整驗收主計畫（2026-09-22）

狀態：**plan-only／供審查；不是 P1-09 完成證據或雲端執行授權。**
工程基線：`origin/main` `e387f2522ea010848f41a4f34778ffc50d83fef3`。
本文所在 commit 請以 `git log -1 -- docs/plans/2026-09-22-current-project-acceptance-master-plan.md` 查找。

本計畫落實業主本輪「改完後，後續完整計畫書開 PR，詳細到 Luna 可直接接手」的要求。
取代前次聊天報告將本機舊 DOCX 當現行商務文件的判定，並修正前次表格誤列 #122 為未合併：
#122 是 MERGED。本文只把已核對事實、業主產品決定、待核准操作及缺少證據分開記錄。
新 PR 不核准雲端，不修改任何既有 D-series 的 production 核准狀態。

## 使用入口

1. 主代理只先讀本頁、`AGENTS.md`、`CLAUDE.md`、對應決策登錄段落。
2. 執行一包時，只載入[執行工作包](2026-09-22-current-project-execution-packets.md)該包及其 `FILES_TO_READ`。
3. P1-09 操作使用[逐步操作書](2026-09-22-p1-09-operator-packet.md)；當前仍待新授權。
4. 回報逐列使用[驗收矩陣](2026-09-22-current-project-acceptance-matrix.md)，不可只回總體 PASS。
5. 查舊 PR 才讀[完整歷史與有效性](2026-09-22-current-project-pr-history.md)。不要每包重掃歷史。

簡單、已知邊界的工作委派 `gpt-5.6-luna`、`xhigh`；主代理處理權限、資料辨識、
未解政策、完整 Terraform diff 及證據矛盾。模型不改變驗收門檻。

## 一、目前專案真實狀態

來源／GitHub snapshot：2026-09-22；本文件撰寫前 fresh fetch。
雲端 snapshot：本對話 2026-09-22 約 18:01–18:06 Asia/Taipei 的唯讀讀回，
**不是執行時保證**。操作者須重新收集 JSON 並校驗。

| 項目 | 已觀察事實 | 可據此宣稱的範圍 |
| --- | --- | --- |
| main | `e387f2522ea010848f41a4f34778ffc50d83fef3`，最新 merge #161 | 工程基線 |
| PR | 全部 161；152 merged、9 closed-unmerged；open 0 | 歷史 inventory，非功能驗收 |
| CI | [verify 35622277537](https://github.com/waydefu/clinic/actions/runs/35622277537)，12/12 jobs success | 該 main 的 CI，非 runtime |
| API | `internal-test-api-00012-9t4`；source `4f31b00f378c96b213c64f33100b5e0d35583d3e`；proxy hops `1` | #159–161 尚未部署至目前 API |
| API digest | `sha256:93ab43f332821840a8f2f99e27bdb573fad32286b2372b4ecae205f282874e47` | 已觀察映像 pin |
| worker | `internal-test-outbox-00011-rth`；同 `4f31b00…` source | 既有 outbox runtime |
| worker digest | `sha256:53abad077c124af962c3ca85c7bb1f70a3dc35dbd2d5db4de4000aec2ee2248e` | 已觀察映像 pin |
| Hosting | 隔離 `internal-preproduction`，`/v1/**` → `fh-e267c1e87e26447c` → API `00012-9t4` | 部署新 API 不等於 preview 自動改指向 |
| inbound | sync identity、secret container、service、Scheduler 尚未存在；最終配置未獲本輪新讀回 | runtime 缺口，不能由 Terraform 存在推定已建 |
| 排程 | outbox drain `ENABLED`；inbound job 尚不存在 | 兩種 Scheduler 不可混稱全都 PAUSED |
| Google 保護 | C1 `(default)`／`asia-east1`；PITR、delete protection 啟用；daily 30 天；9/22 備份 READY | cloud readback，非 restore proof |
| P1-05R/07/08 | 對話中的 `4f31b00…` 合成現場包記錄成功；尚需持久可攜證據索引 | 有日期的既有操作證據，不能取代新版本回歸 |
| P1-06 | 對話有「已收到」；本機紀錄仍寫 pending confirmation | 先補 incident／message 對應，不直接升為完整正式人證 |
| P1-09 | 未關帳；candidate lifecycle、429 及整體 strict matrix 未齊 | `NOT_CLOSED` |

歷史 logout 500 的 IAM 缺權限維持 `HIGH_CONFIDENCE_HYPOTHESIS`；修正後登出成功
不會逆向證明歷史兩次錯誤一定出在 Firebase token revoke。

## 二、PR 全歷史與目前有效性判斷

完整 161 筆狀態及每筆 disposition 在[歷史附表](2026-09-22-current-project-pr-history.md)。
舊 preview、CI、文件中的完成字樣只對其日期／SHA／環境有效。

| 範圍 | 現行用途 | 禁止推論 |
| --- | --- | --- |
| #1–#26 | 基礎、原始預約與治理；舊欄位由本次業主決定取代 | 舊 synthetic preview = 現在真後端 |
| #27–#40 | CAL-PILOT 同步／修正歷史；lease、outbox 設計可重用 | 舊 pilot grant = C1 或 production grant |
| #41–#111 | 安全 CI、UI、Booking domain、資料相容性 | 綠 CI = 現場完整 |
| #112–#127 | C1 foundation、IP-001、signed WP-B；#122 已合併 | 靜態 inspect PASS = Stage F 完成 |
| #128–#146 | Stage C/D/E/F、Auth、IAM、P1-01/02/03 | source PR = 新雲端資源已存在 |
| #147 | BD 工程需求索引 | 重新從零實作 #149–154 |
| #148、#155–158 | 登出、MFA、M11、return-flow、alert recovery 修補 | 舊 PASS 可省略被新變更影響的測試 |
| #149–154 | 六個純 domain 契約及測試 | 契約 = API/UI/runtime／AWS 備份 |
| #159–161 | proxy identity、C1 candidate、two-stage 前置分離 | 已部署／P1-09 已關帳 |

## 三、目前真正阻塞點

| 類型 | 具體缺口 | 擁有者／下一包 |
| --- | --- | --- |
| SOURCE | 新欄位、回診索引相容；BD runtime/API/UI | CP-01、CP-03～07 |
| CLOUD AUTHORITY | 舊 gate 不再作開工依據；新 packet 尚未完成明確核准及期限 | CP-00/P1-09 operator |
| RUNTIME EVIDENCE | 新 inbound、穩定 client 429、完整 Stage F、Google 真 restore | CP-00、CP-02、CP-06、CP-08 |
| HUMAN ACTION | alert 對應收件、合成手冊操作與具名驗收 | CP-00、CP-09、CP-10 |
| OWNER DECISION | BD policy 值、歷史不可恢復 index 處置、final acceptance 與實際運行月的映射 | CP-POLICY；不得問已決的年份替代欄位 |
| DOCUMENTATION | Drive 已更新金額，但資料欄位、AWS 排序、runtime 與驗收語意待最後對齊 | CP-09 |

若獨立工作包不依賴缺少決策，繼續該包；不得把缺少答案補成默認 production 政策。

## 四、P1-09 完整關帳規劃

依[operator packet](2026-09-22-p1-09-operator-packet.md)的 19 gates 執行。
順序為：fresh read → 新授權 → build/push/digest → Stage 1 完整 plan/apply/readback →
secret version／synthetic ACL → Stage 2 **重新**完整 plan/apply/readback →
Hosting target → 有界 candidate／429 → 監控／rollback → evidence → docs closeout PR。

舊 `2026-09-22T11:58:18Z`（臺北 19:58:18）只作歷史設定；業主已指示不為此趕工。
**不等待到期來當作操作條件，也不沿用它開工。** 新授權須明列新期限與
booking gate 更新（若必要）的明確範圍；沒有即停止相關 mutation。
若這份 docs PR 先合併使 main 改變，P1-09 必須重新對帳並取得新 SHA 核准。

## 五、P1-09 驗收證據矩陣

使用[矩陣 P09-01～P09-14](2026-09-22-current-project-acceptance-matrix.md)。
候選資料鏈須涵蓋 linked appointment、candidate、audit、restore outbox、Calendar 同事件、
重放無重複；不只截圖待審 UI。429 須證明同一穩定身分的持久化 limiter 狀態，
不能每請求新 key。正式測試總數最多 20，包括工具／client 自動重試造成的送出次數。
每個必要 assertion 首次不符合就停止，不為得到 PASS 反覆測。

## 六、業主最新預約表單需求影響分析

決定：生日只月日；國籍恰「本國」「外國」；新預約不收身分證、護照、來源渠道／
介紹人子欄位、攜帶健保卡意向。不加 OTP、碼、秘密、問題或任何替代身分輸入。

| 資料 | 真實路徑／分類 | 新增寫入目標 |
| --- | --- | --- |
| birth year | UI + transport + domain validation + C1 hashed lookup；legacy browser state persisted | 只 `--MM-DD`；2000 僅可當閏日驗證內部載體，不可寫入／傳輸當出生年 |
| nationalId/passportNumber | UI、validated、transported；legacy local state persisted/lookup；C1 normalizes but patients 只存 name/ID/time | 新 schema 拒絕多收；歷史只由相容讀取處理 |
| sourceTags/referrerName | legacy client body、合成 domain/appointment、staff display；C1 mapper 不轉送 | 新 public/local write path 全移除，含衍生介紹人欄位 |
| hasNhiCard | UI、transport、legacy patient state；C1 不存此 raw flag | 新 intake 不收；歷史不抹除；staff 到診事實 `nhiCardMissing` 是另一條功能，不能擅刪 |
| foreign_national | legacy request tag，C1 mapper 不轉送 | 獨立二選一；不能把「希望當日手術」當第三種國籍 |
| audit/export/report | audit／Calendar 有固定 PII guard；BD export 為白名單契約，未接 runtime；月報僅 counts | 新資料不因 audit/export/fixture 再收已刪欄位；歷史匯出另遵白名單權限 |

關鍵 source：`patient-identity.ts`、`appointments.ts`、`patient-directory.ts`、
`patient-app.js`、`patient-registry.js`、`appointment-domain.js`、
`internal-test-booking-transport.js`。具體檔案與測試見 CP-01。

### 舊 hash 與碰撞

C1 `opaqueLookupIdentity` 對標準化 phone 加整個 birthDate 做 SHA-256，再取 32 hex；
`patient_lookup_index` doc 為單一 `patientId`，patient doc 未保存可重建 DOB 的原值。
不能把 hash 反推 MM-DD，不能枚舉年份猜病患。`patientIdentityKey` 在 legacy browser
以證件優先、缺年時另帶已存在姓名，與 C1 phone/date 規則也不一致。

CP-01 先用 synthetic 固定 fixtures 檢驗舊／新索引；可用合法來源建立相容 alias 時保留
原 patientId 與 appointment lineage。若只有不可反推 hash，標為不可自動相容，不刪記錄、
不創造假的身分連結。新 lookup 需支援不唯一判斷；多候選只回通用失敗且不發 return session。
現有姓名可用於原本新預約資料的一致性檢查，但不得暗中加到公開回診查詢作新驗證因素。
電話＋月日辨識力降低及共用電話風險，需在驗收風險記錄由 owner 確認；產品決定本身不重問。

## 七、預約表單施工規劃

CP-01 一個 coherent source PR 同時改 contract/domain/API/web 及測試；
CP-02 是單獨部署／合成 runtime 證據。若 split backend-first，必須先證明過渡 UI 不會
因必填證件／日期形狀不一致而失效；否則不用兩個有中間壞狀態的 PR。
歷史資料 repair 不包含在一般 source merge，自有 dry-run、preview、授權與 rollback。

## 八、#147 / Business Delivery 現況與剩餘工作

| 包 | 現況 | 下一步 |
| --- | --- | --- |
| BD-00 | policy 部分未決；金額、未使用定義及 AWS/網站排序已決 | CP-POLICY 只收缺少答案 |
| BD-01 #149 | milestone contract、unit tests | CP-03 事件持久化／人工 milestone acknowledgement |
| BD-02 #150 | safe-export contract、unit tests | CP-04 API、角色、reauth、下載／清理、UI、audit |
| BD-03 #151 | retention contract、unit tests | CP-05 狀態、復原、legal hold、永久刪除守門與部分失敗 |
| BD-04 #154 | backup assessor；Google daily/PITR 已有，真 restore 尚未證明 | CP-06 Google-only evidence，AWS 不列 blocker |
| BD-05 #152 | monthly counts、dedupe、incomplete 非 unused | CP-03 可信事件接線／月報／人審 |
| BD-06 #153 | termination checklist contract | CP-07 接匯出、收件、各層保留與刪除證據 |
| BD-07 | 文件可讀，但實際功能／截圖／驗收未齊 | CP-09、CP-10 |

所有契約均重用；不得因原計畫 TODO 而重寫。完整現有專案包含適用的 BD runtime，
不把它倒灌成舊 Phase 1 P1-09 的隱性新增條件。

## 九、完整現有專案回歸與驗收矩陣

使用獨立[驗收矩陣](2026-09-22-current-project-acceptance-matrix.md)，列出 requirement ID、
現有證據層級、欠缺的 runtime、人證、負向案例及 owner packet。
執行前綁單一 release source／digest／Hosting；source 變更使相關證據失效，docs-only
變更可用 tree diff 建立 traceability，但不能假裝 runtime 換成 docs commit。

## 十、INTERNAL_PREPRODUCTION_COMPLETE Gate

P1-09 舊 inspect AND strict Stage F matrix、F 所有適用項 PROVEN、有效範圍排除 DEFERRED、
同 head CI 及可攜交接全部齊全。真 isolated API、Firestore SoT、登入登出、CSRF/RBAC、
denied audit、排班、booking/return、outbox/Calendar、candidate、rate limit、monitoring、
人收到通知及舊 evaluator 的 backup/migration/artifact 檢查均不可跳。
只有 Terraform／CI 或預覽可開不足以 PASS。

## 十一、CURRENT_PROJECT_ACCEPTANCE Gate

技術 gate、新表單及歷史辨識安全、當前產品／BD scope、Google recovery、完整 regression、
操作與驗收文件、遠端商務文件一致、具名業主 acceptance、無未解當前重大問題，全部具證據。
AWS、新完整官網不列 blocker；既有 frozen Case/payroll/clinical/payment 不自動解凍。

**不能偷換正式運行驗收：** Drive 01/03 仍要求預約頁與工作台正式上線實際運行滿一月才
達尾款條件。CP-POLICY 要記錄 current-project acceptance 與該里程碑的映射。
若 owner 將真實運行月定為本 gate 必要條件，缺該月即保持 NOT_PASSED；
若 owner 明確分成「工程／功能驗收」與「正式運行／付款驗收」，後者仍獨立 NOT_PROVEN。
不得用 synthetic clock 推進或本文自行豁免；不能為了前者擅開 production／真資料。

## 十二、PRODUCTION_READY 與正式上線狀態

獨立維持 `INTERNAL_PREPRODUCTION_COMPLETE`、`CURRENT_PROJECT_ACCEPTANCE`、
`PRODUCTION_READY`、`PUBLIC_PRODUCTION_LAUNCHED`、`REAL_PATIENT_DATA_AUTHORIZED`。
D-001–005、production D-009/016、隱私發布、正式入口／診所持有帳號、production IAM、
維運／復原與 cutover 核准都需其本身證據。本文不關閉它們。
真實營運一月、維護費起算與付款僅能引用真實獲准環境及人工確認。

## 十三、正式文件與商務資料同步清單

**Authority = Google Drive 現行原檔。** 本機 `F:/診所專案/診所系統正式交付與商務文件`
只是舊副本；不得反向上傳覆蓋 Drive。業主要求原檔不入 repo，本文不公布私有 Drive IDs、
簽名、帳戶或完整商務正文。

2026-09-22 透過 Drive connector 讀回 00/01/02/03/05/06；metadata modifiedTime
分別為 2026-09-20 `10:49:21Z`、`10:49:41Z`、`10:49:50Z`、`10:49:57Z`、
`10:50:03Z`、`10:50:09Z`。六份相應金額均已正確：

| 項目 | 現行值／語意 |
| --- | --- |
| 建置 | NT$80,000 |
| 三期 | NT$30,000／30,000／20,000 |
| 正常月 | NT$1,800 |
| 完全未使用月 | NT$500；同臺北日曆月無任何診所員工 Workbench 登入 AND 無病患完成預約 |
| 完成預約 | 成功 booking create 的業務事件，不是 staff 設 appointment `completed` 的就診完成 |
| 資料缺失 | insufficient_evidence，不能當零 |

遠端 03、05 仍有「每日＋不同位置獨立副本」語句：AWS 後置是 owner 最新排序，
須在 CP-09 對應修訂；不能繼續拿它阻擋現有專案，亦不能虛稱第二供應商已存在。
04/07/08 及新增業主說明文件在 CP-09 一併 fresh-read，未讀版本不得標已同步。
repo 的舊欄位規格、privacy、runbook、API contract 隨實作穩定後同步。
歷史 review 保留日期事實，加新權威指向而不改寫舊證據。

## 十四、AWS 後續需求登記

已確認未開工。`CURRENT_PROJECT_ACCEPTANCE == PASS` 後另開專案；
Google/Firestore Taiwan 為主要服務，AWS S3 Asia Pacific (Taipei) `ap-east-2`
為未來獨立 DR 資料副本，非第二套常駐 clinic stack／active-active。
本輪不展開 AWS IAM、Terraform、credentials 或實作 PR。

## 十五、舊官網後續需求登記

已確認未開工，current acceptance 之後且排在 AWS 之後，最低優先。
未來盤點整個舊站實際使用且有權利的唯一素材，包含內頁、CSS background、srcset、lazy-load；
排除追蹤像素／無關外部資產／重複縮圖／未使用垃圾。預約背景可後續替換。
不永久 hotlink；受控儲存及原圖／WebP/AVIF 衍生屬未來專案，本輪不爬站。

## 十六、建議 CURRENT PROJECT PR 序列

CP-00 P1-09 runtime/evidence → CP-01 booking source → CP-02 booking runtime →
CP-POLICY 未決政策對帳 → CP-03 usage/milestones → CP-04 export → CP-05 retention →
CP-06 Google recovery → CP-07 termination → CP-08 regression → CP-09 docs → CP-10 acceptance。
CP-03 與 CP-04/06 在各自 policy、獨立檔案與授權已齊時可平行；不共享 mutable browser/
Firestore 測試狀態、不讓一包使用另一包未合併 schema。P1-09 優先不變。
每包的 24 類 PR 欄位、實際入口、負向案例與交接 prompt 見執行工作包。

## 十七、最短關鍵路徑

新 P1-09 精確授權及完整 plan → 兩階雲端操作與 bounded evidence → P1-09 closure →
新表單／回診相容 → 必要 BD 決策與 runtime → Google 真還原 → 全回歸 →
Drive 最終同步 → owner 正式驗收 → current acceptance PASS → AWS → 新官網。
缺執行授權時把具體計畫／命令／dry-run 準備至可審，不以等待取代可做的 source/docs 工作。

## 十八、下一個唯一動作

主計畫 PR 可審後，操作者依 CP-00 完成唯讀 precheck，整理一份**尚未批准**的新 P1-09
packet，明列當時 fresh main、每步 mutation、開始／截止 UTC、合成 booking gate 的新 expiry
與回退。業主明確批准才進行 cloud mutation。不得引用附件中的建議 APPROVE 範例當實際簽准。

```text
CURRENT_MAIN = e387f2522ea010848f41a4f34778ffc50d83fef3
OPEN_PRS_AT_BASELINE = 0
LATEST_CI = PASS:35622277537
DEPLOYED_API = 00012-9t4
DEPLOYED_WORKER = internal-test-outbox-00011-rth
HOSTING_API_TARGET = fh-e267c1e87e26447c
P1_09 = NOT_CLOSED
PHASE_1 = NOT_CLOSED
BOOKING_OWNER_CHANGES = NOT_IMPLEMENTED
BUSINESS_DELIVERY = CONTRACTS_MERGED_RUNTIME_INCOMPLETE
INTERNAL_PREPRODUCTION_COMPLETE = NOT_PASSED
CURRENT_PROJECT_ACCEPTANCE = NOT_PASSED
PRODUCTION_READY = NOT_PROVEN
PUBLIC_PRODUCTION_LAUNCHED = false
REAL_PATIENT_DATA_AUTHORIZED = false
AWS_SECONDARY_BACKUP = DEFERRED_UNTIL_CURRENT_PROJECT_ACCEPTANCE
PUBLIC_WEBSITE = DEFERRED_UNTIL_CURRENT_PROJECT_ACCEPTANCE_LOWEST_PRIORITY
THIS_DOCUMENT_CLOUD_AUTHORITY = NONE
NEXT_ACTION = CP-00_READ_ONLY_PRECHECK_AND_FRESH_AUTHORITY_PACKET
```
