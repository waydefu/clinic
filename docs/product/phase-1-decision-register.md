# Phase 1 Decision Register

Status values: `pending`, `approved`, `deferred`. A decision is `approved`
only after the named clinic owner records the answer and approval date. Do not
infer an answer from an existing website, social message or Calendar event.

Current delivery position: Stage 0／Checkpoint A passed on 2026-07-24. The
project is now at Stage 1 owner decisions. D-010 infrastructure ownership,
region and resilience targets and D-006 identity/security controls were
approved on 2026-07-28. The decision prerequisites for a Stage 2 proposal are
therefore present, but cloud staging still requires a separately reviewed and
explicitly authorised change plan; neither approval creates a project, deploys
a backend or proves that the controls or RPO/RTO have been achieved. D-014～
D-016 track the separate surgery/clinical/finance/Calendar-inbound expansion
and do not change the current Phase 1 gate.

**All 39 owner questions came back answered on 2026-08-16**, and the
question-by-question reconciliation is
[the 2026-08-17 record](../reviews/2026-08-17-owner-decision-reconciliation.md).
The answers are recorded input, not approval: the sheet carries answers without
the named approver, approval date, scope and exclusions its own approval format
requires, so every status below is unchanged in value. The next gate is approval
qualification — collecting that missing metadata and the legal, privacy and
medical reviews — followed by C0 closure. **This does not unlock Stage 2.**

| ID | Decision | Owner | Status | Needed before |
| --- | --- | --- | --- | --- |
| D-001 | Legal data-controller name, privacy contact channel and rights-request process | Clinic owner + privacy/legal owner | pending (owner input recorded 2026-08-16) | Published privacy policy |
| D-002 | Booking-data retention, deletion workflow and vendor/data-region record | Privacy/legal owner + operations | pending (owner input recorded 2026-08-16; backup-deletion semantics and the Google processor agreement remain unanswered) | Collecting patient data |
| D-003 | Final policy text, version identifier and publication workflow | Clinic owner + privacy/legal owner | pending (owner input recorded 2026-08-16; final text, version ID and publication approval outstanding) | Privacy acceptance or public booking |
| D-004 | Services, practitioners/resources, slot duration/capacity, booking horizon and blackout rules | Clinic operations owner | pending (superseding owner direction recorded 2026-08-16: capacity 1, booking horizon 1 month; earlier 60-day provisional horizon superseded) | Slot reservation |
| D-005 | Cancellation cutoff, patient/admin flow, no-show handling and fees | Clinic operations owner + legal owner | pending (superseding owner direction recorded 2026-08-16: cutoff is 10:00 on the appointment day; the earlier 24-hour rule is superseded) | Cancellation route or notice |
| D-006 | Identity provider, staff roles, completion authority, permissions and audit retention | Clinic owner + security owner | approved (2026-07-28; implementation evidence pending) | Authenticated write endpoint |
| D-007 | Case-manager assignment/reassignment, patient-merge review and exception evidence | Case-management owner + operations | pending (owner input recorded 2026-08-16) | Assignment write path |
| D-008 | Payroll metric/rule version, period-lock owner, review and adjustment approval | Finance owner + case-management owner | pending; period-close and adjustment sub-items deferred (owner direction recorded 2026-08-16) | Payroll-credit persistence |
| D-009 | Calendar owner, selected calendar, authorization model, scopes and minimum event fields | Clinic owner + security owner | pending for production; 30-day CAL-PILOT synthetic-only sub-scope approved 2026-08-28 (dedicated allowlisted calendars, closed synthetic fields, no real data) | Outbound Calendar integration review |
| D-010 | Environments, Firebase-project ownership, IAM, backups and monitoring owner | Technical owner + security owner | approved (target architecture and SLO, 2026-07-28) | Cloud deployment |
| D-011 | Booking-site URL, accessibility/language needs and manual-booking fallback | Clinic operations owner | pending (superseding owner direction recorded 2026-08-16: no English version; the production URL is still undecided) | Public booking UX |
| D-012 | Displaying the NHI contracted-institution mark on a publicly reachable page | Clinic owner | approved (preview scope only, 2026-07-26) | Showing the mark outside the clinic's own domain |
| D-013 | Branch protection on `main`: required checks and who may bypass them | Technical owner | approved (2026-07-26) | Treating a green CI run as a merge gate |
| D-014 | Clinical/surgical record boundary, accountable medical owner, fields, retention, correction and export | Medical owner + privacy/legal owner | pending (owner operational direction recorded 2026-08-16; the legal/medical classification still requires named professional review) | Storing surgery, anesthesia or clinical follow-up data |
| D-015 | Patient payment/refund ledger, accounting authority, reconciliation and staff-settlement source | Finance/accounting owner + clinic owner | pending; ledger, refund and settlement sub-items deferred (owner direction recorded 2026-08-16) | Persisting money or settlement amounts |
| D-016 | Inbound Google Calendar edits, matching, reviewer authority, conflict/delete semantics and sync SLO | Clinic owner + security owner + operations | pending for production; 30-day CAL-PILOT synthetic-only sub-scope approved 2026-08-28 (manager/front desk review, private link ID, five-minute target) | Calendar-to-system writes |

## Recorded inputs

### CAL-PILOT D-009／D-016 synthetic-only sub-scope approval — 2026-08-28

