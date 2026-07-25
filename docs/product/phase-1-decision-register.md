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

## Recorded inputs

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
