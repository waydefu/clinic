# L6/L7 source-readiness handoff (2026-10-01)

## Result

`PARTIAL`. The C1 batch packet, CP-08 regression worksheet, Traditional Chinese clinic-manager manual, CP-10 owner checklist, and this source-readiness closeout are prepared. This L7 package updates eight documents; the branch also carries a shared Fastify pnpm workspace/lock security patch and narrow Gitleaks config/test changes from source workstreams. No business behavior changed in those shared patches. This handoff does not claim L7 runtime completion, deployment authority, CP-08 PASS, or owner acceptance. No cloud operation, Drive write, C1 runtime test, authorized C1/CP-08 acceptance capture, or restore was performed here; CI/local source E2E attachments are engineering artifacts, not runtime evidence.

### Current release reconciliation (2026-10-03)

`origin/main` is now `6131c7fc54f09369842f6edf73a26d42fed4c729`, including merged #213, #214, #215, #216, #218, #219, and #220. The synced source heads #214 `e089b55ee2847ae06d9e7c356125264bc8a61207`, #215 `331992eeea8366b412ebe64591358f209a2e6f17`, and #216 `1197f0c43a6a8fb1ed01960e01e9a59cac151656` each passed 12/12 exact-head CI. Main verify run `37051691984` passed 12/12. The dated rows below retain historical snapshots; they do not override this current source readback. There is no new designated Claude review evidence in this reconciliation. C1 runtime, cloud plan/apply, CP-08 captures, CP-10 signature, and owner acceptance remain pending.

## Current evidence and blockers

