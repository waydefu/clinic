# Stage F0 exact-SHA cloud authority packet

**Status:** draft for clinic-owner signature. **Not apply. Not deploy.**
Drafter is not an approver. Signed WP-B1 A is API *direction* only and is
**not** this packet.

This file cannot cite its own commit. Lookup:
`git log -- docs/reviews/2026-09-15-stage-f0-exact-sha-authority-packet.md`.

```text
PACKET_ID = STAGE_F0_EXACT_SHA_AUTHORITY_2026-09-15
AUTHORITY_SHA = 186f1f9ca7afe2fe03ca55dfaf1326149bfa9919
GENERATED_AT = 2026-09-15T15:37:14+08:00 (Asia/Taipei)
CLOUD_MUTATION = NONE (this round)
APPLY_ON_THIS_SHA = BLOCKED_BY_SOURCE_GAPS
HUMAN BLOCKER = OWNER_EXACT_SHA_CLOUD_MUTATION_APPROVAL_REQUIRED
```

If `git rev-parse origin/main` is no longer `AUTHORITY_SHA` at apply time:
`AUTHORITY_INVALIDATED`. Produce a new packet. Do not reuse
`a9a445a`, `2a336e9`, `8df6e26`, `df110bc`, `8cb41ec`, or this packet
after main moves.

Merging this document onto `main` itself creates a new SHA and
**invalidates** apply against `AUTHORITY_SHA`. Keep this file as dated
evidence; apply only from a tree whose `HEAD` equals the then-current
packet SHA.

---

## Identity

