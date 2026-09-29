# 商務交付未決政策封板（CP-POLICY，2026-09-29）

**狀態：** 業主（診所負責人）於 2026-09-29（Asia/Taipei）逐題回答，本文為紀錄。
**版本：** `BD-POLICY-2026-09-29`。更正或撤銷時另加日期條目，不覆寫本文。
**適用範圍：** C1 合成隔離環境（`beauessence-clinic-stg-c1a01`）的 CP-03～CP-07 source 與 runtime。
**不適用：** production、真實資料、正式上線。套用到 production 前仍需專業隱私／法律審閱，
且需另行明確授權；本紀錄不是雲端、部署、還原執行或資料刪除授權。

來源：[執行工作包 CP-POLICY](../plans/2026-09-22-current-project-execution-packets.md#cp-policy--bd-未決政策封板)
的六組缺口，以及測試期天數一題。已有答案直接引用、未重問：
價格與三期／維護金額、「完全未使用」＝無員工登入 AND 無病患完成預約（`COMMERCIAL-AUTHORITY-2026-09-22`）、
預約資料就診後保存 2 年且刪除由負責人並留紀錄（D-002）、RPO 1 小時／RTO 4 小時（D-010）、
員工工作階段閒置 30 分鐘／絕對 8 小時（D-006）、AWS 在 CURRENT_PROJECT_ACCEPTANCE 之後
（`CURRENT-PROJECT-SEQUENCE-2026-09-22`）、欄位最小化（`BOOKING-MINIMIZATION-2026-09-22`）。

## 1. 匯出（CP-04）

| 項目 | 核准值 |
| --- | --- |
| 允許角色 | 只限 `manager`（管理者）。`front_desk` 等其他角色一律拒絕 |
| 再驗證 | 匯出前重新 Google＋TOTP，有效 10 分鐘；逾時重做 |
| 接收方式 | 只在工作臺登入後下載；不寄 email、不產生對外分享連結 |
| 下載 TTL／次數 | 24 小時失效，最多 3 次；逾期或用完即拒 |
| 伺服器檔案保留 | 7 天後自動清除；清除失敗要留紀錄與告警，不當作已清除 |
| 欄位 | 現行預約表單欄位（姓名、電話、生日月日、國籍）＋預約時間、服務、狀態、備註；不含內部稽核紀錄 |
| 期間 | 由請求的 from／to 指定，伺服器驗證範圍 |
| 加密金鑰 | 診所 Google 專案的預設（Google 管理）金鑰 |
| 格式 | 沿用既有契約 CSV／XLSX；XLSX adapter 依工作包另補 |

## 2. 保存、封存與刪除（CP-05）

| 項目 | 核准值 |
| --- | --- |
| `recoverableDays` | 30。封存後 30 天內管理者可復原 |
| 到期後 | 不自動刪除；進「待永久刪除」清單 |
| 永久刪除 | 由診所負責人重新驗證＋填理由後執行；另需到期、無 legal hold、依存已對帳 |
| Legal hold | 只由診所負責人設定與解除 |
| 備份／PITR | 不另外刪備份，隨現行保存期自然過期；還原時必須重新套用刪除紀錄，避免已刪資料復活 |
| 對外說法 | 不得宣稱所有層即時刪除 |

## 3. 每月使用認定（CP-03）

| 項目 | 核准值 |
| --- | --- |
| 事件來源 | 伺服器端員工登入成功（`staff_login`）與病患預約建立成功（`booking_created`）紀錄 |
| 排除 | 測試帳號、開發／維護帳號與合成資料（`test`／`maintenance` 類事件不計） |
| 月份 | 台北時間日曆月 |
| 補收截止 | 月底後 5 天內補進的事件仍算該月，之後鎖定 |
| 紀錄缺漏 | 該月不得判為 `unused`，分類為 `insufficient_evidence`，改由業主與維護方人工確認並留紀錄 |
| 維護計費起點 | 依第 4 節 |

## 4. 驗收與付款里程碑（CP-03）

| 項目 | 核准值 |
| --- | --- |
| CURRENT_PROJECT_ACCEPTANCE | 只代表合成環境工程驗收全部通過，**不含**真實運行月 |
| 正式上線日 | 第一次用真實資料開放病患預約的那天 |
| 尾款 20,000 | 實際運行滿一個日曆月（`formalOperationCalendarMonths = 1`）＋診所負責人在系統內或書面確認 |
| 維護費起算 | 滿月確認的隔天 |
| 未確認前 | 尾款 gate 保持 `NOT_PASSED`，不因時間經過自動滿足 |
| 測試期 | `trialCalendarDays = 20`（台北日曆天，含起算當天），`maxAdjustmentDays = 10` |
| 測試期起算 | 第一位真實員工登入當天；測試／維護帳號登入不啟動 |
| 提前結束／延長 | 需負責人具名確認 |

## 5. Google 還原演練（CP-06）

| 項目 | 核准值 |
| --- | --- |
| 範圍 | 只在 C1 合成專案；還原到另一個新資料庫，不覆蓋原資料庫 |
| 驗證 | 筆數一致＋抽樣內容一致 |
| 成功標準 | 沿用 D-010：RPO ≤ 60 分鐘、RTO ≤ 240 分鐘 |
| Calendar | 只用專屬演練日曆 |
| 清理 | 演練資源 7 天內刪除 |
| 費用上限 | NT$500 |
| 執行 | CP-06-S source 可開工；CP-06-E 實際還原的時間、SHA 與資源仍需業主另行明確核准 |

## 6. 合作終止與資料返還（CP-07）

| 項目 | 核准值 |
| --- | --- |
| `minimumNoticeDays` | 30（合約既有） |
| 返還 | 一份完整匯出，規則同第 1 節 |
| 簽收 | 診所簽收（系統記錄簽收人與檔案指紋）後才進下一步 |
| 權限撤銷 | 所有員工與開發者權限 |
| `controlledCopyRetentionDays` | 30（合約既有），期滿刪除並留紀錄 |
| 備份 | 隨保存期自然過期，書面說明 |
| 失敗處理 | 任一步失敗（匯出失敗、未簽收等）就延後結案，不假結案 |
| 費用結清 | 由人處理；系統不自動以結清狀態阻擋資料返還 |

## 7. 備份證據 policy（由既有決定推導，非新問題）

`assessBusinessBackupEvidence` 的 Google 現行 profile 依既有決定組成，不另作新核准：

| 欄位 | 值 | 依據 |
| --- | --- | --- |
| `minimumCopyCount` | 1 | 現行同地每日備份；獨立副本屬 AWS 階段（`CURRENT-PROJECT-SEQUENCE-2026-09-22`） |
| `minimumRetentionDays` | 30 | C0-ENG-REC 每日備份 30 天（`infra/terraform/c5-firestore/main.tf`） |
| `requireIndependentCopy` | false | 同上，AWS 後置 |
| `requireDistinctLocation` | false | 同上，AWS 後置 |
| `requireRestoreDrill` | true | 第 5 節 |
| `requireFailureAlert` | true | BD-04 驗收條件 |
| `maximumRpoMinutes`／`maximumRtoMinutes` | 60／240 | D-010 |

AWS 階段開始時，這組值要依當時決定改為獨立副本 profile，不能沿用。

## 8. 工作包可否開工

| 工作包 | 狀態 | 條件 |
| --- | --- | --- |
| CP-03 用量與里程碑 | 可開工（source） | 第 3、4 節 |
| CP-04 安全匯出 | 可開工（source） | 第 1 節 |
| CP-05 封存／刪除 | 可開工（source），runtime 需 CP-04 可用 | 第 2 節 |
| CP-06-S 還原 source | 可開工 | 第 5 節 |
| CP-06-E 實際還原 | HOLD | 業主另行核准時間、SHA、資源 |
| CP-07 終止 | HOLD | CP-04／05／06 證據 |
| 任何 production 套用 | HOLD | 專業隱私／法律審閱＋另行授權 |

## 9. 不包含

- 不自行定法定保存期限；不豁免運行滿月或尾款條件；不建 AWS 資源。
- 不改 D-series production 狀態；不把合約草稿或測試 fixture 值當核准。
- runtime 注入時，policy 版本（`BD-POLICY-2026-09-29`）與 scope 必須隨設定帶入；
  缺值或未知值一律 fail closed，不走預設。
