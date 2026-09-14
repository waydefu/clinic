# INTERNAL_PREPRODUCTION HUMAN_BLOCKER_QUEUE — 2026-09-13

Dated queue, not a production grant and not D-series approval. Canonical
stage target remains `INTERNAL_PREPRODUCTION_COMPLETE` in
[IP-001](../product/phase-1-decision-register.md). Bind SHAs with
`git log` on this path; a document cannot cite its own commit.

**Executor:** `GROK_PROJECT_CLOSER`. Laptop Luna playbook remains
`GROK_RESTS` / `LUNA_SOLE_EXECUTOR`.

These items are `HUMAN_ACTION_REQUIRED`. They do **not** make
`PROJECT_COMPLETE = HUMAN_BLOCKED` merely because production launch is
`GO_LIVE_DEFERRED`. Independent engineering continues on fail-closed
internal-test booking.

## Not in this queue

| Class | Items |
| --- | --- |
| `GO_LIVE_DEFERRED_ITEM` | official DNS / custom domain; clinic main-website takeover; production Calendar D-009/D-016; real patient data; live Hosting; terraform apply to production |
| `EXTERNAL_AUTHORITY_REQUIRED` (keep unrouted) | durable Firestore lockout / denied-event store (B-012, D-002); `CalendarWatchController`; BookPilot production compose |
| Already Grok-solvable / landed | fail-closed `/v1/bookings` create/query/cancel/reschedule/complete/no-show; fail-closed `/v1/slots` + `/v1/schedule/publish`; Nest HTTP occupancy, query, complete, cancel, reschedule, no-show, same-slot contention, idempotent replay, and post-cutoff staff cancel on a published grid; privacy-v1 create audit; staff on-behalf; patient cutoff; D-006 session evaluator on CAL-PILOT `__session`; fail-closed pre-deploy smoke evaluator (`pnpm smoke:internal-test-booking`) that refuses staging and the isolated live channel and treats unauthenticated 2xx create/list as FAIL (503/401/static 404 pass); isolated static Hosting config `firebase.isolated-preview.json` (no Cloud Run rewrite — isolated C1 has no Run API); execute:false preview plan (`pnpm plan:internal-test-preview`) including preview-channel rollback; fail-closed synthetic migration inspect (`pnpm inspect:internal-test-migration`) that refuses staging and does not retarget `scripts/migrate-cal-pilot-legacy-candidates.mjs`; packed-artifact Playwright for `?internalTestBooking=1` fail-closed occupancy (empty grid / occupied overlay; default path stays synthetic); `check:pages` refuses isolated Hosting drift from `firebase.json`; exact-head CI on the composing branch |

## Queue

```text
HUMAN BLOCKER
PHASE: INTERNAL_PREPRODUCTION
DECISION OR RESOURCE: Fresh named Hosting preview packet for the exact HEAD of cursor/internal-preproduction-f9d6, project beauessence-clinic-stg-c1a01, preview channel (not live), expiry, operator, approver
ONE QUESTION: Is there a written preview-deploy packet for that exact SHA on beauessence-clinic-stg-c1a01 naming channel, expiry, operator, and approver?
WHY I CANNOT PROCEED: Safety Floor 8 forbids Hosting deploy without a fresh per-commit packet; IP-001 is internal-test route authority, not deploy authority; earlier synthetic-review packets for beauessence-clinic-staging are not reusable; isolated C1 Hosting currently has only the live channel; Cloud Run Admin API is disabled there (C1 allowlist excludes Cloud Run), so CAL-PILOT firebase.json `/v1/**` → cal-pilot-api cannot be served on this project
WHAT I WILL NOT DO UNTIL ANSWERED: firebase hosting:channel:deploy, any live-channel update, targeting beauessence-clinic-staging, enabling Cloud Run, or firebase login:ci
SAFE OPTIONS (if any): keep production booking HTTP 503; use firebase.isolated-preview.json (static only) once a packet names a preview channel; do not invent D-series approval
```

```text
HUMAN BLOCKER
PHASE: INTERNAL_PREPRODUCTION
DECISION OR RESOURCE: Interactive patient Firebase Auth / staff Google+TOTP login and 2FA on the isolated-test surfaces
ONE QUESTION: Will a named operator complete interactive login (and TOTP where required) against the isolated-test preview once a packet exists?
WHY I CANNOT PROCEED: sessionStorage.internalTestIdToken is a test inject, not an Auth UI; passwords, security keys and TOTP codes must not be pasted into chat
WHAT I WILL NOT DO UNTIL ANSWERED: forge an Auth UI that collects real credentials, store tokens in the repository, or treat a preview URL as authentication
SAFE OPTIONS (if any): keep Bearer/cookie authenticators; keep opt-in `?internalTestBooking=1` fail-closed
```

```text
HUMAN BLOCKER
PHASE: INTERNAL_PREPRODUCTION
DECISION OR RESOURCE: TW-05 manual assistive-technology packet on packed apps/web/dist
ONE QUESTION: Has a named tester filled pass/fail for the TW-05 rows on this branch's dist SHA?
WHY I CANNOT PROCEED: screen readers and real forced-colors cannot be faked from CI axe
WHAT I WILL NOT DO UNTIL ANSWERED: mark TW-05 PASS from automation
SAFE OPTIONS (if any): keep CI axe serious/critical; continue remaining engineering
```

```text
HUMAN BLOCKER
PHASE: INTERNAL_PREPRODUCTION
DECISION OR RESOURCE: Named-reviewer person-names in the C0 packet (`NAMED_REVIEWER_METADATA_PENDING`)
ONE QUESTION: Which reviewer person-names should be recorded in the C0 acceptance packet?
WHY I CANNOT PROCEED: person-names must not be invented
WHAT I WILL NOT DO UNTIL ANSWERED: fill named-reviewer fields
SAFE OPTIONS (if any): leave metadata pending; do not treat it as an INTERNAL_TEST_BLOCKER
```

```text
HUMAN BLOCKER
PHASE: GO_LIVE (not INTERNAL_PREPRODUCTION)
DECISION OR RESOURCE: D-001–D-005 named production/legal approval with owner, date, scope and exclusions
ONE QUESTION: Which pending D-001–D-005 IDs are production-approved with owner, date, scope, and exclusions?
WHY I CANNOT PROCEED: IP-001 forbids flipping those rows to approved; public production `/v1/bookings` stays unauthorised
WHAT I WILL NOT DO UNTIL ANSWERED: mark D-001–D-005 approved; enable PUBLIC_PRODUCTION_ROUTE
SAFE OPTIONS (if any): keep INTERNAL_TEST_ROUTE_AUTHORIZED fail-closed; keep production default OFF
```

## Resume

1. Owner records the preview packet for the then-current exact SHA.
2. Grok or Luna deploys **only** that SHA to a preview channel on
   `beauessence-clinic-stg-c1a01` and smokes it.
3. Interactive login / TW-05 / named reviewers stay human.
4. Production launch stays `GO_LIVE_DEFERRED`.
