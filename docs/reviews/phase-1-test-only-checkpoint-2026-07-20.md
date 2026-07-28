# Phase 1 Test-Only Checkpoint — 2026-07-20

> Historical local-only checkpoint. The later, separately authorised static
> Hosting preview is recorded in
> [`phase-1-synthetic-online-preview-checkpoint-2026-07-21.md`](phase-1-synthetic-online-preview-checkpoint-2026-07-21.md).
> The current visual baseline is recorded in
> [`ui-visual-baseline-2026-07-28.md`](ui-visual-baseline-2026-07-28.md); this
> checkpoint and its image remain historical evidence only.

## Result

The project owner authorised synthetic local testing while formal clinic
decisions remain blank. The test-only booking model is implemented and
verified. Its local browser harness uses a double-gated in-memory API and a
loopback static Web page; there is no public booking route, cloud Firebase
project, Calendar call, NAS connection or real data.

## Evidence

- `corepack pnpm verify` passed: 48 required files, four workspace builds and
  23 unit tests.
- `corepack pnpm test:rules` passed: two Firestore Emulator tests confirm that
  direct client reads and writes are denied.
- The synthetic workflow has six focused tests for single reservation,
  idempotent replay, conflicting key reuse, slot conflict, cancellation cutoff
  and authorised completion with audit/outbox records.
- The Firestore Rules runner now launches the lockfile-installed Vitest entry
  point directly, rather than relying on a globally installed `pnpm` shim.
- The local website starts only with `TEST_ONLY_WEB_ENABLED=true`, while its
  in-memory API routes are absent unless `ENABLE_TEST_ONLY_BOOKING=true` is
  set before API startup.
- A headed local-browser run at `http://127.0.0.1:3100/` created a synthetic
  reservation, recorded an authorised completion, created and cancelled a
  second reservation, then reset all in-memory state. The clean reload and
  subsequent flow emitted no browser-console errors. This historical viewport
  evidence is retained at
  [`assets/test-only-booking-flow-2026-07-20.png`](assets/test-only-booking-flow-2026-07-20.png)
  alongside this checkpoint. This repository asset records the 2026-07-20
  checkpoint and is not the current booking UI baseline.
- `corepack pnpm check:ui` now guards the professional test dashboard against
  non-loopback endpoints and data input controls, and requires visible local
  boundaries, landmarks, live updates and keyboard focus treatment. A headed
  browser verified first-Tab access to the skip link, Enter navigation to
  `#main-content`, focus transfer to the main landmark, a synthetic booking
  action and reset. The console reported zero errors and zero warnings.

## Tested implementation boundary

| Area | Verified locally | Explicitly not verified or enabled |
| --- | --- | --- |
| Booking state | Single synthetic slot reservation and conflict rejection | Firestore transaction or public API |
| Idempotency | Identical replay returns the stored response; different reuse fails | Distributed persistence or client request handling |
| Cancellation | Synthetic supplied cutoff and audit/outbox record | Clinic cancellation policy, fee or patient notification |
| Completion | Synthetic authorised roles only, with audit/outbox record and non-monetary workload aggregation | Real identity provider, staff role matrix or payroll credit |
| Calendar | Opaque in-memory outbox intent only | OAuth, calendar event, credential or external call |
| Firestore Rules | Direct browser/mobile access is denied in local Emulator | Server SDK transaction, indexes, cloud performance or deployment |
| Browser prototype | Headed loopback run of reserve, completion, cancellation, reset and keyboard skip navigation; only synthetic IDs and in-memory API state | Patient Web UI, real authentication or public write route |

## Formal-decision status

All D-001 through D-011 remain `pending`. The values in
[`../product/test-only-sandbox-baseline.md`](../product/test-only-sandbox-baseline.md)
are test fixtures, not provisional clinic policy. They must never be copied to
a real environment or presented to a patient.

## Next controlled action

When the clinic supplies a concrete approved answer, update the corresponding
decision-register entry first. Then replace only the matching synthetic test
fixture with a reviewed, local-only implementation and add the required test.
The first real booking-path design task requires D-001 through D-006.

## Environment note

The checks ran with Node `24.15.0` while the repository declares `24.14.0`.
The tools emitted a version warning but all checks passed. Align the declared
version and the delivery environment before any release process is introduced.
