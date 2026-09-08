# beauessence-clinic-staging 唯讀盤點（2026-09-09）

**狀態：** 日期化唯讀盤點。**不是** Canon、**不是** Stage 2、**不是** D-010
apply、**不是** exact-SHA 部署授權、**不是** production、**不是** 真實資料授權。
**日期：** 2026-09-09（Asia/Taipei）
**Repository 基準：** GitHub `main`
`dbbeed72463cf646cfa1c1a9782ebb5819aa584d`（`VERIFIED`，GitHub API／`origin/main`
2026-09-08T19:57Z）
**Cloud as-of：** 2026-09-08T20:12:27Z（Firebase CLI；本環境無 `gcloud`）
**Owner grant：** Q-STAGING — `beauessence-clinic-staging` 唯讀；secret **version
ID** 可記、**不得**讀值。禁止 terraform apply、firebase deploy、Cloud Run
traffic 變更、secret／IAM 變更、任何 cloud write。

本文件不得引用自己的 commit hash。查找：
`git log -- docs/reviews/2026-09-09-staging-readonly-inventory.md`

分類：`VERIFIED`（本 session 對目標專案讀回）／`OBSERVED`／`STALE`（過往 dated
紀錄）／`UNKNOWN`／`UNAVAILABLE`（本環境缺工具）／`CONFLICT`。

---

## 1. 一句話

Staging 專案身分、Hosting 三個 channel、Firestore `(default)` 與一個 Web App ID
已在本 session 讀回。Cloud Run 現行 revision／traffic、Secret version ID、IAM
policy 與 Auth 完整 provider 清單**沒有**本 session 讀回，不得拿 2026-08-31
紀錄當現況去 apply。

## 2. Project identity

| 欄位 | 值 | 分類 | 來源 |
| --- | --- | --- | --- |
| projectId | `beauessence-clinic-staging` | `VERIFIED` | Firebase MCP `firebase_list_projects` 2026-09-08T19:57Z |
| project number | `781119800251` | `VERIFIED` | 同上 |
| state | `ACTIVE` | `VERIFIED` | 同上 |
| Hosting site | `beauessence-clinic-staging` | `VERIFIED` | MCP；CLI `hosting:sites:list` 2026-09-08T20:12Z |
| Web App ID | `1:781119800251:web:db95e2dd7bb800e1f77a9e` | `VERIFIED` | `firebase apps:list`；**未**取 SDK config／apiKey |
| 其他 region | 除 CAL-PILOT 文件寫 `asia-east1` 外 | `UNKNOWN`（live）／`STALE`（文件） | 本環境無 `gcloud` |

未切換 Firebase MCP `active_project`（當時指向
`beauessence-appointment-local`，Firestore MCP 呼叫被該專案擋下）。目標專案改走
CLI `--project`。

## 3. Hosting（無 deploy）

`firebase hosting:channel:list --project beauessence-clinic-staging` at
2026-09-08T20:12:27Z：

| Channel | Last release (CLI) | URL | Expire | 分類 |
| --- | --- | --- | --- | --- |
| `synthetic-review` | 2026-09-08 07:37:28 | `https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app` | 2026-09-30 20:00:19 | `VERIFIED` |
| `cal-pilot` | 2026-09-03 16:39:43 | `https://beauessence-clinic-staging--cal-pilot-pk9yyofq.web.app` | 2026-10-01 19:06:13 | `VERIFIED` |
| `live` | 2026-08-22 22:43:48 | `https://beauessence-clinic-staging.web.app` | never | `VERIFIED` 存在；**禁止**本工作流對 live channel 部署 |

現行 Hosting **version ID** 本 session **未**讀回（`UNKNOWN`）。過往 version 只當
`STALE`：`synthetic-review` `832dfc10068e6f34`（2026-09-08 UI 預覽紀錄）；
`cal-pilot` `09ca5b147ea8e576`（2026-08-31 controlled-correction 紀錄）。

Default site URL `https://beauessence-clinic-staging.web.app` 綁同一 Web App ID
（`VERIFIED`）。這**不是** production 授權。

## 4. Cloud Run

