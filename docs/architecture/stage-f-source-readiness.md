# Stage F source readiness (E1–E7)

Status: **IMPLEMENTED_NOT_DEPLOYED**. This is architecture for isolated C1
source, not apply authority.

```text
CLOUD_MUTATION = NONE
STAGE_F_APPLY = NOT_STARTED
AUTHORITY_PACKET = WAITING_FOR_POST_MERGE_SHA
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
PUBLIC_PRODUCTION_LAUNCH = DEFERRED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
```

PR #131 (`docs/reviews` Stage F0 packet bound to `186f1f9`) remains
historical evidence. `APPLY_ON_THIS_SHA = BLOCKED_BY_SOURCE_GAPS` on that
packet is still correct for that SHA. Do not tick owner APPROVE there.

## Authority workflow (does not self-invalidate)

Exact-SHA apply cannot live in the same git commit that closes E1–E7:

1. Merge the E1–E7 engineering PR to `main`.
2. Fresh-resolve `origin/main` as `AUTHORITY_SHA` (40 hex).
3. Generate the packet **as an artifact bound to that SHA**
   (`pnpm inspect:stage-f-graph`). Prefer a GitHub artifact / unsigned
   review attached to the merge commit.
4. Owner ticks APPROVE on that packet.
5. Apply uses `origin/main == AUTHORITY_SHA == BUILD_SOURCE_SHA == IMAGE_SOURCE_SHA`.

Do **not** merge a filled READY packet onto `main` if that commit would
move `origin/main` off `AUTHORITY_SHA`. The packet commit is never the
apply SHA. Template:
[stage-f-exact-sha-authority-packet.md](../templates/stage-f-exact-sha-authority-packet.md).

If any of the four SHAs drift: `AUTHORITY_INVALIDATED` and STOP.

## Isolated identity (Canon, not guessed)

| Field | Value |
| --- | --- |
| Project | `beauessence-clinic-stg-c1a01` |
| Region | `asia-east1` (C1/C5 Firestore `locationId`) |
| API Cloud Run | `internal-test-api` |
| Worker Cloud Run | `internal-test-outbox` |
| Artifact Registry | `asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test/{api,worker}` |
| Hosting API config | `firebase.isolated-api-preview.json` |
| Hosting static rollback | `firebase.isolated-preview.json` |
| Preview channel | `internal-preproduction` |
| Firestore | `(default)` Native |
| Forbidden project | `beauessence-clinic-staging` |

Artifact Registry / Cloud Run APIs are currently disabled in cloud.
Enablement is listed in the future apply packet. This round does not
enable them.

## E1 Hosting

Booking Page / Staff Workbench → Firebase Hosting preview → `/v1/**` →
`internal-test-api`. Static routes stay on Hosting. Missing Cloud Run is
`API_TARGET_MISSING`. After the intended rewrite, HTTP 404 is
`API_NOT_MOUNTED = FAIL`. HTTP 503 is gate closed.

Live `firebase.json` keeps the staging `cal-pilot-api` rewrite. Isolated
CSP stays off `beauessence-clinic-staging.firebaseapp.com`. Widget
`CURRENT_WIDGET_EMBED = DISABLED`.

## E2 / E3 Cloud Run and images

`infra/terraform/c1-internal-test-run/` is SHA-gated
(`exact_apply_authority_sha = not_granted` → zero resources). Images
must be digest-pinned `internal-test/{api,worker}@sha256:…`. Mutable
`latest` is refused. `containers/internal-test.cloudbuild.yaml` tags the
40-character source SHA only.

Production-shaped defaults stay fail-closed: booking writes off, worker
processing off, scheduler paused. `allUsers` `run.invoker` on the API is
Hosting rewrite transport. Public booking stays accountless at the API
layer. Staff still needs session + CSRF + RBAC.

## E4 Outbox worker

Cloud execution: Firestore outbox → `internal-test-outbox` → synthetic
Calendar (`GOOGLE_CALENDAR_INTEGRATION_MODE=test`,
`GOOGLE_CALENDAR_AUTH=CLOUD_ADC`). The worker identity requests a
short-lived `calendar.events` token from the metadata server. No
user-managed key JSON and no `GOOGLE_APPLICATION_CREDENTIALS`.
`USER_MANAGED_SERVICE_ACCOUNT_KEY_REQUIRED = NO`.
`DOMAIN_WIDE_DELEGATION_REQUIRED = NO` when the designated synthetic
calendar is ACL-shared to that identity. Emulator execution still
requires `FIRESTORE_EMULATOR_HOST` and will not drain cloud Firestore
into `InMemoryCalendar`. `/ready` returns 503 `calendar_unavailable`
when token/config access fails. `/live` stays up.