The project owner explicitly directed implementation of the pasted
“CAL-PILOT 30 天線上雙向同步計畫” and confirmed execution after identifying
their authority for this test as clinic owner, security owner and operations.
This records a narrow approval, not a production decision:

- **Scope:** one active source selected from exactly two allowlisted dedicated
  CAL-PILOT calendars; synthetic patient codes only; titles are restricted to
  `[預約] A17｜初診｜止鼾` and `[忙碌] 會議` closed formats; five-minute
  incremental synchronization; Google changes become review candidates;
  `manager` may switch sources and `manager`／`front_desk` may review.
- **Expiry and cost:** 30 days after deployment; kill switch disables inbound,
  outbound and synchronization at expiry; NT$300 budget notifications at
  50%／80%／100% are alerts, not a spending cap.
- **Explicit exclusions:** no production project, production calendar, patient
  name, phone, record, clinical note, payment, attendee, location or other
  free text; no production D-009/D-016 approval; no deployment apply before the
  final exact commit／image digest／resource diff／rollback confirmation.
- **Accepted residual risk:** low synthetic traffic may still incur Cloud Run,
  Scheduler, Firestore, Secret Manager or logging charges; budget notifications
  do not stop spend automatically. A failed source switch must leave the old
  source active, and production must use entirely new identities, secrets,
  allowlists, cursors, audit and kill switch.

The table rows remain `pending for production` because this sub-scope neither
classifies real patient/clinical fields nor authorizes a production Calendar.

### Owner answers to the 2026-07-27 requirements questionnaire

The assistant put 30 questions to the project owner in plain language. These are
**answers of record**; each one still leaves its decision `pending` unless the
row above says otherwise, because several depend on facts nobody has confirmed
yet (a privacy email, the production domain, Workspace availability).

