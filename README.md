# Beau Essence Appointment Platform

Enterprise appointment-platform workspace for Beau Essence Clinic. The future
system will receive bookings through a dedicated website, write the source of
truth through a domain API, and project confirmed changes to Google Calendar
through an idempotent outbox worker. The design keeps a path open for Android,
iOS and a future NAS integration without direct database access.

## Current status: Phase 1 Stage 1 — owner decisions in progress

Phase 0 is complete. The browser prototype covers the full booking flow, and
the Firestore write path — reservation, every state transition, reschedule and
the outbox worker with backoff and dead-lettering — is proven against the local
Emulator. None of it is routed: the Phase 1 gate forbids a booking write
endpoint before the privacy, appointment-policy and role decisions land.

One isolated Firebase project (`beauessence-clinic-staging`) hosts an expiring
static preview. It has no cloud database, backend, authentication, Calendar
connection, service-account credential, social-webhook secret or NAS
connection.

The synthetic patient form currently accepts name, phone, birth month/day with
an optional year, national ID or passport, NHI-card intent, a short patient
note, the approved request/source tags and a conditional optional referrer
name. Those values stay in the visitor's own browser and are never transmitted
to or stored by the clinic. Screen and list views mask identity documents; the
synthetic intake print can show the complete test value for local verification.
LineID and gender are not collected. D-001 through D-003 remain pending; D-006
is approved but not implemented. The preview must not be relied on to collect
real patient data operationally.

