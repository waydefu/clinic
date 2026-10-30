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

**Source refresh: 2026-10-28, base `a90d57f2f8d1bdcac27b2a13074c5fe095af3586`.**
The patient and business-delivery rows below cover the collection registries in
[`patient-directory.ts`](../../apps/api/src/patients/patient-directory.ts),
[`usage-events.ts`](../../apps/api/src/business-delivery/usage-events.ts),
[`business-delivery-export.repository.ts`](../../apps/api/src/firestore/business-delivery-export.repository.ts),
[`business-delivery-retention.repository.ts`](../../apps/api/src/firestore/business-delivery-retention.repository.ts)
and [`business-delivery-termination.repository.ts`](../../apps/api/src/firestore/business-delivery-termination.repository.ts),
plus the standalone `MILESTONE_ACKNOWLEDGEMENT_LOG` in
[`business-delivery.repository.ts`](../../apps/api/src/firestore/business-delivery.repository.ts).
These are source observations, not evidence of live documents, deployed TTL,
provider behaviour or an approved production schema. Internal-test execution
remains subject to the project, expiry and synthetic-data gates in
[AGENTS.md](../../AGENTS.md); public production and real-data use remain disabled.

The original six collection rows are the 2026-07-29 baseline, not re-verified
by this refresh. Sections 2 and 4 likewise remain dated snapshots. The added
rows summarise purpose and handling; current explicit write paths and unknown
boundaries are listed below. The per-field production approval worksheet in
section 5 is still required.

