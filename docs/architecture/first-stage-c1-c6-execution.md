# First-stage C1～C6 execution packet (source only)

**Type:** current execution packet. Not production authority.
**Depends on:** [first-stage C0 authority](first-stage-c0-authority.md)
(`OWNER_AUTHORITY_CONFIRMED` / `ENGINEERING_RECOMMENDATION_COMPLETE` /
`NAMED_REVIEWER_METADATA_PENDING`).
**Machine gate:** [stage-2-gate-status.json](stage-2-gate-status.json)
C0～C6 `completed`; C1～C6 `granted`. Isolated project
`beauessence-clinic-stg-c1a01`. Formal booking stays **UNROUTED**.
`PRODUCTION_AUTHORIZED=NO`. Live Hosting `DEPLOYED=NO`.

Owner 2026-09-11 continuation named C1～C6 as the sequential *route*.
Synthetic C1～C6 smoke has PASSed on the isolated project. Do not write
`AUTHORIZED` as production `PASS`, or `CI PASS` as
`PRODUCTION AUTHORIZED`. Do not route `AppointmentController`.

## Sequence (authority DAG, not technical DAG)

`C0 completed → C1 granted → C1 PASS → C2 granted → … → C6 PASS`

Machine: `scripts/sequential-c-gate.mjs`. Live tree with C1～C6 smoke is
`DONE`. Production Calendar, official DNS, live Hosting, and public
`/v1/bookings` remain outside this packet.

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
| Remaining blockers | none for C1 foundation |
| Authority | `granted` |
| Status | `AUTHORIZED` / `DEPLOYED` / smoke `PASS` / `PRODUCTION_AUTHORIZED=NO` |

## C2 staff login

| Field | Value |
| --- | --- |
| Prerequisites | C1 evidence; C2 authority |
| Scope | Independent staff accounts; Google + clinic-managed; MFA; disable-on-next-request; owner UI at least manager / front_desk |
| Source in tree | CAL-PILOT Google+TOTP session (`calendar-pilot-session.ts`) is synthetic-only; SHA-gated `infra/terraform/c2-identity/` (Identity Platform API only; default no-op) |
| Tests | `apps/api/src/auth/calendar-pilot-session.test.ts` (pilot, not C2) |
| Exclusions | Patient login; real staff PII |
| Remaining blockers | none for C2 Identity on the isolated project |
| Authority | `granted` |
| Status | `AUTHORIZED` / `DEPLOYED` / smoke `PASS` / `PRODUCTION_AUTHORIZED=NO` |

## C3 session security

| Field | Value |
| --- | --- |
| Prerequisites | C2 evidence; C3 authority |
| Scope | Idle 30m; absolute 8h; server-side session; `__session` + CSRF; no shared emergency account |
| Source in tree | `IDLE_SESSION_MS` / `ABSOLUTE_SESSION_MS` on CAL-PILOT |
| Hosting constraint | Firebase Hosting forwards only `__session` |
| Remaining blockers | none for C3 source evaluator |
| Authority | `granted` |
| Status | source `PASS` / `PRODUCTION_AUTHORIZED=NO` |

## C4 RBAC

| Field | Value |
| --- | --- |
| Prerequisites | C3 evidence; C4 authority |
| Scope | Backend deny-default; manager vs front_desk; Calendar conflict actions by role |
| Source in tree | `packages/domain/src/roles.ts`; unrouted RBAC appointment policy |
| Tests | Unrouted AppointmentController / BookPilot harnesses |
| Exclusions | Payroll / clinical / money permissions |
| Remaining blockers | front_desk vs manager conflict-queue question still open (not a C4 source FAIL) |
| Authority | `granted` |
| Status | source `PASS` / `PRODUCTION_AUTHORIZED=NO` |

## C5 audit

| Field | Value |
| --- | --- |
| Prerequisites | C4 evidence; C5 authority; D-002 still pending for real-data retention |
| Scope | Append-only audit for booking, hours, login/disable, authz denies, Calendar success/fail/conflict/review |
| Source in tree | Domain audit v2 + Emulator transaction tests; SHA-gated `infra/terraform/c5-firestore/` (Native + PITR; default no-op) |
| Remaining blockers | D-002 for production linkability |
| Authority | `granted` |
| Status | `AUTHORIZED` / `DEPLOYED` / smoke `PASS` / `PRODUCTION_AUTHORIZED=NO` |

## C6 synthetic integration

| Field | Value |
| --- | --- |
| Prerequisites | C1～C5 evidence; C6 authority; synthetic data only |
| Scope | Staff login, RBAC, booking/schedule, audit, Calendar bidirectional (watch + compensation + conflict queue), website *redirect rehearsal* (no official DNS) |
| Source in tree | Unrouted formal booking; CAL-PILOT five-minute poll; unwired `watch-channel.ts` + unused `GoogleCalendarWatchClient` + unwired `calendar_watch_channels` emulator store; unrouted `CalendarWatchController`; SHA-gated `infra/terraform/c6-calendar/` (Calendar JSON API only; default no-op) |
| Exclusions | Real data; production; live Hosting; production Calendar; mounting `/v1/bookings` |
| Remaining blockers | DATA-R03 codecs; production Calendar D-009/D-016; public booking D-004/D-005 |
| Authority | `granted` |
| Status | `AUTHORIZED` / `DEPLOYED` / smoke `PASS` / booking+watch **UNROUTED** / `PRODUCTION_AUTHORIZED=NO` |

## DATA-R03 / SCM-R04 (this packet)

| ID | Class | Action now |
| --- | --- | --- |
| DATA-R03 remaining codecs / worker casts / alerting | C6 blocker *if* C6 uses those collections | new unwired `calendar_watch_channels` has schemaVersion 1 fail-closed parser; remaining CAL-PILOT `documentData<T>` / worker `as T` still OPEN |
| SCM-R04 `stream-json@1` / `csv-parse@5` | delayable debt; not C6 synthetic blocker | no force-upgrade |

## Hard stop

Any Firebase live-channel, production Calendar, or real Calendar/patient
data still needs a **fresh exact-change authority**. Isolated C1～C6
synthetic apply is **not** production. Live Hosting remains `DEPLOYED=NO`.
`sequential-c-gate` on the live tree with C1～C6 smoke is `DONE`.
