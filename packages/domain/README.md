# Domain Package

Pure, deterministic clinic booking and payroll business rules. This package has
no database, HTTP, Firebase, Calendar, secret or framework dependency.

Current invariants include one-time slot reservation, server-supplied
cancellation cutoffs, authorised completion, Asia/Taipei payroll periods and a
deterministic one-patient/one-manager/one-period credit key. The API layer must
enforce the resulting credit key inside a Firestore transaction.

The package also contains a pure, in-memory test-only booking workflow for the
documented synthetic profile. It proves idempotency, audit and opaque outbox
intent without connecting to Firestore or Calendar; it is not a repository,
HTTP route or production policy.