| Workstream | Current evidence | Remaining state |
| --- | --- | --- |
| Baseline | Main source baseline `0870a5fd16c720cafc085f29594bef7afb30a71b` includes merged PRs #198 (CP-03), #205 (CP-04), #208 (CP-05), #210 (L2a calendar title), #211 (dependency update), and #212 (isolated recovery verifier). Parent reports #210 head `63249db` and #212 head `e8115d` merged with CI passing. | These are source/CI facts, not fresh C1 runtime evidence. #212 is not the true Google restore CP-06-E. L2b, L3, L5 and L6 candidates below are not in this baseline. |
| CP-05 / CP-06 | #208 source is merged. CP-05 accepts a single patient identifier; no preview/fingerprint or hash-bound confirmation API exists. #212 verifies an isolated read-only recovery path. | CP-05 preview/fingerprint remains a contract gap, not a completed test. CP-06-E true Google restore remains `NOT_RUN`, separately authorized, and required before final current-project acceptance. |
| CP-07 / PR #213 | Current head `e517f387705d5b90fe0bef78ff4991548192314a` includes the shared Gitleaks patch; CI799 / run `36852875693` passed 12/12. CI787 / run `36805449273` passed 12/12 for older head `7397f8e…` only. | PR is READY, unmerged and undeployed; this source is absent from baseline `0870a5f`. C1 runtime, receipts and manual walkthrough remain pending. |
| L2b / PR #215 | Current head `972be99d5a0eb2965f03e6cc3a485cb655427cb5` includes the visible Overview shortcut navigation, post-navigation preservation of suggestion state, and bounded work budgets. | No designated Claude review is recorded; exact-head CI796 / run `36850157553` passed 12/12; PR #215 is READY, unmerged and undeployed. The older CI794 / run `36845682914` passed 12/12 for prior head `636…` only. C1 runtime and human walkthrough remain pending. |
| L3 / PR #216 | Current head `91da1cce6147be76c010bd1935362c091e30b3d4` includes Workbench, `預約 CSV 匯出`, reauth, lifecycle cleanup and gate fix `c1658660cdfe5a25f1fd30372e350043a20b2c2f`. | Gate fix passed 32 focused tests, including real esbuild CSS minification and `planHashedBuild` regression; final independent gate review passed. CI800 / run `36853002771` passed 12/12. Prior head `ac4409e…` passed CI798 / run `36851512049` 12/12; older `1473b238…` passed CI797 / run `36850439425` 12/12. PR is READY, unmerged/undeployed; it awaits designated Claude review and owner merge. Private integration `b759097c4ebddfcfe0386dd26d3b8ef710170213` passed full `pnpm verify` (197 files, 2,351 passed, 1 skipped/2,352 total); its 4-resource deferred report measured 65,327 gzip B / 69,632 B PASS. Final integrated initial bundle measured 95,812 B / 93.6 KiB (script 66,648 B; style 16,395 B; document 10,119 B; image 2,650 B), shared budgets total/script/style 95/67/18 KiB, +3 KiB against approved +5 KiB; checker/test fixes do not change product bundle. These are private integration results, not PR exact-head CI or runtime. COOP `same-origin` remains a known popup obstacle; no header relaxation is proposed or implemented. |
| L5 / PR #213 | Current head `e517f387705d5b90fe0bef78ff4991548192314a` includes the shared Gitleaks patch; CI799 / run `36852875693` passed 12/12. | Prior head `7397f8e…` passed CI787 / run `36805449273` 12/12; PR is READY, unmerged and undeployed. C1 runtime/receipts remain pending. PR #216 is L3, not L5. |
| L6 / PR #214 | Head `2e3edf70c050e6e4f161cfa8f37892ffa39123c7`; CI795 / run `36846590947` passed 12/12 jobs. Includes the allowlist ingress and monthly capture-gap fail-closed changes. Terraform v1.16.4 / Google provider 7.46.1 fmt and validate plus 34 mock tests passed; 83 gap-focused tests and exact CI emulator checks passed. | Ready for review, not merged or deployed. These checks do not establish cloud plan/apply or C1 runtime. Fresh cloud credentials, plan, apply and readbacks remain `NOT_RUN`. |
| Business Delivery coverage | `BUSINESS_DELIVERY_OBSERVED_SINCE` must bind to the first **complete classified capture** after valid ingress is available. A coverage gap yields partial/null fee plus a marker in existing `bd_milestones`, with no PII. | Bootstrap or allowlist-unready intervals are not complete coverage; do not backfill events or infer unknown accounts as maintenance. Fresh C1 plan/apply/readback is `NOT_RUN`. |
| C1 Terraform | Current source includes more than the C5 `export_chunk_ttl`: Business Delivery API environment wiring, a maintenance Secret Manager container, API-only IAM and the two-stage opt-in. Payload stays in an owner-controlled private file; Terraform variables/state contain only the numeric version pin. | Terraform CLI blocker is resolved. A local source verification is not a cloud plan. Fresh cloud plan, apply, credentials and readbacks remain `NOT_RUN`; Stage 1 and Stage 2 each require complete plans and separate approvals. |
| Private integration verification | Snapshot `b759097c4ebddfcfe0386dd26d3b8ef710170213` passed full `pnpm verify`: 197 files, 2,351 tests passed, 1 skipped / 2,352 total; deferred report 65,327 gzip B / 69,632 B PASS. | Private source integration is not merged-release exact-head CI or C1 runtime proof. Earlier `3f5b476c…` and `a97a86ab…` snapshots are superseded; older `6e7f2b4…` had 3 unit failures fixed afterward. PR #213 CI799 and PR #216 CI800 now passed 12/12. Browser/emulator download 403s were not retried. |
| Sibling checker findings | SHA-gate token-kind patch `10c` passed independent review and root's 6-file / 31-test check. Gitleaks remediation passed 4 focused tests, independent review and CI795. Official Gitleaks v8.30.1 pinned `detect --all --full-history` scanned 720 commits at 2026-10-01 11:02 UTC, found 0 leaks and exited 0; CI795 Gitleaks job passed. | Both source-gate findings are fixed in current source candidates. The scan is recorded for that source snapshot, not future docs commits. No unrelated Terraform reformat, blanket file ignore, or history rewrite is included. |
| CP-08 | [Worksheet](../plans/2026-10-01-cp-08-regression-evidence-worksheet.md) retains 88 matrix IDs, with all 84 applicable rows `NOT_RUN`; required manual reauthentication and human acceptance are also `NOT_RUN`. | BKG-06 keeps its existing owner-approved N/A. GATE-03/04/05 remain separate gates. The 16 planned C1/CP-08 fresh synthetic acceptance captures and runtime evidence have not been collected; any CI/local E2E screenshots or traces are engineering artifacts only. |
| CP-10 | [Checklist](../plans/2026-10-01-cp-10-current-project-acceptance-checklist.md) has blank owner signature/date and remains `BLOCKED / NOT_SIGNED`. | CP-06-E remains a final acceptance prerequisite. Engineering test/tuning duration and true-calendar-month payment acceptance remain separate. The private commercial-policy discrepancy is sanitized; owner reconciliation is pending and no local policy was changed. |
| CP-07 lifecycle | The manual and checklist require a 30-day notice, then a data-return receipt, then 30 days of controlled retention. Each POST requires fresh Google+TOTP. Missing receipt/steps or early close is rejected; an eligible close only reaches `manual_close_review`. | No same-day positive close. Human backup/audit/access receipts do not prove actual cloud deletion or access revocation. |

