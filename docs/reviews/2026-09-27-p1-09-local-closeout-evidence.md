# P1-09 不需雲端的關帳證據與操作者指令（2026-09-27）

**一句話：** 這份紀錄完成了 P1-09 剩餘工作中不需要 C1 憑證的部分：SEC-13 的原始碼證據（並補上預約開關「過期」分支缺少的測試）、F-12／SEC-14 的原始碼分析，以及 F-01～F-14 逐項對帳。另外附上操作者執行雲端項目用的指令。所有雲端項目仍是 `NOT_RUN`，`P1_09 = NOT_CLOSED`。

這份紀錄是帶日期的證據，不核准任何事。核准範圍見
[P1-09 關帳追加額度核准](../plans/2026-09-27-p1-09-closeout-quota-approval.md)。

## 環境與範圍

- 在沒有 C1 憑證的雲端容器執行，只讀 repository、只跑本機測試。沒有連到任何 GCP、Firebase 或日曆服務。
- 原始碼基準：`main` 在 `3a112b1`。

## SEC-13：預約開關關閉、過期或缺設定時拒絕服務（packet 項目 D0）

| 要求 | 原始碼證據 | 狀態 |
| --- | --- | --- |
| 缺必要設定時拒絕開機 | `apps/api/src/platform/runtime/c1-required-config.test.ts`：C1 缺必要值、缺 authDomain 時 fail closed；開關開啟時必須有到期時間 | SOURCE_PROVEN |
| 開關關閉回 503 | `internal-test-booking.gate.test.ts`「refuses when the kill switch is off」；`appointment.controller.test.ts` 在 gate 關閉時 POST、GET、cancel、arrive、complete、no-show 皆回 503 | SOURCE_PROVEN |
| 開關過期回 503 | 本次新增「refuses at and after the expiry instant」與「refuses an unparseable clock reading」 | SOURCE_PROVEN（本次補上） |
| 部署環境的 503 實測 | packet 項目 D | NOT_RUN（需 C1） |

**本次補的缺口：** `assertInternalTestBookingWritable` 的過期判斷
（`nowMs >= expiresAtMs`）原本沒有任何單元測試直接覆蓋。新增的測試固定用
合成時間點，驗證到期前 1 毫秒可寫、到期當下與之後回 `ServiceUnavailableError`。
為了確認測試真的守住這條分支，做了兩次暫時性的程式碼變異，驗證後已還原：

| 暫時變異 | 結果 |
| --- | --- |
| `>=` 改成 `>` | 新測試失敗（1 failed） |
| 拿掉 `Number.isFinite(nowMs)` 檢查 | 新測試失敗（1 failed） |

這是測試補強，不是修 bug：原本的行為就是正確的，只是缺少證明。

## F-12／SEC-14：停用的員工帳號是否會被擋下

**原始 finding：** `rbac-appointment-policy.ts` 的每個分支都把 `accountActive`
寫死為 `true`。

**現況（原始碼）：** 寫死的值仍在。但停用檢查在授權之前就會先執行：

- 員工 session：`CalendarPilotSessionService.authenticate` 以
  `verifySessionCookie(cookie, true)` 驗證，再 `getUser`，帳號停用就丟
  `DisabledAccountError`（`apps/api/src/auth/calendar-pilot-session.ts`）。
- 病患 ID token 路徑：`verifyIdToken(idToken, true)` 後 `getUser`，停用同樣丟
  `DisabledAccountError`（`internal-test-booking.authenticator.ts`）。
- 測試：`internal-test-booking.authenticator.test.ts`「propagates
  disabled-account enforcement from the staff session」；
  `appointment.rate-limit-and-denial.test.ts` 停用員工回 401。

**判定：** 原 finding 的驗收條件（停用的員工在下一次受保護呼叫被拒）在原始碼層
已由上游滿足，分類為 `NOT-A-BUG`（針對目前的路由）。寫死的 `accountActive: true`
是多餘的輸入，但只要這個 policy 被重用在沒有上游檢查的路徑上，就會變成漏洞，
因此保留為觀察，不在本次修改。部署環境的實測是 packet 項目 E2，仍是 NOT_RUN。

