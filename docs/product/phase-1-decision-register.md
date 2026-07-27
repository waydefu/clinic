# Phase 1 Decision Register

Status values: `pending`, `approved`, `deferred`. A decision is `approved`
only after the named clinic owner records the answer and approval date. Do not
infer an answer from an existing website, social message or Calendar event.

| ID | Decision | Owner | Status | Needed before |
| --- | --- | --- | --- | --- |
| D-001 | Legal data-controller name, privacy contact channel and rights-request process | Clinic owner + privacy/legal owner | pending | Published privacy policy |
| D-002 | Booking-data retention, deletion workflow and vendor/data-region record | Privacy/legal owner + operations | pending | Collecting patient data |
| D-003 | Final policy text, version identifier and publication workflow | Clinic owner + privacy/legal owner | pending | Privacy acceptance or public booking |
| D-004 | Services, practitioners/resources, slot duration/capacity, booking horizon and blackout rules | Clinic operations owner | pending | Slot reservation |
| D-005 | Cancellation cutoff, patient/admin flow, no-show handling and fees | Clinic operations owner + legal owner | pending | Cancellation route or notice |
| D-006 | Identity provider, staff roles, completion authority, permissions and audit retention | Clinic owner + security owner | pending | Authenticated write endpoint |
| D-007 | Case-manager assignment/reassignment, patient-merge review and exception evidence | Case-management owner + operations | pending | Assignment write path |
| D-008 | Payroll metric/rule version, period-lock owner, review and adjustment approval | Finance owner + case-management owner | pending | Payroll-credit persistence |
| D-009 | Calendar owner, selected calendar, authorization model, scopes and minimum event fields | Clinic owner + security owner | pending | Calendar integration review |
| D-010 | Environments, Firebase-project ownership, IAM, backups and monitoring owner | Technical owner + security owner | pending | Cloud deployment |
| D-011 | Booking-site URL, accessibility/language needs and manual-booking fallback | Clinic operations owner | pending | Public booking UX |
| D-012 | Displaying the NHI contracted-institution mark on a publicly reachable page | Clinic owner | approved (preview scope only, 2026-07-26) | Showing the mark outside the clinic's own domain |
| D-013 | Branch protection on `main`: required checks and who may bypass them | Technical owner | approved (2026-07-26) | Treating a green CI run as a merge gate |

## Recorded inputs

### Owner answers to the 2026-07-27 requirements questionnaire

The assistant put 30 questions to the project owner in plain language. These are
**answers of record**; each one still leaves its decision `pending` unless the
row above says otherwise, because several depend on facts nobody has confirmed
yet (a privacy email, the production domain, Workspace availability).

**Clinic facts (verified against two independent public sources, not assumed):**
registered name 一森渼診所 (listed as 不分科), address 臺北市松山區光復北路 112
號 2 樓, phone 02-2577-1314 with toll-free 0800-000-913, opening hours
**Wed–Fri 12:00–20:00 and Sat 10:00–18:00**, closed Sun/Mon/Tue. A web search
summary that claimed Mon–Fri 11:00–20:00 belonged to a **different clinic**
(一森診所, Shilin, neurology) and was discarded. **No public email address
exists**, which is why the privacy contact below is a phone number.

- **D-001/D-003 privacy contact: the clinic phone, for now.** Recorded as
  temporary. A phone-only channel means every rights request has to be written
  down by hand to be auditable; an email address remains the preferred answer
  before real patient data is collected.
- **D-002 retention: delete booking data two years after the visit.** Deletion
  may be performed by administrators only, and must record a reason.
- **D-002 third parties: Google only** (Calendar and cloud) at this stage.
- **D-010 data region: Taiwan (`asia-east1`).**
- **D-004 services: 止鼾 (40–60 minutes) and 醫美 (duration follows the treatment
  plan)**, with the final scope agreed with the patient at the visit. One patient
  per slot. Booking horizon 60 days (provisional). Closed days follow the
  published hours plus national holidays.
- **D-005: patients may cancel up to 24 hours before**; after that it is a phone
  call. No-shows are recorded, not charged.
