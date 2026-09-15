# Stage F isolated-apply source remediation

Dated evidence for `cursor/stage-f-source-remediation-f9d6`. Not a
deployment. Not `INTERNAL_PREPRODUCTION_COMPLETE = PASS`. Does not tick
owner APPROVE. Does not reuse
`AUTHORITY_SHA = 7a37545070db166c0b76723db09cf32f7f68de71` for remaining
cloud mutations.

```text
CLOUD_MUTATION = NONE
STAGE_F_APPLY = NOT_STARTED
OLD_AUTHORITY_SHA = 7a37545070db166c0b76723db09cf32f7f68de71
REMAINING_MUTATIONS_UNDER_NEW_SOURCE = NOT_AUTHORIZED
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
PUBLIC_PRODUCTION_LAUNCH = DEFERRED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
USER_MANAGED_SERVICE_ACCOUNT_KEY_REQUIRED = NO
GENERAL_BOOKING_LOGIN_REQUIRED = NO
HUMAN_NOTIFICATION_PROVEN = false
```

This document cannot cite its own commit hash. Lookup:
`git log -- docs/reviews/2026-09-15-stage-f-source-remediation.md`.

## Baseline

- Fresh `origin/main` at branch-off:
  `7a37545070db166c0b76723db09cf32f7f68de71` (merge of PR #132 / Stage F
  E1–E7 source).
- Isolated project `beauessence-clinic-stg-c1a01` / `asia-east1` already
  has a partial apply of that SHA: digest-pinned API and worker,
  Firestore composite indexes, WP-B4 alerts, Hosting `/v1/**` rewrite,
  booking gate temporarily on, scheduler paused, worker processing
  disabled.
- Deployed observations used as diagnosis only (not re-applied here):
  `/v1/health`, `/live`, `/ready` = 200; `GET /v1/slots` = 200 + `[]`;
  accountless `POST /v1/bookings` = 409 CONFLICT (no published slot),
  not 401 / 503 / HTML 404.
- Runtime-fix follow-up (`cursor/stage-f-apply-runtime-fixes-f9d6`) was
  audited and cherry-picked: Cloud Run v2 must not set reserved `PORT`;
  Hosting `pinTag` traffic is ignored; WP-B4 outbox age uses
  `DISTRIBUTION` + `ALIGN_PERCENTILE_99` and stays 60 seconds /
  threshold 59.

Any merge of this engineering PR moves `origin/main` off `7a37545…`.
Leftover cloud mutations under that packet become
`NOT_AUTHORIZED`. Next apply needs a fresh main SHA, a new packet, and
owner APPROVE.

## Closure set

| ID | Terminal state | Notes |
| --- | --- | --- |
| P0-1 Calendar ADC | `FIXED` (source) | Cloud Run worker uses attached SA → metadata ADC → short-lived OAuth2 token → Calendar API. No private-key JSON, no `GOOGLE_APPLICATION_CREDENTIALS`. `/ready` fails closed when Calendar token/config is missing. Tokens are never logged. Outbox retry / idempotency / dead-letter unchanged. `events.watch` stays off. `DOMAIN_WIDE_DELEGATION_REQUIRED = NO` for a dedicated synthetic calendar ACL-shared to `internal-test-outbox@…`. Leftover empty secret `c1-calendar-service-account-json` is not mounted. |
| P0-2 Accountless booking | `FIXED` (source) | `/booking` does not load CAL-PILOT. Isolated C1 preview uses Canonical Booking API with `credentials: 'omit'` and no Bearer/CSRF. `GENERAL_BOOKING_LOGIN_REQUIRED = NO`. |
| P0-3 Published slots | `PLANNED` (source) | Root cause: `published.schedule === null` → `{ slots: [] }`. `pnpm inspect:stage-f-schedule` prints the staff `POST /v1/schedule/publish` body (`CALENDAR_PILOT_SCHEDULE` + blocked times). `execute: false`. |
| P0/P1 Staff Workbench | `FIXED` (source) | Architecture was already Google+TOTP → `__session` + CSRF + RBAC + disabled-account. Default `/staff` no longer keeps the CAL-PILOT overlay after a server session exists. Opt-in `?calendarPilot=1` keeps the synthetic Calendar review UI. Public return-session is not staff auth. |
| P1 Human alert proof | `PLANNED` (source) | WP-B4 policies remain deployed in cloud from the previous apply; this round does not send mail. `pnpm inspect:stage-f-alert-proof` prepares a synthetic `oldestPendingAgeSeconds = 60` log. `HUMAN_NOTIFICATION_PROVEN` stays false. |
| Runtime Terraform | `FIXED` (source) | PORT / Hosting `ignore_changes = [traffic]` / outbox `DISTRIBUTION` audited against the runtime-fix branch and covered by inspect tests. |

Cloud apply, Firebase deploy, API enablement, IAM / org-policy
mutation, Secret Manager mutation, Calendar production activation, and
weakening `constraints/iam.disableServiceAccountKeyCreation` stay
`OUT-OF-SCOPE`.

## Follow-up after merge

1. Exact-head CI must pass on this engineering PR.
2. Merge. Fresh-resolve `origin/main`.
3. New Stage F continuation authority packet bound to that SHA.
4. Owner APPROVE.
5. Continuation apply may then: mount ADC calendar id, ACL-share the
   synthetic calendar, publish the synthetic schedule, enable worker
   processing if authorised, and run the human-inbox proof.

Do not invent `AUTHORITY_SHA` on this feature branch.
