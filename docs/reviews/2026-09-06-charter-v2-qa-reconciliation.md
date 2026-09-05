# 章程 v2.0 Q1–Q22 對帳紀錄（T0-REG-01）

**狀態：** dated 對帳。把章程 Q1–Q22 記成 Recorded Owner Input 與
synthetic／staging 施工方向。**不是** Canon、**不是** D-series 核准、
**不是**部署授權。本文件不改變任何 `pending`→`approved`。
**日期：** 2026-09-06（Asia/Taipei）
**Source 基準：** `origin/main` `9e1be1a34a67161fdb9d820211138a2647d3d8cd`
**章程來源：** 《企業級專案章程暨 7 日交付計畫 v2.0》（2026-09-02），
業主 2026-09-03 簽署 Q1–Q22；Production 不包含在本週承諾。
**FROZEN 計畫：** `VERIFIED_STAGING_EXECUTION_PLAN_v1.3_FROZEN.md` §11
T0-REG-01 契約。
**本文件不得引用自己的 commit hash。** 查本檔提交：`git log --
docs/reviews/2026-09-06-charter-v2-qa-reconciliation.md`

前置文件：
[Day 1 scope lock](2026-09-03-day1-scope-lock-and-auth-incident.md)、
[Function Inventory](2026-09-03-function-inventory-and-acceptance-matrix.md)。

## 0. 一句話

22 題全部記為 owner input；D-004／D-005／D-011（含其餘 D 系列）狀態不變。
兩處取代（supersession）已標出：Q5 答案 A 取代 §16 建議包的 B；
Q12「不自動限制」取代 2026-08-16「累積 3 次限制」方向。
Q15 只記需求，不授權寫入。產品程式變更：**NONE**。

## 1. Q→D 對帳

`狀態` 欄一律是登錄現值（本文件未改）；`本輪記錄` 是 input／synthetic 方向。

| Q | D 系列 | 本輪記錄 | 狀態（不變） |
| --- | --- | --- | --- |
| Q1 功能完成＋staging 驗收；production 另 gate | 流程 | VERIFIED STAGING 為本週終點 | — |
| Q2 Google 為主＋local 備援，兩者 MFA | D-006 | 已核准策略的實作方向；local 真 IdP 仍缺 | approved（實作證據 pending） |
| Q3 bug 網址（CAL-PILOT staging） | — | 重現輸入；合成流量，不記憑證 | — |
| Q4 入口分離，staff 優先 `/staff` | D-011 | synthetic UI 方向；`/` 改 redirect 是另一切片 | pending |
| Q5 **A 立刻取消**並釋放時段 | D-005 | 取代 PEA R-P0-2 的 `request_cancellation` 建議；見 §2.1 | pending |
| Q6 自助截止＝預約當日 10:00，逾時改電話 | D-005 | 與 2026-08-16 取代方向一致 | pending |
| Q7 開放改期；先佔新時段再釋放舊 | D-005／D-004 | 患者改期流方向（T1-BOOK-04） | pending |
| Q8 horizon 往後 1 個月 | D-004 | 與 2026-08-16 方向一致 | pending |
| Q9 capacity 每時段 1 位 | D-004 | 與 2026-08-16 方向一致 | pending |
| Q10 醫美暫時移出 booking | D-004 | 單一 catalogue 方向（T1-BOOK-02） | pending |
| Q11 上限 2 筆未完成；證件只作來源，原文不暴露 | D-004＋D-001～D-003 | 向後相容方向（T1-BOOK-03）；真實證件儲存未核准，見 §2.4 | pending |
| Q12 **先不做**自動限制；只記錄 no-show 次數 | D-005 | 取代 2026-08-16 三次限制方向；見 §2.2 | pending |
| Q13 retention 延後，待法務／隱私確認 | D-002 | 不自訂 production retention | pending |
| Q14 正式 privacy email＋電話 | D-001／D-003 | 仍缺隱私／法務 owner 與實際信箱 | pending |
| Q15 正式 Calendar 未必只最小欄位，但**本週不授權寫入** | D-009 | 僅記需求；最小欄位邊界不變，見 §2.3 | pending（synthetic 子範圍除外） |
| Q16 inbound 先成待確認，審核後才寫回 | D-016 | 與既有 review-candidate 方向一致 | pending（synthetic 子範圍除外） |
| Q17 本週只做 synthetic 模組，不啟真臨床 | D-014 | 真臨床 BLOCKED | pending |
| Q18 本週只做 synthetic／staging，不真入帳 | D-015／D-008 | 真金流 BLOCKED | pending／deferred |
| Q19 休診預設不可排；admin 明確 override＋理由＋audit | D-004 | RBAC＋audit 方向（synthetic） | pending |
| Q20 缺 gate 不硬上 production | 流程 | RC 停在 VERIFIED STAGING | — |
| Q21 小 PR→CI 自主收斂 | 流程 | 不覆蓋 merge／deploy／路由 gate，見 §2.5 | — |
| Q22 新增非 P0 須交換 scope | 流程 | Scope Lock with Exchange | — |