本環境 `gcloud: command not found` → 現行 service／revision／traffic
`UNAVAILABLE`。

`STALE`（2026-08-31 controlled-correction post-apply，不得當現況 apply）：

- region `asia-east1`
- API revision `cal-pilot-api-00003-muy` 當時 100%
- Worker revision `cal-pilot-worker-00003-nuf` 當時 100%

## 5. Secret Manager

Secret **values 未讀**。Version ID 本 session `UNAVAILABLE`（無 `gcloud`）。

Terraform 宣告的 **names**（`STALE` 對 live 是否仍恰好這六個；
`infra/terraform/cal-pilot/main.tf` `local.secret_access`）：

- `cal-pilot-manager-allowlist`
- `cal-pilot-firebase-web-api-key`
- `cal-pilot-reader-service-account`
- `cal-pilot-writer-service-account`
- `cal-pilot-source-map`
- `cal-pilot-pseudonym-key`

2026-08-31 紀錄寫各 secret enabled version `1`（`STALE`）。未來 exact-SHA 封包必須
用 `gcloud secrets versions list`（只要 name／version／state）重讀。

## 6. Firestore

| 欄位 | 值 | 分類 |
| --- | --- | --- |
| database | `projects/beauessence-clinic-staging/databases/(default)` | `VERIFIED`（`firebase firestore:databases:list` 2026-09-08T20:12Z） |
| edition | `STANDARD` | `VERIFIED` |
| type | `FIRESTORE_NATIVE` | `VERIFIED` |
| indexes | — | `UNKNOWN`（本 session 未列） |
| documents | — | **未讀**（禁止） |

## 7. Auth

**未**呼叫 `auth_get_users`／未匯出使用者。完整現行 provider 清單 `UNKNOWN`。

`STALE`：2026-08-31／Day 1 紀錄寫 Google provider、TOTP／MFA 曾啟用。不得當
identity 變更授權。

## 8. IAM

本 session **未** `get-iam-policy`（避免整份 policy dump）。現行 principal／role
`UNKNOWN`。

`STALE` locators：`infra/terraform/cal-pilot/main.tf` API／Worker
`datastore.user`、API `firebaseauth.admin`、Secret Accessor、Worker
`run.invoker` 設計為 Scheduler。未來封包可用收斂的 role／member 表，不要貼完整
policy JSON。

## 9. 未來 exact-SHA 部署封包仍缺

在另一次具名、逐 commit 的部署授權之前，至少還要：

1. `gcloud run services describe`：現行 revision 名稱與 traffic 百分比（只讀）
2. 每個 secret 的 version ID＋state（不要 `versions access`）
3. 收斂 IAM GET（role／member，不要無差別 dump）
4. Hosting 現行 version ID（channel 以外）
5. Firestore index 中繼資料
6. Auth provider 中繼資料（不要 user 紀錄）
7. 候選 commit SHA、同 SHA `Verification evidence`、image／file provenance
8. 具名 approver／operator、channel、expiry、rollback 目標

本盤點**不能**填上述任何一項為已核准。

## 10. 既有文件 locators

- [2026-09-08 UI/UX synthetic-review 預覽](2026-09-08-ui-ux-redesign-synthetic-preview-deployment.md)
- [2026-08-31 CAL-PILOT controlled-correction](2026-08-31-cal-pilot-controlled-correction-deployment.md)
- [CAL-PILOT 30 天 runbook](../runbooks/cal-pilot-30-day-bidirectional-sync.md)
- `infra/terraform/cal-pilot/main.tf`、`outputs.tf`
- `scripts/cal-pilot-update.ps1`、`scripts/verify-preview-deployment.mjs`

## 11. 本 session 明確未做

terraform apply、firebase deploy、Cloud Run traffic 變更、secret／IAM 變更、
`firebase_init`、讀 secret 值、讀 Auth users、讀 Firestore documents、live
channel 部署、production、真實病患／臨床／薪資資料。

證據 rung：**`CODE-ONLY`**（日期文件）。Cloud 讀回是盤點，不是
`DEPLOYED-NOT-SMOKED`／`VERIFIED-PRODUCTION`。
