# 日曆 event ID 與 outbox 冪等鍵

**狀態：** 已實作（2026-07-22）。適用於所有 Calendar 投影意圖。

這份文件是「哪裡改、為什麼這樣改」的導航圖。規則本身在
[`packages/domain/src/calendar-event-id.ts`](../../packages/domain/src/calendar-event-id.ts)，
決策背景在 [ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)。

## 一句話

outbox 工作的 `idempotencyKey` **就是** Google Calendar 的 event ID，因此必須
符合 base32hex 格式；鍵一律由共用產生器產生，不得手寫字串。

## 白話版：這到底在做什麼

把診所的 Google 日曆想成一面牆，每筆預約在上面有一個**固定的門牌號碼**，
號碼由我們自己指定（就是那串 base32hex）。

**為什麼要自己指定號碼？** 因為送資料到 Google 的路上可能斷線，我們不知道
到底成功了沒。如果讓 Google 自己給號，重送一次就變成兩筆；自己指定門牌，
重送一百次都是蓋在同一格上。

**兩個動作**：

- **寫上去**（`upsert`）：預約成立、到診時，把內容寫到那個門牌上。因為我們
  無法確定那格有沒有東西，規則是「沒有就寫，已經有就蓋掉重寫」。
- **擦掉**（`cancel`）：預約取消或未到，把那格清空。

**兩種「看起來像錯誤，其實是成功」**：

| Google 回應 | 直覺以為 | 實際上 |
| --- | --- | --- |
| 「這個門牌已經有東西了」（409） | 失敗，要重試 | **成功**。我們要的是那格有正確內容，已經有就改成更新它 |
| 「找不到這個門牌」（410／404，發生在要擦掉時） | 失敗 | **成功**。我們要的是那格空著，它本來就空著 |

一句話原則：**判斷成功的標準是「日曆最後長得對不對」，不是「這次呼叫有沒有
真的動到手」。** 少了這條規則，Google 一回 409 程式就重試，重試六次後這筆
進死信佇列，值班的人得手動處理一筆其實根本沒問題的預約。

**為什麼要看「現在」的狀態**：日曆故障時工作會排隊等重試（30 秒、1 分鐘、
2 分鐘…）。等它終於執行時，預約可能已經不一樣了——早上 10:00 建立預約、
10:05 病人來電取消、10:10 日曆恢復。若照「排隊當時的狀態」做，就會把一筆
已取消的預約寫回日曆，變成幽靈事件：病人不會來，醫師的時段卻被卡著。

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

## 投影動作（2026-07-22 補完）

worker 依**執行當下**的預約狀態決定動作，而不是工作排入時的狀態——工作可能
等到退避結束才執行，期間預約已被取消，這時再把事件寫回日曆就是錯的。

| 預約狀態 | action | 真實 Calendar 呼叫 | 特殊情形 |
| --- | --- | --- | --- |
| `confirmed`／`completed`／`cancellation_requested` | `upsert` | `events.insert`（自訂 ID）；回 **409 就改 `events.patch`** | 409 = 事件已存在 → **冪等成功**，不是失敗 |
| `cancelled`／`no_show` | `cancel` | `events.delete` | 410／404 = 早就沒了 → **視為成功**，目標狀態已達成 |

為什麼是 upsert 而不是分開的 create／update：worker 手上只有預約狀態，無法
知道日曆那一側到底有沒有這個事件（Google 明說無法保證偵測 ID 衝突）。
「先 insert，撞到就 patch」是官方建議寫法，也讓重試永遠安全。

假日曆（`InMemoryCalendar`）已實作這四種語意並提供 `insertCount`、
`conflictUpdateCount`、`cancelCount`、`cancelMissCount` 供測試斷言。

## 尚未處理：鍵的粒度（接真實日曆前必須決定）

**目前每個狀態各自算出不同的 event ID**（`calendar_{status}_{id}`），等於每個
狀態在日曆上開一格新的。實測一筆預約走完整個生命週期：

```text
建立預約  → 日曆 1 個事件
改期      → 日曆 2 個事件   （舊時間的殘影還在）
標記到診  → 日曆 3 個事件   （同一時段又多一格）
取消      → 日曆 3 個事件   ← 應為 0
```

取消刪不掉任何一個，因為它去刪的是「取消專用」的門牌，那格從來沒被建立過。
機制（409／410 冪等、依執行當下狀態選動作）是對的，但**鍵的粒度**讓這些機制
無法組合出正確的日曆狀態。

> 注意：`tests/firestore/outbox-worker.test.ts` 的取消案例是沿用同一筆工作、
> 只改狀態，因此驗證到的是「機制正確」而非「實際流程正確」。實際流程會產生
> 帶新鍵的新工作。修好粒度後，該測試應改為走完整流程。

### 解法 A：event ID 固定綁預約（建議）

一筆預約 = 日曆上一個事件，從頭到尾同一個門牌：

| 動作 | 對日曆做什麼 |
| --- | --- |
| 建立預約 | 寫入事件（時間 T1） |
| 改期 | **更新同一個事件**為 T2，舊時間自然消失 |
| 到診 | 更新同一個事件（不新增） |
| 取消／未到 | 刪除那個事件 |

- 這正是 Google 預期的模型：一個事件被移動、被更新、被刪除。
- 三個症狀（改期殘影、到診多一格、取消刪不掉）**一次全解**。
- 兩筆工作同時在跑也安全：worker 讀的是執行當下的預約狀態，不論誰先跑，
  寫出來的都是同一個正確結果。
- 需要改：`calendarEventIdForStatus` → 只吃 `appointmentId`；移除改期專用
  的鍵；更新對應測試。outbox 工作本身仍以 `job.id`（含狀態／時段）區分，
  不受影響。

### 解法 B：維持每狀態一鍵，改期時多排一筆刪除舊事件的工作

- 保留「一筆工作 = 一個意圖，鍵永不重用」的性質，稽核上能明確看出每筆工作
  動到哪一個事件。
- 但只補改期並不夠：到診多開一格、取消刪不掉，各自還要再補一筆工作，
  外部呼叫次數與工作量都會膨脹。
- 只有在未來需要「一筆預約對應多個日曆事件」（例如回診提醒另開一則）時，
  這個方向才划算。

**建議採 A。** 它更簡單、符合 Google 的模型，且一次解決全部三個症狀。
在決定之前不要片面改動——這會改變診所日曆上實際看到的內容。
