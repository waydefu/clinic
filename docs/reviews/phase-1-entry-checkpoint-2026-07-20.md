# Phase 1 Entry Checkpoint - 2026-07-20

## Entry result

Phase 0 is complete and the project enters Phase 1 in a local-only mode.

## Evidence carried forward

- `pnpm install --frozen-lockfile` completed with the lockfile intact.
- `pnpm verify` passed: structure check, TypeScript builds and 11 unit tests.
- `pnpm test:rules` passed: direct Firestore client read and write are denied
  by the local Emulator rules test.
- The API exposes only `GET /v1/health`; no booking write route exists.
- No cloud project, external integration, patient data or credential has been
  configured.

## Phase 1 constraints

- The privacy-policy draft is not published or approved.
- Appointment capacity and cancellation policy remain unresolved.
- Identity, staff roles and completion authority are not yet approved.
- Calendar and cloud deployment remain future review items.

## Next controlled action

Use `docs/product/phase-1-decision-register.md` to record the first approved
decision. Only then start the corresponding local domain/contract/API task.
