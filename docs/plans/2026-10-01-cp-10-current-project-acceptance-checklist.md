# CP-10 現有專案業主驗收清單（2026-10-01）

**狀態：** `BLOCKED / NOT_SIGNED`。這份表是待填核對清單，沒有完成 runtime 驗收、商務文件同步、付款驗收或業主簽署。
**範圍：** C1 隔離合成環境；不是 production、真實病患資料授權或正式上線核准。
**依據：** [現有專案驗收矩陣](2026-09-22-current-project-acceptance-matrix.md)、[CP-08 回歸 worksheet](2026-10-01-cp-08-regression-evidence-worksheet.md)、`BD-POLICY-2026-09-29`、`OWNER-BATCH-2026-09-29B`。

## 驗收識別資料

| 欄位 | 驗收前填寫 |
| --- | --- |
| source SHA（L2b～L6 source 與 CP-03～CP-07 相依變更都合併後；可包含本清單文件 commit） | `<待填；文件 commit 單獨不構成部署授權>` |
| API / worker artifact digest 與 revision | `<待實際 readback>` |
| Hosting version / channel / expiry | `<待實際 readback>` |
| project / database / scope | C1 isolated synthetic；部署 packet 的實際 readback 待填 |
| policy version / approved crosswalk | `BD-POLICY-2026-09-29` 暫列；CP-09 商務差異解決前不可標為 current Drive 對齊 |
| CP-08 evidence set / release manifest | `<NOT_RUN>` |
| 驗收日期（UTC） | `<待填>` |

## 工程交付驗收

每項只可填 `PASS`、`FAIL`、`NOT_RUN` 或具 owner 決定依據的 `NOT_APPLICABLE`。`PASS` 須指向同一 release、可讀取的證據；來源合併、CI 或本清單本身不能取代 C1 runtime 或人證。

| ID | 業主應檢查 | 通過條件 | 狀態 | 證據／issue ref |
| --- | --- | --- | --- | --- |
| A-01 | 發佈版本與授權範圍 | exact source SHA、API/worker digest、Hosting version、C1 project/database、政策版本和 owner 核准時窗一致；只用合成資料 | NOT_RUN | — |
| A-02 | CP-08 全系統回歸 | 84 個目前適用 matrix rows 有同 release 的逐列結果與證據；無 mandatory FAIL；人工 reauth 與 human AT 均完成；BKG-06 N/A 僅沿用既有 owner 決定 | NOT_RUN | — |
| A-03 | 新預約及 Workbench 操作 | 業主觀察新預約、回診、預約列表及狀態更新；新欄位和敏感資料最小化 assertion 均通過 | NOT_RUN | — |
| A-04 | CP-03 月用量與里程碑 | 成功事件與服務端 receipt 對得上；缺漏/重播/負向情境安全；Workbench 顯示與人確認流程可用；無自動認定付款 | NOT_RUN | L3 UI candidate `48e35ffe…`; timezone gate passed, independent review/exact CI/merge/runtime pending |
| A-05 | CP-04 CSV 匯出 | 業主在 Workbench 經核准權限與 fresh reauth 匯出合成 CSV；欄位/期間正確、中文可讀、拒絕過期／跨 scope／未授權請求 | NOT_RUN | L3 UI candidate `48e35ffe…`; timezone gate passed, independent review/exact CI/merge/runtime pending |
| A-06 | CP-05 封存與資料權限 | 封存、復原、legal hold、到期判斷、永久刪除負向條件皆有逐層結果；備份尚在保存期時不宣稱已徹底刪除。現行 API 沒有 preview/fingerprint endpoint；不得以不存在的預覽畫面或 hash-bound 確認宣稱驗收完成 | NOT_RUN | — |
| A-07 | Google 真實 restore（CP-06-E） | 在獨立核准的 C1 演練資源中 restore 到新 database，資料與 audit/idempotency 抽查一致、RPO/RTO 實測、隔離與清理有證據；原 database 未覆蓋 | NOT_RUN | — |
| A-08 | 合作終止與返還收據 | merged release 具 CP-07 case；通知期 30 日屆滿後記錄資料返還 receipt，receipt 後另保留 30 日；缺 receipt/steps 或期限未到時 close 拒絕（預期 409）；期滿且條件齊全 close 只進 `manual_close_review`，不可當日正向結案。每個 POST 均以操作者 fresh Google＋TOTP 通過。人工 backup/audit/access receipts 只是聲明，不是雲端刪除或權限撤銷證據；不執行真實停診 | NOT_RUN | PR #213 head `7397f8e…` CI787 12/12 ready for review, but not merged/deployed or in current baseline |
| A-09 | 繁中管理手冊盲走與截圖 | 管理者按手冊盲走登入、預約、月報／里程碑、CSV、archive/restore/legal hold/delete 與終止流程；只用 fresh synthetic captures，無 PII/secret | NOT_RUN | L3 UI candidate `48e35ffe…` has timezone gate passed; independent review/exact CI/merge/C1 runtime and screenshots pending |
| A-10 | Drive 00～08 文件與規則 crosswalk | owner 已解決 CP-09 中 00 index 與 repo policy 的價格／分期／試用與調整期差異；逐份 remote file readback 和本地/執行行為一致 | BLOCKED — owner reconciliation | sanitized CP-09 discrepancy; private source details remain outside repo |
| A-11 | AWS 與官網範圍 | 確認 AWS/網站排序仍在本次 CURRENT_PROJECT_ACCEPTANCE 之後；不以尚未做 AWS/網站阻擋本 gate，也不宣稱已建置 | RECORDED — 範圍聲明，無 runtime PASS | `CURRENT-PROJECT-SEQUENCE-2026-09-22` |

