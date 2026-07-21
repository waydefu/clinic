# Documentation Map

This file is the canonical index of every document in `docs/`. `README.md` and
`AGENTS.md` link here rather than keeping their own copies of the list, so a new
document only has to be registered in one place.

Adding a document means: create it, add it to the right section below, and add
it to `scripts/check-structure.mjs` if it must never be deleted.

## 1. Start here

Read in this order before changing a boundary or enabling a capability.

| # | Document | Why |
| --- | --- | --- |
| 1 | [Enterprise project plan](enterprise-appointment-project-plan.md) | The whole programme: architecture, phases, data model, privacy and the plan-versus-implementation gap register |
| 2 | [Phase 1 execution plan](phase-1-execution-plan.md) | Current scope, permitted and prohibited work, exit criteria |
| 3 | [Phase 1 decision register](product/phase-1-decision-register.md) | Which of D-001…D-011 are approved; nothing policy-dependent may be built ahead of these |
| 4 | [Phase 1 approval gate](reviews/phase-1-approval-gate.md) | The single start/stop record |
| 5 | [Open decisions](product/open-decisions.md) | Historical decision context (superseded for active tracking) |
| 6 | [Domain boundaries](architecture/domain-boundaries.md) | Which package owns which rule |

## 2. Decisions and approval packets

Formal answers are recorded by the clinic, not inferred by implementers.

- [Phase 1 decision register](product/phase-1-decision-register.md) — the live status of every decision
- [Phase 1 Chinese approval checklist](product/phase-1-chinese-approval-checklist.md) — D-001…D-006, D-011 in the clinic's working language
- [Appointment operations approval packet](product/phase-1-appointment-operations-approval-packet.md) — service catalogue, slots, cancellation and no-show policy
- [Case management and payroll approval packet](product/phase-1-case-management-payroll-approval-packet.md) — D-007, D-008 assignment and compensation basis
- [Integration and launch approval packet](product/phase-1-integration-launch-approval-packet.md) — D-009…D-011 Calendar, social channels and launch
- [Privacy approval packet](legal/phase-1-privacy-approval-packet.md) — D-001…D-003 privacy, retention and vendor record

## 3. Architecture and contracts

- [ADR-0001 — the domain API is the only write path](adr/0001-domain-api-is-the-only-write-path.md)
- [ADR-0002 — Calendar is a projection, not the lock](adr/0002-calendar-is-a-projection-not-the-lock.md)
- [ADR-0003 — direct Firestore client access is deny by default](adr/0003-firestore-direct-client-access-is-deny-by-default.md)
- [Domain boundaries](architecture/domain-boundaries.md) — package ownership and forbidden dependencies
- [API v1 contract baseline](architecture/api-v1-contract.md) — navigation layer for the schemas in `packages/contracts`
- [Local Firestore baseline](architecture/firestore-local-baseline.md) — Emulator-only project and Rules baseline
- [Synthetic Web modular architecture](architecture/synthetic-web-modular-architecture.md) — browser module boundaries and how they are later replaced by the real API
- [Calendar and database integration plan](architecture/calendar-and-database-integration-plan.md) — staged route from the browser prototype to Firestore and a Calendar projection, and which decision blocks each stage

## 4. Building and testing

- [Phase 0 local development](phase-0-local-development.md) — what exists locally and how to verify it
- [Test-only sandbox baseline](product/test-only-sandbox-baseline.md) — the authority and limits of the synthetic-only profile
- [Test-only scheduling and follow-up workbench](product/test-only-scheduling-follow-up-workbench.md) — scope of the synthetic scheduling and follow-up surface
- [Test-only operations UI guide](design/test-only-operations-ui.md) — safety, accessibility and layout rules for the browser harness

## 5. Operations

- [Synthetic online preview runbook](runbooks/synthetic-online-preview.md) — deploying and expiring the static Hosting preview
- [Calendar sync failure runbook](runbooks/calendar-sync-failure.md) — outbox retry, dead letter and manual recovery
- [Month close runbook](runbooks/month-close.md) — provisional list, review, approval and lock
- [Month close specification](payroll/month-close-spec.md) — countable credit definition and uniqueness rules

## 6. Privacy, security and legal

- [Taiwan privacy legal baseline](security/taiwan-privacy-legal-baseline.md) — statutory baseline for Phase 1 design
- [Privacy policy checklist](security/privacy-policy-checklist.md) — what a publishable policy must contain
- [Privacy policy draft](legal/privacy-policy-draft.md) — draft text, not published and not a recorded consent

## 7. Review record

Newest first. Each entry is dated evidence, not a plan.

| Date | Review | Result |
| --- | --- | --- |
| 2026-07-21 | [Cleanup, security and UX review](reviews/cleanup-and-ux-review-2026-07-21.md) | Dead exports removed, XSS verified in a browser, slot picker and form validation reworked against published guidance |
| 2026-07-21 | [Codebase analysis and remediation](reviews/codebase-analysis-and-remediation-2026-07-21.md) | Version control established; loopback, permission, CSP and formatting gaps closed |
| 2026-07-21 | [Manager workflow analysis and remediation](reviews/manager-workflow-analysis-and-remediation-2026-07-21.md) | Workbench reordered into a daily operating sequence |
| 2026-07-21 | [Synthetic online preview checkpoint](reviews/phase-1-synthetic-online-preview-checkpoint-2026-07-21.md) | Expiring static Hosting preview authorised and verified |
| 2026-07-20 | [Synthetic case-manager workload checkpoint](reviews/phase-1-synthetic-case-workload-checkpoint-2026-07-20.md) | Non-monetary workload aggregation verified |
| 2026-07-20 | [Test-only checkpoint](reviews/phase-1-test-only-checkpoint-2026-07-20.md) | Local booking, idempotency, audit/outbox and deny-by-default verified |
| 2026-07-20 | [Phase 1 entry checkpoint](reviews/phase-1-entry-checkpoint-2026-07-20.md) | Phase 0 complete; Phase 1 entered in local-only mode |
| 2026-07-20 | [Implementation readiness review](reviews/2026-07-20-implementation-readiness-review.md) | Blocking items identified before any implementation |

## Superseded

Kept for history. Do not use as a basis for work.

- [Open product decisions](product/open-decisions.md) — superseded for active tracking by the [decision register](product/phase-1-decision-register.md)
- [Zero-cost proposal](archive/clinic-zerocost-proposal.md) — the Firebase Spark / Vercel Hobby / Apps Script proposal, superseded by the enterprise project plan. Kept verbatim for history; its data handling does not meet the current privacy baseline.
