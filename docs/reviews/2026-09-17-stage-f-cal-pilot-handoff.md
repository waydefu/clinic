# Stage F / CAL-PILOT engineering handoff (2026-09-17)

Dated evidence for the next engineering agent. This is **not** apply
authority, **not** production authority, and **not** a login/logout fix.

Register: `docs/README.md` Review record (required by `check:docs`).
`docs/INDEX.md` is already at the `check:governance` warning band
(6107 / 6144 bytes). Adding this file there would fail the INDEX size
gate. Do not lengthen INDEX.md without shrinking another cell.

```text
DOCUMENTATION_ONLY = true
CLOUD_MUTATION = NONE
DEPLOYMENT = NONE
IAM_MUTATION = NONE
M11_EXECUTED = false
M12_EXECUTED = false
HUMAN_LOGIN_PERFORMED_THIS_ROUND = false

PRE_HANDOFF_AUTHORITY_SHA = ca2c35e8e01dd382247ef3891286225df575e14e
CURRENT_HUMAN_LOGIN = PASS
CURRENT_LOGOUT = FAIL
STAFF_WORKBENCH_REACHED = true

M10_CALENDAR_ACL = PASS
M11_SCHEDULE_PUBLISH = NOT_YET_EXECUTED
M12_WORKER_ENABLE = NOT_STARTED
INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED = false
SCHEDULER = PAUSED

PUBLIC_PRODUCTION_LAUNCH = DEFERRED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
CURRENT_WIDGET_EMBED = DISABLED
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
```

Do **not** re-judge login as blocked. Human Google + existing TOTP
reached Staff Workbench after the IAM grants below. The new blocker is
logout.

---

## Purpose

Hand the isolated C1 Stage F / CAL-PILOT runtime to a new agent with no
prior chat history. Record what is proven, what must not be applied, and
the ordered next work. Do not implement logout, M11, M12, IAM, or
deploys from this record.

## Current authority