## 測試期、調整期與付款驗收（彼此分開）

本地 `BD-POLICY-2026-09-29` 記錄的工程測試期是 **20 個台北日曆天（含起算當天）＋最多 10 天調整**；起算點是第一位真實員工登入當天，測試／維護帳號不啟動。此期間不是付款里程碑。現有 C1 synthetic 工程驗收不會啟動這個期間。

尾款／正式付款確認是獨立條件：只有正式開放真實資料營運後滿 **一個真正日曆月**，並由診所負責人確認，才可完成本地 policy 所記錄的尾款 gate；日期或 synthetic event 不可代替。`CURRENT_PROJECT_ACCEPTANCE` 本身不包含這個真實營運月，也不能自動計費或標記已付款。

目前 fresh CP-09 文件 readback 的 00 index 與本地記錄在總價／分期金額及測試、調整期間存在差異。差異只用上述去識別摘要登錄；在 owner 對正式條款作出明確決定前，保留本地 policy 原值作為已核准記錄，不覆寫、不選新值、不對外承諾，並將 `DOC-01`、`USE-04`、`MILE-03` 及此清單 A-10 保持 `BLOCKED`。需另將已核准 policy crosswalk 綁定 C1 runtime 與正式付款期限；本清單不能代替 owner 決策。

| Acceptance | 要求 | 狀態 | Owner 證據 ref／日期 |
| --- | --- | --- | --- |
| Engineering current-project acceptance | 同一 C1 synthetic release 的 CP-08 通過；必要 CP-06-E 真 restore 完成；CP-09 文件 reconciliation 完成；無未解重大缺陷 | NOT_RUN / BLOCKED | — |
| Trial / tuning period | 本地暫記 20 台北日曆天＋最多 10 天調整；以第一位真實員工登入才起算，並先解決 remote/local policy 差異 | BLOCKED | — |
| True-calendar-month payment | 真實營運開始後完整一個日曆月＋診所負責人明確確認；完全獨立於工程驗收 | NOT_STARTED | — |

## 業主驗收簽署（留白）

簽署只在所有相應 gate 的可訪問證據齊備、CP-09 商務條款決議完成後進行。此文件沒有代簽，也不包含 credential 交接。

| 欄位 | 業主填寫 |
| --- | --- |
| 決議 | `<ACCEPT / REJECT / DEFER>` |
| 核准 source SHA / release manifest ref | `<待填>` |
| 未結缺陷／延期項及 owner | `<待填；無則寫「無」>` |
| 診所負責人姓名／簽名 | `<留白>` |
| 簽署日期（Asia/Taipei） | `<留白>` |
| 私下 credential custody receipt（不含秘密） | `<另行安全保存；不寫入公開 repo>` |

**目前結果：** `BLOCKED / NOT_SIGNED`。未完成CP-08、CP-06-E、CP-09 reconciliation 或 owner signature 前，`CURRENT_PROJECT_ACCEPTANCE` / `GATE-02` 維持 `BLOCKED`；CP-06-E 依 owner batch 可列為 test-delivery 後 tuning，但仍是最終現有專案 acceptance 的前置。
