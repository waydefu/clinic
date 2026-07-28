# Test-Only Sandbox Baseline

**Authority:** Project owner instruction on 2026-07-20: open testing while all
formal approvals remain blank.

**Status:** Local synthetic-test profile only. It is not a clinic policy,
privacy policy, service catalogue, compensation rule, operating procedure or
production approval. D-010 target architecture/SLO was approved on 2026-07-28;
the remaining D-001 through D-009 and D-011 decisions keep their current status
in the decision register. This sandbox still receives no new Cloud authority
from the D-010 target approval.

## Hard boundaries

1. **Superseded on 2026-07-21 and supplemented by the recorded 2026-07-27 owner
   batch for the patient booking form.** The synthetic form may collect name,
   phone, birth date with an optional year, national ID or passport, NHI-card
   intent, a short patient note, the approved request/source tags and a
   conditional optional referrer name. It does not collect LineID or gender.
   Those values stay in the visitor's own browser `localStorage`; nothing is
   transmitted to or stored by the clinic. See the decision register and
   owner-batch delivery record for the mitigations.
   Everywhere else — staff accounts, announcements, audit records, outbox jobs
   and the calendar projection — opaque identifiers remain mandatory, and no
   real staff member or calendar entry may be used.
2. The browser pages hold their whole state in `localStorage`; there is no
   backend, database or login. The local site requires `TEST_ONLY_WEB_ENABLED=true`
   and binds to `127.0.0.1`. The API no longer carries test-only routes, so it
   is not part of this profile.
   The separately authorized online preview is static Firebase Hosting only
   and has no server-side state either.
3. No cloud Firestore, Realtime Database, Functions, Cloud Run, Storage,
   Authentication, Google Calendar, LINE, Meta, email, SMS, NAS, payment or
   identity-provider connection is permitted. The only cloud exception is the
   temporary Hosting preview documented on 2026-07-21.
4. No test-only value may be copied to production configuration. Production
   needs the corresponding formally approved D-001 through D-011 record.
5. The API carries no test-only routes at all; it exposes `/v1/health` only,
   and the booking write path stays unrouted until the Phase 1 gate opens. The
   static website must refuse to start locally unless
   `TEST_ONLY_WEB_ENABLED=true`. Any route that does not yet enforce
   authentication may only be enabled with `ALLOW_UNAUTHENTICATED_ROUTES=true`,
   which makes the loopback bind non-negotiable. An online build must visibly
   say `ONLINE PREVIEW`, use no backend, include `noindex` and security
   headers, deploy only to the separate staging project, and use an expiring
   preview channel rather than the live channel.

## Synthetic parameters

| Concern | Test-only value | Deliberate limitation |
| --- | --- | --- |
| Domain/contract fixture policy acceptance | `privacy-v1` at a fixed UTC timestamp | Fixture-only contract coverage; not a published policy or real consent |
| Browser notice gate | UI-only “draft read” checkbox; no policy ID, display time or acceptance record is stored | Not evidence of notice or consent; D-003 remains pending |
| Service | `service_test_consult` | Not a clinic service catalogue |
| Resource and slot | `resource_test_a`, one 30-minute UTC slot | Capacity, schedule and blackout policy remain unresolved |
| Cancellation cutoff | 24 hours before the synthetic slot | Not a clinic cancellation rule |
| Booking actors | `test_patient`, `test_front_desk` | Not an identity-provider or role decision |
| Completion actors | `test_front_desk`, `test_clinic_admin`, `test_system` | Not a final role matrix |
| Calendar side effect | In-memory outbox record with opaque IDs only | No API call, event or credential |
| Workload report | `manager_test_001`, unique completed synthetic patients and rule `v1` | No wage amount, assignment policy, month-close authority or real payroll; D-007 and D-008 remain policy-gated |
| Scheduling workbench | In-memory `Asia/Taipei` weekly intervals plus `closed` / `extra_open` date exceptions | No clinic timetable, capacity decision, calendar projection or persistent configuration; D-004 remains policy-gated |
| Follow-up decision | Explicit staff decision, optional target date, multi-select follow-up tags and a certificate count | No clinical inference; the system never decides on its own |
| Patient booking form | Name, phone, birth date (optional year), national ID or passport, NHI-card intent, short note, approved request/source tags and a conditional optional referrer name, held only in the visitor's browser; screen/list views mask identity documents, while the synthetic intake print can show the full test value; no LineID or gender | Not patient authentication, not a lawful basis, and not permission to rely on real data operationally; D-001～D-003 and D-006 remain policy-gated |

## Test objectives

The local model must prove, using only the above parameters:

1. One available slot becomes reserved exactly once.
2. A repeated identical idempotency key replays the same result without a new
   reservation, audit event or outbox job.
3. Reusing a key for a different request is rejected.
4. A conflicting reservation is rejected.
5. Cancellation observes a supplied cutoff and leaves an audit event.
6. An unauthorised synthetic actor cannot mark a visit completed; an allowed
   synthetic role can, with audit evidence.
7. An outbox record contains opaque identifiers only and has no external side
   effect.
8. The local browser can exercise the synthetic workflow without receiving or
   transmitting personal data.
9. A synthetic workload report counts distinct opaque patient IDs for one
   opaque manager and Taipei payroll month, while retaining its rule-version
   breakdown. It must not calculate compensation or infer an assignment rule.

## Exit from test-only mode

When a real decision is approved, add its answer, owner, date and evidence to
the decision register; then replace the matching synthetic parameter through a
reviewed implementation change. Do not alter or delete test-only evidence—it
explains why the test profile existed.
