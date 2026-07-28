# 基礎設施與維運計畫（2026-07-24）

**狀態：** **設計文件，未執行。** 沒有建立任何雲端資源，沒有執行任何
`terraform apply`，沒有申請任何 project。

這份文件把[正式環境目標架構](production-target-architecture-2026-07-23.md)的
ARCH-08（「production infrastructure 尚未形成 executable architecture」）展開成
可審查的設計：環境怎麼切、Terraform 怎麼組、權限怎麼給、備份與監控怎麼定。

**它不自行解除 deployment gate。** D-010 已於 2026-07-28 核准診所所有權、
`asia-east1` primary region 與 RPO 1 小時／RTO 4 小時 target（含 project／region
failure）。具體 project ID、runtime、跨區復原、alert owner 與成本政策仍須進
Stage 2 change plan；D-006 已於 2026-07-28 核准，但在 change plan 與 deployment
action 另行核准前仍不得開資源。

## 1. 環境模型

三個**完全分離的 GCP project**，不是同一個 project 裡的三組資源。共用 project
會讓「staging 的錯誤設定影響 production」變成可能，而診所資料承受不起這種可能。

| 環境 | 用途 | 資料 | 誰能部署 |
| --- | --- | --- | --- |
| `dev` | 開發者自用、可隨時重建 | 合成 | 工程師自己 |
| `staging` | 決策核准前的驗證環境 | **只能合成** | CI（自動） |
| `production` | 正式 | 真實患者資料 | CI，且需人工核准 |

命名慣例提案（待 Stage 2 change review）：`beauessence-<env>`，資源名一律帶
環境後綴，避免在 Console 上把兩個環境看錯。目前的
`beauessence-clinic-staging` 只用於合成預覽 Hosting，不是本文件所指的 staging
應用環境。

**primary region**：D-010 已核准 `asia-east1`（台灣）。跨境傳輸與正式資料的
法遵判斷仍屬 D-001～D-003；此外，D-010 的 regional-failure RPO/RTO target
要求 Stage 2 另設可驗證的跨區／替代區復原路徑，不能只部署單區後宣稱達標。

## 2. Terraform 佈局

```text
infra/terraform/
  modules/
    project-baseline/     # API 啟用、組織政策、稽核日誌、預算
    firestore/            # database、索引、備份排程、PITR、刪除保護
    api-service/          # Cloud Run 服務、service account、autoscaling
    worker-service/       # Cloud Run job／service、Scheduler、佇列
    secrets/              # Secret Manager secret 與存取繫結
    observability/        # log sink、metric、alert policy、通知管道
    hosting/              # Firebase Hosting site 與自訂網域
  environments/
    dev/
    staging/
    production/
```

規則：

- **環境目錄只做組裝與參數**，資源定義一律在 `modules/`。三個環境用同一份
  模組，差異只在變數——否則 staging 驗過的東西不代表 production 也是那樣。
- **remote state**：每個環境一個 GCS bucket（開啟版本控管與 uniform bucket-level
  access），state 加鎖。`.tfstate` 永遠不得進 repository。
- **plan 與 apply 分離**：CI 對 PR 跑 `terraform plan` 並把輸出貼回 PR；`apply`
  只在合併後、且 production 需要人工核准才執行。
- **不得手動改**：Console 上的手動修改會讓下一次 apply 把它抹掉或報 drift。
  Firestore Rules 與索引例外——它們走 Firebase CLI 的受審核 CI 流程部署
  （見 [Firestore 本機基線](firestore-local-baseline.md)）。
- repository 內**不得出現**真實 project ID、金鑰、患者資料（`.gitignore` 與
  `scripts/check-tracked-secrets.mjs` 已在把關）。

## 3. 身分與權限

### 3.1 service account 分離

一個 service account 一個用途。共用 service account 會讓稽核日誌變得無法歸因。

