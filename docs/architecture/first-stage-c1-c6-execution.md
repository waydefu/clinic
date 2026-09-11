# First-stage C1～C6 execution packet (source only)

**Type:** current execution packet. Not apply authority.
**Depends on:** [first-stage C0 authority](first-stage-c0-authority.md)
(`OWNER_DIRECTION_APPROVED` / `ENGINEERING_RECOMMENDATION_COMPLETE` /
`HUMAN_REVIEW_SIGNATURE_PENDING`).
**Machine gate:** [stage-2-gate-status.json](stage-2-gate-status.json)
C1～C6 `pending` / `not_granted`.

Owner 2026-09-11 packets name C1～C6 as the necessary *route*. That is
not exact mutation authority. This file records what source work is in
the tree, what remains blocked, and the stop condition for each slice.

Do not mark any slice `completed` here. Do not route
`AppointmentController`. Do not apply Terraform.

## Sequence (authority DAG, not technical DAG)

`C0 engineering approved → C1 apply authority → C2 → C3 → C4 → C5 → C6`

Source implementation may proceed where Canon already allows
synthetic/local work. Claiming a gate PASS still requires that slice's
`deploymentAuthorities=granted` plus evidence.

## C1 isolated test foundation

| Field | Value |
| --- | --- |
| Prerequisites | Engineering C0 signatures (`HUMAN_REVIEW_SIGNATURE_PENDING`); C1 request packet; exact apply SHA |
| Scope | **New isolated** synthetic staging project; transferable settings; monitoring; budget alerts with 50/80/100 **actions**; empty secret containers; WIF; no real data |
| Strategy | `new_isolated_project` — see [c0-engineering-recommendations](c0-engineering-recommendations.md). Existing `beauessence-clinic-staging` is CAL-PILOT + preview only, **not** C1 |
| Source in tree | Plan-only `infra/terraform/c1-foundation/` (apply blocked without exact SHA). CAL-PILOT Terraform under `infra/terraform/cal-pilot/` is **not** C1 |
| Tests | C0-ENG-REC invariants; C1 must not target existing staging or suggested hostnames |
| Security | No real patient data; no production project link; C1 API allowlist excludes Firestore / Identity Platform / Cloud Run |
| Exclusions | Firestore database; Identity Platform; API runtime; production; Calendar apply; DR secondary |
| Rollback | Quarantine new APIs/IAM; do not default to project deletion |
| Remaining blockers | `HUMAN_REVIEW_SIGNATURE_PENDING`; **exact C1 apply authority** |
| Authority | `not_granted` |
| Status | `READY_FOR_EXPLICIT_AUTHORITY` |

## C2 staff login

| Field | Value |
| --- | --- |
| Prerequisites | C1 evidence; C2 authority |
| Scope | Independent staff accounts; Google + clinic-managed; MFA; disable-on-next-request; owner UI at least manager / front_desk |
| Source in tree | CAL-PILOT Google+TOTP session (`calendar-pilot-session.ts`) is synthetic-only, not C2 complete |
| Tests | `apps/api/src/auth/calendar-pilot-session.test.ts` (pilot, not C2) |
| Exclusions | Patient login; real staff PII |
| Remaining blockers | C1; exact C2 apply / Identity Platform authority |
| Authority | `not_granted` |
| Status | `READY_FOR_EXPLICIT_AUTHORITY` for IdP; source `IMPLEMENTED` only for CAL-PILOT |

## C3 session security

| Field | Value |
| --- | --- |
| Prerequisites | C2 evidence; C3 authority |
| Scope | Idle 30m; absolute 8h; server-side session; `__session` + CSRF; no shared emergency account |
| Source in tree | `IDLE_SESSION_MS` / `ABSOLUTE_SESSION_MS` on CAL-PILOT |
| Hosting constraint | Firebase Hosting forwards only `__session` |
| Remaining blockers | C2; exact C3 authority for the formal staff surface |
| Authority | `not_granted` |
| Status | `READY_FOR_EXPLICIT_AUTHORITY` |

## C4 RBAC

| Field | Value |
| --- | --- |
| Prerequisites | C3 evidence; C4 authority |
| Scope | Backend deny-default; manager vs front_desk; Calendar conflict actions by role |
| Source in tree | `packages/domain/src/roles.ts`; unrouted RBAC appointment policy |
| Tests | Unrouted AppointmentController / BookPilot harnesses |
| Exclusions | Payroll / clinical / money permissions |
| Remaining blockers | C3; exact C4 authority; front_desk vs manager conflict-queue question still open |
| Authority | `not_granted` |
| Status | `READY_FOR_EXPLICIT_AUTHORITY` |

## C5 audit

| Field | Value |
| --- | --- |
| Prerequisites | C4 evidence; C5 authority; D-002 still pending for real-data retention |
| Scope | Append-only audit for booking, hours, login/disable, authz denies, Calendar success/fail/conflict/review |
| Source in tree | Domain audit v2 + Emulator transaction tests |
| Remaining blockers | C4; exact C5 authority; D-002 for production linkability |
| Authority | `not_granted` |
| Status | `READY_FOR_EXPLICIT_AUTHORITY` |

## C6 synthetic integration

| Field | Value |
| --- | --- |
| Prerequisites | C1～C5 evidence; C6 authority; synthetic data only |
| Scope | Staff login, RBAC, booking/schedule, audit, Calendar bidirectional (watch + compensation + conflict queue), website *redirect rehearsal* (no official DNS) |
| Source in tree | Unrouted formal booking; CAL-PILOT five-minute poll; unwired `watch-channel.ts` + unused `GoogleCalendarWatchClient` + unwired `calendar_watch_channels` emulator store; unrouted `CalendarWatchController` (`POST /v1/calendar-watch` 404 on AppModule) |
| Exclusions | Real data; production; live Hosting; production Calendar; mounting `/v1/bookings` |
| Remaining blockers | C1～C5 apply; exact C6 authority; DATA-R03 codecs for collections C6 will actually read |
| Authority | `not_granted` |
| Status | `READY_FOR_EXPLICIT_AUTHORITY` |

## DATA-R03 / SCM-R04 (this packet)

| ID | Class | Action now |
| --- | --- | --- |
| DATA-R03 remaining codecs / worker casts / alerting | C6 blocker *if* C6 uses those collections | new unwired `calendar_watch_channels` has schemaVersion 1 fail-closed parser; remaining CAL-PILOT `documentData<T>` / worker `as T` still OPEN |
| SCM-R04 `stream-json@1` / `csv-parse@5` | delayable debt; not C6 synthetic blocker | no force-upgrade |

## Hard stop

Any new Terraform apply, Firebase/Cloud Run/IAM/DNS/secret mutation, live
channel, production Calendar, or real Calendar/patient data requires a
**fresh exact-change authority**. Until then every C1～C6 apply stays
`READY_FOR_EXPLICIT_AUTHORITY`.
