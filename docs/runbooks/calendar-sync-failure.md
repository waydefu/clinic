# Runbook：Google Calendar 同步失敗

## 觸發條件

- `outbox_job` 超過重試門檻。
- Calendar API 回傳認證、權限、配額、5xx、衝突或逾時錯誤。
- 預約與 Calendar Event 的同步狀態超過 10 分鐘仍非成功。

## 操作步驟

1. 確認預約在 Firestore 的狀態、時段鎖定與 idempotency key；不得直接重建預約。
   （後台待處理清單即 `OutboxProcessor.deadLetters()`，每筆帶 `appointmentId`
   與 `idempotencyKey`。）
2. 檢查專用 Calendar、Cloud Run 服務帳號權限、Secret/服務身分與錯誤碼。
3. 排除根因後，以相同 idempotency key 重送工作：`OutboxProcessor.requeue(jobId,
   operatorId)`。它只作用於死信、沿用同一把鑰匙，因此若 Calendar Event 已存在
   （回應遺失的情境），重送只會更新既有事件而不會建立第二筆。
4. 若無法自動恢復，主管依預約編號在後台執行受稽核的人工補救；不要直接在
   Calendar 建立未連結事件。（`requeue` 會寫入 `requeuedBy`／`requeuedAt`。）
5. 通知技術負責人、記錄根因與修正，並確認死信工作已清除或已保留處理結果。

## 演練

以上流程已在本機以假日曆走過一次失敗→死信→補回，並固定為可回歸的 Emulator
測試（`tests/firestore/calendar-sync-runbook.test.ts`）。證據與逐步對應見
[Runbook 演練紀錄](../reviews/calendar-sync-runbook-rehearsal-2026-07-23.md)。

## 病患溝通

病患頁面只顯示「預約已成立、日曆同步處理中」或「已完成」。Calendar 未同步不應被表示為完整成功；必要時由櫃台以既有聯繫流程處理。

