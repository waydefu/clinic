# WP-B1～B6 業主連審表 — 2026-09-14

一份表一次審六題。這份文件**不是核准、不是部署授權、不是 D-series 翻盤**。
Drafter 不得代填 Answer。填完後由 clinic owner 把答案寫進
[decision register](../product/phase-1-decision-register.md)。

詳細事實與 Safety Floor 8 原文見
[WP-B1 封包](2026-09-14-wp-b1-c1-api-authority-packet.md)。
計畫來源：[INTERNAL_PREPRODUCTION 補強施工計畫](../plans/2026-09-14-internal-preproduction-remediation-plan.md)。

本文件無法引用自身 commit。查詢：
`git log -- docs/reviews/2026-09-14-wp-b1-through-b6-owner-review.md`。

**對應 Word（離線填寫，勿把收件人或秘密貼進 PR）：**
session artifact `/opt/cursor/artifacts/2026-09-14-WP-B1-B6-owner-review.docx`。

## 總表

| ID | 題目 | 選項 | 答案（空白） |
| --- | --- | --- | --- |
| WP-B1 | C1 是否部署 API（F-01） | A 啟用 Cloud Run＋fail-closed API／B 不部署並改寫 stage |  |
| WP-B2 | 限流參數與架構（F-03） | 填下表；架構 A／B／C |  |
| WP-B3 | 病患互動登入（F-08） | 需要／不需要；若需要再填方式 |  |
| WP-B4 | 告警管道與嚴重度（F-09） | 管道＋weekday／immediate；收件人離線填、不進 repo |  |
| WP-B5-1 | 內部預生產驗收角色（F-14） | 勾選角色 |  |
| WP-B5-2 | `main` required reviews 是否改為 1（D-013 修訂） | 是／否 |  |
| WP-B6 | 2026-09-14 inspect 12 個原檔（F-06） | 離線交付／具結遺失 |  |

共同排除（六題皆適用，除非該題另寫）：live Hosting、`beauessence-clinic-staging`、production terraform、official DNS、production Calendar、真實病患資料、public production `/v1/bookings`、把 D-001–D-005 改 `approved`、`firebase login:ci`、把密碼／TOTP／email 收件人寫進 repo。

---

## WP-B1　C1 是否部署 API（F-01）

```text
HUMAN BLOCKER
PHASE: WP-B1 / INTERNAL_PREPRODUCTION (F-01)
DECISION OR RESOURCE: Whether isolated C1 beauessence-clinic-stg-c1a01 may enable Cloud Run and deploy the fail-closed InternalTestBookingModule API, with a new exact-SHA backend packet (not the existing static preview packet)
ONE QUESTION: Does the clinic owner choose option A (authorize Cloud Run + API on beauessence-clinic-stg-c1a01 with a new exact-SHA, project, service, region, expiry, API allowlist, and rollback) or option B (do not deploy an API and redefine INTERNAL_PREPRODUCTION_COMPLETE as static frontend preview plus CI-proven backend)?
WHY I CANNOT PROCEED: Safety Floor 8 forbids enabling a Firebase backend under preview authority; the existing INTERNAL_TEST_PREVIEW_DEPLOY packet for channel internal-preproduction is static-only; check:pages currently forbids Cloud Run rewrites on firebase.isolated-preview.json; C1 original API allowlist excludes Cloud Run
WHAT I WILL NOT DO UNTIL ANSWERED: Enable run.googleapis.com or artifactregistry.googleapis.com; terraform apply of a C1 API stack; firebase deploy that rewrites /v1/** to Cloud Run; mutate firebase.isolated-preview.json to add a run rewrite; treat the 2026-09-14 static preview packet as backend authority
SAFE OPTIONS (if any): WP-A1 through WP-A6 and other WP-B drafts that do not enable a C1 API; keep the static internal-preproduction Hosting channel; keep production booking HTTP 503; do not flip D-001–D-005
```

事實（2026-09-14）：靜態 preview `/clinic` 200、`/v1/*` 404。已啟用
`firestore`／`identitytoolkit`／Hosting；**未**啟用 `run.googleapis.com`、
`artifactregistry.googleapis.com`。員工登入需要
`GET /v1/calendar-session/client-config` 回傳 **C1 自己的** Firebase 設定。

| 欄位 | 填寫 |
| --- | --- |
| 答案 A 或 B |  |
| 若 A：AUTHORIZED_SHA（40-char；不得沿用靜態 preview packet） |  |
| 若 A：Cloud Run service 名（建議 `internal-test-api`） |  |
| 若 A：Hosting 頻道（非 live）與到期 |  |
| 若 A：可新啟用 API（建議僅 Run＋Artifact Registry） |  |
| 若 B：確認 stage 改為「靜態 preview＋CI 證明後端」 |  |
| 核准人／日期（Asia/Taipei） |  |

選 A 之後才能開 WP-C1，且應先合併 WP-A2、WP-A6。禁止對既有
`c1-foundation`／`c5-firestore` 重套 `exact_apply_authority_sha=not_granted`。

---

