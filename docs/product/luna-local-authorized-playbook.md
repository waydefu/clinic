# Luna local authorized playbook

**Type:** current local execution card. Not a production grant.
**Audience:** GPT-5.6 Luna on the owner’s laptop. Read **this file only**
until Card 8 PASSes.
**Authority id:** `LUNA_SOLE_EXECUTOR` / `GROK_RESTS` (2026-09-12).
**Does not authorize:** production, real patient data, official DNS, live
Hosting, production Calendar, or routing `/v1/bookings`.

You are the **sole remaining executor**. Grok rests. Do not wait for a
cloud agent. After Card 8 PASSes, continue the numbered cards, then the
matching phase in
[luna-local-project-completion-master-plan.md](luna-local-project-completion-master-plan.md).
Stop at every HARD STOP. Do not use sub-agents. Do not reconstruct two
months of chat. Do not invent D-series approval.

Longer identity rules live in the master plan §8. Open that file only if
a card below says so.

---

## Constants (do not invent others)

```text
ISOLATED_PROJECT=beauessence-clinic-stg-c1a01
FORBIDDEN_PROJECT=beauessence-clinic-staging
REGION=asia-east1
GCLOUD_CONFIG=clinic-staging
CHROME_PROFILE=clinic-synthetic
```

---

## You may

- Create/activate `clinic-staging` gcloud config
- Sign in gcloud CLI and ADC as **two separate** logins
- `firebase login` / `login:list` / `login:use` / `projects:list`
- Read-only inspect `beauessence-clinic-stg-c1a01`
- After Card 8 PASS: remaining **non-production** engineering in Cards
  9–13 (Phase 0 pin, Phase A, D-006 against
  `packages/domain/src/roles.ts`, Phase B **drafts**, tests, docs,
  unrouted source)
- After Card 13: later phases **only** when that card’s gate is green;
  otherwise emit HUMAN BLOCKER and stop that phase
- PRs on `cursor/luna-<topic>`
- Ask the human once for password / 2FA / security key

## You must not

- Wait for Grok, or leave work “for the cloud agent”
- Create `clinic-production` gcloud config or Chrome profile
- `terraform apply` (C1～C6 already PASS; no new exact-SHA packet here)
- Route `AppointmentController`, `BookPilotModule`, or
  `CalendarWatchController` in `apps/api/src/app.module.ts` until Card 14
  says the D-series gate is green
- Use `firebase login:ci` or `FIREBASE_TOKEN`
- Download a service-account JSON key
- Treat `gcloud auth list` as proof of ADC
- Target `beauessence-clinic-staging` for C1～C6
- Approve D-series, attach production billing, touch official DNS, or
  use real patient/payroll data
- Implement Expansion S (D-014/D-015 clinical/money) unless the register
  changes

---

## Card 0 — Tools

From the repository root:

```bash
git fetch origin main
git rev-parse origin/main
command -v gcloud
command -v firebase
command -v terraform
gcloud --version
firebase --version
```

If `gcloud` or `firebase` is missing: install it yourself first with the
OS package manager or the official installer. Only if installation needs
a sudo password / OS confirmation you cannot complete, stop and emit
`INTERACTIVE_HUMAN_STEP` for the human to install them. Do not invent
another login method.

---

## Card 1 — Git pin

```bash
git checkout -B cursor/luna-local-now origin/main
git status --short
```

Never commit to `main`. If `git status` shows files you did not change:
stop and report them. Do not `reset --hard` or `checkout -- .`.

---

## Card 2 — Chrome

Use profile `clinic-synthetic` only.

1. Open Chrome with that profile (not the owner’s personal profile).
2. Open `chrome://settings/people` and `https://myaccount.google.com/`.
3. Confirm the Google account is the clinic/dev account for **synthetic**
   work. Screenshot the email **domain only**.
4. Do not create profile `clinic-production`.

If the human must enter password / 2FA / a security key: wait. That is
`INTERACTIVE_HUMAN_STEP`. After they finish, continue Card 3.

---

## Card 3 — gcloud CLI identity (not ADC)

```bash
gcloud config configurations list
gcloud config configurations describe clinic-staging >/dev/null 2>&1 \
  || gcloud config configurations create clinic-staging
gcloud config configurations activate clinic-staging
gcloud auth list
gcloud config get-value account
gcloud config get-value project
```