## F-01～F-14 對帳

原定義見 [2026-09-15 closure matrix](2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md)。
這裡只記錄今天可確認的證據，舊的「CONFIRMED／PARTIAL」不直接沿用。

| Finding | 今天的證據 | 狀態 | 還缺什麼 |
| --- | --- | --- | --- |
| F-01 C1 沒有 API | C1 已有獨立 API（`ffa5d33`）；Stage F 預約建立與讀回 PASS | RUNTIME_PROVEN（gate 開啟） | gate 關閉時回 503 的部署實測（項目 D） |
| F-02 路由偵測看錯檔案 | `scripts/c2-c6-smoke-evidence.mjs` 已改用 `booking-route-truth.mjs`，不再比對 `app.module.ts`；`check:architecture` 在 CI 通過 | SOURCE_PROVEN | 無 |
| F-03 沒有持久限流 | P09-11 PASS：新 process 以持久計數回 429，`retry-after: 835` | RUNTIME_PROVEN | 無 |
| F-04 授權拒絕沒有持久稽核 | Stage F `security_denial_audit` PASS：`authorization_denial_events` 新增 55 筆 | RUNTIME_PROVEN | 無 |
| F-05 缺設定時 fail-open | 預約設定已改為必要注入（controller 不再有 `@Optional()` 設定）；SEC-13 測試見上 | SOURCE_PROVEN | 無 |
| F-06 證據鏈不在 git | 私有證據仍存在業主本機路徑，沒有可攜的遮罩版證據包（見 [2026-09-24 交接](2026-09-24-p1-09-unclosed-source-fix-handoff.md) §Private evidence custody）。業主於 2026-09-27 決定存放於業主擁有的 Google Drive 資料夾，只有業主可讀，記為 `WP-B6A-2026-09-27` | DECIDED_NOT_DELIVERED | 證據實際交給業主上傳，並在 repository 記錄遮罩後的清單（檔名、大小、SHA-256、UTC）；P09-14 關帳需要 |
| F-07 預約存在瀏覽器 | Stage F `general_booking_page_create_reload` 與 `persistence_reload_server_readback` PASS：重新整理後瀏覽器儲存皆空，資料由 Firestore 讀回 | RUNTIME_PROVEN | 原驗收要求「兩個瀏覽器看到同一筆」，紀錄沒有明寫兩個瀏覽器 |
| F-08 病患登入 | WP-B3 已取代：新病患免登入、回診以電話加生日查詢，Stage F 兩個回診案例 PASS | NO_LONGER_APPLICABLE | 無 |
| F-09 沒有應用監控 | WP-B4 告警由真實事件觸發並恢復；業主收件已綁到 2026-09-26T08:25Z 事件 | RUNTIME_PROVEN | `c1-foundation` IAM 告警未套用（項目 I，選做） |
| F-10 CSP 含 staging 來源 | C1 使用的 `firebase.isolated-api-preview.json` 已不含 `beauessence-clinic-staging`；`check:pages` 會檢查 | SOURCE_PROVEN | 部署環境回應標頭讀回（項目 E1） |
| F-11 過期文件仍像現行權威 | `check:docs` 今天 PASS（見下方 gate） | SOURCE_PROVEN | 無 |
| F-12 寫死 `accountActive` | 見上節 | SOURCE_PROVEN | 部署實測（項目 E2） |
| F-13 班表讀取綁在建立權限 | `assertCanReadGrid` 仍用 `create_appointment`；業主於 2026-09-27 決定本階段維持此把關，記為 `WP-B5-1A-2026-09-27`（[決策登記簿](../product/phase-1-decision-register.md)） | DECIDED | 無；另設讀取權限需日後修訂 D-006 |
| F-14 角色範圍與審查數 | WP-B5-1（本階段只做 manager、front_desk、免登入病患）與 WP-B5-2（審查數維持 0）已記錄；Stage F 員工與病患案例 PASS | SOURCE_PROVEN | 本紀錄沒有逐一核對 manager 與 front_desk 各自的部署證據 |

