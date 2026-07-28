# AI Navigation Map - Beau Essence Appointment Platform

This is the mandatory orientation document for anyone changing this repository.
The project is in Phase 1. It contains one separately authorized static Firebase
Hosting preview project (`beauessence-clinic-staging`) but no cloud backend,
real clinic data, active Google Calendar integration or NAS connection.

The 2026-07-23 enterprise review confirmed that the API-only, pure-domain,
transactional outbox architecture can be retained. Stage 0 architecture
hardening and Checkpoint A were completed on 2026-07-24: local contracts,
application-boundary skeletons, patient booking guards, audit v2 and synthetic
Emulator evidence are in place. The project is now at **Stage 1 owner decisions
and governance approval**. D-010 target architecture/SLO was approved on
2026-07-28; D-006 still blocks Stage 2 cloud staging. D-010 approval does not
itself authorise `terraform apply` or prove the recovery target. Routed booking,
production Calendar and real patient data remain separately decision-gated.

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
2. `docs/roadmap.md` — current position and the active implementation entry
3. `docs/phase-1-execution-plan.md` — current scope and prohibitions
4. `docs/product/phase-1-decision-register.md` — which decisions are approved
5. `docs/architecture/production-target-architecture-2026-07-23.md` — retained
   boundaries, required changes, target transactions and data model
6. `docs/product/production-readiness-delivery-plan-2026-07-23.md` — Stage
   0-to-6 order, decision gates, acceptance criteria and rescoring checkpoints
7. `docs/architecture/domain-boundaries.md` — which package owns which rule

Then read the document that covers the boundary you are changing. `docs/README.md`
is the canonical index of every document and the only list that is maintained;
do not rely on a copy of it elsewhere.

## Current implementation entry point

Stage 0 and Checkpoint A are complete. The current delivery-plan position is
Stage 1: named clinic, privacy, security, operations and technical owners must
turn recorded inputs into explicit approvals or deferrals in the decision
register. Stage 1 is a governance gate, not authority to connect a backend or
enable a route.

### Completed Stage 0 baseline

1. Executable API contracts align with domain requests and the approved
   synthetic field boundary.
2. API application-service, authentication-context, authorization-policy and
   repository-port interfaces exist without a real identity provider or route.
3. `patient_booking_guards` make concurrent bookings for the same patient and
   different slots contend on one explicit document.
4. Emulator race evidence and the audit v2 transaction contract are complete.
5. Idempotency scope/request hashing, worker correlation/metrics ports and the
   local/CI quality gates are established.

### May proceed during Stage 1

- Record owner answers, approval evidence, residual questions and explicit
  decision status in the decision register and approval packets.
- Maintain or correct the existing local/synthetic implementation without
  expanding its approved fields, roles, external effects or data authority.
- Keep the expiring static preview, documentation, tests and security gates
  accurate under their existing authority.
- Prepare reviewed, plan-only Stage 2 changes; do not create or apply cloud
  resources while D-006 is pending or without a separately reviewed Stage 2
  change plan.

### Must remain disabled

- Any booking controller or public/staff write route.
- Cloud Firestore or Authentication before D-006 and an approved Stage 2 change
  plan; the recorded D-010 target alone is not deployment authority.
- Calendar test projection before D-009.
- Public booking or real patient data before D-001 through D-006, D-010 and
  D-011.
- Case/payroll persistence before D-007 and D-008.
- Any Terraform apply, live-channel deployment or production credential use.

The review evidence is
`docs/reviews/2026-07-23-enterprise-production-readiness-review.md`. It is a
dated baseline, not a substitute for the live decision register.

## Agent operating discipline

### Read-only status checks and dependency rebuilds

A request to inspect progress, confirm a commit or plan next work is read-only.
For that kind of request, use Git status/history, remote refs and the current
documents. Do **not** run `pnpm`, `corepack`, install, build, Emulator,
Playwright or package scripts merely to confirm status.

Before any explicitly requested local verification, first confirm that the
repository is the intended clean clone and that `corepack`, the pinned Node
version and its dependencies are already available. If `node_modules` is
missing or incomplete, or `corepack` is unavailable, report the environment
prerequisite and stop. pnpm may start an implicit install when a package script
finds an incomplete dependency tree; that rebuild must never be a side effect
of a read-only inspection.

