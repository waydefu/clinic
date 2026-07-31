# Local hardening and CI handoff — 2026-07-29

## Status

The local hardening batch is implemented, committed, pushed and available in a
draft pull request. The expiring synthetic Hosting preview is deployed and
verified. At handoff commit `47bc963`, GitHub CI was not green and the failures
below were intentionally handed to the next implementer. Commit `fc62274`
later applied the three repository-owned repairs; all five verify jobs passed.
Private CodeQL still fails only when uploading SARIF because code scanning is
not enabled for this private personal repository. That is a repository
capability/policy blocker, not a reported code-scanning finding.

Post-handoff update: on 2026-07-30 the private repository's dependency graph
and Dependabot alerts were enabled. Automatic update modes remain disabled and
the initial four development-scope alerts remain open for separate review.
See the
[dated enablement record](2026-07-30-private-dependabot-alert-enablement.md).
This does not resolve the separate CodeQL capability/policy blocker.

This record does not grant cloud or production authority. The canonical
[Stage 2 gate status](../architecture/stage-2-gate-status.json) remains:

- C0: `revise`
- C1–C6 execution: `pending`
- C1–C6 deployment authority: `not_granted`

## Repository and review pointers

| Item | Value |
| --- | --- |
| Repository | `waydefu/clinic` |
| Branch | `agent/local-hardening-and-handoff` |
| Baseline implementation commit | `40e62551e2de3f83140eb68b6b0830aeb47084b5` |
| Handoff documentation commit | `47bc963c14e3f7336a6c58fabf15bf93c95113af` |
| Repository-owned CI repair commit | `fc62274c47ebea35ab9e837fe77e271d4795c8d0` |
| Draft pull request | <https://github.com/waydefu/clinic/pull/1> |
| Failed verify run | <https://github.com/waydefu/clinic/actions/runs/30438179636> |
| Failed CodeQL run | <https://github.com/waydefu/clinic/actions/runs/30438179512> |
| Successful repair verify run | <https://github.com/waydefu/clinic/actions/runs/30440960771> |
| Remaining CodeQL capability failure | <https://github.com/waydefu/clinic/actions/runs/30440960727> |

The original handoff-only commit followed the baseline implementation commit
and contained no partial CI repair. The later repair commit is recorded
separately so the original failure evidence remains attributable to its actual
time and commit.

## Delivered scope

- Calendar projection now fails closed across authentication, retry, HTTP
  timeout and total lease-aware projection deadlines.
- Outbox processing has full jitter, once-per-batch attempt protection and
  query overfetch.
- Non-loopback API and Firestore Emulator routes require explicit opt-in.
- The scheduling workbench has pagination, keyboard shortcuts, responsive and
  forced-colors improvements.
- Public-page scans and capability reachability are machine-enforced.
- C0 readiness artifacts, machine-readable C1–C6 status and the data
  classification/field inventory are registered in the documentation map.

## Validation evidence

| Gate | Result |
| --- | --- |
| `corepack pnpm verify` | passed; 44 test files and 641 unit tests |
| Firestore Emulator | passed; 6 files and 66 tests |
| Playwright local | passed; 175 tests |
| Online preview | passed; 452/452 checks |
| Supply chain | passed under the existing reviewed policy exceptions |

The supply-chain exceptions remain one reviewed high advisory, three
development-only moderate warnings and three reviewed development-only licence
exceptions. They were not newly waived by this batch.

