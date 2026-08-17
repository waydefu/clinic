---
paths:
  - 'packages/**'
  - 'apps/api/**'
  - 'apps/worker/**'
  - 'firestore.rules'
  - 'tests/firestore/**'
---

# Domain, API, worker and Rules

Authority: `AGENTS.md` §"Non-negotiable safety boundaries", §"Repository map"
and §"Task routing". The ADRs under [`docs/adr/`](../../docs/adr) are binding,
not historical.

## Invariants that a change here must not break

- **One write path.** `apps/api` is the only writer (ADR-0001). Browser, worker,
  social channels and any future app call the API. Nothing else opens Firestore
  for writes.
- **No external effect inside a transaction.** Calendar, email, LINE, Meta and
  NAS effects are persisted as an outbox job and performed by `apps/worker` with
  an idempotency key, retry, dead letter and a runbook.
- **Calendar is a projection**, never an availability lock and never a source of
  truth (ADR-0002). It carries no PII. Never hand-build an event ID; use the
  base32hex encoder and prove the round trip.
- **Firestore is deny-by-default** for direct client access (ADR-0003). A Rules
  change needs both an allowed and a denied Emulator test.
- **Roles have exactly one source:** `packages/domain/src/roles.ts`. Do not add a
  role string literal anywhere else, including tests. `physician` has an empty
  permission list deliberately.
- **Timestamps are UTC.** Convert only for display and for payroll periods, using
  `Asia/Taipei`. Never slice the first ten characters off a UTC string to get a
  local date.
- **`completed` is role-gated**, payroll derives from it, and a locked period
  changes only through an auditable adjustment.

## Boundary discipline

Change the owning package, not the caller. A domain rule duplicated into a
controller, repository, worker or the UI is a second source of truth — that is a
defect even when the tests pass. Update the executable contract and domain
first, then the application service, then the adapter or edge.

## The architecture gate is fail-closed on purpose

`check:architecture` walks reachability by parsing **literal** import specifiers.
A computed `import(target)` defeats it, so the gate rejects any module load it
cannot resolve statically. If it blocks you, write a literal specifier and branch
on literals. Do not widen the rule — the unrouted-capability inventory is exactly
what the rule protects.

## Tests

Synthetic, opaque identifiers only; never real or realistic patient, payroll,
calendar or staff data, not even in a fixture. Booking changes must cover
same-slot contention **and** same-patient/different-slot contention through the
explicit guard document. Every write path proves authentication, authorization,
validation, idempotency and audit. Tests must not depend on the wall clock or on
whether the clinic is currently open — anchor to a derivable fixed baseline.
