# Phase 1 Execution Plan

Status: Active  
Started: 2026-07-20  
Scope: Synthetic-only design and preparation. An explicitly authorised static
Firebase Hosting preview is permitted; production data, cloud backends,
Google Calendar, social webhooks and NAS connections remain out of scope.

## Objective

Prepare a reviewed, testable appointment write-path design. Phase 1 does not
enable a public booking form or accept real patient data.

The active local implementation entry is Stage 0 of the
[production-readiness delivery plan](product/production-readiness-delivery-plan-2026-07-23.md),
using the boundaries in the
[production target architecture](architecture/production-target-architecture-2026-07-23.md).
This authorises architecture hardening only; it does not change D-001～D-011.

## Workstreams

| Stream | Deliverables | Blocking decisions |
| --- | --- | --- |
| Privacy and governance | Approved policy version, retention, data-controller/contact and vendor/data-region record | D-001 to D-003 |
| Appointment policy | Service catalogue, resources, slot duration/capacity, booking horizon, cancellation/no-show policy | D-004, D-005 |
| Identity and roles | Staff-role matrix, completion authority, audit ownership and retention | D-006 |
| Booking transaction | Firestore document model, reservation transaction, idempotency, audit/outbox and local tests | D-004 to D-006 |
| Case management | Assignment/reassignment flow, payroll metric/rule version and month-close review | D-007, D-008 |
| Calendar readiness | Calendar ownership, authorization model, scopes, minimal projection and failure drills | D-009 |

## Permitted work

- Add local-only domain rules, contracts, API guards, Emulator tests and
  documentation using synthetic opaque identifiers.
- Build a disabled-by-default transaction test harness after its decisions are
  approved, or under the explicitly documented synthetic-only profile in
  `docs/product/test-only-sandbox-baseline.md`.
- Build a loopback-only browser test surface under that profile only when its
  API and Web environment flags are both explicitly enabled. It must use the
  in-memory synthetic model, not Firestore or any external service.
- Review and version the privacy-policy text without recording a real consent.
- Align contracts and domain requests, create disabled API application-boundary
  interfaces, add an explicit patient booking guard, extend audit v2 and add
  synthetic Emulator concurrency tests as described by Stage 0.
- Deploy the documented static synthetic site to the expiring
  `synthetic-review` channel of `beauessence-clinic-staging`; it must use only
  browser-local synthetic state and follow the online-preview runbook.

## Prohibited work

- Accept a real appointment or process real patient/contact data.
- Enable any cloud Firebase backend, Authentication, Calendar, LINE, Meta,
  email or NAS. The static Hosting preview is the sole recorded exception.
- Deploy the Firebase Hosting live channel or enter real data in the preview.
- Relax Firestore deny-by-default Rules or add a direct client path.
- Treat the privacy-policy draft as published or infer an unresolved policy.

## Required booking-path sequence

1. Record the relevant approved decisions in the Phase 1 decision register.
2. Update domain and contract tests first.
3. Design authentication, role authorization, validation, rate limits,
   idempotency and audit before enabling a route.
4. Define the Firestore transaction plus outbox; never make an external call
   inside the transaction.
5. Add local tests for success, slot conflict, duplicate idempotency key and
   direct-client denial. The active-booking invariant must also cover the same
   patient concurrently requesting different slots through one guard document.
6. Review Calendar projection separately; it is never an availability lock.

## Exit criteria

1. Privacy policy is approved, immutable, versioned and publishable, including
   contact, retention and vendor/data-region details.
2. Capacity, cancellation, no-show and identity/role decisions are approved.
3. Local transaction, idempotency and audit/outbox tests pass with synthetic
   data.
4. A security review confirms API-only Firestore access remains enforced.
5. The Phase 2 Calendar scope and failure runbook are ready for review, but no
   Calendar connection exists.

## Current gate

The project is in the decision-and-design portion of Phase 1. No booking write
endpoint may be enabled until every relevant blocking decision is approved.
Stage 0 architecture hardening is the only active implementation entry:
contract/domain alignment, application-boundary interfaces,
`patient_booking_guards`, audit v2 and synthetic tests.
The test-only profile may exercise pure local domain transitions with synthetic
IDs, including its documented synthetic manager-workload aggregation, but it
is not a route, assignment rule, compensation policy or production capability.

## Test-only checkpoint

On 2026-07-20, the explicit synthetic-only profile completed its local booking
state, idempotency, cancellation, completion/audit/outbox and direct-Firestore
denial checks. Evidence and limitations are recorded in
[`reviews/phase-1-test-only-checkpoint-2026-07-20.md`](reviews/phase-1-test-only-checkpoint-2026-07-20.md).
Formal decisions remain pending.

## Synthetic online preview checkpoint

On 2026-07-21, the project owner authorised a temporary real-device online
preview. The static Hosting channel, browser verification, security headers,
expiry and prohibited capabilities are recorded in
[`reviews/phase-1-synthetic-online-preview-checkpoint-2026-07-21.md`](reviews/phase-1-synthetic-online-preview-checkpoint-2026-07-21.md).
