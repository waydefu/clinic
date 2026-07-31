# Documentation Map

This file is the canonical index of every document in `docs/`. `README.md` and
`AGENTS.md` link here rather than keeping their own copies of the list, so a new
document only has to be registered in one place.

Adding a document means: create it, add it to the right section below, and add
it to `scripts/check-structure.mjs` if it must never be deleted.

How to distinguish current authority, dated evidence, drafts and superseded
material is defined in [Document lifecycle and evidence rules](document-lifecycle.md).

## 1. Start here

Read in this order before changing a boundary or enabling a capability.

| # | Document | Why |
| --- | --- | --- |
| 0 | [Document lifecycle and evidence rules](document-lifecycle.md) | How to tell current authority from dated evidence, plan-only material and superseded history |
| 1 | [Roadmap](roadmap.md) | Where the project actually stands, what can be built without any approval, and what is blocked |
| 2 | [Phase 1 execution plan](phase-1-execution-plan.md) | Current scope, permitted and prohibited work, exit criteria |
| 3 | [Phase 1 decision register](product/phase-1-decision-register.md) | Live status of all D-series decisions, including the separate D-014～D-016 expansion gates; nothing policy-dependent may be built ahead of them |
| 4 | [Current execution and approval plan](product/current-execution-and-approval-plan.md) | Plain-language ordered next steps plus the consolidated list of repository, C0, D-series and per-deployment approvals still required |
| 5 | [Production target architecture (2026-07-23)](architecture/production-target-architecture-2026-07-23.md) | The retained boundaries, required architecture changes and target data flows |
| 6 | [Production-readiness delivery plan (2026-07-23)](product/production-readiness-delivery-plan-2026-07-23.md) | The gated implementation sequence from the synthetic preview to production evidence |
| 7 | [Domain boundaries](architecture/domain-boundaries.md) | Which package owns which rule |
| 8 | [Enterprise readiness review (2026-07-23)](reviews/2026-07-23-enterprise-production-readiness-review.md) | The verified baseline, scores, findings and limitations before Stage 0 |
| 9 | [Enterprise project plan](enterprise-appointment-project-plan.md) | The whole programme background, data model, privacy and historical gap register |
| 10 | [Phase 1 approval gate](reviews/phase-1-approval-gate.md) | The single start/stop record |

## 2. Decisions and approval packets

Formal answers are recorded by the clinic, not inferred by implementers.

- [Phase 1 decision register](product/phase-1-decision-register.md) — the live status of every decision
- [Current execution and approval plan](product/current-execution-and-approval-plan.md) — the plain-language order of work and the consolidated approval checklist for repository security, C0, D-series and C1～C6 deployment slices
- [2026-07-27 owner request batch](product/2026-07-27-owner-request-batch.md) — the 19 owner requests of 2026-07-27 turned into scoped items, the decisions already taken, the paper intake form they map onto, and a batched execution sheet
- [Full-project master plan (2026-07-31)](product/full-project-master-plan-2026-07-31.md) — the single technical-strategy source for the rest of the project: the ISO/IEC 25010 maintainability model mapped onto this repository's gates, Core Web Vitals and human response-time budgets, Firestore hotspotting rules, the NIST SP 800-63B cross-check of the approved D-006 session values, Taiwanese sensitive-data and medical-record retention constraints, the Google Calendar sync design and low-traffic SLO alerting
- [Full-project execution book (2026-07-31)](product/full-project-execution-book-2026-07-31.md) — the same plan turned into ordered steps, each with its prerequisite, action, acceptance evidence and rollback, from the current repository wrap-up through C0, C1～C6, Stage 3～6, Expansion S and the standing maintenance cadence
- [Consolidated owner-request index (2026-07-31)](product/owner-requests-consolidated-2026-07-31.md) — every owner request from the 2026-07-26～28 desktop notes numbered OR-01…OR-69 with its current state, the four contradictions still needing an owner answer, and the decision blocking each unbuilt item
- [Surgery, follow-up, payment and settlement expansion plan (2026-07-28)](product/2026-07-28-surgery-follow-up-expansion-plan.md) — plan-only normalization of the owner-provided surgery workflow into a separate Expansion S track, including Calendar inbound review, clinical/financial data boundaries and D-014～D-016
- [Stage 2 identity and cloud change plan (2026-07-28)](architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md) — plan-only translation of approved D-006/D-010 values into reviewable identity, MFA, session, revocation, delegation-code and isolated-staging slices
- [Phase 1 Chinese approval checklist](product/phase-1-chinese-approval-checklist.md) — D-001…D-006, D-011 in the clinic's working language
- [Stage B/C approval request](product/stage-b-c-approval-request.md) — D-006, D-010 and D-009 consolidated into one sheet; D-006/D-010 are approved, while change/deployment review still gates cloud staging and D-009 gates the Calendar projection
- [Appointment operations approval packet](product/phase-1-appointment-operations-approval-packet.md) — service catalogue, slots, cancellation and no-show policy
- [Case management and payroll approval packet](product/phase-1-case-management-payroll-approval-packet.md) — D-007, D-008 assignment and compensation basis
- [Integration and launch approval packet](product/phase-1-integration-launch-approval-packet.md) — D-009…D-011 Calendar, social channels and launch
- [Privacy approval packet](legal/phase-1-privacy-approval-packet.md) — D-001…D-003 privacy, retention and vendor record