If no CLI account is active:

```bash
gcloud auth login
```

Then:

```bash
gcloud config set account YOUR_ACCOUNT
gcloud config set project beauessence-clinic-stg-c1a01
gcloud config get-value account
gcloud config get-value project
```

`YOUR_ACCOUNT` comes from `gcloud auth list` after the human finishes
the browser. Do not type a guessed email.

HARD STOP if `gcloud config get-value project` is
`beauessence-clinic-staging`.

---

## Card 4 — Application Default Credentials (not gcloud CLI)

gcloud CLI login does **not** set ADC. Changing configuration does
**not** change ADC.

```bash
printf 'GAC=%s\n' "${GOOGLE_APPLICATION_CREDENTIALS:-unset}"
gcloud auth application-default print-access-token >/dev/null \
  && echo ADC_TOKEN_OK \
  || echo ADC_MISSING
```

If `GAC` is a path to a `*.json` key: **HARD STOP**. Unset it. Do not
use the key.

If `ADC_MISSING`:

```bash
gcloud auth application-default login
```

Human completes the browser / 2FA. Then re-run the `print-access-token`
check (still redirect to `/dev/null`). Do not print the token.

Prefer user ADC. Impersonation only if a named packet already requires:

```bash
gcloud auth application-default login \
  --impersonate-service-account SERVICE_ACCT_EMAIL
```

Do not assume `gcloud active account = ADC account`.

---

## Card 5 — Firebase CLI

```bash
firebase login
firebase login:list
firebase projects:list
```

If more than one Google account:

```bash
firebase login:use ACCOUNT_EMAIL
firebase projects:list
```

Confirm `beauessence-clinic-stg-c1a01` is listed. Do not
`firebase use` a production project. Do not run `firebase login:ci`.

---

## Card 6 — Read-only discovery

Values stay in the terminal. Do not paste billing IDs, tokens, or keys
into chat or git.

```bash
gcloud auth list
gcloud config configurations list
gcloud config list
gcloud projects describe beauessence-clinic-stg-c1a01 \
  --format='yaml(projectId,name,lifecycleState,parent)'
gcloud billing accounts list
gcloud organizations list
ORG_ID="$(gcloud organizations list --format='value(name)' | awk 'NR==1')"
if [ -n "$ORG_ID" ]; then
  gcloud resource-manager folders list --organization="$ORG_ID"
else
  echo ORG_VISIBLE=no
fi
```

`ORG_VISIBLE=no` is not an identity failure (missing org browse
permission, or no-org). Skip folders list. Never run
`gcloud resource-manager folders list` without `--organization` or
`--folder`.

---

## Card 7 — Snapshot

Write `output/evidence/account-context-snapshot.txt` (gitignored).
Redact emails to domain. Never commit it.

```text
ACCOUNT_CONTEXT_SNAPSHOT
environment: synthetic-isolated
current authority: LUNA_SOLE_EXECUTOR / GROK_RESTS (not production)
gcloud configuration: clinic-staging
gcloud identity: <email-or-UNVERIFIED>
gcloud project: beauessence-clinic-stg-c1a01
organization: <id-or-ORG_VISIBLE=no>
folder: <from project parent; do not commit unless required>
billing account: present/absent (do not commit the id)
ADC identity / source: user-adc | impersonation | missing
GOOGLE_APPLICATION_CREDENTIALS: unset | path-only
Firebase CLI account: <email-or-UNSET>
Firebase project: beauessence-clinic-stg-c1a01 listed? yes/no
browser Google account / Chrome profile: clinic-synthetic
Terraform target: none this card (no apply)
CLI + browser + Terraform agree: <yes | NO-HARD-STOP>
```

If any row is missing, mixed, or `NO-HARD-STOP`: read-only only. Do not
continue to Card 8 as PASS.

Also write `output/evidence/luna-checkpoint.txt` using the block in the
master plan §2, with `CURRENT PHASE: 0` and
`NEXT EXACT ACTION: Card 8 isolated project read-back`.

---

## Card 8 — Isolated project read-back (PASS gate)

CLI:

```bash
gcloud config get-value project
gcloud projects describe beauessence-clinic-stg-c1a01 \
  --format='yaml(projectId,lifecycleState)'
firebase projects:list
```