| Item | Value |
| --- | --- |
| Repository | `waydefu/clinic` |
| Authority SHA at handoff write | `ca2c35e8e01dd382247ef3891286225df575e14e` (`origin/main` merge of PR #141) |
| Isolated project | `beauessence-clinic-stg-c1a01` |
| Region | `asia-east1` |
| Preview | `https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app` |

If `origin/main` has moved, read the delta before acting. Documentation-only
or unrelated-safe changes may update authority. Any Stage F / auth / infra /
Calendar / schedule / worker **functional** change is `AUTHORITY_INVALIDATED`
and STOP.

## Executive status

| Flag | State |
| --- | --- |
| Human Google + TOTP staff login | **PASS** |
| Staff Workbench reached | **true** |
| Staff logout | **FAIL** — P1 High AUTH SESSION DEFECT (see below). Do not fix from this PR. |
| M10 Calendar ACL / ADC probe | **PASS** (probe event deleted) |
| M11 synthetic schedule publish | **NOT_YET_EXECUTED** (ready for a real staff session after logout is understood; **do not** run M11 from this handoff) |
| M12 worker enable | **NOT_STARTED** |
| Worker processing | `INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED = false` |
| Scheduler `internal-test-outbox-drain` | **PAUSED** |
| Public production launch | **DEFERRED** |
| Production Calendar inbound | **GO_LIVE_DEFERRED** |
| Widget embed | **DISABLED** (`frame-ancestors 'none'`) |

M11 is **not** `BLOCKED_PENDING_HUMAN_STAFF_LOGIN`. Login already passed.
Logout is a **new** staff-auth defect and does **not** silently authorize
M11.

## What is proven

Human validation (latest, highest authority for login):

- Google primary auth = PASS
- Existing TOTP = PASS
- `verifyIdToken(idToken, true)` = PASS
- `email_verified` gate = PASS
- Allowlist gate = PASS
- Account-enabled gate = PASS
- `createSessionCookie` = PASS
- `calendar_pilot_sessions` create = PASS
- `__session` establishment = PASS
- Staff Workbench = REACHED

IAM root causes that previously blocked login are **fixed**:

- `firebaseauth.users.get` = GRANTED
- `firebaseauth.users.createSession` = GRANTED

Do not treat login as still blocked. Do not ask a human to log in to
re-prove those gates unless a later authorized round requires it.

## Current isolated C1 runtime

No API/worker image was rebuilt for PRs #140 / #141 (IAM-only). Runtime
source SHA therefore lags `origin/main`.

| Surface | Value |
| --- | --- |
| API service | `internal-test-api` |
| API revision | `internal-test-api-00007-rg4` |
| API image | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/api@sha256:824b7d990ca799c7d2eca777511ae8e346d370b12ac722f9b4a129ec67d653fd` |
| API image source SHA | `7dbe50a575b5d8e101da2e76b797eebf7a443cc6` (PR #138 merge) |
| Hosting pinTag | `fh-81225f40bc42b56d` → `internal-test-api-00007-rg4` at **100%** |
| Worker service | `internal-test-outbox` |
| Worker revision | `internal-test-outbox-00008-xpw` |
| Worker image | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/worker@sha256:73fc6a294567b7da0de2e590403b1f1a2251f2753c75ef1c04bc24b2116a5eb3` |
| Worker source / provenance SHA | `7dbe50a575b5d8e101da2e76b797eebf7a443cc6` |
| Worker Calendar secret | `GOOGLE_CALENDAR_ID = c1-synthetic-calendar-id:2` |
| Worker Calendar auth | `GOOGLE_CALENDAR_AUTH = CLOUD_ADC` (no user-managed JSON key) |
| Runtime `authDomain` | `beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app` |

PR #139 classifier hardening is **not** on revision `00007`. Login succeeded
without it.

## Authentication architecture

Two session layers. They are not interchangeable.

**Layer A — Firebase client (browser Identity Platform user)**

- `GoogleAuthProvider` + `signInWithRedirect` / `getRedirectResult`
- TOTP via `getMultiFactorResolver` + `TotpMultiFactorGenerator`
- `getIdToken(user, true)` only after a completed Google + TOTP sign-in
- Persistence: IndexedDB / `onAuthStateChanged` / boot-time `currentUser`
- `authDomain` is the isolated Hosting host above. Do not fall back to
  `*.firebaseapp.com`.

**Layer B — server `__session` (API, HttpOnly cookie)**

`POST /v1/calendar-session` then:

1. `verifyIdToken(idToken, true)` (revocation / disabled-user check)
2. `decoded.email_verified === true`
3. Allowlist role resolved (`manager` / `front_desk` only)
4. `decoded.firebase.sign_in_second_factor === 'totp'`
5. `user.disabled === false`
6. `createSessionCookie(...)` → `__session` HttpOnly / Secure /
   SameSite=Strict
7. Firestore `calendar_pilot_sessions`
8. CSRF token to the client (`calPilotCsrf` / `calPilotRole` in
   `sessionStorage`)

Workbench hydrate (`hydrateStaff`) treats `calPilotCsrf` + role as the
staff session for UI. Public `/booking` stays accountless.

**Logout must tear down both layers.** Firebase `signOut` without
`DELETE /v1/calendar-session` (cookie clear + Firestore revoke +
`revokeRefreshTokens`) leaves a live `__session`. Clearing the cookie
without Firebase `signOut` can let `currentUser` restore and mint a new
server session on reload. Do not patch only one layer.

Do **not** log or paste: email, UID, ID token, TOTP seed/QR/recovery/live
code, `__session`, CSRF, factor identifiers, or allowlist contents.

## IAM state (API runtime)

Principal (API only; **not** worker):

`internal-test-api@beauessence-clinic-stg-c1a01.iam.gserviceaccount.com`

| Binding | State |
| --- | --- |
| `roles/datastore.user` | present |
| Custom role `clinicC1FirebaseAuthSessionRuntime` | present |
| `roles/firebaseauth.viewer` | **removed** |
| `roles/firebaseauth.editor` / `admin` | must remain absent |
| `roles/identitytoolkit.editor` / `admin` | must remain absent |

Custom role permissions (exact):

- `firebaseauth.users.get`
- `firebaseauth.users.createSession`

Not granted through that role: `firebaseauth.users.create` /
`update` / `delete` / `sendEmail`, `firebaseauth.configs.*`,
`identitytoolkit.*`.

Worker SA `internal-test-outbox@beauessence-clinic-stg-c1a01.iam.gserviceaccount.com`
has `roles/datastore.user` only for project IAM. Do not grant the session
custom role to worker.

## Authentication incident history (compact)

1. **Cross-domain `authDomain`.** Google redirect succeeded; Identity
   Platform / `getRedirectResult` did not complete on the isolated
   Hosting host. **Fix:** PR #135 parameterized
   `CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN` to the isolated Hosting host.
2. **TOTP enrollment semantics.** First version exchanged the enrollment
   session for a server session; ID token lacked
   `sign_in_second_factor === totp`. **Fix:** PR #136 — enroll TOTP →
   Firebase `signOut` → explicit fresh Google + TOTP; session 401 clears
   bounded CAL-PILOT client auth state (`calPilotCsrf` / `calPilotRole`).
3. **`verifyIdToken` UNKNOWN.** After Google + TOTP:
   `calendar_session_verify_token` /
   `AUTH_GATE_VERIFY_TOKEN_UNKNOWN`. Root cause: API SA lacked
   `firebaseauth.users.get` required by `verifyIdToken(idToken, true)`
   (check revoked / `getUser`). **Fix:** PR #140 granted
   `roles/firebaseauth.viewer` (later replaced).
4. **`createSessionCookie` 500.** After users.get:
   `calendar_session_cookie_create` /
   `AUTH_SESSION_COOKIE_CREATE_FAILED`. Root cause: viewer does not
   include `firebaseauth.users.createSession`. **Fix:** PR #141 custom
   role with exactly `users.get` + `users.createSession`; viewer removed
   after the custom-role binding existed.
5. **Final login.** Human Google + existing TOTP = PASS; Staff Workbench
   reached = PASS.
6. **New logout defect.** Logout appears to run, then Staff Workbench
   restores. Not analyzed. Not fixed.

## P1 High — AUTH SESSION DEFECT (logout)

**Classification:** `CONFIRMED` symptom (latest human operation). Root
cause = not proven this round (`NEEDS-RUNTIME-REPRODUCTION` for the
earliest incorrect state).

**Severity:** **P1 High** against
[incident-response.md](../runbooks/incident-response.md) SEV2 (core staff
session lifecycle damaged; closing the browser / clearing site data is
not Stage F evidence). Not P0: login and workbench still function; no
patient-data leak is claimed. Not P2/P3: after explicit logout the
privileged staff UI returns — session teardown failed, not polish.

**Observed:** Staff Workbench 「登出」 → UI looks like logout → Staff
Workbench returns → user cannot remain signed out.

**Next agent must inspect both session layers**, including at least:

- Frontend Firebase `signOut`
- `DELETE /v1/calendar-session` (controller already: verify cookie →
  Firestore `revokedAt` → `revokeRefreshTokens` → clear `__session`
  Set-Cookie)
- Whether Workbench logout actually **awaits** that DELETE with
  `credentials` so the cookie is sent
- Firestore `calendar_pilot_sessions` revoke vs cookie clear vs Firebase
  refresh-token revoke
- Firebase IndexedDB persistence / `onAuthStateChanged` /
  boot-time `currentUser`
- Redirect / reload / hash navigation
- Staff bootstrap: `calPilotCsrf` → `hydrateStaff` re-authenticates the
  Workbench UI without a new Google prompt
- CSRF / `sessionStorage` cleanup vs local `/workspace/logout` (synthetic
  local store — **not** the CAL-PILOT server session)

Source hints (do not treat as root cause without runtime evidence):

- Workbench click path (`admin-bootstrap.js`) fire-and-forget
  `DELETE /v1/calendar-session`, then `post('/workspace/logout')`, then
  reload. It does **not** call Firebase `signOut`.
- CAL-PILOT overlay path (`calendar-pilot-entry.js`) awaits DELETE then
  `signOut(auth)` then reload.
- Boot: cached `calPilotCsrf` hands off to Staff Workbench without a
  fresh Google + TOTP.

Do **not** weaken `verifyIdToken(idToken, true)`, the TOTP claim gate,
RBAC, or the disabled-account check to “make logout work”.

Do **not** execute M11 while this defect is unanalyzed if the publish
needs a session the operator cannot terminate.

## Telemetry / observability

Low-cardinality structured logs (`operation` / `result` / `errorCode`).
Do not log raw Firebase objects, messages, stacks, tokens, claims, or
identity.

Create-path operations:

- `calendar_session_verify_token`
- `calendar_session_email_verified`
- `calendar_session_allowlist`
- `calendar_session_second_factor`
- `calendar_session_account_enabled`
- `calendar_session_cookie_create`
- `calendar_session_firestore_create`
- `calendar_session_create`

Verify-token subreasons **on runtime 00007** (PR #138):

- `AUTH_GATE_VERIFY_TOKEN_EXPIRED`
- `AUTH_GATE_VERIFY_TOKEN_REVOKED`
- `AUTH_GATE_VERIFY_TOKEN_USER_DISABLED`
- `AUTH_GATE_VERIFY_TOKEN_AUDIENCE_MISMATCH`
- `AUTH_GATE_VERIFY_TOKEN_ISSUER_MISMATCH`
- `AUTH_GATE_VERIFY_TOKEN_MALFORMED`
- `AUTH_GATE_VERIFY_TOKEN_INTERNAL`
- `AUTH_GATE_VERIFY_TOKEN_UNKNOWN`

PR **#139** remains OPEN / DRAFT.

- Branch: `cursor/c1-verify-token-unknown-convergence-f9d6`
- Head: `e30949ad13f3851fb45a20bef09b69e590d72ec2`
- Purpose: extend UNKNOWN classification (`error.errorInfo.code`, extra
  Admin codes such as insufficient-permission). **Optional observability.**
  Not required for the successful login. **Do not merge it** from a
  documentation round.

## Calendar / M10

Synthetic Calendar IDs (not production; not patient calendars):

| Role | Calendar ID |
| --- | --- |
| Clinic test | `524eebf60dab5d4ffcaa2739333a022c51fa458f812582d004d84e31d9bdf21d@group.calendar.google.com` |
| CAL-PILOT fake source | `6ffc799628d3bc95ebe3871f44588411cfe60668fe6f0ad048e82e4589ba94b7@group.calendar.google.com` |
| CAL-PILOT test destination | `2ea9fcae642bd6aa88eea736fffda65676a1b95c2b6cfb14ebc343b66a6cf8ea@group.calendar.google.com` |

Worker identity: `internal-test-outbox@beauessence-clinic-stg-c1a01.iam.gserviceaccount.com`.
`GOOGLE_CALENDAR_AUTH = CLOUD_ADC`. No user-managed key.
`DOMAIN_WIDE_DELEGATION_REQUIRED = NO`. `events.watch` stays off.

M10 ADC probe = PASS; probe event deleted. Destination ACL for the worker
SA is already verified.

Current correct secret version: **`c1-synthetic-calendar-id:2`**.
`v1` is old / rollback-only. `v2` is the current target.

## M11 — synthetic schedule publish (not executed)

M11 = publish the synthetic schedule **through a real staff session**.

Must use: real Google, real existing TOTP, server `__session`, CSRF, RBAC.

Never: fake session, fake ID token, fake CSRF, fake TOTP, allowlist bypass.

Fixed idempotency key: `stagef_c1_schedule_publish_v0`
(`scripts/stage-f-synthetic-schedule-bootstrap.mjs`).
Do **not** use the Workbench random idempotency helper as M11 evidence.

Slots: 30 minutes. Initial `:00` / `:30`. Follow-up `:15` / `:45`
(`SLOT_MINUTE_MARKS` in `packages/domain/src/schedule.ts`). Synthetic
schedule only.

`M11_SCHEDULE_PUBLISH = NOT_YET_EXECUTED`. Do not run it from this
documentation round. Do not treat logout FAIL as permission to skip
session hygiene.

## M12 — worker enable (not started)

Do not enable worker processing or resume the scheduler until M11 has
evidence.

```text
INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED = false
SCHEDULER = PAUSED
M12_WORKER_ENABLE = NOT_STARTED
```

## Terraform critical warning

> **DO NOT APPLY a full Terraform plan that moves**
> `GOOGLE_CALENDAR_ID` **from** `c1-synthetic-calendar-id:2` **to**
> `:1`.
>
> Local `terraform.tfvars` still uses `secret_resource_version = 1` and
> stale image/SHA pins. A normal full plan also wants API/worker image
> and `INTERNAL_TEST_SOURCE_SHA` changes. That is a known footgun.
>
> If the plan contains `c1-synthetic-calendar-id:2` → `:1`:
>
> `CALENDAR_SECRET_VERSION_REGRESSION = DETECTED`  
> `FULL_PLAN = NOT_APPLIED`
>
> Past safe pattern: generate the **full** saved plan for inspection
> only → detect the regression → do **not** apply → generate a
> **targeted** IAM/API-only saved plan covering only the reviewed
> resources → inspect → apply that plan only.
>
> Tech debt (do not implement in a docs round): split
> **per-secret / per-service** secret version inputs before relying on
> full applies again.

IAM-only apply for PR #141 created
`google_project_iam_custom_role.api_firebaseauth_session_runtime` + API
SA membership **first**, then destroyed
`google_project_iam_member.api_firebaseauth_viewer`, so `users.get` never
dropped.

## Product invariants (compact)

- Public booking: no login, no OTP.
- Return / follow-up: phone + DOB only when the human chooses return; no
  OTP.
- Staff: Google + TOTP + server session + CSRF + RBAC.
- Appointment lifecycle: `confirmed` → `arrived` → `completed`; also
  `cancelled` / `no_show`. **`arrived` is not `completed`.**
- Follow-up required / not_required is a human decision. No clinical
  inference.
- Firestore is source of truth. Calendar is a projection through durable
  outbox. Inbound Calendar review is human approve/reject.
- Production Calendar inbound is deferred. Widget disabled.

## Security invariants

Never log or commit: OAuth client secret, Google password, Firebase ID
token, TOTP seed / QR / recovery / live code, `__session`, CSRF,
allowlist contents, raw Firebase claims.

Do not weaken: `verifyIdToken(idToken, true)`, exact TOTP second-factor
claim, RBAC, disabled-account check.

No production mutation without separate authorization. Isolated C1 IAM
or Cloud Run changes still need a fresh exact-SHA packet. This handoff
authorizes **nothing** in cloud.

Roles have one source: `packages/domain/src/roles.ts`.

## Open PRs

| PR | State | Notes |
| --- | --- | --- |
| [#139](https://github.com/waydefu/clinic/pull/139) | OPEN / DRAFT | Optional verify-token UNKNOWN convergence. Not required for login. Do not merge from a docs round. |

## Evidence references (auth sequence)

Verify mapping against git; do not claim a PR did work it did not.

| PR | Merge on `main` | What it actually did |
| --- | --- | --- |
| [#135](https://github.com/waydefu/clinic/pull/135) | `5ea2fa2c6b81164fc75b46adf7b35398b7f5f95d` | Parameterize C1 `firebase_auth_domain` to isolated Hosting host |
| [#136](https://github.com/waydefu/clinic/pull/136) | `6b899460decb6e9e89cf7cc54834a378c78618e8` | Fresh Google + TOTP after TOTP enrollment; 401 clears bounded client auth state |
| [#137](https://github.com/waydefu/clinic/pull/137) | `a4ebf64d33fb24b825dd652e6ec2b2dff92896f9` | PII-safe calendar-session gate telemetry |
| [#138](https://github.com/waydefu/clinic/pull/138) | `7dbe50a575b5d8e101da2e76b797eebf7a443cc6` | verify-token subreason classifier (runtime image source) |
| [#140](https://github.com/waydefu/clinic/pull/140) | `e71775e4bf686d9db061c5e21eaf85c0da535aaf` | IAM: `roles/firebaseauth.viewer` for `users.get` (later replaced) |
| [#141](https://github.com/waydefu/clinic/pull/141) | `ca2c35e8e01dd382247ef3891286225df575e14e` | IAM: custom role `users.get` + `users.createSession`; viewer removed |

Related dated reviews: [authDomain](2026-09-16-c1-firebase-auth-domain-parameterization.md),
[TOTP reauth](2026-09-16-cal-pilot-totp-enroll-reauth.md).

## Outstanding work (handoff priority)

Do not invent fixes. Do not start M11/M12 from this document.

1. **P1 High — staff logout defect.** Investigate full client + server
   session teardown (both layers). Add a failing regression if the cause
   is proven. Smallest fix at the owning boundary. No human-login round
   unless a later packet authorizes it.
2. **M11** synthetic schedule publish with a real staff session and
   `stagef_c1_schedule_publish_v0`. Only after session teardown is
   understood enough that the operator can control the session.
3. **M12** worker enable / outbox processing / unpause scheduler. Only
   after M11 evidence.
4. **Terraform tech debt:** per-secret / per-service secret version
   inputs. Until then: never apply a full plan that regresses calendar
   `:2` → `:1`.
5. **PR #139** optional telemetry hardening — rebase/merge only with
   explicit authority; not a login blocker.

Still applicable standing gates (do not resurrect obsolete login
blockers):

- `INTERNAL_PREPRODUCTION_COMPLETE = FAIL`
- `PUBLIC_PRODUCTION_LAUNCH = DEFERRED`
- `PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED`
- D-001–D-005 / D-011 pending for public booking and real patient data
- Production D-009 / D-016 still deferred (CAL-PILOT is synthetic-only)
- Human-alert path implemented in source; live proof may still be
  outstanding from Stage E/F docs
- API/worker images remain at `7dbe50a`; IAM merges did not redeploy

Obsolete — do **not** restore as current blockers:

- Login blocked
- `firebaseauth.users.get` DENIED
- `firebaseauth.users.createSession` DENIED
- M11 blocked pending human staff login

## Do-not-do list

- Do not fix logout in a documentation round.
- Do not deploy API/worker, Hosting, Terraform full apply, or IAM.
- Do not enable worker processing or unpause the scheduler.
- Do not execute M11 or M12 from this handoff.
- Do not fabricate ID tokens, CSRF, TOTP, or sessions.
- Do not merge PR #139 unless a later packet says so.
- Do not apply any plan that sets calendar secret `:1`.
- Do not tick `INTERNAL_PREPRODUCTION_COMPLETE` or production launch.
- Do not use real patient / payroll / calendar / social / NAS data.

## Next agent's first steps

1. `git fetch origin main` and confirm `origin/main` (or read the delta).
2. Read this handoff, Safety Floor in `AGENTS.md`, and
   `docs/product/phase-1-decision-register.md` for any policy guess.
3. If the next authorized task is logout: reproduce on isolated C1
   preview, find the earliest incorrect state across **both** session
   layers, add a regression, then the smallest fix. Do not start M11 as
   a side effect.
4. If the next authorized task is M11: require a real human Google +
   TOTP session and the fixed idempotency key. Stop if logout still
   leaves an uncontrollable session and the packet does not accept that
   risk.

## Local / cloud traps

- Command guard denies `terraform apply`; isolated C1 apply still needs
  an explicit packet even when the shell can run it.
- Policy Troubleshooter API is disabled; prove IAM with
  `gcloud projects get-iam-policy` + `gcloud iam roles describe`.
- `scripts/stage-e-evidence.test.mjs` can timeout when
  `evaluateHistoricalArtifacts` hashes a large `/opt/cursor/artifacts`
  tree. That is a pre-existing venue flake, not a Stage F functional
  regression. Do not “fix” it inside an unrelated PR.
- Full Terraform plan image pins in local `terraform.tfvars` are stale
  versus live `00007` / `00008`.

## Audit coverage and what this record does not cover

**Covered:** git history of PRs #135–#141 and #139; Terraform IAM source
on `ca2c35e`; staff logout / session source as investigation hints;
domain slot marks; Stage F schedule idempotency constant.

**Not covered this round:** new human login, logout runtime traces,
Cloud Logging of the logout clicks, M11/M12 execution, Terraform apply,
API deploy, production, real data.

Gates for **this documentation commit** are recorded on the PR that
lands it (`NOT_RUN` here for cloud): Terraform apply `NOT_RUN`, deploy
`NOT_RUN`, human login `NOT_RUN`, M11 `NOT_RUN`, M12 `NOT_RUN`.
