# Taiwan Privacy Legal Baseline — Phase 1

**Research status:** Project design baseline, re-checked on 2026-07-28. It is
not legal advice or a substitute for the clinic's legal review. It covers the
local-only appointment platform design, not an electronic medical-record
system.

## Effective-law check before launch

The National Laws and Regulations Database shows that the 2025 amendment to
the Personal Data Protection Act (PDPA) has **not** yet been assigned an
effective date. That amendment includes new Article 20-1 and the deletion of
Article 27. Until the amendment takes effect, this project uses the still
effective Article 27 security obligation as its legal baseline. Re-check the
official status immediately before a public launch or any change to processing.

- [PDPA status and pending amendments](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)
- [Currently effective PDPA text (historical version)](https://law.moj.gov.tw/LawClass/LawOldVer.aspx?pcode=I0050021)

## Scope and data-minimisation decision

Names, mobile numbers and other contact details are personal data. Medical
records, medical information and health examinations are special-category data
under PDPA Article 6. PDPA Article 5 also requires collection, processing and
use to stay necessary and reasonably related to a specific purpose.

The current browser-local synthetic preview is a narrow test exception, not a
production data decision. Under the owner's recorded synthetic authority it
accepts name, phone, birth month/day with optional year, national ID/new
resident ID or passport, NHI-card intent, selected service/time, approved
request/source tags, an optional referrer name in specific paths and a short
note. It does not transmit those values to the clinic, and real data remains
prohibited. This field list must not be copied into a backend or treated as a
lawful-basis decision.

The production field inventory remains pending D-001 through D-003, D-006 and
D-011. Each field needs a recorded purpose, necessity, legal basis, notice,
access scope and retention rule. Request tags or free text may imply health or
medical information, a national ID is a high-risk identifier, and a referrer
name is third-party personal data; each needs separate review. Do not add
symptoms, diagnosis, medical history, photographs or payment-card data without
a separate approved scope. An appointment itself can still be sensitive in
practice, so apply the same least-privilege and audit controls throughout.

If a future scope needs medical information, diagnosis, treatment notes or
documents, stop and obtain a separate legal/medical-record review. A privacy
notice alone does not make collection of Article 6 data permissible.

## Notice required before patient data is collected

For a non-public organisation collecting directly from the patient, PDPA
Article 8 requires a clear notice containing all of the following:

1. The non-public organisation's name.
2. The collection purpose.
3. Personal-data categories.
4. Retention period, territory, recipients and use method.
5. The patient's Article 3 rights and how to exercise them.
6. The consequence of declining optional or required fields.

The published policy must identify the actual legal data controller, not merely
the product name or a responsible physician inferred from a public webpage.
Decision D-001 remains the required approval for that name, the privacy contact
channel and the rights-request process. A general reception number may be used
only after the clinic formally designates it and trains staff on the workflow.

## Lawful collection and use design

For ordinary booking data, the legal owner must record the chosen Article 19
basis. The proposed operating model is a documented appointment-service
relationship together with a clear Article 8 notice; if consent is selected as
the basis, retain evidence that the notice was given and that consent was
obtained. Use data only within the stated appointment purpose (Article 20).

Marketing is out of scope. Do not reuse booking details for marketing or add a
pre-ticked marketing checkbox. If the clinic later uses personal data for
marketing, Article 20 requires an immediate stop when the person refuses and a
refusal method at first marketing contact.

## Patient-rights and incident operations

Implement a verified intake channel for access/copy, correction, stop-use and
deletion requests. Track identity verification, decision, reason, response and
fulfilment in an auditable case record. Under current PDPA Article 13, an
access/copy request is decided within 15 days (one further 15-day extension
with written reason), while correction/stop-use/deletion requests are decided
within 30 days (one further 30-day extension with written reason).

Maintain an incident runbook. The current PDPA requires suitable notification
to affected people after a theft, leak, alteration, destruction, loss or other
infringement is identified; the implementation rules specify that the notice
states the incident and response measures. The future statutory notification
and regulator-reporting regime must be re-checked when the 2025 amendment's
effective date is announced.

## Supplier, cloud and NAS controls

Firebase, Google Calendar, a future hosting provider and a future NAS operator
must be documented as vendors before they receive personal data. Under PDPA
Enforcement Rules Article 8, the clinic must supervise an entrusted processor:
define data scope, purpose, period, security measures, sub-processors,
breach-notification/remedy duties, return/deletion at termination, and periodic
verification records. Assess international transfer before selecting cloud
regions or enabling integrations; PDPA Article 21 allows restrictions in some
cross-border circumstances.

The design rule remains: Google Calendar is a non-PII operational projection,
not the source of truth. Its event title, description, attendees and reminders
must not contain patient names, phone numbers, medical information or booking
notes.

## Security controls required by the project baseline

Current PDPA Article 27 requires suitable measures to prevent theft,
alteration, destruction, loss or leakage. The Enforcement Rules describe a
proportionate technical and organisational programme: named accountability,
data inventory, risk management, incident response, internal procedures,
personnel and equipment controls, training, audit logs and continual
improvement. The project must therefore retain RBAC, MFA for staff, server-side
access only, encryption in transit, audit events, access-log review, backups,
restore testing, vendor reviews and a tested incident runbook before production.

The Medical Care Act separately protects information learned or held about a
patient's condition or health. Limit access to case managers and other staff by
role and purpose, and never expose patient data through Calendar, social
channels, browser logs or analytics. If the product becomes an electronic
medical-record system, the stricter electronic-medical-record requirements
(including access control, encryption, backup and recorded management
mechanisms) become a separate release gate.

The 2026-07-28 surgery/clinical timeline expansion is therefore plan-only under
D-014. Payment/refund and staff-settlement amounts are separately gated by
D-015. Neither scope may inherit the booking-data approval automatically; see
the
[Expansion S plan](../product/2026-07-28-surgery-follow-up-expansion-plan.md).

## Official sources used

- [Personal Data Protection Act — effective version](https://law.moj.gov.tw/LawClass/LawOldVer.aspx?pcode=I0050021): Articles 2, 3, 5–8, 10–13, 19–21 and 27.
- [PDPA Enforcement Rules](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050022): Articles 8, 12, 16 and 22.
- [Medical Care Act](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0020021): Articles 70 and 72.
- [Electronic Medical Record Production and Management Regulations](https://gazette.nat.gov.tw/egFront/eguploadpubWrapper?file=%2FEG_FileManager%2Feguploadpub%2Feg028133%2Fch08%2Ftype1%2Fgov70%2Fnum38%2FEg.htm&metaid=133728): relevant only if the scope becomes electronic medical records.

## Required decisions before collecting any real data

1. Approve D-001 through D-003, including the exact controller name, privacy
   contact, retention schedule, deletion exceptions, policy version and
   publication record.
2. Approve D-009 and D-010 before any real-data cloud/backend, Calendar or NAS
   connection, including processor terms, locations, access scope, logs,
   backup/restore and incident contacts. The already-authorised static,
   synthetic-only Hosting preview is the documented exception; it is not
   authority to create a backend or send data to the clinic.
3. Have the clinic's legal/privacy owner confirm this baseline against the law
   in force on the actual launch date.
4. Before Expansion S stores surgery, anesthesia, clinical follow-up or money,
   approve D-014/D-015 and update the field inventory, retention, correction,
   export, accounting and role-scope evidence.