Required + unscheduled follow-up does not create a fake Calendar
appointment. Only a scheduled `follow_up` appointment projects an event.
Same appointment → same Calendar event on arrived/completed. Cancelled
uses the existing outbox mapping. `CalendarWatchController` stays
unrouted. Drain rollback: `INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED=false`.

## E5 WP-B4

`infra/terraform/wp-b4-alerting/` defines the nine immediate signals,
Pub/Sub `c1-application-alerts`, and an email channel whose address is
tfvar-only. Outbox age remains **60 seconds**. IAM SetIamPolicy reuses
`c1-iam-setiampolicy` and does not destroy the C1 budget Pub/Sub path.
Synthetic trigger design: emit `oldestPendingAgeSeconds>=60` or
`retryState="dead_lettered"`; do not send mail in this round.
Inspect-only: `pnpm inspect:stage-f-alert-proof`.
`HUMAN_NOTIFICATION_PROVEN` remains false.

## Booking Page and Staff Workbench

`/booking` is accountless. It must not load the CAL-PILOT Google/TOTP
overlay. Isolated C1 preview hosts call `POST /v1/bookings` without a
Bearer token or staff CSRF cookie.

`/staff` keeps strong auth: Google + TOTP mints `__session` + CSRF
only after a TOTP second-factor sign-in. First-time TOTP enrollment
signs Firebase Auth out and requires an explicit fresh Google login
plus TOTP challenge before `POST /v1/calendar-session`. The server
still requires `firebase.sign_in_second_factor === 'totp'` and does
not treat an enrolled factor as that claim. Workbench then uses the
server session with RBAC and disabled-account enforcement. Default
`/staff` hands off to Workbench after a session exists.
`?calendarPilot=1` keeps the synthetic Calendar review UI.

## Synthetic published availability

`GET /v1/slots` is empty until `schedules/current` is published.
Inspect-only bootstrap: `pnpm inspect:stage-f-schedule`
(`execute: false`). Canon grids stay initial `:00` / `:30`, follow_up
`:15` / `:45`, duration 30 minutes, with closed days, extra-open,
blocks, occupancy and a full 30-minute fit.

## E6 Configuration contract

`infra/config/c1-internal-test-config-contract.json` classifies
`NON_SECRET_CONFIG`, `SECRET_REFERENCE`, `RUNTIME_DERIVED`, and
`FORBIDDEN_TO_STORE_IN_REPO`. Missing required cloud config fails
closed. `CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN` is non-secret, required
for the API, and must be an explicit authorized isolated Hosting host
(`var.firebase_auth_domain`). There is no fallback to
`${project_id}.firebaseapp.com` and no inference from request `Host`.
Logs redact secret-like keys. Secret Manager **versions** are
future apply; this source only declares empty containers.

## E7 Firestore indexes

`firestore.indexes.json` plus `infra/firestore/query-index-matrix.json`.
Rules stay deny-all for browsers. Index rollback is forward-compatible:
do not delete an index still used by the previous revision.

## Dry-run deployment graph

`pnpm inspect:stage-f-graph` (`execute: false`):

1. build immutable API/worker images (SHA tag + digest pin)
2. Cloud Run plan for `internal-test-api`
3. Cloud Run plan for `internal-test-outbox`
4. Firestore indexes plan
5. Hosting rewrite plan
6. WP-B4 monitoring plan
7. config/secret-reference validation
8. synthetic schedule bootstrap plan (`execute: false`)
9. synthetic human-alert proof plan (`execute: false`)
10. rollback plan
11. deployed acceptance plan

## Product invariants this source must not regress

- General booking: no account, no patient login, no OTP
- Return: phone + DOB, no OTP
- Follow-up `required + unscheduled` is valid
- Grids: initial `:00` / `:30`, follow_up `:15` / `:45`, duration 30m
- Staff: strong auth + RBAC
- Firestore direct client: deny
- No real patient data
