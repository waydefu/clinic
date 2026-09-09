# beauessence-clinic-staging 唯讀盤點（2026-09-09）

**狀態：** 日期化唯讀盤點。**不是** Canon、**不是** Stage 2、**不是** D-010
apply、**不是** exact-SHA 部署授權、**不是** production、**不是** 真實資料授權。
**日期：** 2026-09-09（Asia/Taipei）
**Repository 基準：** GitHub `main`
`496da6e80733f1421e08c99f30559709116d04e0`（`VERIFIED`，GitHub `origin/main`
at inventory write）
**Cloud as-of：** 2026-09-09T07:47:58Z–07:50:38Z（`gcloud` 583.0.0 + Firebase
CLI Hosting JSON；`--project beauessence-clinic-staging`；未
`gcloud config set project`）
**Owner grant：** Q-STAGING — `beauessence-clinic-staging` 唯讀；secret **version
ID** 可記、**不得**讀值。禁止 terraform apply、firebase deploy、Cloud Run
traffic 變更、secret／IAM 變更、任何 cloud write。

本文件不得引用自己的 commit hash。查找：
`git log -- docs/reviews/2026-09-09-staging-readonly-inventory.md`

分類：`VERIFIED`（本 session 對目標專案讀回）／`OBSERVED`／`STALE`（過往 dated
紀錄）／`UNKNOWN`／`UNAVAILABLE`（本環境缺工具）／`CONFLICT`。

---

## 1. 一句話

Staging 專案身分、Hosting 三 channel 與現行 version ID、Firestore `(default)`
與七筆 READY composite index 中繼資料、Cloud Run `asia-east1` 兩服務現行
revision／traffic、六個 CAL-PILOT secret 的 version `1`＋`enabled`、以及收斂
project／secret／Cloud Run IAM，已在本 session 讀回。Auth 完整 provider 清單
仍 `UNKNOWN`（Identity Toolkit admin config `403`；未讀 users）。本盤點**不能**
當 apply 或 live-channel 部署授權。

## 2. Project identity

| 欄位 | 值 | 分類 | 來源 |
| --- | --- | --- | --- |
| projectId | `beauessence-clinic-staging` | `VERIFIED` | `gcloud projects describe` 2026-09-09T07:47:58Z |
| project number | `781119800251` | `VERIFIED` | 同上 |
| state | `ACTIVE` | `VERIFIED` | 同上 |
| display name | BeauEssence Clinic Staging | `VERIFIED` | 同上 |
| Hosting site | `beauessence-clinic-staging` | `VERIFIED` | Firebase CLI `hosting:channel:list` |
| Web App ID | `1:781119800251:web:db95e2dd7bb800e1f77a9e` | `VERIFIED` | 先前 session `firebase apps:list`；本 session **未**重取 SDK config／apiKey |
| region | `asia-east1`（Cloud Run URLs `*-de.a.run.app`） | `VERIFIED` | `gcloud run services list --region asia-east1` |

## 3. Hosting（無 deploy）

`firebase hosting:channel:list --project beauessence-clinic-staging --json` at
2026-09-09T07:50Z：

| Channel | Version ID | Create (UTC) | Expire (UTC) | URL | 分類 |
| --- | --- | --- | --- | --- | --- |
| `synthetic-review` | `832dfc10068e6f34` | 2026-09-07T23:37:20Z | 2026-09-30T12:00:19Z | `https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app` | `VERIFIED` |
| `cal-pilot` | `ae1ef7f097243b1a` | 2026-09-03T08:39:01Z | 2026-10-01T11:06:13Z | `https://beauessence-clinic-staging--cal-pilot-pk9yyofq.web.app` | `VERIFIED` |
| `live` | `67055a24b10745ea` | 2026-08-22T14:43:43Z | never | `https://beauessence-clinic-staging.web.app` | `VERIFIED` 存在；**禁止**本工作流對 live channel 部署 |