Browser (profile `clinic-synthetic`):

1. GCP Console project picker = `beauessence-clinic-stg-c1a01`; separately
   verify that the resources/configuration expected to be regional use
   `asia-east1`.
2. Confirm it is **not** `beauessence-clinic-staging`.
3. Firebase Console: same isolated project.
4. Reload. Screenshot the project id (no secrets).

**PASS (identity):** all true:

- `clinic-staging` is the active gcloud configuration
- `gcloud config get-value project` = `beauessence-clinic-stg-c1a01`
- `ADC_TOKEN_OK`
- `GOOGLE_APPLICATION_CREDENTIALS` is `unset`
- Firebase lists the isolated project
- Chrome profile is `clinic-synthetic`
- snapshot file exists locally and is not staged in git

**FAIL:** any mismatch. Fix or HARD STOP. Do not “continue anyway”.

After PASS: continue Card 9. Do not stop for Grok.

---

## Card 9 — Remaining-work map (after identity PASS)

Do these cards in order. Skip nothing. Stop at that card’s HARD STOP /
HUMAN BLOCKER.

| Next | What | Class |
| --- | --- | --- |
| Card 10 | Phase 0 pin: git / Canon / AppModule | `LUNA_CAN_FINISH` |
| Card 11 | Phase A: classify stale live Canon | `LUNA_CAN_FINISH` |
| Card 12 | D-006 implementation against `roles.ts` | `LUNA_CAN_FINISH` |
| Card 13 | Phase B **drafts** only | `LUNA_CAN_FINISH`; signoff is human |
| Card 14 | Phase C booking route | HUMAN BLOCKER until D-001～D-005 approved |
| Card 15 | Phases D–G production Calendar / infra / DNS / data | HUMAN BLOCKER until named authority |
| Card 16 | Phases H–I UI / AT on synthetic | `LUNA_CAN_FINISH` on synthetic; production pass later |
| Card 17 | Phases J–L release / closeout | HUMAN BLOCKER without production authority |

Open the matching phase in the master plan **after** this card. Follow
that phase’s Change boundary / HARD STOP.

Still forbidden on every card: AppModule booking/watch route unless
Card 14’s gate is green; `terraform apply`; production; DNS; live
Hosting; real data; `clinic-production`.

---

## Card 10 — Phase 0 pin

From the worktree root:

```bash
git fetch origin main
git rev-parse origin/main
git log -1 --oneline origin/main
rg -n "AppointmentController|BookPilotModule|CalendarWatchController" \
  apps/api/src/app.module.ts
```

Confirm:

1. `docs/architecture/stage-2-gate-status.json` — C0～C6 `completed`,
   C1～C6 `granted`.
2. `apps/api/src/app.module.ts` imports only `CalendarPilotModule` +
   `HealthController` (no booking/watch).
3. Register D-series **table** (not old prose). Copy live statuses into
   the checkpoint.
4. Production / DNS / live Hosting / real data still `NOT_AUTHORIZED`.

If a **live** Canon file still tells agents to start C1 or says C2～C6
are `not_granted`, fix that sentence in Card 11. Do not rewrite dated
reviews. Do not change `stage-2-gate-status.json` values.

Write checkpoint `CURRENT PHASE: 0` / `NEXT EXACT ACTION: Card 11`.
Then Card 11.

---

## Card 11 — Phase A consolidation

Branch: `cursor/luna-a-consolidation` from `origin/main`.

1. Classify every open item (must-fix / should-fix / may-defer /
   obsolete / accepted risk) using the master plan Phase A table.
2. Replace **live** sentences that still say C0 is open or C2～C6
   `not_granted`. Keep dated reviews as dated.
3. Do not close DATA-R03 without remaining codecs. Do not dismiss
   Dependabot. Do not implement payroll/clinical/money.

```bash
corepack pnpm run generate:governance-state
corepack pnpm run check:docs
corepack pnpm run check:architecture
corepack pnpm run check:governance
corepack pnpm run check:format
```

Commit, push, open a PR. Wait for this SHA’s `verify`. Then Card 12.

HARD STOP: `terraform apply` or mounting `/v1/bookings` “while cleaning
docs”.

---

## Card 12 — D-006 implementation

