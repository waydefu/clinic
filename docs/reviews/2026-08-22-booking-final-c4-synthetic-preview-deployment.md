# Booking final C4 synthetic preview deployment — 2026-08-22

## Result

**PASS — EXACT C4 DEPLOYED AND 474/474 ONLINE CHECKS GREEN.** This is a new
C4 record. C3 and earlier deployment documents remain unchanged historical
evidence.

| Field | Result |
| --- | --- |
| Exact C4 | `b3bc47721aaf2ca8de89ed62159dd7461d0eae30` |
| Candidate CI | [`32561071094`](https://github.com/waydefu/clinic/actions/runs/32561071094) — 11/11 `success` |
| Authority commit / CI | `1997a5988514aecf74311efeee74064a20e0ef42` / [`32561272179`](https://github.com/waydefu/clinic/actions/runs/32561272179) — 11/11 `success` |
| Firebase project | `beauessence-clinic-staging` (`781119800251`) |
| Hosting channel | `synthetic-review` |
| Requested expiry | `7d` |
| Preview URL | <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app> |
| Absolute expiry | `2026-08-29T08:10:26.405373913Z` (2026-08-29 16:10:26 Asia/Taipei) |
| Hosting release/version | `1787386261863000` / `11f4ad12b13c1512` (`FINALIZED`) |
| Release time | `2026-08-22T08:11:01.863Z` (16:11:01 Asia/Taipei) |
| `verify:preview` | **PASS — 474/474**, generated `2026-08-22T08:11:22.996Z`; evidence commit equals C4 |

> **SYNTHETIC TEST ONLY — DO NOT ENTER REAL PATIENT, STAFF, CLINICAL,
> PAYROLL OR CALENDAR DATA.** The expiring URL is public to anyone who has it.

## Candidate and authority evidence

- Exact C4's local and remote branch SHAs matched; `origin/main` remained PR
  #23 merge commit `5df89f0ef75ebe8cf63277d982b9c7330b0e5104` and the verification workflow
  had zero diff from main.
- Candidate CI passed core verify, clinic 30/30 freeze, Firestore Emulator, all
  six E2E groups including WebKit, accessibility, supply-chain/secrets, SAST and
  commit-bound Verification evidence.
- The docs-only authority commit recorded the exact SHA, owner-authorized
  project/channel/expiry, operator and prohibitions before deployment. Its own
  11/11 CI passed; it was not deployed.
- Operator was `wayde.fu@gmail.com`; Firebase CLI `15.18.0` reported the target
  project `ACTIVE`.

## Exact-C4 build and deployment

- Deployment worktree
  `F:\診所專案\tmp\booking-c4-deploy-ready-b3bc477` remained detached at exact
  C4 and had no tracked changes before or after build/deploy/verify.
- Repository and established dependency-environment lockfiles both had SHA-256
  `7B0721E132B0A54DB574A35CF4D2C23B49E728BB012075B66B018E1F2CBB6E36`.
- A first fresh dependency-link attempt in a different exact-C4 worktree hit a
  Windows `EPERM` while copying a cached package licence after 34 packages. It
  was not used. The successful clean worktree used the already complete,
  lock-identical workspace dependency environment; process-only
  `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false` prevented pnpm 11 from trying to
  purge that external junction. No repository or lockfile changed.
- Unmodified `firebase.json` retained canonical predeploy
  `corepack pnpm run build`. It built all workspace packages, synchronized 18
  vendored domain files and produced 77 web files, 53 content-hashed.
- Only the deployment process set `CI=true`; it ran:

  ```text
  firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging
  ```

- Hosting upload, version finalization and release completed. The CLI repeated
  the known warning that it could not add/sync the channel domain to Firebase
  Authentication. Authentication was not enabled or modified; the Hosting
  release succeeded.

## Online and UI verification

The same exact-C4 worktree ran the canonical command:

```text
corepack pnpm verify:preview -- https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app
Preview evidence written to output/evidence (success; 474/474 checks passed).
Commit: b3bc47721aaf2ca8de89ed62159dd7461d0eae30
```

The verifier covered the embedded exact commit, staging-host containment,
routes, CSP/security/noindex headers, HTML no-cache, 40 unique hashed JS/CSS
assets and immutable asset caching. It made no Calendar or backend connection.
The same runtime's [16 C4 visual scenarios](ui-visual-c4-2026-08-22.md) were
manually inspected and have zero console warnings/errors.

## Safety and rollback

- Only the expiring Hosting preview channel changed. Live Hosting, Firestore,
  Functions, Storage, Cloud Run, Authentication, DNS and CORS did not change.
- No Google Calendar credential, ID or data was used; the original Calendar
  was not accessed and no private test Calendar was connected.
- No real data was used. The preview remains browser-local, `noindex` and has no
  production API.
- Vendor evaluation is `/booking` only. Staff routes are not vendor surfaces.
- C4's 60-day and `>20 minutes` rules are synthetic owner-acceptance behavior;
  D-004/D-005 remain pending.
- Rollback is preview auto-expiry or early deletion of `synthetic-review` using
  the [runbook](../runbooks/synthetic-online-preview.md#下架). Source/docs rollback
  uses `git revert`; no backend or real-data rollback exists.