## WP-B2　限流參數與架構（F-03）

```text
HUMAN BLOCKER
PHASE: WP-B2 / INTERNAL_PREPRODUCTION (F-03)
DECISION OR RESOURCE: Rate-limit window and count per class, over-limit response, limiter architecture, and whether to trust Hosting X-Forwarded-For
ONE QUESTION: Does the clinic owner record unauthenticated / authenticated-write / session-create limits, the over-limit response, architecture A or B or C, and trustProxy yes or no in the WP-B2 table?
WHY I CANNOT PROCEED: Safety Floor 7 forbids guessing unresolved policy; D-006 and D-010 require rate limiting but unrouted-inventory.json records only a per-process fixed-window test implementation with no shared state or approved parameters
WHAT I WILL NOT DO UNTIL ANSWERED: Route rate-limiter.ts; invent window/count; enable Cloud Armor or a load balancer; set Fastify trustProxy without a recorded answer
SAFE OPTIONS (if any): Keep rate-limiter unrouted; continue WP-A1–A6; draft other WP-B packets
```

| 類別 | 視窗長度 | 允許次數 | 計數 key（actor 或 IP） |
| --- | --- | --- | --- |
| 未認證請求 |  |  |  |
| 已認證寫入 |  |  |  |
| session 建立 |  |  |  |

| 欄位 | 填寫 |
| --- | --- |
| 超限回應（建議 429＋Retry-After） |  |
| 架構 A max-instances=1＋process-local／B Firestore 計數／C LB＋Cloud Armor |  |
| 是否信任 Hosting `X-Forwarded-For`（trustProxy） |  |
| 核准人／日期 |  |

架構 C 與目前 Hosting→Run rewrite 不同，成本最大。架構 A 只適用內部預生產。

---

## WP-B3　病患身分驗證（F-08）

```text
HUMAN BLOCKER
PHASE: WP-B3 / INTERNAL_PREPRODUCTION (F-08)
DECISION OR RESOURCE: Whether internal-preproduction requires interactive patient sign-in, which method, and whether email_verified remains required
ONE QUESTION: Does internal-preproduction require interactive patient login, and if yes which method and is email_verified still required, or is operator-supplied patient token an accepted stage limit?
WHY I CANNOT PROCEED: Safety Floor 7 forbids guessing identity policy; patient identity touches D-001–D-003 and this answer is not legal approval; sessionStorage.internalTestIdToken has no writer and can only be injected
WHAT I WILL NOT DO UNTIL ANSWERED: Build a patient Auth UI; collect passwords or TOTP in chat; treat preview URL as authentication; drop email_verified without a recorded answer
SAFE OPTIONS (if any): Keep staff Google+TOTP; keep Bearer inject as test-only; continue WP-A packets
```

事實：員工端有 Google redirect＋TOTP。病患端沒有寫入 `internalTestIdToken` 的程式。
伺服器現行要求 `email_verified === true`。

| 欄位 | 填寫 |
| --- | --- |
| 內部預生產是否需要病患互動登入 | 需要／不需要 |
| 若需要：方式 |  |
| 若需要：是否維持 `email_verified === true` |  |
| 若不需要：確認「病患 token 由 operator 提供」為 stage 限制 |  |
| 核准人／日期 |  |

本決策**不**取代 D-001–D-003 法務核准。

---

## WP-B4　告警通知（F-09）

```text
HUMAN BLOCKER
PHASE: WP-B4 / INTERNAL_PREPRODUCTION (F-09)
DECISION OR RESOURCE: Alert channel kind, weekday versus immediate severity, with recipients kept out of the repository
ONE QUESTION: Which notification channel kind and weekday/immediate severity rules apply to isolated C1 application alerts, with recipients supplied only via secret or tfvar and never committed?
WHY I CANNOT PROCEED: Safety Floor 7 and C0-ENG-REC forbid inventing email recipients in the repository; C1 currently notifies budget Pub/Sub only
WHAT I WILL NOT DO UNTIL ANSWERED: Add Monitoring email channels in Terraform; commit recipient addresses; page humans without a recorded severity rule
SAFE OPTIONS (if any): Keep IAM SetIamPolicy on existing budget Pub/Sub; continue WP-P3 logging design without recipients
```

可比照 CAL-PILOT health 的 `weekday`／`immediate` 兩級。收件人**只填 Word 離線欄或
secret**，不要寫進 git／PR。

| 欄位 | 填寫 |
| --- | --- |
| 管道（Pub/Sub／email／其他；email 不得進 repo） |  |
| weekday 規則 |  |
| immediate 規則 |  |
| 核准人／日期 |  |

---

## WP-B5　驗收角色與 required reviews（F-14）

已掛載員工認證只有 `manager` 與 `front_desk`（env allowlist）。
domain `ROLES` 另有 `consultant`、`physician`、`patient`、`system_admin`、
`auditor`、`service_account`。D-013 已核准且 `required_approving_review_count=0`。

