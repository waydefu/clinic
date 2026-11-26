# C1 凍結窗口讀回（11/26 10:46Z～11:20Z）

- 專案：`beauessence-clinic-stg-c1a01`（C1 隔離預覽）；只用合成資料
- 凍結 SHA：`0734442a`（origin/main，含 #587、#588）
- 開窗：2026-11-26 10:46Z；關窗：2026-11-26 11:20Z 前後（維護旗標到期 11/27 11:20Z）
- 部署映像：Cloud Build `afacaee1` SUCCESS（4m31s）

## 1. 結論

- **整體結果：通過。** 本窗做完的項目全部 PASS；沒做的項目都有明確原因，留到 stage 4（11/28-29）或 12 月。
- 關窗已讀回：維護 `true`、兩個排程 `PAUSED`、櫃台 session 已撤銷、`/v1/health` 404（靜態版）。
- **發現 F-1126-01**：病患預約頁匿名開啟會 401，整頁停用。已有修正 Draft PR #589（CI 全綠），等負責人決定合併與部署。
- **發現 F-1126-02**：工作台代建預約的 `patientId` 是 `patient_001`，但 Firestore `patients` 集合沒有這份文件，造成封存 404、回診查詢（正確資料）也 404。尚未深查。
- 觀察：outbox-drain 排程 `retryCount=2`，與預期 0 不符（非本窗變更）。

## 2. 逐項結果

| 項目 | 結果 | 證據摘要 |
| --- | --- | --- |
| C3（過期主管 session） | PASS | 用 11/23 已到期的主管 session 開 `/staff`，`/v1/bookings` 回 401，畫面是「CAL-PILOT 安全登入」頁；沒有寫入、沒有撤銷 |
| 階段 2 讀回 | PASS（密鑰版本 pin 未逐一讀回） | 三服務新 revision 100%；兩排程 PAUSED；Firestore PITR 啟用、版本保留 7 天、刪除保護啟用；每日備份最新 11/25 READY、保留 30 天、每週保留 98 天；`purgeAt` TTL ACTIVE；告警 10 條全啟用；`c1-terraform-ci` 服務帳號已停用；`calendar_pilot_configuration/active` 為合成、到期 2026-12-16、health healthy；Hosting COOP 為 same-origin-allow-popups、CSP 無 staging 來源 |
| SEC-01/02/04（API 層） | PASS | 櫃台 session 打月報、匯出（建立與下載）、保存期限待刪清單、身分候選、里程碑，全部 403 `AUTHORIZATION_DENIED`；櫃台畫面沒有報表、商務、封存入口。POST 封存未直接打（同一 RBAC 服務已由 GET 驗證） |
| R5（#562） | PASS | 開第二分頁後文件總數 44 到 45，但新紀錄建立時舊紀錄同時被標 `revokedAt`（同一時間戳），**有效櫃台 session 仍是 1 筆**、到期日沿用 11/29。**判準更正**：作業單原寫「筆數不增加」不精確，依 #562 設計應為「有效筆數不增加、無孤兒」。副作用：舊分頁的防偽憑證失效（#562 未採方案 a，已知取捨），之後櫃台操作改用新分頁 |
| BKG-01 欄位 | PASS | 工作台代建表單只有姓名、電話、生日月日、國籍、療程、備註，沒有出生年 |
| BKG 建立與讀回 | PASS | `POST /v1/bookings` 201，預約 `77f37659` confirmed、2026-12-02 14:00（台北）；重新整理後伺服器讀回一致 |
| BKG 無 PII | PASS | 清單回應只有預約代碼、狀態、時間、類型、時段、病患代碼，無姓名電話 |
| BKG 防枚舉 | PASS | 回診查詢「資料正確」「生日錯」「電話不存在」三種都回相同 404 `NOT_FOUND`（但見 F-1126-02：正確資料 404 的原因是病患文件不存在，不能當作防枚舉以外的結論） |
| BKG P09-11 限流 | PASS | 同一身分連續失敗查詢，第 8 次回 429（`Retry-After` 875 秒），符合 20 次以內的要求 |
| OPS 排程 | PASS | calendar-sync 跑 1 次（revision `00012-hql`，200，`reconciled=true`、`failedJobs=0`、見 3 筆、略過 3 筆，ERROR 0），一次收斂（#568）後 PAUSED；outbox-drain resume、run、pause（revision `00027-rw8`，皆 200，ERROR 0）；兩排程讀回 PAUSED |
| CP-03 | 部分（只看畫面 30 天） | 只確認畫面的 30 天顯示；里程碑確認與截圖未做，留 stage 4 |
| CP-04 | PASS | 主管加負責人重新驗證後，`POST exports` 201；2026-11-01 到 12-31、5 列、514 bytes；下載剩 3 次；下載期限 11/27、清除 12/3（台北時間）；有核對檔案雜湊 |
| CP-05 | PASS | 合成病患 `a8d64d06` 封存 POST 201，再復原 POST 201，Firestore 讀回 `archivedAt` 已清除 |
| R2（c5） | 已套用 | `c5-firestore` plan 4 moved、0/0/0，apply 完成，0/0/0 |
| R2（c1-foundation） | 不套用 | plan 為 9 moved、2 change（WIF provider、alert policy 原地更新）、3 destroy（terraform_ci 的兩個專案層級角色與一個 WIF 綁定），不是只有搬移。本窗的變數不是真實私有值（部分值是我從公開資料與專案推出來的，可能與真實設定不同），依停止條件不套用，改 12 月以真實變數重跑 |
| 24a（故障注入） | 未執行 | 腳本需要操作者自備 driver；現有的 convergence-driver 只是需外接 Calendar 與 Firestore ports 的工廠，沒有獲准可用的 driver，runbook 也沒有核准的真實故障注入方法 |
| 關窗讀回 | PASS | stage1 plan 0/3/0（api、worker 的 env 移除 c6 設定、calendar_sync `max_doublings` 由 0 回復為 5）apply 完成 0 added、3 changed、0 destroyed；Hosting 靜態版已部署；`/v1/health` 404；兩排程 PAUSED；櫃台 session 已撤銷（有效 front_desk 0、manager 1 不變）；lock 檔已還原；維護 `true`，到期 11/27 11:20Z |