- **D-006: Google sign-in plus a self-hosted account option** (the clinic has no
  Google Workspace yet). Roles gain **醫師** alongside administrator and front
  desk. Completing a visit stays with front desk and administrators. **Deleting
  a booking may be delegated to the front desk behind a password the
  administrator sets — multiple passwords, each switchable on or off.** Audit
  retention five years.
- **D-007/D-008: make the authority configurable rather than fixed.** Front desk
  and administrators may both assign a case manager; only administrators may
  reassign; both capabilities need an on/off switch in account management. The
  payroll metric is likewise administrator-defined. Only administrators approve
  changes after a period is locked.
- **D-009: the clinic's shared calendar in production, a dedicated test calendar
  for now.** Event contents stay minimal (clinic, booking type, time).
- **D-010: the administrator and the developer own the Cloud project.** RPO one
  hour, RTO four hours. Incident contact: wayde.fu@gmail.com / 0983317651.
- **D-011: an English version is required** (Beau Essence Clinic), and a phone
  number must stay visible for people who do not book online.

### D-006 partial: deletion delegated to the front desk behind a passcode - 2026-07-27

Deleting a booking was administrator-only. The owner's answer was that the front
desk needs it in the moment, but behind a passcode the administrator sets, with
**several passcodes that can each be switched off independently**. Several is
the point: when one person leaves or one code is seen over a shoulder, that code
is revoked without changing everyone else's.

Implemented as a **delegation**, not as a permission move. `front_desk` still
does not hold `delete_appointment`; the delegation is a second, separate path
that requires presenting an enabled authorization. Keeping them apart means the
audit trail always distinguishes "this role has it" from "this person was
authorised this once" — moving the permission into the role would have erased
that distinction permanently.

Rules live in `packages/domain/src/delegated-authorization.ts` so that when real
authentication arrives (D-006), only the comparison changes, not the judgement.
Decisions worth keeping:

- **A disabled authorization is indistinguishable from one that never existed.**
  Reporting "that code is disabled" would confirm to a revoked holder that their
  code was real. Matching happens only within the enabled set.
- **"No authorization configured" and "wrong passcode" are different messages.**
  The first means go and find the administrator; the second means you mistyped.
  Merging them strands the front desk without knowing who to ask.
- **Defaults are off, with no authorizations.** Shipping a default passcode would
  mean the delegation was never really a decision anyone made.
- **The audit records which authorization was used — never the passcode.** Audit
  events get exported, printed and forwarded.
- **The passcode is never displayed back**, not even to administrators. The
  screen is beside patients and gets screenshotted; if it is forgotten, disable
  it and add another.

**Still not a security boundary.** Comparison is plaintext in the browser, same
class as the synthetic login (AUTH-001). D-006 remains `pending`.

### Fonts: system stack retained - 2026-07-27

**Decision: do not load a Chinese webfont.** The zero-kilobyte font budget is
therefore a **decision, not an unfinished task** — a subset Chinese face still
costs several hundred kilobytes against a 58 KB page, and the cost lands hardest
on a phone outside on mobile data. Typography keeps using the system stack, and
`tests/e2e/theme.spec.ts` already pins "not a single font file is downloaded".

### Opening hours corrected to 20:00 - 2026-07-27

The schedule closed at **20:30** while the clinic's own website publishes
**20:00**. The owner confirmed 20:00 is correct, so `defaultSchedule`, the
structured data and the three prose copies now all say 12:00–20:00, and
Wednesday generates 13 初診 / 12 回診 slots (last starts 19:30 and 19:15).

The drift check that caught the prose copies did **not** cover the JSON-LD
numbers, because those use `"opens"/"closes"` rather than the `12:00–20:00`
human form — the structured data could have kept publishing 20:30 to Google
with every check green. That gap is now closed too.

### D-012 NHI mark: knowingly retained on the synthetic preview - 2026-07-26

The 2026-07-26 full-project audit found that the patient page displays the NHI
contracted-institution mark on a publicly reachable preview whose title says
測試版本, and that no document or decision had ever covered the **permission** to
do so — every existing mention treated the mark as an image-budget and
rendering problem. The mark is a registered trademark; the Ministry of Health
and Welfare states that misuse carries liability, and the NHIA publishes usage
notes.

