# D-006 delegated-authorization hardening review — 2026-09-13

## Scope

This review records the local, synthetic-only D-006 implementation slice on
`agent/luna-d006-authorization`. It does not grant Stage 2 deployment,
production, routing, real-data, Calendar, DNS, or Firebase authority.

## Root cause

`packages/domain/src/delegated-authorization.ts` represented a delegated
authorization with a `secret` field and compared it directly. The domain
comment correctly said that this was not a security boundary, but the data
shape still made plaintext persistence easy to implement accidentally. The
attempt-limit requirement also had no explicit state transition that an
application boundary could persist atomically.

## Changes

- `packages/domain/src/delegated-authorization.ts`
  - Replaced the **server persistence** plaintext `secret` field with
    `secretKdf`, `secretSalt`, and `secretHash`.
  - Restricted delegation target roles to canonical `Role` from `roles.ts`.
  - Injected a server-side secret verifier instead of comparing in domain code.
  - Added pure `recordDelegationAttempt` state transition with an explicit
    caller-supplied maximum constrained to 1–10; locked state cannot silently
    unlock or reset.
- `packages/domain/src/delegated-authorization-common.ts`
  - Holds shared denial/record types and server input validation without
    entering the browser module graph.
- `packages/domain/src/synthetic-delegated-authorization.ts`
  - Isolates the existing browser-local synthetic plaintext path under an
    explicit synthetic-only API; this is not production authentication.
- `packages/domain/src/delegated-authorization.test.ts`
  - Converted server fixtures to verifier-shaped synthetic records.
  - Added failure counting, lock, reset, malformed-state, and unsafe-maximum
    regression tests.
- `packages/domain/src/synthetic-delegated-authorization.test.ts`
  - Proves the browser-local synthetic path still verifies, denies, and writes
    only a non-secret delegation audit record.
- `apps/api/src/platform/authorization/delegated-authorization-crypto.ts`
  - Added server-only Node adapter using random per-record salt, scrypt, and
    `timingSafeEqual`.
  - Fails closed for disabled, malformed, unsupported-KDF, or non-string input.
  - Returns no plaintext secret in the stored record.
- `apps/api/src/platform/authorization/delegated-authorization-crypto.test.ts`
  - Proves storage does not contain the presented secret, unique salts,
    correct/wrong verification, domain wiring, disabled records, and malformed
    records.
- `apps/web/public/modules/permissions.js` and
  `apps/web/public/modules/workspace-domain.js`
  - Point the synthetic browser UI at the explicit synthetic-only module rather
    than the server persistence contract.
- `apps/web/public/vendor/domain/*` and `packages/domain/src/index.ts`
  - Regenerated domain vendor output and manifest after the split.
- `docs/architecture/rbac-matrix.md`,
  `docs/design/test-only-operations-ui.md`,
  `docs/product/test-only-scheduling-follow-up-workbench.md`,
  `docs/product/phase-1-integration-launch-approval-packet.md`, and
  `docs/enterprise-appointment-project-plan.md`
  - State partial D-006 evidence accurately without calling the complete
    identity/session/RBAC/audit boundary finished.
- `docs/product/phase-1-decision-register.md`
  - Removes the stale current-Canon claim that plaintext demonstration code is
    still present; retains D-006 `approved` and complete implementation evidence
    as unresolved.

## Acceptance criteria

- [x] No **server persistence** shape contains plaintext secret; the browser
      synthetic-only fixture remains explicitly marked non-production.
- [x] KDF verifier is server-only, salted, memory-hard, and constant-time at
      comparison.
- [x] Disabled/malformed records fail closed.
- [x] Attempt failure state locks at an explicit reviewed maximum and cannot
      silently unlock.
- [x] Canonical role type comes from `packages/domain/src/roles.ts`.
- [x] No AppModule route, cloud mutation, production resource, Calendar write,
      DNS change, or real data was introduced.
- [ ] Full D-006 evidence remains open: C2/C3 identity/session, IdP mapping,
      routed action enforcement, denied-event audit sink, UI role migration,
      field-level filtering, and persistence/atomic wiring still require later
      authorised slices.

## Verification

- `CI=true pnpm exec vitest run packages/domain/src/delegated-authorization.test.ts packages/domain/src/synthetic-delegated-authorization.test.ts apps/api/src/platform/authorization/delegated-authorization-crypto.test.ts` — PASS, 3 files and 24/24 tests.
- `CI=true pnpm run build` — PASS.
- `CI=true pnpm run check:lint` — PASS.
- `CI=true pnpm exec prettier --check` on the changed source/test/docs files — PASS.
- `CI=true pnpm run test:rules` — PASS, 13/13 files and 102/102 tests.
- `CI=true pnpm run verify` — PASS, 113 files and 1492 tests.
- `CI=true pnpm run test:e2e` — UNAVAILABLE locally: Chromium/headless shell GPU process exited 256 repeatedly and ended with `GPU process isn't usable`; no code assertion ran. The same E2E suite remains required in exact-head CI.
- Full repository `pnpm verify` — PASS on this slice; exact-head PR CI is still required.

## Required CI

Exact-head `verify`, SAST, Gitleaks, Firestore Emulator, supply-chain,
Verification evidence, UI, accessibility, auth, appointments, mobile, and
patient-portal checks must be green before merge.

## Documentation impact

Updated. Current D-006 documentation now distinguishes the completed local
crypto/data-shape slice from the remaining protected-route and identity work.

## Risks

- The KDF parameter tuple is explicit in the server adapter but remains a
  security-parameter review item before C4; the code does not claim production
  approval.
- The browser synthetic module still contains plaintext synthetic credentials by
  design. It is not a security boundary, is not production authentication, and
  must remain behind the synthetic-only UI switch.
- Attempt state is a pure transition only. The application layer must persist
  it atomically and key it by operator plus purpose; no process-local limiter is
  presented as production protection.
- Existing routes remain unrouted, and D-001～D-005 remain pending.

## Decision required

None for this local synthetic-only slice. Merge of the resulting PR remains a
separate GitHub merge decision.

## Follow-up

1. Complete the remaining D-006 C2/C3/C4 implementation only under the
   corresponding approved change packet.
2. Do not route `/v1/bookings` while D-001～D-005 remain pending.
3. Re-check the D-006 register evidence line after protected-route and audit
   integration are actually tested.
