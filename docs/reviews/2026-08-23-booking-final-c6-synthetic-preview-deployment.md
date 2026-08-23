# Booking final C6 synthetic preview deployment — 2026-08-23

## Result

**PASS — EXACT C6 DEPLOYED AND 474/474 ONLINE CHECKS GREEN.** This is a new C6
record. The C5, C4, C3 and earlier deployment documents remain unchanged
historical evidence and are not relabelled.

| Field | Result |
| --- | --- |
| Exact C6 | `3a01e0721927990fdf7db8b122ddc337b22ccae6` |
| Candidate CI | [`32620288428`](https://github.com/waydefu/clinic/actions/runs/32620288428) — 11/11 `success` |
| Authority commit | `e168db7` |
| Rejected predecessor | `a9c525695c2920f82b5b5ead2def576ed8bbd927` — deployed 12:21, **rejected for final acceptance** |
| Firebase project | `beauessence-clinic-staging` (`781119800251`) |
| Hosting channel | `synthetic-review` |
| Requested expiry | `7d` |
| Preview URL | <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app> |
| Absolute expiry | `2026-08-30T05:31:16.323719674Z` (2026-08-30 13:31:16 Asia/Taipei) |
| Hosting release/version | `1787463112831000` / `7476ea2e8cd6419b` (`FINALIZED`) |
| Release time | `2026-08-23T05:31:52.831Z` (13:31:52 Asia/Taipei) |
| `verify:preview` | **PASS — 474/474**, generated `2026-08-23T05:32:12.459Z`; evidence commit equals C6 |

> **SYNTHETIC TEST ONLY — DO NOT ENTER REAL PATIENT, STAFF, CLINICAL,
> PAYROLL OR CALENDAR DATA.** The expiring URL is public to anyone who has it.

## Why C6 exists: C5 was deployed and then rejected

Exact C5 `a9c5256` was deployed to this same channel at 12:21 on 2026-08-23 and
passed `verify:preview` 474/474. It is **not** the final acceptance candidate.

`showBookingResult()` never reset `data-booking-flow-step`, so it stayed at `"3"`
once the result screen appeared. The mobile rule that hides `.patient-header`,
the announcement and the stepper during steps 2 and 3 therefore kept matching a
screen that has no current operation. On a phone, immediately after booking, the
header — and with it 查詢／取消預約, the navigation and the theme control —
disappeared. Recovery required reloading the page. Desktop was unaffected, which
is why every desktop scenario passed.

The defect is measured, not inferred:

- the visual capture retried `#booking-management-open` at 375×812 **1539 times
  over roughly 13 minutes** and timed out with `element is not visible`;
- negative control: with the fix reverted the marker reads `"3"` and the new
  regression test fails; restored, it passes. The deliberately broken version
  was **not** committed; and
- the same 17-scenario capture completes in **1.4 minutes** against C6.

C6 sets an explicit `result` marker instead. That is the only runtime change —
five lines including its comment.

**The channel URL hash has been unchanged (`xvqa68cx`) across C4, C5 and C6**
because the channel never expired and was updated in place each time. Confirm
the deployed commit, never the URL, when checking which candidate is live.

## Candidate and authority evidence

- Candidate CI passed core verify, clinic 30/30 freeze, Firestore Emulator, all
  six E2E groups including WebKit, accessibility, **`e2e-mobile` running the new
  success-state regression**, supply-chain/secrets, SAST and commit-bound
  Verification evidence on exact C6. No test or threshold was weakened.
- A local `corepack pnpm verify` on the same content passed: 64 test files, 1057
  tests, structure 220 files, **17 C6 reference PNGs**, clinic freeze 30/30,
  documentation 148 files and the performance budget.
- The docs-only authority commit recorded the exact SHA, the C5 rejection, the
  owner's one additional authorization, operator and prohibitions before
  deployment. It was not deployed.
- Operator was `wayde.fu@gmail.com`; Firebase CLI `15.18.0`.

## Exact-C6 build and deployment

- The deployment worktree `F:\診所專案\tmp\booking-c4-test` was checked out
  detached at exact C6 with no tracked changes before or after build/deploy.
- Unmodified `firebase.json` retained canonical predeploy
  `corepack pnpm run build`.
- Only the deployment process set `CI=true`. Process-scoped
  `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` was again required for the pnpm 11
  Windows `EPERM` documented in the C4 and C5 records. No repository file or
  lockfile changed.
- The command was:

  ```text
  firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging
  ```

- Upload, version finalization and release completed. The CLI repeated the known
  warning that it could not add or sync the channel domain to Firebase
  Authentication. Authentication was not enabled or modified.

## Local environment findings, recorded so the next run does not re-diagnose them

None of these were code defects; all three cost real time.

1. `tmp/booking-c4` has only a root `node_modules` junction and no per-package
   trees, so `packages/contracts` cannot resolve `zod`. Verification of the
   candidate content was run in a worktree with a complete environment after
   confirming all six changed files were byte-identical.
2. ESLint reported 1151 errors inside `playwright-report/` minified bundles left
   by earlier capture runs. That directory and `test-results/` are both in
   `.gitignore` and untracked, so a fresh-clone CI never sees them; removing
   them locally restored a green run.
3. A `git status --ignored` call timed out and left orphaned `git.exe` processes
   holding `index.lock`. The processes exited on their own; the stale zero-byte
   lock then had to be removed before the deploy checkout.

## Online verification

```text
corepack pnpm verify:preview -- https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app
Preview evidence written to output/evidence (success; 474/474 checks passed).
Commit: 3a01e0721927990fdf7db8b122ddc337b22ccae6
```

The verifier covered the embedded exact commit, staging-host containment,
routes, CSP/security/noindex headers, HTML no-cache, hashed JS/CSS assets and
immutable asset caching, and the synthetic/no-backend boundary. It made no
Calendar or backend connection.

## Governance observations recorded, not resolved

1. Commit `b1a1104` modified the frozen clinic file
   `apps/web/public/clinic-booking.css`. The gate worked: that commit went red
   on `Verification evidence` and the core job, and `8cbc4d7` reverted it.
   Current HEAD verifies 30/30 frozen files.
2. Commit `c139073` has **no check runs at all** and was never independently
   validated. The branch tip is green.
3. The staging project's **`live` channel still carries release
   `1787409828279000` dated `2026-08-22T14:43:48Z` with expiry `never`**, which
   sits outside the preview authority in AGENTS.md safety boundary 8. Per owner
   instruction it was **not** modified, deleted or redeployed; it was confirmed
   unchanged after this deployment. It remains an open owner decision.

## Safety and rollback

- Only the expiring Hosting preview channel changed. Live Hosting, Firestore,
  Functions, Storage, Cloud Run, Authentication, DNS and CORS were not changed.
- No Google Calendar credential, ID or data was used; the original Calendar was
  not accessed and no private test Calendar was connected.
- No real data was used. The preview remains browser-local, `noindex` and has no
  production API.
- Vendor evaluation is `/booking` only. Staff routes are not vendor surfaces.
- C6's 60-day and `>20 minutes` rules are synthetic owner-acceptance behavior;
  D-004/D-005 remain pending.
- Rollback is preview auto-expiry or early deletion of `synthetic-review` using
  the [runbook](../runbooks/synthetic-online-preview.md#下架). Source/docs rollback
  uses `git revert`; no backend or real-data rollback exists.