| Collection/contract | Observed fields / purpose | Tier | Important boundary |
| --- | --- | --- | --- |
| `slots` | slot ID, kind, start time, optional reservation ID | `P1`/`P2` | Reservation ID makes the row linkable; D-004 still owns capacity and occupancy |
| `appointments` | appointment, patient and slot IDs; start time; booking kind; one item ID; status; timestamps | `P3` | Historical one-item baseline, not a current contract acceptance; D-004 reconciliation is separate |
| `patient_booking_guards` | active appointment ID, status, update time; document keyed by patient ID | `P2` | Concurrency guard only, not a patient profile or authentication record |
| `audit_events` | narrow Audit v2 envelope: actor/resource/trace IDs, action, time, result, reason code, policy version and allowlisted state | `P2` | No names, contacts, identifiers or notes; do not add generic payload/free-text fields |
| `outbox_jobs` | job/appointment/event/trace IDs, projection status, timing, attempts, error and lease metadata | `P2` | No patient profile; errors must stay generic/redacted |
| `idempotency_keys` | actor/scope/request hash, resource reference, recorded time | `P2` | Request hash is not a place to store a raw request or direct identifier |
| `patients` | `name`, `phoneDigits`, `birthMonthDay`, timestamps and retention state; patient matching and approved contact/export support | `P3` | Current writes use birthday `--MM-DD`, never a year; storage is server-side and contacts stay out of usage/audit/log payloads. Calendar is only the ADR-0002 exception below |
| `patient_lookup_index` | legacy phone/full-birth-date hash lookup | `P2` | Registered as legacy; current directory neither reads nor writes it. No migration, backfill or inference from old hashes is authorised here |
| `patient_lookup_index_v2` | phone/month-day hash key, `patientIds` and update time; candidate matching | `P2` | A one-way lookup hash remains linkable, not anonymous; ambiguity must not select a patient arbitrarily |
| `return_sessions` | `patientId`, `createdAt`, `expiresAt`; short-lived return-booking lookup bridge | `P3` | Application expiry is not evidence of deployed Firestore TTL; no profile copy or new authentication authority |
| `patient_follow_up_states` | `required`, source appointment/follow-up IDs and active follow-up appointment ID | `P3` | Care/appointment inference; state is not permission to expose medical records or add clinical fields |
| `bd_usage_events` | schema/event ID, kind, runtime/maintenance class, occurrence time and optional `actorRef`; usage counting | `P2` | Staff reference is SHA-256 of UID, never raw UID, email, name, phone or birth value; hashing is not anonymisation |
| `bd_milestones` | first-use, capture-gap and owner-acknowledgement milestone records | `P2` | Usage/commercial-delivery evidence only; a marker is not proof that missing events were captured |
| `bd_milestone_acknowledgement_log` | schema/milestone/revision, evidence/actor references, acknowledgement, raw idempotency key, request hash and policy version | **Personal data, not anonymous — interim; P-level TBD** | Interim classification under the delegated decision recorded in PR #335; see the [engineering review draft](../legal/privacy-engineering-review-draft-2026-10-29.md). Append-only acknowledgement/replay purpose and existing API guards remain unchanged; no access beyond existing roles. Evidence-reference contents, P-level and field access still require section 5 approval. Retention TBD; no new automatic deletion |
| `bd_export_jobs` | export ID/range, row/byte/chunk counts, hash, creator reference, expiry/download/revocation state and policy version | `P3` | Describes a restricted export; metadata does not authorise a download or a production data flow |
| `bd_export_chunks` | `exportId`, `index`, CSV `content`, `purgeAt`; bounded export-file storage | `P3` | Content can include direct contact fields; it is not an opaque-ID-only collection. Download, revocation and retention controls remain separate |
| `bd_export_log` | export/action/actor references and time; export operation trail | `P2` | No CSV content or patient contact values in log entries |
| `bd_retention_log` | action, patient/actor references, time, request hash, result and optional reason code | `P3` | Patient-linked retention/legal-hold evidence; no arbitrary free-text reason or new retention period is approved here |
| `bd_terminations` | state/version, notice and retention times, receipt/evidence references, creator and policy version | `P3` | Contract-termination/return workflow; this inventory does not approve deletion, backup disposition or evidence retention |
| `bd_termination_log` | termination/action/actor references, time, request/idempotency hashes, version and result | `P3` | Replay/audit trail can retain receipt-linked state; keep it restricted and do not copy exported CSV into it |
| `bd_termination_export_receipts` | termination/export references, acknowledgement, hash and export-coverage facts | `P3` | Return-of-data evidence, not a copy of the export; receipt presence alone does not prove delivery or legal acceptance |
| Appointment command contracts | idempotency key, slot/service ID and booking kind; server supplies verified patient/actor context and timestamps | `P2`/`P3` | ADR-0005 keeps patient intake/verification separate; public production routes remain disabled |
| Calendar projection | appointment/event linkage and allowlisted title fields on the dedicated appointment calendar | `P3` when title includes identity or notes | Only the [ADR-0002 2026-09-29 amendment](../adr/0002-calendar-is-a-projection-not-the-lock.md#2026-09-29-修訂專用預約日曆的標題欄位) permits name, phone, birthday month/day, booking kind/service and patient booking note there. No other calendar, full birthday, government ID, medical record or credential; production still requires D-009 |

### Current explicit write paths and variants

Paths below are source keys, not example record values or an assertion that
every key is present on every document. Dotted paths and `[]` describe nested
objects/arrays; `$milestone` means an existing `BusinessMilestoneId` key. The
collection row above supplies purpose and proposed handling, not production
approval. Source-local interfaces are not runtime validation or proof that
historical documents contain no other fields.

- `patients` — `FirestorePatientDirectory.planIntakeWithin` writes `patientId`, `name`, `phoneDigits`, `birthMonthDay`, `createdAt` and `updatedAt`. `FirestoreBusinessRetentionRepository.archive`, `restore` and `setLegalHold` additionally write or remove `archivedAt`, `archivedByRef`, `restorableUntil`, `legalHold`, `legalHoldReasonCode`, `legalHoldUpdatedAt` and `legalHoldUpdatedByRef`. Permanent deletion removes the whole document. Partial updates preserve unmentioned fields, so any additional historical keys are **UNKNOWN**, not silently inventoried or authorised.
- `patient_lookup_index` — only the legacy registry entry is observed in the directory; it has no current directory read/write path. Stored field names, types and historical contents are **UNKNOWN**. Do not infer them from the legacy hash comment or authorise a migration.
- `patient_lookup_index_v2` — directory candidate binding reads `patientIds` and writes `patientIds`, `createdAt`, `updatedAt`. Existing index data is spread into writes, so other historical keys remain **UNKNOWN**. The lookup hash is the document key, not a copied phone or birthday field.
- `return_sessions` — directory `lookupReturn` writes `patientId`, `createdAt` and `expiresAt`; application lookup checks expiry. This is not evidence of a deployed TTL policy or authority for a new session flow.
- `patient_follow_up_states` — directory reads and booking repository writers cover `required`, `activeFollowUpAppointmentId`, `sourceAppointmentId`, `sourceFollowUpId` and `updatedAt`. `reserve`, `recordFollowUp` and `releaseActiveFollowUp` merge/update these keys and can delete the active pointer. Existing extra keys remain **UNKNOWN**; this does not refresh the historical booking collection rows.
- `bd_usage_events` — `bookingCreatedUsageEvent` / `staffLoginUsageEvent` produce `schemaVersion`, `eventId`, `kind`, `eventClass`, `occurredAt` and staff-login-only `actorRef`. Runtime/maintenance are values of `eventClass`, not separate fields.
- `bd_milestones` — first-use marker: `schemaVersion`, `occurredAt`, `eventId`; capture-gap marker: `schemaVersion`, `month`, `firstObservedAt`, `reason`; acknowledgement record: `schemaVersion`, `revision`, `$milestone.evidenceRef`, optional `$milestone.launchDate`, `$milestone.acknowledgedAt`, `$milestone.actorRef`, `$milestone.idempotencyKey`, `$milestone.requestHash`, `$milestone.policyVersion`. `FirestoreBusinessDeliveryRepository.acknowledge` spreads the prior acknowledgement record, so untyped historical keys remain **UNKNOWN**.
- `bd_milestone_acknowledgement_log` — the same `acknowledge` writer adds `schemaVersion`, `milestoneId`, `revision` and the acknowledgement entry's `evidenceRef`, optional `launchDate`, `acknowledgedAt`, `actorRef`, `idempotencyKey`, `requestHash`, `policyVersion`. The standalone collection export must be checked alongside object registries; a mention only in prose is not an inventory row.
- `bd_export_jobs` — `StoredExportJob` and `create` / `download` / `revoke` cover `schemaVersion`, `exportId`, `format`, `from`, `to`, `rowCount`, `byteLength`, `sha256`, `chunkCount`, `createdAt`, `createdByRef`, `downloadExpiresAt`, `maxDownloads`, `downloadCount`, `purgeAt`, `revokedAt`, `idempotencyKey`, `requestHash`, optional `revokeIdempotencyKey`, `policyVersion`. `purgeAt` is a Firestore `Timestamp`; returned `status` is computed, not a field in the create literal.
- `bd_export_chunks` — export creation writes `exportId`, `index`, `content`, `purgeAt`; the literal has no `schemaVersion`. `content` is CSV text, not a nested record with only opaque identifiers. It is removed on revocation; a source delete/TTL field is not deployment or deletion evidence.
- `bd_export_log` — `appendLog` writes `schemaVersion`, `exportId`, `action`, `actorRef`, `at`, without copying CSV content.
- `bd_retention_log` — `writeLog` writes `schemaVersion`, `action`, `patientId`, `actorRef`, `at`, `requestHash`, `result`, optional `reasonCode`. Result variants: archive has `patientId`, `state`, `restorableUntil`; restore has `patientId`, `state`; legal hold has `patientId`, `legalHold`; permanent deletion has `patientId`, `state`, `layers`. The last variant's layer-count keys are `patients`, `appointments`, `patient_booking_guards`, `patient_follow_up_states`, `return_sessions`, `follow_ups`, `patient_lookup_index_v2`; these are counts in the log, not copies or a refreshed inventory of those collections.
- `bd_terminations` — `StoredTermination` covers `schemaVersion`, `terminationId`, `state`, `noticeDate`, `noticeStartedAt`, `noticeDueAt`, `noticeExceptionReference`, `returnManifestReference`, `recipientConfirmationReference`, `returnCompletedAt`, `controlledRetentionUntil`, `receipts`, `version`, `createdAt`, `createdByRef`, `updatedAt`, `closeReviewRequestedAt`, `policyVersion`, `scope`. Receipt variants use `receipts[].receiptKind`, `.actorRef`, `.acknowledgedAt`, and variant/legacy-dependent `.exportId`, `.evidenceRef`, `.sha256`, `.from`, `.to`, `.rowCount`, `.byteLength`.
- `bd_termination_log` — `writeOperationLog` stores `schemaVersion`, `terminationId`, `action`, `actorRef`, `at`, `idempotencyKeyHash`, `version`, `requestHash`, `result`. `result` is the `view` response: `terminationId`, `state`, `noticeDate`, `noticeStartedAt`, `noticeDueAt`, `controlledRetentionUntil`, `version`, `receipts` (the variants above), `closeReadiness.ready`, `closeReadiness.missingSteps`, optional `replayed`; it is not a raw termination-document copy.
- `bd_termination_export_receipts` — the data-return acknowledgement writes `schemaVersion`, `exportId`, `terminationId`, `actorRef`, `acknowledgedAt`, `sha256`, `from`, `to`, `rowCount`, `byteLength`. Older embedded receipt variants can omit coverage; that does not establish delivery or legal acceptance.

The writer observations above also use
[`booking.repository.ts`](../../apps/api/src/firestore/booking.repository.ts)
only for the shared follow-up-state path, and the existing usage-marker writers
in [`calendar-pilot-session.ts`](../../apps/api/src/auth/calendar-pilot-session.ts).
No provider, document contents, migration or restore was inspected.
Free-form evidence references and
passthrough historical fields require owner review; their contents must not be
assumed harmless. The new acknowledgement-log row deliberately leaves its
classification, field access and retention unapproved instead of guessing.

This refresh adds no field, collection, permission, retention duration or legal
basis. It does not re-verify all UI/API fields, historical data, deployed
access controls or data-subject-rights workflows, and does not by itself close
E3-05 or the privacy packet.

## 4. Secrets and authentication material

| Material | Tier | Required handling | Current status |
| --- | --- | --- | --- |
| Google service-account private key and OAuth access token | `S` | Secret manager injection, official token endpoint, workload-only access, rotation and no logging | Client code exists; 2026-07-23 test-only authority permits an owner-run dedicated test-calendar smoke, but it has not run; no repository credential and no D-009-approved production connection |
| Identity provider credentials/session tokens | `S` | Provider/secret manager only, secure cookie/session design, revocation and access logging | D-006 target approved; implementation and deployment not authorised |
| Local-account password verifier and TOTP seed | `S` | Approved IdP only; no recoverable password in application/Firestore, protected verifier/seed handling, recovery/rebind approval and no application-log value | D-006 approves local TOTP plus 30-minute idle／8-hour absolute **session expiry**; password policy/credential lifetime, recovery implementation and evidence remain pending C0 review |
| Delegation authorisation code | `S` | Salted memory-hard KDF, individual revoke, retry limiting, never re-display, secret-free audit; any fixed expiry/rotation requires separate approved parameters | The handling principles are D-006 approved. Exact limit/backoff/unlock and any fixed code lifetime/expiry/rotation are proposed/pending; no production store or route exists |
| Break-glass credential | `S` | Separate approved design, dual control, time-bound activation and post-use review | **NOT PROVISIONED**; remain fail closed |

Expiry terms must not be conflated: D-006 approved 30 minutes idle and 8 hours
absolute for a staff **session** (since 2026-10-03: absolute 12 h, no idle timeout, per `STAFF-SESSION-12H-2026-10-03`; 10-minute reauth for sensitive operations unchanged; original text kept as history). It did not approve password expiry or a fixed
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