## 3. Architecture and contracts

- [ADR-0001 — the domain API is the only write path](adr/0001-domain-api-is-the-only-write-path.md)
- [ADR-0002 — Calendar is a projection, not the lock](adr/0002-calendar-is-a-projection-not-the-lock.md)
- [ADR-0003 — direct Firestore client access is deny by default](adr/0003-firestore-direct-client-access-is-deny-by-default.md)
- [ADR-0004 — the browser and the server share one compiled domain, with no bundler](adr/0004-browser-and-server-share-one-compiled-domain.md)
- [ADR-0005 — patient intake/verification and appointment commands are separate](adr/0005-patient-intake-and-appointment-command-are-separate.md)
- [Domain boundaries](architecture/domain-boundaries.md) — package ownership and forbidden dependencies
- [API v1 contract baseline](architecture/api-v1-contract.md) — navigation layer for the schemas in `packages/contracts`
- [Local Firestore baseline](architecture/firestore-local-baseline.md) — Emulator-only project and Rules baseline
- [Synthetic Web modular architecture](architecture/synthetic-web-modular-architecture.md) — browser module boundaries and how they are later replaced by the real API
- [Calendar and database integration plan](architecture/calendar-and-database-integration-plan.md) — staged route from the browser prototype to Firestore and a Calendar projection, and which decision blocks each stage
- [Calendar event ID and outbox key](architecture/calendar-event-id.md) — why the outbox key is base32hex, where it is generated, and what to check before changing it
- [Production target architecture (2026-07-23)](architecture/production-target-architecture-2026-07-23.md) — architecture verdict, required changes, target containers, data model, transactions and migration boundaries
- [Infrastructure and operations plan (2026-07-24)](architecture/infrastructure-and-operations-plan-2026-07-24.md) — plan-only environment split, Terraform layout, IAM, secrets, Firestore backup/PITR, monitoring, budget, deploy and rollback
- [Stage 2 C0 readiness artifacts (2026-07-29)](architecture/stage-2-c0-readiness-artifacts-2026-07-29.md) — proposal-ready／approval-pending logical resource manifest, Cloud IAM matrix, cost-input model, DR option analysis and test/rollback evidence template; no Terraform or cloud execution
- [Stage 2 machine-readable gate status](architecture/stage-2-gate-status.json) — canonical C0 review plus separate C1～C6 deployment-authority and execution/evidence status consumed by architecture checks
- [Worker runtime and reconciliation plan (2026-07-24)](architecture/worker-runtime-and-reconciliation-plan-2026-07-24.md) — plan-only trigger design, at-least-once semantics, Calendar reconciliation, dead-letter operator permissions and credential rotation

## 4. Building and testing

