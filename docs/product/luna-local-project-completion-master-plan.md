# Luna remaining-work playbook (Grok rests)

**Type:** current local execution book. Not a production grant.
**Audience:** GPT-5.6 Luna on the owner’s laptop. **Start**
[luna-local-authorized-playbook.md](luna-local-authorized-playbook.md).
**Status:** `LUNA_SOLE_EXECUTOR` / `GROK_RESTS` (2026-09-12). Luna does
the remaining work. Grok does not take further engineering on this
delivery. This is not production.
**Does not authorize:** production, real patient data, official DNS, live
Hosting, production Calendar, or routing `/v1/bookings`.

Luna is the remaining executor: identity last-mile **and** remaining
engineering up to each phase HARD STOP. Do not wait for a cloud agent.
Do not reconstruct two months of chat. Do not treat dated reviews as
live status. Do not use sub-agents.

Companion contracts in this file:

- [Luna local authorized playbook](luna-local-authorized-playbook.md) — **Luna starts here**
- [Session start](#1-session-start-do-not-reaudit-the-whole-project)
- [Checkpoint / resume](#2-checkpoint--resume-contract)
- [Browser ownership](#3-browser-ownership-contract)
- [Authority map](#4-remaining-authority-map)
- [Stale documents](#5-stale-documents--do-not-trust-as-live)
- [Phase dependency graph](#6-phase-dependency-graph)
- [Local identity / credential safety](#8-local-identity--credential-safety--required)
- [Work classification](#9-work-classification-luna-sole-executor)
- [PROJECT_COMPLETE](#project_complete-definition)

---

## 0. How Luna works this book (Grok rests)

### Goal

Luna finishes remaining delivery from current `main` through each
phase HARD STOP. Grok rests. Do not mix authority layers or guess
policy.

### Ownership (normative)

| Who | Owns | Must not |
| --- | --- | --- |
| **Luna** (owner laptop) | All remaining cards and phases in the [authorized playbook](luna-local-authorized-playbook.md) and this map | Production, DNS, live Hosting, real data, `/v1/bookings` route, `clinic-production` config, `terraform apply` without a new exact-SHA packet, inventing D-series approval |
| **Grok** | Nothing further on this delivery (`GROK_RESTS`) | Resume engineering unless the owner explicitly un-rests Grok |
| **Human** | Password, 2FA, security key, CAPTCHA, payment, named D-series approval | Paste secrets into chat |

Luna’s first file is the playbook. After identity Card 8 PASS, open the
**current phase** section here and do the Engineering actions (Luna).

### Operating model

1. **Luna is the sole remaining executor.** No sub-agents. No waiting
   for Grok. Playbook cards in order; then the next phase.
2. **Fresh-verify necessary state** at session start. Expand the audit only
   when [§1](#1-session-start-do-not-reaudit-the-whole-project) says so.
3. **Auto-continue** on engineering defects (see [§7](#7-automatic-continuation-vs-true-human-blockers)).
4. **Stop for humans** only on true blockers (same section). Ask one minimal
   question. Never ask the user to paste secrets, tokens, or private keys
   into chat.
5. **Worktrees.** Prefer `.claude/worktrees/<topic>/`. Never commit to
   `main`. Luna branches `cursor/luna-<topic>` from `origin/main`.
6. **Secrets stay local.** gcloud CLI identity, ADC, Firebase CLI, browser
   Google session, and Terraform target are **five separate states**. Never
   paste tokens, refresh tokens, ADC JSON, or service-account keys into chat,
   the repository, or a committed evidence file.

### What this file is not

- Not production, DNS, live Hosting, or real-data authority.
- Not a route enablement.
- Not D-series approval.
- Not `terraform apply` authority.
- Not a replacement for `AGENTS.md` Safety Floor or
  `docs/product/phase-1-decision-register.md`.

If this file and live Canon disagree, **live Canon wins**, then reconcile
this file in the same PR that records the new evidence.

---

## 1. Session start (do not re-audit the whole project)

### Luna (sole remaining executor)

Open
[luna-local-authorized-playbook.md](luna-local-authorized-playbook.md)
and run Card 0. Rebuild the
[ACCOUNT_CONTEXT_SNAPSHOT](#81-account-context-snapshot) as Card 7.
Do not treat `gcloud auth list` as proof of ADC. After Card 8 PASS,
open the **current phase** section here. Do not start production, DNS,
or `/v1/bookings`.

From the worktree root:

```bash
git fetch origin main
git rev-parse origin/main
git log -1 --oneline origin/main
test -f output/evidence/luna-checkpoint.txt && cat output/evidence/luna-checkpoint.txt
```

Then read **only**:

1. `output/evidence/luna-checkpoint.txt` if it exists.
2. `docs/architecture/stage-2-gate-status.json`
3. `docs/product/phase-1-decision-register.md` (status table + latest dated
   addendum only)
4. `apps/api/src/app.module.ts` (must not import `AppointmentController`,
   `BookPilotModule`, `BookPilotController`, or `CalendarWatchController`
   unless the current phase has explicit routing authority)
5. This file, the **current phase** section only

**Expand to a full Phase 0 re-verify if and only if any of these are true:**

- `origin/main` SHA ≠ checkpoint `BASE MAIN`
- checkpoint missing, unreadable, or contradicts the four files above
- `stage-2-gate-status.json` changed
- a cloud mutation happened outside this checkpoint
- formal booking or Calendar watch became reachable
- a D-series status in the register changed

**Do not** reread the 2026-07/08 master plans, the August booking-preview C6
reviews, or the C0 owner-direction reviews unless the current phase names
them.

### Grok (dormant — `GROK_RESTS`)

Do not start a Grok engineering session. If the owner later un-rests
Grok in writing, fetch `origin/main`, read the checkpoint, and take only
the named package. Do **not** rebuild `ACCOUNT_CONTEXT_SNAPSHOT` on the
cloud VM.

---

## 2. Checkpoint / resume contract

At the end of every major phase, and at the end of every session, write:

`output/evidence/luna-checkpoint.txt`

Also paste the same block into the session reply. Do not commit this file
(`output/evidence/` is gitignored). When a phase changes Canon, also add a
dated review under `docs/reviews/` and index it in `docs/README.md` §7.

```text
PROJECT: waydefu/clinic
BASE MAIN: <origin/main SHA>
WORK BRANCH: <cursor/luna-…>
HEAD: <worktree SHA>
CURRENT PHASE: <0|A|B|C|D|E|F|G|H|I|J|K|L>
COMPLETED: <phase ids>
IN PROGRESS: <exact work package>
BLOCKERS: <none | HUMAN BLOCKER id>
AUTHORITY: PRODUCTION=NO REAL_DATA=NO DNS=NO LIVE_HOSTING=NO PROD_CALENDAR=NO BOOKING=<UNROUTED|...>
CLOUD STATE: isolated=beauessence-clinic-stg-c1a01 staging=CAL-PILOT+preview-only production=NOT_AUTHORIZED
IDENTITY STATE: gcloud_account=<email-or-UNVERIFIED> gcloud_config=<clinic-staging|clinic-production|other> adc_source=<user-adc|impersonation|GAC-env|UNVERIFIED> firebase_account=<email-or-UNSET> gac_env=<unset|path-only>
BROWSER STATE: profile=<clinic-synthetic|clinic-production> account=<verified|unverified> mix=NO
TEST STATE: <gates PASS/FAIL/NOT_RUN/UNAVAILABLE>
NEXT EXACT ACTION: <one sentence + command or URL>
DO NOT REOPEN: C0-C6 synthetic slices; PR #112; vendor comment-drift on 16e3bfc
```

Resume rule: the next session does **exactly** `NEXT EXACT ACTION`. It does
not reopen `DO NOT REOPEN`.

---

## 3. Browser ownership contract

Browser is Luna’s surface when [§9](#9-work-classification-luna-sole-executor)
classes the work `LOCAL_*`. Luna owns settings, profiles, and
verification. The human only performs unavoidable account login / 2FA
when the OS or IdP blocks automation. Grok does not drive the owner’s
Chrome (`GROK_RESTS`).

### 3.1 Bootstrap

| Item | Rule |
| --- | --- |
| Primary browser | Google Chrome (current stable). Secondary: Firefox. Safari/WebKit for Phase H/I and `e2e-patient-portal`. |
| Profiles | `clinic-synthetic` (default, `LOCAL_NOW`). Do **not** create `clinic-production` until production is authorised (`LOCAL_LATER`). Never use the owner's personal profile. |
| Confirm account | Chrome → chrome://settings/people and https://myaccount.google.com/ — the Google account must be the clinic/dev account for synthetic work. Screenshot the email domain only; do not paste refresh tokens. |
| Session mix | One profile per environment. No simultaneous synthetic + production tabs in one profile. Sign out before switching. |
| Cookies | Keep first-party. Allow third-party cookies only for Google OAuth/Identity Platform on the synthetic profile. Clear site data if a session leaks across projects. |
| Popups / redirects | Allow popups for accounts.google.com, firebase.google.com, console.cloud.google.com. Block unknown popups. |
| localhost | Allow `http://127.0.0.1` and `http://localhost` for the API (`127.0.0.1` bind is default). Do not set `ALLOW_NON_LOOPBACK_BIND` unless a named packet requires it. |
| clipboard | Permit for GCP/Firebase Console copy of **non-secret** resource names. Never copy private keys. |
| notifications | Default deny. Enable only for a named monitoring check. |
| camera / microphone / location | Deny. Not required for this product. |
| DevTools | Open Console + Network on every UI gate. Preserve log. Disable cache while DevTools is open for Hosting/CSP checks. |
| cache / service worker | Application → Service Workers → unregister if a stale PWA/Hosting SW masks a deploy. Then hard reload. |
| local HTTPS | Not required for loopback API. Required later for production cookie/`__session` Secure checks. |
| test vs real | Playwright uses the repo test profile / storageState fixtures. Real Google login stays in `clinic-synthetic` / `clinic-production` Chrome profiles, never in committed fixtures. |

### 3.2 Browser vs CLI

If the same mutation can be done reliably with Terraform, gcloud, Firebase
CLI, or an API, **use the reproducible CLI / IaC**. Browser Console is for
interactive OAuth, 2FA, account consent, billing/payment confirmation,
Console-only settings, visual read-back, and ownership confirmation. Do
not recreate SHA-gated infrastructure by clicking Console.

Every browser mutation:

1. Fresh-verify Google account in the correct Chrome profile.
2. Fresh-verify project id / site / calendar name in the page.
3. Execute.
4. Reload and read-back the confirming field.
5. Re-check the same fact with CLI/API.
6. Store evidence (no secrets).

A Console “success” toast is not completion evidence.

### 3.3 Automation rules

- Prefer accessible role, accessible name, label, visible text, URL, or a
  stable test contract (`getByRole` / `getByLabel` style). Let the
  automation framework wait for the control to be actionable.
- Do not use absolute screen coordinates, brittle CSS chains, DOM
  nth-child, or arbitrary sleep as the primary selector.
- Before any destructive Console action (delete, disable, IAM, DNS, billing):
  read-back **project id, account email, resource name, region**.
- After every mutation: reload, read-back, screenshot the confirming field.
- On failure, save screenshot, console errors, failed network requests, and
  a trace **before** retrying. Do not blind re-click.
- Record Console errors and failed Network requests (status ≥ 400) as FAIL
  unless the current packet names them as expected (example: unrouted
  `POST /v1/bookings` must be 404).
- Any UI that looks like production (custom domain, live Hosting channel,
  real calendar name, real patient strings): **HARD STOP** and check
  authority before continuing.

### 3.4 UI verification matrix (every UI gate)

Cover all of: desktop (≥1280), tablet (~768), mobile (~390), 320px edge,
keyboard-only, browser console, network, responsive reflow, visual
appearance, accessibility names/roles, error / loading / empty states.

**Visual bar:** usable-but-ugly is FAIL. Fail also for: cramped layout,
broken hierarchy, engineering-demo chrome, inconsistent type, muddy colour,
heavy nested cards, confused primary/secondary buttons, dirty alignment,
mobile that looks like a squashed desktop.

**Do not** infinite-redesign. Stay inside `docs/design/ui-ux-rules.md`
R-1–R-26, existing tokens, and Boutique Clinical Command. Fix hierarchy,
spacing, type, colour, and alignment. Do not start a new design system.

---

## 4. Remaining authority map

Keep these layers separate. Completing one never implies the next.

| Layer | Live meaning after PR #112 | Unlocks |
| --- | --- | --- |
| Owner product direction FS-001 / C0-DIR / CAL-SYNC-DIR | recorded 2026-09-11 | product scope freeze; **not** DNS, **not** production Calendar |
| Engineering C0 | `stageSlices.C0=completed` | closed; do not reopen |
| C1～C6 synthetic | `completed` + `granted` on `beauessence-clinic-stg-c1a01` | isolated synthetic foundation only |
| D-006 / D-010 | approved policy / target architecture | not deploy; not `/v1/bookings` |
| D-001～D-005, D-011 | pending (owner input ≠ approval) | public booking, privacy publication, production URL |
| D-007 / D-008 | pending; payroll close/adjust **deferred**; FS-001 hides payroll | no assignment/payroll persistence |
| D-009 / D-016 production | pending | production Calendar in/out |
| CAL-PILOT | synthetic-only, expiry 2026-11-28 | dedicated allowlisted calendars; not production |
| D-012 | approved preview-scope only | NHI mark outside clinic domain still gated |
| D-013 | approved | required CI on `main` |
| D-014 / D-015 | pending; money/clinical **deferred** by FS-001 | no surgery/anesthesia/money persistence |
| Formal booking | `IMPLEMENTED` / `UNROUTED` | still 404 at `/v1/bookings` |
| `events.watch` | helpers exist; `CalendarWatchController` **UNROUTED** | not on AppModule |
| Production / real data / official DNS / live Hosting | `NOT_AUTHORIZED` | Phase E–J only after fresh exact-SHA authority |
| GC-001 | repo may stay public | not production, not secrets, not licence |

Two different “C6” names exist. Do not mix them:

| Name | What it is | Status |
| --- | --- | --- |
| Stage 2 C6 | isolated synthetic integration slice | `completed` / `granted` / booking UNROUTED |
| Booking-preview C6 | 2026-08-23 Hosting preview of the public site UI | dated evidence; not Stage 2 C6 |

Forbidden project for C1～C6 work: `beauessence-clinic-staging`
(`scripts/isolated-c1-project-id.mjs`). That project is CAL-PILOT +
synthetic preview only.

---

## 5. Stale documents — do not trust as live

If a narrative says “C0 not closed”, “C1 not_granted”, “C2～C6 pending”,
or “Stage 1 has not passed C0”, **ignore that sentence**. Live machine
status is `docs/architecture/stage-2-gate-status.json`. Reconcile the
narrative in Phase A; do not roll machine status backwards.

| File | Why stale as live instruction | Use instead |
| --- | --- | --- |
| `docs/product/current-execution-and-approval-plan.md` | Written as Stage 1 / C0-not-closed execution path | **the authorized playbook** then **this file** for Luna’s remaining map; keep it as the human approval-packet index |
| Register 2026-08-16 “next C0 gate / does not unlock Stage 2” prose | C0 and synthetic C1～C6 closed in PR #112 | register status table + `stage-2-gate-status.json` |
| `docs/reviews/2026-09-11-c0-engineering-acceptance.md` | Dated; records C2～C6 `not_granted` **at that hour** | dated evidence only |
| `docs/reviews/2026-09-11-c0-owner-direction-reconciliation.md` | Dated; C0 was `revise` then | dated evidence only |
| `docs/security/technical-security-decision-draft-2026-08-23.md` | Says C0 stays `revise` | draft; not live C0 |
| `docs/architecture/infrastructure-and-operations-plan-2026-07-24.md` | “no terraform apply” — true for **production**, false for isolated C1～C6 | production still plan-only |
| `docs/roadmap.md`, `docs/phase-1-execution-plan.md`, 2026-07-31 master/execution books, frozen VERIFIED STAGING v1.3 | Pre-PR #112 sequences | this file |
| `docs/reviews/2026-08-23-booking-final-c6-*` | Booking-preview C6, not Stage 2 C6 | UI visual reference only |
| `docs/state/current.md` | Generated projection | regenerate; never treat as Canon |

Live Canon for this plan:

- `AGENTS.md` Safety Floor
- `docs/product/phase-1-decision-register.md`
- `docs/architecture/stage-2-gate-status.json`
- `docs/architecture/first-stage-c0-authority.md`
- `docs/architecture/first-stage-c1-c6-execution.md`
- `apps/api/src/app.module.ts`
- `apps/api/unrouted-inventory.json`
- `packages/domain/src/roles.ts`

---

## 6. Phase dependency graph

Phases 0 and A–L are **Luna’s remaining delivery map** (`LUNA_SOLE_EXECUTOR`).
Each phase still has its own HARD STOP. Grok does not walk this graph
(`GROK_RESTS`).

```text
Phase 0 (fresh verify + canon reconcile)
  └─► A consolidation (docs/debt classify; no production)
        └─► B remaining D-series packets
              ├─► C formal booking (needs D-001..D-005 + D-006 evidence;
              │     D-011 before public UX URL)
              ├─► D production Calendar (needs production D-009 + D-016;
              │     independent of booking route, but cutover coordinates
              │     with G)
              ├─► E production infrastructure (needs D-010 deploy authority
              │     + D-001..D-003 before real data lands)
              │     └─► F DNS / domain / Hosting (needs D-011 URL + DNS
              │           ownership authority)
              │           └─► G data cutover (needs real-data authority;
              │                 never copies prod data into synthetic)
              └─► H UI/UX final pass (can start on synthetic; production
                    pass repeats after F)
                    └─► I TW-05 human accessibility
                          └─► J production release (all prior PASS +
                                explicit production authority)
                                └─► K post-launch
                                      └─► L PROJECT_COMPLETE
```

Do not start C routing, D production Calendar, E production apply, F DNS,
or G real-data movement because A or B “looks ready”. Each has its own
HARD STOP.

Expansion S (D-014/D-015 clinical/money) stays **out of Phase 1 delivery**.
FS-001 hides payroll, formal medical records, surgery/anesthesia, and
settlement. Luna does not implement them unless the register changes.

---

## 7. Automatic continuation vs true human blockers

### Auto-continue (do not ask the user)

Coding bug, test fail, lint, type error, UI/CSS defect, browser console
error, responsive bug, Terraform syntax, CI fail, emulator fail, Playwright
fail, broken docs link, format drift, generated `docs/state/current.*`
stale after INDEX change.

Loop: fix at the owning boundary → add/adjust the smallest regression test
→ re-run the covering gate → continue.

### True human blockers (minimal question only)

Legal decision, medical policy, privacy publication, production authority,
real-data authority, production Calendar authority, DNS ownership,
unavoidable login/2FA, billing ownership / clinic project transfer,
irreversible high-risk mutation.

Question template:

```text
HUMAN BLOCKER
PHASE:
DECISION OR RESOURCE:
ONE QUESTION:
WHY I CANNOT PROCEED:
WHAT I WILL NOT DO UNTIL ANSWERED:
SAFE OPTIONS (if any):
```

Do not ask the human to choose among engineering implementations when a
domain planner, ADR, or existing packet already decides it.

---

## 8. Local identity / credential safety — required

Luna must not treat “a Google account is signed in” as one state.

Official sources were **re-fetched 2026-09-11** (page “last updated”
dates below). Community posts are not Canon.

| Source | What it authorises in this file |
| --- | --- |
| [Set up ADC for a local development environment](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment) (updated 2026-09-10) | Local ADC is associated with the **user account**, not the gcloud CLI configuration. Changing gcloud configuration does not change ADC. Prefer user ADC, then impersonation; a service-account key only if those are impossible. |
| [How Application Default Credentials works](https://cloud.google.com/docs/authentication/application-default-credentials) (updated 2026-09-10) | ADC search order: (1) `GOOGLE_APPLICATION_CREDENTIALS` (2) the well-known file from `gcloud auth application-default login` (3) metadata server. “The credentials you provide to ADC by using the gcloud CLI are distinct from your gcloud credentials.” Service-account keys “create a security risk and are not recommended.” |
| [Authenticate for the gcloud CLI](https://cloud.google.com/docs/authentication/gcloud) | `gcloud init` / `gcloud auth login` authorise the **gcloud CLI only**. Client libraries and Terraform use ADC, not this page. |
| [HashiCorp: Build infrastructure (GCP)](https://developer.hashicorp.com/terraform/tutorials/gcp-get-started/google-cloud-platform-build) | Local Terraform auth is `gcloud auth application-default login`. The Google provider then uses ADC automatically. |
| [Firebase CLI](https://firebase.google.com/docs/cli) | Local: `firebase login`, `login:list`, `login:use`. Legacy `FIREBASE_TOKEN` / `login:ci` is “less secure than Application Default Credentials and is no longer recommended.” |
| [Playwright locators](https://playwright.dev/docs/locators) | Prefer `getByRole` / `getByLabel` / user-facing attributes; locators auto-wait. Fail with screenshot/trace, not coordinate clicks. |

`gcloud auth login --update-adc` can write an ADC file in the same browser
flow. It still does **not** bind ADC to the active gcloud configuration.
After any configuration switch, re-verify ADC. Prefer the explicit
`gcloud auth application-default login` so the two stores are never treated
as one.

### 8.1 Account context snapshot

Before any GCP / Firebase / Terraform / Console mutation, rebuild this
locally. Write it to `output/evidence/account-context-snapshot.txt`
(gitignored). Redact emails to domain if the file might be pasted. Never
commit it. Never paste tokens or JSON keys.

```text
ACCOUNT_CONTEXT_SNAPSHOT
environment: <synthetic-isolated | cal-pilot-staging | production | unknown>
current authority: <packet + SHA or NOT_AUTHORIZED>
gcloud configuration:
gcloud identity:
gcloud project:
organization:
folder:
billing account: <present/absent; do not commit the id unless required>
ADC identity / source: <user-adc | impersonation | GAC-env | missing>
GOOGLE_APPLICATION_CREDENTIALS: <unset | path-only>
Firebase CLI account:
Firebase project:
browser Google account / Chrome profile:
Terraform target dir / var.project_id:
CLI + browser + Terraform agree: <yes | NO-HARD-STOP>
```

Read-only discovery (values stay in the terminal):

```bash
gcloud auth list
gcloud config configurations list
gcloud config list
gcloud config get-value account
gcloud config get-value project
printf 'GAC=%s\n' "${GOOGLE_APPLICATION_CREDENTIALS:-unset}"
gcloud auth application-default print-access-token >/dev/null \
  && echo ADC_TOKEN_OK \
  || echo ADC_MISSING
gcloud projects list
gcloud billing accounts list
gcloud organizations list
# Official: folders list requires exactly one of --organization or --folder.
# https://cloud.google.com/sdk/gcloud/reference/resource-manager/folders/list
# An empty org list is ORG_VISIBLE=no (missing
# resourcemanager.organizations.get / folders.list, or no-org account).
# That is not an identity failure. Skip folders list; read project parent.
ORG_ID="$(gcloud organizations list --format='value(name)' | awk 'NR==1')"
if [ -n "$ORG_ID" ]; then
  gcloud resource-manager folders list --organization="$ORG_ID"
  # Descend only when a child folder is the parent:
  # gcloud resource-manager folders list --folder="$FOLDER_ID"
else
  echo ORG_VISIBLE=no
fi
gcloud projects describe beauessence-clinic-stg-c1a01 \
  --format='yaml(projectId,parent)'
firebase login:list
firebase projects:list
```

Do **not** print access tokens into the session. `print-access-token`
must redirect to `/dev/null` except when debugging locally with the
owner present.

If any row is missing, mixed, or disagrees: **read-only only**. No
apply, no IAM change, no DNS, no Hosting.

### 8.2 gcloud CLI identity

`gcloud init` / `gcloud auth login` authorize the **gcloud CLI**. They
do not set ADC.

```bash
gcloud auth list
gcloud config configurations list
gcloud config list
gcloud config get-value account
gcloud config get-value project
```

Prefer named configurations. Do not bounce one `default` configuration
between staging and production. Create **only** the synthetic config now:

```bash
gcloud config configurations create clinic-staging   # once if missing
gcloud config configurations activate clinic-staging
```

Do **not** run `gcloud config configurations create clinic-production`
while production is `NOT_AUTHORIZED` (`LOCAL_LATER`). One fewer
production-shaped config means one fewer mis-switch. After every
`configurations activate`, rebuild the snapshot. Activating a
configuration does **not** switch ADC.

Before mutation confirm: ACCOUNT, PROJECT, CONFIGURATION, ENVIRONMENT,
AUTHORITY. CLI, browser Console, and Terraform `project` must match.

### 8.3 Application Default Credentials

Terraform Google provider, Google client libraries, and (in CI/headless)
Firebase CLI consumers use ADC, not `gcloud auth list`.

Local user ADC:

```bash
gcloud auth application-default login
```

If architecture already approved impersonation (preferred over a JSON
key):

```bash
gcloud auth application-default login \
  --impersonate-service-account SERVICE_ACCT_EMAIL
```

Do not assume `gcloud active account = ADC account`. After switching
gcloud configuration, re-verify ADC — the well-known ADC file
(`$HOME/.config/gcloud/application_default_credentials.json` on
Linux/macOS) does not follow `gcloud config configurations activate`.
If ADC is for the wrong principal, `gcloud auth application-default revoke`
then `gcloud auth application-default login` for the intended account —
do not “fix” it by exporting a key, and do not treat
`gcloud auth login --update-adc` as a standing link between CLI and ADC.

`GOOGLE_APPLICATION_CREDENTIALS`, if set, **wins** ADC search order.
If it points at a downloaded service-account private key: **HARD STOP**
unless a named packet explicitly requires that file, the file is under
gitignored `secrets/`, and impersonation/user ADC were proven impossible.

### 8.4 Firebase local auth

```bash
firebase login
firebase login:list
firebase login:use <account>   # if more than one Google account
firebase projects:list
firebase use                   # active project / alias
```

Do not use legacy `firebase login:ci` or `FIREBASE_TOKEN` as a local
workflow. Do not put a Firebase token in chat, the repo, docs, or shell
history. Isolated C1 project is `beauessence-clinic-stg-c1a01`. Existing
`beauessence-clinic-staging` is CAL-PILOT + preview only.

### 8.5 Terraform authentication

Google provider on this laptop, in this order:

1. Approved user ADC (`gcloud auth application-default login`).
2. Approved service-account **impersonation** (ADC
   `--impersonate-service-account` or equivalent provider impersonation).
3. A service-account key only if 1 and 2 are proven impossible **and** a
   written security policy allows it.

Do not create a long-lived JSON private key for convenience. CI already
uses WIF (`infra/terraform/c1-foundation` impersonation for GitHub).
Local apply must not invent a second key-based identity.

Before `terraform apply`: snapshot agrees; `var.project_id` is the
isolated or authorised project, never `beauessence-clinic-staging` for
C1～C6; `exact_apply_authority_sha` is this HEAD; plan target matches
that project.

### 8.6 Laptop execution shape (what Luna is for)

Luna keeps remaining source, Terraform drafts, tests, plan files,
verification scripts, identity work, and the A–L map up to each HARD
STOP. Grok rests (`GROK_RESTS` / `LUNA_SOLE_EXECUTOR`).

Identity work looks like:

> Sign in the named Google account → named **synthetic** gcloud
> configuration (`clinic-staging`) → ADC for that same principal →
> confirm billing/project → CLI read-back.

Engineering work looks like:

> Playbook Card 8 PASS → current phase Engineering actions (Luna) →
> covering gate → checkpoint.

Not:

> Invent D-series approval, route `/v1/bookings` early, create
> `clinic-production` “just in case”, or apply production Terraform
> without an exact-SHA packet.

---

## 9. Work classification (Luna sole executor)

Classify every remaining item. Prefer `LUNA_CAN_FINISH` or `NOT_NEEDED`.
Grok does not take a class (`GROK_RESTS`).

| Class | Meaning |
| --- | --- |
| `LUNA_CAN_FINISH` | No owner login required. Luna does it on the laptop now. |
| `NOT_NEEDED` | Looks human, but CLI/API/IaC already covers it or it is forbidden. |
| `LOCAL_NOW` | Authority exists. Luna does it on the laptop immediately (needs Google identity). |
| `LOCAL_LATER` | Needs the laptop, but authority is still missing. |
| `INTERACTIVE_HUMAN_STEP` | Password, 2FA, security key, CAPTCHA, payment confirmation — the human only. |

Snapshot at this plan’s write (re-classify after Phase 0):

| Item | Class | Note |
| --- | --- | --- |
| Docs, tests, Terraform source, unrouted inventory, this plan | `LUNA_CAN_FINISH` | Luna PR path; Grok rests |
| Phases 0, A–L engineering (booking, Calendar, infra, DNS, cutover, UI, release) | `LUNA_CAN_FINISH` up to each HARD STOP | Luna’s map |
| Phase A consolidation / stale Canon | `LUNA_CAN_FINISH` | No login |
| Phase B approval-packet **drafts** | `LUNA_CAN_FINISH` | Signoff is human |
| D-series named approval | `INTERACTIVE_HUMAN_STEP` | Owner/legal/medical |
| Isolated project read-only verify | `LOCAL_NOW` | ADC + `clinic-staging` config |
| Create `clinic-staging` gcloud config | `LOCAL_NOW` | Synthetic isolated work only |
| Create `clinic-production` gcloud config | `LOCAL_LATER` | Production still `NOT_AUTHORIZED`; do not create “just in case” |
| Chrome `clinic-production` profile | `LOCAL_LATER` | Same reason |
| User ADC for synthetic work | `LOCAL_NOW` + possible `INTERACTIVE_HUMAN_STEP` for consent/2FA |
| Firebase `login` / `projects:list` against isolated project | `LOCAL_NOW` | Not `login:ci` |
| Re-apply C1～C6 | `NOT_NEEDED` unless a new exact-SHA packet says so | Already PASS on `beauessence-clinic-stg-c1a01` |
| Download a Terraform SA JSON key | `NOT_NEEDED` | User ADC or impersonation |
| `firebase login:ci` / `FIREBASE_TOKEN` | `NOT_NEEDED` | Officially not recommended |
| Reconstruct C0～C6 history | `NOT_NEEDED` | Machine file + this plan |
| Production project / billing attach / DNS / live Hosting | `LOCAL_LATER` | Explicit production authority |
| Production Calendar / real data / `/v1/bookings` route | `LOCAL_LATER` | Register + exact SHA |
| Billing payment / domain-registrar 2FA | `INTERACTIVE_HUMAN_STEP` | |

---

## Fresh-verified baseline (re-check in Phase 0)

Recorded while writing this file. **Not standing authority.** Luna
re-checks git/Canon **and** identity (playbook Cards 0–8).

| Fact | Evidence at plan write |
| --- | --- |
| `origin/main` | `48f773b4287460ce29ae4b970543a60514a8a105` |
| Merge | PR [#112](https://github.com/waydefu/clinic/pull/112) MERGED 2026-09-11T16:15:52Z |
| Main CI | `verify` run [34620983815](https://github.com/waydefu/clinic/actions/runs/34620983815) success, including `Verification evidence` |
| C0～C6 | `stage-2-gate-status.json` all `completed`; C1～C6 `granted` |
| Isolated project | `beauessence-clinic-stg-c1a01` |
| Formal booking | UNROUTED (`AppModule` imports `CalendarPilotModule` + `HealthController` only) |
| Watch | `CalendarWatchController` UNROUTED |
| Production / DNS / live Hosting / real data / production Calendar | `NOT_AUTHORIZED` |

---

# Phase 0 — Current-state reconciliation

### Goal

Prove live `main`, C0～C6, UNROUTED booking, D-series, and production
authority from evidence. Reconcile Canon if a live file still says C1～C6
are pending. Do not start product construction.

### Preconditions

Luna: clone + `gh` + playbook Cards 0–8. Chrome `clinic-synthetic`;
gcloud CLI identity **and** ADC **and** Firebase CLI verified separately
([§8](#8-local-identity--credential-safety--required)). No production
project login in the synthetic profile.

### Authoritative inputs

`origin/main`; PR #112; `docs/architecture/stage-2-gate-status.json`;
`docs/architecture/first-stage-c0-authority.md`;
`docs/product/phase-1-decision-register.md`; `apps/api/src/app.module.ts`;
`apps/api/unrouted-inventory.json`; `scripts/c2-c6-smoke-evidence.mjs`;
`scripts/sequential-c-gate.mjs`; `scripts/isolated-c1-project-id.mjs`.

### Engineering actions (Luna)

1. Fetch and pin `origin/main`. If SHA ≠ `48f773b…`, read the delta and
   treat **that** SHA as `BASE MAIN`. Do not assume this plan's SHA.
2. Confirm PR #112 `MERGED`.
3. Confirm `stageSlices` C0～C6 `completed` and authorities `granted`.
   If any reverted, HARD STOP and do not continue A–L as written.
4. Confirm `AppModule` still excludes booking/watch/BookPilot.
5. Read D-series **table** (not old prose). Copy live statuses into the
   checkpoint.
6. If a **live** Canon file still claims C2～C6 `not_granted`, reconcile
   that file in a docs PR. Do not rewrite dated reviews.
7. Read-only inspect isolated project (CLI + Console). Do not apply.
   Rebuild [ACCOUNT_CONTEXT_SNAPSHOT](#81-account-context-snapshot) first.
   If gcloud account and ADC disagree, stop. Do not continue into Phase A
   engineering.

### Change boundary

| May change | Must not change |
| --- | --- |
| Live Canon sentences that still say C2～C6 `not_granted`; index pointers to this plan; checkpoint file (gitignored) | `AppModule` imports; `stage-2-gate-status.json` values; Terraform/cloud apply; secrets; dated reviews; D-series table statuses |

### Browser actions

- GitHub: PR #112 merged; Actions run on exact `origin/main` SHA green.
- GCP Console: project `beauessence-clinic-stg-c1a01`, region `asia-east1`.
  Confirm it is **not** `beauessence-clinic-staging`.
- Firebase Console: same isolated project. Hosting live channel must not
  be treated as production.
- Calendar: do not open a real clinic calendar. CAL-PILOT calendars only
  if checking synthetic sync.

### CLI actions

```bash
git fetch origin main
git rev-parse origin/main
gh pr view 112 --json state,mergedAt,mergeCommit,url
gh run list --commit "$(git rev-parse origin/main)" --limit 10
node -e "console.log(JSON.parse(require('fs').readFileSync('docs/architecture/stage-2-gate-status.json','utf8')))"
rg -n "AppointmentController|BookPilotModule|CalendarWatchController" apps/api/src/app.module.ts
node scripts/sequential-c-gate.mjs --help
gcloud config configurations list
gcloud config get-value account
gcloud config get-value project
printf 'GAC=%s\n' "${GOOGLE_APPLICATION_CREDENTIALS:-unset}"
gcloud auth application-default print-access-token >/dev/null && echo ADC_TOKEN_OK || echo ADC_MISSING
gcloud projects describe beauessence-clinic-stg-c1a01 --format='yaml(projectId,name,lifecycleState)'
firebase login:list
firebase projects:list
```

gcloud CLI identity ≠ ADC. Values that look like billing account IDs,
emails, tokens, or keys stay in the terminal. Do not paste them into
chat or the repo.

### Tests

`corepack pnpm run check:architecture` and `check:docs` after any Canon
reconcile. No product tests required if the tree is docs-only.

### Evidence

Checkpoint 0; SHA; PR state; CI run id; AppModule grep; project id
read-back (redact billing).

### PASS

Main identified; C0～C6 still completed/granted **or** honestly reported
as changed; booking still UNROUTED; production still NOT_AUTHORIZED;
checkpoint written.

### FAIL

Cannot fetch; CI red on current main; AppModule routes booking; machine
status rolled back without a new owner record.

### HARD STOP

Any production project, live Hosting channel, official hostname, or real
patient row appears in the session. Any secret in the git tree. gcloud
CLI account and ADC disagree, or `GOOGLE_APPLICATION_CREDENTIALS` points
at a convenience JSON key.

### Rollback

Docs-only reconcile: `git revert` the docs commit. Cloud: none (read-only).

### Next

Phase A.

---

# Phase A — Post-C6 consolidation

### Goal

Converge repository / Canon / generated state / open risks after C0～C6
without blindly “fixing everything”. Classify debt. Leave production
behavior unchanged.

### Preconditions

Phase 0 engineering PASS. Working branch `cursor/luna-a-consolidation`.

### Authoritative inputs

This file §5; `docs/document-lifecycle.md`; `docs/INDEX.md`;
`docs/README.md`; `docs/state/current.md` (regenerate);
`docs/reviews/2026-09-09-data-r03-engineering-slices.md`;
`docs/reviews/2026-09-10-scm-r04-upgrade.md`;
`docs/reviews/2026-09-09-non-ui-max-authorized-handoff.md`;
`docs/runbooks/manual-accessibility-test.md`;
`security/audit-exceptions.json`.

### Engineering actions (Luna)

Inventory then classify every open item:

| Class | Rule | Examples at plan write |
| --- | --- | --- |
| **must fix before production** | Breaks Safety Floor, authenticity of gates, or would ship corrupt/unreadable prod docs | remaining DATA-R03 codecs on collections production booking/Calendar will read; named-reviewer metadata still empty is **not** this class |
| **should fix before production** | Operability, monitoring, remaining dual-reader holes on synthetic collections that C6 already uses | CAL-PILOT `documentData<T>` / worker `as T`; corrupt-doc alert sink |
| **may defer** | Same-major SCM already triaged; visual polish already gated in H | SCM-R04 `csv-parse@5` / `stream-json@1` until 2026-10-09 or firebase-tools major |
| **obsolete** | Instructions that reopen C0～C6 or say Stage 1 has not passed C0 | stale execution prose (replace with pointer to this file) |
| **accepted risk** | Explicitly accepted for synthetic staging | C0-ENG-REC Firestore database-scope residual risk on isolated project; production must re-accept |

Do not close DATA-R03 ID just because five slices landed. Do not dismiss
Dependabot alerts to clear SCM-R04. Do not treat TW-05 automated
preconditions as human AT.

Search TODO/FIXME in `apps/`, `packages/`, `infra/`. Classify; do not
drive-by implement payroll/clinical/money.

Dead synthetic-only scaffolding: keep SHA-gated Terraform default no-op
and unrouted modules. Delete only if a file is proven unused **and** not
in `unrouted-inventory.json`.

### Change boundary

| May change | Must not change |
| --- | --- |
| Stale *live* narratives; generated `docs/state/current.*`; debt classification review; same-major SCM-R04 patches under existing Q-SCM-R04 | Machine C0～C6; routing `/v1/bookings`; Terraform apply; closing DATA-R03 without remaining codecs; dismissing Dependabot; payroll/clinical/money persistence; dated reviews |

### Browser actions

None required unless a stale doc cites a live Console URL. If so, open
it read-only and record whether the resource still exists.

### CLI actions

```bash
corepack pnpm run generate:governance-state
corepack pnpm run check:docs
corepack pnpm run check:architecture
corepack pnpm run check:governance
corepack pnpm run check:format
rg -n "TODO|FIXME" apps packages infra --glob '!**/vendor/**'
```

### Tests

Docs/architecture/governance/format. Add a stale-claim in
`scripts/check-docs-links.mjs` if a live file keeps repeating
“C2～C6 `not_granted`”.

### Evidence

Classification table in a dated review; regenerated `docs/state/current.*`;
checkpoint A.

### PASS

Every open ID is classified. Live Canon no longer tells Luna to start C1.
Machine C0～C6 unchanged. Booking still UNROUTED. No secrets.

### FAIL

Machine status rewritten; routes enabled; DATA-R03 closed without codecs;
Dependabot dismissed.

### HARD STOP

Temptation to `terraform apply` or mount booking “while cleaning docs”.

### Rollback

Revert the consolidation PR.

### Next

Phase B. Parallel: SCM-R04 same-major patches may continue under existing
Q-SCM-R04 without waiting for D-series.

---

# Phase B — Remaining product decisions

### Goal

Move each live D-series item to `approved`, `deferred` (already recorded),
or a **minimal** human approval packet. Do not guess policy. Do not
implement blocked routes.

### Preconditions

Phase A classification exists. Register is the only status source.

### Authoritative inputs

`docs/product/phase-1-decision-register.md` (re-read table; do not trust
the snapshot below). Packets:

- `docs/legal/phase-1-privacy-approval-packet.md` (D-001～D-003)
- `docs/product/phase-1-appointment-operations-approval-packet.md` (D-004/D-005)
- `docs/product/phase-1-case-management-payroll-approval-packet.md` (D-007/D-008)
- `docs/product/phase-1-integration-launch-approval-packet.md` (D-009～D-011)
- `docs/security/privacy-policy-checklist.md`
- `docs/security/taiwan-privacy-legal-baseline.md`
- `docs/legal/privacy-policy-draft.md` (draft, not published)
- FS-001 in the register (capability freeze + suggested hostnames)

### Snapshot at plan write (must re-read)

| ID | Live status | Engineering vs human | Unlocks | Exclusions |
| --- | --- | --- | --- | --- |
| D-001 | pending (input 2026-08-16) | **human** legal/privacy | published privacy policy | not a booking route |
| D-002 | pending; backup-deletion + Google processor unanswered | **human** | collecting patient data; deletion/audit export | not IAM |
| D-003 | pending; final text/version/publication outstanding | **human** | privacy acceptance / public booking | draft ≠ published |
| D-004 | pending; input capacity 1, horizon 1 month | **human** named approval of scope/exclusions; Luna may *draft* the packet from recorded input | slot reservation / routing | input ≠ approval |
| D-005 | pending; input cutoff 10:00 appointment day | same as D-004 | cancellation route | fees/no-show still in packet |
| D-006 | approved 2026-07-28; implementation evidence pending | **Luna** implements against `roles.ts`; no new role literals | authenticated write *when also routed* | `physician` stays empty-permission |
| D-007 | pending | **human**; FS-001 hides advanced case management | assignment write path | do not persist in Phase 1 |
| D-008 | pending; period-close/adjust **deferred** | **do not implement** | payroll-credit persistence | FS-001 hidden |
| D-009 | pending **production**; CAL-PILOT synthetic-only through 2026-11-28 | production = **human**; synthetic already approved | outbound production Calendar | CAL-PILOT ≠ production |
| D-010 | approved target/SLO 2026-07-28 | **not** deploy authority; production apply still **human** exact-SHA | cloud *design* | isolated C1～C6 already applied |
| D-011 | pending; no English; production URL undecided | **human** for URL; suggested hostnames in FS-001 are not DNS authority | public booking UX host | existing `beauessence.com.tw` stays with incumbent |
| D-014 | pending; needs named legal/medical review | **human**; out of Phase 1 | surgery/anesthesia/clinical store | FS-001 hidden |
| D-015 | pending; ledger/refund/settlement **deferred** | **human**; out of Phase 1 | money/settlement | FS-001 hidden |
| D-016 | pending **production**; CAL-PILOT synthetic-only same expiry | production = **human** | Calendar-to-system writes | watch UNROUTED until authorised |

Luna may fill packet blanks that are already decided by FS-001 / C0-ENG-REC
/ ADRs (example: capacity 1, cutoff 10:00, roles from `roles.ts`, region
`asia-east1`). Luna may not invent legal controller name, processor
agreement, medical record fields, or production calendar ids.

### Engineering actions (Luna)

For each ID: current answer, missing authority, whether legal/privacy/
medical/security review is required, technical impact, routes unlocked,
exclusions, acceptance criteria. Produce the smallest approval packet
only for true human IDs. Record answers in the register **only** after
named owner, date, scope, exclusions exist.

### Change boundary

| May change | Must not change |
| --- | --- |
| Approval-packet drafts; register rows **after** named owner/date/scope/exclusions; D-006 implementation against `roles.ts` | Guessed policy in code; new role literals outside `roles.ts`; flipping a decision to `approved` without ceremony; D-008/D-014/D-015 persistence; production Calendar ids in source |

### Browser actions

None for unsigned packets. If the owner already published a privacy URL,
open it and capture version/date — still do not mark D-003 approved
without the register ceremony.

### CLI actions

No apply. Register edits are docs. After register edits:

```bash
corepack pnpm run check:docs
corepack pnpm run check:architecture
corepack pnpm run check:governance
```

### Tests

Architecture capabilityGates in `unrouted-inventory.json` must still list
D-004/D-005/D-002/D-007/D-014/D-008/D-015 until those IDs are `approved`.

### Evidence

Updated register rows; packets; checkpoint B listing which IDs remain
pending.

### PASS

Every ID is either approved with ceremony, explicitly deferred, or sitting
behind a one-question HUMAN BLOCKER. No guessed policy in code.

### FAIL

Status flipped to approved without named owner/date/scope/exclusions.
Payroll/clinical/money implemented. Role string added outside `roles.ts`.

### HARD STOP

Owner says “just use real patients” or “connect the real calendar” without
a register production D-009/D-016 + real-data authority.

### Rollback

Revert register/docs commit. Code must not have moved.

### Next

If D-001～D-005 (+ D-006 implementation evidence) approved → Phase C.
If production D-009/D-016 approved → Phase D may start in parallel.
If production deploy authority exists → Phase E.
Otherwise remain in B and wait; keep engineering auto-continue elsewhere.

---

# Phase C — Formal booking (UNROUTED → ROUTED → synthetic verified → production ready)

### Goal

Turn `AppointmentController` from `IMPLEMENTED / UNROUTED` into a
**gated** write path. Never one-cut enable production public booking.

Required sequence:

1. `UNROUTED` (current)
2. Optional `BOOK-PILOT` isolated module (only if a new exact-SHA
   synthetic authority exists; proposal
   `docs/product/2026-09-07-book-pilot-proposal.md` is **not** that
   authority)
3. `ROUTED` on isolated synthetic project only
4. `SYNTHETIC VERIFIED`
5. `PRODUCTION READY` (still needs Phase J to ship)

### Preconditions

D-001, D-002, D-003, D-004, D-005 `approved` with ceremony. D-006
implementation evidence for staff authz on the write path. Isolated
project healthy. AppModule currently UNROUTED. CapabilityGates remaining
blockers for `appointment_scheduling` / `appointment_cancellation`
cleared in `unrouted-inventory.json` **in the same change** as routing.

D-011 required before any **public** hostname UX. Staff-only synthetic
routing may proceed without D-011.

### Authoritative inputs

`apps/api/src/app.module.ts`; `apps/api/unrouted-inventory.json`;
`apps/api/src/appointments/*`; `apps/api/src/book-pilot/*`;
`packages/domain`; `packages/contracts`; ADR-0001/0003/0005;
`scripts/c2-c6-smoke-evidence.mjs` (`FORMAL_BOOKING_ROUTE_MARKERS`);
BOOK-PILOT proposal; C0-DIR / FS-001; `docs/architecture/api-v1-contract.md`.

### Engineering actions (Luna)

Must cover, in code at the owning boundary (domain/contracts first):

| Concern | Rule |
| --- | --- |
| Route | Prefer isolated `BookPilotModule` before production `AppointmentController`. Production AppModule must not import both accidentally. `/v1/bookings` stays 404 until the authorised module is imported. |
| Validation | Contract schemas; opaque synthetic identities only until real-data authority |
| Concurrency | Firestore transaction occupancy; capacity 1 per D-004 once approved |
| Idempotency | Existing appointment idempotency fingerprint; freeze only after request shape is approved |
| Slot locking | Domain occupancy; Calendar is **not** the lock (ADR-0002) |
| Cancel / reschedule | D-005 cutoff 10:00 Asia/Taipei display; store UTC |
| Search | No existence oracle for other patients (BOOK-PILOT §1.2) |
| Rate limit | Replace per-process test limiter before public expose |
| Abuse | Authn, authz deny-default, audit on deny |
| Audit | Append-only; no PII in Calendar projection |
| Privacy | D-001～D-003 published policy + acceptance before public |
| Error mapping | 401/403/404/409/429; unrouted 404 preserved until cutover |
| Browser UX | Rules R-21/R-8/R-9; visual bar in §3.3 |
| Mobile UX | R-13/R-14; 320px edge |

Kill switch + UTC expiry for any synthetic pilot, copied from CAL-PILOT.

### Change boundary

| May change | Must not change |
| --- | --- |
| Domain/contracts/API at the owning boundary; `unrouted-inventory.json` blockers **in the same PR** as an authorised import; isolated BookPilot module; browser UX inside R-1–R-26 | Production AppModule import without D-001～D-005; importing BookPilot **and** AppointmentController together; Calendar calls inside a Firestore transaction; real PII in events; official DNS |

### Browser actions

Drive `web-dist` (build first). Patient booking, lookup/cancel, staff
create/reschedule/cancel, permission-denied, conflict, loading, empty.
Viewports: 320, 360, 390, 430, tablet, laptop, desktop. Console/network
clean except intentional 4xx. Visual FAIL if demo-like.

### CLI actions

```bash
corepack pnpm run check:architecture
corepack pnpm test --filter @beauessence/api
corepack pnpm run test:rules
corepack pnpm run test:e2e -- appointments
# After authorised import only:
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/v1/bookings
```

Unrouted expectation: `404`. After synthetic route: not 404, and still
not production.

### Tests

Harness tests today prove RBAC without routing. Add tests that:

- fail if AppModule imports the controller **before** inventory blockers
  are empty
- prove occupancy conflict, idempotent replay, cancel cutoff, rate-limit,
  and audit emit
- prove Calendar is not called inside the transaction (outbox only)

### Evidence

Inventory diff; AppModule diff; e2e; checkpoint C with
`BOOKING=ROUTED_SYNTHETIC` or still `UNROUTED`.

### PASS

Authorised module routed on isolated/synthetic only; occupancy +
idempotency + cutoff + RBAC + audit proven; UI visual matrix PASS;
production hostnames untouched.

### FAIL

`/v1/bookings` on production; BookPilot + AppointmentController both
reachable; Calendar called in a transaction; real names in events.

### HARD STOP

Missing D-001～D-005 approval. Authority that names a different SHA than
`HEAD`. Request to skip kill switch/expiry.

### Rollback

Remove the module import; confirm 404; redeploy previous Cloud Run
revision if any. Inventory blockers restored if routing is reverted.

### Next

Phase D if production Calendar is in scope; else E/F as authority allows.
Do not call this production ready until H/I/J.

---

# Phase D — Production Calendar

### Goal

Production Google Calendar as a **projection** of Firestore occupancy,
with inbound review. Keep synthetic CAL-PILOT and production Calendar as
different systems until an explicit cutover (Phase G).

### Preconditions

Production D-009 and D-016 `approved` with calendar owner, calendar ids,
scopes, minimum fields, reviewer roles, conflict/delete semantics, SLO.
Production (or authorised pre-prod) GCP project. Real-data authority is
**separate** — production Calendar still must contain **no** patient PII,
medical data, or access credentials (Safety Floor 4).

CAL-PILOT may keep running until 2026-11-28 or owner kill. Do not point
CAL-PILOT at a production calendar.

### Authoritative inputs

ADR-0002; D-009/D-016; CAL-SYNC-DIR; `docs/architecture/calendar-event-id.md`;
`docs/architecture/calendar-bidirectional-sync-plan.md`;
`docs/runbooks/calendar-sync-failure.md`;
`docs/runbooks/cal-pilot-30-day-bidirectional-sync.md`;
`docs/runbooks/calendar-go-live.md`;
`apps/worker/src/calendar-sync/*`;
`apps/api/src/calendar/calendar-watch.controller.ts`;
`infra/terraform/c6-calendar/` (API enablement, not production).

### Engineering actions (Luna)

| Topic | Rule |
| --- | --- |
| Allowed fields | Opaque appointment id / time / practitioner resource label as approved in D-009. No patient name, phone, diagnosis, notes. |
| PII policy | If a field is not on the allowlist, it does not go to Google |
| Target | Clinic-owned production calendar ids from Secret Manager, not source constants |
| `events.watch` | Product direction exists; controller is UNROUTED. Route only with exact-SHA authority. Verify channel token, 410 recovery, renewal. |
| `syncToken` | Existing worker engine; prove incremental list + 410 rebuild |
| Compensation | CAL-SYNC-DIR 1–5 minute poll if watch is quiet; never from a Firestore transaction |
| Loop prevention | System writes must be recognizable so inbound does not re-create occupancy |
| Conflict | Review queue; manager vs front_desk per C4 open question — if still open, **human** |
| Delete semantics | D-016; default: inbound delete → review, not silent occupancy release, unless approved otherwise |
| Monitoring | Alert on watch expiry, 410 storm, dead-letter growth, dual-write suspicion |
| Incident | Follow calendar-sync-failure runbook |

Never call Calendar from a Firestore transaction. Persist outbox, worker
performs the effect.

### Change boundary

| May change | Must not change |
| --- | --- |
| Watch routing **after** production D-009/D-016 + exact-SHA; projection mapper allowlist tests; worker `syncToken`/410 path; outbox jobs | Patient PII in Calendar; Calendar as occupancy lock; pointing CAL-PILOT at a production calendar; committing service-account JSON; calling Calendar from a transaction |

### Browser actions

Google Calendar UI on the **production profile only after authority**.
Confirm events show allowlisted fields only. Confirm the real clinic
legacy calendar is not written until Phase G switch.

GCP Console: Calendar API, watch channels, error rates.

### CLI actions

Credentials via Secret Manager / env; never chat.

```bash
# After authority, worker test mode remains distinct from production mode
gcloud secrets list --project "$PROD_PROJECT"   # names only
# watch renewal / scheduler jobs read-back
```

Use `docs/runbooks/calendar-go-live.md` for service-account **shape**
(service account, not OAuth client). Owner provisions the approved
service-account access path; do not create or download a long-lived JSON key
for convenience.

### Tests

Watch harness; 410 rebuild; loop-prevention; outbox retry; deny PII
fields in the projection mapper (new regression tests). Architecture
check: CalendarWatchController reachable only when inventory blockers
for D-009/D-016 are empty.

### Evidence

Field allowlist; watch channel id (not secrets); 410 drill; checkpoint D
with `PROD_CALENDAR=AUTHORIZED` only after register + apply + smoke.

### PASS

Projection matches allowlist; inbound review works; loops do not double
book; CAL-PILOT still isolated; booking occupancy still Firestore.

### FAIL

Patient name in Calendar; watch routed without D-016; Calendar as lock;
CAL-PILOT pointed at production.

### HARD STOP

No production D-009/D-016. Request to “just share the doctor’s personal
calendar”. Key file offered for commit.

### Rollback

Disable watch; stop scheduler; worker mode off; outbox drain; Calendar
ACL removal by owner. Occupancy remains in Firestore.

### Next

Coordinate cutover with G. Do not switch source of truth here.

---

# Phase E — Production infrastructure

### Goal

Clinic-owned production (and remaining staging) GCP/Firebase: billing,
org/folder, IAM, WIF, runtime SA, secrets, Firestore, backup, PITR,
Cloud Run, Hosting (not live DNS yet), Identity Platform, logging,
monitoring, budget, Scheduler, alerts, audit, DR secondary, restore
exercise.

Every mutation: **plan → apply → smoke → read-back → rollback evidence**.

### Preconditions

D-010 deploy authority for the **exact SHA**, project, region, window.
D-001～D-003 before real data. C0-ENG-REC production residual-risk
acceptance is **separate** from synthetic acceptance. Clinic org/billing
ownership path understood (developer-held test billing must not become
the production dependency).

### Authoritative inputs

`docs/architecture/infrastructure-and-operations-plan-2026-07-24.md`;
`docs/architecture/stage-2-c0-readiness-artifacts-2026-07-29.md`;
`docs/architecture/c0-engineering-recommendations.md`;
`infra/terraform/**`; `docs/runbooks/backup-and-restore.md`;
`docs/runbooks/incident-response.md`; D-010; Safety Floor 8.

### Engineering actions (Luna)

| Slice | Do | Do not |
| --- | --- | --- |
| Clinic-owned project | New production project under clinic org/folder | Reuse `beauessence-clinic-stg-c1a01` or `beauessence-clinic-staging` |
| Billing | Clinic billing account; TWD if budgets use TWD | Auto-detach billing; USD account with TWD budgets |
| IAM | No primitive Owner/Editor on humans/runtime; WIF for CI | Long-lived keys in repo |
| Runtime SA | Split api/worker/scheduler | Datastore user on humans |
| Secrets | Secret Manager; rotate | `.env` committed |
| Firestore | Native, `asia-east1`, PITR, delete protection | Production data in synthetic |
| Backup / PITR | Prove restore, not only config | Emulator restore as DR evidence |
| Cloud Run | API + worker; loopback principles do not apply on Cloud Run — lock ingress/IAM | Unauthenticated write routes |
| Hosting | Prepare site; **do not** attach official DNS until F | Live channel as production without J |
| Identity Platform | Google + clinic-managed; MFA; idle 30m / absolute 8h | Shared emergency account |
| Logging / monitoring / budget | 50/80/100 **actions** as C0-ENG-REC; never auto-detach | Silence pages |
| Scheduler | Outbox/watch compensation | External provider calls inside transactions |
| DR | Option A + B secondary `asia-east1`; manual failback | Option C/D (rejected) |
| Restore exercise | Actual restore to isolated project | Paper-only |

### Change boundary

| May change | Must not change |
| --- | --- |
| New clinic-owned production/DR projects; SHA-gated Terraform; Secret Manager names; IAM/WIF/runtime SA; PITR/backup; Cloud Run/Hosting **without** official DNS until F | Reusing `beauessence-clinic-stg-c1a01` or `beauessence-clinic-staging` as production; primitive Owner/Editor on runtime; secrets in git; auto-detach billing; loading real patient data |

### Browser actions

GCP + Firebase + Identity Platform consoles in `clinic-production`
profile **after** authority. Verify project picker. Screenshot (redact
account numbers) of: APIs, IAM (no Owner on runtime SA), Firestore PITR,
budget thresholds, alert policies, Cloud Run ingress.

### CLI actions

Google provider on this laptop: user ADC, then impersonation, never a
convenience JSON key ([§8.5](#85-terraform-authentication)). Rebuild the
account snapshot. Plan → apply → smoke → CLI read-back → rollback
evidence. Console is read-back, not the apply path.

```bash
# snapshot must already show clinic-staging + ADC_TOKEN_OK + matching project
terraform -chdir=infra/terraform/<env> plan -out=tfplan
# apply only with exact-SHA written authority
terraform -chdir=infra/terraform/<env> apply tfplan
gcloud run services describe ... --format='yaml(status.url,status.traffic)'
gcloud firestore backups list ...
```

Terraform apply remains a guarded, authorised command. Luna may apply
locally **only** when the checkpoint records the exact SHA and the owner
authority packet names that SHA, with matching ADC/project. Do not apply
from a cloud VM that lacks owner ADC.

### Tests

`terraform validate`; architecture checks; backup restore drill
checklist in the backup runbook; identity MFA challenge on a **test**
staff user (synthetic email).

### Evidence

Plan file hash; apply SHA; read-back YAML (no secrets); restore proof;
checkpoint E.

### PASS

Production project exists, owned on the clinic path, backups restore,
alerts fire on a synthetic probe, IAM matches C0-ENG-REC, no real
patient data loaded.

### FAIL

Apply to the wrong project; primitive Owner on runtime; secrets in git;
PITR off.

### HARD STOP

No exact-SHA production authority. Billing account is still a private
developer account **and** the owner has not accepted that as temporary.
Request to apply to `beauessence-clinic-staging` as production.

### Rollback

Previous Terraform state; Cloud Run previous revision; disable new APIs;
do not delete the project by default (C1 rule: quarantine, don’t delete).

### Next

Phase F (DNS) when D-011 URL is decided. Restore drill may also be
recorded here for L.

---

# Phase F — DNS / domain / Hosting

### Goal

Attach `book.beauessence.com.tw`, `staff.beauessence.com.tw`, and
`api.beauessence.com.tw` **only after** fresh-verifying owner direction
(FS-001 suggested them; D-011 still says production URL undecided).

Existing `beauessence.com.tw` stays with the incumbent vendor. First-stage
patient entry remains `beauessence.com.tw/reservations/` with optional
redirect. Do not iframe the synthetic preview into the official site
(FS-001).

### Preconditions

D-011 approved URL set (may confirm or replace the suggested hostnames).
DNS ownership authority. TLS capable. Phase E Hosting/Cloud Run ready.
Production cookie domain plan.

### Authoritative inputs

FS-001; D-011; `docs/runbooks/synthetic-online-preview.md` (preview ≠
prod); `firebase.json`; CSP/HSTS notes in web quality gates;
ADR-0001 (browser → API only).

### Engineering actions (Luna)

| Topic | Rule |
| --- | --- |
| Ownership | Prove registrar/DNS zone belongs to the clinic before mutation |
| TXT | Google/Firebase site verification TXT only as documented |
| TLS | Managed cert; fail closed on mismatch |
| Hosting | Firebase Hosting for web; Cloud Run custom domain for API |
| Cache | Current policy is no-cache for HTML (do not revive `no-store` stale claim) |
| Redirect | Optional from `/reservations/` — vendor change needs owner |
| CSP / HSTS | Align with `docs/architecture/web-quality-gates-2026-07-24.md` |
| Cookies / `__session` | Hosting forwards only `__session`; Secure+SameSite as C3 |
| CORS / CSRF | API allowlist exact book/staff origins; CSRF with session |
| Rollback | DNS TTL keep short during cutover; keep previous records documented |

### Change boundary

| May change | Must not change |
| --- | --- |
| DNS records **after** D-011 + ownership authority; Hosting/Cloud Run custom domains; CSP/HSTS/cookie flags; short TTL during cutover | Official DNS before D-011; iframe of synthetic preview on `beauessence.com.tw`; widening `__session` to a parent domain; leaving HTTP without redirect |

### Browser actions

Registrar / Cloud DNS / Firebase Hosting domains UI. After attach:
https load, cert SAN, HSTS, cookie flags (Application panel), CSP
violations in console, CORS preflight from book origin to api origin.

### CLI actions

```bash
# read-only first
gcloud dns record-sets list --zone "$ZONE" --project "$DNS_PROJECT"
firebase hosting:sites:list --project "$PROD_PROJECT"
```

Mutating DNS only with authority. Record previous records before change.

### Tests

`pnpm verify:preview` is **not** production evidence. Add production
smoke: HTTPS 200 on book/staff, API health on api host, POST bookings
only if Phase C+J allow it.

### Evidence

Before/after DNS records; cert expiry; cookie screenshot; checkpoint F.

### PASS

Chosen hostnames resolve to the authorised backends; TLS valid; cookies
scoped; CSP clean; incumbent site still serves what FS-001 kept.

### FAIL

Preview iframe on official site; session cookie on parent domain too
wide; HTTP left open without redirect.

### HARD STOP

D-011 still “URL undecided”. DNS login is not clinic-owned. Mutation
requested on the wrong zone.

### Rollback

Restore previous DNS records; lower TTL wait; Hosting previous version.

### Next

Phase G if legacy Calendar/data must move; else H on production URLs.

---

# Phase G — Data migration / cutover

### Goal

If production will consume legacy Google Calendar / other operational
surface data, cut over **without** guessing real data and **without**
copying production data into unauthorised environments.

CAL-SYNC-DIR: Calendar is the clinic’s legacy operational **surface**
before cutover; Firestore slot transactions remain the availability lock.

### Preconditions

Real-data authority. Production project. Freeze window agreed. D-001～D-003
published. Phase C occupancy works on synthetic. Phase D projection
ready or explicitly dual-run-approved.

### Authoritative inputs

CAL-SYNC-DIR; ADR-0002; `docs/runbooks/cal-pilot-import.md` (pattern:
time + opaque label only); data classification
`docs/security/data-classification-and-field-inventory-2026-07-29.md`
(plan-only; production fields still unapproved until D-001～D-003).

### Engineering actions (Luna)

| Step | Rule |
| --- | --- |
| Freeze | No legacy creates during import window except recorded exceptions |
| Export | Owner-local; not into the git repo; not into chat |
| Normalize | Opaque ids; UTC instants; drop PII fields not in the production allowlist |
| Validate | Schema, required keys, timezone |
| Dedupe | Define identity (time + resource + opaque key) |
| Reconciliation | Counts + hashes (of allowed fields) before/after |
| Import | Idempotent; dry-run first |
| Dual-run | Default **no**. If owner requires it, both systems must have loop prevention and a single occupancy lock (Firestore) |
| Source of truth switch | Instant; documented; reversible within the freeze |
| Calendar projection switch | After occupancy exists in Firestore |
| Loop prevention | Same as Phase D |

Do not invent the real event count. Measure from the authorised export.

### Change boundary

| May change | Must not change |
| --- | --- |
| Operator scripts under gitignored `exports/` / `secrets/`; dry-run counts/hashes in a dated review (no payloads); Firestore occupancy import after real-data authority | Guessing real data; copying production data into synthetic/staging; committing exports; dual occupancy locks; PII in Calendar projection or the git repo |

### Browser actions

Calendar UI sampling of N synthetic-looking vs real events **on the
owner machine**, redacting PII from screenshots (crop; no names).

### CLI actions

Local scripts under `secrets/` / `exports/` (gitignored). Dry-run prints
counts, not payloads, into the evidence doc.

### Tests

Dry-run on an **anonymised fixture** that Luna generates (fake times,
opaque labels). Production import is a gated operator action with
read-back counts.

### Evidence

Freeze window; dry-run counts/hashes; import counts/hashes; rollback
export; checkpoint G.

### PASS

Counts match within the approved delta; no PII in repo/chat/Calendar
projection; Firestore is lock; Calendar is projection.

### FAIL

Prod data in staging; dual lock; names in Calendar; unmatched counts
with no owner accept of delta.

### HARD STOP

No real-data authority. Export requested into chat, git, or the public
repo. Dual-run without loop prevention.

### Rollback

Restore freeze; reload pre-import snapshot (PITR); Calendar ACL unchanged
until switch is reversed.

### Next

Phase H on production URLs with synthetic **or** migrated data as
authorised (never mix unexplained).

---

# Phase H — Production UI/UX final pass

### Goal

Visual and operational acceptance. Functionally correct but ugly is FAIL.
No infinite redesign.

### Preconditions

Synthetic (and production if F done) URLs. Design rules R-1–R-26.
Skill `.claude/skills/ui-check/SKILL.md`. Tokens unchanged unless a
named visual defect requires it.

### Authoritative inputs

`docs/design/ui-ux-rules.md` §5; `docs/design/boutique-clinical-command-2026-07-25.md`;
`docs/design/test-only-operations-ui.md`; visual C6 **preview** references
are historical, not pixel gates.

### Engineering actions (Luna)

Walk roles and states on viewports **320, 360, 390, 430, tablet, laptop,
desktop, high-DPI**:

Patient, front desk, manager, auth, MFA, appointments, schedule, search,
edit, cancel, reschedule, Calendar status, errors, offline/network,
loading, empty, permission denied.

Fix hierarchy/spacing/type/colour/alignment/button priority/card weight
inside the existing system.

### Change boundary

| May change | Must not change |
| --- | --- |
| Layout/spacing/type/colour/alignment/button hierarchy inside existing tokens and R-1–R-26; e2e regressions for CSS bugs | A new design system; real-patient screenshots in git; skipping 320px or keyboard; marking PASS when usable-but-ugly |

### Browser actions

Chrome `clinic-synthetic` then `clinic-production` if authorised.
DevTools device mode **and** a real window resize. Keyboard tab order.
Console/network. Screenshot evidence under `output/evidence/` (gitignored)
plus a dated review of **hashes/paths**, not binary patient images in git
if they could contain PII. Synthetic screenshots may be committed only
if they remain synthetic and publication-safe.

### CLI actions

```bash
corepack pnpm run check:ui
corepack pnpm run check:tokens
corepack pnpm run check:pages
corepack pnpm run check:perf
corepack pnpm run test:e2e -- ui
corepack pnpm run test:e2e -- mobile
```

### Tests

UI/mobile/accessibility e2e; visual matrix in §3.3. Add a regression
spec for every FAIL that was a layout/CSS bug.

### Evidence

Viewport matrix table; before/after for defects; checkpoint H.

### PASS

§3.3 matrix green; R-1–R-26; clinic-appropriate; desktop/mobile
consistent; no engineering-demo look.

### FAIL

Ugly-but-works. 320px overflow. Invisible focus. Primary/secondary
buttons inverted. Nested card chrome.

### HARD STOP

Redesign proposal that replaces the design system. Real patient on
screen in a screenshot destined for the repo.

### Rollback

Revert UI commits; keep tokens.

### Next

Phase I.

---

# Phase I — Human accessibility acceptance (TW-05)

### Goal

Close TW-05 **human** AT. Automated axe/preconditions are necessary but
not sufficient.

### Preconditions

Phase H visual bar PASS on the candidate. Automated
`tests/e2e/manual-accessibility-preconditions.spec.ts` green.
`docs/runbooks/manual-accessibility-test.md`.

### Authoritative inputs

The manual AT runbook; ui-ux-rules §1.2 and §5.3; WCAG 2.2 AA as
engineering baseline (not a Taiwan government mark claim).

### Engineering actions (Luna)

Distinguish:

| Track | What it proves | Owner |
| --- | --- | --- |
| Automated accessibility | axe serious/critical; preconditions B2/B4/B9/B12/C1/D proxy | Luna, CI |
| Human accessibility | Screen reader phrases, focus after dialogs, forced colors, zoom, physical device, iOS/Android browsers as needed | Luna drives; human may wear the headset / hold the phone for 2FA and VoiceOver/TalkBack if OS blocks the agent |

Cover: keyboard-only, screen reader, forced colors, zoom, physical
device, focus, forms, dialogs, errors.

Do not claim Taiwan 無障礙標章.

### Change boundary

| May change | Must not change |
| --- | --- |
| UI fixes required by the runbook; dated TW-05 review using the runbook template | Closing TW-05 on axe-only evidence; claiming a government accessibility mark; PII in AT recordings |

### Browser actions

Follow the runbook on Chrome and Safari/iOS or Chrome/Android. Capture
pass/fail per runbook ID. No PII in recordings.

### CLI actions

```bash
corepack pnpm run test:e2e -- accessibility
```

### Tests

Keep preconditions green. Human results go in a dated review using the
runbook template.

### Evidence

Completed runbook table; TW-05 status; checkpoint I.

### PASS

Every runbook item PASS or accepted residual with owner sign.
Automated suite still green.

### FAIL

Axe green used as substitute. Focus lost in dialogs. Forced-colors
state invisible.

### HARD STOP

Cannot operate a physical device and no human is available — record
HUMAN BLOCKER, do not close TW-05.

### Rollback

N/A for a failed AT; fix UI (Phase H loop) then rerun.

### Next

Phase J.

---

# Phase J — Production release

### Goal

A single release gate for an exact SHA. Explicit production authority.
No implied go-live from green CI.

### Preconditions

Phases C (production-ready booking if in FS-001), D (if Calendar in
scope), E, F, G (if legacy data), H, I PASS. D-001～D-005, D-006
evidence, D-010 deploy, D-011 URL, production D-009/D-016 if Calendar
ships. Owner approval for **this SHA**.

### Authoritative inputs

`AGENTS.md` Safety Floor 8; D-013; `docs/runbooks/incident-response.md`;
this section’s checklist.

### Engineering actions (Luna)

Release checklist (all must be evidenced on **this SHA**):

| Gate | Evidence |
| --- | --- |
| Exact SHA | `git rev-parse HEAD` = authorised SHA = deployed SHA |
| Final CI | `Verification evidence` success on that SHA |
| Security | SAST + Gitleaks + tracked-secrets |
| Dependencies | `audit:all` / SCM-R04 status recorded (no silent dismiss) |
| Migrations | Firestore indexes/rules deployed via approved path |
| Backup | PITR on; pre-release backup id |
| Rollback | Previous Hosting version + Cloud Run revision + DNS notes |
| Smoke | health, auth, one synthetic booking **or** authorised real booking |
| Monitoring | alerts armed |
| Incident response | on-call named |
| DNS | Phase F PASS |
| Calendar | Phase D PASS or explicitly out of release |
| Identity | MFA on staff |
| Data | G PASS or “no legacy import” recorded |
| UI/UX | H PASS |
| Accessibility | I PASS |
| Owner approval | named, dated, SHA, project, channel, expiry if preview leftover |

### Change boundary

| May change | Must not change |
| --- | --- |
| Production deploy of the **named SHA** after owner authority; smoke using synthetic fixtures if policy allows | Deploying a different SHA; reusing preview authority; going live with monitoring off; real data without D-001～D-003 |

### Browser actions

Production profile only. Smoke the public book + staff URLs. Confirm no
synthetic-preview banner. Confirm no test calendar.

### CLI actions

Deploy commands only as written in the exact-SHA authority packet.
Read-back revisions.

### Tests

CI on the SHA. Production smoke script (new, minimal) that uses
synthetic fixtures unless real-data authority covers the smoke patient
(prefer synthetic even in production if policy allows a test clinic).

### Evidence

Signed checklist; SHA; revision ids; checkpoint J
`PRODUCTION=YES` only after smoke.

### PASS

All rows PASS; owner named; rollback path tested or rehearsed.

### FAIL

Deployed a different SHA; monitoring off; real data without D-001～D-003.

### HARD STOP

Missing owner production authority for this SHA. Live channel deploy
requested under leftover preview authority (Safety Floor 8).

### Rollback

Hosting previous version; Cloud Run previous revision; DNS previous
records; worker stop; feature kill switch.

### Next

Phase K immediately (first hour).

---

# Phase K — Post-launch

### Goal

Operate first hour, first day, first week. Know when to roll back.

### Preconditions

Phase J PASS. Monitoring accessible in `clinic-production` profile.

### Authoritative inputs

Incident runbook; backup runbook; budget 50/80/100; Calendar failure
runbook.

### Engineering actions (Luna)

| Window | Watch |
| --- | --- |
| First hour | 5xx, auth failures, booking 409/429 spikes, Calendar outbox, Firestore errors, p95 latency, alert noise |
| First day | cost vs budget, Scheduler, watch renewal, backup job, abuse (rate limit), audit completeness |
| First week | PITR restore rehearsal slot, IAM drift, certificate, DNS, remaining SCM-R04, CAL-PILOT expiry if still running |

Rollback if: occupancy corruption; PII in Calendar; auth bypass; data
loss; budget 100% pause conditions; kill switch tripped; owner order.

### Change boundary

| May change | Must not change |
| --- | --- |
| Alert thresholds; canary synthetic booking if policy allows; incident tickets | Quiet-fixing a PII leak; load-tests without authority; applying unrelated Terraform during the first week |

### Browser actions

Dashboards (Cloud Monitoring, Error Reporting, Firebase). Calendar spot
check (allowlisted fields). Staff/patient smoke twice on day 1.

### CLI actions

Read-only metrics. Apply only for rollback under J rollback.

### Tests

Synthetic canary booking if policy allows. Do not load-test production
without authority.

### Evidence

Hour/day/week notes; checkpoint K.

### PASS

No unresolved Sev-1; backups running; cost inside envelope; owner
informed.

### FAIL

Silent error growth; skipped backups; calendar loops.

### HARD STOP

PII leak — incident path, not a quiet fix.

### Rollback

Phase J rollback. Communicate via incident runbook.

### Next

Phase L when the first week is stable **or** when the owner declares
operational acceptance, whichever is later.

---

# Phase L — Project closeout

### Goal

Objective `PROJECT_COMPLETE`. Clinic can operate without a model as
password holder. Synthetic leftovers cleaned or explicitly retained.

### Preconditions

Phase K first-week PASS (or owner-accepted residuals). No open Sev-1.

### Authoritative inputs

This section; `docs/state/conflicts.md`; runbooks; handoff skill
`.claude/skills/handoff-record/SKILL.md`.

### Engineering actions (Luna)

| Item | Done when |
| --- | --- |
| Open risks | Listed with owner and review date |
| Deferred debt | DATA-R03/SCM-R04/TW-05 either closed or accepted with date |
| Runbooks | Backup, incident, Calendar, month-close (if payroll still hidden, say so) |
| Architecture docs | Live vs dated banners match `stage-2-gate-status.json` |
| DR | Restore test dated evidence |
| Operational ownership | Named humans, not “the agent” |
| Credentials ownership | Clinic-owned; developer keys rotated/retired |
| Account transfer | Org/folder/billing/domain |
| Cost ownership | Clinic billing |
| Backups | Schedule + restore proof |
| Support process | How staff report defects |
| Incident contacts | In the runbook |
| Repository cleanup | No secrets; stale execution banners point here or to BAU |
| Branch cleanup | Merged `cursor/*` / `agent/grok-*` / leftover `agent/luna-*` deleted |
| Deprecated staging | Isolated project keep-or-kill owner decision; `beauessence-clinic-staging` CAL-PILOT expiry respected (2026-11-28) |
| Synthetic cleanup | Preview channels expired; unused watch channels deleted |
| Final evidence bundle | SHA, CI, deploy revisions, DNS, Calendar ids (not secrets), AT, UI matrix |

### Change boundary

| May change | Must not change |
| --- | --- |
| Handoff record; expired preview cleanup **after** owner keep-or-kill; merged last-mile branches deleted after confirm | Declaring `PROJECT_COMPLETE` while production was never authorised and is still required; leaving a model as password holder; rewriting C0～C6 to pending |

### Browser actions

Walk the owner through consoles once; confirm they can log in without
a model holding the session.

### CLI actions

```bash
git branch -r --list 'origin/cursor/*' 'origin/agent/grok-*' 'origin/agent/luna-*'
# delete merged remotes only after owner confirm
```

### Tests

`pnpm verify` on the release SHA already done in J; L does not require a
new feature suite.

### Evidence

Handoff record; `PROJECT_COMPLETE` checklist below; checkpoint L.

### PASS

Every `PROJECT_COMPLETE` condition in the next section is true with
evidence.

### FAIL

A model still the password holder; synthetic project forgotten on billing;
docs still say C0 pending.

### HARD STOP

Attempting to declare complete while production authority was never
granted **and** the owner still wants production. Incomplete is honest;
false complete is not.

### Rollback

N/A. If production must be unwound, use J/K rollback, then this phase
records the unwind.

### Next

BAU. Stop. Do not start Expansion S unless the register changes.

---

## PROJECT_COMPLETE definition

All of the following are true, with dated evidence, or explicitly
**out of scope** in the register (FS-001 hidden capabilities):

1. `origin/main` SHA is the production SHA or production is an ancestor
   with no unshipped must-fix.
2. Formal booking state is `ROUTED` **or** FS-001 changed to keep it
   unrouted (must be explicit).
3. Occupancy lock is Firestore; Calendar is projection (ADR-0002).
4. Production Calendar either authorised and PII-clean, or explicitly
   not shipped.
5. Official DNS/TLS for the D-011 URLs, or D-011 records “no official
   DNS this phase”.
6. Identity: individual staff, MFA, idle 30m, absolute 8h.
7. Backups + PITR + a restore exercise.
8. TW-05 human AT done or accepted residual.
9. UI/UX final pass PASS (not merely e2e green).
10. D-001～D-003 published if any real patient data exists.
11. No secrets in git; clinic owns billing/IAM/domain.
12. Incident + backup + Calendar runbooks usable by a non-author.
13. Open risks named; C0～C6 not reopened as pending by mistake.
14. Synthetic leftovers expired or owner-retained with billing owner.
15. Handoff names people, not models.

Until then the checkpoint stays `CURRENT PHASE: K` or earlier.

---

## What this planning change does not do

- Does not wait for Grok; remaining Phases 0 and A–L engineering is Luna’s
  up to each HARD STOP (`LUNA_SOLE_EXECUTOR` / `GROK_RESTS`)
- Does not create a `clinic-production` gcloud config or Chrome profile now
- No `terraform apply`
- No AppModule routing change
- No production, DNS, Hosting live, or real data
- No D-series status invented beyond reconciling **machine** C1～C6
  granted/completed after PR #112
- No sub-agent design
- No secrets
