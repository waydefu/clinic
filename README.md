# Beau Essence Appointment Platform

Enterprise appointment-platform workspace for Beau Essence Clinic. The future
system will receive bookings through a dedicated website, write the source of
truth through a domain API, and project confirmed changes to Google Calendar
through an idempotent outbox worker. The design keeps a path open for Android,
iOS and a future NAS integration without direct database access.

## Current status: Phase 1 active — online preview available

Phase 0 is complete. The browser prototype covers the full booking flow, and
the Firestore write path — reservation, every state transition, reschedule and
the outbox worker with backoff and dead-lettering — is proven against the local
Emulator. None of it is routed: the Phase 1 gate forbids a booking write
endpoint before the privacy, appointment-policy and role decisions land.

One isolated Firebase project (`beauessence-clinic-staging`) hosts an expiring
static preview. It has no cloud database, backend, authentication, Calendar
connection, service-account credential, social-webhook secret or NAS
connection.

The patient form collects name, phone, birth date and national ID as of
2026-07-21. Those values stay in the visitor's own browser and are never
transmitted to or stored by the clinic; national IDs render masked. D-001
through D-003 remain pending, so the preview must not be relied on to collect
real patient data operationally.

See [docs/roadmap.md](docs/roadmap.md) for what can be built without approval
and what is blocked.

The active construction baseline is the
[production target architecture](docs/architecture/production-target-architecture-2026-07-23.md)
plus the
[production-readiness delivery plan](docs/product/production-readiness-delivery-plan-2026-07-23.md).
Until the decision register changes, implementation is limited to their local,
synthetic-only Stage 0 architecture-hardening work.

## Latest synthetic-UI refinement — 2026-07-23

The operations workbench now keeps the large green introduction on the home
panel only and presents its daily shortcuts, appointment-note control and
action menu as clear, touch-sized buttons with status icons. The appointment
workspace keeps the week view at the top on desktop, then puts the front-desk
queue before the progressively disclosed booking form. On mobile, settings and
the week view start collapsed so the queue is immediately reachable. The
high-frequency arrival action is a direct primary button; search covers patient
name, phone and appointment ID, while only enabled secondary actions remain in
“更多處置”. Successful booking returns the operator to the new queue card.
Calendar events use the full day-column width when they do not overlap, and
split into stable lanes only during a real time collision. Both pages reflow at
320 CSS px without whole-page horizontal scrolling. This is a static,
browser-local synthetic-UI refinement only: it does not change booking rules,
authorization, Firestore access or Calendar integration.

## Start here

1. Read [AGENTS.md](AGENTS.md) for mandatory guardrails and task routing.
2. Read the [Roadmap](docs/roadmap.md) and
   [Phase 1 execution plan](docs/phase-1-execution-plan.md) for the current
   position, permitted work and prohibitions.
3. Check the
   [Phase 1 decision register](docs/product/phase-1-decision-register.md);
   formal clinic approvals are recorded only there.
4. Use the
   [production target architecture](docs/architecture/production-target-architecture-2026-07-23.md)
   for technical boundaries and the
   [production-readiness delivery plan](docs/product/production-readiness-delivery-plan-2026-07-23.md)
   for implementation order.
5. Read the
   [enterprise readiness review](docs/reviews/2026-07-23-enterprise-production-readiness-review.md)
   for the evidence baseline and unresolved findings.
6. Use [docs/README.md](docs/README.md) — the canonical index of every
   architecture, approval, runbook and review document.

## Commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm test:rules
```

`pnpm verify` runs the structure check, the UI guard, the documentation check,
the Prettier format check, ESLint, TypeScript builds and unit tests.
`pnpm test:rules` starts a disposable local Firestore Emulator and runs the
booking transaction, appointment transition, outbox worker and deny-by-default
suites. CI runs both on every push and pull request. Neither uses a cloud
Firebase project.

To see the pages, start the local site — no API window is needed, because the
browser holds its own state. See [apps/web/README.md](apps/web/README.md).

## Phase 1 gate

Phase 1 does not authorise a booking route, a cloud Firebase backend or Google
Calendar. The sole cloud exception is the recorded expiring static Hosting
preview.

The current authorised engineering entry is Stage 0: contract/domain
alignment, an API application-boundary skeleton, the explicit patient booking
guard, audit v2 and synthetic Emulator tests. It does not change any decision
status or enable a route.

The write path is built and proven, but **not routed**: reservation, all five
transitions, reschedule, idempotency, audit, outbox and the retry/dead-letter
worker pass against the local Emulator, and `apps/api` still exposes only
`/v1/health`. It stays that way until the privacy, appointment-policy and
identity/role decisions are approved.

The preview includes the patient booking flow and an operations role simulator.
The simulated administrator manages accounts, availability, blocked times, date
exceptions, announcements, release notes and maintenance mode; the simulated
front desk keeps booking, cancellation, reschedule, no-show and completion.
This is UI permission testing only — not authentication or backend
authorisation.

The workbench also shows a non-monetary case-manager monthly workload: distinct
patients per manager and `Asia/Taipei` month with a rule-version breakdown. It
is not an assignment rule, payroll export or compensation calculation; D-007
and D-008 remain pending.

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
