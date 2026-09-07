# BOOK-PILOT — synthetic booking write-path proposal

**Status:** plan-only proposal. **Not** a decision-register change, **not**
implementation, **not** deployment authority, **not** a capability-gate
clearance.

**Date:** 2026-09-07  
**Task:** T2-GOV-01 (frozen VERIFIED STAGING plan v1.3)

This document may be rejected, rewritten, or left unused. Publishing it does
not start a pilot, does not mount `/v1/bookings`, and does not move D-004,
D-005, D-001–D-003, or any Stage 2 slice.

---

## 0. Why this exists

T1-API-01 proves appointment-write RBAC on an **unrouted**
`AppointmentController` inside a test-only Nest harness. Production
`AppModule` still serves `POST /v1/bookings` as 404. That split is
intentional: C2～C6, D-004 and D-005 still block a production booking write
route.

CAL-PILOT already shows the only pattern this repository accepts for an
expiring, synthetic-only cloud experiment: a **separately gated module**,
exact-SHA deploy, UTC fail-closed expiry, kill switch, and a runbook — never
“turn on the production controller so smoke turns green.”

BOOK-PILOT, if it is ever authorised, must copy that pattern for booking
**writes**. This file is the proposal that would have to be approved **before**
anyone designs that module. It is not that approval.

---

## 1. Scope

If later authorised by a named approver, date, exact commit, project, channel
and expiry, BOOK-PILOT would be allowed to do only the following.

1. Exercise the **already implemented** synthetic booking commands
   (create, patient self-cancel at appointment-day 10:00 Asia/Taipei, occupy-
   new-then-release-old reschedule, active unfinished limit 2) against
   **synthetic opaque identities** only.
2. Reuse the API-01 RBAC mapping: anonymous / suspended → 401; other-patient
   and physician-denied mutations → 403; front-desk restricted deletion → 403;
   manager-allowed reschedule → 2xx. Missing and other-patient rows must not
   become an existence oracle for patients.
3. Run only in `beauessence-clinic-staging` (or a successor isolated project
   named in the later authority), on an **expiring** surface, with a kill
   switch that fails closed at a recorded UTC instant.
4. Keep browser, social, and any future app clients on `apps/api`. They still
   never open Firestore (ADR-0001, ADR-0003). Calendar remains a projection
   (ADR-0002); BOOK-PILOT does not make Calendar an availability lock.
5. Persist outbox jobs for any later external effect; never call Calendar,
   email, LINE, Meta or NAS from a Firestore transaction.

The proposal does **not** pick a public URL as approved. Two shapes are
compatible with the Safety Floor; neither may be built from this file alone:

- a dedicated `BookPilotModule` (same idea as `CalendarPilotModule`), with its
  own prefix and authn adapter, imported only under later authority; or
- a feature-flagged write path that is dead after the recorded expiry, still
  **not** the production `AppointmentController` mounted as `/v1/bookings`.

Mounting `AppointmentController` on production `AppModule` to make a smoke
job green is out of scope even as a future option.

---

## 2. Exclusions

BOOK-PILOT must not include, imply, or be used to smuggle:

- Real patient, payroll, calendar, social-message or NAS data.
- Treating recorded D-004 / D-005 owner input as legal approval for
  real-patient production booking.
- Closing or weakening `appointment_scheduling` /
  `appointment_cancellation` remaining blockers in
  `apps/api/unrouted-inventory.json`.
- Routing production `/v1/bookings` on `AppModule`.
- Cloud Firestore / Authentication as a general staff platform (D-010
  target approval is not C1 apply authority).
- Public clinic booking, vendor widgets, or a live Hosting channel.
- Surgery, anesthesia, clinical-record persistence, patient money, or staff
  settlement (D-014 / D-015).
- Calendar-to-system writes (D-016) or a Calendar test projection used as
  lock (D-009).
- Granting `physician` any permission.
- `terraform apply`, live-channel Hosting, or reusable “preview” authority
  from an earlier commit.
- Fake loading / permission-denied UX that pretends C2–C4 identity exists.

---

## 3. Synthetic-only

Every BOOK-PILOT fixture, log, screenshot, audit row, Calendar title (if any
projection is later separately authorised), and commit message must use
opaque synthetic identifiers. No realistic name, phone, national id, or
chart content.

Suggested bound (not authorised by this file): a closed code list in the
same spirit as CAL-PILOT `A01`–`A30`, or the existing in-browser synthetic
store — never a copy of operational clinic records.

Retention: synthetic rows may be wiped on expiry except anonymous audit
needed for the kill-switch investigation. Real-data retention rules (D-001–
D-003) are not opened by a synthetic wipe.

---

## 4. Expiry

No BOOK-PILOT write path may exist without a **single recorded UTC expiry**
in the same authority that names the commit, project and channel.

Required properties, copied from CAL-PILOT rather than invented:

- Application fail-closed at that instant (HTTP 410 or equivalent, no
  partial writes).
- Scheduler / worker / Hosting channel stopped or expired on the same
  instant, not “best effort later.”
- Extension is a **new** change plan with a new UTC instant, not a reuse of
  this proposal or of earlier preview authority.
- This file does **not** choose an expiry date. Choosing one is an owner
  act inside a later authority record.

---

## 5. Kill switch

Order is fixed. It is the CAL-PILOT emergency stop with booking names:

