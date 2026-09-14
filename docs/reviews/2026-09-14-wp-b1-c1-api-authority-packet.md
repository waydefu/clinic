# WP-B1 C1 API 授權封包 — 2026-09-14

Dated decision packet, **not** approval, **not** deployment authority, **not**
a D-series flip. Drafter is not an approver. Until the clinic owner records
**A** or **B** in the [decision register](../product/phase-1-decision-register.md),
WP-C1 must not start.

This file cannot cite its own commit. Lookup:
`git log -- docs/reviews/2026-09-14-wp-b1-c1-api-authority-packet.md`.

**Work package:** WP-B1（F-01）in
[INTERNAL_PREPRODUCTION 補強施工計畫](../plans/2026-09-14-internal-preproduction-remediation-plan.md).  
**Owner:** clinic owner.  
**Status:** `WAITING_FOR_ANSWER`.

## HUMAN BLOCKER

```text
HUMAN BLOCKER
PHASE: WP-B1 / INTERNAL_PREPRODUCTION (F-01)
DECISION OR RESOURCE: Whether isolated C1 beauessence-clinic-stg-c1a01 may enable Cloud Run and deploy the fail-closed InternalTestBookingModule API, with a new exact-SHA backend packet (not the existing static preview packet)
ONE QUESTION: Does the clinic owner choose option A (authorize Cloud Run + API on beauessence-clinic-stg-c1a01 with a new exact-SHA, project, service, region, expiry, API allowlist, and rollback) or option B (do not deploy an API and redefine INTERNAL_PREPRODUCTION_COMPLETE as static frontend preview plus CI-proven backend)?
WHY I CANNOT PROCEED: Safety Floor 8 forbids enabling a Firebase backend under preview authority; the existing INTERNAL_TEST_PREVIEW_DEPLOY packet for channel internal-preproduction is static-only; check:pages currently forbids Cloud Run rewrites on firebase.isolated-preview.json; C1 original API allowlist excludes Cloud Run
WHAT I WILL NOT DO UNTIL ANSWERED: Enable run.googleapis.com or artifactregistry.googleapis.com; terraform apply of a C1 API stack; firebase deploy that rewrites /v1/** to Cloud Run; mutate firebase.isolated-preview.json to add a run rewrite; treat the 2026-09-14 static preview packet as backend authority
SAFE OPTIONS (if any): WP-A1 through WP-A6 and other WP-B drafts that do not enable a C1 API; keep the static internal-preproduction Hosting channel; keep production booking HTTP 503; do not flip D-001–D-005
```

## 為什麼需要這份封包

隔離專案 `beauessence-clinic-stg-c1a01` 的 Hosting 預覽頻道
`internal-preproduction` 已在服務靜態頁。2026-09-14 實測後綴網址
`https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app/`：
`/clinic` `/staff` `/booking` 為 HTTP 200，`/v1/*` 為 HTTP 404。

沒有 API 就無法完成任何一筆 durable internal-test booking。IP-001 授權的是
fail-closed 路由實作，**不是**在 C1 啟用 Cloud Run。現有靜態 preview packet
不可重用。

兩種合法出口只有 A 或 B，互斥且窮盡。

## 必須附上的事實

### Safety Floor 8 原文

From [AGENTS.md](../../AGENTS.md):

> 8. A synthetic preview deployment requires fresh, explicit authority for the
> exact commit, project, channel and expiry. When authorised, it may deploy
> only static files to the expiring `synthetic-review` channel in
> `beauessence-clinic-staging`. Earlier preview authority is not reusable
> standing authority. Never deploy the live channel or enable a Firebase
> backend under preview authority.

對本封包的後果：即使隔離 C1 的靜態頻道不是 `synthetic-review`，**「Never …
enable a Firebase backend under preview authority」仍成立**。在 C1 啟用
Cloud Run / 部署 API 必須是**新的、獨立的**後端授權，且綁定 exact SHA。不得把
`INTERNAL_TEST_PREVIEW_DEPLOY`（頻道 `internal-preproduction`、設定
`firebase.isolated-preview.json`、SHA `a9a445a`）延伸成後端授權。

