# AI Navigation Map - Beau Essence Appointment Platform

This is the mandatory orientation document for anyone changing this repository.
The project is in Phase 1. The repository contains approved public clinic and
doctor content, but no authorised operational patient, staff, clinical,
payroll or payment records. A static Firebase Hosting preview was separately
authorised in 2026-07 and its last recorded channel expiry was 2026-08-04; its
current remote availability is unverified. The source tree has no routed cloud
backend, active Google Calendar integration or NAS connection; this repository
fact alone does not prove that no remote resource exists.

The 2026-07-23 enterprise review confirmed that the API-only, pure-domain,
transactional outbox architecture can be retained. Stage 0 architecture
hardening and Checkpoint A were completed on 2026-07-24: local contracts,
application-boundary skeletons, patient booking guards, audit v2 and synthetic
Emulator evidence are in place. The project is now at **Stage 1 owner decisions
and governance approval**. D-010 target architecture/SLO was approved on
2026-07-28, and D-006 identity/security was fully approved later that day.
Stage 2 cloud staging still requires a separately reviewed and explicitly
authorised change plan. Neither approval authorises `terraform apply` or proves
the controls/recovery target. Routed booking, production Calendar and real
patient data remain separately decision-gated.

**All 39 owner decision questions were answered on 2026-08-16.** That moved the
project from "waiting for answers" to "reconciling them" — not into Stage 2. The
answers are recorded input, not approval: the returned sheet has no named
approver, approval date, scope or exclusions, which its own approval format
requires, so every D-series status value is unchanged. Four earlier owner answers
are superseded (cancellation cutoff, booking horizon, English version, production
Calendar). Read
`docs/reviews/2026-08-17-owner-decision-reconciliation.md` before treating any
owner statement as settled, and never restate an answer as a legal, medical or
security approval — D-014's clinical-record classification in particular is still
open regardless of the owner's operational direction.

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
8. A synthetic preview deployment requires fresh, explicit authority for the
   exact commit, project, channel and expiry. When authorised, it may deploy
   only static files to the expiring `synthetic-review` channel in
   `beauessence-clinic-staging`. The 2026-07 authority and expired channel are
   not reusable standing authority. Never deploy the live channel or enable a
   Firebase backend under preview authority.

## Repository publication boundary

> **2026-08-17 — the canonical repository is now public.** Verified by API:
> `waydefu/clinic` returns `visibility: public`. The owner made the change
> deliberately and confirmed it should stand, on the assessment that what is
> currently in the repository is publishable. **Rule 1 below therefore no longer
> describes the state of the world**; it is kept because the rest of the section
> — the export discipline, the scanning requirements, the fact that public
> visibility grants no licence, deployment authority or permission to use real
> data — still governs, and because retiring a boundary is an owner decision
> that has not been recorded as such.
>
> What this changes for you in practice: **anything committed here is publicly
> visible immediately, including the full 214-commit history.** The repository
> currently carries the clinic's identity and address, the clinic phone, one
> personal mobile and one personal email in the D-010 incident-contact record,
> two named individuals in the decision register, two real staff photographs,
> and the complete governance record — including the `enforce_admins=false`
> protection state. Treat every future commit as
> a publication, and raise anything that would add personal data rather than
> committing it silently.