**Clinic facts re-checked on 2026-07-28:** the official clinic site matches
the name 一森渼診所, address 臺北市松山區光復北路 112 號 2 樓, phone
02-2577-1314 and toll-free 0800-000-913. Its current
[reservations page](https://beauessence.com.tw/reservations/) publishes
**Mon–Fri 11:00–20:00 and Sat 11:00–16:00**. That conflicts with the recorded
owner answer and current synthetic code, which use **Wed–Fri 12:00–20:00 and
Sat 10:00–18:00**, closed Sun/Mon/Tue. The earlier claim that the official
schedule belonged to a different clinic was incorrect. On 2026-07-28 the
project owner selected the latter schedule as the formal operating direction;
the official site is now the stale surface that must be corrected. D-004 still
needs executable duration/capacity/resource answers before the whole decision
can be approved. **No public email address was found**, which is why the
temporary privacy-contact input below uses the clinic phone.

- **D-001/D-003 privacy contact: the clinic phone, for now.** Recorded as
  temporary. A phone-only channel means every rights request has to be written
  down by hand to be auditable; an email address remains the preferred answer
  before real patient data is collected.
- **D-002 retention: delete booking data two years after the visit.** Deletion
  may be performed by administrators only, and must record a reason.
- **D-002 third parties: Google only** (Calendar and cloud) at this stage.
- **D-010 data region: Taiwan (`asia-east1`).**
- **D-004 services: 止鼾 and 醫美 actual treatment duration is not fixed before
  arrival**, with the final scope agreed with the patient at the visit. The
  earlier 40–60-minute stop-snoring range is superseded as a formal scheduling
  rule; neither service gets a catalogue duration, selectable duration
  increment or auto-calculated treatment end. One patient per slot remains a
  candidate. ~~Booking horizon 60 days is provisional.~~ **Superseded
  2026-08-16: the booking horizon is 1 month, with 2 months reconsidered only
  after operations stabilise.** One patient per slot is likewise no longer a
  candidate — the 2026-08-16 answer sets concurrent capacity to 1. Closed days
  follow the published hours plus national holidays.
- **D-004 booking multiplicity: multiple services are allowed in one formal
  appointment** (owner answer, 2026-07-28). The browser already uses multiple
  `itemIds`, while the executable API contract/domain still accepts one
  `serviceId`/`itemId`; the routed contract, persistence and idempotency model
  must move together. Later on 2026-07-28 the owner clarified that the actual
  duration of both 止鼾 and 醫美 is only known at the visit and must not be
  hard-coded. Formal design must therefore separate the concrete operational
  slot interval used for conflict/capacity control from
  `actualStartedAt`／`actualEndedAt` encounter facts. Multi-service selection
  does not auto-sum service durations. The published slot-block/capacity rule,
  multi-service occupancy and buffer/overrun handling remain unanswered.
- ~~**D-005: patients may cancel up to 24 hours before**~~; after that it is a
  phone call. No-shows are recorded, not charged. **Superseded 2026-08-16: the
  patient self-cancellation cutoff is 10:00 on the appointment day.** After the
  cutoff it remains a phone call, no-shows are still not charged, and three
  no-shows now restrict future booking.
- **D-006 approved:** Google sign-in plus a clinic-managed local-account option
  (the clinic has no Google Workspace yet). Roles gain **醫師** alongside
  administrator and front desk. Completing a visit stays with front desk and
  administrators. **Deleting a booking may be delegated to the front desk
  behind multiple administrator-issued authorization codes that are hashed,
  individually revocable and attempt-limited.** All staff require MFA; local
  accounts use TOTP; idle timeout is 30 minutes and absolute session lifetime
  is 8 hours; disabling an account must reject its next protected request.
  Administrators may delete qualifying appointment records, while audit is
  permanent, append-only and cannot be deleted by any role. Unspecified actions
  and emergency access default to denied.
- **D-007/D-008: make the authority configurable rather than fixed.** Front desk
  and administrators may both assign a case manager; only administrators may
  reassign; both capabilities need an on/off switch in account management. The
  payroll metric is likewise administrator-defined. Only administrators approve
  changes after a period is locked.
- ~~**D-009: the clinic's shared calendar in production**~~, a dedicated test
  calendar for now. Event contents stay minimal (clinic, booking type, time).
  **Superseded 2026-08-16: production uses a separate, dedicated calendar, not
  the clinic's existing shared one.** The same answer set also asks for the
  service item to appear on the event, which is in tension with minimal event
  contents and must not be implemented before D-009 classifies that field.
- **D-010 approved target (2026-07-28):** the clinic is the legal and billing
  owner of Cloud projects; administrator and developer roles hold governed IAM
  access; the primary region is `asia-east1`; RPO is one hour and RTO is four
  hours, including whole-project and regional failures. Incident contact:
  wayde.fu@gmail.com / 0983317651. This approval requires the Stage 2 design to
  close the current single-region/cross-project recovery gap; it is not evidence
  that backups, failover, alerts or a restore drill already exist.
- ~~**D-011: an English version is required** (Beau Essence Clinic)~~, and a
  phone number must stay visible for people who do not book online.
  **Superseded 2026-08-16: no English version is required.** The visible manual
  fallback number is confirmed as 02-2577-1314.

### Owner answers to the 39-question decision list - 2026-08-16

All 39 questions came back answered. The full question-by-question
reconciliation, including which earlier answers these supersede, is
[the 2026-08-17 reconciliation record](../reviews/2026-08-17-owner-decision-reconciliation.md).

**Attribution (recorded 2026-08-17; corrected 2026-08-23).** The 2026-08-17
record stated that the answers were filled in by the clinic owner, and concluded
that two approval-format fields — approver and approval date — were therefore
satisfied. **The technical owner corrected this on 2026-08-23: the clinic owner
gave the answers verbally and the technical owner transcribed them on the owner's
behalf.**

**That correction removes the approver field, not just weakens it.** A verbal
statement relayed and written down by someone else is not the named approver's
own recorded approval, and the answer sheet is explicit on this point: 「口頭說
『可以』不足以解除系統的檢查關卡」— saying "yes" out loud does not release the
system's check gates. At most the **date** of the verbal statement is recorded.
Every row below therefore has **one fewer** approval-format field satisfied than
the 2026-08-17 record claimed.

Nothing about the answers' content changed; the reconciliation in
[the 2026-08-17 record](../reviews/2026-08-17-owner-decision-reconciliation.md)
remains accurate. Only the attribution and its consequence changed. That dated
record is left unedited as historical evidence.

**They are still not approvals.** Four things are missing, and they are
missing for different reasons:

0. **A named approver's own signature.** See the correction above. This is now
   the first gap, not an assumed-satisfied field.

1. **Co-approvers.** The owner column below is not "clinic owner" alone for
   most rows. D-002/D-003 need the privacy/legal owner, D-005 the legal owner,
   D-009/D-016 the security owner, D-014 the medical **and** privacy/legal
   owners. The clinic owner's answer does not stand in for them.
2. **Scope, explicit exclusions and accepted residual risk** are not recorded
   for any of the 39, and the answer sheet requires all three.
3. **Several answers do not cover the question asked** — backups, the Google
   processor agreement and the budget-threshold actions are each half-answered
   (see the bullets below).

Every decision below therefore stays `pending` or `deferred`. What changed is
that the input now exists and is attributed.

- **D-001/D-003 rights requests:** the clinic's responsible person and Mr. Yan
  are the named contacts, reached on the clinic phone, with designated staff
  performing additions, corrections and deletions. The privacy policy is signed
  off by the responsible person; superseded policy versions and consent records
  are kept for 2 years. A patient's request for a copy of their own data is
  answered within 1 week. The phone-only channel still has to be made auditable,
  and the delivery format is unspecified.
- **D-002 retention and deletion:** booking data is kept 2 years, confirming the
  earlier answer. Deletion is owned by the clinic's responsible person and
  leaves a system deletion record. **The question asked whether backups are
  deleted with the primary copy; the answer addresses the system only, so backup
  deletion, restore-replay and legal hold remain unanswered.**
- **D-002/D-010 region: Taiwan**, consistent with the recorded `asia-east1`.
- **D-002/D-009 Google as processor:** the answer permits authorising users on
  Google Calendar. **It does not answer whether a data-processing agreement is
  required**, which was the second half of the question.
- **D-004 scheduling:** concurrent capacity is 1; multiple services occupy one
  fixed booking time and durations are not summed; the horizon is 1 month;
  Sunday, Monday and Tuesday are closed and the responsible person may close a
  day; a running-late clinic is adjusted manually by the front desk. The
  operational slot interval, the resource model behind the capacity of 1, buffer
  and overrun handling and blackout semantics are still unanswered.
- **D-005 cancellation:** patients may cancel until 10:00 on the appointment day;
  after that they phone in; no-show carries no fee; three no-shows restrict
  future booking. How long the restriction lasts, who may override or reset it,
  and how emergencies are handled are not answered.
- **D-007 case management:** assignment is manual, a supervisor may reassign, and
  the patient is not notified. `王小姐` reviews duplicate-patient merges. Merge
  rollback, mistaken-merge recovery and merge evidence remain open, and
  "supervisor" has not been mapped onto the existing `administrator` role.
- **D-008/D-015 finance:** performance and commission are based on the
  transaction amount. Period close, post-lock adjustment, the authoritative money
  ledger, refunds and the staff-settlement source are all **deferred** by owner
  direction. Nothing here authorises persisting money or settlement amounts.
- **D-009/D-016 Calendar:** production uses a separate dedicated calendar;
  inbound Calendar edits and deletions go to manual review; on conflict the
  system is authoritative with a 30-minute target. The owner also asks for the
  service item on the event. Reviewer role, matching identity, delete semantics
  and the privacy classification of event contents are unresolved, and no
  Calendar connection is authorised.
- **D-011 public booking:** the production booking URL is to sit under the
  existing site pending discussion with the server vendor; no English version;
  the manual fallback number is 02-2577-1314.
- **D-012 NHI mark:** the owner wants the mark on the formal website. The
  existing approval still covers the synthetic preview only; production use is
  recorded as owner intent, not as an enlarged approval.
- **D-014 surgery and clinical data — operational direction, not a legal
  classification.** The owner's direction is that the system retains only the
  surgery name, keeps it for six months, accepts correction requests by phone or
  email, and that the stored item is intended as operational
  scheduling/follow-up information rather than a full clinical chart. **Whether
  these records are legally medical records under the Medical Care Act is not
  settled by this answer** and remains subject to named medical, privacy and
  legal review. Do not implement clinical persistence on the strength of it.
- **D-010/C0 cost:** the clinic and its responsible person own the cloud bill;
  the staging budget ceiling is NT$2,000 per month; budget alerts go to `王小姐`
  with the responsible person copied. **The question also asked what action to
  take at 50%, 80% and 100%; only the recipients were answered, so C0 cost
  governance is still incomplete** — an alert with no agreed action is not a
  control.

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

**The current browser implementation is still not a security boundary.**
Comparison is plaintext in the synthetic browser, same class as the synthetic
login (AUTH-001). The policy was later approved, but no production IdP,
server-side hash comparison, session enforcement or authorization route exists.

### D-006 identity, security and audit boundary approved - 2026-07-28

The owner first approved the safe interpretation of “unlimited;
administrator self-deletes”:

- an administrator may delete an appointment only through the separately
  authorised delete command and its closed reason codes;
- the resulting audit event outlives the appointment;
- audit storage is permanent and append-only;
- administrators, developers, service accounts and every other role are denied
  audit deletion.

The owner then approved **all remaining D-006 controls**:

- Google federated sign-in plus clinic-managed local accounts; credentials stay
  in the approved IdP rather than application/Firestore documents;
- staff roles include administrator, front desk and physician; front desk and
  administrators may complete a visit, while unlisted actions are denied;
- all staff must use MFA; local accounts use TOTP;
- idle timeout is 30 minutes and absolute session lifetime is 8 hours;
- disabling an account revokes its sessions and must reject the next protected
  request, rather than waiting for a previously issued token to expire;
- authorization codes are stored only through a salted memory-hard KDF,
  individually revocable, never displayed again and retry-limited; repeated
  failures lock delegation verification and produce audit;
- no break-glass policy was included in the approval. The safe planning default
  is therefore fail-closed until emergency access is separately decided.

Implementation and test details are frozen in the
[Stage 2 identity and cloud change plan](../architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md).
D-006 is `approved`; this is a policy approval, not evidence that the current
synthetic role switch, plaintext demonstration code or any cloud identity
boundary satisfies it.

**Retention clarification required by D-002 (2026-08-11 audit):** append-only
integrity means an authorised event cannot be edited or silently deleted; it
does not by itself authorise indefinite linkability to a patient. D-002 must
still decide retention, pseudonymisation, legal hold, rights-request handling,
deletion tombstones and restore-time deletion replay. Until then, “permanent”
is the recorded D-006 integrity direction, not a completed privacy/legal
retention determination or production implementation.

### Fonts: system stack retained - 2026-07-27

**Decision: do not load a Chinese webfont.** The zero-kilobyte font budget is
therefore a **decision, not an unfinished task** — a subset Chinese face still
costs several hundred kilobytes against a 58 KB page, and the cost lands hardest
on a phone outside on mobile data. Typography keeps using the system stack, and
`tests/e2e/theme.spec.ts` already pins "not a single font file is downloaded".

### Opening hours selected; official site correction required - 2026-07-28

The obsolete **20:30** synthetic closing time was correctly removed after the
owner confirmed a 20:00 weekday close. The current `defaultSchedule`,
structured data and clinic prose use Wed–Fri 12:00–20:00 and Sat
10:00–18:00; Wednesday generates 13 初診 / 12 回診 slots (last starts 19:30
and 19:15).

The clinic's official reservations page was re-checked on 2026-07-28 and still
publishes Mon–Fri 11:00–20:00 and Sat 11:00–16:00. The owner then selected
**Wed–Fri 12:00–20:00 and Sat 10:00–18:00** as the formal operating schedule.
The repository already matches that answer; the official site must be corrected
through its own controlled content process. D-004 no longer needs a
service-derived duration: the owner has said that actual stop-snoring and
aesthetic duration is known only at the visit and must not be hard-coded.
D-004 remains pending for the operational slot-block/capacity, multi-service
occupancy, resource, horizon, blackout and overrun rules. Any `20:30` value
remains stale.

### D-010 infrastructure and resilience target approved - 2026-07-28

The owner approved the clinic as legal/billing owner of the Cloud projects,
governed IAM access for administrator and developer roles, `asia-east1` as the
primary region, and RPO one hour／RTO four hours for database, whole-project and
regional failures.

This is a **target approval, not implementation evidence**. The current plan is
single-region, no cloud project/backend has been created, and no cross-project
or cross-region restore has been exercised. Stage 2 must produce a reviewed
change plan that identifies separated environments, least-privilege roles,
alert recipients, backup/failover mechanisms, cost and a drill capable of
demonstrating the target. D-006 and D-010 decision prerequisites are now
approved; a separately reviewed Stage 2 change plan and deployment approval
still block any cloud action.

### Expansion S: surgery, follow-up, payment and Calendar inbound - 2026-07-28

The owner supplied a detailed surgery scheduling and follow-up workflow covering
patient timelines, four calendar event types, surgery resources, anesthesia,
payments, refunds, role-scoped views and staff settlement. It is normalized in
the
[Expansion S plan](2026-07-28-surgery-follow-up-expansion-plan.md).

The input does not silently expand Phase 1. D-014 gates clinical/surgical
records, D-015 gates persisted money, and D-016 gates Calendar-to-system writes.
The 2026-07-28 input required Google Calendar to synchronize with the workbench
but did not select auto-apply versus review. Superseding 2026-08-16 input now
selects manual review, system authority and a 30-minute target. D-016 still
remains pending because reviewer role, matching identity, delete semantics,
scope/exclusions and approval metadata are unresolved. The accepted ADR remains
that Calendar is not the appointment/capacity lock.

### D-016 partial: Calendar must synchronize with the workbench - 2026-07-28

The owner answered that Calendar inbound is to synchronize with the workbench.
This records the required operator surface and convergence goal:

- outbound states (`queued`, `synced`, `failed`) and inbound states
  (`pending_review`, `conflict`, `approved`, `rejected`, `superseded`,
  `sync_error`) belong in the workbench rather than a hidden worker-only log;
- Calendar notifications wake an incremental sync; they do not identify a
  specific event or directly mutate an appointment;
- a re-sync may rebuild only the Calendar mirror/candidate store, never the
  authoritative appointment, encounter, surgery or permanent audit stores;
- every accepted external change must still execute a normal domain command,
  recheck current resource conflicts and append audit.

This did **not** close D-016. At the 2026-07-28 checkpoint, “synchronize with the
workbench” did not answer whether linked inbound edits may auto-apply, who
reviews an unknown event, how a Google deletion maps to cancellation, conflict
precedence or the candidate handling SLO. The 2026-08-16 input later selected
manual review, system precedence and a 30-minute target, but reviewer identity,
matching, delete semantics and formal approval remain open. The safe proposed
behavior therefore remains an isolated workbench review queue and no automatic
Calendar-to-system write path.

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

**Execution evidence — 2026-07-31:** the classic branch-protection rule is now
configured on `waydefu/clinic@main` with strict required status check
`Verification evidence`. Administrator enforcement remains off, so the
approved owner/administrator bypass is preserved. Force pushes and branch
deletion are disabled; pull-request reviews are not required by this rule.
The authenticated `check:branch-protection` command returned success after the
remote setting was applied.

**SEC-02 and SEC-03 approved — 2026-08-01:** the repository owner approved both
repository-security items and instructed that they be recorded on their behalf.

```text
Approval ID: SEC-02
Answer: approved — a pinned Semgrep CE scan producing commit-bound JSON/SARIF, rule hashes and a summary artifact is accepted as the blocking SAST evidence while a private personal repository cannot upload code-scanning results.
Approved by: repository owner, acting as both technical owner and security owner
Approval date (Asia/Taipei): 2026-08-01
Recorded by: assistant, at the owner's instruction. The owner gave the approval; the assistant is not an approver.
Evidence: commit 007d808; `.github/workflows/sast.yml` with a pinned engine image and rule revision; `security/semgrep/` rule configs with positive/negative fixtures; `scripts/generate-sast-evidence.mjs` and its 13 tests.
ENG-01 condition satisfied: the Semgrep rule tests run as the `rule_tests` step and are consumed as `SAST_RULE_TEST_OUTCOME`, where anything other than `success` classifies the evidence as `scanner-error`; the evidence-generator tests run inside `test:unit`, which `verify` and the required `Verification evidence` check both execute. Either failing turns the gate red.
Scope and explicit exclusions: applies to the SAST evidence policy only. It does not approve any D-series decision, cloud resource, route, real data, or the public mirror. It does not assert that Semgrep CE is equivalent to CodeQL.
Residual risk accepted: (1) Semgrep CE performs rule-based pattern matching, not CodeQL's cross-file taint analysis, so a class of data-flow defects remains undetected; re-evaluate before production. (2) Both required approver roles were signed by one person, so this decision received a single review rather than two independent ones.
Follow-up implementation issue: re-evaluate the SAST engine when the repository becomes eligible for code-scanning upload, or before production go/no-go, whichever comes first.
```

**Implementation verification correction — 2026-08-11 (read-only audit):**
the SEC-02 approval and ENG-01 policy intent remain unchanged. However, the
claim that either SAST-side failure blocks merging is not proved at the current
branch-protection boundary. `.github/workflows/sast.yml` is independent, while
the sole required `Verification evidence` job depends only on `verify`,
`rules`, `e2e` and `supply-chain`. Until branch protection requires the exact
SAST check or `Verification evidence` consumes a same-commit SAST result,
record SEC-02 as **approved policy; merge-blocking implementation evidence
pending (`SCM-R01`)**. This correction does not rewrite who approved the policy
or what they approved. A read-only GitHub API check at 2026-08-11 14:32 +08:00
subsequently confirmed that `main` has no repository ruleset and requires only
`Verification evidence`; PR #14 showed the independent Semgrep check green while
the required aggregate was red. No remote setting was changed.

**Implementation evidence supplied — 2026-08-18 (`SCM-R01`):** the pending
condition above is now met, and SEC-02 should be recorded as **approved policy
with demonstrated merge-blocking enforcement**. `Verification evidence` consumes
a same-commit SAST result: the scan moved to
`.github/workflows/sast-scan.yml` (`workflow_call`), `verify.yml` calls it as the
`sast` job inside the same run, and the `evidence` job needs it, so all five
required results are bound to one candidate commit. The evidence artifact also
records the commit the scan named and fails when it differs from the candidate.

The proof is behavioural. PR #18 (implementation `373757c`, candidate
`351e403484fcb0d80356b973eefd494363d8ef13`, run `32100761005`) passed all eleven
jobs with Semgrep reporting 0 findings across 173 files. PR #19 added one
synthetic file tripping the existing repository-owned rule
`clinic.javascript.weak-cryptography`; on candidate
`d49330c83e56264e123a718a3619070557d0226c` (run `32101192719`) the `sast` job and
`Verification evidence` both went red while the other ten jobs stayed green,
GitHub reported `mergeStateStatus=BLOCKED`, no administrator bypass was used, and
the pull request was closed unmerged. No branch-protection setting was changed —
the required context is still exactly `Verification evidence`.

