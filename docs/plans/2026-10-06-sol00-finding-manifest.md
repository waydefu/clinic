# 2026-10-06 SOL-00 逐 ID 安全摘要與 current-main manifest

**2026-10-07 狀態：BLOCKED / PARTIAL；不是修復完成或施工授權。** Current-main baseline：`01d36c96ae6be6cea91c891c494a6601b2abd4a3`。原研究成果與歷史 baseline 保留於 machine manifest 的 `baselineRefresh`。

完整逐列欄位、source blobs、回歸規格與 packet graph 見 [machine manifest](2026-10-06-sol00-safe-manifest.json)；範圍與限制見 [follow-up plan](2026-10-06-sol00-safe-manifest-closeout-plan.md)。原始 244 IDs 與 NEW review IDs 分表；每個 ID 只有一個 primary route。

本表的 `CONFIRMED` 要與 JSON 的 `assessmentScope` 一起讀：source 文字事實／既有合成邊界證據，不是 deployed defect、已修復或 production 驗收。`NO_WORK_REQUIRED` 只處理已反證／現階段不適用的精確 claim，殘餘問題不跟著結案。

## 原始 244 IDs

| ID | 原 severity | current-main status | 去識別摘要 | primary model／packet | 判斷範圍 |
| --- | --- | --- | --- | --- | --- |
| B-10 | Medium | HIGH_CONFIDENCE_CANDIDATE | 排程啟用狀態與可接受的初始占位目標未形成一致的安全組態契約。 | SOL_ONLY / SOL-IAC-LIFECYCLE | INFERENTIAL_OR_BLOCKED |
| B-11 | Medium | HIGH_CONFIDENCE_CANDIDATE | 授權開關同時決定受管理資源是否存在，未明確區分禁止新操作與保留既有資源。 | SOL_ONLY / SOL-IAC-LIFECYCLE | INFERENTIAL_OR_BLOCKED |
| B-14 | Medium | HIGH_CONFIDENCE_CANDIDATE | 靜態安全掃描的框架涵蓋與整檔例外尚未對齊實際應用安全邊界。 | SOL_ONLY / SOL-SAST | INFERENTIAL_OR_BLOCKED |
| B-19 | Medium | CONFIRMED | 部分供應鏈 override 只有下界，沒有版本相容性上界。 | SOL_ONLY / SOL-SUPPLY | SOURCE_TEXT_FACT_ONLY |
| B-23 | Low | CONFIRMED | robots 註解把檢索限制描述成額外保護，與依賴檢索取得 noindex 的敘述不一致。 | LUNA_READY / LUNA-ROBOTS-COMMENTS | SOURCE_TEXT_FACT_ONLY |
| B-26 | Low | CONFIRMED | 容器宣告未固定基底 digest，也未在映像 metadata 宣告來源版本。 | SOL_ONLY / SOL-CONTAINERS | SOURCE_TEXT_FACT_ONLY |
| B-27 | Low | CONFIRMED | 主要驗證 workflow 的 checkout 尚未明確關閉憑證持續保存。 | SOL_ONLY / SOL-CI-SECURITY | SOURCE_TEXT_FACT_ONLY |
| B-29 | Low | HIGH_CONFIDENCE_CANDIDATE | 行級秘密掃描例外仍有未錨定的子字串模式，可能超出具名合成值的預期範圍。 | SOL_ONLY / SOL-SECRETS | INFERENTIAL_OR_BLOCKED |
| B-30 | Low | CONFIRMED | Firestore 安全掃描只涵蓋特定字面無條件授權形狀，不能作為完整授權規則保障。 | SOL_ONLY / SOL-SAST | SOURCE_TEXT_FACT_ONLY |
| B-32 | Low | HIGH_CONFIDENCE_CANDIDATE | 依賴新增設定與現有 manifest 的版本範圍未明示是否採不同策略。 | SOL_ONLY / SOL-SUPPLY | INFERENTIAL_OR_BLOCKED |
| B-15 | Medium | HIGH_CONFIDENCE_CANDIDATE | 契約中的多個回應 shape 與 transition 命令尚未證明由 API 邊界一致執行。 | SOL_ONLY / SOL-CONTRACTS | INFERENTIAL_OR_BLOCKED |
| B-17 | Medium | CONFIRMED | 共享 audit wire contract 未涵蓋完整 audit action 集合。 | SOL_ONLY / SOL-CONTRACTS | SOURCE_TEXT_FACT_ONLY |
| B-18 | Medium | NEEDS_RUNTIME_PROOF | branch protection、公開狀態及 gcloud guard 的 current-facing 說明有互相衝突風險。 | SOL_ONLY / SOL-GOVERNANCE | INFERENTIAL_OR_BLOCKED |
| B-20 | Medium | HIGH_CONFIDENCE_CANDIDATE | 部分依賴工具鏈版本需支援政策評估，但 Terraform constraints/locks 並非普遍落後。 | SOL_ONLY / SOL-SUPPLY | INFERENTIAL_OR_BLOCKED |
| B-16 | Low | HIGH_CONFIDENCE_CANDIDATE | MonthDay wire schema 驗形狀，calendar validity 交由 domain caller。 | SOL_ONLY / SOL-CONTRACTS | INFERENTIAL_OR_BLOCKED |
| B-22 | Low | HIGH_CONFIDENCE_CANDIDATE | CSP 路徑規則由共用 catalog 產生；重複與 frame-src 是否死設定須依現況重判。 | SOL_ONLY / SOL-HTML | INFERENTIAL_OR_BLOCKED |
| B-24 | Low | METADATA_BLOCKED | retired 變數／子字串 image 檢查／過期 preview authDomain（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| B-25 | Low | NEEDS_RUNTIME_PROOF | 日誌 bucket 是否需 sink 或 retention destination，須依核准觀測用途與保留責任決定。 | OWNER_BLOCKED / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| B-28 | Low | CONFIRMED | SAST workflow 說明仍以 private repo 解釋 code-scanning upload 不可用。 | SOL_ONLY / SOL-SAST | SOURCE_TEXT_FACT_ONLY |
| B-33 | Low | NEEDS_RUNTIME_PROOF | UTC timestamp predicate 接受 24:00 需按 ISO timestamp policy 收斂。 | SOL_ONLY / SOL-CONTRACTS | INFERENTIAL_OR_BLOCKED |
| B-34 | Low | HIGH_CONFIDENCE_CANDIDATE | MonthDay、姓名及電話 wire schemas 的形狀限制比 domain identity 規則寬。 | SOL_ONLY / SOL-IDENTITY | INFERENTIAL_OR_BLOCKED |
| B-35 | Low | HIGH_CONFIDENCE_CANDIDATE | Schedule wire schema 未限集合數量或區間端點順序，domain 另檢 schedule validity。 | OWNER_BLOCKED / SOL-SCHEDULE | INFERENTIAL_OR_BLOCKED |
| B-36 | Low | CONFIRMED | LocalTime regex 重複定義可能逐漸分歧；月份與 MonthDay 則各有獨立語義。 | SOL_ONLY / SOL-CONTRACTS | SOURCE_TEXT_FACT_ONLY |
| B-37 | Low | CONFIRMED | audit contract 使用 ZodIssueCode.custom symbolic alias。 | SOL_ONLY / SOL-CONTRACTS | SOURCE_TEXT_FACT_ONLY |
| B-38 | Low | HIGH_CONFIDENCE_CANDIDATE | Business export 日期區間 schema 各自驗日期，API/domain 另負責順序與長度。 | SOL_ONLY / SOL-EXPORT | INFERENTIAL_OR_BLOCKED |
| B-39 | Low | FALSE_POSITIVE | config workspace package 無應用依賴，但 emulator tests 直接匯入其 local target helper。 | NO_WORK_REQUIRED / NO-WORK | INFERENTIAL_OR_BLOCKED |
| B-42 | Low | CONFIRMED | Terraform provider lock 使用不同 patch version，但均受相同 7.x constraint 接受。 | SOL_ONLY / SOL-SUPPLY | SOURCE_TEXT_FACT_ONLY |
| B-43 | Low | FALSE_POSITIVE | notification-path JSON 與 Terraform 描述不同證據階段，明確維持未部署而非互相矛盾。 | NO_WORK_REQUIRED / NO-WORK | INFERENTIAL_OR_BLOCKED |
| B-44 | Low | NEEDS_RUNTIME_PROOF | index matrix checker 驗證已列 query 的索引，不能單獨證明 query inventory 完整。 | SOL_ONLY / SOL-QUERY-INDEX | INFERENTIAL_OR_BLOCKED |
| B-45 | Low | NEEDS_RUNTIME_PROOF | C1 config contract 必須與 runtime env/secret consumers 做雙向覆蓋檢查。 | SOL_ONLY / SOL-CONFIG | INFERENTIAL_OR_BLOCKED |
| B-46 | Low | HIGH_CONFIDENCE_CANDIDATE | C6 README 所稱 controller unrouted 須區分 source module mount 與 C6 resource scope。 | SOL_ONLY / SOL-DOCS | INFERENTIAL_OR_BLOCKED |
| B-49 | Low | CONFIRMED | C2 Terraform 只宣告 Identity API enablement，Identity Platform 設定由 gated configurator 分工。 | OWNER_BLOCKED / SOL-IAM | SOURCE_TEXT_FACT_ONLY |
| B-50 | Low | NEEDS_RUNTIME_PROOF | CAL-PILOT budget expiry/labels 須按已核准期限確認，不可自行延長。 | SOL_ONLY / SOL-IAC-LIFECYCLE | INFERENTIAL_OR_BLOCKED |
| B-51 | Low | NEEDS_RUNTIME_PROOF | 告警 signal/window/threshold 有刻意異質設定，需驗 source mapping 並防止 missing-data 假綠。 | OWNER_BLOCKED / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| A03 | Low | HIGH_CONFIDENCE_CANDIDATE | 待永久刪除清單一次讀取全部到期封存紀錄，沒有容量與分頁界限。 | SOL_ONLY / SOL-RETENTION | INFERENTIAL_OR_BLOCKED |
| A04 | Low | HIGH_CONFIDENCE_CANDIDATE | 讀公開可預約網格沿用建立預約權限，完整班表與 slot view 的授權目的未分離。 | OWNER_BLOCKED / SOL-RBAC | INFERENTIAL_OR_BLOCKED |
| A06 | Low | NEEDS_RUNTIME_PROOF | 原報所稱刪除路由固定拒絕的行為在現行接線來源已不同，仍需實際回歸證據。 | SOL_ONLY / SOL-LIFECYCLE | INFERENTIAL_OR_BLOCKED |
| A07 | Low | FALSE_POSITIVE | 未認證的瀏覽器登入配置包含公開 Web API key，不能等同伺服器憑證洩漏。 | NO_WORK_REQUIRED / NO-WORK | INFERENTIAL_OR_BLOCKED |
| A08 | Low | HIGH_CONFIDENCE_CANDIDATE | 休診重疊查詢沒有請求上界，可能讀取超出目標窗口的未來資料。 | SOL_ONLY / SOL-SCHEDULE | INFERENTIAL_OR_BLOCKED |
| A10 | Low | NOT_APPLICABLE | 停用帳號沿用認證失敗對外回應，原報要求新增專用代碼尚無政策授權。 | NO_WORK_REQUIRED / NO-WORK | INFERENTIAL_OR_BLOCKED |
| C03 | Low | HIGH_CONFIDENCE_CANDIDATE | 本機 prototype 的合成登入提示需確認不會出現在伺服器認證模式。 | SOL_ONLY / SOL-SESSION-UI | INFERENTIAL_OR_BLOCKED |
| C06 | Low | CONFIRMED | robots.txt 說明段落對工作臺路徑是否由 robots directive 管理的定位不一致。 | LUNA_READY / LUNA-ROBOTS-COMMENTS | SOURCE_TEXT_FACT_ONLY |
| C09 | Low | HIGH_CONFIDENCE_CANDIDATE | CAL-PILOT session bootstrap 狀態與 internal-test bearer token 使用不同瀏覽器儲存路徑。 | SOL_ONLY / SOL-SESSION-UI | INFERENTIAL_OR_BLOCKED |
| D-09 | Medium | HIGH_CONFIDENCE_CANDIDATE | 到診後未到與改期回復成立缺少核定的例外語意對照。 | OWNER_BLOCKED / SOL-LIFECYCLE | INFERENTIAL_OR_BLOCKED |
| D-10 | Medium | HIGH_CONFIDENCE_CANDIDATE | 電話驗證與舊證件短值遮罩未完整保障有效識別和最小揭露。 | OWNER_BLOCKED / SOL-IDENTITY | INFERENTIAL_OR_BLOCKED |
| D-11 | Medium | HIGH_CONFIDENCE_CANDIDATE | Calendar 單頁同步缺少本機交易容量界限並保留逐事件讀取。 | SOL_ONLY / SOL-CALENDAR-ENVELOPE | INFERENTIAL_OR_BLOCKED |
| D-14 | Low | HIGH_CONFIDENCE_CANDIDATE | Worker README 對 Calendar PII 的無範圍禁令未反映後續專用日曆標題核准。 | SOL_ONLY / SOL-PRIVACY | INFERENTIAL_OR_BLOCKED |
| D-15 | Medium | HIGH_CONFIDENCE_CANDIDATE | 空批次告警使用全部 pending 而非已到期工作，可能把合法退避視為停滯。 | SOL_ONLY / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| D-16 | Low | HIGH_CONFIDENCE_CANDIDATE | Calendar 候選比對只需 enabled patient IDs，query 卻讀取完整患者文件。 | SOL_ONLY / SOL-PRIVACY | INFERENTIAL_OR_BLOCKED |
| D-17 | Low | HIGH_CONFIDENCE_CANDIDATE | Calendar parse failure 計數與交易外 appointment snapshot 時序涉及兩項不同的觀測/一致性議題。 | SOL_ONLY / SOL-CALENDAR-ENVELOPE | INFERENTIAL_OR_BLOCKED |
| D-21 | Low | HIGH_CONFIDENCE_CANDIDATE | appointment.ts 純函式在 workspace 產品路徑未見 caller，但仍由 domain public barrel 匯出。 | SOL_ONLY / SOL-CONTRACTS | INFERENTIAL_OR_BLOCKED |
| D-22 | Medium | HIGH_CONFIDENCE_CANDIDATE | 角色投影 helper 對未知新增欄位沒有預設拒絕機制。 | OWNER_BLOCKED / SOL-RBAC | INFERENTIAL_OR_BLOCKED |
| D-23 | Low | HIGH_CONFIDENCE_CANDIDATE | 未接線的 payroll close planner 未拒絕 periodEnd 前的結算計畫。 | SOL_ONLY / SOL-LIFECYCLE | INFERENTIAL_OR_BLOCKED |
| D-24 | Medium | HIGH_CONFIDENCE_CANDIDATE | 里程碑展示層未將試用期調整納入共同計算。 | SOL_ONLY / SOL-BUSINESS | INFERENTIAL_OR_BLOCKED |
| D-27 | Low | HIGH_CONFIDENCE_CANDIDATE | Calendar pilot health 對每個 outbox 狀態 query 取完整 snapshots 再計 size。 | SOL_ONLY / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| D-28 | Low | HIGH_CONFIDENCE_CANDIDATE | watch channel renewal 將舊 channel ID 加固定後綴，長度沒有本地界限驗證。 | SOL_ONLY / SOL-CALENDAR-WATCH | INFERENTIAL_OR_BLOCKED |
| D-29 | Low | HIGH_CONFIDENCE_CANDIDATE | renewal helper 每次新建 seen notification/event sets，overlap 期間可能重置既有去重狀態。 | SOL_ONLY / SOL-CALENDAR-WATCH | INFERENTIAL_OR_BLOCKED |
| D-30 | Low | HIGH_CONFIDENCE_CANDIDATE | 合成候選標籤由有限字母與兩位數組合，多筆資料可能碰撞。 | SOL_ONLY / SOL-PRIVACY | INFERENTIAL_OR_BLOCKED |
| D-31 | Low | HIGH_CONFIDENCE_CANDIDATE | CAL-PILOT synthetic writer 把預約結束時間寫死為半小時，且以 409 視為冪等成功。 | OWNER_BLOCKED / SOL-CALENDAR-RESTORE | INFERENTIAL_OR_BLOCKED |
| D-32 | Low | HIGH_CONFIDENCE_CANDIDATE | CAL-PILOT 合成 fixture 固定時段及合成顯示欄位，配置需求與測試用途邊界未明。 | SOL_ONLY / SOL-CALENDAR-RESTORE | INFERENTIAL_OR_BLOCKED |
| D-33 | Low | HIGH_CONFIDENCE_CANDIDATE | Calendar candidate reject 的版本守衛、SoT 恢復與審計動作需由同一決策矩陣明確驗證。 | SOL_ONLY / SOL-CALENDAR-CANDIDATE | INFERENTIAL_OR_BLOCKED |
| D-34 | Low | CONFIRMED | routeFamilyFromPath 先用包含式 /calendar 分類，使 /calendar-session 也歸入 calendar family。 | SOL_ONLY / SOL-OBSERVABILITY | SOURCE_TEXT_FACT_ONLY |
| D-35 | Low | HIGH_CONFIDENCE_CANDIDATE | formal_launch acknowledgement 只拒絕未來日期，未與試用期結束日比較。 | OWNER_BLOCKED / SOL-BUSINESS | INFERENTIAL_OR_BLOCKED |
| D-36 | Low | HIGH_CONFIDENCE_CANDIDATE | returnCompletedAt 有不得早於 notice 的檢查，但未拒絕晚於伺服器 now 的時間。 | OWNER_BLOCKED / SOL-RETENTION | INFERENTIAL_OR_BLOCKED |
| D-37 | Low | HIGH_CONFIDENCE_CANDIDATE | 原列把匯出電話呈現、CSV escaping、backup failure 重複告警與 denylist 等不同邊界合併，需按子題逐項確認。 | SOL_ONLY / SOL-EXPORT | INFERENTIAL_OR_BLOCKED |
| D-39 | Low | HIGH_CONFIDENCE_CANDIDATE | decision register 與多份產品文件保留較早的 session/Calendar 敘述，需辨識為歷史或與現行決策矛盾。 | SOL_ONLY / SOL-DOCS | INFERENTIAL_OR_BLOCKED |
| D-40 | Low | CONFIRMED | BOOKING execution log 最新記錄停於 2026-08-23，後續動態狀態不能由此文件確認。 | SOL_ONLY / SOL-INTEGRATION | SOURCE_TEXT_FACT_ONLY |
| D-41 | Medium | HIGH_CONFIDENCE_CANDIDATE | Calendar 非建檔測試以共享患者全集為空作斷言，隔離契約不足。 | SOL_ONLY / SOL-CALENDAR-TESTS | INFERENTIAL_OR_BLOCKED |
| D-43 | Low | HIGH_CONFIDENCE_CANDIDATE | 多處 UTC timestamp validation 仍使用 endsWith(Z) 與寬鬆 Date.parse，而 domain 已有嚴格共同 parser。 | SOL_ONLY / SOL-CONTRACTS | INFERENTIAL_OR_BLOCKED |
| K3 | Low | HIGH_CONFIDENCE_CANDIDATE | 停用帳號驗證失敗與一般驗證失敗共用對外分類，細分分支可能無法由正常 SDK 路徑到達。 | OWNER_BLOCKED / SOL-SESSION | INFERENTIAL_OR_BLOCKED |
| K8 | Low | HIGH_CONFIDENCE_CANDIDATE | 患者回診既有預約的結束時間重複寫死時長而未引用唯一時段規則。 | SOL_ONLY / SOL-SCHEDULE | INFERENTIAL_OR_BLOCKED |
| K9 | Low | HIGH_CONFIDENCE_CANDIDATE | 隔離測試 gate 以任意非空 emulator 設定替代環境約束，配置邊界仍需明確化。 | OWNER_BLOCKED / SOL-INGRESS | INFERENTIAL_OR_BLOCKED |
| X-C03 | Low | HIGH_CONFIDENCE_CANDIDATE | trusted-html sanitizer 對 HTML navigation 語法的處理範圍需與 CSP 行為一併核對。 | OWNER_BLOCKED / SOL-HTML | INFERENTIAL_OR_BLOCKED |
| E1-03 | Medium | HIGH_CONFIDENCE_CANDIDATE | 候選提交不存在時的補取分支可能被原生命令錯誤政策提前中止。 | SOL_ONLY / SOL-RELEASE | INFERENTIAL_OR_BLOCKED |
| E1-04 | Medium | HIGH_CONFIDENCE_CANDIDATE | 部署前登入網域檢查使用供應商後綴而非該次授權的精確主機集合。 | OWNER_BLOCKED / SOL-INGRESS | INFERENTIAL_OR_BLOCKED |
| E1-05 | Medium | HIGH_CONFIDENCE_CANDIDATE | 舊發布入口仍將可能混合訊息的部署輸出直接當作 JSON 解析。 | SOL_ONLY / SOL-RELEASE | INFERENTIAL_OR_BLOCKED |
| E1-06 | Medium | HIGH_CONFIDENCE_CANDIDATE | 環境變數的秘密參照使用可漂移標籤，削弱同候選版本的重現性。 | OWNER_BLOCKED / SOL-IAM | INFERENTIAL_OR_BLOCKED |
| E1-08 | Medium | HIGH_CONFIDENCE_CANDIDATE | 供應鏈忽略清單的有限文字解析未明確拒絕不支援的設定格式。 | SOL_ONLY / SOL-SUPPLY | INFERENTIAL_OR_BLOCKED |
| E1-09 | Medium | HIGH_CONFIDENCE_CANDIDATE | 架構掃描將目錄讀取失敗折疊為沒有待掃描檔案。 | SOL_ONLY / SOL-ARCH-GATE | INFERENTIAL_OR_BLOCKED |
| E1-10 | Medium | HIGH_CONFIDENCE_CANDIDATE | CSS 雜湊產出沒有同步處理 CSS 內的依賴參照。 | SOL_ONLY / SOL-BUILD | INFERENTIAL_OR_BLOCKED |
| E1-07 | Low | HIGH_CONFIDENCE_CANDIDATE | 期限的多份常數與未用變數增加維護成本，但核准期限本身不是錯誤。 | SOL_ONLY / SOL-RELEASE | INFERENTIAL_OR_BLOCKED |
| E1-13 | Low | HIGH_CONFIDENCE_CANDIDATE | 續期腳本區域變數名稱與 PowerShell 自動變數相同，易混淆比對狀態。 | SOL_ONLY / SOL-RELEASE | INFERENTIAL_OR_BLOCKED |
| E1-14 | Low | HIGH_CONFIDENCE_CANDIDATE | 登入網域來源檢查以子字串存在推斷驗證邏輯，未證明語意。 | SOL_ONLY / SOL-INGRESS | INFERENTIAL_OR_BLOCKED |
| E1-15 | Low | HIGH_CONFIDENCE_CANDIDATE | 日誌遮蔽依賴名稱正則而非契約秘密分類，存在漏接。 | SOL_ONLY / SOL-CONFIG | INFERENTIAL_OR_BLOCKED |
| E1-16 | Low | HIGH_CONFIDENCE_CANDIDATE | 路由真值模組匯出控制器集合，分類卻另外列舉名稱。 | SOL_ONLY / SOL-ROUTE-INVENTORY | INFERENTIAL_OR_BLOCKED |
| E1-17 | Low | HIGH_CONFIDENCE_CANDIDATE | C6 證據組裝只表達部分路由條件，與完整路由 blocker 範圍不同。 | SOL_ONLY / SOL-ROUTE-INVENTORY | INFERENTIAL_OR_BLOCKED |
| E1-18 | Low | HIGH_CONFIDENCE_CANDIDATE | 預算證據以清單第一筆代替授權目標身份選取。 | OWNER_BLOCKED / SOL-RUNTIME-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E1-19 | Low | METADATA_BLOCKED | 負向斷言太弱（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E1-20 | Low | HIGH_CONFIDENCE_CANDIDATE | 架構註解剝除器將 JavaScript regex literal 的註解符號當成註解起點。 | SOL_ONLY / SOL-ARCH-GATE | INFERENTIAL_OR_BLOCKED |
| E1-21 | Low | HIGH_CONFIDENCE_CANDIDATE | 分支保護檢查的網路請求未設定明確逾時與可控失敗分類。 | SOL_ONLY / SOL-GOVERNANCE | INFERENTIAL_OR_BLOCKED |
| E1-22 | Low | HIGH_CONFIDENCE_CANDIDATE | 設計 token gate 的解析與 ratchet 計數存在原報所指的規則/分支一致性疑點。 | SOL_ONLY / SOL-DESIGN-GATE | INFERENTIAL_OR_BLOCKED |
| E1-23 | Low | HIGH_CONFIDENCE_CANDIDATE | 文件連結檢查以執行時工作目錄尋找 repository 檔案，且 UTF-8 讀取錯誤未作逐檔處置。 | SOL_ONLY / SOL-DOC-GATE | INFERENTIAL_OR_BLOCKED |
| E1-24 | Low | HIGH_CONFIDENCE_CANDIDATE | Identity configurator 的 fetch request 未明確配置有限逾時。 | SOL_ONLY / SOL-IAM | INFERENTIAL_OR_BLOCKED |
| E1-25 | Low | HIGH_CONFIDENCE_CANDIDATE | 治理 waiver 欄位與有效性檢查未完整覆蓋登錄契約所需條件。 | SOL_ONLY / SOL-GOVERNANCE | INFERENTIAL_OR_BLOCKED |
| E1-26 | Low | HIGH_CONFIDENCE_CANDIDATE | 合成 C1 smoke evaluator 將預算金額固定於程式字面值，未完全追隨其建議來源。 | SOL_ONLY / SOL-RUNTIME-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E1-27 | Low | METADATA_BLOCKED | perf budget 註解／誤標錯誤（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E1-28 | Low | HIGH_CONFIDENCE_CANDIDATE | 可測試的 build planning 函式與模組載入時 I/O/決策狀態耦合。 | SOL_ONLY / SOL-BUILD | INFERENTIAL_OR_BLOCKED |
| E1-29 | Low | METADATA_BLOCKED | public-pages 重複檢查（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E1-30 | Low | HIGH_CONFIDENCE_CANDIDATE | 結構 gate 清單未明確列入全部 Dockerfile，且 import 會執行大量 I/O。 | SOL_ONLY / SOL-STRUCTURE-GATE | INFERENTIAL_OR_BLOCKED |
| E1-31 | Low | HIGH_CONFIDENCE_CANDIDATE | 追蹤檔掃描以 git ls-files 依目前工作目錄取得清單，可能因子目錄啟動造成掃描範圍改變。 | SOL_ONLY / SOL-SECRETS | INFERENTIAL_OR_BLOCKED |
| E1-32 | Low | HIGH_CONFIDENCE_CANDIDATE | 品牌與診所素材產生器依賴瀏覽器影像編碼，缺少穩定編碼基準及失敗時關閉瀏覽器保證。 | SOL_ONLY / SOL-ASSET-BUILD | INFERENTIAL_OR_BLOCKED |
| E1-33 | Low | METADATA_BLOCKED | check-web-ui 註解過時（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E1-34 | Low | METADATA_BLOCKED | 跨腳本重複實作（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E1-35 | Low | METADATA_BLOCKED | grep 當政策測試脆弱（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E2-01 | Low | HIGH_CONFIDENCE_CANDIDATE | 多個外部 fetch 未設應用層期限，可能令 CLI 等待遠端回應超出所需時間。 | SOL_ONLY / SOL-IAM | INFERENTIAL_OR_BLOCKED |
| E2-02 | Low | HIGH_CONFIDENCE_CANDIDATE | 證據輸出目錄可由環境變數指定，寫入前未限制在預期工作區。 | SOL_ONLY / SOL-RUNTIME-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E2-03 | Low | HIGH_CONFIDENCE_CANDIDATE | 子程序啟動錯誤採未捕捉 throw，而正常 close 才設定明確退出碼。 | LUNA_READY / LUNA-FIRESTORE-RUNNER | INFERENTIAL_OR_BLOCKED |
| E2-04 | Low | HIGH_CONFIDENCE_CANDIDATE | CLI 探測以 POSIX PATH 分隔符和檔名存在檢查，Windows PATH/PATHEXT 可能未被正確辨識。 | SOL_ONLY / SOL-CLI | INFERENTIAL_OR_BLOCKED |
| E2-05 | Low | HIGH_CONFIDENCE_CANDIDATE | 部分 CLI 模組以字面 file URL 比較推斷直接執行，對 Windows 路徑形式較脆弱。 | SOL_ONLY / SOL-CLI | INFERENTIAL_OR_BLOCKED |
| E2-06 | Low | HIGH_CONFIDENCE_CANDIDATE | Playwright 證據合併依賴輸入路徑語意，原報指出未先正規化。 | SOL_ONLY / SOL-RUNTIME-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E2-07 | Low | HIGH_CONFIDENCE_CANDIDATE | 舊 snapshot runner 將命令字串拆分後交 shell，參數含空白或 quoting 時容易改變執行語意。 | SOL_ONLY / SOL-CLI | INFERENTIAL_OR_BLOCKED |
| E2-08 | Low | NEEDS_RUNTIME_PROOF | 合成資料遷移工具的核准期限為原始固定常數，後續執行資格需與現行 authority 核對。 | OWNER_BLOCKED / SOL-IAC-LIFECYCLE | INFERENTIAL_OR_BLOCKED |
| E2-09 | Low | HIGH_CONFIDENCE_CANDIDATE | 多個檢查/工具內固定隔離環境識別值，容易與不同範圍的 project identity 混用。 | SOL_ONLY / SOL-CONFIG | INFERENTIAL_OR_BLOCKED |
| E2-10 | Low | HIGH_CONFIDENCE_CANDIDATE | Stage E 證據 --out 直接接受任意輸出路徑，未經 repository/workspace containment policy 驗證。 | SOL_ONLY / SOL-RUNTIME-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E2-11 | Low | METADATA_BLOCKED | inspect／plan 樣板重複（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E2-12 | Low | HIGH_CONFIDENCE_CANDIDATE | SBOM licence review 對缺少根專案描述或 metadata 的輸入需明確 fail closed。 | SOL_ONLY / SOL-SUPPLY | INFERENTIAL_OR_BLOCKED |
| E3-05 | Medium | CONFIRMED | 現行用途資料清冊仍使用舊集合與欄位前提描述已演進的隔離測試資料邊界。 | OWNER_BLOCKED / SOL-PRIVACY | SOURCE_TEXT_FACT_ONLY |
| E3-08 | Medium | CONFIRMED | 未標停用的匯入手冊仍把受禁的真實資料讀取與長期金鑰準備描述成操作流程。 | SOL_ONLY / SOL-IAM | SOURCE_TEXT_FACT_ONLY |
| E3-09 | Medium | CONFIRMED | 日曆指引未區分本機相容憑證模式與現行雲端無金鑰身分模式。 | SOL_ONLY / SOL-IAM | SOURCE_TEXT_FACT_ONLY |
| E3-10 | Medium | CONFIRMED | API 現行人類路由表未涵蓋已註冊的完整受控介面。 | SOL_ONLY / SOL-ROUTE-INVENTORY | SOURCE_TEXT_FACT_ONLY |
| E3-11 | Medium | CONFIRMED | 品質文件現況文字與例外治理及來源證明規則衝突。 | SOL_ONLY / SOL-GOVERNANCE | SOURCE_TEXT_FACT_ONLY |
| E3-12 | Medium | CONFIRMED | 自稱現行的 gate 敘事仍使用被新 Canon 分層取代的未實作與未授權概括。 | SOL_ONLY / SOL-INTEGRATION | SOURCE_TEXT_FACT_ONLY |
| E3-13 | Medium | CONFIRMED | 架構計畫仍把早期無後端前提描述為現況而未限定歷史範圍。 | SOL_ONLY / SOL-DOCS | SOURCE_TEXT_FACT_ONLY |
| E3-14 | Medium | CONFIRMED | UI 規則、導覽文件與機械閘門指向不同現行視覺基線。 | OWNER_BLOCKED / SOL-DESIGN-GATE | SOURCE_TEXT_FACT_ONLY |
| E3-15 | Medium | CONFIRMED | 取消文件保留待櫃台確認狀態而受控命令直接完成取消。 | SOL_ONLY / SOL-LIFECYCLE | SOURCE_TEXT_FACT_ONLY |
| E3-16 | Medium | FALSE_POSITIVE | ADR 的延續與局部修訂不能誤標為整份架構邊界已廢止。 | NO_WORK_REQUIRED / NO-WORK | INFERENTIAL_OR_BLOCKED |
| E3-17 | Medium | CONFIRMED | RBAC 文件把已用於受控組裝的 evaluator 仍描述為完全未 routed。 | SOL_ONLY / SOL-RBAC | SOURCE_TEXT_FACT_ONLY |
| E4-02 | Medium | CONFIRMED | 明列現行 gate 的 dashboard 仍停留早期盤點。 | SOL_ONLY / SOL-INTEGRATION | SOURCE_TEXT_FACT_ONLY |
| E4-09 | Medium | CONFIRMED | 角色別名仍依尚未獲明文解答的職務等同假設映射。 | OWNER_BLOCKED / SOL-RBAC | SOURCE_TEXT_FACT_ONLY |
| E3-20 | Low | CONFIRMED | 資安草稿未決 C0 與未有實作敘事未對帳後續權威。 | SOL_ONLY / SOL-GOVERNANCE | SOURCE_TEXT_FACT_ONLY |
| E3-24 | Low | CONFIRMED | 驗收工作表仍以舊標頭限制描述已由 owner 放寬的重新驗證邊界。 | SOL_ONLY / SOL-SESSION-DOCS | SOURCE_TEXT_FACT_ONLY |
| E3-25 | Low | CONFIRMED | 商務計畫對資訊收錄與匯出格式有未分層矛盾文字。 | SOL_ONLY / SOL-BUSINESS | SOURCE_TEXT_FACT_ONLY |
| E3-31 | Low | CONFIRMED | 整合計畫現況數值與權限文字未標早期快照邊界。 | SOL_ONLY / SOL-DOCS | SOURCE_TEXT_FACT_ONLY |
| E3-32 | Low | CONFIRMED | E2E 人類表格未列完整機械分組。 | LUNA_READY / LUNA-E2E-INVENTORY | INFERENTIAL_OR_BLOCKED |
| E3-34 | Low | FALSE_POSITIVE | 備份 runbook 已涵蓋原行聲稱缺少的機制且未當成實測。 | NO_WORK_REQUIRED / NO-WORK | INFERENTIAL_OR_BLOCKED |
| E4-23 | Low | FALSE_POSITIVE | 視覺 manifest 包含提交標記是核准非自我引用綁定而非待補佔位。 | NO_WORK_REQUIRED / NO-WORK | INFERENTIAL_OR_BLOCKED |
| E3-18 | Medium | METADATA_BLOCKED | 「未合併」殘句與矩陣矛盾（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-04 | Medium | HIGH_CONFIDENCE_CANDIDATE | F-07 判 RUNTIME_PROVEN 但本機 store／吞錯仍在 | SOL_ONLY / SOL-INTEGRATION | INFERENTIAL_OR_BLOCKED |
| E4-05 | Medium | METADATA_BLOCKED | 完整性輸出與舊 FAIL 位元組相同；產物遺失（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-06 | Medium | METADATA_BLOCKED | 都自稱現行，與 cp01 不一致（不是 E4-26）（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-07 | Medium | CONFIRMED | 仍查 `/`，實際 302→`/clinic` | SOL_ONLY / SOL-RUNTIME-EVIDENCE | SOURCE_TEXT_FACT_ONLY |
| E4-11 | Medium | METADATA_BLOCKED | 真實日曆內容外洩到代理輸出之紀錄（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-21 | Low | METADATA_BLOCKED | C1～C6 本機執行包重跑會失敗（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-22 | Low | METADATA_BLOCKED | 引用不存在路徑／章節（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-23 | Low | METADATA_BLOCKED | 格式缺陷與排序錯亂（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-26 | Low | METADATA_BLOCKED | 文件仍依私有 repo 前提；本機路徑外露（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-27 | Low | METADATA_BLOCKED | 文件膨脹／overlay／模型名不一致（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-28 | Low | METADATA_BLOCKED | 期限已過未標／即將到期（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-29 | Low | METADATA_BLOCKED | Firebase 登入清單指令衝突（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-30 | Low | METADATA_BLOCKED | Stage F 範本漏第三個 Cloud Run（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-33 | Low | METADATA_BLOCKED | ADR／設計小過時（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-35 | Low | CONFIRMED | CAL-PILOT 手冊停 08-31 | SOL_ONLY / SOL-SESSION-DOCS | SOURCE_TEXT_FACT_ONLY |
| E3-36 | Low | METADATA_BLOCKED | 計畫無結案追蹤（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E3-37 | Low | METADATA_BLOCKED | 入口與範本小過時（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-13 | Low | HIGH_CONFIDENCE_CANDIDATE | 委派 lockout 仍 InMemory 未接線 | SOL_ONLY / SOL-INTEGRATION | INFERENTIAL_OR_BLOCKED |
| E4-14 | Low | HIGH_CONFIDENCE_CANDIDATE | accountActive 寫死；limiter Optional | SOL_ONLY / SOL-SESSION | INFERENTIAL_OR_BLOCKED |
| E4-15 | Low | CONFIRMED | DATA-R03 仍 OPEN | SOL_ONLY / SOL-CONTRACTS | SOURCE_TEXT_FACT_ONLY |
| E4-16 | Low | METADATA_BLOCKED | 完整性錨失效（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-17 | Low | METADATA_BLOCKED | 檔內自相矛盾（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-18 | Low | METADATA_BLOCKED | review 互相矛盾未標（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-19 | Low | METADATA_BLOCKED | DATA-001 修正殘留旁路（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-20 | Low | METADATA_BLOCKED | Trusted Types 後續未做；codeql.yml 過時（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-21 | Low | CONFIRMED | outbox 完成後仍留 leaseOwner 未處理 | SOL_ONLY / SOL-OUTBOX | SOURCE_TEXT_FACT_ONLY |
| E4-22 | Low | METADATA_BLOCKED | 數字小誤（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-25 | Low | METADATA_BLOCKED | 過時內容未標（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E4-26 | Low | METADATA_BLOCKED | 歸檔成本過高（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | EXTERNAL_BLOCKED / EXT-METADATA | INFERENTIAL_OR_BLOCKED |
| E5-01 | Low | HIGH_CONFIDENCE_CANDIDATE | 歷史視覺證據影像占用較大儲存空間，是否可外置仍受保存與可追溯性要求限制。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-02 | Low | HIGH_CONFIDENCE_CANDIDATE | 已知 manifest 影像有相同雜湊群組，需逐組確認其引用與保留價值。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-03 | Low | HIGH_CONFIDENCE_CANDIDATE | 出貨資產尺寸須按現行預算判斷，不能由歷史截圖大小推定超標。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-04 | Low | HIGH_CONFIDENCE_CANDIDATE | 來源素材與出貨產物是否應保留須依建置與授權需求界定。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-05 | Low | NEEDS_RUNTIME_PROOF | 一項影像命中 XMP 標記；未讀 metadata 值，需先確認範圍及移除風險。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-06 | Low | NEEDS_RUNTIME_PROOF | 合成帳密 claim 涉及影像內容，未檢視畫面或重印其值。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-07 | Low | HIGH_CONFIDENCE_CANDIDATE | manifest 可列出未在所抽樣目前文件中找到文字引用的影像，不能因此斷定無用。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-08 | Low | HIGH_CONFIDENCE_CANDIDATE | 完整性掃描未見缺失圖片連結，仍需對應原 claim 範圍。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-09 | Low | HIGH_CONFIDENCE_CANDIDATE | PNG 結構可解壓不等同全部格式解碼或視覺相符。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| E5-10 | Low | HIGH_CONFIDENCE_CANDIDATE | 結構閘門目前釘住 cp01 manifest；完整視覺基線涵蓋範圍需另定。 | SOL_ONLY / SOL-VISUAL-EVIDENCE | INFERENTIAL_OR_BLOCKED |
| K1 | High | HIGH_CONFIDENCE_CANDIDATE | 回診限流鍵把非信任查詢變量混入，無法穩定約束同一呼叫來源。 | SOL_ONLY / SOL-RETURN | INFERENTIAL_OR_BLOCKED |
| K2 | Medium | HIGH_CONFIDENCE_CANDIDATE | 未核實的 intake 解析可賦予 patient 身分，且失敗預約可能留下無關 patient 記錄。 | SOL_ONLY / SOL-IDENTITY | INFERENTIAL_OR_BLOCKED |
| K4 | Medium | CONFIRMED | 限流文件鍵截斷可能碰撞，另缺期限清除及爭用回應契約。 | SOL_ONLY / SOL-RETURN | SYNTHETIC_SOURCE_BOUNDARY_ONLY |
| K5 | Medium | HIGH_CONFIDENCE_CANDIDATE | 全域例外處理的生命週期依附限期試行模組。 | SOL_ONLY / SOL-HTTP | INFERENTIAL_OR_BLOCKED |
| K6 | Medium | HIGH_CONFIDENCE_CANDIDATE | 來源 IP 限流未明確定義 IPv6 前綴的等價邊界。 | OWNER_BLOCKED / SOL-INGRESS | INFERENTIAL_OR_BLOCKED |
| K7 | Medium | HIGH_CONFIDENCE_CANDIDATE | 內部預約列表使用固定上限且缺可辨識的截斷與續讀語義。 | OWNER_BLOCKED / SOL-LIST | INFERENTIAL_OR_BLOCKED |
| A01 | Medium | HIGH_CONFIDENCE_CANDIDATE | 非法 booking 路徑 ID 的驗證使用一般例外，可能錯誤映射成 5xx。 | SOL_ONLY / SOL-HTTP | INFERENTIAL_OR_BLOCKED |
| A02 | High | HIGH_CONFIDENCE_CANDIDATE | 公開時段讀取與班表發布缺有界集合處理，成本與交易容量未完整收斂。 | SOL_ONLY / SOL-SCHEDULE | INFERENTIAL_OR_BLOCKED |
| A05 | Low | HIGH_CONFIDENCE_CANDIDATE | 回診會話期限以字串儲存，與原生 TTL 型別要求不一致。 | OWNER_BLOCKED / SOL-TTL | INFERENTIAL_OR_BLOCKED |
| A09 | Medium | HIGH_CONFIDENCE_CANDIDATE | 匯出單一交易讀取全部區間資料，缺可證明的資源界限。 | SOL_ONLY / SOL-EXPORT | INFERENTIAL_OR_BLOCKED |
| A11 | Medium | HIGH_CONFIDENCE_CANDIDATE | Calendar 路徑 ID 的一般例外與 booking 路徑共用同一 5xx 映射缺口。 | SOL_ONLY / SOL-HTTP | INFERENTIAL_OR_BLOCKED |
| A12 | Medium | HIGH_CONFIDENCE_CANDIDATE | operational readiness 預設來源未量測真實相依健康，回應另暴露內部 gate 狀態。 | OWNER_BLOCKED / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| B-01 | High | HIGH_CONFIDENCE_CANDIDATE | 部署 CI principal 的專案 IAM 管理權超出建置部署所需邊界。 | OWNER_BLOCKED / SOL-IAM | INFERENTIAL_OR_BLOCKED |
| B-02 | Medium | HIGH_CONFIDENCE_CANDIDATE | WIF 信任條件未完整釘住不可變的 repository/owner 身分及允許 ref。 | OWNER_BLOCKED / SOL-IAM | INFERENTIAL_OR_BLOCKED |
| B-03 | High | HIGH_CONFIDENCE_CANDIDATE | 公開 ingress 與 proxy header 信任邊界未有足夠部署證明。 | OWNER_BLOCKED / SOL-INGRESS | INFERENTIAL_OR_BLOCKED |
| B-04 | Medium | HIGH_CONFIDENCE_CANDIDATE | 限流狀態集合缺原生期限清除的單一設定權威。 | OWNER_BLOCKED / SOL-TTL | INFERENTIAL_OR_BLOCKED |
| B-05 | Medium | HIGH_CONFIDENCE_CANDIDATE | Terraform mock tests 未納入 required CI，IaC 斷言只能靠人工執行。 | SOL_ONLY / SOL-CI-IAC | INFERENTIAL_OR_BLOCKED |
| B-06 | Medium | HIGH_CONFIDENCE_CANDIDATE | 告警 operation 標籤與應用實際輸出的值不一致。 | SOL_ONLY / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| B-07 | Medium | HIGH_CONFIDENCE_CANDIDATE | 交易與備份告警的碼/方法來源不一致，可能漏報或把排程事件當失敗。 | SOL_ONLY / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| B-08 | Medium | HIGH_CONFIDENCE_CANDIDATE | Pub/Sub 通知身分與 delivery IAM 的正確性尚待 provider 確認。 | OWNER_BLOCKED / EXT-NOTIFICATION | INFERENTIAL_OR_BLOCKED |
| B-09 | Medium | HIGH_CONFIDENCE_CANDIDATE | 試行部署依賴長期服務帳號金鑰及偏大的 Auth 管理權。 | OWNER_BLOCKED / SOL-IAM | INFERENTIAL_OR_BLOCKED |
| B-12 | Medium | HIGH_CONFIDENCE_CANDIDATE | README 描述的儲存/欄位範圍未對齊現行 server 模式與最小 intake。 | SOL_ONLY / SOL-DOCS | INFERENTIAL_OR_BLOCKED |
| B-13 | Medium | HIGH_CONFIDENCE_CANDIDATE | 工作區與 cloud build 排除規則未完整涵蓋憑證檔類型。 | SOL_ONLY / SOL-SECRETS | INFERENTIAL_OR_BLOCKED |
| B-21 | Low | HIGH_CONFIDENCE_CANDIDATE | 追蹤設定/文件含不必要的環境或個人識別值，公開匯出需去識別。 | OWNER_BLOCKED / SOL-PRIVACY | INFERENTIAL_OR_BLOCKED |
| B-31 | Low | HIGH_CONFIDENCE_CANDIDATE | agent 的檔案拒絕規則未涵蓋所有 env 與金鑰目錄變體。 | SOL_ONLY / SOL-SECRETS | INFERENTIAL_OR_BLOCKED |
| B-41 | Low | HIGH_CONFIDENCE_CANDIDATE | IaC mock tests 缺 ingress、公眾principal及危險角色的安全負向斷言。 | SOL_ONLY / SOL-IAM | INFERENTIAL_OR_BLOCKED |
| B-48 | Medium | HIGH_CONFIDENCE_CANDIDATE | 依賴例外具有期限，但缺可在到期前完成的修復/退出處置。 | OWNER_BLOCKED / SOL-SUPPLY | INFERENTIAL_OR_BLOCKED |
| B-52 | Low | HIGH_CONFIDENCE_CANDIDATE | Firestore TTL 的 JSON 與 Terraform 管理面未明確收斂為單一權威。 | OWNER_BLOCKED / SOL-TTL | INFERENTIAL_OR_BLOCKED |
| B-54 | Medium | HIGH_CONFIDENCE_CANDIDATE | 告警規格在多份配置各自維護，缺同一日誌 fixture 的語義驗證。 | SOL_ONLY / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| B-55 | Low | HIGH_CONFIDENCE_CANDIDATE | 金鑰目錄的版本控制排除缺口尚未與補償控制形成一致規格。 | SOL_ONLY / SOL-SECRETS | INFERENTIAL_OR_BLOCKED |
| C01 | Medium | HIGH_CONFIDENCE_CANDIDATE | server 模式仍顯示資料僅存在本機的過時說明。 | LUNA_READY / LUNA-WORKBENCH-START | INFERENTIAL_OR_BLOCKED |
| C02 | Medium | CONFIRMED | 工作臺從本機帳戶資料顯示員工身分，而非伺服器確認的 actor。 | SOL_ONLY / SOL-SESSION | SYNTHETIC_SOURCE_BOUNDARY_ONLY |
| C04 | Medium | CONFIRMED | 預約列表讀取錯誤被轉成空列表，掩蓋載入失敗。 | SOL_ONLY / LUNA-READ-FAILURE | SYNTHETIC_SOURCE_BOUNDARY_ONLY |
| C05 | Medium | HIGH_CONFIDENCE_CANDIDATE | 專案 README 仍把已有 API 的模式描述成不連線。 | SOL_ONLY / SOL-DOCS | INFERENTIAL_OR_BLOCKED |
| C07 | Medium | HIGH_CONFIDENCE_CANDIDATE | UI 將受上限限制的清單數量顯示為完整總數。 | OWNER_BLOCKED / SOL-LIST | INFERENTIAL_OR_BLOCKED |
| X-C01 | Medium | HIGH_CONFIDENCE_CANDIDATE | 時段 API 失敗時患者頁仍可能顯示載入成功。 | SOL_ONLY / LUNA-READ-FAILURE | INFERENTIAL_OR_BLOCKED |
| X-C02 | Medium | CONFIRMED | 本機儲存的 CSRF 被視為已登入，沒有重新核實 server 會話。 | SOL_ONLY / SOL-SESSION | SYNTHETIC_SOURCE_BOUNDARY_ONLY |
| X-C04 | Low | HIGH_CONFIDENCE_CANDIDATE | Calendar 操作失敗後按鈕缺統一的恢復狀態處理。 | SOL_ONLY / SOL-SESSION-UI | INFERENTIAL_OR_BLOCKED |
| X-C05 | Low | HIGH_CONFIDENCE_CANDIDATE | 工作臺週曆使用最早預約作錨點，與清單當日預設不一致。 | LUNA_READY / LUNA-WORKBENCH-START | INFERENTIAL_OR_BLOCKED |
| X-C06 | Low | HIGH_CONFIDENCE_CANDIDATE | 預覽主機判定僅排除特定主站，未定義所有主域與核准預覽的安全邊界。 | OWNER_BLOCKED / SOL-INGRESS | INFERENTIAL_OR_BLOCKED |
| X-C07 | Low | ALREADY_FIXED | 舊報告稱回診上下文沒有清除，但現行修復已有明確隔離與延遲結果失效。 | NO_WORK_REQUIRED / NO-WORK | SYNTHETIC_SOURCE_BOUNDARY_ONLY |
| D-01 | Medium | HIGH_CONFIDENCE_CANDIDATE | 正式 Calendar 重建遇衝突後未明確還原已取消事件的狀態。 | SOL_ONLY / SOL-CALENDAR-RESTORE | INFERENTIAL_OR_BLOCKED |
| D-02 | Medium | HIGH_CONFIDENCE_CANDIDATE | 試行 Calendar 還原也缺已取消事件狀態的明確恢復。 | SOL_ONLY / SOL-CALENDAR-RESTORE | INFERENTIAL_OR_BLOCKED |
| D-03 | Medium | HIGH_CONFIDENCE_CANDIDATE | 固定識別碼的 smoke 測試可能把既存事件衝突當成有效寫入證明。 | SOL_ONLY / SOL-CALENDAR-RESTORE | INFERENTIAL_OR_BLOCKED |
| D-05 | Medium | HIGH_CONFIDENCE_CANDIDATE | 同步整輪使用同一時間快照而未完整涵蓋長輪次 lease 更新。 | SOL_ONLY / SOL-CALENDAR-LEASE | INFERENTIAL_OR_BLOCKED |
| D-07 | High | HIGH_CONFIDENCE_CANDIDATE | 班表引用的開放狀態集合與 domain 佔用狀態不一致。 | SOL_ONLY / SOL-SCHEDULE | INFERENTIAL_OR_BLOCKED |
| D-08 | High | HIGH_CONFIDENCE_CANDIDATE | 回診 lookup 識別鍵缺具金鑰的隱私保護，並牽涉既有鍵的相容性。 | OWNER_BLOCKED / SOL-RETURN | INFERENTIAL_OR_BLOCKED |
| D-12 | Medium | HIGH_CONFIDENCE_CANDIDATE | 日曆來源切換缺有界搬移與足夠 lease 容量證明。 | SOL_ONLY / SOL-CALENDAR-LEASE | INFERENTIAL_OR_BLOCKED |
| D-25 | Medium | HIGH_CONFIDENCE_CANDIDATE | 未探測的 operational 相依狀態仍可能被評成健康。 | SOL_ONLY / SOL-OBSERVABILITY | INFERENTIAL_OR_BLOCKED |
| D-38 | Low | HIGH_CONFIDENCE_CANDIDATE | 現行文件中的會話期限與實作不一致，既有重新驗證不可被省略。 | SOL_ONLY / SOL-SESSION-DOCS | INFERENTIAL_OR_BLOCKED |
| D-42 | Low | HIGH_CONFIDENCE_CANDIDATE | 班表發布缺已報到/過去未結及 Calendar 還原的負向整合回歸。 | SOL_ONLY / SOL-SCHEDULE | INFERENTIAL_OR_BLOCKED |
| E1-01 | High | HIGH_CONFIDENCE_CANDIDATE | 回滾腳本未明確阻斷每一原生命令失敗，可能輸出不實完成訊息。 | SOL_ONLY / SOL-RELEASE | INFERENTIAL_OR_BLOCKED |
| E1-02 | Medium | HIGH_CONFIDENCE_CANDIDATE | 原生命令錯誤語義依賴 PowerShell 版本，但入口未明確阻斷不相容版本。 | SOL_ONLY / SOL-RELEASE | INFERENTIAL_OR_BLOCKED |
| E1-11 | Low | HIGH_CONFIDENCE_CANDIDATE | 建置腳本未保證原生命令失敗時中止後續步驟。 | SOL_ONLY / SOL-RELEASE | INFERENTIAL_OR_BLOCKED |
| E1-12 | Low | HIGH_CONFIDENCE_CANDIDATE | release 的長期金鑰與清理流程缺可證明的全路徑退出契約。 | OWNER_BLOCKED / SOL-IAM | INFERENTIAL_OR_BLOCKED |
| E3-01 | High | HIGH_CONFIDENCE_CANDIDATE | 治理材料包含非必要個人聯絡識別，公開材料去識別需明確權威。 | OWNER_BLOCKED / SOL-PRIVACY | INFERENTIAL_OR_BLOCKED |
| E3-02 | High | HIGH_CONFIDENCE_CANDIDATE | 隱私草稿描述的 intake 欄位與現行頁面/核定最小化範圍不一致。 | OWNER_BLOCKED / SOL-PRIVACY | INFERENTIAL_OR_BLOCKED |
| E3-03 | High | HIGH_CONFIDENCE_CANDIDATE | 隱私揭露與 Calendar 投影實際使用的資料欄位不一致。 | OWNER_BLOCKED / SOL-PRIVACY | INFERENTIAL_OR_BLOCKED |
| E3-04 | Medium | HIGH_CONFIDENCE_CANDIDATE | 現行治理材料及對應 gate 的欄位敘述未完整跟隨已核定 intake 最小化。 | SOL_ONLY / SOL-DOCS | INFERENTIAL_OR_BLOCKED |
| E3-06 | Medium | HIGH_CONFIDENCE_CANDIDATE | 生效文件仍記錄過時的會話時限。 | SOL_ONLY / SOL-SESSION-DOCS | INFERENTIAL_OR_BLOCKED |
| E3-07 | Medium | HIGH_CONFIDENCE_CANDIDATE | runbook 要求先開維護模式，但維護 gate 尚非 routed control。 | SOL_ONLY / SOL-MAINTENANCE | INFERENTIAL_OR_BLOCKED |
| E3-19 | Low | HIGH_CONFIDENCE_CANDIDATE | 限流文件缺同一身分的完整速率參數。 | SOL_ONLY / SOL-RETURN | INFERENTIAL_OR_BLOCKED |
| E4-01 | High | HIGH_CONFIDENCE_CANDIDATE | 限流/防枚舉證據曾將局部通過視為完整安全邊界成立。 | SOL_ONLY / SOL-INTEGRATION | INFERENTIAL_OR_BLOCKED |
| E4-03 | High | HIGH_CONFIDENCE_CANDIDATE | AUD-01 身分一致性來源/修復證據需要保留可核對的關帳鏈。 | SOL_ONLY / SOL-INTEGRATION | INFERENTIAL_OR_BLOCKED |
| E4-08 | Medium | HIGH_CONFIDENCE_CANDIDATE | 供應鏈稽核項目的期限與現行依賴狀態缺完整關帳證據。 | OWNER_BLOCKED / SOL-SUPPLY | INFERENTIAL_OR_BLOCKED |
| E4-10 | Medium | HIGH_CONFIDENCE_CANDIDATE | 個人聯絡識別的公開材料問題需以去識別證據關帳，而非重貼原值。 | OWNER_BLOCKED / SOL-PRIVACY | INFERENTIAL_OR_BLOCKED |
| E4-12 | Low | HIGH_CONFIDENCE_CANDIDATE | 歷史 PASS 的 scope/版本限制缺必要更正，可能被當成現行綠燈。 | SOL_ONLY / SOL-INTEGRATION | INFERENTIAL_OR_BLOCKED |
| E4-24 | Low | HIGH_CONFIDENCE_CANDIDATE | 文件以分頁稱呼固定上限清單，超出現行 API/UI 契約。 | OWNER_BLOCKED / SOL-LIST | INFERENTIAL_OR_BLOCKED |