`cal-pilot` Hosting version `ae1ef7f097243b1a` 與 API Cloud Run traffic tag
`fh-ae1ef7f097243b1a` 一致（`VERIFIED`）。較舊 API tagged revision
`cal-pilot-api-00003-muy` 的 tag `fh-09ca5b147ea8e576` 仍存在、**0%** traffic。

這**不是** production 授權。

## 4. Cloud Run

`gcloud run services list/describe` `--region asia-east1` at
2026-09-09T07:47:58Z–07:49Z。**未**改 traffic。

| Service | Latest ready | Traffic | Tagged (0%) | 分類 |
| --- | --- | --- | --- | --- |
| `cal-pilot-api` | `cal-pilot-api-00004-64c` | 100% → `00004-64c` | `00003-muy` tag `fh-09ca5b147ea8e576` | `VERIFIED` |
| `cal-pilot-worker` | `cal-pilot-worker-00003-nuf` | 100% → `00003-nuf` | — | `VERIFIED` |

Image digests（Artifact Registry `asia-east1-docker.pkg.dev/…/cal-pilot/…`）：

| Revision | Image digest | 分類 |
| --- | --- | --- |
| `cal-pilot-api-00004-64c` | `sha256:9bcd90b35befea80a8a3636f3418c2953f38ccd2d165f1d9bed75e90d58e7a94` | `VERIFIED` |
| `cal-pilot-api-00003-muy` | 同上（與 `00004-64c` 同一 digest） | `VERIFIED` |
| `cal-pilot-worker-00003-nuf` | `sha256:cbfbfbe36615f743aea0162d88ca3742fd1b03b74056a2d8fbb73014aac15f88` | `VERIFIED` |

Service URLs：`https://cal-pilot-api-s2e7555xmq-de.a.run.app`、
`https://cal-pilot-worker-s2e7555xmq-de.a.run.app`。

2026-08-31 紀錄寫 API `00003-muy` 100% — 對現行 traffic 為 `STALE`（該 revision
仍 tagged、0%）。Worker `00003-nuf` 100% 與當時紀錄一致，本 session 重讀為
`VERIFIED`。

## 5. Secret Manager

Secret **values 未讀**（無 `versions access`）。`gcloud secrets list` 名稱恰好
Terraform `local.secret_access` 六個（`VERIFIED`）：

| Secret | Version ID | State | Created (UTC) | Accessor | 分類 |
| --- | --- | --- | --- | --- | --- |
| `cal-pilot-firebase-web-api-key` | `1` | `enabled` | 2026-08-30T05:30:32Z | `cal-pilot-api@…` `secretAccessor` | `VERIFIED` |
| `cal-pilot-manager-allowlist` | `1` | `enabled` | 2026-08-30T05:30:29Z | `cal-pilot-api@…` `secretAccessor` | `VERIFIED` |
| `cal-pilot-pseudonym-key` | `1` | `enabled` | 2026-08-30T05:30:38Z | `cal-pilot-worker@…` `secretAccessor` | `VERIFIED` |
| `cal-pilot-reader-service-account` | `1` | `enabled` | 2026-08-30T05:30:18Z | `cal-pilot-worker@…` `secretAccessor` | `VERIFIED` |
| `cal-pilot-source-map` | `1` | `enabled` | 2026-08-30T05:30:25Z | `cal-pilot-worker@…` `secretAccessor` | `VERIFIED` |
| `cal-pilot-writer-service-account` | `1` | `enabled` | 2026-08-30T05:30:22Z | `cal-pilot-worker@…` `secretAccessor` | `VERIFIED` |

沒有第七個 secret 名稱出現在 `secrets list`。2026-08-31「各 version `1`」現已
本 session 重讀，不再只當 `STALE`。

## 6. Firestore

