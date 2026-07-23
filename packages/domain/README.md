# Domain Package

Pure, deterministic clinic booking and payroll business rules. This package has
no database, HTTP, Firebase, Calendar, secret or framework dependency.

Current invariants include one-time slot reservation, server-supplied
cancellation cutoffs, authorised completion, Asia/Taipei payroll periods and a
deterministic one-patient/one-manager/one-period credit key. The API layer must
enforce the resulting credit key inside a Firestore transaction.

The booking planner also models the explicit active-booking guard written at
`patient_booking_guards/{patientId}`. A present guard rejects another booking;
terminal transitions release the matching guard, while cancellation requests
and reschedules retain it. The package describes the mutation but performs no
database I/O.

Appointment planners emit privacy-minimised Audit v2 events containing the
server actor/role, action, resource, before/after state, reason/result,
correlation/source, policy version and `schemaVersion: 2`. The domain accepts
opaque role and policy identifiers but does not define clinic policy values.

The package also contains a pure, in-memory test-only booking workflow for the
documented synthetic profile. It proves idempotency, audit and opaque outbox
intent without connecting to Firestore or Calendar; it is not a repository,
HTTP route or production policy.