## NEW review entries（不是淨新增漏洞計數）

| ID | severity 提案 | status | 安全摘要 | primary packet | 去重關係 |
| --- | --- | --- | --- | --- | --- |
| NEW-01 | High | CONFIRMED | 合法非staff Firebase token 的UID未經patient record/binding核實即具patient身分。 | SOL-IDENTITY | SIBLING_DISTINCT_BOUNDARY; K2, B-34 |
| NEW-02 | High | CONFIRMED | staff Bearer與cookie入口使用不同server-session/CSRF生命週期。 | SOL-SESSION | NET_NEW_BOUNDARY;  |
| NEW-03 | Medium | CONFIRMED | 角色allowlist重疊時優先選manager，缺fail-closed配置不變量。 | SOL-SESSION | NET_NEW_BOUNDARY; K9 |
| NEW-04 | Low | CONFIRMED | malformed session cookie 的decode例外未作authentication failure處理。 | SOL-HTTP | SIBLING_DISTINCT_BOUNDARY; A01, A11 |
| NEW-05 | Low | CONFIRMED | return-session header缺opaque ID界限，錯誤會傳至資料路徑解析。 | SOL-TTL | SIBLING_DISTINCT_BOUNDARY; A01, B-34 |
| NEW-06 | Medium | CONFIRMED | export GET在組檔成功後、HTTP交付前消耗下載額度並記錄downloaded。 | SOL-EXPORT | NET_NEW_BOUNDARY; A09, D-37 |
| NEW-07 | Medium | CONFIRMED | staff protected request 每次touch lastSeenAt，缺有界寫入頻率。 | SOL-SESSION | NET_NEW_BOUNDARY;  |
| NEW-08 | Medium | CONFIRMED | session creation入口未設定自身 per-IP/per-account abuse boundary。 | SOL-SESSION | NET_NEW_BOUNDARY; K1, E4-01 |
| NEW-09 | Medium | HIGH_CONFIDENCE_CANDIDATE | Calendar 單頁交易的byte/time資源envelope尚未量測，與舊D-11同根；不是已證實超限。 | SOL-CALENDAR-ENVELOPE | DEDUPED_SAME_ROOT; D-11 |
| NEW-10 | Medium | HIGH_CONFIDENCE_CANDIDATE | project-wide Storage grants需分離已覆蓋的CI principal與builder bucket範圍候選。 | SOL-IAM | PARTIAL_DEDUPE_CANDIDATE; B-01, B-09 |