## Source and runtime distinctions

The L2a, L4, CP-03, CP-04, and CP-05 source already in baseline must not be conflated with current C1 behavior. CI and independent Luna verification do not count as Claude review; all candidate source must follow Luna PR → designated Claude review → owner merge. CP-03 synthetic C1 events can validate runtime-versus-maintenance classification; that does not establish formal financial usage and does not mean every synthetic event is excluded from a monthly report. CP-04/05 merged API source and CI evidence do not establish current C1 hosting, Cloud Run, TTL, export, retention, or UI readbacks.

CP-09 has an unresolved private-source discrepancy between the current document index and the repository-approved policy concerning commercial terms and trial/tuning duration. It is recorded only as a sanitized conflict. Do not copy private amounts, Drive IDs, or source text into this repository, and do not alter the approved local policy before owner resolution.

The packet distinguishes the Terraform apply UTC window, Firebase Hosting channel expiry, and booking-gate expiry. Each mutation/test checkpoint has a quantity field `<OWNER_APPROVED_LIMIT>`; blank budgets are `BLOCKED`, not implicit permission. Any CP-02 worker processing, outbox drain/retry, or Calendar write needs a separate bounded approval. The packet does not claim a paused worker completed a projection.

## Documentation and history

This docs branch is `agent/luna-l7-pr`, based on main source baseline `0870a5fd16c720cafc085f29594bef7afb30a71b`; the previous docs snapshot is commit `41580d0` on this branch. Commit `1ed6c34db838a6e1211abbbf138b39e2f7aa1ba2` is the Fastify advisory pnpm workspace/lock safety patch, not a docs snapshot. Owner assigned at most six Luna xhigh workers to bounded source preparation without mid-run monitoring; independent review follows handoff. The L7 work updates documentation; this branch also carries the shared Fastify advisory pnpm workspace/lock patch and narrow Gitleaks config/test changes from source workstreams, with no business behavior change. Source candidates remain separate main-based workstreams, one PR per package, without stacking. Preparation authorization does not authorize auto-merge, deploy, apply, or runtime data mutation. A docs commit may be included in a final release SHA, but the document commit alone is not deployment or apply authority. The L7 documentation PR number, exact head and CI are to be traced in its eventual external PR body and repository git log; this handoff does not predict a PR number or hash itself. Root's private integration check is separate from merged exact-release CI.

## Closure matrix