## 2. Exact conflicts（隔離，不猜）

### 2.1 Q5 A vs 章程 §16 的 B

§16「建議一次核准方案」仍寫 Q5 選 B（取消申請）。
Q15 區的業主答案是 **A 立刻取消**，Day 1 scope lock §1.1 與
acceptance A-D3-01 亦為 A。**以 Q5 答案 A 為準**，§16 該行視為 stale，
後續 Day 3 施工（T1-BOOK-01）對齊 A：UI、domain、RBAC、測試同一語意。

### 2.2 Q12 vs 2026-08-16 三次限制

2026-08-16 方向：累積 3 次 no-show 限制未來線上預約。
本次 Q12：**先不要實作自動限制**；記錄次數但不自動限權益，
未來啟用需再核准規則與告知方式。**本次取代前者**，T1-BOOK-01 不得含
自動限制邏輯；限制时长、override、緊急處理維持未答。

### 2.3 Q15 只記需求

未來姓名／電話／病歷／麻醉／付款進 production Calendar 的需求，
與 Safety Floor 第 1、4 條、ADR-0002 最小欄位、CAL-PILOT
synthetic-only 核准衝突。**本週處置：需求輸入，不授權寫入、不改欄位、
不改 Safety Floor**；需 privacy／medical／finance review＋底線變更程序
另行核准。Inventory 2.6 `production Calendar PII` 維持
BLOCKED_BY_AUTHORITY。

### 2.4 Q11 證件識別的隱私邊界

「身分證／護照建立系統內穩定識別」在 D-001～D-003 pending 下，
**只允許 synthetic 設計**：雜湊（hash）／不可逆識別方向；
原文不得出現在一般 UI、URL、log、analytics、CI artifact
（acceptance A-D3-09）。真實證件儲存、比對規則定稿待隱私／法務核准。

### 2.5 Q21 不覆蓋的 gate

Q21 的自主範圍止於已授權技術迭代。以下不變：
merge 永遠先問；staging／production mutation 要 fresh 逐次授權；
`T1-API-01` 不得掛入 AppModule；被禁路由不為 smoke 提前接線；
CI 不 waiver、不降門檻。

## 3. Synthetic baseline（T0-REG-01 同步）

- cancel A（§2.1）
- 10:00 cutoff（Asia/Taipei）
- horizon 1 個月
- capacity 1
- active limit 2（向後相容，T1-BOOK-03）
- 醫美移出 booking catalogue
- no-show 只記錄（§2.2）

## 4. FROZEN queue 對位

| Q | 施工任務 |
| --- | --- |
| Q2／Q3／Q4 | T1-AUTH-01、T1-AUTH-02、T1-FD-01、T1-API-02 |
| Q5／Q6／Q12 | T1-BOOK-01（需 DATA-01 先行） |
| Q7 | T1-BOOK-04（需 BOOK-03＋DATA-02） |
| Q8／Q9／Q10 | T1-BOOK-02 |
| Q11 | T1-BOOK-03 |
| Q14／Q19 | T2-WB-01／02、T1-API-01（未路由） |
| Q15／Q16 | T1-PILOT-01、T1-ARC-01（synthetic 範圍） |

Day 3 施工前須有本對帳（已滿足）；但本對帳不是 Canon 重寫，
除非另有核准格式，D 狀態仍以登錄為準。

## 5. Verification

- 本文件：docs-only，產品 code diff **NONE**，rung **N/A**（文件變更）。
- Staging 部署狀態：沿用 Day 1 `DEPLOYED-NOT-SMOKED`，本輪未重測，
  不代為升級。
- Gates：`check:docs`、`check:format`（見本 PR／工作記錄）。