On this Windows checkout, Firestore Emulator must be run through a temporary
ASCII drive mapping because its Java process converts the Chinese workspace
path to `D:\????`. The tests passed from `Q:\`, and the temporary mapping was
removed after the run.

## Preview deployment

| Item | Value |
| --- | --- |
| Firebase project | `beauessence-clinic-staging` |
| Channel | `synthetic-review` |
| URL | <https://beauessence-clinic-staging--synthetic-review-gpt86j36.web.app> |
| Deployed | 2026-07-29 17:06 Asia/Taipei |
| Expires | 2026-08-05 17:06 Asia/Taipei |
| Remote verification | 452/452 passed |

Only the expiring Hosting preview channel was deployed. Firebase reported that
it could not add/synchronise the preview channel domain to Firebase Auth. This
preview intentionally has no Firebase Auth and uses synthetic browser-local
state, so the warning did not invalidate the preview checks.

No live Hosting release, Firestore, Functions, production API, authentication,
Calendar integration or production deployment was performed.

## CI failures observed at handoff time

The failures below were independent at `47bc963`. The first three were fixed in
`fc62274`; the fourth remains an administrator/capability decision.
`Verification evidence` is only the downstream summary of the verify, rules and
E2E results.

### 1. Unit test glob is expanded by the Linux shell

At the baseline, the root script contained:

```json
"test:unit": "vitest run --exclude tests/firestore/**"
```

On GitHub's Linux runner, the unquoted glob expands to Firestore filenames.
Vitest receives those files as positive filters and reports `No test files
found`. Use a cross-platform quoted argument, for example:

```json
"test:unit": "vitest run --exclude \"tests/firestore/**\""
```

Commit `fc62274` applied the quoted argument. The subsequent verify workflow
passed.

### 2. Firestore job does not build workspace package entry points

At the baseline, the clean runner called `pnpm test:rules` before creating ignored
`packages/contracts/dist` and `packages/domain/dist`. Vitest then reports:

```text
Failed to resolve entry for package "@beauessence/domain"
```

Add this step after `pnpm install --frozen-lockfile` in the `rules` job:

```yaml
- name: Build workspace packages used by Firestore tests
  run: pnpm --filter @beauessence/contracts --filter @beauessence/domain run build
```

The proposed command was validated locally before the Emulator suite passed
6/6 files and 66/66 tests. It was deliberately absent from the handoff commit,
then added by `fc62274`; the subsequent Firestore job passed.

### 3. Clinic skip link is 43 px high on the Linux Chromium runner

The baseline E2E run passed 174 tests and failed only:

```text
/clinic @ 390px
a "跳至主要內容" -> 128x43
```

The enforced minimum is 44×44. Commit `fc62274` added the explicit minimum
without changing the off-screen-until-focused behavior; the subsequent
Playwright job passed.

### 4. CodeQL cannot upload for this private repository

CodeQL extracted and scanned the JavaScript/TypeScript files, then failed while
uploading SARIF with:

```text
Resource not accessible by integration
Code scanning is not enabled for this repository
```

The repository is private and the workflow already requests
`security-events: write`. An administrator must decide whether to enable the
required GitHub code-scanning/Advanced Security capability or approve a
different evidence policy. Do not silently weaken or mark this gate successful.

## Outcome and remaining sequence

1. Completed in `fc62274`: fix the unit-test quoting and Firestore workspace
   build step.
2. Completed in `fc62274`: fix and verify the 44 px clinic skip link.
3. Verified: all five jobs in the private repository's verify workflow passed.
4. Still open: an administrator must resolve the private-repository CodeQL
   capability/policy. Do not silently weaken or mark the gate successful.
5. Keep the PR draft while the required CodeQL evidence is unavailable.
6. Rerun `verify:preview` only if a shipped web asset changes.
7. Merge only after review; do not treat merge, the synthetic preview or a
   green public-mirror CodeQL run as production/private-repository approval.

## Local machine notes

- GitHub CLI 2.96.0 is installed and authenticated locally.
- Python 3.14.6 and pip 26.1.2 are installed.
- Firebase CLI 15.24.0 is authenticated locally.
- Credentials remain in the local keyrings/config stores and must never be
  copied into the repository or a handoff archive.
- The old incomplete dependency quarantine remains outside the repository at
  `D:\診所專案\tmp\beauessence-fresh-incomplete-node_modules-20260729-1449`.
  Review it separately before any deletion.