D-006 is **approved**. Implement evidence against
`packages/domain/src/roles.ts` only.

```bash
rg -n "admin|front_desk|physician|manager|consultant|case_manager" \
  apps packages --glob '!**/vendor/**'
```

Rules:

- No new role string literals outside `roles.ts`.
- `physician` stays empty-permission.
- Do not add `admin` as a live role.
- Do not route AppModule.
- Do not implement D-014/D-015 permission columns.

Add the smallest test that proves the success and a denied case. Run the
covering gate. PR on `cursor/luna-d006-<topic>`.

Then Card 13.

---

## Card 13 — Phase B drafts (not approval)

Fill packet blanks **already decided** by FS-001 / C0-ENG-REC / ADRs
(capacity 1, cutoff 10:00, roles from `roles.ts`, region `asia-east1`).

Do **not** invent legal controller name, processor agreement, medical
record fields, or production calendar ids. Do **not** flip a register
row to `approved` without named owner, date, scope, and exclusions.

If D-001～D-005 are still `pending` after the draft: emit HUMAN BLOCKER
(one question per ID family) and continue Cards 16 synthetic UI only.
Do **not** start Card 14.

---

## Card 14 — Phase C booking (gated)

**Gate (all required):** D-001, D-002, D-003, D-004, D-005 `approved`
with ceremony, and Card 12 D-006 evidence exists.

If any ID is still `pending`:

```text
HUMAN BLOCKER
PHASE: C
DECISION OR RESOURCE: D-001～D-005 named approval
ONE QUESTION: which pending D-001～D-005 IDs are approved with owner/date/scope/exclusions?
WHY I CANNOT PROCEED: Safety Floor forbids routing /v1/bookings before those IDs
WHAT I WILL NOT DO UNTIL ANSWERED: import AppointmentController / BookPilotModule
SAFE OPTIONS (if any): stay UNROUTED; continue Card 16 synthetic UI
```

If the gate is green: open master plan Phase C. Follow Engineering
actions (Luna). Prefer isolated BookPilot before production
AppointmentController. Keep occupancy in Firestore. Calendar is not the
lock.

---

## Card 15 — Phases D–G (production Calendar / infra / DNS / data)

Open the matching master-plan phase. Prepare source, drafts, and tests
if useful. **Do not mutate production cloud.**

| Phase | HUMAN BLOCKER until |
| --- | --- |
| D | production D-009 and D-016 approved |
| E | exact-SHA production deploy packet (D-010 design ≠ deploy) |
| F | D-011 URL + DNS ownership authority |
| G | real-data authority; never copy prod data into synthetic |

Create `clinic-production` gcloud config / Chrome profile only after
production is authorised (`LOCAL_LATER` until then).

`terraform apply` only when a written packet names this HEAD SHA.

---

## Card 16 — Phases H–I (synthetic UI / accessibility)

May start on synthetic without production authority.

- Follow `docs/design/ui-ux-rules.md` R-1–R-26.
- Playwright: `getByRole` / `getByLabel`; no coordinate clicks.
- TW-05 human AT still needs a human. You prepare the script; you do
  not fake AT PASS.

HARD STOP if the UI looks like production (official hostname, live
Hosting, real patient strings).

---

## Card 17 — Phases J–L (release / closeout)

Do not declare `PROJECT_COMPLETE` while production was never authorised
**and** the owner still requires production. Incomplete is honest.

Handoff names people, not models. Grok stays rested unless the owner
un-rests Grok in writing.

---

## Human blocker (one question only)

```text
HUMAN BLOCKER
PHASE: Luna playbook Card <n>
DECISION OR RESOURCE:
ONE QUESTION:
WHY I CANNOT PROCEED:
WHAT I WILL NOT DO UNTIL ANSWERED:
SAFE OPTIONS (if any):
```

Never ask the human to paste a password, token, ADC JSON, or private key
into chat.

---

## HARD STOP (any card)

- Production project, live Hosting channel, official hostname, or real
  patient row
- Secret in the git tree
- gcloud CLI account and ADC disagree
- `GOOGLE_APPLICATION_CREDENTIALS` points at a convenience JSON key
- Request to apply to `beauessence-clinic-staging` as production
- Request to create `clinic-production` “just in case”
- Routing `/v1/bookings` while D-001～D-005 are pending
