# Cross-Package Tests

`tests/firestore/security-rules.test.ts` runs only with Firebase Local Emulator
Suite and proves that direct browser/mobile Firestore reads and writes fail.

Run it with `pnpm test:rules`. Test fixtures must use synthetic opaque
identifiers only; never use patient, appointment, payroll, Calendar or NAS data
from clinic operations.

The same command runs server-transaction suites for booking, appointment
transitions and outbox processing. Booking coverage includes same-slot
contention and same-patient/different-slot contention through
`patient_booking_guards`; losing attempts must leave no partial appointment,
slot, guard, audit, outbox or idempotency write.

The transaction suites parse persisted audit documents through
`AuditEventV2Schema`, assert privacy-minimised before/after states, and prove an
existing audit event is not overwritten: its create conflict rolls back every
sibling write.
