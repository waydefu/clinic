# 2026-11-16 MAINTENANCE、SECRETS、C2、C5 唯讀讀回

狀態：**唯讀讀回完成；沒有任何雲端變更**。原排 11/17 的唯讀批次，負責人同意提前到 2026-11-16 晚上（約 12:30–12:45 UTC）做。只讀 C1 專案 `beauessence-clinic-stg-c1a01`。Terraform plan 用 `-lock=false`，不寫入狀態檔；密鑰只讀名稱、版本狀態和權限，不讀內容。main 為 `b57d802eb2207266049a0f5d6e974137c7c9bffe`。人員帳號一律遮蔽。

## C2 員工登入（Identity）

| 項目 | 讀回 |
| --- | --- |
| Terraform 狀態 | `c2-identity` serial 2（2026-09-11，Terraform 1.9.8）；只有 `google_project_service` `identitytoolkit.googleapis.com` |
| Terraform plan（現行 main） | **No changes** |
| Identity Platform MFA | `ENABLED`；TOTP `ENABLED`，`adjacentIntervals=1` |
| 登入方式 | 預設 IdP 只有 `google.com`（enabled）；email／匿名／電話未啟用 |
| 授權網域 | 3 個：`…firebaseapp.com`、`…web.app`、一個 `synthetic-review` 預覽頻道網域 |
| 多租戶、blocking functions | 未使用 |
| 現行 API | `internal-test-api-00038-gsm`，映像 `sha256:f70721cf…`（main `df63bb85`，含 C3 七天 session） |

結論：雲端與 repo 一致，C2 申請中的「預期無差異」成立。部署後 smoke（停權下一個請求被拒）仍待 C2 部署窗口。授權網域裡的預覽頻道網域已過期，之後可移除（要另外核准）。

## C5 稽核（Firestore）

| 項目 | 讀回 |
| --- | --- |
| Terraform 狀態 | `c5-firestore` serial 4（2026-11-06，Terraform 1.16.2）：database、每日備份排程、`bd_export_chunks.purgeAt` TTL、Firestore API |
| Terraform plan（現行 main） | **No changes** |
| 資料庫 | `(default)`、`FIRESTORE_NATIVE`、`asia-east1`、PITR 開、刪除保護開、版本保留 7 天（最早 2026-11-09T12:34Z） |
| 備份排程 | 1 個，每日，保留 30 天；目前 30 份 `READY`，最新一份到期 2026-12-16 |
| TTL | `bd_export_chunks.purgeAt` `ACTIVE` |

結論：雲端與 repo 一致，C5 申請中的「那 2 筆變更」已在 11/06 套用。負責人 11/15 決定的每週備份（14 週）與每月專案外匯出（2 年）**還沒有**，要另寫 Terraform，在 C5 窗口逐項核准。

## MAINTENANCE（E3-07）

| 項目 | 讀回 |
| --- | --- |
| 控制文件 | Firestore `platform_controls/maintenance` = `underMaintenance: true`（11/16 關窗時設定） |
| 實測（11/16 窗口） | `false` 時 API 正常；`true` 時直連 run.app 的 `/v1/bookings`、`/v1/calendar-session/client-config` 回 503；Business Delivery 關閉時回 404（見[當天報告](2026-11-16-c1-window-rc06-c3-c4.md)） |
| 誰讀控制文件 | 只有 API（`apps/api/src/platform/runtime/maintenance-gate.ts`、`maintenance.guard.ts`） |
| worker | `internal-test-outbox` 不讀控制文件，靠 `INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED=false` 與排程暫停；`internal-test-calendar-sync` 不讀控制文件，靠排程暫停 |
| 排程 | `internal-test-calendar-sync`、`internal-test-outbox-drain` 都 `PAUSED` |
| 誰能寫 Firestore | 專案層 `roles/datastore.user`：api、calendar-sync、outbox 三個服務帳號；`roles/owner`：1 個人員帳號 |

結論：**不能宣稱「全域停寫」**。[外部驗收 runsheet §5](../plans/2026-10-25-external-acceptance-runsheet.md) 要求全部 writer 都受同一個控制，但 worker 不讀控制文件，只靠環境變數與排程暫停。另外，三個服務帳號都有整個資料庫的寫入權，理論上都能改控制文件。runsheet 的逐 writer 探針、反例與排空測試需要另外的精確授權，本次未做，仍是 NOT_RUN。

## SECRETS（B-31、B-55）

| 密鑰 | 版本 | 可讀取者（密鑰層） |
| --- | --- | --- |
| `c1-bootstrap-reserved` | 無版本 | 無 |
| `c1-business-delivery-maintenance-emails` | v1 enabled | api |
| `c1-calendar-pseudonym-key` | v1 enabled | calendar-sync |
| `c1-calendar-service-account-json` | v1 enabled（2026-09-15） | **無** |
| `c1-staff-firebase-web-api-key` | v1 enabled | api |
| `c1-staff-front-desk-allowlist` | v1、v2 都 enabled | api |
| `c1-staff-manager-allowlist` | v1 enabled | api |
| `c1-synthetic-calendar-id` | v1、v2 都 enabled | calendar-sync、outbox |

全部 user-managed 複寫在 `asia-east1`，沒有設到期或輪替。專案層：`c1-terraform-ci` 有 `secretmanager.admin` 與 `iam.serviceAccountUser`；`firebase-adminsdk-fbsvc` 有 `iam.serviceAccountTokenCreator`。本專案所有服務帳號都**沒有**使用者管理的金鑰。

發現：

1. `c1-calendar-service-account-json` 名稱看起來是服務帳號 JSON 金鑰，沒有任何服務能讀，本專案也沒有使用者管理金鑰。內容沒讀，不能判斷是另一個專案的有效金鑰、已撤銷的金鑰，還是佔位。建議負責人確認後停用這個版本（停用可回復，要另外核准）。
2. `c1-staff-front-desk-allowlist` v1 與 `c1-synthetic-calendar-id` v1 已被 v2 取代，但仍是 enabled。建議停用舊版本（要另外核准）。

runsheet §7 要求的是「逐工具 admission-before-read canary」與上傳清單檢查，對象是本機工具（Hermes、Claude Code、Codex），不是雲端密鑰。這部分本次未做，仍是 NOT_RUN，需要負責人核准工具清單與 canary 路徑。