| Scope | Status | Evidence / remaining condition |
| --- | --- | --- |
| L1 CP-05 source | `ALREADY-CORRECT` | PR #208 merged source is in baseline. The separate preview/fingerprint contract gap remains `BLOCKED` / `NOT_PROVEN`; do not invent a preview test. |
| L2a calendar title | `ALREADY-CORRECT` | PR #210 merged in baseline; parent reports CI passed. |
| L2b manual event suggestion | `FIXED` | Current head `972be99d5a0eb2965f03e6cc3a485cb655427cb5`; CI796 / run `36850157553` passed 12/12. PR is READY; designated Claude review and owner merge remain pending. |
| L3 business Workbench | `FIXED` | Head `91da1cce…`; gate fix `c1658660…` passed 32 focused tests, including real minified CSS and `planHashedBuild` regression, and final independent review passed. CI800 passed 12/12; PR is READY, unmerged/undeployed, and still needs designated Claude review and owner merge. Runtime remains pending. |
| L4 isolated recovery verifier | `ALREADY-CORRECT` | PR #212 merged source/CI is in baseline; true Google restore CP-06-E remains separately `BLOCKED` / `NOT_RUN`. |
| L5 termination API/domain | `FIXED` | Current PR #213 head `e517f387…` includes the shared Gitleaks patch; CI799 / run `36852875693` passed 12/12. Prior head `7397f8e…` passed CI787 / run `36805449273` 12/12. PR is READY, not merged; designated Claude review, owner merge, deploy and runtime receipts remain pending. |
| L6 source | `FIXED` | PR #214 head `2e3edf70…`; CI795 / run `36846590947` passed 12/12. Includes local Terraform fmt/validate, 34 mock tests, 83 gap-focused tests, and exact CI emulator checks. Designated Claude review and owner merge remain pending; no cloud plan is implied. |
| L6 runtime | `BLOCKED` | No fresh C1 credentials, full plans, apply, hosting deployment or Cloud Run/Hosting/TTL readbacks. |
| L7 docs | `FIXED` | Eight docs are reconciled to final source facts; formatting, `check:docs`, governance, secret and diff checks passed. SHA-256 table covers seven companion docs and excludes this handoff. This commit is recorded in git history, not self-hashed. |
| L7 runtime | `BLOCKED` | All 84 applicable CP-08 rows and manual checks `NOT_RUN`; 16 planned fresh synthetic acceptance captures/runtime evidence absent; CP-10 unsigned; CP-06-E remains required. |
| Shared SHA formatter | `FIXED` | Token-kind patch `10c` passed independent review and root's 6-file / 31-test check; included in current private integration verification. |
| Shared Gitleaks remediation | `FIXED` | Four focused tests and independent review passed; CI795 Gitleaks job passed. Official v8.30.1 pinned `detect --all --full-history` scanned 720 commits at 2026-10-01 11:02 UTC, found 0 leaks and exited 0. |
| Unchanged Terraform static checks | `ALREADY-CORRECT` | `c1-foundation`, `c2-c6`, and `wp-b4` inputs match current unformatted source; avoid unrelated reformat. |
| Private integration verification | `PASS` | Snapshot `b759097c…` passed full `pnpm verify` (197 files, 2,351 passed, 1 skipped / 2,352 total; deferred report 65,327 / 69,632 B PASS). This is source integration evidence, not merged-release CI or runtime. |

Within the bounded L1–L7 source-readiness and confirmed-sibling scope, every item is categorized above. The L3 minified-CSS import-tracking gap is fixed and independently reviewed; PRs #213/#214/#215/#216 each passed their recorded exact-head CI 12/12. Final merged-release SHA/CI and runtime evidence remain explicit root/owner actions.

## Source and policy artifacts

| Artifact | SHA-256 |
| --- | --- |
| `docs/plans/2026-10-01-c1-batch-deployment-packet.md` | `60b93c2ac715650f6c614fa50393869665b1b7bbc8780235016f18cace31d736` |
| `docs/plans/2026-10-01-cp-08-regression-evidence-worksheet.md` | `9ea4f9d003a7ff2ce931c30d9747ead90979ccbf09a61fe44278af5f814eafa7` |
| `docs/runbooks/manager-operations-manual.md` | `9dc8d295ea0eaca92ee9de4685018bd62e0c7f4cb46dc606b36e848e563499ab` |
| `docs/plans/2026-10-01-cp-10-current-project-acceptance-checklist.md` | `e51aaf69cdbd5f12787630402b9ec8d3923dcdf5016304b633a0878d1f14f2ba` |
| `docs/plans/2026-09-30-luna-execution-plan.md` | `21861b21ee61a63cbabbff8c3dcbfcc17bcd90242b80a5c107815a153acd1c98` |
| `docs/plans/2026-09-22-current-project-acceptance-matrix.md` | `4919c2bf7c8a2c9e1f7cd79df7e86b9a7025b7f8f76da23bd858c04d7dccc10c` |
| `docs/README.md` | `12d463f3da9df3aeea656c24543e60f2c9974fa9e6cbabcdc00513c66c5201e5` |