This repository, `waydefu/clinic`, is the canonical project
record. The public
[`waydefu/appointment-platform-public`](https://github.com/waydefu/appointment-platform-public)
repository is a separately curated, code-only reference with its own clean Git
history. It is not a backup, fork, deployment target or source of project-stage
authority.

1. Never make the canonical repository public. Never copy or reuse its `.git`
   directory, commits, branches, tags, pull-request metadata or other history
   in the public mirror. There is no automatic synchronization.
2. Move code to the public mirror only through an explicit allowlist export
   into an isolated workspace. Exclude clinic and people content, brand assets,
   portraits, screenshots, UI, internal governance/review/delivery documents,
   deployment identifiers, private URLs, logs, credentials, personal data and
   realistic identity fields.
3. Apply an approved public delta to a fresh clone of the public mirror, inspect
   every changed file, and scan both the candidate tree and the complete public
   Git object/ref set for secrets, personal data and internal identifiers.
4. Before a public pull request, run the public repository's tracked-secret and
   public-safety checks, format/build/lint/tests, production and full dependency
   audits, Gitleaks, TruffleHog and a second fresh-clone verification. Required
   GitHub checks must pass before merge.
5. Public availability does not grant an open-source licence, production
   readiness, deployment authority or permission to use real data. A public
   mirror change cannot alter this repository's Phase or D-series gates.

The dated audit and repeatable release gate are recorded in
`docs/reviews/2026-07-29-sanitized-public-mirror-publication.md`.

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

### Navigation shortcuts (2026-07-31)

The seven documents above establish authority and boundaries. These four answer
"what happens next, and how" without re-deriving it from the plan set. They are
navigation aids, not additional authority: none of them approves anything.

| Question | Document |
| --- | --- |
| What is still unapproved, in what order, and who signs it? | `docs/product/current-execution-and-approval-plan.md` |
| What did the owner actually ask for, and is it built? | `docs/product/owner-requests-consolidated-2026-07-31.md` (OR-01…OR-69 with state and blocking decision) |
| What are the maintainability, performance, identity, retention and sync targets, and where do the numbers come from? | `docs/product/full-project-master-plan-2026-07-31.md` |
| What are the ordered steps, with prerequisite, action, acceptance evidence and rollback? | `docs/product/full-project-execution-book-2026-07-31.md` |
| Which gates were adversarially tested, and what did they miss? | `docs/reviews/2026-08-06-enterprise-audit.md` |
| What did the 2026-08-11 read-only modernization audit find, and which IDs gate implementation? | `docs/reviews/2026-08-11-enterprise-modernization-audit.md` and its handoff record |

### Two facts from the 2026-08-06 audit that change how you work here

**The reachability walk is now fail-closed, and that is deliberate.**
`check:architecture` proves that decision-blocked capabilities cannot be
reached, but it parses imports with a regex, so it only ever sees literal
specifiers. A computed `import(target)` in `main.ts` was demonstrated to leave
the gate green while the target module genuinely loaded at runtime and stayed
declared "unrouted". The gate therefore rejects any module load it cannot
statically resolve. If it blocks you, write a literal specifier and branch on
literals — do not widen the rule, because the inventory's guarantee is exactly
what the rule protects.

**Roles have one source: `packages/domain/src/roles.ts`.** The repository
previously held three incompatible role sets plus a fourth approved baseline.
Do not add a role string literal anywhere else. Note the deliberate deviation
from `docs/architecture/rbac-matrix.md` §6, which names `packages/contracts`:
contracts has no delivery path to the browser, so the canonical set lives in
`domain`, which is vendored under a sha256 manifest (ADR-0004). `physician`
exists with an empty permission list on purpose — D-006 approved the role,
D-014/D-015 still block everything it might do, and granting it any permission
would decide clinical-record reach on the owner's behalf. The browser still
uses the legacy `admin` code; that rename is outstanding.

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
- Prepare reviewed, plan-only Stage 2 changes from the approved D-006/D-010
  targets; do not create or apply cloud resources without a separately reviewed
  and explicitly authorised Stage 2 change plan.

### Must remain disabled

- Any booking controller or public/staff write route.
- Cloud Firestore or Authentication without an approved Stage 2 change plan and
  separate deployment authority; recorded D-006/D-010 decisions are not
  deployment authority.
- Calendar test projection before D-009.
- Surgery/anesthesia/clinical-record persistence, patient money or staff
  settlement amounts before D-014/D-015 and their existing privacy/access
  gates; Calendar-to-system writes before D-016.
- Public booking or real patient data before D-001 through D-005 and D-011 are
  approved, the approved D-006 controls are implemented and verified, and the
  D-010 cloud change has separate deployment authority.
- Case/payroll persistence before D-007 and D-008.
- Any Terraform apply, live-channel deployment or production credential use.

The review evidence is
`docs/reviews/2026-07-23-enterprise-production-readiness-review.md`. It is a
dated baseline, not a substitute for the live decision register.

### Repository security posture — dated facts, not approvals

These are recorded states of the repository itself. Read them before changing a
gate, a workflow or a dependency; do not restate any of them as a decision that
has already been approved.

| Date | Fact | What it does **not** authorise |
| --- | --- | --- |
| 2026-07-30 | Dependency graph and Dependabot alerts enabled on `waydefu/clinic`; automatic submission, security/version/grouped updates stay disabled | It does not authorise automatic upgrade pull requests, alert dismissal or any exception |
| 2026-07-31 | Branch protection applied and verified on `main`: strict required check `Verification evidence`, force push and deletion disabled, the D-013 administrator bypass preserved | Using the bypass still requires running the full gate manually |
| 2026-07-31 | Owner direction: the access-restricted canonical repository stays in the current personal account and is not transferred to an organisation | It is a hosting direction, not permission to weaken SAST |
| 2026-07-31 | The CodeQL workflow was replaced by a Semgrep CE workflow (`.github/workflows/sast.yml`, `scripts/generate-sast-evidence.mjs`, `security/semgrep/`) because a private personal repository cannot upload code-scanning results | **SEC-02 policy was approved on 2026-08-01.** A 2026-08-11 static audit found that the sole required `Verification evidence` job does not depend on the separate SAST workflow. Until `SCM-R01` makes the same-commit SAST result required, describe the state as “approved policy; merge-blocking enforcement pending”, never as CodeQL-equivalent or currently enforced |
| 2026-07-31 | One high `brace-expansion` alert (GHSA-mh99-v99m-4gvg / CVE-2026-14257, CVSS 7.5) has no compatible published fix in the affected older majors. `pnpm-workspace.yaml` already carries `auditConfig.ignoreGhsas` for it, so `audit:prod` and `audit:all` report "1 high (1 ignored)" and still pass | **SEC-03 was approved and then released on the same day (2026-08-01).** The advisory was revised at 2026-07-31T19:37Z to publish a first patched version per major, which met the recorded release condition, so the dependency is pinned per major and the ignore was removed instead of renewed. **The repository now carries no audit exceptions.** ENG-04 still governs any future one: it must be registered in `security/audit-exceptions.json` with an approval ID and expiry, and `check:audit-exceptions` fails on an unregistered, incomplete or expired entry. Never dismiss a Dependabot alert to make a gate green |
| 2026-08-11 | Read-only GitHub API verification at 14:32 +08:00: `main` has no repository ruleset; its only strict required context is `Verification evidence`; `enforce_admins=false` and no required review is configured. Dependabot reports 9 open development-scope alerts (8 medium, 1 low) | This is a dated remote snapshot, not authority to change protection, dismiss alerts, merge PR #14 or describe the new documentation commit as passing before its own checks finish |
| 2026-08-17 | **`SCM-006` is closed and the dependency audit gate is green.** `SCM-R05` (PR #16, implementation `5c99b54`, merge `cf3b87b`) lifted the locked `nanoid` from `3.3.16` to `3.3.18`. The whole fix was four lines of `pnpm-lock.yaml`: `postcss@8.5.20` already asked for `^3.3.16`, so no override was needed and none was added. `main` at `b05da66` now passes all ten jobs, `Verification evidence` included (run `32027293936`). `audit:all` reports 9 advisories — 1 low, 8 moderate, **no high** | It does not close `SCM-R04`. Nine residual advisories remain in dev tooling (`hono`, `postcss`, `re2`, `undici`, via `firebase-tools` and `vite`); they sit below the `high` threshold the two-tier policy sets deliberately, so they do not block, and none of them has an owner, rationale or expiry yet. A green gate today is not a patch SLA |
| 2026-08-17 | Earlier the same day, before `SCM-R05`: PR #14 merged at 09:16:32Z (`22d0f4d`) while `Verification evidence` was **red** for that same `nanoid` high, and `main` inherited the red until `cf3b87b`. The merge is confirmed; **the mechanism is not** — `enforce_admins=false` (the D-013 bypass) was set and the owner account performed the merge, which is consistent with the bypass, but no bypass event is visible through the API | Do not state the bypass as proven, and do not read "the gate went green later" as evidence that merging past a red required check is acceptable practice |

When touching `security/semgrep/**`, `.github/workflows/sast.yml` or
`scripts/generate-sast-evidence.mjs`, remember that the rule files are the
scanner's own positive/negative test fixtures. They deliberately contain unsafe
patterns and are excluded from ESLint; do not "fix" them, and do not weaken a
rule to clear a finding.

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

GRILL ME is a high-fit, manual decision-review technique for this project. It
is not an always-on dependency and should not reopen an answer that is already
recorded with an owner and evidence.

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

### “PONYTAIL” simplification review

PONYTAIL is only conditionally suitable. Use it as a one-time, human-reviewed
simplification pass after correctness and security gates have passed, and only
for low-risk local duplication, naming or control flow. It must not be an
always-on hook, automatic rewrite or reason to reduce explicit evidence.

Do not use PONYTAIL for personal-data/privacy boundaries, authentication,
authorization or RBAC, Firestore Rules or transactions, idempotency, audit,
outbox/retry semantics, payroll, backup/restore, incident response, IaC,
deployment, legal text or governance decisions. In those areas, explicitness
and reviewability take priority over fewer lines.

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
| Public mirror | Explicitly allowlisted, sanitized code-only reference | Canonical source, private history, internal records or deployment authority |

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
| Surgery, clinical timeline, payment/settlement or Calendar inbound | `docs/product/2026-07-28-surgery-follow-up-expansion-plan.md` | Expansion S is plan-only; use D-014～D-016 plus the existing mapped gates, never infer a route from the owner intake |
| Stage 2 identity, MFA, session, IAM or cloud foundation | `docs/architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md` | D-006/D-010 values are approved; plan-only until separate review and deployment authority |
| Monthly close or compensation | Payroll spec + close runbook | Taipei cutoff, immutable lock, adjustment/audit |
| Cloud runtime, IAM, backup or monitoring | Delivery plan Stage 2 + approved D-010 target | Reviewed IaC/change plan only; never apply before Stage 2 authority |
| Replacing browser-local state | Synthetic Web architecture | Contract-compatible API client; no direct Firestore path |
| NAS | New approved ADR | Least privilege, outbox and security review |
| Sanitized public mirror | This publication boundary + `docs/reviews/2026-07-29-sanitized-public-mirror-publication.md` | Explicit allowlist, isolated export, full-history scans, fresh-clone verification and public PR checks |
| An owner request you were handed verbatim | `docs/product/owner-requests-consolidated-2026-07-31.md` | Find its OR number first; most 2026-07-26～27 items are already built, and the unbuilt ones each name the decision blocking them |
| A maintainability, performance, retention or session-parameter target | `docs/product/full-project-master-plan-2026-07-31.md` | Every number there cites its source; change the citation, not just the number |
| Sequencing, acceptance evidence or rollback for any remaining stage | `docs/product/full-project-execution-book-2026-07-31.md` | A step without a rehearsed rollback is not ready to run |
| Finishing a stage, or picking one up from someone else | `docs/reviews/` newest dated handoff record, indexed in `docs/README.md` | A stage is not complete until its handoff record exists. Write it with the §10.4 template in the execution book: real numbers rather than "passed", the defects you hit, and above all the things you did **not** do |
| A blocking check under `scripts/` | The script plus its test | Define behaviour for a clean tree, a dirty tree with deletions and a fresh clone; a gate that crashes reports a false failure |
| SAST workflow, Semgrep rules or evidence generation | `.github/workflows/sast.yml` + `security/semgrep/` | Rule fixtures are intentionally unsafe and ESLint-excluded. SEC-02 policy is approved, but required-check enforcement is pending `SCM-R01`; do not describe a non-required workflow as a merge gate or as CodeQL-equivalent |
| A named ID from the 2026-08-11 modernization audit, or any "fix all of these" set | `docs/reviews/2026-08-11-enterprise-modernization-audit.md` §6 issues and §14 Roadmap | The IDs carry prerequisites (`SCM-R01` needs `SCM-R05`) and each names its own rollback and acceptance. Close the declared set to exhaustion across as many pull requests as it needs — one PR per concern bounds the PR, not the closure — and search for siblings of every failure class you confirm |

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
   decision work and documented synthetic-preview scope listed above. D-006 and
   D-010 target approvals are recorded; Stage 2 still needs its reviewed change
   plan and separate deployment authority.
4. If the task publishes to the sanitized public mirror, stop using the normal
   implementation path and follow the repository publication boundary above.
   Never use a private-repository push, fork or history rewrite as the export
   mechanism.
5. Update executable contract and domain first, then application service,
   repository adapter, worker or web edge.
6. Add focused tests using synthetic opaque identifiers only. Booking changes
   must cover both same-slot contention and same-patient/different-slot
   contention through the explicit guard document.
7. For each write path, prove authentication, authorization, validation,
   idempotency and audit behavior.
8. For each external effect, prove queue/outbox, idempotency, retry,
   dead-letter and runbook coverage.
9. Run the smallest relevant test, then the Phase gate commands. Update the
   decision, architecture, plan and review evidence when a checkpoint closes.
10. When a stage closes, write its dated handoff record into `docs/reviews/` and
    index it in `docs/README.md` before calling the stage done. Use the §10.4
    template in the execution book. Record the real numbers, the defects you
    hit, the local environment traps, and everything you did **not** do — a
    stage summary that only lists successes is not a handoff, and the next
    person pays for it.

## Current commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm check:ui
corepack pnpm format
corepack pnpm verify
corepack pnpm test:rules
corepack pnpm test:e2e
corepack pnpm check:supply-chain
corepack pnpm check:audit-exceptions
corepack pnpm --filter @beauessence/api dev
```

- `pnpm verify` runs the structure check, UI guard, documentation check,
  tracked-secret check, Prettier format check, ESLint, TypeScript builds and
  unit tests. CI runs the same command plus `pnpm test:rules`, Playwright E2E,
  dependency audits, SBOM/license policy and commit-bound evidence on every push
  and pull request.
- `test:unit` also collects `scripts/**/*.test.mjs`, so a blocking check under
  `scripts/` is covered by the same gate as product code. Treat those scripts as
  product code: they decide what reaches `main`, and a crash in one of them
  reports a false failure rather than a real finding.
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
- **Windows path constraint for `test:rules`.** The Firestore Emulator JVM cannot
  resolve a working directory containing non-ASCII characters on a non-UTF-8
  system locale; it exits immediately with
  `FileNotFoundException: <mangled path>\firestore.rules`. Verified on
  2026-07-31: the same emulator, jar and rules file start successfully from an
  ASCII path and fail from a path with CJK characters, and
  `JAVA_TOOL_OPTIONS=-Dsun.jnu.encoding=UTF-8` does not fix it. Work from an
  ASCII path, or map one with `subst` for the run and remove it afterwards. This
  is a local environment constraint only; Linux CI is unaffected, and it is
  never a reason to skip the gate or to call the rules untested.
- Do not deploy, import, export or connect to Firebase cloud during Phase 1
  without an approved change record.

## Phase 1 gate

Phase 1 may create local-only contracts, domain rules, guards and tests. It may
not enable a booking write endpoint until its privacy, appointment-policy and
identity/role decisions are approved and the local transaction, idempotency,
audit/outbox and Rules tests pass. Stage 0 already established the explicit
patient booking guard, the same-patient/different-slot race test, audit v2 and
an application boundary. D-006/D-010 target approvals are recorded, but Stage 2
cloud staging still requires a reviewed change plan and separate deployment
authority; completed technical prerequisites do not bypass them.

## Before production data

- Cloud IAM, Firestore location, backups, retention, monitoring and incident
  response have approved infrastructure reviews.
- Calendar authorization and scopes are approved; patient PII is excluded from
  event content.
- Privacy/legal review approves the data flow and vendor arrangements.
- Migration, rollback and launch checklists exist and have been exercised.