**Owner decision: keep it, risk accepted (option C of three offered).** The
alternatives were to confirm against the NHIA usage notes, or to strip the mark
from the preview and restore it at go-live.

What this decision **is**: the owner reviewed the exposure and chose to leave the
mark in place on the expiring synthetic-review channel.

What it is **not**: a confirmation that the usage complies with the NHIA notes.
Nobody has checked them against this use. That check is still owed before the
mark appears on the production domain, and D-012 must be revisited then — the
`approved` status above is scoped to the preview channel only.

Why the residual risk is small in the meantime: the channel expires in seven
days, carries `X-Robots-Tag: noindex`, and is reachable only by someone given the
link. No asset was changed by this decision.

### D-013 Branch protection: required check plus an admin bypass - 2026-07-26

The same audit found that `verify.yml` runs on every push and that the
`evidence` job is built to fail whenever any upstream job fails — but nothing
proved GitHub was configured to **require** it, and the assistant could not read
that setting (no `gh`, no token). A gate nobody requires is a display.

**Owner decision: require the check, but keep the administrator bypass.**

- Required status check on `main`: **`Verification evidence`** — the job's
  `name:`, not its id `evidence`. GitHub's status-check context uses the display
  name; configuring the id would silently require a check that never reports.
- "Do not allow bypassing the above settings" stays **unchecked**, so the owner
  can still push straight to `main` without a pull request.
- **Any tool acting with the owner's credentials inherits that bypass** — this
  was an explicit requirement so that assistants other than the one that set it
  up keep working. A tool that authenticates as its own GitHub App or a
  fine-grained token under a different identity would be blocked and would have
  to be added to the bypass list deliberately.

**The consequence, stated plainly:** direct pushes by the owner (and by any
assistant using those credentials) are **not** gated by CI. For that path the
real protection is running `corepack pnpm verify` before pushing, which is
convention, not enforcement. The required check protects collaborators and
future pull requests. Verify the setting with
`corepack pnpm run check:branch-protection` (needs a token with
`administration:read`); with no token it exits 2, never 0.

### Web-standards audit directions - 2026-07-26

The 2026-07-26 web-standards audit raised two questions it refused to answer by
guessing. The project owner answered both. These are **build directions for the
synthetic/test implementation**; neither changes a decision status to
`approved`.

- **D-011 direction (booking-site URL): `/booking`.** The patient booking page
  is to be served at `/booking`, which is what `patient.html` already claims in
  its `canonical` and `og:url`. Today the deployed path is `/patient.html` and
  `firebase.json` has no `rewrites`, so the advertised URL 404s — that is the
  defect this direction closes. **D-011 stays `pending`**: the accessibility and
  language needs and the manual-booking fallback are untouched, and the
  registered domain itself is still to be confirmed before go-live.
  `beauessence.com.tw` is only what the markup currently claims; it was not
  inferred from any external source and must be confirmed by the clinic.
- **Build strategy (per-entry bundling): declined. Readability wins.** The audit
  proposed bundling each entry point into one file, which would cut the patient
  page from 31 module requests to 2. The owner declined: `dist/` must stay
  traceable to `public/` file by file so the shipped code can still be read and
  checked against source. The consequence is recorded deliberately —
  `<link rel="modulepreload">` is now the **permanent** answer to the request
  waterfall, not a stopgap, and the module count must be held by a gate so it
  cannot quietly regress.
  - Correction of record: `scripts/build-web.mjs` justified not bundling with
    "CSP is `script-src 'self'`, so the output must stay one file per module".
    That reason is **wrong** — CSP constrains a script's origin and whether it is
    inline, not how many files there are; a single same-origin bundle satisfies
    `script-src 'self'`. The decision stands on the readability grounds above,
    and the comment is to be corrected to say so rather than left asserting a
    constraint that does not exist.

### Owner build directions, formal audit deferred to go-live - 2026-07-24

The project owner reviewed the open decisions and directed that the team keep
building and testing all functionality toward go-live now, and that the formal
answers to D-001～D-011 be **audited together before go-live** rather than
resolved individually today. The following are **build directions for the
test/synthetic implementation only**; they do **not** change any decision status
below to `approved`, and no real patient data may be relied upon.

