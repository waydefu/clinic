# 2026-11-17 C1 IAM 讀回、CI 帳號停用與 SESSION E4-14 判斷

狀態：**唯讀盤點完成；一項經負責人核准的變更（停用 `c1-terraform-ci`）已完成並讀回**。只讀寫 C1 專案 `beauessence-clinic-stg-c1a01`，沒有碰 CAL-PILOT。main 為 `3908033ca60981f4e94db80414ab66e0ae44acfc`。人員帳號一律遮蔽，不含 token 或密鑰內容。對應 [SOL-IAM](../plans/2026-11-08-phase1-rc-packets.md) 下一步 1～3 與 SOL-SESSION 的 E4-14。

## 1. 唯讀盤點（約 12:50–13:00 UTC）

只用 `gcloud ... list / describe / get-iam-policy`。

| 項目 | 雲端現況 | repo 來源 | 判斷 |
| --- | --- | --- | --- |
| `c1-terraform-ci` 專案層角色 | 13 個：serviceUsageAdmin、iam.serviceAccountAdmin、iam.workloadIdentityPoolAdmin、resourcemanager.projectIamAdmin、secretmanager.admin、logging.admin、monitoring.admin、pubsub.admin、storage.admin，加上 run.admin、artifactregistry.admin、cloudscheduler.admin、iam.serviceAccountUser | `c1-foundation/main.tf` 9 個（[README B-01 對應表](../../infra/terraform/c1-foundation/README.md)）＋ `c1-internal-test-run/main.tf` `terraform_ci_stage_f` 4 個 | 與來源一致。B-01 仍成立：持有 projectIamAdmin 可替自己加任何角色，實質接近 Owner |
| WIF provider `c1-github/github-oidc` 條件 | `assertion.repository == 'waydefu/clinic'` | 來源已要求 repository、repository_id、repository_owner_id 與允許 ref 四項 | **雲端落後來源**：B-02 修正尚未 apply，任何分支的 workflow 理論上都能換到 CI 身分 |
| 實際使用者 | `.github/workflows/` 6 個 workflow 都沒有 WIF／`workload_identity_provider`；沒有 Cloud Build trigger；Cloud Run 與 Scheduler 都用各自的服務帳號 | — | **閒置**。C1 窗口一律由負責人本人 ADC 執行 |
| `firebase-adminsdk-fbsvc` | 專案層 `iam.serviceAccountTokenCreator`、`firebase.sdkAdminServiceAgent` | 不在 Terraform | Firebase 自動授予的預設；移除可能影響登入，本次不動 |
| 預設 compute 帳號 | `cloudbuild.builds.builder`；tfstate bucket `storage.objectAdmin`（Cloud Build 帳號同） | 不在 Terraform | NEW-10 範圍：建置身分可寫 Terraform 狀態。11/23 窗口建映像仍需要，本次不動，列待辦 |
| 使用者管理金鑰 | 8 個服務帳號皆 0 | — | 符合 B-09 無長期金鑰 |
| 人員 | `roles/owner` 1 個人員帳號 | — | 預期（負責人） |
| condition 綁定 | 無 | — | — |

服務帳號共 8 個：internal-test-api、internal-test-calendar-sync、internal-test-outbox、internal-test-scheduler、internal-test-builder、c1-terraform-ci、firebase-adminsdk-fbsvc、預設 compute。除 c1-terraform-ci（WIF principalSet）外，各帳號自身政策皆為空。

## 2. 變更：停用 `c1-terraform-ci`（負責人核准）

- 13:15 UTC `gcloud iam service-accounts disable`。可用 `enable` 恢復；角色、WIF 與帳號本身都沒有刪。
- 停用前確認：沒有 Cloud Run 服務、Cloud Run job、Scheduler job 或 Cloud Build trigger 使用此帳號；沒有 workflow 使用 WIF。
- 讀回：`disabled: True`；Hosting `/booking`、`/staff` 都是 200。
- 效果：B-01 的過大權限與 B-02 的寬鬆 WIF 條件目前無法被使用。兩個 finding 的來源與 IaC 修正仍未完成，**不算關閉**。
- 已知差異：之後 `c1-foundation` plan 會出現把帳號改回啟用的差異。要讓 CI 使用此帳號時，須在同一次核准中 apply B-02 條件並重審 B-01 角色。

## 3. SESSION：E4-14 判斷

manifest 把 E4-14 標為 `ownerPolicyDecisionRequired: false`，屬技術判斷，不需負責人決定。

讀 main 程式（`apps/api/src/auth/calendar-pilot-session.ts` `authenticate`）的結果，員工每個請求都會：

1. `verifySessionCookie(cookie, true)`：Firebase 檢查撤銷與停用；
2. 依目前 allowlist 重新算角色，並要求 email 已驗證與 TOTP 第二因子；
3. `getUser(uid)`，`disabled` 時丟 `DisabledAccountError`；
4. 在交易中確認伺服器端 session 紀錄有效（含 7 天絕對到期）；`lastSeenAt` 最多每 60 秒寫一次（NEW-07 已有界）。

判斷：**帳號是否有效的權威來源是 Identity Platform 的 `disabled` 與 refresh token 撤銷，在 session 驗證層逐請求檢查**。RBAC policy 裡寫死的 `accountActive: true` 位在這層之後，停用帳號到不了那裡，屬縱深防禦的預留欄位，不是漏洞。

操作含意：停權應在 Identity Platform 停用帳號（下一個請求就生效）。只從 allowlist secret 移除要等新 revision 才生效。

仍未完成：

- 「所有員工路由都經過這層」的模組組裝證明，以及 limiter Optional 的部分，維持 E4-14 原完成標準。
- 真實 SDK 外證「停用後下一個請求被拒」，排在 11/23–11/25 窗口與 C3 七天讀回一起做，要另外核准。

## 4. 待辦

- B-02：apply `c1-foundation` 新 WIF 條件（需數字 ID 與允許 ref；要 plan 與核准）。
- B-01：重審 CI 角色，改成以 operation 為準的最小權限（IaC 來源修改＋apply 核准）。
- NEW-10：預設 compute 與 Cloud Build 帳號對 tfstate bucket 的寫入權。
- E4-14：模組組裝證明與窗口實測。
