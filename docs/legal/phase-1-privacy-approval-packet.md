# Phase 1 Privacy Approval Packet

**Status:** Draft approval packet. It does not publish a privacy policy and
does not authorise collection of real patient data.

**How to use:** The clinic owner and privacy/legal owner complete the fields
below, attach the cited evidence, and sign the approval record. Copy the final
answers into `docs/product/phase-1-decision-register.md`. A blank, unknown or
unapproved field keeps D-001, D-002 or D-003 in `pending` status.

The legal requirements and design constraints behind this packet are in
[`../security/taiwan-privacy-legal-baseline.md`](../security/taiwan-privacy-legal-baseline.md).

## D-001 — Controller, contact and rights requests

### Required confirmation

| Field | Approved answer | Evidence / owner |
| --- | --- | --- |
| Exact legal name of the non-public data controller | `[Copy exactly from the clinic registration / licence]` | `[Document reference and approver]` |
| Public privacy-rights contact channel | `[Dedicated email and/or formally approved phone]` | `[Who monitors it and coverage plan]` |
| Privacy postal address, if used | `[Address]` | `[Approver]` |
| Rights-request identity verification method | `[Proportionate steps; do not request unnecessary ID copies]` | `[Privacy owner]` |
| Person accountable for request handling | `[Role, not personal credentials]` | `[Clinic owner]` |
| Escalation when a request concerns a medical record rather than booking data | `[Clinic process and owner]` | `[Medical/legal owner]` |

### Minimum operating rule

The rights channel must be monitored, identity must be verified proportionately,
and every request must be logged with receipt time, decision, reason, response
time and fulfilment evidence. The published policy must state the channel and
how people exercise their rights. Do not label a general reception channel as
the privacy channel until this table is approved.

## D-002 — Retention, deletion and vendors

### Booking-data retention schedule

Complete each row with an approved retention rule. Distinguish live operational
data, immutable audit evidence and de-identified statistics; do not retain all
data indefinitely by default.

Append-only integrity and retention are separate decisions. D-006 recorded that
an audit event outlives a deleted appointment and cannot be altered by an
operator; it did not finish D-002's decision on how long identifiers remain
linkable. The approved answer must address pseudonymisation, legal hold,
rights-request exceptions, deletion tombstones and deletion replay after a
backup restore.

| Data set | Approved purpose | Retention trigger and period | Deletion / de-identification action | Owner |
| --- | --- | --- | --- | --- |
| Booking and cancellation record | `[purpose]` | `[e.g. cancellation or scheduled visit date + approved period]` | `[action]` | `[role]` |
| Contact details | `[purpose]` | `[trigger + period]` | `[action]` | `[role]` |
| Assignment and payroll-credit record | `[purpose]` | `[trigger + period / accounting rule]` | `[action]` | `[role]` |
| Security audit events | `[purpose]` | `[trigger + period]` | `[action]` | `[role]` |
| Backups | `[purpose]` | `[backup lifecycle]` | `[expiry / inaccessible-deletion process]` | `[role]` |

### Vendor and data-location record

No vendor may receive real data until its row is approved. Google Calendar must
contain no direct identifiers or clinical content, but opaque appointment ID,
visit time and location are still P2 linkable operational data. Do not call the
projection “zero PII”; D-002/D-009 must approve processor role, location,
least-privilege scope/ACL, retention/deletion, subprocessor and incident owner.

The separate
[Expansion S plan](../product/2026-07-28-surgery-follow-up-expansion-plan.md)
adds surgery/anesthesia/clinical follow-up and payment/refund/settlement
categories. They are not covered by a future booking-data approval alone:
D-014/D-015 require a new field inventory, purpose, retention, correction,
export, role-scope and vendor review before any real record is stored.

| Vendor / system | Role | Data categories | Processing location / cross-border assessment | Contract, access and deletion evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Firebase / selected cloud project | `[processor role]` | `[minimum categories]` | `[not selected]` | `[not approved]` | Pending |
| Website hosting | `[processor role]` | `[minimum categories]` | `[not selected]` | `[not approved]` | Pending |
| Google Calendar | Operational projection only | No direct identifier/clinical content; P2 opaque appointment ID＋time＋location | `[not approved]` | `[scope, ACL, retention, deletion and owner not approved]` | Pending |
| Future NAS | `[processor / internal system]` | `[not approved]` | `[not approved]` | `[new ADR required]` | Pending |

Also record, before approval: browser localStorage/cookie purpose and expiry;
telemetry/log/alert data categories; every subprocessor and processing region;
security-incident notification responsibility/SLA; rights-request statutory
time limits; deletion evidence; and the exact backup exception/replay process.

## D-003 — Published policy and acceptance record

| Field | Approved answer | Evidence / owner |
| --- | --- | --- |
| Public policy URL | `[URL]` | `[release owner]` |
| Immutable policy identifier | `[e.g. privacy-v1]` | `[release owner]` |
| Effective date (Asia/Taipei) | `[date]` | `[legal owner]` |
| Publication and change-notice process | `[process]` | `[legal / operations owner]` |
| What is recorded at booking | `policy ID, notice display time, consent or other approved legal basis, and booking request ID` | `[technical owner]` |
| Accessibility and language review | `[result]` | `[operations owner]` |

The acceptance mechanism must not hide or pre-tick a marketing permission.
Marketing remains outside the appointment flow unless separately approved.

## Consolidated approval record

```text
Decision IDs: D-001 / D-002 / D-003
Approved answers: [attach completed tables or immutable policy version]
Approved by (clinic owner):
Approved by (privacy/legal owner):
Approval date (Asia/Taipei):
Evidence retained at:
Required implementation follow-up:
```

## Gate after approval

After all three decisions are formally approved, update the decision register,
freeze the approved policy as `privacy-vN`, and create a local-only acceptance
contract test. This still does **not** enable the booking endpoint: D-004 to
D-005 remain required for appointment rules, while approved D-006 roles/access
control still require Stage 2 implementation and verification.
