# Infrastructure as Code 邊界

Terraform 在基礎設施建立前不可直接執行。先由技術負責人完成雲端帳務、組織政策、地區、命名、成本標籤與最小 IAM 的審核。

未來應分開管理：

- `environments/dev`、`environments/staging`、`environments/production`
- Cloud Run、服務帳號、Secret Manager 權限、Cloud Tasks、監控、告警、Budget 與網路/WAF
- Firestore Rules 與索引則透過 Firebase CLI/受審核 CI 流程部署，不直接在 Console 手動修改

不得將 `.tfstate`、真實 project ID、服務帳號金鑰或患者資料提交至 repository。

