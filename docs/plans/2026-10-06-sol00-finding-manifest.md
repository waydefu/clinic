# SOL-00 254-ID current-evidence index（v3）

**CLOSED_PENDING_PROTECTED_MERGE**：planning/evidence關帳，不是254個修復完成。

Current source baseline `2f9360cf5d670879b98705cd9a3b04eb71fe20bd`；frozen研究仍綁原`01d36c96ae6be6cea91c891c494a6601b2abd4a3`，537 current bindings另列overlay；[machine manifest](2026-10-06-sol00-safe-manifest.json) `/activeCloseout/perFinding` 是目前權威。原ledger凍結；[計畫](2026-10-06-sol00-safe-manifest-closeout-plan.md)解釋scope，[handoff](../reviews/2026-10-06-sol00-planning-handoff.md)記producer/readback。

表中CONFIRMED_CODE_FACT是source/model推論；LIKELY/CANDIDATE/NEEDS_RUNTIME_REPRODUCTION不是confirmed deployed bug。31 provenance gap永久終局，不再等原分冊，但歷史claim皆未verified。formal global net-new=null；raw NEW=10、confirmed minimum=0、2 current siblings、8 custody-limited identity ambiguity。

| ID | 原 severity | Current finding disposition | Provenance | 安全摘要 | 單一 primary/actor | Dedupe/current evidence |
| --- | --- | --- | --- | --- | --- | --- |
| B-10 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 排程啟用狀態與可接受的初始占位目標未形成一致的安全組態契約。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAC-LIFECYCLE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-11 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 授權開關同時決定受管理資源是否存在，未明確區分禁止新操作與保留既有資源。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAC-LIFECYCLE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-14 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 靜態安全掃描的框架涵蓋與整檔例外尚未對齊實際應用安全邊界。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SAST | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-19 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 部分供應鏈 override 只有下界，沒有版本相容性上界。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SUPPLY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-23 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | robots 註解把檢索限制描述成額外保護，與依賴檢索取得 noindex 的敘述不一致。 | LUNA_READY / LUNA-ROBOTS-COMMENTS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-26 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 容器宣告未固定基底 digest，也未在映像 metadata 宣告來源版本。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTAINERS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-27 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 主要驗證 workflow 的 checkout 尚未明確關閉憑證持續保存。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CI-SECURITY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-29 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 行級秘密掃描例外仍有未錨定的子字串模式，可能超出具名合成值的預期範圍。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SECRETS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-30 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | Firestore 安全掃描只涵蓋特定字面無條件授權形狀，不能作為完整授權規則保障。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SAST | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-32 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 依賴新增設定與現有 manifest 的版本範圍未明示是否採不同策略。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SUPPLY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-15 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 契約中的多個回應 shape 與 transition 命令尚未證明由 API 邊界一致執行。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-17 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 共享 audit wire contract 未涵蓋完整 audit action 集合。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-18 | Medium | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | branch protection、公開狀態及 gcloud guard 的 current-facing 說明有互相衝突風險。 | SOL_PRIMARY_EXPERT_ONLY / SOL-GOVERNANCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-20 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 部分依賴工具鏈版本需支援政策評估，但 Terraform constraints/locks 並非普遍落後。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SUPPLY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-16 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | MonthDay wire schema 驗形狀，calendar validity 交由 domain caller。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-22 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | CSP 路徑規則由共用 catalog 產生；重複與 frame-src 是否死設定須依現況重判。 | SOL_PRIMARY_EXPERT_ONLY / SOL-HTML | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-24 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | retired 變數／子字串 image 檢查／過期 preview authDomain（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-25 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 日誌 bucket 是否需 sink 或 retention destination，須依核准觀測用途與保留責任決定。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-28 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | SAST workflow 說明仍以 private repo 解釋 code-scanning upload 不可用。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SAST | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-33 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | UTC timestamp predicate 接受 24:00 需按 ISO timestamp policy 收斂。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-34 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | MonthDay、姓名及電話 wire schemas 的形狀限制比 domain identity 規則寬。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IDENTITY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-35 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Schedule wire schema 未限集合數量或區間端點順序，domain 另檢 schedule validity。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SCHEDULE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-36 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | LocalTime regex 重複定義可能逐漸分歧；月份與 MonthDay 則各有獨立語義。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-37 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | audit contract 使用 ZodIssueCode.custom symbolic alias。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-38 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Business export 日期區間 schema 各自驗日期，API/domain 另負責順序與長度。 | SOL_PRIMARY_EXPERT_ONLY / SOL-EXPORT | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-39 | Low | NOT_A_BUG_SOURCE_SCOPE | AVAILABLE_RECORDED_SOURCE | config workspace package 無應用依賴，但 emulator tests 直接匯入其 local target helper。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-42 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | Terraform provider lock 使用不同 patch version，但均受相同 7.x constraint 接受。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SUPPLY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-43 | Low | NOT_A_BUG_SOURCE_SCOPE | AVAILABLE_RECORDED_SOURCE | notification-path JSON 與 Terraform 描述不同證據階段，明確維持未部署而非互相矛盾。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-44 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | index matrix checker 驗證已列 query 的索引，不能單獨證明 query inventory 完整。 | SOL_PRIMARY_EXPERT_ONLY / SOL-QUERY-INDEX | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-45 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | C1 config contract 必須與 runtime env/secret consumers 做雙向覆蓋檢查。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONFIG | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-46 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | C6 README 所稱 controller unrouted 須區分 source module mount 與 C6 resource scope。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DOCS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-49 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | C2 Terraform 只宣告 Identity API enablement，Identity Platform 設定由 gated configurator 分工。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-50 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | CAL-PILOT budget expiry/labels 須按已核准期限確認，不可自行延長。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAC-LIFECYCLE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-51 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 告警 signal/window/threshold 有刻意異質設定，需驗 source mapping 並防止 missing-data 假綠。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| A03 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 待永久刪除清單一次讀取全部到期封存紀錄，沒有容量與分頁界限。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RETENTION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| A04 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 讀公開可預約網格沿用建立預約權限，完整班表與 slot view 的授權目的未分離。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RBAC | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| A06 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 原報所稱刪除路由固定拒絕的行為在現行接線來源已不同，仍需實際回歸證據。 | SOL_PRIMARY_EXPERT_ONLY / SOL-LIFECYCLE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| A07 | Low | NOT_A_BUG_SOURCE_SCOPE | AVAILABLE_RECORDED_SOURCE | 未認證的瀏覽器登入配置包含公開 Web API key，不能等同伺服器憑證洩漏。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| A08 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 休診重疊查詢沒有請求上界，可能讀取超出目標窗口的未來資料。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SCHEDULE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| A10 | Low | NOT_APPLICABLE_CURRENT_SCOPE | AVAILABLE_RECORDED_SOURCE | 停用帳號沿用認證失敗對外回應，原報要求新增專用代碼尚無政策授權。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | SAME_ROOT_CAUSE_SIBLING；source scope only |
| C03 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 本機 prototype 的合成登入提示需確認不會出現在伺服器認證模式。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION-UI | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| C06 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | robots.txt 說明段落對工作臺路徑是否由 robots directive 管理的定位不一致。 | LUNA_READY / LUNA-ROBOTS-COMMENTS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| C09 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | CAL-PILOT session bootstrap 狀態與 internal-test bearer token 使用不同瀏覽器儲存路徑。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION-UI | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-09 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 到診後未到與改期回復成立缺少核定的例外語意對照。 | SOL_PRIMARY_EXPERT_ONLY / SOL-LIFECYCLE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-10 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 電話驗證與舊證件短值遮罩未完整保障有效識別和最小揭露。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IDENTITY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-11 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | Calendar 單頁同步缺少本機交易容量界限並保留逐事件讀取。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-ENVELOPE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-14 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Worker README 對 Calendar PII 的無範圍禁令未反映後續專用日曆標題核准。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-15 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 空批次告警使用全部 pending 而非已到期工作，可能把合法退避視為停滯。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-16 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Calendar 候選比對只需 enabled patient IDs，query 卻讀取完整患者文件。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-17 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Calendar parse failure 計數與交易外 appointment snapshot 時序涉及兩項不同的觀測/一致性議題。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-ENVELOPE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-21 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | appointment.ts 純函式在 workspace 產品路徑未見 caller，但仍由 domain public barrel 匯出。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-22 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 角色投影 helper 對未知新增欄位沒有預設拒絕機制。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RBAC | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-23 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 未接線的 payroll close planner 未拒絕 periodEnd 前的結算計畫。 | SOL_PRIMARY_EXPERT_ONLY / SOL-LIFECYCLE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-24 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 里程碑展示層未將試用期調整納入共同計算。 | SOL_PRIMARY_EXPERT_ONLY / SOL-BUSINESS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-27 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Calendar pilot health 對每個 outbox 狀態 query 取完整 snapshots 再計 size。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-28 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | watch channel renewal 將舊 channel ID 加固定後綴，長度沒有本地界限驗證。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-WATCH | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-29 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | renewal helper 每次新建 seen notification/event sets，overlap 期間可能重置既有去重狀態。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-WATCH | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-30 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 合成候選標籤由有限字母與兩位數組合，多筆資料可能碰撞。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-31 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | CAL-PILOT synthetic writer 把預約結束時間寫死為半小時，且以 409 視為冪等成功。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-RESTORE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-32 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | CAL-PILOT 合成 fixture 固定時段及合成顯示欄位，配置需求與測試用途邊界未明。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-RESTORE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-33 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Calendar candidate reject 的版本守衛、SoT 恢復與審計動作需由同一決策矩陣明確驗證。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-CANDIDATE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-34 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | routeFamilyFromPath 先用包含式 /calendar 分類，使 /calendar-session 也歸入 calendar family。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-35 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | formal_launch acknowledgement 只拒絕未來日期，未與試用期結束日比較。 | SOL_PRIMARY_EXPERT_ONLY / SOL-BUSINESS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-36 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | returnCompletedAt 有不得早於 notice 的檢查，但未拒絕晚於伺服器 now 的時間。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RETENTION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-37 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 原列把匯出電話呈現、CSV escaping、backup failure 重複告警與 denylist 等不同邊界合併，需按子題逐項確認。 | SOL_PRIMARY_EXPERT_ONLY / SOL-EXPORT | SAME_ROOT_CAUSE_SIBLING；source scope only |
| D-39 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | decision register 與多份產品文件保留較早的 session/Calendar 敘述，需辨識為歷史或與現行決策矛盾。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DOCS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-40 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | BOOKING execution log 最新記錄停於 2026-08-23，後續動態狀態不能由此文件確認。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INTEGRATION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-41 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | Calendar 非建檔測試以共享患者全集為空作斷言，隔離契約不足。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-TESTS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-43 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 多處 UTC timestamp validation 仍使用 endsWith(Z) 與寬鬆 Date.parse，而 domain 已有嚴格共同 parser。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| K3 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 停用帳號驗證失敗與一般驗證失敗共用對外分類，細分分支可能無法由正常 SDK 路徑到達。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION | SAME_ROOT_CAUSE_SIBLING；source scope only |
| K8 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 患者回診既有預約的結束時間重複寫死時長而未引用唯一時段規則。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SCHEDULE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| K9 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 隔離測試 gate 以任意非空 emulator 設定替代環境約束，配置邊界仍需明確化。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INGRESS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| X-C03 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | trusted-html sanitizer 對 HTML navigation 語法的處理範圍需與 CSP 行為一併核對。 | SOL_PRIMARY_EXPERT_ONLY / SOL-HTML | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-03 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 候選提交不存在時的補取分支可能被原生命令錯誤政策提前中止。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RELEASE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-04 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 部署前登入網域檢查使用供應商後綴而非該次授權的精確主機集合。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INGRESS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-05 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 舊發布入口仍將可能混合訊息的部署輸出直接當作 JSON 解析。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RELEASE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-06 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 環境變數的秘密參照使用可漂移標籤，削弱同候選版本的重現性。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-08 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 供應鏈忽略清單的有限文字解析未明確拒絕不支援的設定格式。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SUPPLY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-09 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 架構掃描將目錄讀取失敗折疊為沒有待掃描檔案。 | SOL_PRIMARY_EXPERT_ONLY / SOL-ARCH-GATE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-10 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | CSS 雜湊產出沒有同步處理 CSS 內的依賴參照。 | SOL_PRIMARY_EXPERT_ONLY / SOL-BUILD | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-07 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 期限的多份常數與未用變數增加維護成本，但核准期限本身不是錯誤。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RELEASE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-13 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 續期腳本區域變數名稱與 PowerShell 自動變數相同，易混淆比對狀態。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RELEASE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-14 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 登入網域來源檢查以子字串存在推斷驗證邏輯，未證明語意。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INGRESS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-15 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 日誌遮蔽依賴名稱正則而非契約秘密分類，存在漏接。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONFIG | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-16 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 路由真值模組匯出控制器集合，分類卻另外列舉名稱。 | SOL_PRIMARY_EXPERT_ONLY / SOL-ROUTE-INVENTORY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-17 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | C6 證據組裝只表達部分路由條件，與完整路由 blocker 範圍不同。 | SOL_PRIMARY_EXPERT_ONLY / SOL-ROUTE-INVENTORY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-18 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 預算證據以清單第一筆代替授權目標身份選取。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RUNTIME-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-19 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 負向斷言太弱（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-20 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 架構註解剝除器將 JavaScript regex literal 的註解符號當成註解起點。 | SOL_PRIMARY_EXPERT_ONLY / SOL-ARCH-GATE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-21 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 分支保護檢查的網路請求未設定明確逾時與可控失敗分類。 | SOL_PRIMARY_EXPERT_ONLY / SOL-GOVERNANCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-22 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 設計 token gate 的解析與 ratchet 計數存在原報所指的規則/分支一致性疑點。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DESIGN-GATE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-23 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 文件連結檢查以執行時工作目錄尋找 repository 檔案，且 UTF-8 讀取錯誤未作逐檔處置。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DOC-GATE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-24 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Identity configurator 的 fetch request 未明確配置有限逾時。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-25 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 治理 waiver 欄位與有效性檢查未完整覆蓋登錄契約所需條件。 | SOL_PRIMARY_EXPERT_ONLY / SOL-GOVERNANCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-26 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 合成 C1 smoke evaluator 將預算金額固定於程式字面值，未完全追隨其建議來源。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RUNTIME-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-27 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | perf budget 註解／誤標錯誤（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-28 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 可測試的 build planning 函式與模組載入時 I/O/決策狀態耦合。 | SOL_PRIMARY_EXPERT_ONLY / SOL-BUILD | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-29 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | public-pages 重複檢查（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-30 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 結構 gate 清單未明確列入全部 Dockerfile，且 import 會執行大量 I/O。 | SOL_PRIMARY_EXPERT_ONLY / SOL-STRUCTURE-GATE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-31 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 追蹤檔掃描以 git ls-files 依目前工作目錄取得清單，可能因子目錄啟動造成掃描範圍改變。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SECRETS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-32 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 品牌與診所素材產生器依賴瀏覽器影像編碼，缺少穩定編碼基準及失敗時關閉瀏覽器保證。 | SOL_PRIMARY_EXPERT_ONLY / SOL-ASSET-BUILD | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-33 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | check-web-ui 註解過時（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-34 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 跨腳本重複實作（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E1-35 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | grep 當政策測試脆弱（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-01 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 多個外部 fetch 未設應用層期限，可能令 CLI 等待遠端回應超出所需時間。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | SAME_ROOT_CAUSE_SIBLING；source scope only |
| E2-02 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 證據輸出目錄可由環境變數指定，寫入前未限制在預期工作區。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RUNTIME-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-03 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 子程序啟動錯誤採未捕捉 throw，而正常 close 才設定明確退出碼。 | LUNA_READY / LUNA-FIRESTORE-RUNNER | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-04 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | CLI 探測以 POSIX PATH 分隔符和檔名存在檢查，Windows PATH/PATHEXT 可能未被正確辨識。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CLI | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-05 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 部分 CLI 模組以字面 file URL 比較推斷直接執行，對 Windows 路徑形式較脆弱。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CLI | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-06 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Playwright 證據合併依賴輸入路徑語意，原報指出未先正規化。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RUNTIME-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-07 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 舊 snapshot runner 將命令字串拆分後交 shell，參數含空白或 quoting 時容易改變執行語意。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CLI | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-08 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 合成資料遷移工具的核准期限為原始固定常數，後續執行資格需與現行 authority 核對。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAC-LIFECYCLE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-09 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 多個檢查/工具內固定隔離環境識別值，容易與不同範圍的 project identity 混用。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CONFIG | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-10 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | Stage E 證據 --out 直接接受任意輸出路徑，未經 repository/workspace containment policy 驗證。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RUNTIME-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-11 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | inspect／plan 樣板重複（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E2-12 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | SBOM licence review 對缺少根專案描述或 metadata 的輸入需明確 fail closed。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SUPPLY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-05 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 現行用途資料清冊仍使用舊集合與欄位前提描述已演進的隔離測試資料邊界。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-08 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 未標停用的匯入手冊仍把受禁的真實資料讀取與長期金鑰準備描述成操作流程。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-09 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 日曆指引未區分本機相容憑證模式與現行雲端無金鑰身分模式。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-10 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | API 現行人類路由表未涵蓋已註冊的完整受控介面。 | SOL_PRIMARY_EXPERT_ONLY / SOL-ROUTE-INVENTORY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-11 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 品質文件現況文字與例外治理及來源證明規則衝突。 | SOL_PRIMARY_EXPERT_ONLY / SOL-GOVERNANCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-12 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 自稱現行的 gate 敘事仍使用被新 Canon 分層取代的未實作與未授權概括。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INTEGRATION | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-13 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 架構計畫仍把早期無後端前提描述為現況而未限定歷史範圍。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DOCS | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-14 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | UI 規則、導覽文件與機械閘門指向不同現行視覺基線。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DESIGN-GATE | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-15 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 取消文件保留待櫃台確認狀態而受控命令直接完成取消。 | SOL_PRIMARY_EXPERT_ONLY / SOL-LIFECYCLE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-16 | Medium | NOT_A_BUG_SOURCE_SCOPE | AVAILABLE_RECORDED_SOURCE | ADR 的延續與局部修訂不能誤標為整份架構邊界已廢止。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-17 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | RBAC 文件把已用於受控組裝的 evaluator 仍描述為完全未 routed。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RBAC | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-02 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 明列現行 gate 的 dashboard 仍停留早期盤點。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INTEGRATION | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E4-09 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 角色別名仍依尚未獲明文解答的職務等同假設映射。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RBAC | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-20 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 資安草稿未決 C0 與未有實作敘事未對帳後續權威。 | SOL_PRIMARY_EXPERT_ONLY / SOL-GOVERNANCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-24 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 驗收工作表仍以舊標頭限制描述已由 owner 放寬的重新驗證邊界。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION-DOCS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-25 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 商務計畫對資訊收錄與匯出格式有未分層矛盾文字。 | SOL_PRIMARY_EXPERT_ONLY / SOL-BUSINESS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-31 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 整合計畫現況數值與權限文字未標早期快照邊界。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DOCS | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-32 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | E2E 人類表格未列完整機械分組。 | LUNA_READY / LUNA-E2E-INVENTORY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-34 | Low | NOT_A_BUG_SOURCE_SCOPE | AVAILABLE_RECORDED_SOURCE | 備份 runbook 已涵蓋原行聲稱缺少的機制且未當成實測。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-23 | Low | NOT_A_BUG_SOURCE_SCOPE | AVAILABLE_RECORDED_SOURCE | 視覺 manifest 包含提交標記是核准非自我引用綁定而非待補佔位。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-18 | Medium | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 「未合併」殘句與矩陣矛盾（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-04 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | F-07 判 RUNTIME_PROVEN 但本機 store／吞錯仍在 | SOL_PRIMARY_EXPERT_ONLY / SOL-INTEGRATION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-05 | Medium | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 完整性輸出與舊 FAIL 位元組相同；產物遺失（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-06 | Medium | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 都自稱現行，與 cp01 不一致（不是 E4-26）（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-07 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 仍查 `/`，實際 302→`/clinic` | SOL_PRIMARY_EXPERT_ONLY / SOL-RUNTIME-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-11 | Medium | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 真實日曆內容外洩到代理輸出之紀錄（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-21 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | C1～C6 本機執行包重跑會失敗（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-22 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 引用不存在路徑／章節（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-23 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 格式缺陷與排序錯亂（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-26 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 文件仍依私有 repo 前提；本機路徑外露（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-27 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 文件膨脹／overlay／模型名不一致（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-28 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 期限已過未標／即將到期（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-29 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | Firebase 登入清單指令衝突（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-30 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | Stage F 範本漏第三個 Cloud Run（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-33 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | ADR／設計小過時（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-35 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | CAL-PILOT 手冊停 08-31 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION-DOCS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-36 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 計畫無結案追蹤（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-37 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 入口與範本小過時（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-13 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 委派 lockout 仍 InMemory 未接線 | SOL_PRIMARY_EXPERT_ONLY / SOL-INTEGRATION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-14 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | accountActive 寫死；limiter Optional | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-15 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | DATA-R03 仍 OPEN | SOL_PRIMARY_EXPERT_ONLY / SOL-CONTRACTS | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-16 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 完整性錨失效（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-17 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 檔內自相矛盾（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-18 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | review 互相矛盾未標（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-19 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | DATA-001 修正殘留旁路（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-20 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | Trusted Types 後續未做；codeql.yml 過時（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-21 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | outbox 完成後仍留 leaseOwner 未處理 | SOL_PRIMARY_EXPERT_ONLY / SOL-OUTBOX | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-22 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 數字小誤（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-25 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 過時內容未標（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E4-26 | Low | CANDIDATE | PROVENANCE_CLOSED_WITH_GAP | 歸檔成本過高（候選來源已列；原claim仍有歧義，不以同類程式代替原finding）。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CUSTODY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-01 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 歷史視覺證據影像占用較大儲存空間，是否可外置仍受保存與可追溯性要求限制。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-02 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 已知 manifest 影像有相同雜湊群組，需逐組確認其引用與保留價值。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-03 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 出貨資產尺寸須按現行預算判斷，不能由歷史截圖大小推定超標。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-04 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 來源素材與出貨產物是否應保留須依建置與授權需求界定。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-05 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 一項影像命中 XMP 標記；未讀 metadata 值，需先確認範圍及移除風險。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-06 | Low | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 合成帳密 claim 涉及影像內容，未檢視畫面或重印其值。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-07 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | manifest 可列出未在所抽樣目前文件中找到文字引用的影像，不能因此斷定無用。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-08 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 完整性掃描未見缺失圖片連結，仍需對應原 claim 範圍。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-09 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | PNG 結構可解壓不等同全部格式解碼或視覺相符。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E5-10 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 結構閘門目前釘住 cp01 manifest；完整視覺基線涵蓋範圍需另定。 | SOL_PRIMARY_EXPERT_ONLY / SOL-VISUAL-EVIDENCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| K1 | High | NOT_A_BUG | AVAILABLE_RECORDED_SOURCE | 回診限流鍵把非信任查詢變量混入，無法穩定約束同一呼叫來源。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | SAME_ROOT_CAUSE_SIBLING；source scope only |
| K2 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 未核實的 intake 解析可賦予 patient 身分，且失敗預約可能留下無關 patient 記錄。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IDENTITY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| K4 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 限流文件鍵截斷可能碰撞，另缺期限清除及爭用回應契約。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RETURN | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| K5 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 全域例外處理的生命週期依附限期試行模組。 | SOL_PRIMARY_EXPERT_ONLY / SOL-HTTP | SAME_ROOT_CAUSE_SIBLING；source scope only |
| K6 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 來源 IP 限流未明確定義 IPv6 前綴的等價邊界。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INGRESS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| K7 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 內部預約列表使用固定上限且缺可辨識的截斷與續讀語義。 | SOL_PRIMARY_EXPERT_ONLY / SOL-LIST | SAME_ROOT_CAUSE_SIBLING；source scope only |
| A01 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 非法 booking 路徑 ID 的驗證使用一般例外，可能錯誤映射成 5xx。 | SOL_PRIMARY_EXPERT_ONLY / SOL-HTTP | SAME_ROOT_CAUSE_SIBLING；source scope only |
| A02 | High | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 公開時段讀取與班表發布缺有界集合處理，成本與交易容量未完整收斂。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SCHEDULE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| A05 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 回診會話期限以字串儲存，與原生 TTL 型別要求不一致。 | SOL_PRIMARY_EXPERT_ONLY / SOL-TTL | SAME_ROOT_CAUSE_SIBLING；source scope only |
| A09 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 匯出單一交易讀取全部區間資料，缺可證明的資源界限。 | SOL_PRIMARY_EXPERT_ONLY / SOL-EXPORT | SAME_ROOT_CAUSE_SIBLING；source scope only |
| A11 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | Calendar 路徑 ID 的一般例外與 booking 路徑共用同一 5xx 映射缺口。 | SOL_PRIMARY_EXPERT_ONLY / SOL-HTTP | SAME_ROOT_CAUSE_SIBLING；source scope only |
| A12 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | operational readiness 預設來源未量測真實相依健康，回應另暴露內部 gate 狀態。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-01 | High | LIKELY | AVAILABLE_RECORDED_SOURCE | 部署 CI principal 的專案 IAM 管理權超出建置部署所需邊界。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-02 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | WIF 信任條件未完整釘住不可變的 repository/owner 身分及允許 ref。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-03 | High | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 公開 ingress 與 proxy header 信任邊界未有足夠部署證明。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INGRESS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-04 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 限流狀態集合缺原生期限清除的單一設定權威。 | SOL_PRIMARY_EXPERT_ONLY / SOL-TTL | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-05 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | Terraform mock tests 未納入 required CI，IaC 斷言只能靠人工執行。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CI-IAC | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-06 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 告警 operation 標籤與應用實際輸出的值不一致。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-07 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 交易與備份告警的碼/方法來源不一致，可能漏報或把排程事件當失敗。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-08 | Medium | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | Pub/Sub 通知身分與 delivery IAM 的正確性尚待 provider 確認。 | SOL_PRIMARY_EXPERT_ONLY / SOL-NOTIFICATION | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-09 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 試行部署依賴長期服務帳號金鑰及偏大的 Auth 管理權。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-12 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | README 描述的儲存/欄位範圍未對齊現行 server 模式與最小 intake。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DOCS | GOVERNANCE_METADATA_EXTENSION；source scope only |
| B-13 | Medium | LIKELY | AVAILABLE_RECORDED_SOURCE | 工作區與 cloud build 排除規則未完整涵蓋憑證檔類型。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SECRETS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-21 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 追蹤設定/文件含不必要的環境或個人識別值，公開匯出需去識別。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-31 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | agent 的檔案拒絕規則未涵蓋所有 env 與金鑰目錄變體。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SECRETS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-41 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | IaC mock tests 缺 ingress、公眾principal及危險角色的安全負向斷言。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-48 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 依賴例外具有期限，但缺可在到期前完成的修復/退出處置。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SUPPLY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| B-52 | Low | NOT_A_BUG | AVAILABLE_RECORDED_SOURCE | Firestore TTL 的 JSON 與 Terraform 管理面未明確收斂為單一權威。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-54 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 告警規格在多份配置各自維護，缺同一日誌 fixture 的語義驗證。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| B-55 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 金鑰目錄的版本控制排除缺口尚未與補償控制形成一致規格。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SECRETS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| C01 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | server 模式仍顯示資料僅存在本機的過時說明。 | SOL_PRIMARY_EXPERT_ONLY / LUNA-WORKBENCH-START | SAME_ROOT_CAUSE_SIBLING；source scope only |
| C02 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 工作臺從本機帳戶資料顯示員工身分，而非伺服器確認的 actor。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION | SAME_ROOT_CAUSE_SIBLING；source scope only |
| C04 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 預約列表讀取錯誤被轉成空列表，掩蓋載入失敗。 | SOL_PRIMARY_EXPERT_ONLY / SOL-READ-FAILURE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| C05 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 專案 README 仍把已有 API 的模式描述成不連線。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DOCS | GOVERNANCE_METADATA_EXTENSION；source scope only |
| C07 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | UI 將受上限限制的清單數量顯示為完整總數。 | SOL_PRIMARY_EXPERT_ONLY / SOL-LIST | SAME_ROOT_CAUSE_SIBLING；source scope only |
| X-C01 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 時段 API 失敗時患者頁仍可能顯示載入成功。 | SOL_PRIMARY_EXPERT_ONLY / SOL-READ-FAILURE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| X-C02 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 本機儲存的 CSRF 被視為已登入，沒有重新核實 server 會話。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION | SAME_ROOT_CAUSE_SIBLING；source scope only |
| X-C04 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | Calendar 操作失敗後按鈕缺統一的恢復狀態處理。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION-UI | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| X-C05 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 工作臺週曆使用最早預約作錨點，與清單當日預設不一致。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION-UI | SAME_ROOT_CAUSE_SIBLING；source scope only |
| X-C06 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 預覽主機判定僅排除特定主站，未定義所有主域與核准預覽的安全邊界。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INGRESS | SAME_ROOT_CAUSE_SIBLING；source scope only |
| X-C07 | Low | ALREADY_FIXED_SOURCE_ONLY | AVAILABLE_RECORDED_SOURCE | 舊報告稱回診上下文沒有清除，但現行修復已有明確隔離與延遲結果失效。 | SOL_PRIMARY_EXPERT_ONLY / NO-WORK | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-01 | Medium | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 正式 Calendar 重建遇衝突後未明確還原已取消事件的狀態。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-RESTORE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| D-02 | Medium | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 試行 Calendar 還原也缺已取消事件狀態的明確恢復。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-RESTORE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| D-03 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 固定識別碼的 smoke 測試可能把既存事件衝突當成有效寫入證明。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-RESTORE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| D-05 | Medium | NEEDS_RUNTIME_REPRODUCTION | AVAILABLE_RECORDED_SOURCE | 同步整輪使用同一時間快照而未完整涵蓋長輪次 lease 更新。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-LEASE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-07 | High | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 班表引用的開放狀態集合與 domain 佔用狀態不一致。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SCHEDULE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| D-08 | High | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 回診 lookup 識別鍵缺具金鑰的隱私保護，並牽涉既有鍵的相容性。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RETURN | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| D-12 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 日曆來源切換缺有界搬移與足夠 lease 容量證明。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-LEASE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| D-25 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 未探測的 operational 相依狀態仍可能被評成健康。 | SOL_PRIMARY_EXPERT_ONLY / SOL-OBSERVABILITY | SAME_ROOT_CAUSE_SIBLING；source scope only |
| D-38 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 現行文件中的會話期限與實作不一致，既有重新驗證不可被省略。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION-DOCS | GOVERNANCE_METADATA_EXTENSION；source scope only |
| D-42 | Low | LIKELY | AVAILABLE_RECORDED_SOURCE | 班表發布缺已報到/過去未結及 Calendar 還原的負向整合回歸。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SCHEDULE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| E1-01 | High | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 回滾腳本未明確阻斷每一原生命令失敗，可能輸出不實完成訊息。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RELEASE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| E1-02 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 原生命令錯誤語義依賴 PowerShell 版本，但入口未明確阻斷不相容版本。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RELEASE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| E1-11 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 建置腳本未保證原生命令失敗時中止後續步驟。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RELEASE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| E1-12 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | release 的長期金鑰與清理流程缺可證明的全路徑退出契約。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | SAME_ROOT_CAUSE_SIBLING；source scope only |
| E3-01 | High | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 治理材料包含非必要個人聯絡識別，公開材料去識別需明確權威。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-02 | High | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 隱私草稿描述的 intake 欄位與現行頁面/核定最小化範圍不一致。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-03 | High | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 隱私揭露與 Calendar 投影實際使用的資料欄位不一致。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-04 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 現行治理材料及對應 gate 的欄位敘述未完整跟隨已核定 intake 最小化。 | SOL_PRIMARY_EXPERT_ONLY / SOL-DOCS | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-06 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 生效文件仍記錄過時的會話時限。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION-DOCS | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E3-07 | Medium | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | runbook 要求先開維護模式，但維護 gate 尚非 routed control。 | SOL_PRIMARY_EXPERT_ONLY / SOL-MAINTENANCE | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| E3-19 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 限流文件缺同一身分的完整速率參數。 | SOL_PRIMARY_EXPERT_ONLY / SOL-RETURN | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E4-01 | High | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 限流/防枚舉證據曾將局部通過視為完整安全邊界成立。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INTEGRATION | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E4-03 | High | CANDIDATE | AVAILABLE_RECORDED_SOURCE | AUD-01 身分一致性來源/修復證據需要保留可核對的關帳鏈。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INTEGRATION | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E4-08 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 供應鏈稽核項目的期限與現行依賴狀態缺完整關帳證據。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SUPPLY | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E4-10 | Medium | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 個人聯絡識別的公開材料問題需以去識別證據關帳，而非重貼原值。 | SOL_PRIMARY_EXPERT_ONLY / SOL-PRIVACY | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E4-12 | Low | CANDIDATE | AVAILABLE_RECORDED_SOURCE | 歷史 PASS 的 scope/版本限制缺必要更正，可能被當成現行綠燈。 | SOL_PRIMARY_EXPERT_ONLY / SOL-INTEGRATION | GOVERNANCE_METADATA_EXTENSION；source scope only |
| E4-24 | Low | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 文件以分頁稱呼固定上限清單，超出現行 API/UI 契約。 | SOL_PRIMARY_EXPERT_ONLY / SOL-LIST | GOVERNANCE_METADATA_EXTENSION；source scope only |
| NEW-01 | UNKNOWN | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 合法非staff Firebase token 的UID未經patient record/binding核實即具patient身分。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IDENTITY | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| NEW-02 | UNKNOWN | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | staff Bearer與cookie入口使用不同server-session/CSRF生命週期。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| NEW-03 | UNKNOWN | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | 角色allowlist重疊時優先選manager，缺fail-closed配置不變量。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| NEW-04 | UNKNOWN | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | malformed session cookie 的decode例外未作authentication failure處理。 | SOL_PRIMARY_EXPERT_ONLY / SOL-HTTP | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| NEW-05 | UNKNOWN | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | return-session header缺opaque ID界限，錯誤會傳至資料路徑解析。 | SOL_PRIMARY_EXPERT_ONLY / SOL-TTL | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| NEW-06 | UNKNOWN | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | export GET在組檔成功後、HTTP交付前消耗下載額度並記錄downloaded。 | SOL_PRIMARY_EXPERT_ONLY / SOL-EXPORT | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| NEW-07 | UNKNOWN | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | staff protected request 每次touch lastSeenAt，缺有界寫入頻率。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| NEW-08 | UNKNOWN | CONFIRMED_CODE_FACT | AVAILABLE_RECORDED_SOURCE | session creation入口未設定自身 per-IP/per-account abuse boundary。 | SOL_PRIMARY_EXPERT_ONLY / SOL-SESSION | CUSTODY_LIMITED_AMBIGUOUS；source scope only |
| NEW-09 | UNKNOWN | LIKELY | AVAILABLE_RECORDED_SOURCE | Calendar 單頁交易的byte/time資源envelope尚未量測，與舊D-11同根；不是已證實超限。 | SOL_PRIMARY_EXPERT_ONLY / SOL-CALENDAR-ENVELOPE | SAME_ROOT_CAUSE_SIBLING；source scope only |
| NEW-10 | UNKNOWN | LIKELY | AVAILABLE_RECORDED_SOURCE | project-wide Storage grants需分離已覆蓋的CI principal與builder bucket範圍候選。 | SOL_PRIMARY_EXPERT_ONLY / SOL-IAM | SAME_ROOT_CAUSE_SIBLING；source scope only |

## Provenance/finding終局分離

31/31閉為PROVENANCE_CLOSED_WITH_GAP，available current-source candidate不得冒充缺失original claim；缺失資料不再是普通owner索取blocker。E4-11不補payload/PII。詳細缺失種類在frozen row與active overlay交叉保存。

## 真正owner與operation分型

A05保存/清除期限與E4-09職務Q1為兩個current finding-policy blockers。IPv6不新增subnet policy、strict-body分頁、返還clock、readiness契約與C4/CP01scope已由Sol定界。真實provider、IAM/secret、migration與protected merge需fresh authority，但不偽裝為工程未定。

## Actor/驗收界線

3 Luna-ready packet無Sol shared-core lease；workbench-start只LUNA_AFTER_SOL、read errors為Sol。全child最多2，parent不平行。每列正負回歸、write-set、owner/runtime boundary與DoD見machine；沒有本輪implementation或production授權。
