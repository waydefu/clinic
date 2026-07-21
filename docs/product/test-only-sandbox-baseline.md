# Test-Only Sandbox Baseline

**Authority:** Project owner instruction on 2026-07-20: open testing while all
formal approvals remain blank.

**Status:** Local synthetic-test profile only. It is not a clinic policy,
privacy policy, service catalogue, compensation rule, operating procedure or
production approval. D-001 through D-011 remain `pending` in the decision
register.

## Hard boundaries

1. Use only opaque synthetic identifiers such as `patient_test_001` and never
   use a real name, phone number, email address, appointment, staff member or
   calendar entry.
2. The test profile uses only pure in-memory domain state. The local website
   requires both `ENABLE_TEST_ONLY_BOOKING=true` and
   `TEST_ONLY_WEB_ENABLED=true`, with both processes bound to `127.0.0.1`.
   The separately authorized online preview is static Firebase Hosting only;
   it uses browser `localStorage` with fixed synthetic identifiers and has no
   server-side state.
3. No cloud Firestore, Realtime Database, Functions, Cloud Run, Storage,
   Authentication, Google Calendar, LINE, Meta, email, SMS, NAS, payment or
   identity-provider connection is permitted. The only cloud exception is the
   temporary Hosting preview documented on 2026-07-21.
4. No test-only value may be copied to production configuration. Production
   needs the corresponding formally approved D-001 through D-011 record.
5. Test-only API code must remain disabled by default. Its local API routes must
   not exist unless `ENABLE_TEST_ONLY_BOOKING=true`; its static website must
   refuse to start locally unless `TEST_ONLY_WEB_ENABLED=true`. An online
   build must visibly say `ONLINE SYNTHETIC PREVIEW`, use no backend, include
   `noindex` and security headers, deploy only to the separate staging project,
   and use an expiring preview channel rather than the live channel.

## Synthetic parameters

| Concern | Test-only value | Deliberate limitation |
| --- | --- | --- |
| Policy acceptance | `privacy-v1` at a fixed UTC timestamp | Not a published policy or real consent |
| Service | `service_test_consult` | Not a clinic service catalogue |
| Resource and slot | `resource_test_a`, one 30-minute UTC slot | Capacity, schedule and blackout policy remain unresolved |
| Cancellation cutoff | 24 hours before the synthetic slot | Not a clinic cancellation rule |
| Booking actors | `test_patient`, `test_front_desk` | Not an identity-provider or role decision |
| Completion actors | `test_front_desk`, `test_clinic_admin`, `test_system` | Not a final role matrix |
| Calendar side effect | In-memory outbox record with opaque IDs only | No API call, event or credential |
| Workload report | `manager_test_001`, unique completed synthetic patients and rule `v1` | No wage amount, assignment policy, month-close authority or real payroll; D-007 and D-008 remain policy-gated |
| Scheduling workbench | In-memory `Asia/Taipei` weekly intervals plus `closed` / `extra_open` date exceptions | No clinic timetable, capacity decision, calendar projection or persistent configuration; D-004 remains policy-gated |
| Follow-up decision and patient page | Fixed opaque `patient_test_001`; explicit synthetic staff decision and optional local target date | No clinical inference, patient authentication, public site, PII or notification; D-001～D-006 and D-011 remain policy-gated |

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
