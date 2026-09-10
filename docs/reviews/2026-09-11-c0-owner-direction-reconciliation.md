# 2026-09-11 C0 owner-direction reconciliation

**Type:** dated evidence. Not deployment authority. Not real-data
authority. Not a Stage 2 apply.
**Construction date:** 2026-09-11 (Asia/Taipei).
**Repository baseline at write:** `origin/main`
`e7aff02dc7b158ca4a3ff70a15fad476c2cc6a6b` (verify by
`git log -1 -- docs/reviews/2026-09-11-c0-owner-direction-reconciliation.md`
after merge; this file must not cite its own SHA).
**Owner source:** clinic owner Phase 1 packet dated 2026-09-11
(summary 00 and C0～C6). The packet was supplied in-session; this record
does not fetch Google Drive.

## Verdict

| Layer | Result |
| --- | --- |
| Owner/product C0 direction | `OWNER_DIRECTION_APPROVED` |
| Engineering C0 (`stageSlices.C0`) | `revise` / `ENGINEERING_CLOSURE_PENDING` |
| C1～C6 `deploymentAuthorities` | `not_granted` |
| Formal booking route | `UNROUTED` |
| Production / real data | `NOT_AUTHORIZED` |

Owner direction is recorded in the
[decision register](../product/phase-1-decision-register.md) as FS-001,
C0-DIR-2026-09-11 and CAL-SYNC-DIR-2026-09-11. The live split is
[first-stage C0 authority](../architecture/first-stage-c0-authority.md).

This reconciliation **does not** move `stageSlices.C0` to `approved`.
Doing so would invent engineering-closure evidence that does not exist.

## Fresh technical facts used (not copied from a prior report)

| Fact | Evidence |
| --- | --- |
| Current main | `e7aff02dc7b158ca4a3ff70a15fad476c2cc6a6b` after `git fetch origin main` |
| Exact-main CI | GitHub Actions run `34415800188` SUCCESS (12 jobs, including `Verification evidence`) |
| `main` protection (live, limited) | `GET /repos/waydefu/clinic/branches/main` → `protected=true`; required context `Verification evidence`; `enforcement_level=everyone`. Full classic protection JSON remains 403 on this token — dated D-013/GC-002 still stands as dated Canon, not a live `enforce_admins` re-read |
| Formal booking | `apps/api/src/app.module.ts` imports only `CalendarPilotModule` |
| CAL-PILOT vs watch | Terraform `cal-pilot-five-minute-sync`; worker has `syncToken` machinery; no `events.watch` in `apps/worker` TypeScript |
| DATA-R03 | OPEN / WORK_REMAINS / NOT_AUTOMATICALLY_AUTHORIZED |
| SCM-R04 | OPEN / WORK_REMAINS; not a C0 documentation blocker |

## What this change does

- Records the 2026-09-11 owner packet in the Decision Register without
  changing D-001～D-016 status *values*.
- Splits owner direction from engineering C0 and from deployment
  authority.
- Updates the execution plan, Calendar plan banner, roadmap pointer and
  INDEX so the next session cannot treat C0 as still “no owner direction”.
- Adds a unit check that fails if C0 is marked `completed`/`approved` in
  `stage-2-gate-status.json` or if C1～C6 authorities are flipped without
  a matching grant.

## What this change does not do

- No `terraform apply`, Firebase/Cloud Run/IAM/DNS/secret mutation.
- No `AppointmentController` routing.
- No CAL-PILOT Scheduler or watch-channel change.
- No invented answers for 50/80/100 budget actions, DR option, or MFA
  recovery.
- No DATA-R03 codec slice and no SCM-R04 major override.

## Gates for this documentation slice

Local gates on Node `v24.20.0` in worktree
`cursor/c0-authority-reconciliation-f174`, recorded after the
implementing edits. Lookup SHA with
`git log -1 -- docs/reviews/2026-09-11-c0-owner-direction-reconciliation.md`.

| Gate | Status | Reason |
| --- | --- | --- |
| `check:docs` | `PASS` | 190 files; links/index/lifecycle |
| `check:architecture` | `PASS` | 3 dependency layers; 14 unrouted; C0 still `revise` |
| `check:governance` | `PASS` | INDEX 5007 bytes (under 5120 warn / 6144 fail); AGENTS size remains an advisory warning |
| `check:structure` | `PASS` | 243 required files |
| `test:unit` | `PASS` | 99 files / 1413 tests, including C0 authority and unwired watch-channel |
| `check:format` | `PASS` | Prettier `--check .` |
| `check:lint` (changed files) | `PASS` | ESLint on the new/edited TS/MJS files |
| worker `tsc --noEmit` | `PASS` | `apps/worker/tsconfig.json` |
| Firestore Emulator / E2E | `NOT_RUN` | no Rules/UI change; delegated to required PR CI |
| full `check:types` / `build:web` | `NOT_RUN` | delegated to required PR CI; worker `tsc` ran locally |
| Cloud apply | `NOT_AUTHORIZED` | no exact mutation authority |

Local evidence rung: **GATE-VERIFIED**. `CI-VERIFIED` requires this exact
commit's `Verification evidence`.

## Remaining HARD BLOCKERS (not solved here)

1. ENGINEERING_CLOSURE_PENDING owner/reviewer answers (budget actions, DR
   option, MFA recovery, named C0 engineering signatures, C1 project
   strategy).
2. Exact C1～C6 cloud mutation authority for each apply.
3. Production D-009 / D-016 and real Calendar field classification.
4. Real-data and production go-live authority.
