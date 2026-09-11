# First-stage C1～C6 execution packet (source only)

**Type:** current execution packet. Not production authority.
**Depends on:** [first-stage C0 authority](first-stage-c0-authority.md)
(`OWNER_AUTHORITY_CONFIRMED` / `ENGINEERING_RECOMMENDATION_COMPLETE` /
`NAMED_REVIEWER_METADATA_PENDING`).
**Machine gate:** [stage-2-gate-status.json](stage-2-gate-status.json)
C0 `completed`; C1 `granted` / `pending`; C2～C6 `pending` / `not_granted`.

Owner 2026-09-11 continuation names C1～C6 as the sequential *route* and
grants C1 start authority after engineering C0 `completed`. That is not
C1 PASS, not apply evidence, and not C2～C6. Do not write `AUTHORIZED` as
`PASS`, `IMPLEMENTED` as `DEPLOYED`, or `CI PASS` as
`PRODUCTION AUTHORIZED`.

Do not mark C1～C6 `completed` without that slice's apply + smoke
evidence. Do not route `AppointmentController`. This session does not
run `terraform apply`.

## Sequence (authority DAG, not technical DAG)

`C0 completed → C1 granted → C1 PASS → C2 granted → … → C6 PASS`

Source implementation may proceed where Canon already allows
synthetic/local work. Claiming a gate PASS still requires that slice's
`deploymentAuthorities=granted` plus apply/smoke evidence.

## C1 isolated test foundation

| Field | Value |
| --- | --- |
| Prerequisites | Engineering C0 `completed`; C1 `granted`; exact apply SHA in local packet |
| Scope | **New isolated** synthetic staging project; transferable settings; monitoring; budget alerts with 50/80/100 **actions**; empty secret containers; WIF; no real data |
| Strategy | `new_isolated_project` — see [c0-engineering-recommendations](c0-engineering-recommendations.md). Existing `beauessence-clinic-staging` is CAL-PILOT + preview only, **not** C1 |
| Source in tree | `infra/terraform/c1-foundation/` (default SHA `not_granted` creates zero resources). CAL-PILOT Terraform under `infra/terraform/cal-pilot/` is **not** C1 |
| Tests | C0-ENG-REC invariants; C1 must not target existing staging or suggested hostnames |
| Security | No real patient data; no production project link; C1 API allowlist excludes Firestore / Identity Platform / Cloud Run |
| Exclusions | Firestore database; Identity Platform; API runtime; production; Calendar apply; DR secondary |
| Rollback | Quarantine new APIs/IAM; do not default to project deletion |
| Remaining blockers | **exact C1 apply** on a new project (local ADC); smoke evidence |
| Authority | `granted` |
| Status | `AUTHORIZED` / source `IMPLEMENTED` / `DEPLOYED=NO` / `PASS=NO` |

## C2 staff login

| Field | Value |
| --- | --- |
| Prerequisites | C1 evidence; C2 authority |
| Scope | Independent staff accounts; Google + clinic-managed; MFA; disable-on-next-request; owner UI at least manager / front_desk |
| Source in tree | CAL-PILOT Google+TOTP session (`calendar-pilot-session.ts`) is synthetic-only; SHA-gated `infra/terraform/c2-identity/` (Identity Platform API only; default no-op) |
| Tests | `apps/api/src/auth/calendar-pilot-session.test.ts` (pilot, not C2) |
| Exclusions | Patient login; real staff PII |
| Remaining blockers | C1 PASS; exact C2 apply / Identity Platform authority |
| Authority | `not_granted` |
| Status | source `IMPLEMENTED` only for CAL-PILOT; C2 apply `NOT_AUTHORIZED` |

## C3 session security

| Field | Value |
| --- | --- |
| Prerequisites | C2 evidence; C3 authority |
| Scope | Idle 30m; absolute 8h; server-side session; `__session` + CSRF; no shared emergency account |
| Source in tree | `IDLE_SESSION_MS` / `ABSOLUTE_SESSION_MS` on CAL-PILOT |
| Hosting constraint | Firebase Hosting forwards only `__session` |
| Remaining blockers | C2 PASS; exact C3 authority for the formal staff surface |
| Authority | `not_granted` |
| Status | source windows `IMPLEMENTED` on CAL-PILOT; C3 apply `NOT_AUTHORIZED` |

## C4 RBAC

| Field | Value |
| --- | --- |
| Prerequisites | C3 evidence; C4 authority |
| Scope | Backend deny-default; manager vs front_desk; Calendar conflict actions by role |
| Source in tree | `packages/domain/src/roles.ts`; unrouted RBAC appointment policy |
| Tests | Unrouted AppointmentController / BookPilot harnesses |
| Exclusions | Payroll / clinical / money permissions |
| Remaining blockers | C3 PASS; exact C4 authority; front_desk vs manager conflict-queue question still open |
| Authority | `not_granted` |
| Status | `NOT_AUTHORIZED` |

## C5 audit

| Field | Value |
| --- | --- |
| Prerequisites | C4 evidence; C5 authority; D-002 still pending for real-data retention |
| Scope | Append-only audit for booking, hours, login/disable, authz denies, Calendar success/fail/conflict/review |
| Source in tree | Domain audit v2 + Emulator transaction tests; SHA-gated `infra/terraform/c5-firestore/` (Native + PITR; default no-op) |
| Remaining blockers | C4 PASS; exact C5 authority; D-002 for production linkability |
| Authority | `not_granted` |
| Status | `NOT_AUTHORIZED` |

## C6 synthetic integration

| Field | Value |
| --- | --- |
| Prerequisites | C1～C5 evidence; C6 authority; synthetic data only |
| Scope | Staff login, RBAC, booking/schedule, audit, Calendar bidirectional (watch + compensation + conflict queue), website *redirect rehearsal* (no official DNS) |
| Source in tree | Unrouted formal booking; CAL-PILOT five-minute poll; unwired `watch-channel.ts` + unused `GoogleCalendarWatchClient` + unwired `calendar_watch_channels` emulator store; unrouted `CalendarWatchController` (`POST /v1/calendar-watch` 404 on AppModule) |
| Exclusions | Real data; production; live Hosting; production Calendar; mounting `/v1/bookings` |
| Remaining blockers | C1～C5 apply; exact C6 authority; DATA-R03 codecs for collections C6 will actually read |
| Authority | `not_granted` |
| Status | `NOT_AUTHORIZED` |

## DATA-R03 / SCM-R04 (this packet)

| ID | Class | Action now |
| --- | --- | --- |
| DATA-R03 remaining codecs / worker casts / alerting | C6 blocker *if* C6 uses those collections | new unwired `calendar_watch_channels` has schemaVersion 1 fail-closed parser; remaining CAL-PILOT `documentData<T>` / worker `as T` still OPEN |
| SCM-R04 `stream-json@1` / `csv-parse@5` | delayable debt; not C6 synthetic blocker | no force-upgrade |

## Hard stop

Any Firebase live-channel, production Calendar, or real Calendar/patient
data still needs a **fresh exact-change authority**. C1 apply is local
ADC against a **new** project named in the packet; it is not production.
