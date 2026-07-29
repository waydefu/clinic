# Local hardening and CI handoff — 2026-07-29

## Status

The local hardening batch is implemented, committed, pushed and available in a
draft pull request. The expiring synthetic Hosting preview is deployed and
verified. GitHub CI is not green and its remaining repair is intentionally
handed to the next implementer.

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
| Draft pull request | <https://github.com/waydefu/clinic/pull/1> |
| Failed verify run | <https://github.com/waydefu/clinic/actions/runs/30438179636> |
| Failed CodeQL run | <https://github.com/waydefu/clinic/actions/runs/30438179512> |

The commit containing this document is the handoff-only follow-up to the
baseline implementation commit. No partial CI repair is included in the
handoff commit.

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

## CI failures handed to the next implementer

The failures below are independent. `Verification evidence` is only the
downstream summary of the verify, rules and E2E results.

### 1. Unit test glob is expanded by the Linux shell

The root script currently contains:

```json
"test:unit": "vitest run --exclude tests/firestore/**"
```

On GitHub's Linux runner, the unquoted glob expands to Firestore filenames.
Vitest receives those files as positive filters and reports `No test files
found`. Use a cross-platform quoted argument, for example:

```json
"test:unit": "vitest run --exclude \"tests/firestore/**\""
```

Then run `corepack pnpm verify` on Windows and the GitHub runner.

### 2. Firestore job does not build workspace package entry points

The clean runner calls `pnpm test:rules` before creating ignored
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
6/6 files and 66/66 tests. The workflow edit itself was deliberately removed
from this handoff commit so the next implementer owns and verifies the repair.

### 3. Clinic skip link is 43 px high on the Linux Chromium runner

The E2E run passed 174 tests and failed only:

```text
/clinic @ 390px
a "跳至主要內容" -> 128x43
```

The enforced minimum is 44×44. Inspect `.clinic-skip-link` in
`apps/web/public/clinic-site.css`; add an explicit 44 px minimum target without
changing its off-screen-until-focused behavior, then rerun the focused test and
the full E2E suite.

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

## Recommended next sequence

1. Fix the unit-test quoting and the Firestore workspace build step.
2. Fix and focus-test the 44 px clinic skip link.
3. Resolve the private-repository CodeQL capability/policy with an
   administrator.
4. Push once, wait for all checks and keep the PR draft until green.
5. Rerun `verify:preview` only if a shipped web asset changes.
6. Merge only after review; do not treat merge or preview Hosting as production
   approval.

## Local machine notes

- GitHub CLI 2.96.0 is installed and authenticated locally.
- Python 3.14.6 and pip 26.1.2 are installed.
- Firebase CLI 15.24.0 is authenticated locally.
- Credentials remain in the local keyrings/config stores and must never be
  copied into the repository or a handoff archive.
- The old incomplete dependency quarantine remains outside the repository at
  `D:\診所專案\tmp\beauessence-fresh-incomplete-node_modules-20260729-1449`.
  Review it separately before any deletion.