If the workspace was copied between computers or drives, shows dubious Git
ownership, or contains links to an old path, preserve any source changes and
use the documented fresh HTTPS clone procedure. Do not attempt an automatic
dependency repair. Delete only the confirmed repository-local `node_modules`
when the user explicitly authorises cleanup; never delete a shared pnpm store
or Playwright cache.

### Codebase Memory MCP

When a `Codebase-memory-mcp` (or equivalent repository-memory tool) is
available:

1. Query it before repo-wide or cross-boundary work, returning to an older
   task, changing a public contract, or introducing a new architectural
   concept. Prefer queries for the exact symbol, decision ID, invariant or
   path rather than broad summaries.
2. Treat memory as a navigation hint, never as source of truth. Verify every
   material claim against the current files, decision register, Git diff and
   relevant tests before editing.
3. If memory conflicts with the repository, the current repository and live
   decision register win. Correct or supersede stale memory only after the
   change is verified.
4. Store only durable, reviewed facts such as an approved decision, accepted
   ADR, invariant or completed checkpoint. Do not store transient debugging
   notes, speculative designs, secrets, credentials, patient data or payroll
   data.
5. If the MCP is unavailable, stale or read-only, continue with `rg`, the
   mandatory reading order and repository tests. Its absence must not block a
   safe local task.

### “Grill me” decision challenge

Before implementing a choice that materially affects privacy, authentication,
authorization, public API shape, data migration/deletion, external integration,
cloud cost, deployment or rollback, challenge the requester with concise,
specific questions when the answer is not already recorded.

Cover only the unresolved items that can change the design:

- decision owner and approval evidence;
- data involved and whether any real/regulated data is in scope;
- actors, resource scope and denied cases;
- source of truth and concurrency invariant;
- failure, retry, rollback and manual fallback;
- measurable acceptance criteria;
- environment, cost or operational owner.

Do not interrogate the requester for an obvious, reversible, local-only change
whose intent is already clear. Ask only questions whose answers would change
the implementation. A policy-affecting answer must be recorded in the decision
register before the corresponding behavior is enabled.

### Minimal safe change

“Minimal” means the smallest coherent and verifiable change, not the fewest
lines.

1. Reuse existing contracts, domain planners, ports, adapters, utilities and
   tests before creating another abstraction.
2. Do not mix opportunistic refactors, dependency upgrades, framework changes,
   formatting churn or unrelated cleanup into the requested patch.
3. Preserve public behavior and compatibility unless the task explicitly
   authorises a breaking change; version a contract when compatibility cannot
   be preserved.
4. Touch the narrowest owning boundary. Do not duplicate a domain rule in the
   controller, repository, worker or UI to avoid editing the correct package.
5. Add the smallest test that proves the requested success and its important
   denied/conflict case, then run the relevant gate.
6. If a tiny patch would hard-code a pending policy, weaken a safety boundary
   or create a second source of truth, stop and propose the smallest safe
   prerequisite instead.
7. Keep existing user changes intact and report every intentionally modified
   file. Do not reformat or rewrite unrelated files.

## Repository map