- [Phase 0 local development](phase-0-local-development.md) — what exists locally and how to verify it
- [Test-only sandbox baseline](product/test-only-sandbox-baseline.md) — the authority and limits of the synthetic-only profile
- [Test-only scheduling and follow-up workbench](product/test-only-scheduling-follow-up-workbench.md) — scope of the synthetic scheduling and follow-up surface
- [Front-desk follow-up and patient UX spec (2026-07-23)](product/front-desk-followup-and-patient-ux-spec-2026-07-23.md) — the authoritative requirement list for the follow-up queue transform, today filter, past-slot rule, cancellation contact popup and the nav bell
- [Test-only operations UI guide](design/test-only-operations-ui.md) — safety, accessibility and layout rules for the browser harness
- [Boutique Clinical Command (2026-07-25)](design/boutique-clinical-command-2026-07-25.md) — the approved visual direction, the six-stage sequence, what is done, and the rules a new implementer must follow
- [Clinic website and booking integration (2026-07-27)](design/clinic-site-integration-2026-07-27.md) — clinic/doctor/nasal-function route scope, visual bridge to `/booking`, medical-content boundary and implementation structure
- [介面規則書 (UI/UX rules)](design/ui-ux-rules.md) — **binding** rules on buttons versus links, clickable affordance, target size, label wrapping and when layouts may stack, each with its authority and the test that enforces it
- [2026-07-28 UI visual baseline](reviews/ui-visual-baseline-2026-07-28.md) — current Stage/gate statement plus ten reproducible desktop/mobile reference captures and their manifest; reference evidence, not a cross-OS pixel gate
- [Production-readiness delivery plan (2026-07-23)](product/production-readiness-delivery-plan-2026-07-23.md) — work packages, decision gates, suggested sequence, acceptance criteria and rescoring checkpoints
- [Web and supply-chain quality gates (2026-07-24)](architecture/web-quality-gates-2026-07-24.md) — which gate enforces what, the performance budget, the CycloneDX SBOM and licence policy, and the SAST layers
- [2026 web-standards audit and remediation (2026-07-26)](reviews/2026-07-26-web-standards-remediation-plan.md) — what the audit found, the two decisions it forced, all 19 fixes with their evidence, and the costs and limitations discovered while making them
- [Manual accessibility test runbook](runbooks/manual-accessibility-test.md) — the screen-reader, forced-colors, keyboard and zoom checks axe cannot make, with pass criteria and an evidence template

## 5. Operations

- [Synthetic online preview runbook](runbooks/synthetic-online-preview.md) — deploying and expiring the static Hosting preview
- [Calendar sync failure runbook](runbooks/calendar-sync-failure.md) — outbox retry, dead letter and manual recovery
- [Calendar go-live runbook](runbooks/calendar-go-live.md) — who does what to wire the real Google Calendar test integration (credentials stay with the owner)
- [Backup and restore runbook](runbooks/backup-and-restore.md) — what is protected, approved RTO/RPO targets whose capability remains unverified, the restore procedure and the quarterly drill requirement
- [Incident response runbook](runbooks/incident-response.md) — severity levels, roles, communication, the privacy-incident path and the postmortem template
- [Month close runbook](runbooks/month-close.md) — provisional list, review, approval and lock
- [Month close specification](payroll/month-close-spec.md) — countable credit definition and uniqueness rules

## 6. Privacy, security and legal

- [Taiwan privacy legal baseline](security/taiwan-privacy-legal-baseline.md) — statutory baseline for Phase 1 design
- [Data classification and field inventory (2026-07-29)](security/data-classification-and-field-inventory-2026-07-29.md) — plan-only inventory of fields already present in the synthetic browser and local Emulator, conservative handling tiers and the blank approval worksheet; no production field or real-data flow is approved
- [Privacy policy checklist](security/privacy-policy-checklist.md) — what a publishable policy must contain
- [Privacy policy draft](legal/privacy-policy-draft.md) — draft text, not published and not a recorded consent

## 7. Review record

Newest first. Each entry is dated evidence, not a plan.

