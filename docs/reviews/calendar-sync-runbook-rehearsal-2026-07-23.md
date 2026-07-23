# Runbook 演練：日曆同步失敗 → 死信 → 補回（2026-07-23）

## 目的

這是[日曆整合計畫 §3.1](../architecture/calendar-and-database-integration-plan.md)
四項技術前置的最後一項。把
[calendar-sync-failure runbook](../runbooks/calendar-sync-failure.md) 的每一步在
本機以假日曆跑一次，並把它固定成可回歸的證據，而不是一次性的手動操作。

演練即測試：`tests/firestore/calendar-sync-runbook.test.ts`（Emulator，3 案例）。

## 補上的能力：`requeue`

演練前發現 runbook 步驟 3「以相同 idempotency key 重送工作」在程式裡**沒有對
應的操作**——`OutboxProcessor` 有 `processDue` 與 `deadLetters`，但死信一旦產生
就是終點，沒有把它排回去的方法。這是 runbook 描述了、程式卻缺的能力。

新增 `OutboxProcessor.requeue(jobId, operatorId)`：

- **只作用於死信**。對仍在重試（`pending`／`in_progress`）或已完成的工作回傳
  `false`，不動作——人工插手正在跑的工作會與 worker 的租約打架，重排已完成的
  工作則會憑空再送一次投影。
- **沿用同一個 `idempotencyKey`**。這是冪等的關鍵：若日曆上其實已有事件（回應
  遺失的情境），重送只會 upsert 撞既有事件，不會產生第二筆。
- `attempts` 歸零給予全新的重試額度，並寫入 `requeuedAt`／`requeuedBy` 供稽核
  （runbook 步驟 5）。
- 一個陷阱：`nextAttemptAt` 用 `FieldValue.delete()` 移除而非設 `null`，因為
  `isDue` 以 `=== undefined` 判斷「立即到期」，設 null 會讓 `Date.parse(null)`
  變 `NaN`，重排的工作反而永遠領不到。

## 演練情境（對應 runbook 步驟）

刻意選最危險的情境：**日曆已建立事件、但回應在網路上遺失**——Google 官方警告
「自訂 event ID」要防的正是這個重複風險。假日曆的 `failNextAfterWrite(n)` 模擬
它：先把事件寫進去，再丟可重試錯誤。

| Runbook 步驟 | 演練動作 | 斷言 |
| --- | --- | --- |
| 觸發條件 | 每次嘗試都「寫入成功但回應遺失」，共 `MAX_ATTEMPTS` 次 | 工作進 `dead_letter`、`needsOperator=true` |
| 1＋2 確認狀態、錯誤碼 | 讀死信工作與 `deadLetters()` 清單 | 工作帶 `appointmentId` 與 `idempotencyKey`；**日曆上其實已有一個事件**（回應遺失） |
| 3 排除根因後以相同鍵重送 | 日曆恢復，`requeue('outbox_001', operator)` | 回傳 `true`；`processDue` 後 `completed=1` |
| 3 事件已存在須轉為成功 | 重送撞到既有事件（409 路徑） | **仍是一個事件而非兩個**，`conflictUpdateCount > 0` |
| 5 死信已清除、留存處理結果 | 讀回工作與死信清單 | `status=completed`、`requeuedBy=operator_admin_001`、死信清單為空 |

另兩個案例守住邊界：

- **重跑一百次仍只有一個事件**：死信 → 補回後把 `processDue` 連跑 100 輪，
  `events.size === 1`、`insertCount === 1`。對應 roadmap 的「重試 100 次仍只有
  一個事件」驗收。
- **`requeue` 只作用於死信**：對 `pending`、`completed` 與不存在的工作都回傳
  `false` 而非靜默假成功。

## 結果

`corepack pnpm test:rules` — Emulator 44 項全過（含本演練 3 項）。
`corepack pnpm verify` — 單元 106 項全過。

## 這代表什麼

日曆整合的**四項技術前置全部完成**。接上真實 Google Calendar 前，剩下的只是
D-009 核准（日曆擁有者、授權模型、scope、專用測試日曆）與把假日曆換成真實 API
用戶端——重試、退避、死信、冪等與人工補回的行為都已在本機證明，換實作時不動。

真實用戶端接上時，runbook 步驟 4（主管依預約編號的受稽核人工補救）目前對應到
`requeue` 的操作者身分欄位；正式後台需要一個實際的 UI 入口把它接出來，列為階段
C 的工作。
