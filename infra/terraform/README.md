# Infrastructure as Code 邊界

D-010 已核准診所擁有權、primary `asia-east1` 與 database／whole-project／regional
failure 的 RPO 1 小時／RTO 4 小時 target；這不是 C0 review、任何 C1～C6
deployment authority、Terraform plan 或復原證據。技術／資安／帳務負責人仍須
完成 project 與 billing 值、secondary design、命名／標籤、成本、最小 IAM、驗證
與逐資源 rollback 的審核，才能提出 C1 deployment request。C1 authority 不延伸到
C2～C6；每個後續 slice 都要自己的 request、deployment authority 與 apply approval。

**完整設計見 [基礎設施與維運計畫](../../docs/architecture/infrastructure-and-operations-plan-2026-07-24.md)**
與
[Stage 2 C0 readiness artifacts](../../docs/architecture/stage-2-c0-readiness-artifacts-2026-07-29.md)：
環境切分、logical resource manifest、remote state、service account／IAM、Secret
Manager、成本輸入、Firestore backup/PITR、DR options、監控、驗證與 rollback。
兩份文件原本都是 plan-only。2026-08-28 的 D-009／D-016 記錄新增了嚴格限縮的
30 天 CAL-PILOT synthetic-only 子範圍，因此 `cal-pilot/` 現在可保存**供最後部署
確認審閱的 Terraform 候選**；仍不得 `apply`，也不得把它解讀為一般 Stage 2、
production 或真實資料的 authority。候選不含 secret version，避免金鑰進入 state。

未來應分開管理：

- `environments/dev`、`environments/staging`、`environments/production`
- Cloud Run、服務帳號、Secret Manager 權限、Cloud Scheduler、監控、告警、Budget 與網路/WAF
- Firestore Rules 與索引則透過 Firebase CLI/受審核 CI 流程部署，不直接在 Console 手動修改

不得將 `.tfstate`、真實 project ID、服務帳號金鑰或患者資料提交至 repository。