| Date | Review | Result |
| --- | --- | --- |
| 2026-07-30 | [Private repository Dependabot alert enablement](reviews/2026-07-30-private-dependabot-alert-enablement.md) | Dependency graph and Dependabot alerts enabled for `waydefu/clinic`; four initial development-scope alerts recorded, while automatic dependency submission and all automatic update modes remain disabled |
| 2026-07-29 | [Sanitized public mirror publication](reviews/2026-07-29-sanitized-public-mirror-publication.md) | Private canonical repository retained; independent allowlisted code-only mirror published from clean history after secret, personal-data, internal-information, Git-history, dependency, test and fresh-clone gates |
| 2026-07-29 | [Local hardening and CI handoff](reviews/2026-07-29-local-hardening-and-ci-handoff.md) | Commit, PR, preview and local validation evidence; the initial CI failures and later repo-owned repairs are annotated, private CodeQL upload remains capability-blocked, and production remains blocked |
| 2026-07-28 | [Markdown currency audit](reviews/2026-07-28-markdown-currency-audit.md) | All pre-existing Markdown files scanned by lifecycle and stale-status terms; current authority reconciled for Stage 1, D-004 slot/multi-service gaps, approved D-006 identity/security, D-010 RTO/RPO, privacy scope and historical-evidence annotations |
| 2026-07-28 | [Current UI visual baseline and progress](reviews/ui-visual-baseline-2026-07-28.md) | Stage 0/Checkpoint A and the current Stage 1 gate rechecked; ten reproducible desktop/mobile reference captures with fixed synthetic state, environment metadata, clean console and SHA-256 manifest |
| 2026-07-27 | [Owner request batch 1–5 delivery](reviews/2026-07-27-owner-request-batch-delivery.md) | Seventeen of the nineteen owner requests delivered in five separate commits; verify green at 548 unit tests, 152 browser tests and 452/452 online-preview checks; six real defects found and fixed along the way, and what was deliberately left out |
| 2026-07-27 | [Automated-check gaps and remediation](reviews/2026-07-27-automated-check-gaps.md) | Six gaps in the gates themselves — shipped HTML comments, three unscanned stylesheets, JS-injected inputs outside the allowlist, five copies of the public-page list, budget changes with no recorded reason, and missing field-level translation coverage — each written down before being fixed |
| 2026-07-27 | [Clinic website integration delivery](reviews/2026-07-27-clinic-site-integration-delivery.md) | Clinic, doctor and nasal-function pages integrated with `/booking`; repository, browser and 439-check online-preview evidence passed on the expiring `synthetic-review` channel |
| 2026-07-27 | [Booking-page SEO baseline](reviews/2026-07-27-seo-baseline.md) | What search engines can see today, the release switch that stops a forgotten `noindex` from hiding the site, and the honest list of what is not done |
| 2026-07-26 | [Full-project audit and follow-up](reviews/2026-07-26-full-project-audit.md) | Whole-repo audit: no P0/P1 defect; exposure and compliance findings raised, three fixed; D-012 later recorded informed preview-scope NHI-mark retention and D-013 recorded required checks with administrator bypass, while formal-domain logo review and the actual GitHub protection setting remain unverified |
| 2026-07-26 | [Local operations and logical-restore rehearsal](reviews/2026-07-26-local-operations-rehearsal.md) | Emulator V1–V5 and Calendar companion V6 passed; cloud backup/PITR, IAM, alerts, contacts and RTO/RPO remain explicitly unverified |
| 2026-07-26 | [2026 web-standards audit and remediation](reviews/2026-07-26-web-standards-remediation-plan.md) | 2026 standards sweep and 19 UI/UX remediations completed; limitations and decision boundaries retained |
| 2026-07-24 | [Stage 0 Checkpoint A architecture review](reviews/stage-0-checkpoint-a-2026-07-24.md) | Stage 0 architecture hardening passed; this is not a production rating and all D-001～D-011 gates remain pending |
| 2026-07-23 | [Enterprise production-readiness review](reviews/2026-07-23-enterprise-production-readiness-review.md) | Core architecture retained; production blocked pending Stage 0 hardening, D-001～D-011, auth/API, privacy, audit, IaC and release evidence |
| 2026-07-23 | [Calendar-sync runbook rehearsal](reviews/calendar-sync-runbook-rehearsal-2026-07-23.md) | Failure → dead-letter → recovery rehearsed as an Emulator test; added `OutboxProcessor.requeue`; all four calendar prerequisites done |
| 2026-07-22 | [Workbench tabs and calendar projection](reviews/workbench-tabs-and-calendar-projection-2026-07-22.md) | Tabbed workbench, in-place note editing, inline case assignment, calendar event ID bound to the appointment, patient/clinic calendar split |
| 2026-07-22 | [UI theme, dialog and flow review](reviews/ui-theme-dialog-and-flow-review-2026-07-22.md) | Opaque nav, custom confirm dialog, patient back-flow, auto/light/warm/dark themes with AA contrast, standards sweep; calendar-test prerequisites documented |
| 2026-07-22 | [UI feedback review and remediation](reviews/ui-feedback-review-and-remediation-2026-07-22.md) | Action feedback made visible at the point of action; booking failures now state the reason; duplicate-account and stale-reschedule guards added |
| 2026-07-21 | [UI/UX audit and rework](reviews/ui-ux-audit-and-rework-2026-07-21.md) | Type scale 17→6, dead styles removed, shell inlined, SEO and calendar export added |
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