| Service account | 用途 | 需要的權限（最小） |
| --- | --- | --- |
| `api-runtime` | Domain API | Firestore 讀寫（限應用集合）、寫稽核日誌、讀指定 secret |
| `worker-runtime` | Outbox worker | Firestore 讀寫（限 outbox／calendar_links）、讀日曆憑證 secret |
| `deployer` | CI 部署 | Cloud Run deploy、Hosting deploy、**不得**有資料讀取權 |
| `terraform` | 基礎設施 | 各資源的 admin，**限該環境的 project** |

明確禁止：`roles/owner`、`roles/editor`，以及任何跨環境的權限繫結。

### 3.2 CI 的身分

CI 用 **Workload Identity Federation**，不下載 service account 金鑰檔。金鑰檔
一旦存在就會被複製、被貼進聊天室、被留在磁碟——這個專案已經有一份日曆金鑰在
負責人的桌面上，那是刻意的臨時安排（見
[日曆 go-live runbook](../runbooks/calendar-go-live.md)），不是常態。

### 3.3 人的權限

- 日常沒有人有 production 的資料讀取權；需要時走**時限性提權**並留紀錄。
- 診所端人員不進 GCP Console，操作一律經由工作臺（因此工作臺的權限模型必須
  完整——這正是 `apps/api/src/platform/authorization/rbac.ts` 的候選矩陣要做的事）。

## 4. 密鑰管理

| Secret | 內容 | 輪替 | 讀取者 |
| --- | --- | --- | --- |
| `google-calendar-service-account` | 日曆服務帳戶 JSON | 90 天 | `worker-runtime` |
| `idp-client-secret` | 員工登入的 IdP 憑證（D-006） | 90 天 | `api-runtime` |
| `delegated-authorization-pepper` | 授權碼 KDF 的 optional pepper；hash/salt 仍存資料庫 | 依 Stage 2 security review | `api-runtime` only |
| `notification-channel-token` | 告警通知管道 | 180 天 | `observability` |

規則：

- 值只存在 Secret Manager，程式只透過**環境變數注入的 secret 參照**取得
  （現有的 `GOOGLE_SERVICE_ACCOUNT_JSON` 慣例維持不變）。
- 每個 secret 都要有版本，輪替時先加新版本、確認服務讀到新版本、再停用舊版本。
  **不要先刪再加**——那是一段必然的停機。
- 輪替演練納入季度維運工作；日曆憑證的輪替步驟寫在
  [日曆同步失敗 runbook](../runbooks/calendar-sync-failure.md) 的延伸段落
  （待 Stage 3 補）。

## 5. Firestore

| 項目 | 設計 |
| --- | --- |
| location | D-010 已核准 primary `asia-east1`；正式資料仍待 D-001～D-003 法遵／跨境確認 |
| 索引 | 以檔案定義並經 CI 部署，不在 Console 手動加 |
| 備份 | 每日排程備份，保留 30 天 |
| PITR | 開啟，保留 7 天 |
| 刪除保護 | database 開啟 delete protection |
| 規則 | deny-all 基線，只有 Domain API 能寫（[ADR-0001](../adr/0001-domain-api-is-the-only-write-path.md)、[ADR-0003](../adr/0003-firestore-direct-client-access-is-deny-by-default.md)） |

備份與還原的操作程序、RTO/RPO 與演練要求見
[備份與還原 runbook](../runbooks/backup-and-restore.md)。

## 6. 監控、日誌與預算

### 6.1 要看的訊號

| SLI | 建議 SLO | 為什麼是這個 |
| --- | --- | --- |
| 預約建立成功率 | ≥ 99.5%（月） | 這是患者唯一會直接感受到的路徑 |
| API p95 延遲 | ≤ 800ms | 超過這個數字，患者會重複按送出 |
| outbox 待處理積壓 | p95 ≤ 60 秒 | 積壓代表日曆與真實狀態不一致的視窗 |
| 死信數量 | 任何一筆都要有人看 | 死信不是統計數字，是一筆沒送出去的預約 |

### 6.2 告警

