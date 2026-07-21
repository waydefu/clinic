# AI Navigation Map - Beau Essence Appointment Platform

This is the mandatory orientation document for anyone changing this repository.
The project is in Phase 1. It contains one separately authorized static Firebase
Hosting preview project (`beauessence-clinic-staging`) but no cloud backend,
real clinic data, active Google Calendar integration or NAS connection.

## Non-negotiable safety boundaries

1. Never use, create, paste, log, test with or export real patient, payroll,
   calendar, social-message or NAS data. Never store secrets or service-account
   files in the repository.
2. Browser, social channels, future Android/iOS apps and NAS integrations never
   read or write Firestore directly. They call `apps/api`.
3. Never call Calendar, email, LINE, Meta or NAS from a Firestore transaction.
   Persist an outbox job, then let `apps/worker` perform the external effect
   with idempotency, retry, dead-letter handling and a runbook.
4. Google Calendar is a projection, not an availability lock or source of
   truth. It contains no patient PII, medical data or access credential.
5. Store timestamps in UTC. Convert only for display and payroll-period
   calculation using `Asia/Taipei`.
6. Only an authorised clinic role may set an appointment to `completed`.
   Payroll is derived from completed visits; a locked period changes only via
   an auditable adjustment.
7. Never implement unresolved policy by guessing. Record the answer and owner
   in `docs/product/phase-1-decision-register.md` first.
8. The online synthetic preview may deploy only static files to the expiring
   `synthetic-review` Hosting channel in `beauessence-clinic-staging`. Never
   deploy its live channel or enable a Firebase backend under this authority.

## Mandatory reading order

1. `README.md`
2. `docs/phase-1-execution-plan.md` — current scope and prohibitions
3. `docs/product/phase-1-decision-register.md` — which decisions are approved
4. `docs/architecture/domain-boundaries.md` — which package owns which rule

Then read the document that covers the boundary you are changing. `docs/README.md`
is the canonical index of every document and the only list that is maintained;
do not rely on a copy of it elsewhere.

## Repository map

| Area | Owns | Does not own |
| --- | --- | --- |
| `packages/domain` | Pure rules, invariants, state transitions, payroll uniqueness | I/O, database SDKs, HTTP, secrets |
| `packages/contracts` | Versioned request/response/error schemas | Authorization decisions or persistence |
| `packages/config` | Safe configuration parsing and local defaults | Cloud secrets or live credentials |
| `apps/api` | `/v1` boundary, authentication, authorization, validation, transaction orchestration, audit | Direct integration side effects |
| `apps/worker` | Outbox, external integrations, retries and dead letters | Availability locking or direct client routes |
| `apps/web` | Patient/admin user experience | Direct Firestore access or hidden business rules |
| `infra/terraform` | Reviewed cloud resources, IAM and deployment configuration | Live-state changes without a reviewed plan |
| `tests` | Cross-package and Emulator Rules tests | Real data or real cloud projects |
| `docs` | Decisions, ADRs, runbooks and implementation evidence | Runtime source of truth |

## Task routing

| If changing | Start at | Then check |
| --- | --- | --- |
| Booking, cancellation, completion or payroll rule | `packages/domain` | Domain tests and API contract |
| Public API shape or error | `packages/contracts` | API baseline and API tests |
| API behavior | Contract + domain first | Authentication, authorization, validation, idempotency, audit |
| Calendar sync | ADR-0002 + Calendar runbook | Outbox, idempotency, no PII, retry/dead letter |
| Firestore Rules | ADR-0003 + local baseline | Allowed and denied Emulator tests |
| Privacy/UI form | Privacy checklist + policy draft | Data minimisation and separate marketing consent |
| Loopback test UI | `docs/design/test-only-operations-ui.md` | Keyboard flow, responsive layout and synthetic-only display |
| Temporary online synthetic preview | `docs/runbooks/synthetic-online-preview.md` | Hosting preview only, separate staging project, browser-only synthetic state |
| Availability, exceptions or follow-up | `docs/product/test-only-scheduling-follow-up-workbench.md` | D-004～D-006, explicit clinical/staff decision and synthetic-only scope |
| Monthly close or compensation | Payroll spec + close runbook | Taipei cutoff, immutable lock, adjustment/audit |
| NAS | New approved ADR | Least privilege, outbox and security review |

## Required implementation sequence

1. Identify the boundary and read its documents.
2. Confirm the corresponding Phase 1 decision is approved; otherwise document
   the dependency and stop before making policy-dependent behavior. The sole
   exception is the explicit synthetic-only profile in
   `docs/product/test-only-sandbox-baseline.md`; it permits pure local tests
   and its double-gated loopback browser harness, including a non-monetary
   synthetic manager-workload report. The separately recorded 2026-07-21
   authority also permits an expiring static Hosting preview with browser-only
   synthetic state, never real data or a cloud backend.
3. Update domain and/or contract before API, worker or web code.
4. Add focused tests using synthetic opaque identifiers only.
5. For each write path, prove authentication, authorization, validation,
   idempotency and audit behavior.
6. For each external effect, prove queue/outbox, idempotency, retry,
   dead-letter and runbook coverage.
7. Run the smallest relevant test, then the Phase gate commands.

## Current commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm check:ui
corepack pnpm format
corepack pnpm verify
corepack pnpm test:rules
corepack pnpm --filter @beauessence/api dev
```

- `pnpm verify` runs the structure check, test-only UI guard, documentation
  check, Prettier format check, TypeScript builds and unit tests.
- `pnpm check:docs` proves every relative markdown link resolves and every
  document under `docs/` is listed in `docs/README.md`. A new document must be
  registered in that index or the gate fails.
- `pnpm format` applies Prettier. Source formatting is enforced, not manual:
  do not hand-compress modules to satisfy a guard.
- `pnpm check:ui` prevents the test-only dashboard from losing its loopback,
  synthetic-only input, landmark, live-update and focus-visible safeguards.
- `pnpm test:rules` uses only a disposable local Firestore Emulator.
- Do not deploy, import, export or connect to Firebase cloud during Phase 1
  without an approved change record.

## Phase 1 gate

Phase 1 may create local-only contracts, domain rules, guards and tests. It may
not enable a booking write endpoint until its privacy, appointment-policy and
identity/role decisions are approved and the local transaction, idempotency,
audit/outbox and Rules tests pass.

## Before production data

- Cloud IAM, Firestore location, backups, retention, monitoring and incident
  response have approved infrastructure reviews.
- Calendar authorization and scopes are approved; patient PII is excluded from
  event content.
- Privacy/legal review approves the data flow and vendor arrangements.
- Migration, rollback and launch checklists exist and have been exercised.