## 尚缺原 claim／source anchor 的精確清單

業主確認原 partB／partE／E1～E4 分冊未保存，只有整併報告；本表 31 列全部維持 `METADATA_BLOCKED`。每列候選／counterevidence 是 current-main 判讀，不是原 finding 身分驗收。下列「提供者」代表未來重建去識別 claim/source 的責任，不表示原檔可取得；任何重建必須另標來源與限制。E4-11 僅 custody gap，不補造 reference 或讀取敏感 payload。

| ID | 目前候選／counterevidence | 尚缺什麼 | 提供者／停止條件 |
| --- | --- | --- | --- |
| B-24 | HIGH_CONFIDENCE_CANDIDATE（僅 retired-variable 子項：唯一現行符號為 secret_resource_version；其餘 image/authDomain 僅列候選，不確認為缺陷或過期。）目前測試明確要求舊 pin 不控制 mount；authDomain 測試也固定核對 authorized preview host。 | 原列把三項合併且無精確來源。image 的 latest 檢查同時出現在 digestPinnedImageReference、evaluateImageReference 與 Terraform api_image/worker_image 驗證；目前測試未直接命中 digestPinnedImageReference。authDomain 是否過期需原報告提供預期值/時間依據。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E1-19 | METADATA_BLOCKED：目前 scripts 測試中有大量負向斷言，未找到可唯一對應原 finding 的測試或 assertion；上述僅為歧義例，不表示任一斷言有缺陷。 | 原摘要未給檔案、test 名、斷言、被拒絕行為或可繞過案例；搜尋範圍為 scripts/*.test.mjs 的 not.toContain/not.toMatch/not.toThrow 等負向 assertion。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E1-27 | METADATA_BLOCKED：已定位性能預算長註解與兩種 failed 輸出候選（dist 缺失、實際 violations），但原摘要未指定哪句註解或哪個錯誤標籤。測試覆蓋預算/缺資產分支，未搜到直接斷言上述 CLI error 文案的測試。 | check-performance-budget.mjs 同時含 OG image 排除理由、多個 budget violation 文案及 dist 缺失的 CLI error；不能由摘要推定哪個過時或誤標，也不能改動 budget 語意。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E1-29 | METADATA_BLOCKED：validateInventory 存在 scan、route、entry 多種重複檢查，後續資料路由/pretty-path 亦有獨立唯一性檢查。check-public-pages.test 有基本/route 測試，但檔內搜尋未見直接 duplicate-route/entry/scan regression；無法判定要合併或移除哪一項。 | 摘要未指明重複的兩個檢查或同一錯誤輸入；目前搜尋 check-public-pages.mjs 的 inventory、data-route、mapping 驗證及對應測試。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E1-33 | METADATA_BLOCKED：候選註解分布在注入欄位、aria-busy 等區域；摘要沒有句子或現況對照，無法確認何者已過時。找到 web-ui-rules helper tests 與 check:ui caller，未找到同名 check-web-ui.test.mjs。 | 僅知道檔名 check-web-ui，沒有 comment 行號、主張或新真值；所列行只是檢索到的代表性註解。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E1-34 | HIGH_CONFIDENCE_CANDIDATE（僅此明示重複驗證 pair 的定位；不是缺陷結論）。build-web.indexableEntriesFromPublicPages 與 check-public-pages.validateInventory 有部分 public-pages 驗證重疊；build-web 註解說明 direct build 的 fail-closed 動機，兩處範圍並不等同。 | 原摘要未提供兩個 script/function 名；目前這是最直接明示的 pair，但不能排除其他跨-script 重複。build-web 專用測試檔/對此 export 的測試搜尋未命中，check-public-pages 有單元測試。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E1-35 | METADATA_BLOCKED：候選包括 check-web-ui 的文字政策 helper、IaC source-string tests，以及 phase0-snapshot 的 shell grep；原摘要未指出 policy、目標檔或被 grep 的規則。web-ui-rules.test 只測 helper 的文字匹配行為，不能證明原 finding 身分。 | 摘要中的「grep」可能泛指 literal source search，也可能指 phase0-snapshot shell 命令；搜尋 scripts/*.mjs 與 *.test.mjs 後有多個候選，無唯一 test/policy。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E2-11 | METADATA_BLOCKED：多個 inspect/plan CLI 重複 usage、參數處理、JSON 輸出及錯誤回傳樣板；目前已見四個 inspect 與 preview/apply/firestore plan 候選。各命令的 authority、只讀/plan 行為和輸入不同，原摘要未指定可抽取的 pair/template。 | package scripts 還有其他 inspect 入口；目前只聚焦 internal-test inspect/plan 與 firestore-index-plan。無原始 pair、模板段落或預期共用 API，不能合併不同安全語意。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-18 | METADATA_BLOCKED：目前 matrix 有多個彼此獨立的 unmerged/READY 記載；原摘要未給 PR/列/對照句，無法唯一綁定。未認定目前文件缺陷。 | 需原稽核文件名、PR/項目 ID、殘句行號及其所稱矛盾的 matrix 列。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-05 | METADATA_BLOCKED：原摘要提到 integrity output 與舊 FAIL bytes 相同、產物遺失；本輪未讀任何 P1-09 raw evidence/log，也未比對 bytes/hash，故不確認該結論。 | 需精確 artifact filename/hash/custodian、來源 run/attempt ID 及可安全核對的 custody metadata；不可提供 raw sensitive output。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-06 | PARTIAL_COUNTEREVIDENCE：older files are date-stamped and several say ‘current’ within their capture date; CP-01 (2026-09-29) explicitly treats older dated sets as historical. Filename inventory also contains C4/C6 sets beyond the six `ui-visual-baseline-*` files, so the claimed ‘7 files’ set is not uniquely identified. No screenshots/images opened. This may be dated wording, not proof of live contradiction. | 需原finding列出所謂 7 個文件及其逐行 claim；未讀 C4/C6 內容，也不檢查 images。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-11 | SENSITIVE_SCOPE_BLOCKED：遵守限制，未讀/轉錄任何 Calendar event、payload、PII 或 raw tools logs；只清點過 P1-09 review 檔名，無法綁定原 claim 或證明內容。 | 需安全的 review filename、section/line metadata 與 custody reference（不含事件、payload、PII、raw log）；目前無法確認哪個 review 承載此 claim。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-21 | METADATA_BLOCKED：雖能定位 C1/C6 架構與本機 packet 文件，但摘要沒有失敗命令、腳本、輸出或環境，不能聲稱可重現。 | 需本機執行包檔名／版本、精確命令、失敗階段及非敏感錯誤碼；本輪不執行 gate/部署命令。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-22 | METADATA_BLOCKED：未提供失效連結或引用文字；不能從大量文件連結中猜一個。 | 需來源文件:行號、原引用字串與預期目標（路徑／章節）。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-23 | METADATA_BLOCKED：『格式／排序』沒有唯一文件、表格或排序規則；不臆造缺陷。 | 需文件/表格行、預期格式與權威排序規則。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-26 | METADATA_BLOCKED：涉及私有 repo 前提與本機路徑，但無檔案/行號；不搜尋或重述任何本機路徑字串。 | 需安全提供文件名與段落 anchor、暴露類型；路徑值可遮罩。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-27 | METADATA_BLOCKED：膨脹、overlay、模型名不一致是多個寬泛主張，沒有唯一文件或模型符號。 | 需各 claim 的文件/行號、被比較的模型名及 overlay 指涉。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-28 | METADATA_BLOCKED：未提供期限對象、原到期日或稽核 as-of；無從判斷已過期或即將到期。 | 需期限項目 ID、來源行、核准期限與本次檢查時間基準。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-29 | PARTIAL_COUNTEREVIDENCE：目前找到的兩處是不同 runbook 中兩個不同命令；單憑它們不能證明指令互相衝突。未執行 Firebase/登入命令。 | 需原finding指稱的兩條相衝突命令及適用情境；目前只確認兩個不同指令分別出現。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-30 | COUNTEREVIDENCE：目前 Stage-F source-readiness、部署邊界與範本均列 API+outbox 兩服務；在檢視的 current scope 中未找到第三個 Cloud Run 服務。不能憑數量推造第三服務或擴大 scope。 | 需原finding指定第三服務名稱、授權/架構來源及為何納入 Stage F；第三服務 scope 尚未證實。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-33 | METADATA_BLOCKED：ADR/設計文件與過時 claim 無指定文件、決策 ID 或後續來源。 | 需 ADR/design 文件路徑、段落、原決策 ID 與取代它的權威來源。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-36 | METADATA_BLOCKED：『計畫無結案追蹤』未指定計畫、工作項目 ID 或完成判準。 | 需 plan 路徑、工作項目 anchor、應有的 closeout 欄位與權威追蹤位置。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E3-37 | METADATA_BLOCKED：入口與範本未指定名稱或 stale 欄位，無法判斷仍被使用或已 superseded。 | 需入口/範本路徑與行、其 canonical 替代來源及目前引用者。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-16 | METADATA_BLOCKED：『完整性錨失效』沒有 digest、檔案/manifest、預期對象或比對方向；不可自行驗 hash 猜目標。 | 需 anchor 類型、來源/預期 SHA、artifact id、失效輸出位置及 custody owner。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-17 | METADATA_BLOCKED：檔內自相矛盾沒有文件/段落或互斥斷言；不能全 repo 搜尋後挑一對。 | 需文件路徑、兩個互斥句/行號、各句時間/狀態語境。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-18 | METADATA_BLOCKED：未指明互相矛盾的兩份 review、claim 或 supersession 關係；不重讀全部歷史 reviews。 | 需兩個 review 檔名/行號、各自狀態與預期權威/取代關係；如含敏感資料只給 metadata。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-19 | METADATA_BLOCKED：在限定的 current source/docs 安全範圍以 `DATA-001`/`data-001` 及 bypass 搜尋，沒有可唯一映射的命中；不推測旁路名稱或讀 runtime evidence。 | 需 DATA-001 子報告段落、旁路 symbol/caller、修正後應有的拒絕條件與相關測試路徑。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-20 | PARTIAL_COUNTEREVIDENCE：現行 source 有 Trusted Types helper 與測試；architecture doc 明示 CodeQL 於 2026-08-01 由 Semgrep 取代，且 tracked tree 無 `*codeql*` 檔名。原摘要所稱『後續』沒有 task/claim anchor，不能確認未做項或判定 codeql.yml 過時。 | 需 Trusted Types follow-up 的具體 ticket/要求，以及 codeql.yml 預期路徑/舊證據；當前沒有 tracked 同名檔可比對。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-22 | METADATA_BLOCKED：沒有指出錯誤數值、單位、對應文件或正確值；不做數字猜測。 | 需原/現數值、單位、來源及精確行號。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-25 | METADATA_BLOCKED：『過時內容未標』沒有文件/版本/相依權威來源，無法區分 dated historical snapshot 與未標 stale claim。 | 需文件段落、現行權威來源與 supersedes/as-of 關係。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
| E4-26 | METADATA_BLOCKED：歸檔『成本過高』未定義成本、基線、衡量窗口或目標，無法定位可驗收 claim。 | 需 archive workflow/文件、成本維度（時間/儲存/人工）、基線與量化門檻。 | 原稽核報告維護者／業主（私下提供原段落或去識別source anchor，不公開raw payload）；不能根據 Low 或同類程式猜成完成。 |