### `check:pages` 禁止隔離設定宣告 Run rewrite

`scripts/check-public-pages.mjs` `compareIsolatedPreviewHosting()`：

- 隔離 C1 沒有 Cloud Run API，preview Hosting 只准靜態。
- 若 `firebase.isolated-preview.json` 的 rewrite 含 `run` 鍵，gate 失敗，訊息為：
  `firebase.isolated-preview.json 不得宣告 Cloud Run rewrite；isolated C1 沒有 Run API。`

選項 A 的後續 WP-C1 必須**新增**獨立 Hosting 設定（計畫建議
`firebase.isolated-api-preview.json`），**不得修改**現有
`firebase.isolated-preview.json`（它是靜態回滾目標）。現有「隔離設定不得有
Run rewrite」規則只繼續套在原靜態設定。

### 員工登入端點需要 C1 自己的 Firebase 設定

`GET /v1/calendar-session/client-config`
（`CalendarPilotSessionController.clientConfig`）回傳
`CALENDAR_PILOT_FIREBASE_WEB_API_KEY`、
`CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN`、`GOOGLE_CLOUD_PROJECT`。缺任一項即
`AuthenticationRequiredError`。選項 A 的 API 必須回傳 **C1 自己的** 設定，不得指向
`beauessence-clinic-staging`。

[stage-2-gate-status.json](../architecture/stage-2-gate-status.json) 記錄 C2
`completed` / `granted`（synthetic）。2026-09-14 唯讀
`gcloud services list --enabled --project=beauessence-clinic-stg-c1a01` 已見
`identitytoolkit.googleapis.com`。這只證明 API 已開啟，**不**證明 Auth 使用者、
web API key、authDomain 已可給 client-config 使用。WP-C1 的停止條件仍是：
C1 Firebase Auth 未設定導致 client-config 無法回傳 C1 設定。

### C1 現況（2026-09-14 唯讀，不是授權）

| 項目 | 現況 |
| --- | --- |
| Project | `beauessence-clinic-stg-c1a01` |
| Region | `asia-east1` |
| 已啟用（相關） | `firebase.googleapis.com`、`firebasehosting.googleapis.com`、`firestore.googleapis.com`、`identitytoolkit.googleapis.com` |
| 未啟用（相關） | `run.googleapis.com`、`artifactregistry.googleapis.com` |
| C1 原始 allowlist | 排除 Firestore / Identity Platform / Cloud Run（見 [C1～C6 execution](../architecture/first-stage-c1-c6-execution.md) 與 [C1 local packet](../runbooks/c1-local-execution-packet.md)） |
| 後來已擴大 | Firestore（C5）、Identity Toolkit（C2）— 皆為獨立 exact-SHA 套用，不是本封包 |
| Hosting live | `https://beauessence-clinic-stg-c1a01.web.app` — `updateTime` 仍為 2026-09-13T19:22:42Z；本封包不得授權 live |
| 靜態 preview | 頻道 `internal-preproduction`，到期 2026-09-21T04:14:28Z |
| `origin/main` at draft | `91fab3ad6132faa0cc9af9c73c29a155e39b6912`（文件／計畫；產品程式仍以 #123 `a9a445a` 為主） |

## 選項

### 選項 A — 授權在 C1 啟用 Cloud Run 並部署 fail-closed API

授權範圍（若業主選 A，必須填完整表，缺一項則 A 不完整、WP-C1 不得 apply）：