What this does not change: the recorded residual risks stand. Semgrep CE remains
rule-based rather than CodeQL cross-file taint analysis, code-scanning upload is
still unavailable, and both approver roles were still signed by one person. The
D-013 administrator bypass is also untouched, so this enforces the protected
merge path and nothing else.

```text
Approval ID: SEC-03
Answer: approved — the high `brace-expansion` advisory (GHSA-mh99-v99m-4gvg / CVE-2026-14257) is accepted as a time-bounded exception on its current limited paths.
Approved by: repository owner, acting as both technical owner and security owner
Approval date (Asia/Taipei): 2026-08-01
Recorded by: assistant, at the owner's instruction. The owner gave the approval; the assistant is not an approver.
Evidence: `security/audit-exceptions.json`; `scripts/check-audit-exceptions.mjs` prints the exception on every supply-chain run and fails once it expires.
Scope and explicit exclusions: development-only resolution paths that are not reachable from a route and receive no attacker-supplied glob. It does not permit dismissing the Dependabot alert, adding further ignores, or extending the exception past its expiry without a new approval.
Residual risk accepted: a denial-of-service vector remains present in development tooling until an upstream fix exists. Both approver roles were signed by one person.
Expiry: 2026-08-31. Re-check on every dependency upgrade; remove the ignore once any parent package resolves to brace-expansion 5.x.
Follow-up implementation issue: re-verify at each dependency upgrade and before the expiry date.
```

