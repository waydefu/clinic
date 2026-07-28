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
LineID and gender are not collected. D-001 through D-003 and D-006 remain
pending, so the preview must not be relied on to collect real patient data
operationally.

See [docs/roadmap.md](docs/roadmap.md) for what can be built without approval
and what is blocked.

The active technical baseline is the
[production target architecture](docs/architecture/production-target-architecture-2026-07-23.md)
plus the
[production-readiness delivery plan](docs/product/production-readiness-delivery-plan-2026-07-23.md).
Stage 0 architecture hardening and Checkpoint A are complete. The current gate
is Stage 1 owner decisions and governance approval. D-010 target
architecture/SLO was approved on 2026-07-28; D-006 still blocks Stage 2 cloud
staging. The D-010 answer does not itself authorise deployment, and the existing
local, synthetic-only implementation does not authorise a route or cloud
backend.

## Clinic website integration — 2026-07-27

The expiring synthetic preview now includes a responsive clinic website at
`/clinic`, two medical-team profiles and four nasal-functional-medicine pages.
Plastic-surgery and injectable/medical-aesthetic category pages are excluded.
Every clinic appointment call to action enters the existing `/booking` flow,
and the booking header links back to the clinic site. The two surfaces share
the same white, mist-green and deep-forest visual direction.

This is still a static, noindex preview. Clinic information pages collect
nothing; the patient form remains browser-local and must not receive real
patient data. See the
[clinic website and booking integration record](docs/design/clinic-site-integration-2026-07-27.md)
for the route map, content boundary and implementation structure.

## Current UI and delivery baseline — 2026-07-28

The former “latest” 2026-07-23 UI paragraph is historical. The current,
reproducible reference is the
[2026-07-28 UI visual baseline](docs/reviews/ui-visual-baseline-2026-07-28.md):
ten named desktop/mobile screenshots with a hash manifest, fixed synthetic
state and a documented capture environment. It confirms Stage 0/Checkpoint A
has passed, Stage 1 owner decisions are current, `/v1/health` remains the only
routed API controller, and D-006 still blocks Stage 2 after D-010 target
approval.

The 2026-07-28 owner input for surgery scheduling, clinical follow-up, patient
payments, staff settlement and Calendar inbound edits is tracked separately in
the
[Expansion S plan](docs/product/2026-07-28-surgery-follow-up-expansion-plan.md).
It is plan-only, adds D-014～D-016 gates and does not enlarge the current Phase
1 release or enable any route.

At 2026-07-28 17:18 Asia/Taipei, the deployed preview routes `/`, `/booking`,
`/privacy` and `/clinic` all returned HTTP 200 with stable HTML set to
`no-cache` and the preview kept `noindex`. The recorded channel expiry remains
2026-08-04 12:43 Asia/Taipei. This is dated preview evidence, not proof that the
current working tree is deployed or authority for real data, authentication,
Firestore writes or Calendar integration.

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

On the next computer, install Git 2.x, Node `>=24.14.0 <25`, pnpm `11.9.0`
and JDK 21 before running the following commands. Close and reopen PowerShell
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
D-010 target architecture/SLO is approved; D-006 remains pending and therefore
still blocks Stage 2 cloud staging. None of this enables a route or authorises
a cloud deployment.

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
