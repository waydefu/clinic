# Infrastructure as Code 邊界

D-010 已核准診所擁有權、primary `asia-east1` 與 database／whole-project／regional
failure 的 RPO 1 小時／RTO 4 小時 target。C0 工程已 `completed`；C1 僅
`granted`（開始隔離地基 packet），不是 C1 PASS，也不延伸到 C2～C6。
本目錄的 apply 仍要 exact SHA 與本機 ADC；agent sandbox 不執行 apply。

**完整設計見 [基礎設施與維運計畫](../../docs/architecture/infrastructure-and-operations-plan-2026-07-24.md)**
與
[Stage 2 C0 readiness artifacts](../../docs/architecture/stage-2-c0-readiness-artifacts-2026-07-29.md)：
環境切分、logical resource manifest、remote state、service account／IAM、Secret
Manager、成本輸入、Firestore backup/PITR、DR options、監控、驗證與 rollback。
兩份文件原本都是 plan-only。2026-08-28 的 D-009／D-016 記錄新增了嚴格限縮的
30 天 CAL-PILOT synthetic-only 子範圍，因此 `cal-pilot/` 現在可保存**供最後部署
確認審閱的 Terraform 候選**；仍不得 `apply`，也不得把它解讀為一般 Stage 2、
production 或真實資料的 authority。候選不含 secret version，避免金鑰進入 state。

`c1-foundation/` 是第一階段 C1 隔離地基來源：C1 `deploymentAuthorities=granted`
但預設 `exact_apply_authority_sha = not_granted` 時不建立任何資源，且拒絕
`beauessence-clinic-staging`。Agent sandbox 不執行 apply；本機 packet 才 apply。
`c2-identity/` 與 `c5-firestore/` 同樣 SHA-gated、預設不建立資源，且 C2／C5
`deploymentAuthorities` 仍為 `not_granted`。不得把 C2 Identity 或 C5 Firestore
混進 C1。

未來應分開管理：

- `environments/dev`、`environments/staging`、`environments/production`
- Cloud Run、服務帳號、Secret Manager 權限、Cloud Scheduler、監控、告警、Budget 與網路/WAF
- Firestore Rules 與索引則透過 Firebase CLI/受審核 CI 流程部署，不直接在 Console 手動修改

不得將 `.tfstate`、真實 project ID、服務帳號金鑰或患者資料提交至 repository。