**Booking MVP final UI checkpoint (2026-08-22, PR #23):** exact C3
`d9b6965c0e3ae62df33e89744f12c6d7fcc16480` passed all 11 required GitHub jobs,
was deployed only to the expiring `noindex` `synthetic-review` channel and
passed 474/474 online checks. It contains the corrected synthetic Case form and
date-column calendar, a three-step patient flow, dual-field booking lookup and
the synthetic `>20 minutes` self-cancel boundary. The preview expires
2026-08-29 13:08 Asia/Taipei. Payroll remains frozen and Calendar alignment
(007) remains documentation only. This unmerged branch checkpoint does not
change Stage 1, approve D-005 or any other D-series item, enable a production
backend or authorise real data.

See [docs/roadmap.md](docs/roadmap.md) for what can be built without approval
and what is blocked. The
[current execution and approval plan](docs/product/current-execution-and-approval-plan.md)
puts the remaining repository, C0, D-series and C1～C6 approvals in one
plain-language sequence.

## Product capability roadmap — 2026-08-04

The [P0～P7 product roadmap](docs/roadmap.md#產品能力-roadmapp0p7) records what the
product is meant to become, on an axis separate from the Stage 0～6 governance
track. Stage answers *what blocks this*; P answers *what gets built*. The two
are orthogonal and their numbers must not be mixed — this repository already
carries Phase 0/1, Stage 0～6, C0～C6 and Expansion S.

**Two of the eight product phases can proceed today**; the other six are held by
pending owner decisions rather than by engineering capacity.

| | Phase | Blocked by |
| --- | --- | --- |
| ✅ | P0 role convergence and inventory | nothing — D-006 was approved 2026-07-28 |
| ✅ | P1 App Shell and design tokens | nothing (front-end only) |
| ⚠️ | P2 scheduling workspace | D-004 |
| ❌ | P3 Calendar inbound review/sync | D-009 and D-016; ADR-0002 remains authoritative unless a future co-authority design explicitly supersedes it |
| ❌ | P4 surgery and clinical resources | D-014, D-015 |
| ❌ | P5 patient portal rebuild | D-001～D-003, D-005, D-011 |
| ❌ | P6 multi-branch operations | needs a decision that does not exist yet |
| ❌ | P7 LINE LIFF, PWA and apps | D-011 plus new decisions |

Supporting plan-only documents:
[product positioning](docs/product/product-vision.md),
[RBAC matrix](docs/architecture/rbac-matrix.md),
[App Shell and scheduling redesign](docs/design/ui-shell-and-scheduling-redesign-plan.md),
[mobile UX](docs/design/mobile-ux-plan.md),
[bidirectional Calendar sync](docs/architecture/calendar-bidirectional-sync-plan.md)
and the [test strategy](docs/architecture/test-strategy.md).

None of them changes the current Stage, closes a decision, authorises a route or
permits real data. The product positioning is deliberately recorded as a nasal
functional and sleep-breathing clinic rather than a medical-aesthetic one, which
matches the content boundary the clinic site and its tests already enforce.

The active technical baseline is the
[production target architecture](docs/architecture/production-target-architecture-2026-07-23.md)
plus the
[production-readiness delivery plan](docs/product/production-readiness-delivery-plan-2026-07-23.md).
Stage 0 architecture hardening and Checkpoint A are complete. The current gate
is Stage 1 owner decisions and governance approval. D-010 target
architecture/SLO and D-006 identity/security were approved on 2026-07-28.
Stage 2 cloud staging still requires a reviewed, explicitly authorised change
plan. Those answers do not themselves authorise deployment, and the existing
local, synthetic-only implementation does not authorise a route or cloud backend.

## Repository publication boundary — 2026-07-29

This access-restricted repository remains the canonical project record. The
public
[`appointment-platform-public`](https://github.com/waydefu/appointment-platform-public)
repository is an independently curated, code-only reference with clean public
history; it is not an automatic mirror, backup, release branch or deployment
target.

The public reference contains only an allowlisted appointment transaction
boundary and synthetic tests. It deliberately excludes the clinic website and
UI, brand and people assets, identity intake, scheduling/follow-up/payroll
policy, internal governance and delivery records, deployment identifiers,
private URLs, credentials, logs, personal data and the canonical Git history.
Future updates must be exported without the private `.git` data, audited again,
and merged through the public repository's required checks.

Publication does not change the current Stage 1 status, close a D-series
decision, authorise a backend or route, establish production readiness, or
permit real data. The public reference is viewable but has no open-source
licence. See the
[sanitized public mirror publication record](docs/reviews/2026-07-29-sanitized-public-mirror-publication.md)
for the initial audit evidence and repeatable update gate.

The private canonical repository enabled its dependency graph and Dependabot
alerts on 2026-07-30. Automatic dependency submission, security/version update
pull requests and grouped updates remain disabled. The initial inventory was
four open development-scope alerts (one high and three moderate); none was
dismissed or automatically changed. See the
[private Dependabot alert enablement record](docs/reviews/2026-07-30-private-dependabot-alert-enablement.md)
for the exact setting boundary and evidence.

The 2026-08-01 repository-security delivery fixed the three recorded moderate
advisories and pinned patched `brace-expansion` versions after its advisory was
revised; the source tree carries no active audit exception. A read-only GitHub
API check at 2026-08-11 14:32 +08:00 found **9 open development-scope
Dependabot alerts** on `main` (8 medium, 1 low); this dated remote inventory is
separate from source-tree audit exceptions and requires `SCM-R03` triage.
`main` has no repository ruleset; branch protection has one strict required
context, `Verification evidence`, with force pushes and deletion disabled,
`enforce_admins=false`, and no required review. Since `SCM-R01` on 2026-08-18
that required job aggregates five results, Semgrep CE among them, all bound to
the same candidate commit — so SEC-02 is an approved policy whose merge-blocking
enforcement has been demonstrated: an intentional-failure pull request turned
`Verification evidence` red and was blocked. Semgrep CE is still not represented
as equivalent to CodeQL cross-file analysis.

## Clinic website integration — 2026-07-27

The source implementation includes a responsive clinic website at `/clinic`,
two medical-team profiles and four nasal-functional-medicine pages. A new
exact-C3 synthetic preview was separately authorised and verified on
2026-08-22; it is scheduled to expire on 2026-08-29 13:08 Asia/Taipei.
Plastic-surgery and injectable/medical-aesthetic category pages are excluded.
Every clinic appointment call to action enters the existing `/booking` flow,
and the booking header links back to the clinic site. The two surfaces share
the same white, mist-green and deep-forest visual direction.

The authorised presentation remains static and noindex: clinic information
pages collect nothing, while the patient form is browser-local and must not
receive real patient data. Preview availability grants no production or
real-data authority. See the
[clinic website and booking integration record](docs/design/clinic-site-integration-2026-07-27.md)
for the route map, content boundary and implementation structure.

## Current UI and delivery baseline — 2026-08-22

Earlier UI paragraphs and dated screenshot sets remain historical reference
only. The current reproducible reference is the
[2026-08-22 UI visual baseline](docs/reviews/ui-visual-baseline-2026-08-22.md):
13 named desktop/mobile screenshots with a hash manifest, fixed synthetic state
and a documented capture environment. It covers the final workbench calendar
and Case layout, booking Steps 1–3, privacy dialog, dual-field lookup,
cancellation confirmation/telephone fallback and success result. It does not
change the Stage 1 decision gate, route a production API or authorise real data.

The 2026-07-28 owner input for surgery scheduling, clinical follow-up, patient
payments, staff settlement and Calendar inbound edits is tracked separately in
the
[Expansion S plan](docs/product/2026-07-28-surgery-follow-up-expansion-plan.md).
It is plan-only, adds D-014～D-016 gates and does not enlarge the current Phase
1 release or enable any route.

The approved D-006 controls are translated into a plan-only
[Stage 2 identity and cloud change plan](docs/architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md);
no identity or cloud implementation has started.

At 2026-07-29 17:06 Asia/Taipei, the `synthetic-review` channel was redeployed
from commit `40e6255`; all 452 remote checks passed against
`https://beauessence-clinic-staging--synthetic-review-gpt86j36.web.app`. The
preview remains `noindex`, uses synthetic browser-local state only and expires
on 2026-08-05 17:06 Asia/Taipei. This is dated preview evidence, not authority
for real data, authentication, Firestore writes, Calendar integration or a
live/production deployment.

## Start here

1. Read [AGENTS.md](AGENTS.md) for mandatory guardrails, task routing and the
   private-to-public repository boundary.
2. Read the [Roadmap](docs/roadmap.md) and
   [Phase 1 execution plan](docs/phase-1-execution-plan.md) for the current
   position, permitted work and prohibitions.
3. Check the
   [Phase 1 decision register](docs/product/phase-1-decision-register.md);
   formal clinic approvals are recorded only there.
4. Use the
   [current execution and approval plan](docs/product/current-execution-and-approval-plan.md)
   for the plain-language next-action order and the consolidated approval list.
5. Use the
   [production target architecture](docs/architecture/production-target-architecture-2026-07-23.md)
   for technical boundaries and the
   [production-readiness delivery plan](docs/product/production-readiness-delivery-plan-2026-07-23.md)
   for implementation order.
6. Read the
   [enterprise readiness review](docs/reviews/2026-07-23-enterprise-production-readiness-review.md)
   for the evidence baseline and unresolved findings.
7. Use [docs/README.md](docs/README.md) — the canonical index of every
   architecture, approval, runbook and review document.
8. Before changing the public reference, read the
   [sanitized public mirror publication record](docs/reviews/2026-07-29-sanitized-public-mirror-publication.md)
   and repeat its release gate.

## Commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
corepack pnpm verify
corepack pnpm test:rules
corepack pnpm test:e2e
corepack pnpm capture:ui
```

These are explicit setup and verification commands, not progress-inspection
commands. To confirm project status, read Git history/remote refs and the
current roadmap first. Do not run pnpm merely to produce a status report. If
`node_modules` is absent or incomplete, or `corepack` is unavailable, stop and
fix the machine setup deliberately; pnpm can otherwise begin an implicit
dependency install. On a copied or moved workspace, use the fresh-clone
procedure below before running any package command.

Before changing computers, commit the intended changes, record the exact branch
name and push that branch:

```powershell
$branch = git branch --show-current
git status
git push -u origin $branch
```

On the next computer, install Git 2.x, pnpm `11.9.0` and JDK 21. For the dated
2026-08-11 verification baseline use Node `24.18.0`; the repository engine
range still admits older 24.x patches and CI still floats the major, which is a
known release blocker tracked by `SCM-R02`, not a security floor. Once
`SCM-R02` lands, use the exact patched Node version or image digest recorded by
CI/runtime instead of copying this dated value. Close and reopen PowerShell
after installation so the updated `PATH` and `JAVA_HOME` are loaded. Clone the
branch that was just pushed into a folder owned by the current computer's user:

```powershell
$branch = 'main' # Replace this with the exact branch pushed above.
git clone --branch $branch https://github.com/waydefu/clinic.git
Set-Location .\clinic
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
corepack pnpm verify
corepack pnpm test:rules
corepack pnpm test:e2e
```

For an existing clone on the next computer, first make sure it tracks all
remote branches with `git remote set-branches origin '*'`, then use
`git fetch --prune`, switch to the same branch and run `git pull --ff-only`;
do not reclone over that working tree. This repairs clones created by the older
`--single-branch` instruction. This access-restricted repository may prompt for
a GitHub browser sign-in through Git Credential Manager. HTTPS removes the SSH
host-key step but does not bypass GitHub authorization.

Never copy `.git`, `node_modules`, a pnpm store or the Playwright browser cache
between computers or drives; recreate them from the repository and package
lock. Their ownership metadata, hardlinks and junctions can retain the old
computer's SID or absolute path. JDK 21 is required only by the local Firestore
Emulator gate. See
[Phase 0 local development](docs/phase-0-local-development.md#moving-between-computers)
for the complete handoff and local-state rules.

`pnpm verify` runs the structure check, the UI guard, the documentation check,
the Prettier format check, TypeScript builds, ESLint and unit tests.
`pnpm test:rules` starts a disposable local Firestore Emulator and runs the
booking transaction, appointment transition, outbox worker and deny-by-default
suites. `pnpm test:e2e` runs the packaged site in the machine-local Playwright
Chromium. CI runs all three gates on every push and pull request. None uses a
cloud Firebase project.

To see the pages, start the local site — no API window is needed, because the
browser holds its own state. See [apps/web/README.md](apps/web/README.md).

The public-facing preview entry points are:

- `/clinic` — clinic home, medical team and nasal-functional-medicine pages;
- `/booking` — the existing synthetic patient appointment flow; and
- `/` — the local operations workbench, hidden from the online patient
  navigation.

## Phase 1 gate

Phase 1 does not authorise a booking route, a cloud Firebase backend or Google
Calendar. The sole cloud exception is the recorded expiring static Hosting
preview.

Stage 0 completed contract/domain alignment, the API application-boundary
skeleton, the explicit patient booking guard, audit v2 and synthetic Emulator
tests; Checkpoint A passed on 2026-07-24. The project is now at Stage 1, where
named owners must approve or defer the recorded policy and governance inputs.
D-010 target architecture/SLO and D-006 identity/security are approved.
Stage 2 cloud staging still requires a reviewed change plan plus separate
deployment approval. None of this enables a route or authorises a cloud
deployment.

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