| 欄位 | 值 | 分類 |
| --- | --- | --- |
| database | `projects/beauessence-clinic-staging/databases/(default)` | `VERIFIED`（先前 session CLI；本 session 未重列 databases） |
| edition | `STANDARD` | `VERIFIED`（先前 session） |
| type | `FIRESTORE_NATIVE` | `VERIFIED`（先前 session） |
| composite indexes | 7 筆 `READY`／`COLLECTION` | `VERIFIED`（`gcloud firestore indexes composite list`） |
| documents | — | **未讀**（禁止） |

Index 中繼資料（field path only；不是文件內容）：

| Index ID | Fields |
| --- | --- |
| `CICAgJim14AJ` | `sourceId ASC`, `externalEventId ASC`, `__name__ ASC` |
| `CICAgJim14AK` | `status ASC`, `createdAt ASC`, `__name__ ASC` |
| `CICAgOjXh4EK` | `status ASC`, `nextAttemptAt ASC`, `__name__ ASC` |
| `CICAgJj7z4EK` | `status ASC`, `startsAt ASC`, `__name__ ASC` |
| `CICAgJjF9oIK` | `status ASC`, `createdAt ASC`, `__name__ ASC` |
| `CICAgJiUpoMK` | `status ASC`, `leaseExpiresAt ASC`, `__name__ ASC` |
| `CICAgJjFqZMK` | `status ASC`, `leaseExpiresAt ASC`, `__name__ ASC` |

## 7. Auth

**未**呼叫 `auth_get_users`／未匯出使用者。完整現行 provider 清單
`UNKNOWN`：`GET …/identitytoolkit.googleapis.com/admin/v2/projects/beauessence-clinic-staging/config`
回 `403`。未安裝／未用 `gcloud beta identity-platform`（避免非互動安裝提示）。

`STALE`：2026-08-31／Day 1 紀錄寫 Google provider、TOTP／MFA 曾啟用。不得當
identity 變更授權。

## 8. IAM（收斂；無完整 policy JSON）

`gcloud projects get-iam-policy`：17 bindings、18 列 compact role／member；
**1** 個 `user:` principal 記為 `user:<redacted>`（`roles/owner`），不寫入信箱。
本文件不貼完整 policy。

與 CAL-PILOT 相關的 project 角色（`VERIFIED`）：

- `cal-pilot-api@…`：`roles/datastore.user`、`roles/firebaseauth.admin`
- `cal-pilot-worker@…`：`roles/datastore.user`
- `cal-pilot-builder@…`：`roles/logging.logWriter`、`roles/storage.objectViewer`
- Google／Firebase service agents 與 Cloud Build／Compute `editor` 亦存在；不在
  此重複完整 Google-managed agent 表

Cloud Run service IAM（`VERIFIED`）：

- `cal-pilot-worker`：`roles/run.invoker` →
  `cal-pilot-scheduler@beauessence-clinic-staging.iam.gserviceaccount.com`
- `cal-pilot-api`：`roles/run.invoker` → `allUsers`

Scheduler（`VERIFIED`）：`cal-pilot-five-minute-sync` `*/5 * * * *` `ENABLED` →
`https://cal-pilot-worker-s2e7555xmq-de.a.run.app/tasks/calendar-sync`。

`allUsers` invoker 是盤點觀察，**不是**本工作流的變更授權或 hardening 任務。

## 9. 未來 exact-SHA 部署封包仍缺

在另一次具名、逐 commit 的部署授權之前，至少還要：

1. ~~現行 revision 名稱與 traffic 百分比~~ — 本盤點已讀；仍不是部署授權
2. ~~每個 secret 的 version ID＋state~~ — 本盤點已讀；仍禁止 `versions access`
3. ~~收斂 IAM GET~~ — 本盤點已讀；禁止 set-iam-policy
4. ~~Hosting 現行 version ID~~ — 本盤點已讀
5. ~~Firestore index 中繼資料~~ — 本盤點已讀
6. Auth provider 中繼資料（不要 user 紀錄）— 仍 `UNKNOWN`（admin config `403`）
7. 候選 commit SHA、同 SHA `Verification evidence`、image／file provenance
   對**新**部署目標（現行 image digest 已讀，不是新 SHA 授權）
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
