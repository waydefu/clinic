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

**已於 2026-07-22 修正。** 舊鍵 `calendar_confirmed_appointment_001` 含底線，
直接作為 event ID 會被 API 拒絕。現在鍵一律由
[`packages/domain/src/calendar-event-id.ts`](../../packages/domain/src/calendar-event-id.ts)
產生：邏輯鍵經 UTF-8 → base32hex（小寫、無填充）編碼，並在編碼時檢查長度。

```text
calendar_appointment_001
  ↓ calendarEventIdForAppointment('appointment_001')
（base32hex 字串，合法的 event ID）
  ↓ fromCalendarEventId(...)
calendar_appointment_001
```

**一筆預約 = 日曆上一個事件**（2026-07-22 決定）。改期是搬動同一個事件；到診、
取消、未到都刪除它。需要回診時以另一個具名 event ID 建立提醒，正式掛號或改為
不需回診時再刪除提醒。曾採「每個狀態一把鑰匙」，但那會讓每個狀態各開一格，
且取消時去刪一個從未建立過的 ID——理由與替代方案見
[日曆 event ID 文件](../architecture/calendar-event-id.md)。

可讀性未因編碼而喪失：`outbox_jobs` 保留 `appointmentId` 與
`appointmentStatus` 明文欄位（人工追查優先看這裡），且 `fromCalendarEventId`
可把日曆上看到的 ID 還原回邏輯鍵。

鍵的組成規則只存在該檔（`calendarEventIdForAppointment`），呼叫端不得
自行拼字串。本機的假日曆
（`apps/worker/src/calendar-port.ts`）會拒絕不合格式的 ID 且標記為
**不可重試**，格式一旦回歸就會在本機測試爆炸，而不是等接上真實 API 才發現。

另有一項不能忽略的官方說明：

> 我們無法保證在建立事件時偵測到 ID 衝突。

因此**不得只依賴 event ID**。worker 仍必須把「該 ID 已存在」的回應視為成功
（冪等），而不是失敗後重試。

## 後果

- 首期櫃台不可直接以 Google Calendar 修改預約。
- 日曆同步需有可重試工作、死信與人工補救 Runbook。
- 若日後開放手動 Calendar 編輯，必須新增 watch 續訂、sync token 與定期完整核對。
- 2026-08-16 的後續業主輸入已把 inbound 方向收斂為**人工審查、系統權威**，
  但 reviewer role、matching identity、刪除語意與正式 scope 仍待 D-016。外部變更
  只進 candidate/review queue、不自動修改營運資料，核准後仍走正常 domain command、
  重查衝突並追加 audit，因此與本 ADR 相容；若未來要 auto-apply 或讓 Calendar 成為
  co-authority，才必須用新的 accepted ADR 明確取代本決定。
- outbox 的 `idempotencyKey` 必須可直接作為合法的 Calendar event ID。
- 日曆事件內容維持最小化：只放預約編號、掛號別與時間。姓名、電話、身分證、
  手術種類與備註一律不得離開本系統，並已有測試持續驗證。

## 2026-09-29 修訂：專用預約日曆的標題欄位

業主決定 `CALENDAR-TITLE-FORMAT-2026-09-29`（見[決策登記](../product/phase-1-decision-register.md)）
後，AGENTS.md Safety Floor 第 4 條同步修訂。上一段「姓名、電話……一律不得離開本系統」
自此只剩下列範圍仍成立：

- **可以寫入**：僅限診所**專用預約日曆**的事件標題，欄位為姓名、電話、生日月日、
  初診／回診與服務、顧問代碼。其他任何日曆（診所既有共用日曆、個人日曆）仍一律不放。
- **仍然禁止**：身分證、護照、完整生日（含年份）、手術種類與其他醫療資料、病患自填的
  備註或任何自由文字、存取憑證。業主原格式中的「備註」因可能含症狀等醫療資料而不寫入。
- **本決定不變**：Firestore slot transaction 仍是唯一權威；Calendar 仍是投影，不是鎖。
- production 仍需 D-009 核准；上線前須寫入隱私權政策並經專業審閱。C1 只用合成姓名與電話。

現有「日曆不含 PII」的測試在實作 PR 中改為「只允許上列欄位」的正向＋反向測試，
不得直接刪除。