**SEC-03 released rather than renewed — 2026-08-01:** hours after SEC-03 was
approved, the underlying advisory was revised (2026-07-31T19:37Z) to list a first
patched version for every affected major: 1.1.17, 2.1.3, 3.0.3 and 5.0.8. The
recorded release condition — "remove this entry once the upstream older major
publishes a fix" — was therefore met, and the premise the approval rested on
("the affected older majors have no compatible published fix") no longer held.

The dependency is now pinned per major (`brace-expansion@^1: ^1.1.17`,
`brace-expansion@^2: ^2.1.3`, alongside the existing `^5` pin) and resolves to
1.1.18 / 2.1.4 / 5.0.8. The `auditConfig.ignoreGhsas` entry and the exception
registry entry were both removed, so the repository now carries **no audit
exceptions at all**.

SEC-03 is therefore **resolved, not renewed**. The approval remains recorded as
given, because it was correct on the facts available at the time; what changed is
the upstream advisory. The correct end state for a time-bounded exception is
removal, not extension, and that is what happened here — with three weeks left on
the clock rather than at the expiry date.

**Technical-owner engineering decisions — 2026-08-01:** the repository/technical
owner approved four engineering-practice decisions raised through the AGENTS.md
"Grill me" challenge. They are recorded here because each one changes how a gate
behaves or what a later approval must cover. **None of them approves SEC-02,
SEC-03 or any D-series decision**, and none authorises cloud resources, routes or
real data.