**對帳後新增的關帳缺口：** F-06（可攜證據包）與 F-13（業主決定）。兩項都不需要
C1 寫入，但都是 P09-14 關帳前要處理的事，前一份交接紀錄沒有列出。F-13 已於同日由
業主決定並記錄（`WP-B5-1A-2026-09-27`）。F-06 的存放位置也已決定（`WP-B6A-2026-09-27`），
剩下實際交付證據與清單。

## 操作者指令（需 C1 憑證，本 session 沒有執行）

依 `CLAUDE.md`，部署與 `terraform apply` 由操作者執行。尖括號是私有值，不寫進
repository。每一步執行前先確認：`main` 與授權 SHA 之間只有文件變更、時窗未過、
目標是 `beauessence-clinic-stg-c1a01`。下列 `gcloud` 指令都先在 shell 設定
`PROJECT=beauessence-clinic-stg-c1a01`。

**順序：** 先 B、E1（唯讀），再 A，然後 C、D、E2。D 會讓 Cloud Run 服務的
revision 範本變成探測設定，所以 A 要在 D 之前做，否則 A 的 plan 會出現額外差異。

### B：IAM 唯讀審查

```text
gcloud projects get-iam-policy beauessence-clinic-stg-c1a01 --format=json > <private>/iam-project.json
gcloud iam service-accounts list --project="$PROJECT" --format=json > <private>/sa.json
gcloud run services get-iam-policy internal-test-api --region=asia-east1 --project="$PROJECT"
gcloud secrets list --project="$PROJECT" --format='value(name)'
gcloud secrets get-iam-policy <secret> --project="$PROJECT"   # 每個 secret 一次
```

判定：每個服務帳號只有它的工作需要的角色；沒有 `roles/owner`／`roles/editor`
給服務帳號；secret 只有對應的 runtime 身分可讀，且以數字版本掛載。

### E1：CSP 讀回

```text
curl -sSI https://<internal-preproduction 網址>/booking | grep -i content-security-policy
```

判定：輸出不含 `beauessence-clinic-staging`。

### A：run stack 對帳（P09-02）

```text
terraform -chdir=infra/terraform/c1-internal-test-run init -backend-config=bucket=beauessence-clinic-stg-c1a01-tfstate -backend-config=prefix=<run stack prefix>
terraform -chdir=infra/terraform/c1-internal-test-run plan -input=false -var-file=<private tfvars> -out=<private>/run.tfplan
terraform -chdir=infra/terraform/c1-internal-test-run show -json <private>/run.tfplan > <private>/run.plan.json
terraform -chdir=infra/terraform/c1-internal-test-run apply -input=false <private>/run.tfplan
```

- **tfvars 必須對應目前的部署：** API 用 `ffa5d33` 的 digest
  （`sha256:80b323f6…`），worker 用 `ea1fbcc` 的 digest。前一次唯讀 plan 用的是
  `ea1fbcc` 的 API 輸入；如果沿用，plan 會把 API 退回舊版，必須停止。
- plan 只能有 gcloud metadata 與 `max_doublings` 5→0；出現 image、traffic、env、
  IAM、secret、Scheduler 狀態變更或任何 replace／destroy 就停止，丟棄 plan。
- 做完 `unset` 所有 `TF_VAR_*`。

### C：並發冪等（P09-10，須在 2026-09-30T10:00:00Z 前）

1. 在瀏覽器完成一次合成預約的填寫但不送出，從開發者工具複製
   `POST /v1/bookings` 的請求本體；本體內的 `idempotencyKey` 固定用一個新值。
2. 用同一本體、同一來源，同時送 5 次：

```text
for i in 1 2 3 4 5; do curl -sS -o <private>/c-$i.json -w "$i %{http_code}\n" -X POST https://<internal-preproduction 網址>/v1/bookings -H 'content-type: application/json' --data @<private>/body.json & done; wait
```

3. 判定：Firestore 只多 1 筆預約、1 筆 outbox、合成日曆只多 1 個事件；其餘回應是同一結果或拒絕，不能有第二筆。
4. 在 Workbench 取消這筆預約 1 次。

