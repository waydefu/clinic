# Phase 0 Local Development

## What is implemented

- Pure TypeScript appointment and payroll domain rules in `packages/domain`.
- Zod v4 request, response and error contracts in `packages/contracts`.
- A NestJS + Fastify API skeleton with `GET /v1/health` only.
- A Firebase Local Emulator Suite baseline that denies all direct Firestore
  client access and tests that denial.

No appointment route, authentication provider, Firebase production project,
Google Calendar credential, service account, patient record, email delivery or
NAS connector exists in this phase.

## Safe local start

```powershell
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter @beauessence/api dev
```

Then request `http://127.0.0.1:3000/v1/health`.  The endpoint returns a static
health envelope and does not touch Firebase.

To run the Firestore rules integration test:

```powershell
pnpm test:rules
```

## Phase 0 completion conditions

1. `pnpm verify` passes.
2. `pnpm test:rules` passes locally.
3. The product owner resolves the Phase 0 blocking decisions in
   `docs/product/open-decisions.md` before any real booking route is built.
4. A formal privacy-policy text and the clinic's approved cancellation rule
   are reviewed before accepting actual patient reservations.
