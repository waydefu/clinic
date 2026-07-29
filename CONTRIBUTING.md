# 開發與交接規約

1. 任何影響預約、個資、權限、日曆同步、計薪或 NAS 的變更，必須先建立或更新 ADR。
2. 所有 API 變更先改 `packages/contracts`；Web、Worker 與未來 App 都以該契約為準。
3. 禁止在 Pull Request、Issue、測試 fixture、截圖或日誌使用真實病患、薪資、日曆或服務帳號資料。
4. 新增資料欄位前，必須說明蒐集目的、最小化理由、存取角色、保存期限與刪除方式。
5. 涉及 `completed`、個管指派、`payroll_credit` 或月結鎖定的變更，必須包含重複計算、改派與鎖定後調整的測試。
6. 外部副作用（Calendar、Email、LINE、Meta、NAS）只能由 Worker 執行，必須具備 idempotency key、重試、死信與人工補救文件。
7. 不以免費額度、未記載的供應商行為或單一管理者帳號作為正式營運假設。

## 公開參考 repository

`waydefu/clinic` 是私有且唯一的專案權威來源。更新公開
`waydefu/appointment-platform-public` 時，只能從明確 allowlist 產生隔離的
sanitized candidate，再套用到公開 repository 的 fresh clone。

- 不得複製私有 `.git`、commit、branch、tag、PR metadata 或直接建立
  private-to-public fork／自動同步。
- 不得帶入診所／人員內容、品牌與人物資產、UI、截圖、內部決策／治理／
  review／交付文件、部署識別碼、私有網址、log、credential、個資或擬真的
  身分欄位。
- 每次更新都必須重新檢查候選 diff、tracked files、完整 public Git
  objects/refs、secret、個資與內部識別碼；並通過 build、test、dependency
  audit、Gitleaks、TruffleHog、fresh-clone 與 public PR required checks。
- 公開 mirror 不是 production release，也不改變 Phase、D-series 或部署／
  真實資料權限。公開可見不代表授予開源授權。

完整流程與初次發布證據見
[`docs/reviews/2026-07-29-sanitized-public-mirror-publication.md`](docs/reviews/2026-07-29-sanitized-public-mirror-publication.md)。