This handoff is omitted from the table to avoid self-hashing. The 16 planned C1/CP-08 fresh synthetic acceptance captures and runtime evidence have not been collected; CI/local source E2E artifacts, where present, are not C1 runtime evidence.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Formatting | `PASS` | Prettier `--write` and `--check` on all 8 changed docs. |
| `check:docs` | `PASS` | Node 24.20.0 / pnpm 11.9; this branch checked 268 documentation files; links/index/lifecycle checks passed. |
| `check:governance` | `PASS` | Passed; `docs/INDEX.md` is 6,107 B, below the 6,144 B limit. Existing advisory size warnings were recorded by the command. |
| `check:secrets` | `PASS` | Tracked-secret check passed across 1,170 tracked files. |
| `git diff --check` | `PASS` | No whitespace errors. |
| Source/integration checks | `PASS` for completed snapshots | Private integration `b759097c…`: full `pnpm verify`, 197 files, 2,351 passed, 1 skipped / 2,352 total; deferred report 65,327 / 69,632 B PASS. PR #213/#214/#215/#216 passed CI799/795/796/800 12/12. PR #216 also passed 32 gate tests and final independent review. |
| Cloud plan/apply, Hosting deployment, runtime/readback | `NOT_RUN` | No credentials or cloud operations were used. |
| CP-08, fresh C1 acceptance screenshots/runtime evidence, CP-06-E true restore, CP-10 signature | `NOT_RUN` | No authorized C1/CP-08 fresh synthetic acceptance captures or runtime evidence were collected. CI and local source E2E artifact attachments, where present, are not C1 runtime evidence. CP-06-E requires separate restore authorization. |

## Owner and source actions remaining

1. Follow Luna PR → designated Claude review → owner merge for each ready source package. Do not treat CI or private integration verification as Claude review or merged-release CI.
2. Validate the reauthentication popup under current security headers; preserve the measured performance PASS and the 68 KiB deferred aggregate gate.
3. After source review and owner merge, run CI on the final exact release. Recheck the whole Terraform diff, then obtain separate C1 Stage 1/Stage 2 full-plan and apply approvals with explicit per-action budgets and fresh readbacks.
4. Resolve the sanitized CP-09 commercial-policy conflict before updating any policy mapping or signing CP-10. Keep engineering acceptance separate from the true-calendar-month payment acceptance.
5. Run all 84 applicable CP-08 rows, manual reauthentication, human walkthrough and 16 fresh synthetic captures against one exact release. Preserve the CP-05 preview/fingerprint contract gap and known COOP popup dependency in test outcomes.
6. Perform CP-06-E under its own exact authorization before final `CURRENT_PROJECT_ACCEPTANCE`. AWS/site work remains deferred.

**Current stage:** `L6/L7 SOURCE_READINESS_PARTIAL`. L1/L2a/L2b/L3/L4/L5/L6 and shared-gate source workstreams are fixed or already correct. PRs #213/#214/#215/#216 are now represented in main `6131c7fc54f09369842f6edf73a26d42fed4c729`; #214/#215/#216 new exact-head CI each passed 12/12. #217 is still a documentation candidate and needs its own synced exact-head CI. Runtime credentials/approval, C1 readbacks, the 16 planned fresh C1/CP-08 synthetic acceptance captures, owner policy resolution and signature remain pending. There is no deployment, runtime acceptance, CP-08 PASS, owner acceptance, or change to production/public-launch/real-data authority.
