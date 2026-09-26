# P1-09 回診取消缺陷修正與 Stage F 回診重驗（2026-09-26）

**結論：** 重驗時又找到一個伺服器端缺陷：取消回診後，病患永遠無法再排回診。已修正（[PR #177](https://github.com/waydefu/clinic/pull/177)、[PR #178](https://github.com/waydefu/clinic/pull/178)）並部署到 C1。修正後的網頁與 API 上，`return_required_unscheduled_follow_up` 通過。Stage F 目前 10 PASS，只剩 `security_one_real_human_alert` 等待業主確認收件。`P1_09 = NOT_CLOSED`。

## 額度與資料

- 業主核准：1 次取消加 1 筆新回診，同一組合成病患（`測試甲`、`0912000901`、1990-01-01）。
- 實際：取消 1 次（17:41:12Z），新回診 1 筆（18:32:59Z）。另有 1 次被伺服器以 `409` 拒絕、沒有寫入的送出（18:13:58Z）。
- 預約總數 6；`patient_booking_guards` 維持 3，沒有新增病患。

## 缺陷：取消回診後無法再排（CONFIRMED）

| 時間（UTC） | 觀察 |
| --- | --- |
| 17:41:12 | 病患端取消回診 `48934fed…`，伺服器讀回 `cancelled` |
| 讀回 | `patient_follow_up_states.activeFollowUpAppointmentId` 仍指向這筆已取消的回診 |
| 17:42:09 | 回診查詢把它顯示成「預約成立」並附取消按鈕，「↻ 回診」停用 |

**根因：** 建立回診時會寫入這個指標，但只有醫師改判「無需回診」才會清掉。取消、未到、刪除都沒清，而 `assertFollowUpBookable` 與回診查詢又直接相信這個指標。

**修正：**

- [PR #177](https://github.com/waydefu/clinic/pull/177)（`e05c8f8`）：取消、未到、刪除回診時，在同一個 transaction 清掉仍指向它的指標；新增 `isLiveFollowUp`，讓建立回診與回診查詢把指向已取消／未到預約的指標當作沒有。另外修正 CI 抓到的 `no-unsafe-assignment`。
- [PR #178](https://github.com/waydefu/clinic/pull/178)（`ffa5d33`）：#177 部署後，application service 在呼叫 repository 之前還有一次 `assertFollowUpBookable`，它讀的 `readFollowUpState` 仍回傳舊指標，所以 18:13:58 的送出仍回 `409`。改成 `readFollowUpState` 只在預約仍有效時才回傳指標，兩種目錄實作一致。

兩個 PR 都補了修正前會失敗的測試：emulator 驗證取消與未到會清指標、不動指向別筆預約的指標、指向已取消回診時仍可建立新回診、`readFollowUpState` 丟掉過期指標；單元測試驗證回診查詢與 application service 的建立回診。CI 皆 12/12。

## 部署

| 時間（UTC） | 動作 | 讀回 |
| --- | --- | --- |
| 18:12:27 | `e05c8f8` API 0% tag `p109e05c8f8`（`internal-test-api-00045-vik`，digest `sha256:c03869309a3034b131b03af2987f50d2f8109531129bcf4aec03bae104d3aec1`），對 tag 做回診查詢 | `outcome=schedule`，沒有預約編號 |
| 18:12:45 | API 100% 與 Hosting pin tag `fh-f787f3c7e029a25b` 移到 `00045-vik` | 經 Hosting 的請求落在 `00045-vik`，health `200` |
| 18:32:00 | `ffa5d33` API（`internal-test-api-00047-suy`，digest `sha256:80b323f68163d91d3b8112eeccc56cda2bd2bf0d06063ab6902ebe6761246019`）先上 0% tag `p109ffa5d33` 驗證，再把 100% 與 pin tag 移過去 | SHA `ffa5d33`、`TRUSTED_PROXY_HOPS=2`、secret 版本不變；經 Hosting 的請求落在 `00047-suy`，health `200` |

- 網頁仍是 Hosting version `f787f3c7e029a25b`（`f49f514` 建置），`ffa5d33` 之前的網頁沒有再變。
- worker（outbox、calendar-sync）程式碼從 `ea1fbcc` 起沒有變，維持 `ea1fbcc` 的 revision。
- 回退：把 API 100% 與 tag `fh-f787f3c7e029a25b` 移回 `internal-test-api-00037-dus`（`ea1fbcc`）即可。

## 重驗結果（18:32:59Z）

- 全新暫存瀏覽器，不登入。回診查詢後頁面直接到第 2 步，「回診」「止鼾」已自動選好。
- 選 9/30 13:45，姓名、身分證字號等欄位全部留空，直接送出，建立成功（`d59b5389…`）。
- Firestore 讀回：`follow_up`、confirmed、與初診同一位病患；舊回診維持 `cancelled`；回診指標指向新預約；瀏覽器沒有存任何資料。

## Stage F evaluator

每個案例附 UTC、來源、預期與實際：10 PASS，`security_one_real_human_alert` 為 `HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED`，`ok=false`，結束代碼 1。

## 更正

先前兩份紀錄中，我回報的本機 lint 結果不可靠：當時用的是管線最後一個指令的結束代碼，而不是 eslint 本身的。#177 的 lint 錯誤就是 CI 抓到的。本份起，本機 gate 一律以指令本身的結束代碼回報。

## 收尾

瀏覽器已關閉、暫存設定檔已刪除，這輪沒有使用 staff 登入。inbound 排程仍為 `PAUSED`。