## 3. 時序（UTC，11/26）

| 時間 | 事件 |
| --- | --- |
| 10:29 | T-90 完成：凍結 SHA、工具版本與起點讀回（維護 true、兩排程 PAUSED，api `00045-l7n`、calendar-sync `00011-l24`、outbox `00026-h99` 作為回退對照） |
| 10:40 | Cloud Build `afacaee1` SUCCESS，映像填入私有變數 |
| 10:46 | 開窗（負責人提早、授權自行執行）；c6 plan 0/4/0 apply；Hosting API 版；新 revision api `00046-mpl`、outbox `00027-rw8`、calendar-sync `00012-hql`；health 200；維護 `false` |
| 10:50 | C3；主管與櫃台皆有有效 session |
| 11:00 | 階段 2 讀回、SEC-01/02/04、R5 |
| 11:05 | 發現 F-1126-01 |
| 11:10～11:13 | BKG 建立、防枚舉、限流 |
| 11:14 | 排程收斂（第 19 步）；負責人指示改由子代理續跑 |
| 11:2x | CP-04、CP-05、c5 apply、c1-foundation plan（不套用） |
| 11:20 | 24a 判定未執行；決定關窗；維護延到 11/27 11:20Z |
| 11:2x | 關窗（stage1 apply、Hosting 靜態版、撤銷櫃台 session）、F-1126-01 的 PR #589 驗收 |

## 4. 發現

### F-1126-01：病患預約頁匿名 401，整頁停用

- 現象：匿名開 `/booking`，transport 的 `/state` 覆蓋一律呼叫 `listBookingPages`（`GET /v1/bookings`，不帶憑證）得 401，頁面顯示「無法載入診所預約資料：請先登入後再操作。」，初診、回診、看診項目按鈕全部停用。slots 與 schedule 都是 200。
- 範圍：自 `dc8be34e` 起相關檔案沒有變動，推測 10 月底就如此；前幾次 C1 窗口沒測病患頁。**不是本窗造成。**
- 修正：Draft PR #589（head `cf6410d7`），CI 14/14 SUCCESS；+69/-10（transport 1 處條件、單元測試 2 案、e2e 刪除 4 個匿名 bookings 失敗案例，這是刻意移除的行為）。已驗收可接受。
- 待辦：合併與重新部署由負責人決定；部署後要實測匿名 `/booking` 能載入並可選擇項目。
- 本窗處置：BKG 鏈改由櫃台工作台代建。

### F-1126-02：工作台代建預約的病患 ID 對不到病患文件

- 現象：工作台代建的預約 `77f37659`，`patientId` 存為 `patient_001`；Firestore `patients` 集合有 8 筆文件，id 都是 32 位 hex，沒有 `patient_001`。
- 影響：CP-05 對該預約的病患封存回 404；回診查詢即使資料正確也回 404。
- 推測：C1 代建路徑的病患目錄與 Firestore `patients` 沒接線。**未深查**，待調查。

### 觀察：outbox-drain `retryCount=2`

- 讀回為 2，預期 0（calendar-sync 未設 retry）。非本窗變更，記錄待查。

## 5. 未做，留到 stage 4（11/28-29）

- legal hold
- CP-07 終止拒絕路徑
- CP-03 里程碑確認與截圖
- BKG-04/05 正向回診查詢（需要「已完診加回診指示」的病患，本窗沒有符合者；也受 F-1126-02 影響）
- 櫃台 UI 寫入（櫃台分頁群組被關閉，等負責人回來）
- 16 張截圖
- SEC-02 登出後重新整理

## 6. 12 月

- c1-foundation 的 R2：以真實私有變數重跑（本窗 plan 為 9 moved、2 change、3 destroy，不套用）。
- 故障注入（24a）：需要先取得獲准的 driver 與核准的注入方法。
