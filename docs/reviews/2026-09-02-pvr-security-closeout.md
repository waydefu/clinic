# Private Vulnerability Reporting closeout — 2026-09-02

**Type:** dated operational evidence. Not Canon. Not a Safety Floor change.
**Date:** 2026-09-02 (UTC retrieval; Asia/Taipei calendar date 2026-09-02)
**Base HEAD:** `0963e703c08ea7f35d02e5709f5b8f25bf9cab79` (`origin/main`, merge of PR #44)
**This file's commit:** unknown at write time. Lookup: `git log -1 -- docs/reviews/2026-09-02-pvr-security-closeout.md`

## Closure set

Authoritative source: owner-authorised Phase 0 of the 2026-09-02 Product Excellence programme. Items:

| ID | Item | Terminal state |
| --- | --- | --- |
| PVR-01 | Read current Private Vulnerability Reporting state | `ALREADY-CORRECT` as a *read*: GitHub GET returned `enabled: false` |
| PVR-02 | Enable PVR if disabled | `BLOCKED` — insufficient GitHub Administration write |
| PVR-03 | Independent read-back after enable | `BLOCKED` (enablement did not occur; post-attempt GET still `enabled: false`) |
| PVR-04 | `SECURITY.md` current-state “use PVR” wording | `DEFERRED` until PVR is actually enabled; current conditional wording remains true |
| PVR-05 | Invented email / SLA / bounty / supported-version matrix | `ALREADY-CORRECT` — none invented |
| PVR-06 | Notification-preference readiness | `NOT_VERIFIED` (not required to close the authorised mutation) |

Sibling search (same class as “assert a remote GitHub setting from committed text”): `scripts/check-docs-links.mjs` still rejects `Private Vulnerability Reporting is enabled` in `SECURITY.md`. That guard stays. Rewriting `SECURITY.md` to instruct reporters to use PVR **before** the remote control is on would be a false current-state claim.

## PVR-01 — original state

| Claim | Evidence |
| --- | --- |
| Repository | `waydefu/clinic` |
| Visibility | GitHub REST `GET /repos/waydefu/clinic` → `visibility: public`, `private: false` |
| PVR | `GET /repos/waydefu/clinic/private-vulnerability-reporting` → `{"enabled":false}` |
| Classification | **DISABLED** |
| Security advisories list | `GET /repos/waydefu/clinic/security-advisories` → empty array (length 0) |
| Token capability | same repo payload `permissions.admin: false` (also `maintain/push/pull/triage: false` on this installation token) |

Current GitHub REST (docs.github.com, API version selected `2022-11-28` on this call) still uses:

```text
GET    /repos/{owner}/{repo}/private-vulnerability-reporting
PUT    /repos/{owner}/{repo}/private-vulnerability-reporting
DELETE /repos/{owner}/{repo}/private-vulnerability-reporting
```

No other GitHub-admin settings were read for mutation. Notification inboxes were not inspected.

## PVR-02 — authorised mutation attempt

Owner authority for this session was **only** “enable GitHub Private Vulnerability Reporting for `waydefu/clinic`”. It was not general GitHub-admin authority.

Attempted (once, then stopped):

```text
PUT /repos/waydefu/clinic/private-vulnerability-reporting
```

Result:

| Field | Value |
| --- | --- |
| HTTP | `403 Forbidden` |
| Body | `Resource not accessible by integration` |
| `X-Accepted-Github-Permissions` | `administration=write` |
| Privilege escalation | not attempted |
| Resulting PVR state | still **DISABLED** |

Classification of the closeout against the programme’s completion definition:

```text
BLOCKED — insufficient GitHub Administration write authority
```

The environment GitHub App / installation token can read the PVR flag. It cannot write it.

## PVR-03 — read-back

A **separate** GET after the failed PUT still returned `{"enabled":false}`. Mutation-response trust was not used (there was no success response).

GitHub UI “Report a vulnerability” affordance: **NOT_VERIFIED** from this token (no admin UI). Expected public surface once enabled is Security → Advisories / Report a vulnerability. Do not submit a test advisory.

## PVR-04 — SECURITY.md

`SECURITY.md` on this base still uses conditional intake language and explicitly says this file does not enable PVR by existing. That remains **true** while PVR is disabled.

The programme asked to change that wording to “Use GitHub Private Vulnerability Reporting…” **after PVR is verified enabled**. That rewrite is **not** in this pull request.

`scripts/check-docs-links.mjs` continues to block the phrase `Private Vulnerability Reporting is enabled` and any `mailto:` in `SECURITY.md`. Those guards are still correct: they prevent a committed file from asserting a live remote setting or publishing a personal contact.

## What the owner must do to finish Phase 0

1. With a principal that has **repository Administration write**, enable Private Vulnerability Reporting:
   - GitHub UI: repository **Settings → Code security → Private vulnerability reporting** (or the current equivalent Code security / Advisories control);
   - or `PUT /repos/waydefu/clinic/private-vulnerability-reporting`.
2. Independent GET of the same endpoint must return `{"enabled":true}`.
3. Then a **follow-up docs PR** may replace the conditional `SECURITY.md` fork with current-state guidance, without claiming that `SECURITY.md` itself enables the control, and without adding email, SLA, bounty, or a supported-version matrix that the repository does not publish.
4. Do not treat this dated record as standing proof that PVR stays enabled.

## Gates for this documentation-only record

| Gate | Status | Reason / numbers |
| --- | --- | --- |
| `check:docs` | to be run on the PR commit | indexes this file |
| `check:structure` | `NOT_RUN` for required-path expansion | this review is dated evidence, not a never-delete kernel path |
| `check:governance` | `NOT_RUN` unless the PR also touches governance kernels | this file does not |
| format/lint | run for touched Markdown | |
| full `verify`, Emulator, E2E, SAST, SBOM | `NOT_RUN` locally | docs-only; required CI on exact PR head |
| Verification evidence | `NOT_RUN` until exact-head CI | |

**Evidence rung at write time:** `CODE-ONLY` until local docs checks run; then at most `GATE-VERIFIED` locally. `CI-VERIFIED` only after this exact commit’s required jobs and Verification evidence pass.

## Deliberately not done

- No `SECURITY.md` wording change (PVR still disabled).
- No invented private reporting channel.
- No branch-protection, ruleset, Actions, Dependabot, secret-scanning, or visibility change.
- No product, D-series, Safety Floor, SAST, or SBOM change.
- No merge of this PR from this environment (`admin: false`).
- No fake vulnerability report.

## Next person’s first step

Enable PVR with Administration write, GET-verify `enabled: true`, then open the small `SECURITY.md` follow-up described in PVR-04.