| ID | Decision | Effect |
| --- | --- | --- |
| ENG-01 | SEC-02 must require the Semgrep rule tests and evidence-generator tests inside the blocking gate, with either failure red | Incorporated into approved SEC-02; required-check enforcement remains pending the 2026-08-11 correction |
| ENG-02 | SEC-02 approval was a prerequisite for merging the SAST change; a deliberately non-blocking interim workflow was rejected | Approval was satisfied 2026-08-01; this does not prove the current separate SAST workflow is a required merge check |
| ENG-03 | The production data model uses store-generated document IDs. Any operational serial number the clinic needs is a separate field, never the document ID | Closes plan risk R3 (monotonically increasing IDs cause Firestore write hotspots) before it reaches an implementation slice |
| ENG-04 | Every `auditConfig.ignoreGhsas` entry must carry a named approval ID and an expiry date in `security/audit-exceptions.json`, and the supply-chain gate must print each ignored advisory individually | Implemented as `check:audit-exceptions`; an unregistered, incomplete or expired exception now fails CI |

```text
Approval ID: ENG-01, ENG-02, ENG-03, ENG-04
Answer: approved as written above
Approved by: repository/technical owner
Approval date (Asia/Taipei): 2026-08-01
Evidence: scripts/check-audit-exceptions.mjs and its tests; docs/product/full-project-master-plan-2026-07-31.md §2.1 and §9
Scope and explicit exclusions: engineering practice and gate behaviour only; excludes SEC-02, SEC-03, every D-series decision, cloud resources, routes and real data
Residual risk accepted: ENG-03 is a design decision recorded ahead of implementation; it still needs an ADR when a persistence slice is built
Follow-up implementation issue: ADR for the document-identifier scheme before C6
```

