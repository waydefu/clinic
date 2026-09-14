# INTERNAL_PREPRODUCTION HUMAN_BLOCKER_QUEUE — 2026-09-13

Dated queue, not a production grant and not D-series approval. Canonical
stage target remains `INTERNAL_PREPRODUCTION_COMPLETE` in
[IP-001](../product/phase-1-decision-register.md). Bind SHAs with
`git log` on this path; a document cannot cite its own commit.

**Executor:** `GROK_PROJECT_CLOSER`. Laptop Luna playbook remains
`GROK_RESTS` / `LUNA_SOLE_EXECUTOR`.

**2026-09-14 addendum:** the three packet blockers (Hosting preview, C5 daily
backup apply, C1 IAM alert apply) landed on `origin/main`
`a9a445a4e9bae83f779a9914bc7203961813f916`. Completeness inspect `ok: true`.
See [2026-09-14 INTERNAL_PREPRODUCTION_COMPLETE](2026-09-14-internal-preproduction-complete.md).
Interactive Auth/TOTP, TW-05, and named-reviewer person-names remain HUMAN
and still do not block this stage. Do not re-apply those stacks with
`exact_apply_authority_sha=not_granted`.

These items are `HUMAN_ACTION_REQUIRED`. They do **not** make
`PROJECT_COMPLETE = HUMAN_BLOCKED` merely because production launch is
`GO_LIVE_DEFERRED`. Independent engineering continues on fail-closed
internal-test booking.

## Not in this queue

| Class | Items |
| --- | --- |
| `GO_LIVE_DEFERRED_ITEM` | official DNS / custom domain; clinic main-website takeover; production Calendar D-009/D-016; real patient data; live Hosting; terraform apply to production |
| `EXTERNAL_AUTHORITY_REQUIRED` (keep unrouted) | durable Firestore lockout / denied-event store (B-012, D-002); `CalendarWatchController`; BookPilot production compose |
| Already Grok-solvable / landed | fail-closed `/v1/bookings` create/query/cancel/reschedule/complete/no-show; fail-closed `/v1/slots` + `/v1/schedule/publish`; Nest HTTP occupancy, query, complete, cancel, reschedule, no-show, same-slot contention, idempotent replay, and post-cutoff staff cancel on a published grid; privacy-v1 create audit; staff on-behalf; patient cutoff; D-006 session evaluator on CAL-PILOT `__session`; fail-closed pre-deploy smoke evaluator (`pnpm smoke:internal-test-booking`) that refuses staging and the isolated live channel and treats unauthenticated 2xx create/list as FAIL (503/401/static 404 pass); isolated static Hosting config `firebase.isolated-preview.json` (no Cloud Run rewrite — isolated C1 has no Run API); execute:false preview plan (`pnpm plan:internal-test-preview`) including preview-channel rollback; fail-closed synthetic migration inspect (`pnpm inspect:internal-test-migration`) that refuses staging and does not retarget `scripts/migrate-cal-pilot-legacy-candidates.mjs`; fail-closed Hosting channel inspect (`pnpm inspect:internal-test-hosting`) that refuses staging, treats live-only C1 as FAIL, and does not deploy or delete; SHA-gated C5 daily backup schedule source plus fail-closed inspect (`pnpm inspect:internal-test-backup`); SHA-gated C1 IAM SetIamPolicy alert source on existing Pub/Sub plus fail-closed inspect (`pnpm inspect:internal-test-monitoring`); fail-closed INTERNAL_PREPRODUCTION completeness inspect (`pnpm inspect:internal-preproduction`) that requires exact-head CI, preview Hosting, smoke, backup, monitoring, and migration evidence and never sets `PROJECT_COMPLETE = HUMAN_BLOCKED`; packed-artifact Playwright for `?internalTestBooking=1` fail-closed occupancy (empty grid / occupied overlay; default path stays synthetic); `check:pages` refuses isolated Hosting drift from `firebase.json`; exact-head CI on the composing branch |

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
DECISION OR RESOURCE: Fresh exact-SHA packet to apply the SHA-gated C5 daily backup schedule on beauessence-clinic-stg-c1a01
ONE QUESTION: Is there a written C5 apply packet for the then-current HEAD SHA naming operator and approver, targeting only isolated C1 (not production, not beauessence-clinic-staging)?
WHY I CANNOT PROCEED: command guard and AGENTS.md deny terraform apply without a reviewed packet whose SHA equals HEAD; live C1 PITR is on and daily backup schedules are currently []; source exists SHA-gated in infra/terraform/c5-firestore; sequential C5 smoke was deliberately not tightened to require the schedule
WHAT I WILL NOT DO UNTIL ANSWERED: terraform apply, terraform destroy, retarget staging, or invent operator/approver names
SAFE OPTIONS (if any): keep restore plan execute:false clone-to-new-db; inspect with pnpm inspect:internal-test-backup; do not in-place restore (default)
```

```text
HUMAN BLOCKER
PHASE: INTERNAL_PREPRODUCTION
DECISION OR RESOURCE: Fresh exact-SHA packet to apply the SHA-gated C1 IAM SetIamPolicy alert on existing Pub/Sub for beauessence-clinic-stg-c1a01
ONE QUESTION: Is there a written C1 apply packet for the then-current HEAD SHA naming operator and approver, targeting only isolated C1 (not production, not beauessence-clinic-staging, no email recipients)?
WHY I CANNOT PROCEED: command guard and AGENTS.md deny terraform apply without a reviewed packet whose SHA equals HEAD; live C1 has the logging metric and 0 alert policies; source exists SHA-gated in infra/terraform/c1-foundation; sequential C1 smoke was deliberately not tightened to require alert policies; C0-ENG-REC forbids inventing email recipients
WHAT I WILL NOT DO UNTIL ANSWERED: terraform apply, add email notification channels, retarget staging, or invent operator/approver names
SAFE OPTIONS (if any): notify only the existing budget Pub/Sub channel; inspect with pnpm inspect:internal-test-monitoring
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
3. Owner records fresh exact-SHA C5 backup-schedule and C1 IAM-alert
   apply packets; print `pnpm plan:internal-test-apply -- c5 $(git
   rev-parse HEAD)` and `pnpm plan:internal-test-apply -- c1-iam $(git
   rev-parse HEAD)` (`execute: false`); Grok or Luna applies **only**
   those SHAs on isolated C1 (Pub/Sub notify only; no email recipients)
   and re-inspects. Do not destroy the stack and do not re-apply with
   `exact_apply_authority_sha=not_granted`.
4. Interactive login / TW-05 / named reviewers stay human and are
   **not** `INTERNAL_PREPRODUCTION` stage blockers.
5. Production launch stays `GO_LIVE_DEFERRED`.