```text
HUMAN BLOCKER
PHASE: WP-B5-1 / INTERNAL_PREPRODUCTION (F-14)
DECISION OR RESOURCE: Which roles are in-scope for internal-preproduction acceptance
ONE QUESTION: Which of manager, front_desk, consultant, physician, patient, system_admin, auditor, service_account must be covered by internal-preproduction acceptance?
WHY I CANNOT PROCEED: Safety Floor 7 forbids inventing role coverage; CalendarPilotStaffRole only authenticates manager and front_desk
WHAT I WILL NOT DO UNTIL ANSWERED: Add staff login paths for other roles; claim those roles were accepted
SAFE OPTIONS (if any): Keep manager/front_desk CAL-PILOT allowlists; continue WP-A packets
```

```text
HUMAN BLOCKER
PHASE: WP-B5-2 / INTERNAL_PREPRODUCTION (F-14 / D-013)
DECISION OR RESOURCE: Whether to raise GitHub required_approving_review_count on main from 0 to 1
ONE QUESTION: Is D-013 amended so main requires one approving review?
WHY I CANNOT PROCEED: D-013 currently records required_approving_review_count=0; changing branch protection is a named D-013 revision
WHAT I WILL NOT DO UNTIL ANSWERED: Change GitHub branch protection; treat a green CI run as also having human review
SAFE OPTIONS (if any): Leave required reviews at 0 as recorded; keep Verification evidence as the required check
```

| 角色 | 納入內部預生產驗收？ |
| --- | --- |
| manager |  |
| front_desk |  |
| consultant |  |
| physician |  |
| patient |  |
| system_admin |  |
| auditor |  |
| service_account |  |

| 欄位 | 填寫 |
| --- | --- |
| required reviews 改為 1（D-013 修訂） | 是／否 |
| 核准人／日期 |  |

---

## WP-B6　inspect 原檔（F-06）

PR #124 列出 12 個 SHA-256，標為 session evidence、不在 git。請 **offline**
交付原檔（不要貼 PR 評論、不要公開）。若已遺失，在 2026-09-14 complete review
加註「產物遺失，改 operator 具結」。

```text
HUMAN BLOCKER
PHASE: WP-B6 / INTERNAL_PREPRODUCTION (F-06)
DECISION OR RESOURCE: Offline delivery of the twelve 2026-09-14 inspect artifacts whose SHA-256 are listed in the complete review, or an operator attestation that they are lost
ONE QUESTION: Will the operator deliver the twelve hashed inspect artifacts offline, or attest that they are lost so those rows become operator attestation?
WHY I CANNOT PROCEED: Completeness evidence listed in git is hashes only; WP-C5 cannot archive files that are not produced
WHAT I WILL NOT DO UNTIL ANSWERED: Commit the raw artifacts; reconstruct them from hashes; treat hash-only rows as independently reproduced cloud evidence
SAFE OPTIONS (if any): Continue other WP-B answers; do not start WP-C5
```

| 檔名 | SHA-256 | 離線交付或遺失 |
| --- | --- | --- |
| internal-preproduction-complete-a9a445a.json | b80d92b70dea2564376732f95d8897bbdeca4bf7a26b875235e8d78ef23f5454 |  |
| internal-preproduction-complete-a9a445a.result.json | bb34e7c18e46687e2762866b1b00135efa2ce5038841c41f74466e0cf2c710e6 |  |
| ci-verification.json | 9efe81ca35109abf42b02ac8c33f2438df067319778686ab698c1e9e0a7b9285 |  |
| hosting-inspect.json | 5022f9928ed91138e4b8611a8eb09b4772234312a6579c82bda8752a3b1bf7d4 |  |
| backup-inspect.json | 2f076905c4df15330919efc85b64d4a3029f0df7a31a93b6738237081714dc2f |  |
| monitoring-inspect.json | 4fb41f9546d9c8a53071257873990a43360791675c702786b5d48c64ffbddf2b |  |
| migration-inspect.json | b392e7b5c6d2fd1e06940547d8cc84488f33b49908d70c488dcc6e13e438295f |  |
| smoke-probes.json | 00a138d677c207cb244c5c7fb3d70c15cf4e4896da81ce9d9a92463a7baf281a |  |
| c5-backup-schedule-apply-a9a445a.txt | 0cee46ea71f32c568d031b66e8f63443ef7696ff4232cb6329e6e6130334589e |  |
| c1-iam-alert-apply-a9a445a.txt | 9b0eeb2cfc86dce1afd47640f7a978ac6dfa29d843fecfdba2882e81ab821b94 |  |
| firebase-preview-deploy-a9a445a.log | bc1afd4d80ebf2b36d27e4a032e3e1c6ef52a41aefd8a04355584306442e713c |  |
| hosting-channels-a9a445a.json | 8fbda6dbcee9136fbc15a056a364c9e86761a3fec6921913a29d83a793104a42 |  |

## 簽署

| 欄位 | 填寫 |
| --- | --- |
| Clinic owner |  |
| 日期（Asia/Taipei） |  |
| 範圍 | isolated C1／internal-preproduction only |
| 明確排除 | live Hosting；staging；production；真實資料；D-001–D-005 approved |
