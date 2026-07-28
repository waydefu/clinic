# Local Firestore Baseline

The local Firestore verification baseline established in Stage 0 uses only
Firebase Local Emulator Suite with the safe fake project ID
`beauessence-appointment-local`. It remains the Stage 1 local test boundary and
is not a Firebase project to create, deploy or connect to. No production
credentials, service-account files, patient data, Google Calendar access or
NAS shares are used.

## Security posture

`firestore.rules` denies every direct client read and write.  This is
intentional: the current approved architecture is `web/mobile -> Domain API ->
Firestore`, never `web/mobile -> Firestore`.

The rules test proves both unauthenticated reads and writes fail.  A future
rule change requires:

1. an ADR that documents the new client data path and threat model;
2. a privacy review and least-privilege decision;
3. updated Rules tests for allowed and denied cases; and
4. review of the API/audit impact.

## Transaction invariants

The disposable Emulator suite also exercises the server repository:

- each reservation atomically writes its appointment, slot reservation,
  `patient_booking_guards/{patientId}`, audit event, outbox job and idempotency
  record;
- simultaneous requests by different patients for one slot have one winner;
- simultaneous requests by one patient for different slots have one winner
  because every request reads and writes the same patient guard document;
- cancellation, completion and no-show conditionally release the matching
  patient guard, while cancellation request and reschedule retain it.
- each successful appointment mutation appends a strict Audit v2 event in the
  same transaction; an existing event ID is never overwritten, and a create
  conflict rolls back the appointment, slot, guard, outbox and idempotency
  writes together.

## Commands

```powershell
pnpm install --frozen-lockfile
pnpm test:rules
```

The first emulator run may download local emulator binaries. Use JDK 21 to
match CI; the run writes only disposable emulator data. Do not start an
emulator with an import or export directory containing real clinic data.

On Windows, `pnpm test:rules` uses a small cleanup launcher because Firebase
CLI can leave a Java child process running after an Emulator failure.  It only
stops processes whose command line identifies the fake local project
`beauessence-appointment-local`; it does not touch cloud projects or unrelated
Java processes.

## Limits of this test

The emulator verifies direct-client security rules locally; it is not a
production Firestore performance, concurrency-limit or index test.  Firestore
transaction behaviour and required composite indexes must later be checked in
a separate isolated cloud test environment before production rollout.
