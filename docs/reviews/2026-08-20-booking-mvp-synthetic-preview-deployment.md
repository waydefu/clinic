# Booking MVP Synthetic Preview Deployment — 2026-08-20

## Result

**PASS — exact candidate C deployed and verified.** This review records an
expiring, static, synthetic-only Firebase Hosting preview. It is not a live
Hosting release, production approval, backend deployment or authority to use
real data.

| Field | Evidence |
| --- | --- |
| Approver | Project owner; one controlled exact-C retry with process-scoped `CI=true` was authorised on 2026-08-20 |
| Operator | `wayde.fu@gmail.com` |
| Project / site | `beauessence-clinic-staging` (project number `781119800251`) |
| Channel | `synthetic-review` |
| Deployed SHA | `7e0add8079b37da2e1c11ef4f59660554b9b66d8` (candidate C) |
| Preview | <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app> |
| Release | `1787215117437000` |
| Version | `461a8ca164840843` (`FINALIZED`) |
| Deployed at | `2026-08-20T08:38:37.437Z` (`2026-08-20 16:38:37 Asia/Taipei`) |
| Expires | `2026-08-27T08:37:05.942064109Z` (`2026-08-27 16:37:05 Asia/Taipei`) |
| Verification | `corepack pnpm verify:preview -- <preview-url>`: **463/463 PASS** at `2026-08-20T08:39:00.239Z` |

## Deployment audit trail

The first authorised attempt reached the canonical Hosting predeploy but
stopped before build or upload with
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. The earlier instruction prohibited
`CI=true`, so that stop was correct. The owner subsequently authorised one
controlled retry using `CI=true` only as a non-interactive process environment
declaration.

Before the retry, the detached deployment worktree was clean and its `HEAD` was
candidate C. `firebase login:list` and `firebase projects:list` confirmed the
operator and exact staging project. The old channel release was the 2026-08-19
version `4e3488c61dc64188`; its mere URL/extended expiry was not treated as
delivery evidence.

The retry used the unchanged canonical command:

```powershell
$env:CI = "true"
firebase hosting:channel:deploy synthetic-review --expires 7d --project beauessence-clinic-staging
```

The configured `corepack pnpm run build` predeploy remained enabled. It rebuilt
the workspace, synchronized 18 domain vendor files, produced a 76-file hashed
Hosting dist, uploaded it, finalized a new version and released it to the
preview channel. Candidate C remained free of tracked modifications after the
dependency/build action and after online verification. `CI=true` was not added
to any repository file or persistent configuration.

Firebase CLI also warned that it could not add the channel domain to or sync
Firebase Authentication state. Authentication was outside this static-preview
authority and was not activated. The new Hosting release completed, and the
repository's online verifier passed all checks, so the warning is recorded as a
non-blocking preview limitation rather than hidden.

## Online verification

The verifier fetched the new/current channel release and proved the embedded
commit marker was exact candidate C. Its 463 checks covered:

- `/booking`, `/clinic`, `/privacy` and the synthetic staff workbench on the
  staging host;
- `Content-Security-Policy`, `X-Robots-Tag: noindex`,
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, cross-origin isolation headers and route markers;
- HTML `Cache-Control: no-cache` and content-hashed JS/CSS with
  `public, max-age=31536000, immutable`;
- the `LOCAL TEST ONLY`／`ONLINE PREVIEW` warnings, browser-local state and
  patient identity masking; and
- the static network boundary: no production API, Firestore, Calendar, LINE,
  Meta or NAS connection.

The `/clinic` source and frozen 30-file baseline were not modified. Online
verification confirms the deployed route serves the frozen candidate-C
content; it does not create new authority to edit that surface.

## Safety and disposition

- **LIVE HOSTING DEPLOYED:** NO.
- **BACKEND DEPLOYED:** NO.
- **FIRESTORE / FUNCTIONS / STORAGE / CLOUD RUN DEPLOYED:** NO.
- **FIREBASE AUTHENTICATION ACTIVATED:** NO.
- **CALENDAR CONNECTED:** NO.
- **REAL DATA USED:** NO.
- **PRODUCTION RESOURCE TOUCHED:** NO.
- **BOOK-MVP-005:** PASS — verified URL and expiry are now in the vendor and
  owner packages.
- **PR #23:** OPEN / UNMERGED pending owner final review.
- **PR #22:** NOT MERGED and not reused.

The channel expires automatically. Early removal follows the
[synthetic online preview runbook](../runbooks/synthetic-online-preview.md#下架).
Repository rollback uses `git revert`; shared history must not be rewritten.
