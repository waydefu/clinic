# ADR-0002：Google Calendar 是投影，不是預約鎖定來源

**狀態：** 已接受  
**日期：** 2026-07-20

## 決定

Firestore slot transaction 為可用時段與防雙約的權威來源。Google Calendar 由 outbox worker 非同步、冪等地建立、更新或取消事件。

## 原因

不同通路同時預約時，需要可交易化的唯一時段鎖定。Calendar API 變更通知可能遺漏且監看頻道會到期，不適合當唯一的競爭控制來源。

## 後果

- 首期櫃台不可直接以 Google Calendar 修改預約。
- 日曆同步需有可重試工作、死信與人工補救 Runbook。
- 若日後開放手動 Calendar 編輯，必須新增 watch 續訂、sync token 與定期完整核對。