| Area | Owns | Does not own |
| --- | --- | --- |
| `packages/domain` | Pure rules, invariants, state transitions, payroll uniqueness, Calendar event-ID encoding | I/O, database SDKs, HTTP, secrets |
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
| Production architecture or cross-boundary work | Production target architecture | Delivery-plan stage, decision gate and affected ADR |
| Patient active-booking uniqueness | `packages/domain` + booking repository port | Guard document, same-patient/different-slot race test, release behavior |
| Audit schema or operator evidence | Production target architecture ARCH-04 | Same-transaction append, privacy minimisation, retention decision |
| Calendar sync | ADR-0002 + Calendar runbook | Outbox, idempotency, no PII, retry/dead letter |
| Calendar event ID / outbox key | `docs/architecture/calendar-event-id.md` | Never hand-build the key; base32hex only, encode/decode round-trip |
| Firestore Rules | ADR-0003 + local baseline | Allowed and denied Emulator tests |
| Privacy/UI form | Privacy checklist + policy draft | Data minimisation and separate marketing consent |
| Loopback test UI | `docs/design/test-only-operations-ui.md` | Keyboard flow, responsive layout and synthetic-only display |
| Temporary online synthetic preview | `docs/runbooks/synthetic-online-preview.md` | Hosting preview only, separate staging project, browser-only synthetic state |
| Availability, exceptions or follow-up | `docs/product/test-only-scheduling-follow-up-workbench.md` | D-004～D-006, explicit clinical/staff decision and synthetic-only scope |
| Monthly close or compensation | Payroll spec + close runbook | Taipei cutoff, immutable lock, adjustment/audit |
| Cloud runtime, IAM, backup or monitoring | Delivery plan Stage 2 + approved D-010 target | Reviewed IaC/change plan only; never apply before Stage 2 authority |
| Replacing browser-local state | Synthetic Web architecture | Contract-compatible API client; no direct Firestore path |
| NAS | New approved ADR | Least privilege, outbox and security review |

## Required implementation sequence

1. Identify the boundary and read its documents.
2. Confirm the corresponding Phase 1 decision is approved; otherwise document
   the dependency and stop before making policy-dependent behavior. The sole
   exception is the explicit test profile in
   `docs/product/test-only-sandbox-baseline.md`; it permits local tests and the
   loopback browser harness, including a non-monetary manager-workload report.
   The separately recorded 2026-07-21 authority also permits an expiring static
   Hosting preview holding its state in the visitor's own browser, never a
   cloud backend. As supplemented by the recorded 2026-07-27 owner batch, that
   authority allows the synthetic patient form to collect name, phone, birth
   date with an optional year, national ID or passport, NHI-card intent, a short
   patient note, the approved request/source tags and a conditional optional
   referrer name. It does not authorise LineID, gender or any other field.
3. Confirm the delivery-plan stage. Stage 0 is complete; while Stage 1
   decisions remain pending, proceed only with the policy-neutral maintenance,
   decision work and documented synthetic-preview scope listed above. D-010
   target approval is recorded; D-006 still blocks Stage 2.
4. Update executable contract and domain first, then application service,
   repository adapter, worker or web edge.
5. Add focused tests using synthetic opaque identifiers only. Booking changes
   must cover both same-slot contention and same-patient/different-slot
   contention through the explicit guard document.
6. For each write path, prove authentication, authorization, validation,
   idempotency and audit behavior.
7. For each external effect, prove queue/outbox, idempotency, retry,
   dead-letter and runbook coverage.
8. Run the smallest relevant test, then the Phase gate commands. Update the
   decision, architecture, plan and review evidence when a checkpoint closes.

## Current commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm check:ui
corepack pnpm format
corepack pnpm verify
corepack pnpm test:rules
corepack pnpm test:e2e
corepack pnpm check:supply-chain
corepack pnpm --filter @beauessence/api dev
```

- `pnpm verify` runs the structure check, UI guard, documentation check,
  tracked-secret check, Prettier format check, ESLint, TypeScript builds and
  unit tests. CI runs the same command plus `pnpm test:rules`, Playwright E2E,
  dependency audits, SBOM/license policy and commit-bound evidence on every push
  and pull request.
- ESLint covers correctness only; Prettier owns formatting. The type-aware
  rules matter most for `no-floating-promises`: a missing await in the booking
  or outbox paths fails silently.
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
audit/outbox and Rules tests pass. Stage 0 already established the explicit
patient booking guard, the same-patient/different-slot race test, audit v2 and
an application boundary. D-010 target approval is recorded, but Stage 2 cloud
staging still requires explicit D-006 approval and a reviewed change plan;
completed technical prerequisites do not bypass them.

## Before production data

- Cloud IAM, Firestore location, backups, retention, monitoring and incident
  response have approved infrastructure reviews.
- Calendar authorization and scopes are approved; patient PII is excluded from
  event content.
- Privacy/legal review approves the data flow and vendor arrangements.
- Migration, rollback and launch checklists exist and have been exercised.
