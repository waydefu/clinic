# BLOCKER_HARVEST and MASTER_BLOCKER_REGISTER — 2026-09-13

Dated evidence, not an approval. As-of GitHub / CLI inventory:
`2026-09-13T15:56:36Z`. This record does not authorize production, real
data, DNS mutation, live Hosting, production Calendar, or `/v1/bookings`.

**Executor:** `GROK_UNRESTED` / `GROK_PROJECT_CLOSER` (owner direction this
session). `GROK_RESTS` / `LUNA_SOLE_EXECUTOR` remains the laptop Luna card.

**Bound SHAs (fresh fetch):**

| Ref | SHA |
| --- | --- |
| `origin/main` | `36f81011fcc2f9c82a51f83b79a285b5fa2cc794` |
| PR #117 HEAD | `96fc9aaa4dc23b5ec553a8236dd77798f130c5b9` |
| PR #116 HEAD | `de2075f4325360766874c8ebaecca62c6098d941` |

Exact-head CI on both open PRs: `verify` 12/12 PASS, 0 review threads, 0
reviews, `MERGEABLE` / `CLEAN` against that main. No open PR #118+.

---

## PR dependency graph

```text
PR     HEAD       BASE      CI     MERGEABILITY  CONFLICT          SUPERSEDED?  MUST LAND BEFORE
#117   96fc9aa    36f8101   12/12  MERGEABLE     overlaps #116     no           #116 (security > docs)
#116   de2075f    36f8101   12/12  MERGEABLE     docs/README.md,   no           after #117 rebase
                                                 enterprise-appointment-project-plan.md
```

Do not merge #116 and #117 in parallel. Independent review of #117 (this
session, code + CI, not a GitHub review event): hashed persistence, scrypt
N=32768 r=8 p=1, `timingSafeEqual`, fail-closed verifier, synthetic browser
path isolated, booking still UNROUTED. Residual before this follow-on: no
atomic store, no denied-event sink. Merge of #117 itself is still
`HUMAN_ACTION_REQUIRED` (this token cannot merge).

---

## D-series approval harvest

Owner input is not approval. Missing ceremony for every still-`pending` row:
named approver, approval date, scope, exclusions. Several also need
legal / privacy / medical review as the register already states.

| ID | Status | Formal approval metadata | Production relevance |
| --- | --- | --- | --- |
| D-001 | pending (input 2026-08-16) | named approver/date/scope/exclusions missing; privacy/legal review missing | blocks published privacy policy and real patient collection |
| D-002 | pending | same + backup-deletion semantics and Google processor agreement unanswered | blocks collecting patient data and deletion workflow |
| D-003 | pending | same + final text, version ID, publication approval outstanding | blocks privacy acceptance / public booking |
| D-004 | pending | same; 2026-09-13 provisional “default 30 min duration” **conflicts** with 2026-07-28 “duration known only at visit — do not hard-code” | blocks slot reservation and `/v1/bookings` |
| D-005 | pending | same; cutoff 10:00 Asia/Taipei is recorded input, not approval | blocks cancellation route |
| D-006 | approved 2026-07-28; implementation evidence pending | policy ceremony complete; implementation still unrouted | required for authenticated write; not a route grant |
| D-007 | pending | named professional ceremony missing | blocks assignment write path |
| D-008 | pending; some sub-items deferred | finance ceremony missing | blocks payroll-credit persistence |
| D-009 | pending for production; CAL-PILOT synthetic sub-scope approved | production Calendar owner/calendar/scopes still unapproved | production Calendar writes forbidden |
| D-010 | approved 2026-07-28 (target architecture / SLO) | not deployment authority | production apply still requires a fresh exact-SHA packet |
| D-011 | pending | production URL still undecided; FS-001 hostnames are suggestions only | blocks public booking UX and official DNS |
| D-012 | approved preview-only 2026-07-26 | not a general public-domain grant | NHI mark outside clinic domain still gated |
| D-013 | approved; admins bound 2026-09-09 | live `enforce_admins` readback `UNAVAILABLE` this token | merge gate exists; this agent cannot re-read protection JSON |
| D-014 | pending | medical/legal classification still requires named professional review | blocks clinical/surgical persistence |
| D-015 | pending; ledger/refund/settlement deferred | finance ceremony missing | blocks money persistence |
| D-016 | pending for production; CAL-PILOT synthetic sub-scope approved | production inbound Calendar still unapproved | Calendar-to-system production writes forbidden |