| Field | Fresh value |
| --- | --- |
| Repository | `waydefu/clinic` |
| Exact main SHA | `186f1f9ca7afe2fe03ca55dfaf1326149bfa9919` |
| Merge | `Merge pull request #130 from waydefu/cursor/stage-e-monitoring-f9d6` |
| Generated | `2026-09-15T15:37:14+08:00` Asia/Taipei |
| Drafter / executor | Cursor Cloud Agent (draft only; not a signer) |
| Approver | clinic owner only |
| GCP/Firebase project | `beauessence-clinic-stg-c1a01` (number `270910958856`, `ACTIVE`) |
| Region (repo + live database) | `asia-east1` — resolved from C1/C5/WP-B4 terraform validation and live Firestore `locationId`. **Not guessed.** |
| Firebase Hosting site | `beauessence-clinic-stg-c1a01` |
| Intended preview channel | `internal-preproduction` (7-day expiry on deploy) |
| Intended Cloud Run API | `internal-test-api` |
| Intended Cloud Run worker | `internal-test-outbox` (name not in tree; must be created by a later SHA-gated module) |
| Intended Artifact Registry | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/{api,worker}` — **not created**. Do not reuse staging `cal-pilot` repository. |
| Forbidden project | `beauessence-clinic-staging` |

---

## Fresh repository / readiness inspect

| Item | Fresh value |
| --- | --- |
| `origin/main` | `186f1f9ca7afe2fe03ca55dfaf1326149bfa9919` (matches the expected post-#130 SHA) |
| Working tree | clean of tracked changes; untracked `.cursor/mcp.json` and `.serena/` not committed |
| Open PRs against `main` | **none** |
| Exact-head CI on main | `verify` run [34941357930](https://github.com/waydefu/clinic/actions/runs/34941357930) `SUCCESS`; 12/12 including `Verification evidence` |
| Stage A+B | in main via #127 (signed WP-B). Historical main-push `verify` 34916708728 on that merge was `failure`; later main is green |
| Stage C | in main via #128 |
| Stage D | in main via #129 |
| Stage E | in main via #130 (`8cb41ec` closeout + merge) |
| Isolated Hosting config | `firebase.isolated-preview.json` — **static only**, no `/v1/**` rewrite |
| Staging Hosting config | `firebase.json` `/v1/**` → `cal-pilot-api` `asia-east1` — **must not be deployed to C1** |
| `firebase.isolated-api-preview.json` | **SOURCE_MISSING** |
| Cloud Run terraform | **SOURCE_MISSING** (no `google_cloud_run` in `infra/terraform`) |
| Container build | `containers/api.Dockerfile`, `containers/worker.Dockerfile`, `containers/cal-pilot.cloudbuild.yaml` (CAL-PILOT / staging image names) |
| C1 Cloud Build / AR module | **SOURCE_MISSING** |
| WP-B4 terraform | `infra/terraform/wp-b4-alerting` default `exact_apply_authority_sha = not_granted` (zero resources) |
| Backup/PITR source | `infra/terraform/c5-firestore` (already applied historically; live inspect below) |
| Stage F matrix | `docs/architecture/stage-f-deployed-acceptance-matrix.md` + `pnpm inspect:stage-f-matrix` (spec only until `deployed: true`) |

---

## Fresh read-only cloud inventory

Operator identity used: active gcloud account already on project
`beauessence-clinic-stg-c1a01`. Commands: `describe` / `list` / HTTP GET
only. **No enable, create, update, delete, apply, deploy.**

### Project / APIs / region

| Item | Fresh status |
| --- | --- |
| Project | `beauessence-clinic-stg-c1a01` / `270910958856` / `ACTIVE` |
| Region | `asia-east1` (Firestore `locationId`; C1 logging bucket location) |
| `run.googleapis.com` | **not enabled**. `gcloud run services list` → `SERVICE_DISABLED`. API **not** enabled to continue. |
| `artifactregistry.googleapis.com` | **not enabled** |
| `cloudbuild.googleapis.com` | **not enabled** |
| Enabled of interest | `firebase`, `firebasehosting`, `firestore`, `identitytoolkit`, `calendar-json`, `logging`, `monitoring`, `pubsub`, `iam`, `iamcredentials`, `secretmanager`, `storage`, `billingbudgets`, … |
| Cloud Run services | none (Admin API disabled) |
| Artifact Registry repos (`asia-east1`) | none / list refused (`READBACK_UNAVAILABLE` beyond “API not enabled”) |

### Hosting

| Channel | URL | Notes |
| --- | --- | --- |
| `internal-preproduction` | `https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app` | version `0c39c54909388fd4`; expireTime `2026-09-21T04:14:28Z`; **no `/v1` rewrite** |
| `live` | `https://beauessence-clinic-stg-c1a01.web.app` | `updateTime` `2026-09-13T19:22:42Z`. **Forbidden to mutate.** |

HTTP GET on the **preview suffix** (2026-09-15T15:37+08):

| Path | HTTP | Meaning |
| --- | --- | --- |
| `/clinic` `/staff` `/booking` | 200 `text/html` | static preview |
| `/v1/health` `/v1/health/live` `/v1/health/ready` `/v1/health/operational` `/v1/bookings` | **404** `text/html` | `API_NOT_MOUNTED` — **not** fail-closed 503 |
| `/widget` | 404 | this Hosting version predates Stage E widget surface |

Deployed CSP on preview still includes
`frame-src 'self' https://beauessence-clinic-staging.firebaseapp.com`.
Stage E **source** on `AUTHORITY_SHA` already removes that origin from
isolated catalog. The live preview has **not** been redeployed. Staff and
booking currently send `X-Frame-Options: DENY` + `frame-ancestors 'none'`.

### Firestore / backup

| Item | Fresh status |
| --- | --- |
| Database | `(default)` `FIRESTORE_NATIVE` `asia-east1` |
| PITR | `POINT_IN_TIME_RECOVERY_ENABLED`; retention `604800s` (7d) |
| Delete protection | `DELETE_PROTECTION_ENABLED` |
| Daily backup | schedule `190509f6-cc1d-4255-a487-67e1e4b559e6`; retention `2592000s`; createTime `2026-09-14T04:15:15Z` |
| Composite indexes | **none deployed** (`[]`) |
| Rules architecture | repo `firestore.rules` remain deny-all (browser ↛ Firestore) |
| Stage F backup mutation | **not required** if inspect stays healthy; verify only. Restore drill = **new** database, never overwrite `(default)` |

### Monitoring / Pub/Sub / notification

| Item | Fresh status |
| --- | --- |
| Log metric | `c1-iam-setiampolicy` only |
| Alert policy | `C1 IAM SetIamPolicy` enabled (`10735229316443092488`) |
| Pub/Sub | `c1-budget-notifications` only — **no** `c1-application-alerts` |
| Notification channels | one Pub/Sub “C1 budget Pub/Sub”. **No email channel.** |
| WP-B4 application policies | **not applied** |
| `HUMAN_NOTIFICATION_PATH` | remains `IMPLEMENTED_NOT_DEPLOYED` |

### Identity / secrets / Calendar

| Item | Fresh status |
| --- | --- |
| WIF | pool `c1-github` |
| Service accounts | `c1-terraform-ci`, `firebase-adminsdk-fbsvc`. **No Cloud Run runtime SA.** |
| Secret `c1-bootstrap-reserved` | exists; **0 versions** (C1 empty-container invariant) |
| C1 Auth web API key / allowlist secrets | **not present** (names must be created later; values never in git) |
| `calendar-json.googleapis.com` | enabled |
| Synthetic Calendar runtime (SA JSON, calendar IDs) | **READBACK_UNAVAILABLE / not configured** — do not invent production calendar IDs |

### Terraform state

State bucket convention: `gs://beauessence-clinic-stg-c1a01-tfstate`
(from C1 packet). This F0 round did not `terraform state list`. Treat
remote state location as **resolve-at-apply from the C1 packet**, not as
a newly invented bucket.

---

## SOURCE_MISSING (blocks apply on `AUTHORITY_SHA`)

These are repository gaps. Filling them **changes git SHA** and
invalidates this packet. Do not paper over them with ad-hoc `gcloud`.

| ID | Gap | Why apply cannot proceed on this SHA |
| --- | --- | --- |
| E1 | `firebase.isolated-api-preview.json` | `check:pages` forbids Cloud Run rewrite on `firebase.isolated-preview.json`. New config + gate allowlist required. Keep the static file as rollback. |
| E2 | SHA-gated C1 Cloud Run + Artifact Registry + runtime SA terraform | No `google_cloud_run` in tree. Region must stay `asia-east1`. |
| E3 | C1 Cloud Build / image names | Existing cloudbuild tags `…/cal-pilot/…` and scripts hard-code `beauessence-clinic-staging`. |
| E4 | Internal-test outbox **cloud** boot | `assertInternalTestOutboxBootAllowed` requires `FIRESTORE_EMULATOR_HOST`. Default calendar is `InMemoryCalendar`. Worker image `CMD` is CAL-PILOT sync, not outbox. Stage F Calendar E2E cannot pass. |
| E5 | WP-B4 terraform gaps | Catalog requires `excessive_outbox_age` (≥ 60s) and `iam_setiampolicy` application path. `main.tf` `application_policies` omits both. |
| E6 | C1 secret names for staff Auth client-config + allowlists | API needs `CALENDAR_PILOT_FIREBASE_WEB_API_KEY`, `CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN`, `GOOGLE_CLOUD_PROJECT` = C1, manager/front_desk allowlists. Values stay in Secret Manager / tfvar. |
| E7 | Composite index deploy from `firestore.indexes.json` | Live composite index list is empty. Outbox/candidate queries will fail without indexes. |

Recommended owner path: **do not apply this SHA**. Authorise engineering
E1–E7 on a follow-on branch, merge, then issue **Stage F0.1** on the new
`origin/main`.

---

## Intended product / security (must not regress)

- Accountless general booking (no patient login, no OTP).
- Return lookup only after 回診: phone + DOB, no OTP; generic miss;
  WP-B2 limiter; `patientId` is the stable id.
- Follow-up required may be unscheduled; `:15` / `:45` grid; no duplicate
  active follow-up.
- Lifecycle `confirmed → arrived → completed`; plus `cancelled` /
  `no_show`. Calendar event is patched, not triplicated or deleted.
- DB SoT; Calendar projection via outbox/worker. Manual Calendar edit →
  candidate → `manager` / `front_desk`. No Calendar→DB.
- `PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED`. Isolated synthetic
  Calendar E2E only. No production `events.watch`.
- `CURRENT_WIDGET_EMBED = DISABLED` (`frame-ancestors 'none'`). No
  wildcard, no speculative vendor host.
- Browser never writes Firestore (ADR-0003). Staff routes stay
  CSRF + RBAC. Do not relax staff auth to make public booking work.
- Gate closed → `/v1` **503**. Gate open → valid anonymous create **2xx**,
  not 401. Deployed `/v1/*` **404** = `FAIL` `API_NOT_MOUNTED`.
- Synthetic PII only. No real patient data.

WP-B2 (code: `packages/domain/src/rate-limit-parameters.ts`):

| Policy | Limit |
| --- | --- |
| Unauth general | 60 / 60s / source IP (`TRUSTED_PROXY_HOPS`, default 1; spoofed `X-Forwarded-For` must not pick the key) |
| Identified writes | 30 / 60s / opaque actor |
| Lookup/auth failure | 5 / 15 min then 15 min lock; 429 + `Retry-After` |

WP-B4 thresholds (keep; do not relax outbox age to 5 minutes):

| Alert | Threshold |
| --- | --- |
| HTTP 5xx | ≥ 3 / 5 min (exclude fail-closed `SERVICE_UNAVAILABLE`) |
| Booking write failure | ≥ 3 / 5 min |
| Auth / authz | ≥ 10 / 5 min |
| Dead-letter | > 0 |
| Outbox oldest age | ≥ **60 s** |
| Backup failure | ≥ 1 |
| IAM SetIamPolicy | ≥ 1 |

Health: `/v1/health` and `/live` = process liveness; `/ready` =
dependency/config (503 if Firestore/config unavailable); `/operational`
= always HTTP 200 with `healthy` / `degraded` / `unhealthy`. Dead-letter
and Calendar lag must not restart the process.

---

## Planned mutations

**None of these ran in Stage F0.** Each row is what a later signed
packet on a tree that contains E1–E7 would authorise. Commands are
owner-run. Agent sandbox remains `execute: false`.

### M1 — Enable Cloud Run + Artifact Registry APIs

| Field | Value |
| --- | --- |
| Resource | `run.googleapis.com`, `artifactregistry.googleapis.com` (Cloud Build **only if** the C1 build path requires it) |
| Current | not enabled |
| Desired | enabled on `beauessence-clinic-stg-c1a01` only |
| Tool | `gcloud services enable … --project=beauessence-clinic-stg-c1a01` **after** `HEAD == AUTHORITY_SHA_THEN` |
| Type | API enablement |
| Why | WP-B1 A direction; required to host `internal-test-api` |
| Rollback | leave APIs enabled (C1 packet: do not disable as default rollback); stop at services unused |
| Evidence | `gcloud services list --enabled` |

### M2 — Artifact Registry repository `internal-test`

| Field | Value |
| --- | --- |
| Resource | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test` |
| Current | absent |
| Desired | Docker repo in `asia-east1` |
| Tool | SHA-gated terraform (E2) or equivalent owner apply |
| Rollback | do not `destroy` blindly; empty repo can remain |
| Evidence | `gcloud artifacts repositories describe` |

### M3 — Runtime service accounts + least-privilege IAM

| Field | Value |
| --- | --- |
| Resource | new SAs e.g. `internal-test-api`, `internal-test-outbox` (names from E2 module, not invented at apply time if module differs) |
| Current | only `c1-terraform-ci` + Firebase admin SDK SA |
| Desired | dedicated runtime SAs; **no** Owner/Editor on terraform-ci; runtime gets `datastore.user`, Secret Manager accessor for **named** C1 secrets, Calendar scope only if synthetic adapter requires it |
| Forbidden | copying CAL-PILOT staging SA keys; downloading JSON keys into git |
| Rollback | disable new SAs; do not delete project |
| Evidence | `gcloud iam service-accounts list` + IAM bindings **without** pasting emails into git |

### M4 — Secret containers (values never in git / chat / evidence)

| Field | Value |
| --- | --- |
| Resource | C1 Auth web API key, authDomain, manager/front_desk allowlists, synthetic Calendar credentials if used |
| Current | `c1-bootstrap-reserved` empty |
| Desired | named secrets with versions; env refs on Cloud Run |
| Rollback | disable secret versions; keep empty reserved secret |
| Evidence | `gcloud secrets list` names + version **count** only |

### M5 — Build and deploy Cloud Run `internal-test-api`

| Field | Value |
| --- | --- |
| Source SHA | then-current packet SHA (not this one until E1–E7 land) |
| Build | `containers/api.Dockerfile`; `CMD node dist/main.js`; `PORT=8080` `HOST=0.0.0.0` `ALLOW_NON_LOOPBACK_BIND=true` |
| Image | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/api@sha256:…` (digest-pinned) |
| Region | `asia-east1` |
| Runtime | Cloud Run (container from Dockerfile Node 24) |
| Service account | M3 API SA |
| Ingress | Hosting rewrite `/v1/**` is the public path. Direct Run URL is not the product URL. Invoker: Firebase Hosting service agent if resolvable at apply time; **do not guess** the agent email now. Isolated C1 may need unauthenticated invoke for Hosting rewrite — record the actual binding in apply evidence. Never `beauessence-clinic-staging`. |
| Env (names) | `GOOGLE_CLOUD_PROJECT=beauessence-clinic-stg-c1a01`; `INTERNAL_TEST_BOOKING_ENABLED`; `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC`; `CALENDAR_PILOT_FIREBASE_WEB_API_KEY`; `CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN`; `CALENDAR_PILOT_MANAGER_EMAILS`; `CALENDAR_PILOT_FRONT_DESK_EMAILS`; `TRUSTED_PROXY_HOPS` (default 1 unless measured Hosting→Run hops differ) |
| min/max/timeout/concurrency | **NOT_CONFIGURED_IN_TREE**. E2 module must name them. Do not invent numbers here. |
| Rollback | first revision: route Hosting off Run (M6 rollback). Subsequent: `gcloud run services update-traffic internal-test-api --to-revisions=PREV=100 --region=asia-east1 --project=beauessence-clinic-stg-c1a01`. Service **delete** only with extra explicit authority. |
| Evidence | `gcloud run services describe` (redact URLs if needed); GET `/v1/health` via Hosting |

### M6 — Hosting preview rewrite (not live)

| Field | Value |
| --- | --- |
| Resource | channel `internal-preproduction` using **new** `firebase.isolated-api-preview.json` |
| Current | static `firebase.isolated-preview.json`; `/v1` 404 |
| Desired | Booking Page + Workbench static + `/v1/**` → `internal-test-api` `asia-east1` `pinTag: true`; isolated CSP (no staging origin); widget `frame-ancestors 'none'` without claiming embed |
| Command shape | `firebase hosting:channel:deploy internal-preproduction --expires=7d --project=beauessence-clinic-stg-c1a01 --config=firebase.isolated-api-preview.json` |
| Forbidden | `--only` live; project `beauessence-clinic-staging`; `firebase login:ci` |
| Rollback | redeploy **static** `firebase.isolated-preview.json` to the same channel, or `firebase hosting:channel:delete internal-preproduction --force --project=beauessence-clinic-stg-c1a01 --config=firebase.isolated-preview.json` |
| Evidence | channel inspect JSON; GET `/v1/health` 200; GET `/v1/bookings` gate-closed **503** not 404 |

### M7 — Worker `internal-test-outbox` (after E4)

| Field | Value |
| --- | --- |
| Why | Outbox → synthetic Calendar projection; WP-B10 |
| Current | no C1 worker; code refuses cloud Firestore |
| Desired | Cloud Run service draining `outbox_jobs` with **synthetic** Google Calendar adapter (not `InMemoryCalendar`, not production calendars) |
| Rollback | stop traffic / disable scheduler trigger if one is added; do not drain against staging |
| Evidence | worker `/live` 200; `/health` 200 even when degraded; Calendar event id stable across arrived/completed |

### M8 — Firestore indexes (and rules verify)

| Field | Value |
| --- | --- |
| Resource | composite indexes in `firestore.indexes.json` (`outbox_jobs`, `calendar_pilot_*`) |
| Current | none |
| Desired | indexes READY; rules remain deny-all |
| Tool | `firebase deploy --only firestore:indexes --project=beauessence-clinic-stg-c1a01` (owner-run; still a mutation) |
| Rollback | indexes are additive; do not drop blindly. Rules rollback = redeploy deny-all `firestore.rules` |
| Evidence | `gcloud firestore indexes composite list` |

### M9 — WP-B4 monitoring apply (after E5)

| Field | Value |
| --- | --- |
| Resource | topic `c1-application-alerts`; email notification channel (address from tfvar/secret); log metrics; alert policies |
| Current | IAM SetIamPolicy + budget Pub/Sub only |
| Desired | immediate WP-B4 set including 60s outbox age and IAM (reuse metric `c1-iam-setiampolicy`; do not destroy C1 budget path) |
| Tool | `infra/terraform/wp-b4-alerting` with `exact_apply_authority_sha=<then SHA>` and `project_id=beauessence-clinic-stg-c1a01` |
| Rollback | targeted disable of **new** WP-B4 policies/metrics/topic; **do not** re-apply `not_granted` onto `c1-foundation` / `c5-firestore` |
| Evidence | policy list; one synthetic human inbox proof before `HUMAN_NOTIFICATION_PROVEN` |

### M10 — Backup

| Field | Value |
| --- | --- |
| Current | PITR on; daily 30-day schedule already applied |
| Stage F mutation | **none** unless inspect shows drift |
| Verify | `pnpm inspect:internal-test-backup` against a fresh snapshot |
| Restore drill | **optional**, isolated **new** database only, separate sentence of authority |

---

## Blast radius / exclusions

Stage F may touch **only** `beauessence-clinic-stg-c1a01` isolated
internal-preproduction resources.

Forbidden:

- production project / official DNS / public marketing homepage
- `beauessence-clinic-staging` (CAL-PILOT + `synthetic-review` only)
- live Firebase Hosting channel
- production Calendar inbound / `events.watch`
- real patient data
- `frame-ancestors *` or speculative vendor hosts
- D-001～D-005 flip to `approved`
- public production `/v1/bookings`

If any target identity is uncertain: **STOP**.

---

## Cost class (expected)

| Class | Notes |
| --- | --- |
| Already running | Firestore Native + PITR + daily backup; Hosting preview; logging/monitoring |
| New ongoing | Cloud Run (API + worker), Artifact Registry storage, Cloud Build minutes if used, email alerts |
| Bounded | preview channel 7-day expiry; kill switch `INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC` |
| Cleanup | channel delete; Run traffic to 0; keep Firestore (authoritative synthetic data) unless extra authority |

---

## Rollback summary

| Family | Rollback |
| --- | --- |
| Hosting | static `firebase.isolated-preview.json` or delete preview channel. **Never** live. |
| Cloud Run | previous revision traffic 100%; first deploy → unmount rewrite. Delete service only if extra-authorised. |
| Terraform WP-B4 | disable/remove **new** policies only. No broad destroy. No `not_granted` on C1/C5. |
| Firestore | no destructive rollback of `(default)`. Forward-repair or restore-to-**new**-db. |
| IAM/API enable | disable new SAs; do not detach billing; do not delete project. |

---

## Stage F deployed acceptance matrix (evidence files)

Evaluator: `pnpm inspect:stage-f-matrix` after `deployed: true`. Without
deployment every case stays `NOT_DEPLOYED`.

| ID | Acceptance | Evidence artifact (names; not created this round) |
| --- | --- | --- |
| `health_live_ready_operational` | `/v1/health`+`/live` process; `/ready` 503 if Firestore/config down; `/operational` 200 body | `output/evidence/stage-f-health.json` |
| `gate_closed_503` | booking API 503 not 404 | `output/evidence/stage-f-gate-closed.json` |
| `gate_open_accountless_2xx` | valid anonymous create succeeds; not 401 | `output/evidence/stage-f-gate-open.json` |
| `general_booking_page_create_reload` | real backend slots; synthetic intake; create; reload; Firestore exists; not localStorage SoT; Workbench sees it; Calendar projection exists | `output/evidence/stage-f-e2e-general-booking.json` |
| `return_lookup_existing` | 回診; phone+DOB; no OTP; existing follow-up shown; no duplicate | `output/evidence/stage-f-e2e-return-existing.json` |
| `return_required_unscheduled_follow_up` | required + unscheduled → `:15/:45` → `follow_up` same `patientId` + lineage | `output/evidence/stage-f-e2e-return-schedule.json` |
| `workbench_arrived_completed` | confirmed→arrived→completed; audit+outbox; same Calendar event; not deleted | `output/evidence/stage-f-e2e-lifecycle.json` |
| `follow_up_not_required` | closes active follow-up; retain patient/appointments/audit/follow-up/Calendar history | `output/evidence/stage-f-e2e-not-required.json` |
| `candidate_review_approve_reject` | synthetic Calendar manual edit → candidate; DB unchanged until approve; reject leaves DB | `output/evidence/stage-f-e2e-calendar-review.json` |
| `security_rate_limit` | 60/60 IP; 30/60 actor; 5/15 lock; 429 Retry-After; durable; spoofed XFF ignored | `output/evidence/stage-f-rate-limit.json` |
| `security_anti_enumeration` | generic miss; no partial identity leak | `output/evidence/stage-f-anti-enum.json` |
| `security_denial_audit` | one durable denial; no token/cookie/TOTP/DOB/raw phone | `output/evidence/stage-f-denial-audit.json` |
| `security_one_real_human_alert` | synthetic trigger → policy → human inbox | `output/evidence/stage-f-human-alert.json` (no email address) |
| `csp_headers` | CSP, nosniff, referrer, permissions, Hosting HSTS; staff framedeny; booking non-embed; widget disabled; no staging origin; no wildcard | `output/evidence/stage-f-csp.json` |
| `backup_inspect` | PITR + daily schedule still present | `output/evidence/stage-f-backup.json` |
| `completeness_inspect` | `pnpm inspect:internal-preproduction` on this SHA | `output/evidence/stage-f-completeness.json` |

Until human inbox proof: `HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED`.
Never write `HUMAN_NOTIFICATION_PROVEN` without that file.

---

## Explicit exclusions

```text
PUBLIC_PRODUCTION_LAUNCH = DEFERRED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
REAL_PATIENT_DATA = NOT_AUTHORIZED
PUBLIC_MARKETING_HOMEPAGE = OUT_OF_SCOPE
DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE = UNCHANGED
CURRENT_WIDGET_EMBED = DISABLED
FUTURE_WIDGET_EMBED = ARCHITECTURALLY_SUPPORTED_BUT_NOT_AUTHORIZED
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
CLOUD_MUTATION = NONE
```

---

## HUMAN BLOCKER

```text
HUMAN BLOCKER
PHASE: Stage F0 — Internal Preproduction Deployment & Acceptance
DECISION OR RESOURCE: Exact-SHA cloud mutation approval for isolated C1 beauessence-clinic-stg-c1a01 (Cloud Run internal-test-api, Hosting preview rewrite, WP-B4 apply, indexes) bound to origin/main 186f1f9ca7afe2fe03ca55dfaf1326149bfa9919
ONE QUESTION: Does the clinic owner APPROVE or REJECT STAGE_F_EXACT_SHA_AUTHORITY for that SHA and bounded list, knowing SOURCE_GAPS E1–E7 currently block a successful Stage F apply on this SHA?
WHY I CANNOT PROCEED: Safety Floor 8 and D-010 require a fresh per-commit packet; WP-B1 A is not that packet; this tree still lacks isolated-api Hosting config, C1 Run terraform, cloud outbox worker, and complete WP-B4 terraform
WHAT I WILL NOT DO UNTIL ANSWERED: gcloud services enable; terraform apply; gcloud run deploy; firebase deploy; IAM mutation; monitoring apply; Hosting channel deploy; Firestore index deploy; Calendar production activation
SAFE OPTIONS (if any): keep inspecting; prepare E1–E7 engineering on a follow-on branch without cloud mutation; keep production booking unauthorised
```

---

## STAGE_F_EXACT_SHA_AUTHORITY (owner signature block)

```text
STAGE_F_EXACT_SHA_AUTHORITY

Repository:
waydefu/clinic

Exact SHA:
186f1f9ca7afe2fe03ca55dfaf1326149bfa9919

Authorized target:
project beauessence-clinic-stg-c1a01
region asia-east1
Firebase Hosting site beauessence-clinic-stg-c1a01
preview channel internal-preproduction (not live)
Cloud Run service internal-test-api
Artifact Registry asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test
WP-B4 module infra/terraform/wp-b4-alerting

Authorized mutations (only after E1–E7 exist on a still-matching SHA, or a replacement packet):
M1 enable run.googleapis.com + artifactregistry.googleapis.com
M2 Artifact Registry repository internal-test
M3 runtime service accounts + least-privilege IAM
M4 named secrets (no values in git)
M5 build/deploy internal-test-api (digest-pinned)
M6 Hosting preview deploy with /v1/** rewrite (firebase.isolated-api-preview.json)
M7 worker internal-test-outbox (synthetic Calendar only)
M8 Firestore composite indexes from firestore.indexes.json
M9 WP-B4 application alerts + human email channel (address from secret/tfvar)
M10 backup verify only unless inspect shows drift

Forbidden:
production project
beauessence-clinic-staging
live Hosting
official DNS
production Calendar inbound / events.watch
real patient data
public marketing homepage takeover
frame-ancestors wildcard / speculative vendor hosts
D-001–D-005 approved flip
public production /v1/bookings
terraform destroy of c1-foundation / c5-firestore
reuse of packets a9a445a / 2a336e9 / 8df6e26 / df110bc / 8cb41ec

Rollback:
Hosting → firebase.isolated-preview.json or delete preview channel
Cloud Run → previous revision (or unmount rewrite on first revision)
WP-B4 → disable new policies only
Firestore → no overwrite restore of (default)

Expiry:
7 days from owner signature, or immediately if origin/main != Exact SHA

APPLY_ON_THIS_SHA:
BLOCKED_BY_SOURCE_GAPS (E1–E7)

OWNER DECISION:
[ ] APPROVE
[ ] REJECT
```

Do not tick APPROVE in this file. Do not treat WP-B1 A as this approval.
