# Infrastructure as Code 邊界

Terraform 在基礎設施建立前不可直接執行。先由技術負責人完成雲端帳務、組織政策、地區、命名、成本標籤與最小 IAM 的審核（D-010）。

**完整設計見 [基礎設施與維運計畫](../../docs/architecture/infrastructure-and-operations-plan-2026-07-24.md)**：環境切分、模組佈局、remote state、service account 與最小權限、Secret Manager 與輪替、Firestore 備份/PITR、監控告警與預算、部署核准與回滾。那份文件是 plan-only，本目錄在核准前維持只有這份說明。

未來應分開管理：

- `environments/dev`、`environments/staging`、`environments/production`
- Cloud Run、服務帳號、Secret Manager 權限、Cloud Tasks、監控、告警、Budget 與網路/WAF
- Firestore Rules 與索引則透過 Firebase CLI/受審核 CI 流程部署，不直接在 Console 手動修改

不得將 `.tfstate`、真實 project ID、服務帳號金鑰或患者資料提交至 repository。

