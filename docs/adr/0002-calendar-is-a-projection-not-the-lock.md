# ADR-0002：Google Calendar 是投影，不是預約鎖定來源

**狀態：** 已接受  
**日期：** 2026-07-20

## 決定

Firestore slot transaction 為可用時段與防雙約的權威來源。Google Calendar 由 outbox worker 非同步、冪等地建立、更新或取消事件。

## 原因

不同通路同時預約時，需要可交易化的唯一時段鎖定。Calendar API 變更通知可能遺漏且監看頻道會到期，不適合當唯一的競爭控制來源。

## 冪等機制與 event ID 格式（2026-07-21 補充）

Google 官方指定的防重複做法是**由我們自行指定 event ID**：

> 產生自己的 event ID，可避免「後端已建立成功但回應在之後失敗」時，重試造成
> 重複事件。（[Create events](https://developers.google.com/workspace/calendar/api/guides/create-events)）

但 event ID 有嚴格的格式限制（[Events 資源參考](https://developers.google.com/calendar/api/v3/reference/events)）：

| 項目 | 規定 |
| --- | --- |
| 允許字元 | **base32hex：小寫 a–v 與數字 0–9** |
| 長度 | 5–1024 字元 |
| 唯一性 | 每個日曆內唯一 |

**目前的 outbox 冪等鍵不符合此規定。** `calendar_confirmed_appointment_001`
含底線，直接作為 event ID 會被 API 拒絕。接上真實 Calendar 前必須改為
base32hex 編碼；同時保留可讀的 `appointmentId` 欄位供人工追查，不要為了編碼
而失去可讀性。

另有一項不能忽略的官方說明：

> 我們無法保證在建立事件時偵測到 ID 衝突。

因此**不得只依賴 event ID**。worker 仍必須把「該 ID 已存在」的回應視為成功
（冪等），而不是失敗後重試。

## 後果

- 首期櫃台不可直接以 Google Calendar 修改預約。
- 日曆同步需有可重試工作、死信與人工補救 Runbook。
- 若日後開放手動 Calendar 編輯，必須新增 watch 續訂、sync token 與定期完整核對。
- outbox 的 `idempotencyKey` 必須可直接作為合法的 Calendar event ID。
- 日曆事件內容維持最小化：只放預約編號、掛號別與時間。姓名、電話、身分證、
  手術種類與備註一律不得離開本系統，並已有測試持續驗證。

