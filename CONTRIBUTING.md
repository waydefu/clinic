# 開發與交接規約

1. 任何影響預約、個資、權限、日曆同步、計薪或 NAS 的變更，必須先建立或更新 ADR。
2. 所有 API 變更先改 `packages/contracts`；Web、Worker 與未來 App 都以該契約為準。
3. 禁止在 Pull Request、Issue、測試 fixture、截圖或日誌使用真實病患、薪資、日曆或服務帳號資料。
4. 新增資料欄位前，必須說明蒐集目的、最小化理由、存取角色、保存期限與刪除方式。
5. 涉及 `completed`、個管指派、`payroll_credit` 或月結鎖定的變更，必須包含重複計算、改派與鎖定後調整的測試。
6. 外部副作用（Calendar、Email、LINE、Meta、NAS）只能由 Worker 執行，必須具備 idempotency key、重試、死信與人工補救文件。
7. 不以免費額度、未記載的供應商行為或單一管理者帳號作為正式營運假設。

