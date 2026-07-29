# Data classification and field inventory — 2026-07-29

**Status:** plan-only engineering draft. It inventories fields already present
in the synthetic browser or local Emulator code. It does **not** approve a
production field, lawful basis, retention period, processor, data location or
real-data flow. D-001～D-003 and D-011 remain the controlling privacy gates;
the expansion gates named below remain separate.

## 1. How to use this inventory

This document has three purposes:

1. make the current implementation visible before a production schema is
   proposed;
2. assign a conservative, provisional handling tier so engineering defaults
   fail closed; and
3. expose every blank that an authorised clinic/privacy owner must decide.

The tiers below are engineering safeguards, not statutory classifications.
When two tiers could apply, use the more restrictive one. An opaque identifier
is not anonymous when the system can link it back to a person.

| Tier | Meaning | Minimum engineering treatment before production |
| --- | --- | --- |
| `P0 Public` | Intentionally published clinic information | Integrity control, approved publication source and change review |
| `P1 Internal` | Non-public operational data not intended to identify a person | Authenticated access, encryption in transit/at rest and bounded logs |
| `P2 Linkable` | Pseudonymous or operational data that can be linked to a patient or staff member | Least privilege, access audit, no URL/analytics exposure, approved retention and export/delete handling |
| `P3 Restricted` | Direct identifier, appointment/health inference, free text, third-party data, clinical or financial data | MFA-protected purpose-based access, field minimisation, masking where appropriate, no browser persistence or external projection unless explicitly approved |
| `S Secret` | Credential, token, private key, password material or recovery/delegation secret | Secret manager only, no source/browser/log value, rotation, revocation and access logging |

## 2. Current browser-local synthetic inventory

Everything in this section is currently allowed only for synthetic test data.
The browser `localStorage` implementation is not a production storage design.
Its presence here is evidence of current code, not approval to copy the same
shape into Firestore or an API.

| Data group | Fields observed in the current preview | Provisional tier | Current location | Production decision still required |
| --- | --- | --- | --- | --- |
| Public clinic catalogue | clinic name, address, phone, hours, doctor/service educational copy | `P0` after publication approval | Static HTML/JS/assets | Authoritative content owner, review cadence and release approval |
| Patient record key | `patientId`, created/updated timestamps | `P2` | Browser state; last patient ID also has a separate localStorage key | Identifier generation, identity proofing, access scope, retention and merge/correction rules |
| Patient direct identity | name, phone, birth date | `P3` | Browser state | Necessity, required/optional status, Article 8 notice, lawful basis, access, retention and rights workflow |
| Government/travel identifier | national ID/new resident ID or passport number | `P3` | Browser state; masked in selected list views | Whether collection is necessary at all; verification, blind-index/encryption design, display access, retention and deletion exception |
| NHI-related facts | has-NHI-card intent; per-visit `nhiCardMissing` | `P3` | Browser patient/appointment state | Necessity, purpose, notice, correction, role scope and retention |
| Clinic medical-record number | `medicalRecordNumber` | `P3` when linked to a patient | Browser patient state | Whether Phase 1 is allowed to store it, source of truth, role scope, correction and retention |
| Appointment linkage | appointment, patient and slot IDs; start time; booking kind; status; source follow-up ID | `P3` | Browser state | D-004/D-005 operating rules plus privacy purpose, role/read scope, retention and patient access |
| Service/request information | item IDs/labels, request tags, note tags | `P3` | Browser appointment state | Per-field necessity and whether a value implies health/medical information; D-004 and possibly D-014 |
| Free text | patient note, front-desk note, follow-up note | `P3` by default | Browser appointment/follow-up state | Prefer closed lists; otherwise purpose, prohibited-content rules, access, correction, retention and redaction/export behavior |
| Referral/source | source tags and optional referrer name | `P3` | Browser appointment state | Third-party notice/necessity, access, correction and retention; remove if it cannot be justified |
| Follow-up instruction | required/not required, due date/time, tags, certificate copies, recording actor/time | `P3` | Browser follow-up state | D-014 clinical boundary, decision source, correction history, role scope, retention and export |
| Schedule/availability | weekly hours, date exceptions, slot times | `P1`; `P2` once linked to a reservation | Browser state | D-004 capacity, occupancy, buffer and publication authority |
| Staff identity/role | actor ID, role and synthetic role-selection state | `P2` | Browser state | D-006 values are approved targets; real IdP mapping, lifecycle, session/revocation and access review remain unimplemented |
| Synthetic login password | `workspace.accounts[].password`; fixed demo passwords and plaintext passwords generated for added synthetic accounts | `S` even though values are synthetic | Browser `localStorage`; briefly present in the password input | Must not migrate: D-006 approves IdP-managed credentials and forbids recoverable passwords in application/Firestore documents. The approved 30-minute idle and 8-hour absolute values are **session expiry**, not a password-expiry policy; password lifetime/rotation remains unapproved |
| Synthetic delegation secret | `workspace.delegations[].authorizations[].secret`; plaintext value entered when an administrator adds a synthetic code | `S` even though values are synthetic | Browser `localStorage`; briefly present in add/delete password inputs | Must not migrate: D-006 approves salted memory-hard KDF storage, individual revocation, retry limiting, never re-display and audit without the secret. A fixed code lifetime/expiry/rotation policy is still proposed/pending; the browser has no expiry field |
| Audit history | actor/resource IDs, action, timestamps and selected before/after/reason metadata | `P2`; any free text would escalate to `P3` | Browser state; narrow Audit v2 contract in domain code | Append-only backend, read/export role, minimised state allowlist and approved retention/legal exception |
| Outbox/Calendar intent | job/appointment IDs, status, event key, retry/error metadata, trace IDs | `P2` | Browser state and local Emulator model | Worker service scope, error redaction, operational retention, D-009 and Stage 3 approval |
| Case assignment/workload | patient/appointment and manager IDs, effective dates, counts | `P3` | Browser state/domain plan | D-007 purpose, visibility, correction, retention and employee/patient notice |
| Payroll-derived records | manager/patient linkage, month, credit counts, adjustments/reasons | `P3` | Browser/domain plan only | D-008 and D-015; accounting purpose, amount scope, approvers, correction/lock, retention and export |
| Policy interaction | preview checkbox state; future policy version/display/acceptance evidence is not implemented | `P2` when linked to a person | Current preview only | D-003 immutable version, effective date, legal basis, evidence fields, accessibility/language and retention |