- **會叫醒人的**：預約建立成功率跌破門檻、Firestore 交易錯誤率飆升、死信出現。
- **只進工作日佇列的**：延遲退化、備份失敗（當日可補）、預算達 80%。
- 每一條告警都要對應一份 runbook。**沒有 runbook 的告警不要建**——半夜被叫醒
  卻沒有處置步驟，只會訓練出忽略告警的習慣。

### 6.3 日誌

- 應用日誌**不得**寫入患者識別資料；以 appointment ID 與 correlation ID 追查
  （worker 的 trace contract 已在 `apps/worker/src/worker-observability.ts`）。
- 稽核日誌獨立保存、append-only，保留期依隱私政策（D-001～D-003）決定，
  不由工程端自行設定。
- 一般應用日誌保留 30 天；安全相關日誌另議。

### 6.4 預算

每個環境設 budget alert（50%／80%／100%）。production 的成本上限與超支處置
由技術負責人核准；**不設自動停用**——停用 production 比超支更糟。

## 7. 部署與回滾

| 對象 | 部署方式 | 回滾方式 |
| --- | --- | --- |
| Web（Hosting） | CI 建置 dist 後部署 | Hosting 版本回滾（保留前 10 版） |
| API（Cloud Run） | 新 revision，流量漸進切換 | 切回前一個 revision |
| Worker | 新 revision | 切回前一個 revision；處理中的工作靠冪等保護 |
| Firestore 索引 | CI 部署 | 索引可刪，但**建立需時**，回滾前先確認查詢還能跑 |
| Firestore 資料 | 不適用 | **不可回滾**——見下 |

**資料變更不可回滾**，這是所有部署設計裡唯一真正不可逆的部分。任何 migration
都必須：先加欄位、雙寫、驗證、才停用舊欄位；每一步都能單獨回滾。「改欄位名稱」
這種一步到位的做法在有真實患者資料之後一律禁止。

production 部署需要人工核准（GitHub Environments 的 required reviewers），
核准者不得是提交者本人。

## 8. 尚未決定 / 待核准

| 項目 | 卡在 | 影響 |
| --- | --- | --- |
| project ID、region、帳務 | D-010 | 整份 Terraform 無法 apply |
| IdP、MFA、session、撤銷與授權碼政策 | D-006 已核准；實作參數依 Stage 2 change review | `api-runtime` 的權限、session state 與 secret 清單 |
| 一般資料保存期限 | D-001～D-003 | 備份保留期、日誌保留期、PITR 視窗 |
| Audit | D-006 已核准永久 append-only／任何角色不得修改刪除；D-002 仍決定查閱、匯出及可識別連結 | 專用 write path、delete deny、容量／成本與 pseudonymization |
| 日曆正式接線 | D-009 | `worker-runtime` 的 secret 與告警 |
| 成本上限與超支處置 | 技術負責人 | budget alert 門檻 |

## 9. 這份計畫沒有涵蓋的

- **災難復原的跨區設計**：單區 Firestore 已有 PITR 與備份；跨區複寫的成本與
  複雜度，在診所規模下需要先看 RTO/RPO 的實際要求（見 backup runbook）再談。
- **WAF／DDoS**：目前只有應用層的 rate limit 骨架
  （`apps/api/src/platform/runtime/rate-limiter.ts`）。邊緣防護要等公開預約
  路由真的開啟（Stage 4）。
- **多租戶**：現階段是單一診所。二代專案的多租戶方向另案評估。

## 相關文件

- [正式環境目標架構](production-target-architecture-2026-07-23.md) — ARCH-08 的原始落差描述
- [worker 執行與對帳計畫](worker-runtime-and-reconciliation-plan-2026-07-24.md) — 觸發器、對帳與死信操作權限
- [備份與還原 runbook](../runbooks/backup-and-restore.md) — RTO/RPO 與還原演練
- [事故應變 runbook](../runbooks/incident-response.md) — 分級、角色與通報
- [前端與供應鏈品質把關](web-quality-gates-2026-07-24.md) — CI gate 全景
- [正式化後續實作規劃](../product/production-readiness-delivery-plan-2026-07-23.md) — Infrastructure／Operations backlog
