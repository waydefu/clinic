# Beau Essence Appointment Platform

Enterprise appointment-platform workspace for Beau Essence Clinic. The future
system will receive bookings through a dedicated website, write the source of
truth through a domain API, and project confirmed changes to Google Calendar
through an idempotent outbox worker. The design keeps a path open for Android,
iOS and a future NAS integration without direct database access.

## Current status: Phase 1 active — synthetic online preview available

Phase 0 is complete. Phase 1 covers governance decisions, identity/role design
and a transaction-ready booking write-path design. One isolated Firebase
project (`beauessence-clinic-staging`) hosts an expiring static synthetic
preview. It has no cloud database, backend, authentication, Calendar
connection, patient data, service-account credential, social-webhook secret or
NAS connection. The workflow remains isolated from production policy and real data.

## Start here

1. Read [AGENTS.md](AGENTS.md) for mandatory guardrails and task routing.
2. Read the [Phase 1 execution plan](docs/phase-1-execution-plan.md).
3. Use the [Phase 1 decision register](docs/product/phase-1-decision-register.md)
   to record formal clinic approvals.
4. Review [open decisions](docs/product/open-decisions.md), the
   [API v1 baseline](docs/architecture/api-v1-contract.md), relevant ADRs and
   the [Phase 1 checkpoints](docs/reviews/phase-1-entry-checkpoint-2026-07-20.md)
   [test-only verification](docs/reviews/phase-1-test-only-checkpoint-2026-07-20.md)
   [synthetic case-manager workload check](docs/reviews/phase-1-synthetic-case-workload-checkpoint-2026-07-20.md)
   and [synthetic online preview checkpoint](docs/reviews/phase-1-synthetic-online-preview-checkpoint-2026-07-21.md).

## Commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm test:rules
corepack pnpm --filter @beauessence/api dev
```

`pnpm verify` runs the structure check, the test-only UI guard, the Prettier
format check, TypeScript builds and unit tests.
`pnpm test:rules` starts a disposable local Firestore Emulator and proves that
direct client Firestore reads and writes are denied. Neither command uses a
cloud Firebase project.

## Phase 1 gate

Phase 1 does not authorise a real booking route, patient data, cloud Firebase
backend or Google Calendar. The sole cloud exception is the recorded expiring
static Hosting preview with browser-only synthetic state. A booking write path remains disabled until the related
privacy, appointment-policy and role decisions are approved and its local
transaction, idempotency, audit and Rules tests pass.

The documented [synthetic test-only profile](docs/product/test-only-sandbox-baseline.md)
may exercise pure in-memory domain transitions with opaque IDs. Its temporary
Hosting preview is publicly reachable to URL holders, but records no real
consent, defines no clinic policy, and connects to no backend service.

For a local visual prototype only, the profile can also load a double-gated
loopback API and static Web page. The exact two-terminal commands and limits
are in [apps/web/README.md](apps/web/README.md); it is not a public route or
production website.

The same test-only page can display a non-monetary synthetic case-manager
monthly workload: distinct opaque patients per manager and `Asia/Taipei` month
with a rule-version breakdown. It is not an assignment rule, payroll export or
compensation calculation; D-007 and D-008 remain pending.

The current preview also includes an enterprise-style patient booking flow and
an operations role simulator. The simulated administrator can manage synthetic
accounts, multi-day/multi-interval availability, date exceptions, announcements,
release notes and patient maintenance mode. The simulated front desk retains
only daily booking, cancellation, visit-completion and workload operations.
This is UI permission testing only—not authentication or backend authorisation.

## Non-negotiable rules

1. Clients, social channels, mobile apps and NAS integrations never write
   Firestore directly.
2. Firestore transactions never call Calendar, email, LINE, Meta or NAS;
   external effects use the outbox worker.
3. Google Calendar is a projection, never the availability source of truth.
4. Do not put PII, health data, credentials, Calendar content, payroll exports
   or secrets in source, tests, logs or Git.
5. Only authorised clinic roles can mark a visit `completed`; payroll credits
   are derived from completed visits and corrected by adjustment after lock.
