# L6/L7 source-readiness handoff (2026-10-01)

## Result

`PARTIAL`. The C1 batch packet, CP-08 regression worksheet, Traditional Chinese clinic-manager manual, CP-10 owner checklist, and this source-readiness closeout are prepared. This docs-only change records current source candidates and verification limits. It does not claim L7 runtime completion, deployment authority, CP-08 PASS, or owner acceptance. No cloud operation, Drive write, runtime test, screenshot capture, or restore was performed here.

## Current evidence and blockers

| Workstream | Current evidence | Remaining state |
| --- | --- | --- |
| Baseline | Main source baseline `0870a5fd16c720cafc085f29594bef7afb30a71b` includes merged PRs #198 (CP-03), #205 (CP-04), #208 (CP-05), #210 (L2a calendar title), #211 (dependency update), and #212 (isolated recovery verifier). Parent reports #210 head `63249db` and #212 head `e8115d` merged with CI passing. | These are source/CI facts, not fresh C1 runtime evidence. #212 is not the true Google restore CP-06-E. L2b, L3, L5 and L6 candidates below are not in this baseline. |
| CP-05 / CP-06 | #208 source is merged. CP-05 accepts a single patient identifier; no preview/fingerprint or hash-bound confirmation API exists. #212 verifies an isolated read-only recovery path. | CP-05 preview/fingerprint remains a contract gap, not a completed test. CP-06-E true Google restore remains `NOT_RUN`, separately authorized, and required before final current-project acceptance. |
| CP-07 / PR #213 | Head `7397f8e59553dc5022d0f29be20e56857104509d`; CI787 / run `36805449273`, 12/12 jobs passed. Ready for review; not merged or deployed. | This source is absent from baseline `0870a5f`. Final merged-release CI, C1 runtime, receipts and manual walkthrough remain pending. |
| L2b / PR #215 | Candidate prefix `0fece25…` adds opaque dynamic-import architecture checks and canonical permission handling. | CI790 unit/fixture and suggestion E2E race repairs are pending. Final exact head/green CI and merged-release proof: `PENDING_ROOT_FINAL_READBACK`. |
| L3 / UI | Candidate `48e35ffe…` adds the business Workbench source, timezone gate, actual CSV label `預約 CSV 匯出`, and reauthentication bridge. The source change has an initial component budget increase of 1; deferred asset is 64,219 gzip bytes. | Independent review, exact CI, merge, C1 runtime and blind walkthrough are pending. The combined initial integration bundle was 93.2 KiB against a 93 KiB cap; root is waiting for final L2b measurement before a minimal adjustment within the approved 5 KiB ceiling. Combined performance is not PASS. Global COOP `same-origin` remains a known popup obstacle; no header relaxation is proposed or implemented. |
| L5 / PR #216 | Candidate prefix `bb916811…` includes business CSV post-await guards and the reauth/CSRF retry map. | CI792 unit fixture, new navigation/mobile, and two auth E2E repairs are pending. Final exact head/green CI: `PENDING_ROOT_FINAL_READBACK`. |
| L6 / PR #214 | Candidate prefix `f29ead5…` includes the allowlist ingress and monthly capture-gap fail-closed changes. Earlier teardown emulator head `f6ee…` passed CI789, 12/12 jobs. Terraform v1.16.4 and Google provider 7.46.1 formatting/validation plus 34 mock tests passed; no backend state or cloud plan was used. | Current CI791 failed the Terraform SHA formatting checker and a historical Gitleaks full-ref false positive; repairs and exact final CI are pending. The ingress fix was independently scoped-tested before integration; do not report the current PR as finally verified. Final exact PR head/CI: `PENDING_ROOT_FINAL_READBACK`. |
| Business Delivery coverage | `BUSINESS_DELIVERY_OBSERVED_SINCE` must bind to the first **complete classified capture** after valid ingress is available. A coverage gap yields partial/null fee plus a marker in existing `bd_milestones`, with no PII. | Bootstrap or allowlist-unready intervals are not complete coverage; do not backfill events or infer unknown accounts as maintenance. Fresh C1 plan/apply/readback is `NOT_RUN`. |
| C1 Terraform | Current source includes more than the C5 `export_chunk_ttl`: Business Delivery API environment wiring, a maintenance Secret Manager container, API-only IAM and the two-stage opt-in. Payload stays in an owner-controlled private file; Terraform variables/state contain only the numeric version pin. | Terraform CLI blocker is resolved. A local source verification is not a cloud plan. Fresh cloud plan, apply, credentials and readbacks remain `NOT_RUN`; Stage 1 and Stage 2 each require complete plans and separate approvals. |
| Integration verification | Private integration tree `6e7f2b4…` passed all gates before unit tests, then had 3 unit failures: 2 Terraform string checker failures and 1 browser fixture. Exact recorded summary: 197 files, 194 pass/3 fail; 2,318 tests pass, 3 fail, 1 skip, 2,322 total. | Fixes remain in progress. This is compatibility evidence, not merged-release proof or final green CI. Browser/emulator downloads returned 403 and were not retried. |
| Sibling checker findings | Formatting-sensitive SHA checker affects the shared Terraform SHA gate; unchanged `c1-foundation`, `c2-c6`, and `wp-b4` static inputs match their current unformatted source. A full-ref Gitleaks historical false positive affects PR #214 and #216 as well as L3. | Narrow value-shape/checker repairs are pending. No unrelated Terraform reformat, blanket file ignore, or history rewrite is included in this docs change. |
| CP-08 | [Worksheet](../plans/2026-10-01-cp-08-regression-evidence-worksheet.md) retains 88 matrix IDs, with all 84 applicable rows `NOT_RUN`; required manual reauthentication and human acceptance are also `NOT_RUN`. | BKG-06 keeps its existing owner-approved N/A. GATE-03/04/05 remain separate gates. No screenshots were captured; all 16 entries are fresh synthetic capture placeholders. |
| CP-10 | [Checklist](../plans/2026-10-01-cp-10-current-project-acceptance-checklist.md) has blank owner signature/date and remains `BLOCKED / NOT_SIGNED`. | CP-06-E remains a final acceptance prerequisite. Engineering test/tuning duration and true-calendar-month payment acceptance remain separate. The private commercial-policy discrepancy is sanitized; owner reconciliation is pending and no local policy was changed. |
| CP-07 lifecycle | The manual and checklist require a 30-day notice, then a data-return receipt, then 30 days of controlled retention. Each POST requires fresh Google+TOTP. Missing receipt/steps or early close is rejected; an eligible close only reaches `manual_close_review`. | No same-day positive close. Human backup/audit/access receipts do not prove actual cloud deletion or access revocation. |

