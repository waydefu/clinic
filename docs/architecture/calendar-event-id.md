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
        │  calendarEventIdForAppointment(appointmentId)
        ▼
outbox_jobs.idempotencyKey = base32hex 字串        （Firestore，交易內寫入）
        │
        ▼
apps/worker → CalendarPort.project({ idempotencyKey, ... })
        │            ↑ 假日曆會拒絕不合格式的 ID（不可重試 → 死信）
        ▼
Google Calendar event ID（目前 Stage 3 才真正送出）
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
| 粒度 | **一筆預約 = 一個事件**：`calendar_{appointmentId}`。改期是搬動；到診、取消、未到皆刪除同一個 ID |
| 守門 | 產生時檢查長度；假日曆拒絕不合格式的 ID 並標記為**不可重試**（重試一百次格式還是錯的，那是死信） |

## 改動時要看哪裡

| 要改什麼 | 動這裡 | 別忘了 |
| --- | --- | --- |
| 鍵的組成（例如加入診所 ID） | `calendar-event-id.ts` 的 `calendarEventIdForAppointment` | 既有事件的 ID 會改變＝日曆上會多出新事件、舊的變孤兒，需要遷移計畫 |
| 新的投影種類（例如回診提醒另開一則） | 同上，新增一個具名函式 | 不要把狀態塞回既有函式，那會退回「每狀態一格」的錯誤 |
| 真實 Calendar 用戶端 | `apps/worker/src/google-calendar.ts`（已完成） | 憑證只走 env；「事件已存在」視為冪等成功；見 [go-live runbook](../runbooks/calendar-go-live.md) |

### 回診提醒：一筆預約兩個事件（2026-07-23）

回診確認為「需要回診」時，會為**回診提醒**另開一個事件，與來源就診分開：

- 鑰匙用 `calendarEventIdForFollowUp(來源預約id)`（＝
  `calendar_followup_{id}`），與就診的 `calendar_{id}` 不同。
- 事件時間是回診**目標**時間，不是原就診時間。因此 outbox 工作可帶自己的
  `startsAt`，worker 優先用 `job.startsAt`，沒有才退回讀來源預約
  （`OutboxProcessor` 的 `startsAt` 判斷）。
- 目標改成「目前無需回診」，或已建立正式回診預約時，會以同一個回診 event ID
  排入 `cancel`，不能只刪除 outbox 工作紀錄。
- 週檢視會直接投影尚未正式掛號的回診決定；正式回診預約建立後，由該預約自己的
  日曆事件取代提醒，避免同一回診顯示兩次。

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
| 一般預約：`confirmed`／`cancellation_requested` | `upsert` | `events.insert`（自訂 ID）；回 **409 就改 `events.patch`** | 409 = 事件已存在 → **冪等成功**，不是失敗 |
| 一般預約：`completed`／`cancelled`／`no_show` | `cancel` | `events.delete` | 410／404 = 早就沒了 → **視為成功**，目標狀態已達成 |
| 回診提醒：`follow_up_required` | `upsert` | 使用獨立的回診 event ID | 來源預約此時雖是 `completed`，不得因此誤判為刪除 |
| 回診提醒：`follow_up_not_required`／`follow_up_scheduled` | `cancel` | 刪除同一個回診 event ID | 正式回診預約另有自己的事件 |

為什麼是 upsert 而不是分開的 create／update：worker 手上只有預約狀態，無法
知道日曆那一側到底有沒有這個事件（Google 明說無法保證偵測 ID 衝突）。
「先 insert，撞到就 patch」是官方建議寫法，也讓重試永遠安全。

假日曆（`InMemoryCalendar`）已實作這四種語意並提供 `insertCount`、
`conflictUpdateCount`、`cancelCount`、`cancelMissCount` 供測試斷言。

### 事件的長度與顏色

診所端事件是**開始到結束一小時**（`CLINIC_EVENT_MINUTES`），顏色用 Google 的
`colorId`（綠色，與品牌一致；紅色在行事曆語彙裡代表取消）。這與時段網格
（初診 30 分）刻意不同：時段是掛號的節奏，日曆事件是醫師要預留的看診區塊。

患者自己的行事曆走的是另一條路徑（`apps/web/public/modules/calendar-export.js`），
**只標記開始時間、不佔區間**，提醒設在前一天。兩邊不共用設定值。

以上為 2026-07-22 專案負責人指定的測試設定，不代表 D-004 已核准。

## 鍵的粒度：為什麼綁預約而不是綁狀態（2026-07-22 決定）

曾經是「每個狀態一把鑰匙」（`calendar_{status}_{id}`）。那等於**每個狀態都在
日曆上開一格新的**，實測一筆預約走完生命週期：

```text
舊設計：建立 → 1 個事件；改期 → 2 個；到診 → 3 個；取消 → 仍然 3 個
```

取消刪不掉任何一個，因為它去刪的是「取消專用」的門牌，那格從來沒被建立過，
於是回報「找不到＝成功」，而真正的事件還掛在日曆上。409／410 冪等與「依執行
當下狀態選動作」這些機制本身是對的，**但錯的鍵粒度讓它們無法組合出正確結果**。

現在一筆預約固定一個事件：

```text
新設計：建立 → 1 個事件；改期 → 1 個（搬時間）；到診／取消／未到 → 0
```

考慮過但未採用的替代方案：維持每狀態一鍵，改期時額外排一筆刪除舊事件的工作。
它保留「一筆工作＝一個意圖，鍵永不重用」的稽核性質，但只補改期並不夠——到診
多開一格、取消刪不掉，各自還要再補一筆工作，外部呼叫與工作量都膨脹。只有在
未來需要「一筆預約對應多個日曆事件」（例如回診提醒另開一則）時才划算；屆時
應新增一個具名函式，而不是把狀態塞回 `calendarEventIdForAppointment`。