**Repository-hosting direction — 2026-07-31:** the repository owner directed
that the access-restricted canonical repository remain in the current personal
account for now and not be transferred to an organisation. This is a hosting
direction, not an approval to weaken SAST. Private-personal code-scanning upload
eligibility remains a platform constraint. SEC-02 approved commit-bound Semgrep
CE artifacts as interim evidence, subject to its residual risks and
pre-production re-evaluation; that approval does not prove required-check
enforcement. See the 2026-08-11 correction above.

### Web-standards audit directions - 2026-07-26

The 2026-07-26 web-standards audit raised two questions it refused to answer by
guessing. The project owner answered both. These are **build directions for the
synthetic/test implementation**; neither changes a decision status to
`approved`.

- **D-011 direction (booking-site URL): `/booking`.** The patient booking page
  is to be served at `/booking`, which is what `patient.html` already claims in
  its `canonical` and `og:url`. **Historical audit finding, now resolved:** on
  2026-07-26 the deployed path was `/patient.html` and the advertised URL
  404ed. On 2026-07-28 `/booking` was rechecked as HTTP 200 with `no-cache` and
  `noindex`. **D-011 stays `pending`**: the accessibility and language needs and
  the manual-booking fallback are untouched, and the registered domain itself
  is still to be confirmed before go-live.
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
- **D-006 direction at that time:** staff sign in with **account + password**, and the
  **manager (管理者) may cancel/delete**. This records the intended shape for the
  test build. The audit-retention ambiguity was superseded by the 2026-07-28
  permanent append-only decision above; the identity, MFA, session, role and
  authorization-code direction was then fully approved later on 2026-07-28.
  The browser implementation described here remains synthetic evidence and
  does not implement that approval.
  - Implementation reading of "cancel/delete" (2026-07-24, synthetic build):
    the front desk **keeps** cancelling — it is a daily counter action, and
    routing it through a manager would stall the front desk. **Deleting** is
    administrator-only (`delete_appointment`), because it removes the record
    from the operational list and leaves only the audit event. Deletion also
    requires a reason from a closed list (`duplicate_record`, `wrong_patient`,
    `created_in_error`), since the audit event outlives the record it explains.
    Patient-initiated erasure is deliberately **not** one of those reasons: it
    is a data-rights workflow gated on D-002. This split is a build decision
    for the test system; the later 2026-07-28 D-006 approval confirmed
    administrator delete and front-desk delegated delete, while D-005 still
    owns cancellation and D-002 owns erasure.
- **D-009 direction:** use a **dedicated test calendar** for now, with the
  **manager (管理者) as the responsible owner**. Consistent with the 2026-07-23
  test-integration authority. D-009 stays `pending`: the production calendar,
  authorization model, scopes and minimum event fields remain for the audit.
- **CAL-001 (patient calendar export) decided:** the patient's downloaded
  `.ics` stays a **single reminder time point** (start time only, day-before
  alarm), which is what `modules/calendar-export.js` already implements
  (2026-07-22 direction). The clinic-side one-hour projection is a separate
  synthetic fixture, not a service or actual-treatment duration. No further
  change to this historical fixture is required; covered by
  `calendar-export.test.ts`.

Standing limits unchanged: `noindex`, synthetic data only, no cloud backend, no
authenticated write endpoint and no real Calendar connection are enabled by this
note. Changing a decision to `approved` still requires the named owner to record
the answer, approval date and evidence in the table and template below.

### Current synthetic patient identity scope - 2026-07-27

The 2026-07-27 owner batch superseded the narrower 2026-07-21 field shape for
the synthetic preview. The current allowlist is name, phone, birth month/day
with optional year, national ID/new resident ID or passport, NHI-card intent, a
short patient note, approved request/source tags and a conditional optional
referrer name. LineID and gender are not collected. Screen/list views mask the
identity document; the explicitly synthetic intake print may show the full test
value.

The matching-key priority is national ID/new resident ID, then passport, then
phone plus birth date. When the birth year is absent, the normalized name is
also included so two people sharing a phone and month/day are not silently
merged. This remains browser-local synthetic behavior, not an approved
production identity model or patient authentication; D-001～D-003／D-011
patient-specific decisions remain `pending`, while approved D-006 staff controls
are not implemented by this preview.

