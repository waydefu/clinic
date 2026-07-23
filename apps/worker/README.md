# Worker

責任：處理 outbox 工作、Google Calendar 同步、通知、webhook 後續處理與死信重送。

每個 handler 必須可重試、冪等，且不直接修改已鎖定的月結資料。


## Outbox 處理器（2026-07-21 實作）

worker 消費 `outbox_jobs`，把預約投影到外部日曆。三件事刻意分開：

1. **領取**：在交易內加上租約（`LEASE_SECONDS`），兩個 worker 不會同時處理同一筆。
2. **外部呼叫**：**在交易之外**。Firestore 會重試交易，若把呼叫放進去，重試就會
   重複建立日曆事件（ADR-0002）。
3. **結算**：依 `packages/domain/src/outbox.ts` 的 `planOutboxAttempt` 純決策更新。

退避策略：30 秒起指數成長、上限 1 小時、連續失敗 6 次進死信。不可重試的錯誤
（例如請求本身無效）直接進死信，不浪費退避週期。

外部日曆以 `CalendarPort` 介面隔離；本機預設使用 `InMemoryCalendar`。Google
client 已有可測試 adapter，但沒有憑證時不會對外呼叫；部署 runner、trigger 與
真實 Calendar 仍受 D-009/D-010 gate 約束。

每筆 job 都帶 opaque `correlationId` 與 `causationId`。processor 在任何外部呼叫
前驗證兩者，再傳給 port 作 trace context；Google event payload 明確排除這兩個
欄位。`WorkerMetricsPort` 提供低 cardinality 的 Calendar attempt、batch 與 queue
snapshot 指標；metric 不含 appointment、patient 或 trace IDs，metrics adapter
失敗也不會改變 job delivery 結果。

**投影欄位限制**：只送識別碼、狀態、開始時間與掛號別。姓名、電話、身分證、
手術種類與備註一律不得離開本系統，並有測試持續驗證。

驗證：`corepack pnpm verify` 與 `corepack pnpm test:rules`。