## Source and runtime distinctions

The L2a, L4, CP-03, CP-04, and CP-05 source already in baseline must not be conflated with current C1 behavior. CP-03 synthetic C1 events can validate runtime-versus-maintenance classification; that does not establish formal financial usage and does not mean every synthetic event is excluded from a monthly report. CP-04/05 merged API source and CI evidence do not establish current C1 hosting, Cloud Run, TTL, export, retention, or UI readbacks.

CP-09 has an unresolved private-source discrepancy between the current document index and the repository-approved policy concerning commercial terms and trial/tuning duration. It is recorded only as a sanitized conflict. Do not copy private amounts, Drive IDs, or source text into this repository, and do not alter the approved local policy before owner resolution.

The packet distinguishes the Terraform apply UTC window, Firebase Hosting channel expiry, and booking-gate expiry. Each mutation/test checkpoint has a quantity field `<OWNER_APPROVED_LIMIT>`; blank budgets are `BLOCKED`, not implicit permission. Any CP-02 worker processing, outbox drain/retry, or Calendar write needs a separate bounded approval. The packet does not claim a paused worker completed a projection.

## Documentation and history

Owner assigned at most six Luna xhigh workers to bounded source preparation without mid-run monitoring; independent review follows handoff. This docs branch is `agent/luna-l7-pr`, based on main at `1ed6c34db838a6e1211abbbf138b39e2f7aa1ba2`. The earlier 2026-10-01 docs snapshot is retained in history for verifier comparison. This update changes documentation only. Source candidates remain separate main-based workstreams, one PR per package, with no stacking; the owner may squash-merge sequentially after review. Preparation authorization does not authorize auto-merge, deploy, apply, or runtime data mutation. A docs commit may be included in a final release SHA, but the document commit alone is not deployment or apply authority. Root's private integration check is separate from merged exact-release CI.