The preview must continue to reject real data. Synthetic fixtures should use
obviously fake values and must never be copied from clinic, patient, Calendar,
payroll, social-channel or NAS records.

## 3. Local Firestore/contract baseline

These collections are executable only against the disposable local Emulator.
They intentionally carry opaque IDs rather than a patient profile, but the IDs
remain linkable. They are not an approved production schema.

| Collection/contract | Current minimum fields | Tier | Important boundary |
| --- | --- | --- | --- |
| `slots` | slot ID, kind, start time, optional reservation ID | `P1`/`P2` | Reservation ID makes the row linkable; D-004 still owns capacity and occupancy |
| `appointments` | appointment, patient and slot IDs; start time; booking kind; one item ID; status; timestamps | `P3` | Current one-item contract does not match the approved multi-item direction; do not route before D-004 reconciliation |
| `patient_booking_guards` | active appointment ID, status, update time; document keyed by patient ID | `P2` | Concurrency guard only, not a patient profile or authentication record |
| `audit_events` | narrow Audit v2 envelope: actor/resource/trace IDs, action, time, result, reason code, policy version and allowlisted state | `P2` | No names, contacts, identifiers or notes; do not add generic payload/free-text fields |
| `outbox_jobs` | job/appointment/event/trace IDs, projection status, timing, attempts, error and lease metadata | `P2` | No patient profile; errors must stay generic/redacted |
| `idempotency_keys` | actor/scope/request hash, resource reference, recorded time | `P2` | Request hash is not a place to store a raw request or direct identifier |
| Appointment command contracts | idempotency key, slot/service ID and booking kind; server supplies verified patient/actor context and timestamps | `P2`/`P3` | ADR-0005 keeps patient intake/verification separate; no public route exists |
| Calendar projection | clinic name, booking-kind label, opaque appointment/event ID, time, location and color | `P2` | Strict allowlist: no name, phone, ID, service/medical detail, notes or attendee; D-009 still pending |

## 4. Secrets and authentication material