2026-09-13 provisional D-001–D-005 owner direction was treated as
**input to verify**, not as approval, and was **not** written into the
register as a new approved answer. D-004 default-30-minute duration is
explicitly not implemented.

---

## MASTER_BLOCKER_REGISTER

Status vocabulary is closed: `RESOLVED` | `ACTIONABLE_BY_GROK` |
`HUMAN_ACTION_REQUIRED` | `EXTERNAL_AUTHORITY_REQUIRED` | `UNAVAILABLE` |
`SUPERSEDED`.

### B-001 — PR #117 merge

- **category:** PR / merge
- **blocked capability:** land D-006 hashed-delegation slice on `main`
- **exact root cause:** this integration token has `permissions.push=false`
  and `ManagePullRequest` has no merge action; `gh` is read-only
- **current evidence:** OPEN, MERGEABLE, CLEAN, 12/12 PASS, run
  `34765355315`, Verification evidence `103745746006`
- **owner:** clinic technical owner
- **severity:** high
- **dependency:** none other than human merge authority
- **exact resolution:** human merges #117 after reading this review; do not
  rebuild
- **can Grok solve it?** no
- **requires human?** yes
- **requires external approval?** no (CI already green)
- **safe parallel work:** this stacked follow-on
- **resume action:** merge #117 then rebase #116
- **status:** `HUMAN_ACTION_REQUIRED`

### B-002 — PR #116 merge

- **category:** PR / merge
- **blocked capability:** Phase 0 Firebase `login:list` hardening + Canon
  reconcile docs
- **exact root cause:** docs overlap with #117 (`docs/README.md`,
  `docs/enterprise-appointment-project-plan.md`); merge token same as B-001
- **current evidence:** OPEN, MERGEABLE, CLEAN, 12/12 PASS, run
  `34713250166`; HEAD advanced from older `6dd812f` to `de2075f`
- **owner:** clinic technical owner
- **severity:** medium
- **dependency:** B-001
- **exact resolution:** rebase onto post-#117 main, exact-head CI, then merge
- **can Grok solve it?** rebase/CI yes after #117 lands; merge no
- **requires human?** yes for merge
- **requires external approval?** no
- **safe parallel work:** none on those two doc files
- **resume action:** wait for #117 on main
- **status:** `HUMAN_ACTION_REQUIRED`

### B-003 — D-001–D-005 / D-007 / D-011 / D-014 formal approval

- **category:** D-series
- **blocked capability:** published privacy policy, public booking, deletion
  workflow, DNS hostname, clinical persistence
- **exact root cause:** recorded input without named approver, date, scope,
  exclusions; several legal/privacy/medical reviews missing
- **current evidence:** decision register table rows remain `pending`
- **owner:** clinic owner + privacy/legal/medical/operations as per row
- **severity:** critical
- **dependency:** none (ceremony)
- **exact resolution:** complete the register’s own approval format; do not
  let an agent mark `approved`
- **can Grok solve it?** no
- **requires human?** yes
- **requires external approval?** yes (legal/privacy/medical where listed)
- **safe parallel work:** unrouted implementation evidence
- **resume action:** owner fills approval packets
- **status:** `EXTERNAL_AUTHORITY_REQUIRED`

### B-004 — D-006 routed identity / C4

- **category:** identity
- **blocked capability:** authenticated staff write, routed RBAC
- **exact root cause:** AppModule still only `HealthController` +
  `CalendarPilotModule`; Identity Platform staff IdP not wired; this slice
  adds unrouted evaluators only
- **current evidence:** C0–C6 `completed`/`granted` on isolated project
  `beauessence-clinic-stg-c1a01` is not production identity
- **owner:** security owner + implementer
- **severity:** high
- **dependency:** B-003 for booking route; D-006 policy already approved
- **exact resolution:** keep UNROUTED until D-001–D-005 approved **and**
  route authority exists; continue unrouted evidence
- **can Grok solve it?** unrouted remaining slices yes; routing no
- **requires human?** yes to route
- **requires external approval?** yes for production IdP
- **safe parallel work:** this PR’s unrouted evaluators
- **resume action:** do not mount `/v1/bookings`
- **status:** `EXTERNAL_AUTHORITY_REQUIRED`

### B-005 — Firebase / gcloud / ADC / Terraform in this VM

- **category:** login / CLI identity
- **blocked capability:** any cloud read-back or apply
- **exact root cause:** `gcloud`, `firebase`, `terraform` binaries missing;
  ADC file absent. Browser session ≠ gcloud ≠ ADC ≠ Firebase ≠ Terraform