## Source and policy artifacts

| Artifact | SHA-256 |
| --- | --- |
| `docs/plans/2026-10-01-c1-batch-deployment-packet.md` | `ebe1dc30451698455316dd01f0c2096cb15cc933e02b5a58e3f3d300c766570a` |
| `docs/plans/2026-10-01-cp-08-regression-evidence-worksheet.md` | `241875a5edc7af8dc12f0835b91eff4ad3b71727374dd65317d54ddf8c7d3ed8` |
| `docs/runbooks/manager-operations-manual.md` | `3841a76006787b481b7204eb92ef8e05f22c5e38b02fbd220e6957135c63aa16` |
| `docs/plans/2026-10-01-cp-10-current-project-acceptance-checklist.md` | `9321b439d420448b8e87efc6ed80d0bfa7d2a4a1f1cdf20fe2bcdf1f0ed2692d` |
| `docs/plans/2026-09-30-luna-execution-plan.md` | `f0fbf62c988ae7f684e9dcf5866ede07b2cfbcf3f4c92e8162306ad11e2223b2` |
| `docs/plans/2026-09-22-current-project-acceptance-matrix.md` | `1c4bc5a5c847d27da7083f0fbbe89831506e198609d122f6ab4d13a5c6924481` |
| `docs/README.md` | `bfe4e143df6fecf886db81f6079be40ef8e5636fcf5d9b00fbde2e3c76f353ba` |

This handoff is omitted from the table to avoid self-hashing. No screenshots or runtime evidence artifacts were created.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Formatting | `PASS` | Prettier `--write` and `--check` on all 8 changed docs. |
| `check:docs` | `PASS` | Node 24.20.0 / pnpm 11.9 path; 268 documentation files, links/index/lifecycle checks passed. |
| `check:governance` | `PASS` | Passed; docs/INDEX.md is 6,107 bytes (below hard limit). Existing size warnings are recorded by the command. |
| `git diff --check` | `PASS` | No whitespace errors. |
| Application tests / CI | `NOT_RUN` | No application source changed; exact candidate CI states are listed above. |
| Cloud plan/apply, Hosting deployment, runtime/readback | `NOT_RUN` | No credentials or cloud operations were used. |
| CP-08, screenshots, CP-06-E true restore, CP-10 signature | `NOT_RUN` | Requires an approved exact release, runtime access, owner evidence and separate restore authorization. |

## Owner and source actions remaining

1. Finish independent review and repair CI790/CI791/CI792 findings; capture the full exact candidate heads and final CI outcomes. Do not treat the private integration-tree result as release CI.
2. Re-measure the final integrated bundle after L2b settles, then apply only the smallest approved L3 budget correction; validate the real popup under current security headers.
3. Merge source PRs through the owner-approved sequence and run CI on the final exact release. Recheck the whole Terraform diff, then obtain separate C1 Stage 1/Stage 2 full-plan and apply approvals with explicit per-action budgets and fresh readbacks.
4. Resolve the sanitized CP-09 commercial-policy conflict before updating any policy mapping or signing CP-10. Keep engineering acceptance separate from the true-calendar-month payment acceptance.
5. Run all 84 applicable CP-08 rows, manual reauthentication, human walkthrough and 16 fresh synthetic captures against one exact release. Preserve the CP-05 preview/fingerprint contract gap and known COOP popup dependency in test outcomes.
6. Perform CP-06-E under its own exact authorization before final `CURRENT_PROJECT_ACCEPTANCE`. AWS/site work remains deferred.

**Current stage:** `L6/L7 SOURCE_READINESS_PARTIAL`. Runtime credentials/approval, final merged source SHA and CI, C1 readbacks, screenshots, owner policy resolution and signature remain pending. There is no deployment, runtime acceptance, CP-08 PASS, owner acceptance, or change to production/public-launch/real-data authority.