### Patient identity fields in the preview - 2026-07-21 — historical, superseded

The bullets below preserve the original 2026-07-21 authority. They were
superseded for current synthetic behavior by the 2026-07-27 scope above and
must not be used as the current field list or matching-key definition.

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

### Google Calendar test-integration authority - 2026-07-23; scope clarified 2026-08-24

**Clarification recorded 2026-08-24, at the owner's instruction.** The owner
states that this authority is live, was given more than once, and does not need
to be re-sought: the project is in a **test phase**, and connecting the
**dedicated test calendar** with **synthetic** events is authorised now. It does
**not** wait on D-009 or on Stage 2.

This corrects a conflation the assistant had been repeating. There are two
separate Calendar tracks, and they had been treated as one:

| Track | Gate | Status |
| --- | --- | --- |
| **Test integration** — dedicated test calendar, synthetic no-PII events, owner-run with the owner's own credentials | This 2026-07-23 authority, explicitly 測試不審核 (a test, outside the formal review) | **Authorised. Never executed.** |
| **Stage 3 production Calendar projection** | D-009 approved **and** Stage 2 complete, per [the approval plan §3](current-execution-and-approval-plan.md) | Both still open |

The Stage-2/D-009 prerequisite belongs to the **second** row only. Applying it to
the first row was wrong and repeatedly blocked work the owner had already
authorised.

**What this clarification does not change**, because these are data limits
rather than process gates:

- the calendar id must still point at a **dedicated test calendar**, never a
  doctor's private calendar and never the clinic's production calendar;
- **no real patient data**, and no real Calendar content — the smoke test
  creates one synthetic, PII-free event and deletes it immediately;
- **CAL-PILOT-001 is still separate.** Reading the clinic's **real operational
  Calendar** is a different act on a different calendar, and this authority does
  not reach it (recorded as H3 in the
  [pilot readiness package](../integration/google-calendar-pilot-readiness.md));
- the assistant still does not create the Google Cloud project, generate
  credentials, or run a connection that writes to a real calendar. That remains
  the owner's own action, per the original 2026-07-23 terms.

The runbook for the owner-run smoke test is
[calendar-go-live.md](../runbooks/calendar-go-live.md).

### Original 2026-07-23 record

- The project owner directed connecting the **real** Google Calendar API as a
  test ("測試不審核" — a test, outside the formal review), and authorised
  writing the real client for it.
- Scope of what this authorises: the `GoogleCalendarClient` code
  (`apps/worker/src/google-calendar.ts`), which reads its credentials only from
  environment variables. It defaults to the in-memory fake only when the
  integration is unconfigured/disabled. Since the 2026-07-29 fail-closed
  hardening, a real test client additionally requires
  `GOOGLE_CALENDAR_INTEGRATION_MODE=test` plus both `GOOGLE_CALENDAR_ID` and
  `GOOGLE_SERVICE_ACCOUNT_JSON`; partial, unknown or credential-bearing
  disabled configurations fail startup. Event content stays minimised (clinic
  name, visit kind, time, address, appointment id — no patient PII), enforced
  by a test.
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

### Synthetic online preview authority - 2026-07-21; deployment status updated 2026-07-27

- The project owner explicitly requested a non-production real-device online
  test version.
- A separate Firebase project, `beauessence-clinic-staging`, was created only
  for static Firebase Hosting preview channels. No Firestore, Functions,
  Storage, Authentication, Calendar or other backend integration was enabled.
- **Historical deployment record; scheduled expiry has passed and current
  availability was not reverified in the 2026-08-11 read-only audit:** the same
  `synthetic-review` channel was redeployed on 2026-07-27 from commit `3c31351`
  and was scheduled to expire on 2026-08-04 at
  12:43 Asia/Taipei. On 2026-07-28 at 17:18 Asia/Taipei, `/`, `/booking`,
  `/privacy` and `/clinic` were rechecked as HTTP 200 with stable HTML
  `no-cache` and the preview still `noindex`. This supersedes the earlier path
  and operational expiry below. Any redeploy needs fresh authority for the
  exact commit/project/channel/expiry; see
  `docs/reviews/2026-07-27-owner-request-batch-delivery.md` and
  `docs/reviews/ui-visual-baseline-2026-07-28.md`.
- Preview channel `synthetic-review` uses browser-local synthetic state and is
  publicly reachable to anyone with the URL. **Historical deployment record,
  superseded by the 2026-07-27 deployment above:** it was redeployed on
  2026-07-24 (same URL) with the CSP `object-src` hardening, forced-colors
  support, the branded 404 and the synthetic account+password login gate, with
  an expiry of 2026-07-31 at 02:30 Asia/Taipei. The workbench opens on that
  synthetic login gate (test credentials are shown on the page); it is a UX
  prototype, not a security boundary, and does not change D-006. The patient
  page is unaffected.
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

### D-001 - 2026-07-20 — historical input, superseded in part

The bullets below preserve the 2026-07-20 research/input record. The clinic
phone remains the temporary privacy-contact input, but the 2026-07-28 re-check
shows that the official hours in this historical block still appear on the
clinic's own site. The owner selected the repository schedule later on
2026-07-28, so the official site now needs correction. D-001 remains `pending`.

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