| Material | Tier | Required handling | Current status |
| --- | --- | --- | --- |
| Google service-account private key and OAuth access token | `S` | Secret manager injection, official token endpoint, workload-only access, rotation and no logging | Client code exists; 2026-07-23 test-only authority permits an owner-run dedicated test-calendar smoke, but it has not run; no repository credential and no D-009-approved production connection |
| Identity provider credentials/session tokens | `S` | Provider/secret manager only, secure cookie/session design, revocation and access logging | D-006 target approved; implementation and deployment not authorised |
| Local-account password verifier and TOTP seed | `S` | Approved IdP only; no recoverable password in application/Firestore, protected verifier/seed handling, recovery/rebind approval and no application-log value | D-006 approves local TOTP plus 30-minute idle／8-hour absolute **session expiry**; password policy/credential lifetime, recovery implementation and evidence remain pending C0 review |
| Delegation authorisation code | `S` | Salted memory-hard KDF, individual revoke, retry limiting, never re-display, secret-free audit; any fixed expiry/rotation requires separate approved parameters | The handling principles are D-006 approved. Exact limit/backoff/unlock and any fixed code lifetime/expiry/rotation are proposed/pending; no production store or route exists |
| Break-glass credential | `S` | Separate approved design, dual control, time-bound activation and post-use review | **NOT PROVISIONED**; remain fail closed |

Expiry terms must not be conflated: D-006 approved 30 minutes idle and 8 hours
absolute for a staff **session**. It did not approve password expiry or a fixed
delegation-code lifetime. Those credential/code parameters remain proposed
until named technical/security review; individual delegation-code revocation is
already approved.

## 5. Field approval worksheet

Before any production schema or migration, the authorised owners must complete
one row per field. Group approval is insufficient for direct identifiers,
free text, third-party data, appointment/health inference or Expansion S.

| Field/path | Exact purpose | Required or optional | Legal basis and notice category | Read/write roles and purpose | Retention trigger/period | Correction, export, deletion/anonymisation and backup exception | Processor/location | Decision/evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `[field]` | `[TBD]` | `[TBD]` | `[TBD — D-001/D-003]` | `[TBD]` | `[TBD — D-002]` | `[TBD — D-001/D-002]` | `[TBD — D-002]` | `pending` |

For every approved field, record the schema version and map it to:

- its collection/API path and source of truth;
- input validation and maximum length/cardinality;
- server-side read/write authorisation;
- masking or reveal workflow;
- audit event (without copying the sensitive value);
- log, metric, trace, URL, export, Calendar and backup behavior; and
- migration, rollback and deletion behavior.

## 6. Explicit exclusions and no-copy zones

Until a separate decision approves them:

- do not collect symptoms, diagnosis, medical history, prescriptions, images,
  payment-card data, social-message bodies or NAS document contents;
- do not put patient identity, service/medical detail or notes in Calendar,
  analytics, metrics, traces, URLs, document IDs, error messages or audit
  free text;
- do not treat masking, hashing or an opaque ID as anonymisation;
- do not copy the browser-local synthetic shape wholesale into a backend; and
- do not infer that D-006 identity approval authorises a patient/clinical field.

Expansion S surgery/anesthesia/clinical-timeline fields require D-014.
Payment/refund/settlement amounts and accounting fields require D-015.
Calendar inbound matching/review/conflict/delete fields require D-016 as well
as D-009. Case assignment and payroll remain behind D-007/D-008.

## 7. Exit criteria for a production-ready inventory

This draft may be called “proposal ready”; it must not be called approved or
implemented until all of the following have evidence:

1. D-001～D-003 approve controller/contact, field purpose/basis, notice,
   retention/deletion/backup exceptions and vendor/location records.
2. D-004/D-005 resolve the service, capacity, cancellation and no-show fields;
   D-011 approves the publication/launch scope.
3. Every applicable expansion/integration decision is approved separately.
4. API contracts, persistence schema, field-level authorisation, masking,
   log/telemetry allowlists and migrations match the approved inventory.
5. Retention/deletion/anonymisation/export and verified data-subject-request
   workflows have negative tests and operational evidence.
6. Privacy, security and technical owners sign the versioned inventory, and
   later schema changes cannot bypass that review.

Related authority:

- [Taiwan privacy legal baseline](taiwan-privacy-legal-baseline.md)
- [Privacy approval packet](../legal/phase-1-privacy-approval-packet.md)
- [Production target architecture](../architecture/production-target-architecture-2026-07-23.md)
- [ADR-0005 — patient intake and appointment commands are separate](../adr/0005-patient-intake-and-appointment-command-are-separate.md)
