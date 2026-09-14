# WP-B1～B11 已簽署權威與 F-01～F-14 closure matrix — 2026-09-15

Dated evidence for **Stage A (Fresh Baseline)** and **Stage B (Product /
Authority Reconciliation)** only. Not a Cloud Run, Firebase, or GCP mutation
packet. Not Stage C engineering. Not `INTERNAL_PREPRODUCTION_COMPLETE = PASS`.

This file cannot cite its own commit. Lookup:
`git log -- docs/reviews/2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md`.

## Closure set (declared before the first edit)

| Field | Value |
| --- | --- |
| Set | F-01～F-14 plus signed WP-B1～B11 plus 2026-09-15 product-surface clarification |
| Authoritative source | Clinic-owner signed Google Doc [WP-B1～B11 業主連審表](https://docs.google.com/document/d/1HTFBOkrmsihz0rZzAnOhBPB0WGn45EI2nqF5R-WKAbI/edit) (`wayde.fu`, `2026/9/15/1:54` Asia/Taipei); F IDs from [2026-09-14 remediation plan](../plans/2026-09-14-internal-preproduction-remediation-plan.md); scope clarification from the clinic owner's 2026-09-15 work order |
| This PR closes | Canon / Decision Register / current-vs-stale markers. **No finding is `FIXED`.** |
| Engineering / cloud | Deferred to Stage C+ and a later exact-SHA WP-C1 packet |
| Terminal states used here | `CONFIRMED` · `ALREADY_FIXED` · `PARTIAL` · `NO_LONGER_APPLICABLE` · `BLOCKED_BY_AUTHORITY` |

The Drive file header still says `OWNER_SIGNATURE_PENDING`. The **簽署**
block records `Clinic owner：wayde.fu` and `2026/9/15/1:54`. This review treats
the signature block as the owner act. The assistant is not an approver and did
not change the Drive source.

## 一句話

`origin/main` `2a336e9feb7bc3c5e4defda719a562cd1b4482a3` has signed
internal-preproduction product authority (WP-B1～B11) and a clarified
Booking Page + Staff Workbench scope, but isolated C1 is still a static
Hosting preview with **no API**. `INTERNAL_PREPRODUCTION_COMPLETE = FAIL`.
`PUBLIC_PRODUCTION_LAUNCH = DEFERRED`.

---

## Stage A — Fresh Baseline

Evidence rung for this inspect: **CODE-ONLY** for repository routing; **live
read-only GCP/Firebase/HTTP** for isolated C1 (no enable, no apply, no deploy).
CI cited below is **CI-VERIFIED** for `origin/main` `2a336e9`, not for this
docs commit.

### A.1 Git / PR / CI / branch protection

| Item | Fresh value (2026-09-14T18:40Z session) |
| --- | --- |
| `origin/main` exact SHA | `2a336e9feb7bc3c5e4defda719a562cd1b4482a3` |
| Message | `Merge pull request #126 from waydefu/cursor/wp-b1-c1-api-authority-packet-f9d6` |
| Author date | 2026-09-14 21:39:36 +0800 |
| Open PRs against `main` | **none** |
| Recent closed merges | #126 WP-B1 packet (waiting sheet, now superseded by this signed record); #125 remediation plan; #124 inspect PASS on `a9a445a`; #123 IP-001 code |
| Exact-head CI on `2a336e9` | `verify` run [34850611130](https://github.com/waydefu/clinic/actions/runs/34850611130) `success`; **12/12** check-runs `success` including `Verification evidence` |
| Branch protection API | `403 Resource not accessible by integration` — not re-read this session |
| D-013 last recorded protection | `strict=true`, `required_approving_review_count=0`, `allow_force_pushes=false`, administrators bound (2026-09-09). WP-B5-2 keeps count `0` |
| Worktree for this record | branch `cursor/wp-b-signed-canon-f9d6` created from `origin/main` `2a336e9`. Untracked `.cursor/mcp.json` and `.serena/` were present and **not** committed |

### A.2 Isolated C1 actual deployment (read-only)

Project `beauessence-clinic-stg-c1a01` (`270910958856`), region `asia-east1`,
operator account `wayde.fu@gmail.com`. Forbidden project
`beauessence-clinic-staging` was **not** targeted.

| Surface | Fresh status |
| --- | --- |
| Enabled APIs of interest | `firebase`, `firebasehosting`, `firestore`, `identitytoolkit`, `logging`, `monitoring`, `pubsub`, `iam`, `iamcredentials`, `secretmanager`, `calendar-json`. **`run.googleapis.com` not enabled. `artifactregistry.googleapis.com` not enabled. `cloudbuild.googleapis.com` not enabled.** |
| Cloud Run services | Admin API disabled; listing refused with `SERVICE_DISABLED`. No prompt was confirmed; the API was **not** enabled. |
| Firestore `(default)` | `FIRESTORE_NATIVE`, `asia-east1`, PITR on, delete protection on |
| C5 backup schedule | `190509f6-cc1d-4255-a487-67e1e4b559e6`, daily, retention `2592000s`, createTime `2026-09-14T04:15:15Z` |
| C1 IAM alert | policy `10735229316443092488` display name `C1 IAM SetIamPolicy`, enabled; notify Pub/Sub channel `15226239816943508159` type `pubsub` topic `c1-budget-notifications` (**not** email) |
| Hosting preview | channel `internal-preproduction`; suffix URL `https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app`; version `0c39c54909388fd4`; expireTime `2026-09-21T04:14:28Z`; no `/v1/**` rewrite |
| Hosting live | channel `live` URL `https://beauessence-clinic-stg-c1a01.web.app`; `updateTime` `2026-09-13T19:22:42Z` (**unchanged** since the static preview deploy) |
| CSP on preview | `frame-src 'self' https://beauessence-clinic-staging.firebaseapp.com` (F-10 live) |

HTTP against the **suffix** preview only (canonical host not smoked):

| Path | HTTP |
| --- | --- |
| `/` | 302 → `/clinic` |
| `/clinic` `/staff` `/booking` | 200 `text/html` |
| `/v1/health` `/v1/bookings` `/v1/slots` `/v1/calendar-session/client-config` | **404** `text/html` (static miss, not fail-closed API 503) |

WP-B1 A accepts this gap as the thing to fix later: gate-off `/v1` must become
**503**, not 404. That still needs a **new exact-SHA mutation packet** after
engineering merges. Signed WP-B1 A is **not** that packet.

### A.3 API routing, unrouted inventory, Calendar

Repository (`2a336e9` tree):

| Surface | Current |
| --- | --- |
| `AppModule` | `CalendarPilotModule` + `InternalTestBookingModule.register()` + `HealthController` |
| IP-001 booking / schedule | Routed only through `InternalTestBookingModule` (fail-closed 503 unless isolated gate open) |
| `AppointmentController` / `ScheduleController` | Not imported by `AppModule` directly |
| BookPilot module/controller/gate/tokens | Listed `unrouted` |
| `CalendarWatchController` | Listed `unrouted`; production inbound `GO_LIVE_DEFERRED` (WP-B10) |
| Rate limiter, maintenance gate, delegated-authorization stack, denied-event sink | Listed `unrouted` |
| Calendar outbound | CAL-PILOT synthetic-only on `CalendarPilotModule`; production D-009 still not a production grant. WP-B10: DB/workbench is SoT; legal changes project via outbox/worker; Calendar **manual** edits become review candidates |
| Domain appointment statuses | `confirmed` / `cancellation_requested` / `cancelled` / `completed` / `no_show`. **No `arrived`.** WP-B10 requires `confirmed → arrived → completed` |

C6 smoke still regexes `app.module.ts` for `AppointmentController` (F-02).
`check:architecture` already walks from `main.ts` and is **not** that defect.

### A.4 WP-B6 historical artifacts (F-06)

This VM recovered **all 12** hashes from the signed sheet under
`/opt/cursor/artifacts` (and the matching `ci-verification.json` also under
`/tmp/ve-a9a445a`). They are **not** in git. They were **not** copied into this
PR (redacted archive is WP-C5, not Stage A+B).

| File | SHA-256 | Result |
| --- | --- | --- |
| `internal-preproduction-complete-a9a445a.json` | `b80d92b7…3f5454` | `HASH_MATCH` |
| `internal-preproduction-complete-a9a445a.result.json` | `bb34e7c1…2c710e6` | `HASH_MATCH` |
| `ci-verification.json` | `9efe81ca…e9a7b9285` | `HASH_MATCH` |
| `hosting-inspect.json` | `5022f992…82bda8752` | `HASH_MATCH` |
| `backup-inspect.json` | `2f076905…823708171` | `HASH_MATCH` |
| `monitoring-inspect.json` | `4fb41f95…027867c5` | `HASH_MATCH` |
| `migration-inspect.json` | `b392e7b5…13e438295f` | `HASH_MATCH` |
| `smoke-probes.json` | `00a138d6…a7baf281a` | `HASH_MATCH` |
| `c5-backup-schedule-apply-a9a445a.txt` | `0cee46ea…6130334589e` | `HASH_MATCH` |
| `c1-iam-alert-apply-a9a445a.txt` | `9b0eeb2c…81ab821b94` | `HASH_MATCH` |
| `firebase-preview-deploy-a9a445a.log` | `bc1afd4d…55584306442` | `HASH_MATCH` |
| `hosting-channels-a9a445a.json` | `8fbda6db…29d83a793` | `HASH_MATCH` |

`HISTORICAL_ARTIFACTS_LOST` is **not** declared.

---

## Stage B — Product / Authority Reconciliation

### B.1 Signed WP-B1～B11 (internal-preproduction only)

Source of truth for answers: the signed Drive document. Recorded into the
[decision register](../product/phase-1-decision-register.md) as
`WP-B1-2026-09-15` … `WP-B11-2026-09-15`.

| ID | Answer (internal-preproduction) |
| --- | --- |
| WP-B1 | **A** — isolated C1 must have a real fail-closed API (`internal-test-api` suggested). Hosting preview `internal-preproduction`, 7d, not live. May enable Cloud Run + Artifact Registry (Cloud Build only if the real build path needs it). **Does not** reuse the static preview packet. **Does not** auto-authorize Cloud Run deploy |
| WP-B2 | **B** — Firestore durable limiter + process-local burst. Unauth 60/60s/IP; identified writes 30/60s/opaque actor; return-lookup/auth failures 5/15min then 15min lock; 429 + Retry-After; trust only controlled Google/Firebase proxy chain. D-006 if stricter wins |
| WP-B3 | General booking: **no account, no login, no OTP, no Firebase patient Auth**. Flow: service → date → time → required info → submit. Return lookup only after the patient clicks 回診 |
| WP-B4 | Pub/Sub + human Email (recipient **offline/secret, never in repo**). Immediate vs weekday classes. One proven synthetic alert to a real human before monitoring acceptance |
| WP-B5-1 | IN_SCOPE: `manager`, `front_desk`, `patient`. OUT this stage: `consultant`, `physician`, `system_admin`, `auditor`, `service_account` |
| WP-B5-2 | Keep `required_approving_review_count = 0`. Do not change to 1 |
| WP-B6 | Recover the 12 inspect artifacts (done on this VM); if lost declare `HISTORICAL_ARTIFACTS_LOST` and build `NEW_EVIDENCE_SET`. Do not fake originals |
| WP-B7 | Return lookup: **phone + DOB, no OTP**. Permanent ID remains `patientId`. Anti-enumeration; one normalized failure; synthetic PII only |
| WP-B8 | Active follow-up appointment → show it, no duplicate. Follow-up required but no appointment → normal slot UI → create `follow_up` with lineage |
| WP-B9 | After lookup, do not re-enter existing name/phone/DOB. Reuse `patientId`. **No localStorage as SoT** |
| WP-B10 | Status `confirmed → arrived → completed`. Arrived ≠ completed. Neither deletes Calendar events. DB is SoT; Calendar is projection via outbox/worker. Calendar **manual** edits → review candidate → `manager`/`front_desk` approve/reject. Production inbound remains `GO_LIVE_DEFERRED` |
| WP-B11 | `follow-up not_required` closes active follow-up; does **not** delete patient/appointments/audit/Calendar history |

Common exclusions (unchanged): live Hosting, `beauessence-clinic-staging`,
production terraform, official DNS, production Calendar activation, real
patient data, public production `/v1/bookings`, flipping D-001～D-005 to
`approved`, `firebase login:ci`, secrets in the repo.

### B.2 Scope clarification (this stage's real delivery)

This is **not** the clinic marketing homepage. The vendor-leased official site
remains `DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE`.
`PUBLIC_PRODUCTION_LAUNCH = DEFERRED`.

**IN_SCOPE real isolated deployment (synthetic patients only):**

- Booking Page
- Staff Workbench
- required backend API
- isolated Firestore
- Calendar integration (synthetic / CAL-PILOT rules; production inbound deferred)
- staff Auth/RBAC
- audit / outbox / monitoring

Booking Page and Workbench **must** run against the **real isolated backend**.
`localStorage` / mock is not source of truth.

**OUT_OF_SCOPE this stage:** public marketing homepage, full site replacement,
SEO/content migration, vendor takeover, official public production launch.

Future vendor integration (do **not** build a second booking stack):

```text
vendor homepage --future link/embed--> Booking Widget / standalone Booking Page
  --> Canonical Booking API --> Firestore SoT --> Workbench + Calendar
```

IP-001's earlier owner-visible line “Booking + Patient Portal” is superseded
for **surface naming**: there is no patient Firebase portal in this stage.
The in-scope patient surface is the **accountless Booking Page** plus
WP-B7～B9 return lookup. Staff surface is the Workbench.

### B.3 What signed WP-B does *not* do

- Does not flip D-001～D-005 to `approved`
- Does not grant production, DNS, live Hosting, real patients, or production Calendar
- Does not authorize Cloud Run enable/deploy until a **new exact-SHA** packet
  names commit, project, service, region, expiry, rollback
- Does not expand IN_SCOPE roles to physician/consultant/system_admin
- Does not lower any approved D-006 control

---

## F-01～F-14 closure matrix

Classification is fresh against `2a336e9` plus the 2026-09-14T18:40Z C1
readback. **None are `FIXED`.** Cloud-authority column means a later exact-SHA
packet is required for the *fix to land in C1*, not that Stage A+B is blocked.

### F-01 — C1 has no API

| Field | Value |
| --- | --- |
| Status | `CONFIRMED` |
| 現況 | Preview `/v1/*` HTTP 404; Run + Artifact Registry APIs off; static Hosting only |
| Root cause | Safety Floor 8 plus the static-only `INTERNAL_TEST_PREVIEW_DEPLOY` packet; C1 never received a backend packet |
| Signed-decision impact | WP-B1 **A** chooses a real isolated API. A-vs-B HUMAN BLOCKER is **closed**. Deploy still needs WP-C1 exact-SHA packet |
| 預計修法 | After Stage C engineering: new Hosting+Run config (do not mutate `firebase.isolated-preview.json` rollback target); fail-closed 503 when gate off; accountless create + server read-back |
| Acceptance evidence | Suffix URL `/v1/health` 503 gate-off; gate-on synthetic create + GET read-back; no staging project; live Hosting `updateTime` unchanged |
| Dependency | WP-A2/A6 if still open; Stage C limiter/audit as needed for the acceptance floor; then WP-C1 packet |
| Cloud authority | **Yes** (enable APIs + deploy). Not granted by this review |

### F-02 — C6 “formal booking UNROUTED” gate is false

| Field | Value |
| --- | --- |
| Status | `CONFIRMED` |
| 現況 | `scripts/c2-c6-smoke-evidence.mjs` `FORMAL_BOOKING_ROUTE_MARKERS` still regexes `app.module.ts`. Controllers mount via `InternalTestBookingModule`, so the gate still reports booking unrouted. `check:architecture` already walks `main.ts` |
| Root cause | String match on the wrong file, written when booking was fully unrouted |
| Signed-decision impact | None new; IP-001 already authorises the internal-test module |
| 預計修法 | WP-A1: split “no direct AppModule import” from “BookPilot + CalendarWatch stay unrouted” |
| Acceptance evidence | Unit tests in `c2-c6-smoke-evidence.test.mjs` / `sequential-c-gate.test.mjs`; intentional-failure PR for the architecture inventory |
| Dependency | None |
| Cloud authority | No |

### F-03 — No durable limiter on the write surface

| Field | Value |
| --- | --- |
| Status | `CONFIRMED` |
| 現況 | `apps/api/src/platform/runtime/rate-limiter.ts` is unrouted; process-local test helper only |
| Root cause | D-006/D-010 require limiting; parameters were waiting. Implementation never wired |
| Signed-decision impact | WP-B2 **B** + numeric ceilings. D-006 if stricter wins |
| 預計修法 | Firestore durable limiter + process-local burst; 429 + Retry-After; controlled proxy trust |
| Acceptance evidence | Tests for unauth / identified / lookup-lock classes; emulator persistence across process restart |
| Dependency | WP-B2 (done). Wiring can start in Stage C without Cloud Run |
| Cloud authority | No for code; yes later to prove it on C1 |

### F-04 — Authorization denials not durably audited

| Field | Value |
| --- | --- |
| Status | `PARTIAL` |
| 現況 | In-memory `denied-authorization-audit-sink.ts` exists and is **unrouted**. Appointment/schedule controllers do not persist denials. Not C5 durable |
| Root cause | D-006 partial evidence was kept off `AppModule` pending production blockers; IP-001 routed the write surface without the sink |
| Signed-decision impact | WP-B4 wants authorization-denial spike alerts — needs a real sink first |
| 預計修法 | Append-only durable denied-event on the internal-test path; no secrets in the event |
| Acceptance evidence | Denied write produces an audit row; replay does not rewrite |
| Dependency | D-002 still blocks *production* export semantics; internal-test sink does not flip D-002 |
| Cloud authority | No for code; C5 already has backup |

### F-05 — Internal-test gate fail-open if settings omitted

| Field | Value |
| --- | --- |
| Status | `CONFIRMED` |
| 現況 | `@Optional()` + `if (this.internalTestSettings === undefined) return;` in `appointment.controller.ts` and `schedule.controller.ts` |
| Root cause | Test harnesses omitted settings; production compose always injects them, so the hole is latent |
| Signed-decision impact | None; fail-closed is already IP-001 |
| 預計修法 | WP-A2: required injection; Nest module must fail to init without settings |
| Acceptance evidence | `rg "internalTestSettings === undefined" apps/api/src` empty; missing-token harness fails boot |
| Dependency | None |
| Cloud authority | No |

### F-06 — Inspect evidence chain not in git

| Field | Value |
| --- | --- |
| Status | `PARTIAL` |
| 現況 | All 12 signed hashes **HASH_MATCH** on this VM under `/opt/cursor/artifacts`. Not in git. Not redacted-archived |
| Root cause | Inspect outputs live in `output/evidence/` / session artifacts, which are gitignored |
| Signed-decision impact | WP-B6: recover first (done here); do not fake; archive later |
| 預計修法 | WP-C5 redacted archive or `NEW_EVIDENCE_SET` on a new SHA — **not** this PR |
| Acceptance evidence | Hash table in §A.4; later redacted tree in-repo or dated bundle |
| Dependency | None for classification; archive is a later work package |
| Cloud authority | No |

### F-07 — Appointment list stays on localStorage

| Field | Value |
| --- | --- |
| Status | `CONFIRMED` |
| 現況 | `resolveApiClient()` fail-closed to localStorage unless `?internalTestBooking=1` on a non-forbidden host. `state-schema.js` persists appointments in localStorage. Isolated Hosting has no `/v1` backend, so the live preview **cannot** use server state |
| Root cause | Synthetic MVP used browser SoT; IP-001 transport is opt-in; C1 API missing |
| Signed-decision impact | WP-B9 + scope clarification: **localStorage is not SoT**. Booking Page / Workbench must use isolated API |
| 預計修法 | Server appointment list; default transport to API on isolated hosts; localStorage only as cache/diagnostics if at all |
| Acceptance evidence | Two browsers see the same synthetic booking after create; clearing site data does not drop server rows |
| Dependency | F-01 / WP-C1 for hosted proof; code can be written against emulator first |
| Cloud authority | Yes for hosted proof |

### F-08 — Patient interactive login missing

| Field | Value |
| --- | --- |
| Status | `NO_LONGER_APPLICABLE` (original finding) |
| 現況 | Original audit wanted patient Firebase/Google login. WP-B3 forbids that as this-stage product. Accountless booking + WP-B7 lookup are **not implemented** as an E2E server path (tracked under F-07 / B7–B9, not as “add login”) |
| Root cause | Audit assumed D-006 patient IdP applied to public booking |
| Signed-decision impact | **Do not build** mandatory patient Firebase login. Build accountless create + 回診 phone+DOB |
| 預計修法 | Product replacement is WP-B3/B7/B8/B9 engineering, not an IdP |
| Acceptance evidence | New-patient path has no login/OTP; 回診 is explicit and anti-enumerating |
| Dependency | F-01, F-03 lookup lock, F-07 |
| Cloud authority | Yes for hosted proof |

### F-09 — No application monitoring

| Field | Value |
| --- | --- |
| Status | `CONFIRMED` |
| 現況 | Only IAM SetIamPolicy → budget Pub/Sub. API logs are not an accepted human-email path. Recipients must stay offline |
| Root cause | No owner channel/severity until WP-B4 |
| Signed-decision impact | WP-B4 Pub/Sub + offline Email; synthetic human-delivery proof required |
| 預計修法 | Structured non-PII logs (WP-P3) then alert policies; Email dest never in git |
| Acceptance evidence | One synthetic failure reaches a human inbox (offline proof, not committed) |
| Dependency | Offline recipient from owner; F-01 if alerts need the API |
| Cloud authority | **Yes** for policies/channels; Email dest is a HUMAN offline input, not a Stage A+B blocker |

### F-10 — Isolated CSP still names staging auth origin

| Field | Value |
| --- | --- |
| Status | `CONFIRMED` |
| 現況 | `firebase.isolated-preview.json`, `firebase.json`, and the **live preview CSP header** all include `https://beauessence-clinic-staging.firebaseapp.com` in `frame-src` |
| Root cause | Header-parity with the CAL-PILOT staging preview |
| Signed-decision impact | Isolated C1 must not point at the forbidden project (WP-B1 exclusions) |
| 預計修法 | Per-environment auth origin (WP-C6); keep staging file for staging only |
| Acceptance evidence | C1 preview CSP has no `beauessence-clinic-staging` |
| Dependency | Hosting redeploy (cloud) after the config change |
| Cloud authority | Yes for the header to change on C1; config patch is code |

### F-11 — Stale plans still assert retired authority

| Field | Value |
| --- | --- |
| Status | `PARTIAL` |
| 現況 | This Stage B adds superseded/current markers to the live register, vendor eval, inspect PASS, waiting WP-B sheets, and INDEX. Historical reviews stay. Remaining stale corpus (Luna “Grok rests” body text, old C6 vendor URL as if current, “formal booking UNROUTED” in older dated evidence) is **dated** and must not be rewritten |
| Root cause | Dated evidence was later treated as live Canon |
| Signed-decision impact | Signed WP-B + scope clarification are now live |
| 預計修法 | Markers, not deletion. Further copy-edits only when a live doc still commands work |
| Acceptance evidence | `check:docs` pass; register no longer `WAITING_FOR_ANSWER` on WP-B1～B6 |
| Dependency | None |
| Cloud authority | No |

### F-12 — Policy hard-codes `accountActive: true`

| Field | Value |
| --- | --- |
| Status | `CONFIRMED` |
| 現況 | `createRbacAppointmentAuthorizationPolicy` / `createScheduleAuthorizationPolicy` pass `accountActive: true` in every branch |
| Root cause | Reusable policy assumed a live IdP account flag that the internal-test adapter never supplies |
| Signed-decision impact | Staff Auth remains in-scope; patient has no Firebase account this stage — staff path must still honour disablement when C2/C3 exist |
| 預計修法 | WP-A3: authenticator supplies `accountActive`; tests for disabled staff |
| Acceptance evidence | Disabled staff context denied on the next protected call |
| Dependency | Staff session context; do not invent patient Firebase accounts |
| Cloud authority | No |

### F-13 — Schedule grid gated on `create_appointment`

| Field | Value |
| --- | --- |
| Status | `PARTIAL` |
| 現況 | `assertCanReadGrid` uses permission `create_appointment`. `patient` holds that permission, so accountless/patient listing would be coupled to create |
| Root cause | No separate read-grid permission in the D-006 matrix |
| Signed-decision impact | WP-B5-1: do **not** expand physician/consultant. Do **not** invent a permission if it reopens D-006. Document the coupling; a new read capability needs a later owner packet |
| 預計修法 | Prefer documenting current mapping for IN_SCOPE roles. Independent `read_schedule` only after a D-006 amendment, not a silent literal |
| Acceptance evidence | Either an owner-amended permission in `packages/domain` + register, or a dated decision that create-permission remains the grid gate for this stage |
| Dependency | D-006; WP-B5-1 |
| Cloud authority | No |

### F-14 — Role coverage / required reviews

| Field | Value |
| --- | --- |
| Status | `PARTIAL` |
| 現況 | Domain roles still list eight strings. Preview workbench authenticates synthetic manager/front_desk. `required_approving_review_count=0` is **accepted** by WP-B5-2, not a defect |
| Root cause | Audit treated missing physician login and reviews=0 as gaps |
| Signed-decision impact | IN_SCOPE manager / front_desk / patient (accountless). Reviews stay 0. Other roles OUT_OF_SCOPE_THIS_STAGE |
| 預計修法 | Implement IN_SCOPE only. Do not add consultant/physician workbench this stage |
| Acceptance evidence | Signed register rows; later E2E for manager, front_desk, accountless patient |
| Dependency | F-01, F-07, staff Auth |
| Cloud authority | No for the policy; yes for hosted role proof |

---

## Sibling search (failure classes)

| Class | Where else | Disposition |
| --- | --- | --- |
| Static Hosting 404 vs API 503 | `/v1/health` and every booking path on C1 | Same F-01; smoke currently treats 404 as pass |
| localStorage SoT | `state-schema.js`, `api-client.js` default, vendor eval §3 | F-07 + vendor recon |
| Forbidden staging origin | `firebase.json`, `firebase.isolated-preview.json`, live CSP | F-10 |
| Unrouted security adapters | limiter, denied-event, delegated-authorization, maintenance-gate | F-03, F-04; keep BookPilot/CalendarWatch unrouted |
| Fail-open optional injection | both booking controllers | F-05 only (no third controller) |
| Stale “Patient Portal / must login” | IP-001 scope line; F-08; vendor identity-document lookup | superseded by WP-B3/B7 |
| `arrived` missing | domain + contracts enums | WP-B10 engineering (Stage C+), not an F-id |

---

## Judgement

```text
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
PUBLIC_PRODUCTION_LAUNCH = DEFERRED
DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE = still true
HUMAN BLOCKER this round (Stage A+B) = NONE
Next cloud HUMAN / packet = WP-C1 exact-SHA after engineering merges (not this PR)
```

The 2026-09-14 inspect `ok: true` / README line
`INTERNAL_PREPRODUCTION_COMPLETE = PASS` is **dated evidence for static
preview + C5 backup + IAM alert on `a9a445a`**. It is **not** current
completeness under signed WP-B1 A (real API + Booking Page/Workbench against
that API).

Stage C must not start in the same turn as this record. Suggested order is in
the Stage A+B owner report, not an implementation grant.