- **D-002 / D-003 (retention, deletion, policy text): 待定 (deferred).** No
  change; remains `pending` for the pre-go-live audit.
- **D-001 (data controller, privacy contact): 待定 (deferred).** No change;
  remains `pending`.
- **D-006 direction:** staff sign in with **account + password**, and the
  **manager (管理者) may cancel/delete**. This records the intended shape for the
  test build. D-006 stays `pending`: the identity provider, MFA, session policy,
  full role/permission matrix and audit-retention answer are exactly what the
  go-live audit must still settle, and none may be inferred from this note.
  - Implementation reading of "cancel/delete" (2026-07-24, synthetic build):
    the front desk **keeps** cancelling — it is a daily counter action, and
    routing it through a manager would stall the front desk. **Deleting** is
    administrator-only (`delete_appointment`), because it removes the record
    from the operational list and leaves only the audit event. Deletion also
    requires a reason from a closed list (`duplicate_record`, `wrong_patient`,
    `created_in_error`), since the audit event outlives the record it explains.
    Patient-initiated erasure is deliberately **not** one of those reasons: it
    is a data-rights workflow gated on D-002. This split is a build decision
    for the test system and is exactly the kind of detail the D-006 audit must
    confirm or overturn.
- **D-009 direction:** use a **dedicated test calendar** for now, with the
  **manager (管理者) as the responsible owner**. Consistent with the 2026-07-23
  test-integration authority. D-009 stays `pending`: the production calendar,
  authorization model, scopes and minimum event fields remain for the audit.
- **CAL-001 (patient calendar export) decided:** the patient's downloaded
  `.ics` stays a **single reminder time point** (start time only, day-before
  alarm), which is what `modules/calendar-export.js` already implements
  (2026-07-22 direction). The clinic-side one-hour projection is a separate
  path. No further change required; covered by `calendar-export.test.ts`.

Standing limits unchanged: `noindex`, synthetic data only, no cloud backend, no
authenticated write endpoint and no real Calendar connection are enabled by this
note. Changing a decision to `approved` still requires the named owner to record
the answer, approval date and evidence in the table and template below.

### Patient identity fields in the preview - 2026-07-21

- The project owner directed that the booking flow collect 姓名、電話、
  生日（西元）、身分證字號 and 有無健保卡, and that the public preview be
  updated with those fields rather than keeping them local-only. The national
  ID is the identity key behind the "one active booking per person" limit.
- This was recorded because it reverses an earlier guardrail: the test-only UI
  guard previously rejected every input field on the patient page. It now
  enforces an explicit allowlist instead, so any further field is a deliberate
  decision rather than a drift.
- Mitigations built in: lists render the national ID masked
  (`A12****789`, `modules/patient-registry.js`), the patient form states that
  entries stay in the visitor's own browser, and the workbench keeps a
  one-click "清除本機資料".
- Scope and residual risk: values are held in the visitor's own
  `localStorage`. Nothing is transmitted to, or stored by, the clinic — there
  is still no backend, database, Authentication or Calendar connection.
  Persistence on a shared device is the residual risk.
- This does **not** approve D-001 through D-003. Lawful basis, retention,
  deletion workflow, the published policy text and the real identity model
  remain `pending`, and no real patient data may be relied upon operationally.

### Google Calendar test-integration authority - 2026-07-23

- The project owner directed connecting the **real** Google Calendar API as a
  test ("測試不審核" — a test, outside the formal review), and authorised
  writing the real client for it.
- Scope of what this authorises: the `GoogleCalendarClient` code
  (`apps/worker/src/google-calendar.ts`), which reads its credentials only from
  environment variables (`GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`)
  and defaults to the in-memory fake when they are absent. Event content stays
  minimised (clinic name, visit kind, time, address, appointment id — no
  patient PII), enforced by a test.