### D：gate 關閉與過期回 503（SEC-13）

```text
gcloud run services update internal-test-api --region=asia-east1 --project="$PROJECT" --no-traffic --tag=p109gateoff --update-env-vars=INTERNAL_TEST_BOOKING_ENABLED=false
gcloud run services update internal-test-api --region=asia-east1 --project="$PROJECT" --no-traffic --tag=p109gateexp --update-env-vars=INTERNAL_TEST_BOOKING_ENABLED=true,INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC=2026-09-01T00:00:00Z
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://p109gateoff---<run.app 主機>/v1/bookings -H 'content-type: application/json' --data @<private>/body.json
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://p109gateexp---<run.app 主機>/v1/bookings -H 'content-type: application/json' --data @<private>/body.json
gcloud run services update-traffic internal-test-api --region=asia-east1 --project="$PROJECT" --remove-tags=p109gateoff,p109gateexp
gcloud run services describe internal-test-api --region=asia-east1 --project="$PROJECT" --format='value(status.traffic)'
```

- 每個 tag 最多 3 個請求，全部必須是 503（404 不算），Firestore 沒有新文件。
- 最後一行必須讀回 100% 在 `internal-test-api-00047-suy`。
- 之後服務的 revision 範本是探測設定。不要自行「修回」（未核准）；任何 Hosting
  部署前先核對 `/v1/**` 指向，任何 Terraform plan 會看到這個差異。

### E2：停用員工（SEC-14）

1. 用一個已存在、已登入 Workbench 的**合成**員工帳號。
2. Firebase Console → Authentication → 該帳號 → 停用。
3. 在 Workbench 做一次會呼叫 API 的動作（例如重新整理預約清單），預期 401 `account_disabled`。
4. 重新啟用該帳號，再做一次，預期 200。

### I（選做）：c1-foundation IAM 告警

與 A 相同流程，stack 改為 `c1-foundation`，需帳單帳戶等輸入；plan 只能改
`C1 IAM SetIamPolicy` 條件。

### G：Stage F evaluator 重跑

在私有 runner 匯入 `evaluateStageFAcceptanceMatrix`，11 個案例各附 UTC、來源、預期與實際；`security_one_real_human_alert` 的 artifact 引用 [交接紀錄補記二](2026-09-26-p1-09-handoff.md)。預期 `ok=true`、結束代碼 0。

## Gates（本機，`3a112b1` 加本次變更）

| Gate | 狀態 | 數字 |
| --- | --- | --- |
| `corepack pnpm run verify`（結構、架構、UI、頁面、token、文件、治理、E2E 分組、secret、格式、型別、lint、同步、效能、單元測試） | PASS | 結束代碼 0；`test:unit` 184 檔／2059 測試 |
| SEC-13／F-12 相關測試單獨執行 | PASS | 6 檔／105 測試（加入新測試前） |
| 新測試變異檢查 | PASS | 兩次變異都讓新測試失敗，程式碼已還原 |
| Firestore Emulator、E2E | NOT_RUN | 本次只改一個單元測試與文件，交由 CI |

本機 Node 為 v22.22.2，repository 要求 `>=24.20.0`；pnpm 只給警告，沒有擋下。
CI 以 PR head 的 `Verification evidence` 為準。

## 未處理

1. 雲端項目 A、B、C、D、E1、E2、I、G：NOT_RUN，本環境沒有 C1 憑證，且依 `CLAUDE.md` 部署與 apply 不由 session 執行。
2. F-06：存放位置與權限已決定（`WP-B6A-2026-09-27`），證據尚未交付、清單尚未記錄。F-13 已記錄為 `WP-B5-1A-2026-09-27`。
3. `rbac-appointment-policy.ts` 寫死的 `accountActive: true`：觀察，未修改。
4. controller 對限流器仍用 `@Optional()` 注入。目前的 module 一定會提供，所以部署行為正確；但它和 F-05 屬於同一類「可選注入」，重用時可能變成 fail-open。觀察，未修改。