| 欄位 | 填法 |
| --- | --- |
| `AUTHORIZED_SHA` | 將實際部署的 40-char SHA（不得沿用靜態 preview 的 `a9a445a` packet；WP-C1 前還應先合併 WP-A2、WP-A6） |
| Project | 僅 `beauessence-clinic-stg-c1a01` |
| Region | 僅 `asia-east1` |
| Cloud Run service | 名稱（建議 `internal-test-api`，業主可改） |
| Hosting | 新設定檔（建議 `firebase.isolated-api-preview.json`）；preview 頻道（非 `live`）；到期時間 |
| 可新啟用的 API | 僅 `run.googleapis.com` 與 `artifactregistry.googleapis.com`。已存在的 Hosting／Firestore／Identity Toolkit 不在本封包重開或關閉 |
| 執行期 env | `INTERNAL_TEST_BOOKING_ENABLED`、`INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC`、`GOOGLE_CLOUD_PROJECT`、`CALENDAR_PILOT_*` 以 tfvars／secret 注入，**不進 repo、不貼進聊天** |
| 回滾 | Hosting 改回部署 `firebase.isolated-preview.json`；**只**對新 API stack 用 `exact_apply_authority_sha=not_granted` 做 targeted plan／移除。禁止對既有 `c1-foundation` / `c5-firestore` 重套 `not_granted`（會把已存在的 C1／C5 資源 count-gate 成零） |

選項 A **仍然排除：** live Hosting、`beauessence-clinic-staging`、production
terraform、official DNS、production Calendar、真實病患資料、public production
`/v1/bookings`、D-001–D-005 改 `approved`、`firebase login:ci`。

選項 A **不是** WP-C1 的施工授權。WP-C1 仍是 Planned＋Owner-run：agent 只準備
SHA-gated Terraform／新 Hosting 設定／execute:false 計畫；業主本人 apply／deploy。

### 選項 B — 不部署 API，改寫 stage 定義

把 `INTERNAL_PREPRODUCTION_COMPLETE` 正式改寫為「靜態前端 preview＋後端由 CI
（Emulator／unit／e2e）證明」。Register 必須寫明：隔離 C1 上沒有 HTTP API 不是
缺陷，durable booking 不在此 stage 的線上驗收範圍。

選項 B **仍然排除：** 默默把 11/11 個 `/v1` 404 說成 API gate 通過；在沒有新定義前
宣稱 IP-001「可進行完整 internal pre-production」已在 C1 達成。

## 業主答覆欄（空白，等業主填）

複製到 register 的 `WP-B1-2026-09-14` 段。Drafter 不得代填 Answer。

```text
Recorded input ID: WP-B1-2026-09-14
Answer: A | B
If A:
  AUTHORIZED_SHA=
  project_id=beauessence-clinic-stg-c1a01
  region=asia-east1
  cloud_run_service=
  hosting_config=firebase.isolated-api-preview.json
  hosting_channel=
  hosting_expires=
  apis_enabled=run.googleapis.com, artifactregistry.googleapis.com
  rollback=redeploy firebase.isolated-preview.json; targeted not_granted on the new API stack only
If B:
  INTERNAL_PREPRODUCTION_COMPLETE means static Hosting preview plus CI-proven backend; C1 HTTP API is out of stage scope
Approved by:
Approval date (Asia/Taipei):
Scope:
Explicit exclusions: live Hosting; beauessence-clinic-staging; production; real patient data; official DNS; production Calendar; D-001–D-005 approved; firebase login:ci
```

## 答覆後才能做什麼

| 答案 | 下一步 |
| --- | --- |
| A 且表格填完整 | 先合併 WP-A2、WP-A6；再開 WP-C1（agent 準備、業主執行） |
| B | 更新 register 的 stage 定義與 inspect／smoke 文件；**不**開 WP-C1 |
| 未答或 A 缺欄 | 維持本 HUMAN BLOCKER；不得啟用 Cloud Run |

## 本封包沒有做的事

- 沒有 `terraform apply` / `destroy`，沒有 `firebase … deploy`
- 沒有啟用任何新 API
- 沒有修改 `firebase.isolated-preview.json`
- 沒有把 D-001–D-005 改成 `approved`
- 沒有選擇 A 或 B