- What it does **not** do, and the standing limits that still apply:
  - It does **not** approve D-009. D-009 (calendar owner, authorization model,
    scopes, dedicated calendar, minimum event fields) remains `pending` for any
    production use. This authority is a test integration only.
  - The calendar id must point at a **dedicated test calendar**, never a
    doctor's private or a production clinic calendar.
  - No real patient data (D-001～D-003 still pending). The synthetic workbench
    does not call Google at all; only the worker, run with the owner's own
    credentials, would — and no service-account key is ever committed.
  - The assistant did not and will not create the Google Cloud project or
    generate/enter the credentials; that remains the owner's action.

### Synthetic online preview authority - 2026-07-21

- The project owner explicitly requested a non-production real-device online
  test version.
- A separate Firebase project, `beauessence-clinic-staging`, was created only
  for static Firebase Hosting preview channels. No Firestore, Functions,
  Storage, Authentication, Calendar or other backend integration was enabled.
- Preview channel `synthetic-review` uses browser-local synthetic state and is
  publicly reachable to anyone with the URL. Redeployed 2026-07-24 (same URL)
  with the CSP `object-src` hardening, forced-colors support, the branded 404
  and the synthetic account+password login gate; it now expires on 2026-07-31
  at 02:30 Asia/Taipei. The workbench now opens on that synthetic login gate
  (test credentials are shown on the page); it is a UX prototype, not a security
  boundary, and does not change D-006. The patient page is unaffected.
- This authorization does **not** approve D-001 through D-011, does not permit
  real data, and does not authorize a Firebase live-channel deployment.
- Operating and deletion instructions are in
  `docs/runbooks/synthetic-online-preview.md`.

### Synthetic front-desk capability baseline - 2026-07-25

- The project owner directed completing and jointly accepting the corrective
  role, responsive-header, notification and maintenance-mode batch while
  leaving visual Phase 5 unchanged.
- The synthetic front-desk role may create and process appointments, record a
  doctor's follow-up decision, and make the first case-manager assignment.
  Reassignment, business-hours governance, staff permissions, announcements,
  maintenance controls, advanced settings, local-state reset and audit remain
  supervisor-only.
- The implementation must enforce those boundaries in the rendered DOM, hash
  routing, UI action dispatch and synthetic store. Hiding a control alone is
  not accepted as authorization.
- This is a browser-local build and acceptance direction only. It does **not**
  approve D-006, create a real identity or RBAC system, authorize a cloud
  backend, permit real data, or change any D-001 through D-011 status.

### Test-only authority - 2026-07-20

- The project owner authorised local synthetic testing while all formal
  approvals remain blank.
- This does **not** approve D-001 through D-011 and does not change their
  `pending` status. The only permitted values are the explicit synthetic
  parameters in `docs/product/test-only-sandbox-baseline.md`.
- The test profile cannot collect real data, expose an API route, create a
  cloud project or call an external service.

### D-001 - 2026-07-20

- Clinic name supplied by the project owner: 一森渼診所
- Address supplied by the project owner: 10560臺北市松山區復勢里光復北路112號2樓
- Public details verified from the [official clinic website](https://beauessence.com.tw/reservations/)
  on 2026-07-20: general phone `02-2577-1314`, toll-free phone
  `0800-000-913`, address 臺北市松山區光復北路112號2樓, and published
  hours Monday-Friday 11:00-20:00 / Saturday 11:00-16:00. The public medical
  institution listing also matches the clinic name, street address and general
  phone number.
- The published phones are general contact channels only. They must not be
  presented as a privacy-rights contact channel until the clinic explicitly
  approves that use and the handling process.
- The Taiwan privacy legal baseline was checked on 2026-07-20. It requires the
  policy to name the actual non-public data controller; a responsible physician
  must not be used as a substitute unless the clinic's legal owner confirms
  that is the registered controller name. See
  `docs/security/taiwan-privacy-legal-baseline.md`.
- Still required: confirmation that the clinic name is the legally registered
  data-controller name, plus the privacy contact channel and patient-rights
  request process.
- Status: pending

## Approval record template

```text
Decision ID:
Answer:
Approved by:
Approval date (Asia/Taipei):
Evidence / policy reference:
Follow-up implementation issue:
```

Changing an approved decision requires a dated superseding record and review of
the affected contract, domain rule, audit behavior, privacy notice and runbook.