- **current evidence:** commands not found; no
  `~/.config/gcloud/application_default_credentials.json`
- **owner:** laptop Luna / human
- **severity:** high for cloud, none for local code
- **dependency:** human OAuth / 2FA / security key (never paste secrets)
- **exact resolution:** see HUMAN_LOGIN_ACTION cluster below
- **can Grok solve it?** not in this VM without those binaries **and**
  interactive OAuth
- **requires human?** yes
- **requires external approval?** no for login; yes for production project
- **safe parallel work:** all local engineering
- **resume action:** official CLI login on a machine that has the SDKs
- **status:** `UNAVAILABLE` here; `HUMAN_ACTION_REQUIRED` on laptop

### B-006 — GitHub branch-protection readback

- **category:** GitHub
- **blocked capability:** live `enforce_admins` / required-check JSON
- **exact root cause:** `GET /repos/waydefu/clinic/branches/main/protection`
  returned 403; `X-Accepted-Github-Permissions: administration=read`
  ([Get branch protection](https://docs.github.com/en/rest/branches/branch-protection);
  [fine-grained permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens))
- **current evidence:** `branches/main.protected=true`; rulesets API `[]`;
  D-013 approved 2026-09-09 that admins are bound
- **owner:** repository administrator
- **severity:** medium (does not lower protection)
- **dependency:** Administration:read token
- **exact resolution:** human runs the readback command below; do not
  weaken required checks
- **can Grok solve it?** no with this token
- **requires human?** yes
- **requires external approval?** no
- **safe parallel work:** all code
- **resume action:** `gh api repos/waydefu/clinic/branches/main/protection`
- **status:** `UNAVAILABLE`

### B-007 — Production deploy / DNS / real data / production Calendar

- **category:** production
- **blocked capability:** `PROJECT_COMPLETE`
- **exact root cause:** Safety Floor items 1 and 8; Remain-disabled list;
  D-009/D-010/D-011/D-016 production authority absent
- **current evidence:** register; isolated C1–C6 project is not production
- **owner:** clinic owner + technical/security owner
- **severity:** critical
- **dependency:** B-003, exact-SHA packet, billing, IAM
- **exact resolution:** fresh explicit per-commit authority; never reuse
  preview/CAL-PILOT apply
- **can Grok solve it?** no
- **requires human?** yes
- **requires external approval?** yes
- **safe parallel work:** adapters, tests, runbooks, dry-run tooling
- **resume action:** do not apply
- **status:** `EXTERNAL_AUTHORITY_REQUIRED`

### B-008 — TW-05 manual accessibility

- **category:** accessibility
- **blocked capability:** D-011 launch evidence
- **exact root cause:** axe serious/critical is CI-gated; screen-reader /
  forced-colors / real-device AT cannot be automated
- **current evidence:** `docs/runbooks/manual-accessibility-test.md`;
  automated preconditions spec exists
- **owner:** human tester with NVDA or VoiceOver
- **severity:** medium (does not block other engineering)
- **dependency:** none
- **exact resolution:** fill the packet in this document; do not fake PASS
- **can Grok solve it?** no (manual AT)
- **requires human?** yes
- **requires external approval?** no
- **safe parallel work:** all other work
- **resume action:** run the packet against `apps/web/dist`
- **status:** `HUMAN_ACTION_REQUIRED`

### B-009 — SCM-R04 remaining cross-major

- **category:** supply-chain
- **blocked capability:** closing SCM-R04 ID
- **exact root cause:** `firebase-tools` still pulls `csv-parse@5` /
  `stream-json@1`; owner SLA holds cross-major to 2026-10-09; do not
  dismiss Dependabot
- **current evidence:** 2026-09-10 SCM-R04 review
- **owner:** maintainer
- **severity:** low (below `audit-level high`)
- **dependency:** 2026-10-09 re-review
- **exact resolution:** same-major only until the dated re-review
- **can Grok solve it?** not by forcing a breaking CLI upgrade
- **requires human?** re-review on that date
- **requires external approval?** no
- **safe parallel work:** all product work
- **resume action:** 2026-10-09 fresh-check
- **status:** `HUMAN_ACTION_REQUIRED`

### B-010 — DATA-R03 ID still OPEN

- **category:** data
- **blocked capability:** closing DATA-R03
- **exact root cause:** five engineering slices on main; no dual-write;
  D-007/D-008 persistence still pending
- **current evidence:** 2026-09-09 DATA-R03 review
- **owner:** data/backend
- **severity:** medium
- **dependency:** D-007/D-008 for remaining codecs/persistence
- **exact resolution:** do not close the ID
- **can Grok solve it?** remaining dual-write policy would guess D-007/D-008
- **requires human?** yes for those decisions
- **requires external approval?** yes (D-007/D-008)
- **safe parallel work:** other unrouted work
- **resume action:** leave ID OPEN
- **status:** `EXTERNAL_AUTHORITY_REQUIRED`

### B-011 — Named reviewer metadata

- **category:** governance
- **blocked capability:** C0 named-reviewer ceremony
- **exact root cause:** `NAMED_REVIEWER_METADATA_PENDING`; must not fabricate
  person-names
- **current evidence:** register 2026-09-11 packet
- **owner:** clinic owner
- **severity:** medium
- **dependency:** none
- **exact resolution:** owner records reviewer person-names
- **can Grok solve it?** no
- **requires human?** yes
- **requires external approval?** no
- **safe parallel work:** all engineering
- **resume action:** fill names in C0 packet
- **status:** `HUMAN_ACTION_REQUIRED`

### B-012 — Durable lockout / audit store

- **category:** D-006 implementation
- **blocked capability:** production lockout and denied-event retention
- **exact root cause:** this PR proves in-memory atomicity and append-only
  sink; Firestore / Secret Manager wiring waits for a routed write path and
  D-002 retention
- **current evidence:** unrouted `DelegatedAuthorizationService`
- **owner:** implementer after route authority
- **severity:** medium
- **dependency:** B-003, B-004 routing
- **exact resolution:** same-transaction C5 write when routing is authorised
- **can Grok solve it?** not without routing + D-002
- **requires human?** yes for those gates
- **requires external approval?** yes (D-002)
- **safe parallel work:** keep UNROUTED
- **resume action:** do not mark D-006 implementation complete
- **status:** `EXTERNAL_AUTHORITY_REQUIRED`

### B-013 — UI stored-role migration

- **category:** D-006 / UI
- **blocked capability:** single live role vocabulary in workspace state
- **exact root cause:** fixtures and login still store `admin`; this PR maps
  via `normaliseRole` so permission lookup is canonical `manager`
- **current evidence:** `state-schema.js` default account `role: 'admin'`;
  e2e still types username `admin` (handle, not role)
- **owner:** implementer
- **severity:** low
- **dependency:** versioned state migration + e2e update
- **exact resolution:** migrate stored role to `manager` in a dedicated UI
  PR with `ui-check` / e2e
- **can Grok solve it?** yes in a later UI-focused PR
- **requires human?** no for code; TW-05 still human
- **requires external approval?** no
- **safe parallel work:** this non-UI PR
- **resume action:** separate UI PR
- **status:** `ACTIONABLE_BY_GROK`

### B-014 — Node runtime in this cloud VM

- **category:** toolchain
- **blocked capability:** matching `engines.node` `>=24.20.0`
- **exact root cause:** default `node` is v22; nvm has `v24.20.0`
- **current evidence:** `nvm` lists `v24.20.0`
- **owner:** this agent
- **severity:** low
- **dependency:** none
- **exact resolution:** `nvm use 24.20.0` for gates
- **can Grok solve it?** yes
- **requires human?** no
- **requires external approval?** no
- **safe parallel work:** n/a
- **resume action:** use nvm 24.20.0
- **status:** `ACTIONABLE_BY_GROK`

### B-015 — Formal booking still UNROUTED

- **category:** booking
- **blocked capability:** `/v1/bookings`
- **exact root cause:** D-001–D-005 not approved; D-006 implementation
  evidence not complete; no route authority
- **current evidence:** `AppModule` has no `AppointmentController` /
  `BookPilotModule`
- **owner:** safety floor
- **severity:** critical for `PROJECT_COMPLETE`, correctly blocked
- **dependency:** B-003, B-004
- **exact resolution:** wait for approvals + evidence + explicit route
  authority
- **can Grok solve it?** no
- **requires human?** yes
- **requires external approval?** yes
- **safe parallel work:** unrouted booking tests already on main
- **resume action:** keep 404
- **status:** `EXTERNAL_AUTHORITY_REQUIRED`

---

## This follow-on slice (Grok, stacked on #117)

Unrouted, synthetic-only. Does **not** close D-006 implementation evidence.

- Atomic per-actor+purpose attempt store (in-memory exclusive queue)
- Denied-event audit sink (no secret/salt/hash/authorization id)
- `DelegatedAuthorizationService` wires verify + lock + audit; lock
  denials stay `secret_not_recognised` to the caller
- Staff IdP mapping: D-006 roles only; rejects synthetic-browser source;
  `admin` → `manager`; never emits `admin`
- Session evaluator: D-006 30-minute idle / 8-hour absolute; disabled
  account fails first. Firebase session cookies have no idle timeout
  ([Manage session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies))
- Field projection omits D-014/D-015 columns for every role (omit key, not
  `null`)
- Browser permission table keyed by `manager` via `normaliseRole`

KDF parameters remain Node `scryptSync` as in #117
([Node.js crypto.scryptSync](https://nodejs.org/api/crypto.html#cryptoscryptsyncpassword-salt-keylen-options)).

---

## PRODUCTION_READINESS_MATRIX

| Item | Mark | Note |
| --- | --- | --- |
| production project authority | `BLOCKED` | not granted |
| billing authority | `BLOCKED` | not granted |
| gcloud profile | `UNAVAILABLE` | CLI missing here |
| Firebase project (isolated C1–C6) | `NOT_REQUIRED` for production | `beauessence-clinic-stg-c1a01` is synthetic |
| `beauessence-clinic-staging` | `BLOCKED` | Q-STAGING read-only; forbidden for new C1–C6 apply |
| ADC | `UNAVAILABLE` | absent |
| Terraform target | `UNAVAILABLE` | CLI missing; no apply |
| Cloud Run production | `BLOCKED` | |
| Hosting live channel | `BLOCKED` | Safety Floor 8 |
| IAM production | `BLOCKED` | |
| DNS / D-011 | `BLOCKED` | URL undecided |
| TLS | `BLOCKED` | follows DNS |
| Calendar production | `BLOCKED` | D-009/D-016 production pending |
| secrets in repo | `READY` | none tracked; do not add |
| migration / real data | `BLOCKED` | no real-data authority |
| monitoring / rollback / DR | `BLOCKED` | production RPO/RTO unproven |
| automated accessibility | `READY` | CI axe serious/critical |
| TW-05 manual AT | `BLOCKED` | packet below |
| AppModule booking | `NOT_REQUIRED` until gates | correctly UNROUTED |

---

## Identity inventory (this VM)

| Surface | Result |
| --- | --- |
| Browser Google | `UNAVAILABLE` (no GUI session proven) |
| Browser GitHub | `UNAVAILABLE` |
| Browser Firebase | `UNAVAILABLE` |
| Browser GCP Console | `UNAVAILABLE` |
| `gh` | logged in as `cursor`; GitHub App token; no Administration:read; no merge |
| `gcloud auth list` | `UNAVAILABLE` (binary missing) |
| active gcloud config / project | `UNAVAILABLE` |
| ADC | `UNAVAILABLE` |
| Firebase CLI | `UNAVAILABLE` (binary missing) |
| Terraform credentials | `UNAVAILABLE` |

---

## TW-05 manual test packet

Copy, run on `apps/web/dist`, fill pass/fail. Do not treat axe CI as this
packet. Full procedure:
[manual-accessibility-test.md](../runbooks/manual-accessibility-test.md).

| ID | Device | Browser | AT | Page | Task | Expected | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TW05-A1 | Windows PC | Chrome latest | NVDA browse mode | `/booking` | `H` through headings | Continuous h1→h2→h3; first h1 names the clinic booking page | |
| TW05-A6 | Windows PC | Chrome latest | NVDA | `/booking` | Submit booking | `#patient-status` live region announces success or reason | |
| TW05-B1 | Windows PC | Chrome latest | NVDA | `/` | Login gate | Username/password labelled; “not a security boundary” spoken | |
| TW05-B2 | Windows PC | Chrome latest | NVDA | `/` | Login as synthetic `admin` / `beauessence-admin` | Focus enters main; not stuck on gone form | |
| TW05-B4 | Windows PC | Chrome latest | Keyboard only | `/` | First Tab | Skip link; activates `#main-content` | |
| TW05-C1 | Windows PC | Chrome + forced-colors | none | `/` and `/booking` | Tab through controls | Focus ring visible using system colors | |
| TW05-VO1 | macOS | Safari | VoiceOver | `/booking` | Same as A1/A6 | Same expected results | |

Tester / date / build SHA: ________

---

## HUMAN ACTION cluster

Do not paste passwords, OTP, tokens, ADC JSON, or service-account keys.

```text
BLOCKER: B-001 / B-002
WHY: this agent cannot merge; #116 and #117 overlap two doc files
EXACT ACTION: merge PR #117 first; rebase #116; merge #116
WHERE: https://github.com/waydefu/clinic/pull/117 then /116
EXPECTED RESULT: both closed, main contains 117 then 116
DO NOT SHARE: merge tokens
WHAT GROK WILL DO AFTER: continue unrouted D-006 / Calendar prep on fresh main
```

```text
BLOCKER: B-003 / B-007 / B-015
WHY: D-001–D-005 (and D-007/D-011/D-014) are recorded input, not approved;
     production/DNS/real-data/Calendar production/booking route have no authority
EXACT ACTION: complete named-approver / date / scope / exclusions on each
     packet; issue a fresh exact-SHA production packet only if you intend to
     deploy; decide D-011 hostname; do not approve the conflicting D-004
     “default 30 min duration” without superseding the 2026-07-28 visit-duration
     answer
WHERE: docs/product/phase-1-decision-register.md and the listed approval packets
EXPECTED RESULT: pending rows become approved with ceremony, or stay pending
DO NOT SHARE: legal advice as a chat paste of secrets
WHAT GROK WILL DO AFTER: implement only the newly approved scope
```

```text
SYSTEM: gcloud
ACTION: install Cloud SDK if missing, then official user login (not ADC)
SCREEN/PATH: gcloud auth login official Google OAuth
EXPECTED RESULT: gcloud auth list shows an account; config clinic-staging exists
DO NOT SHARE: password, OTP, token
RESUME COMMAND: gcloud auth list && gcloud config configurations list
```

```text
SYSTEM: ADC
ACTION: separate application-default login
SCREEN/PATH: gcloud auth application-default login
EXPECTED RESULT: ADC JSON exists locally (never commit it)
DO NOT SHARE: ADC JSON
RESUME COMMAND: gcloud auth application-default print-access-token >/dev/null
```

```text
SYSTEM: Firebase
ACTION: official firebase login; then login:list / projects:list
SCREEN/PATH: firebase login official Google OAuth
EXPECTED RESULT: isolated project beauessence-clinic-stg-c1a01 visible;
     do not target beauessence-clinic-staging for C1–C6 apply
DO NOT SHARE: password, OTP, token
RESUME COMMAND: firebase login:list && firebase projects:list
```

```text
SYSTEM: GitHub Administration:read
ACTION: read main branch protection with a token that has Administration:read
SCREEN/PATH: repo Settings → Branches, or
  gh api repos/waydefu/clinic/branches/main/protection
EXPECTED RESULT: JSON with enforce_admins and required_status_checks;
     compare to D-013 (admins bound)
DO NOT SHARE: the token
RESUME COMMAND: gh api repos/waydefu/clinic/branches/main/protection --jq "{enforce_admins:.enforce_admins.enabled,checks:.required_status_checks.checks}"
```

```text
BLOCKER: B-008 TW-05
WHY: screen readers and real forced-colors cannot be faked from CI
EXACT ACTION: run the TW-05 packet above on dist
WHERE: packed apps/web/dist; NVDA+Chrome or VoiceOver+Safari
EXPECTED RESULT: filled pass/fail with tester name and SHA
DO NOT SHARE: nothing secret
WHAT GROK WILL DO AFTER: file the dated evidence; not a substitute for other work
```

```text
BLOCKER: B-011 named reviewers
WHY: NAMED_REVIEWER_METADATA_PENDING must not be invented
EXACT ACTION: record reviewer person-names in the C0 packet
WHERE: docs/reviews/2026-09-11-c0-engineering-acceptance.md and register
EXPECTED RESULT: names present; D-series values unchanged unless you also
     complete those ceremonies
DO NOT SHARE: unnecessary PII
WHAT GROK WILL DO AFTER: stop treating named-reviewer as a Grok task
```

---

## PROJECT_COMPLETE

`PROJECT_COMPLETE = HUMAN_BLOCKED`

Grok-solvable work in this harvest that this follow-on actually does:
unrouted D-006 atomic lock + denied audit + IdP/session/field helpers +
executor Canon. Remaining Grok-solvable after merge: B-013 stored-role
migration (UI PR), Calendar non-production hardening already largely on
main, rebase of #116 once #117 lands.
