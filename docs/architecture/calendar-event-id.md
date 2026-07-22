# 日曆 event ID 與 outbox 冪等鍵

**狀態：** 已實作（2026-07-22）。適用於所有 Calendar 投影意圖。

這份文件是「哪裡改、為什麼這樣改」的導航圖。規則本身在
[`packages/domain/src/calendar-event-id.ts`](../../packages/domain/src/calendar-event-id.ts)，
決策背景在 [ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)。

## 一句話

outbox 工作的 `idempotencyKey` **就是** Google Calendar 的 event ID，因此必須
符合 base32hex 格式；鍵一律由共用產生器產生，不得手寫字串。

## 資料流

```text
planBooking / planTransition / planReschedule      （packages/domain）
        │  calendarEventIdForStatus(id, status)
        │  calendarEventIdForReschedule(id, slotId)
        ▼
outbox_jobs.idempotencyKey = base32hex 字串        （Firestore，交易內寫入）
        │
        ▼
apps/worker → CalendarPort.project({ idempotencyKey, ... })
        │            ↑ 假日曆會拒絕不合格式的 ID（不可重試 → 死信）
        ▼
Google Calendar event ID（階段 C 才真正送出）
```

## 為什麼要編碼

Google 官方防重複的做法是由我們自行指定 event ID，這樣「後端已建立成功但回應
遺失」時，重試帶同一個 ID 就不會產生第二個事件。但 event ID 只允許
**小寫 `a`–`v` 與 `0`–`9`**（RFC 4648 base32hex），長度 5–1024。

舊鍵 `calendar_confirmed_appointment_001` 含底線，第一次真實呼叫就會被退件。

## 現在的做法

| 項目 | 內容 |
| --- | --- |
| 編碼 | 邏輯鍵 UTF-8 → base32hex，小寫、無填充（`=` 不在允許字元內） |
| 決定性 | 同一邏輯鍵永遠得到同一個 ID——冪等就靠這個性質，不得加入時間戳或隨機值 |
| 可讀性 | `fromCalendarEventId` 可還原；`outbox_jobs` 另保有 `appointmentId`／`appointmentStatus` 明文欄位，人工追查優先看那裡 |
| 唯一性 | 狀態鍵 `calendar_{status}_{appointmentId}`；改期鍵另帶目標時段 ID，才不會與成立事件互相覆蓋 |
| 守門 | 產生時檢查長度；假日曆拒絕不合格式的 ID 並標記為**不可重試**（重試一百次格式還是錯的，那是死信） |

範例：

```text
calendar_confirmed_appointment_001
  → cdgmopbechgn4nr3dtn6cqbidlim8nr1e1o6uqbeehmmarjkbso30c8   （55 字元）
```

## 改動時要看哪裡

| 要改什麼 | 動這裡 | 別忘了 |
| --- | --- | --- |
| 鍵的組成（例如加入診所 ID） | `calendar-event-id.ts` 的兩個 `calendarEventIdFor*` | 既有事件的 ID 會改變＝日曆上會多出新事件，需要遷移計畫 |
| 新的投影種類 | 同上，新增一個 `calendarEventIdForXxx` | 不要在呼叫端拼字串，兩處各拼一次就是漂移的開始 |
| 真實 Calendar 用戶端 | `apps/worker/src/calendar-port.ts` 的新實作 | 「事件已存在」必須視為冪等成功，不可當失敗重試 |

## 測試

- `packages/domain/src/calendar-event-id.test.ts`：字元集、長度、決定性、
  區分性、往返解碼、RFC 4648 已知向量、非法輸入。
- `packages/domain/src/{booking-transaction,appointment-transition}.test.ts`：
  三個 planner 產出的鍵都可解回預期的邏輯鍵且格式合法。
- `tests/firestore/outbox-worker.test.ts`：送到日曆的鍵確實是 base32hex；
  舊格式殘留的工作會直接進死信而非無限重試。

## 尚未處理

worker 目前只有「建立或更新」一種投影動作。真實 Calendar 還需要更新與取消
（delete）的語意，以及把 Google 回的 409（事件已存在）明確視為冪等成功——
列於[日曆整合計畫 §3.1](calendar-and-database-integration-plan.md)。
