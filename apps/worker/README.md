# Worker（待實作）

責任：處理 outbox 工作、Google Calendar 同步、通知、webhook 後續處理與死信重送。

每個 handler 必須可重試、冪等，且不直接修改已鎖定的月結資料。