1. Pause any BOOK-PILOT scheduler or worker trigger.
2. Set `bookPilotWritesEnabled` (name illustrative) to `false` and append an
   anonymous audit row. In-flight transactions finish or abort; new writes
   are denied.
3. Shift API / worker traffic to the recorded previous revision if one
   exists.
4. Expire or delete the BOOK-PILOT Hosting / preview channel.

First release has no previous revision: the safe stop is pause, disable
writes, remove invoker / public access, and expire the channel. Do not
delete synthetic appointments, outbox, or anonymous audit during the stop.

Key-leak path: disable the Secret version, revoke invoker bindings, rotate.
That is incident response, not this proposal’s approval.

---

## 6. Rollback

Rollback is the inverse of a later, authorised apply — not a git revert of
`main` by an agent.

| Layer | Rollback |
| --- | --- |
| Code | Stop importing any future `BookPilotModule`; production `AppModule` stays health + CAL-PILOT only for writes that are already separately authorised. |
| Runtime | Traffic to the recorded previous Cloud Run revision; if none, public invoker off. |
| Data | Do not “undo” synthetic bookings by deleting history. Release slots through the domain planner if a later authority says so. |
| Hosting | Previous channel version, or delete the expiring channel. |
| Gates | Restore any temporary BOOK-PILOT inventory exception; `AppointmentController` remains unrouted. |

A rollback table in a later deployment record must list the exact previous
revision, image digest and Hosting version **before** apply. First release
must say “no previous revision” instead of claiming a roll-back that cannot
run.

---

## 7. Evidence

Nothing in this proposal is evidence that a booking write route is safe.

**Already true (dated, not this file’s job to re-verify):**

- Domain + in-memory + Firestore (Emulator) booking commands exist on
  `main` for release/rebook, occurrence identity, cutoff, horizon,
  active-limit 2, and occupy-then-release reschedule (T1-DATA-01/02,
  T1-BOOK-01–04 as they land).
- Unrouted RBAC harness (T1-API-01) maps the six frozen cases when that
  PR is merged; until then the harness exists only on its branch.

**Still required before any BOOK-PILOT apply (later authority, not this
PR):**

| Evidence | Meaning |
| --- | --- |
| Decision register | D-004 / D-005 still `pending` unless a **later** register edit by the named owner closes them. This proposal must not be cited as that edit. |
| Exact commit | `Verification evidence` green on the deploy candidate SHA. |
| Exact-SHA runtime | Same family as the CAL-PILOT runtime-only update primitive (T0-DEP-01): digest + expiry + confirm flag. |
| Authn | Server-verified synthetic staff/patient identity (C2/C3). Browser role-play is not that. |
| Authz | The API-01 mapping, on the live module, with the same 401/403/2xx cases. |
| Audit | Permanent append in the same transaction as the write (C5). |
| Emulator | `test:rules` on that commit if Rules change; existing booking Rules tests if they do not. |
| Synthetic-only scan | No real identity fields in fixtures, logs, or Calendar titles. |
| Kill switch drill | Expiry and the four-step stop exercised against staging, with a dated record. |

Local `CODE-ONLY` / `GATE-VERIFIED` on a laptop is not `VERIFIED-PRODUCTION`.
A green CI on another commit is not this candidate’s evidence.

---

## 8. Required gate changes

**This pull request applies none of these.** They are the checklist a later
implementation PR would have to carry if the owner accepts this proposal
**and** issues a separate, exact-commit deployment authority.

1. **Keep** `AppointmentController` on the unrouted inventory until a
   production booking route is separately authorised. Do not delete D-004 /
   D-005 / C0–C6 remaining blockers from `appointment_scheduling` or
   `appointment_cancellation` because BOOK-PILOT exists.
2. If a `BookPilotModule` is added, register it as its **own** capability
   with remaining blockers: synthetic-only, UTC expiry, kill switch, C2–C6
   as applicable, D-001–D-005 still pending for real patients. Architecture
   reachability may include that module the same way it includes
   `CalendarPilotModule` — not as a back door for `/v1/bookings`.
3. Add fail-closed tests: expired window → no write; kill switch off → no
   write; anonymous → 401; other-patient → 403; production `AppModule`
   without the later authority still 404 on `/v1/bookings`.
4. Deploy scripts default-deny; require immutable digest, UTC expiry, and an
   explicit confirm flag (CAL-PILOT / T0-DEP-01 shape).
5. Do **not** edit the decision register from the implementation PR. Owner
   status changes stay in the register, in the owner’s own commit.
6. `check:architecture` must still fail if `AppointmentController` becomes
   reachable from production `AppModule` without a reviewed inventory change
   that names production booking — BOOK-PILOT inventory is not that change.
7. Preview / Hosting: expiring channel only; never live; never reusable from
   an earlier preview SHA.

---

## 9. What this file does not do

- It does not change [the decision register](phase-1-decision-register.md).
- It does not change `apps/api/unrouted-inventory.json` or any capability
  gate.
- It does not import `AppointmentController` into `AppModule`.
- It does not authorise Terraform, Hosting, or secrets.
- It does not set an expiry timestamp.

The next approvable step is an **owner decision** on whether a synthetic
BOOK-PILOT is wanted at all. If yes, the owner still owes: named approver,
date, scope, exclusions, residual risk, exact commit, project, channel, and
UTC expiry. Until that record exists, implementers keep the booking write
path unrouted.
