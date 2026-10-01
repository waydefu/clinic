# L6/L7 source-readiness handoff (2026-10-01)

## Result

`PARTIAL`. The C1 batch packet, CP-08 regression worksheet, Traditional Chinese clinic-manager manual, CP-10 owner checklist, and this source-readiness closeout are prepared. This docs-only change records current source candidates and verification limits. It does not claim L7 runtime completion, deployment authority, CP-08 PASS, or owner acceptance. No cloud operation, Drive write, runtime test, screenshot capture, or restore was performed here.

## Current evidence and blockers

| Workstream | Current evidence | Remaining state |
| --- | --- | --- |
| Baseline | Main source baseline `0870a5fd16c720cafc085f29594bef7afb30a71b` includes merged PRs #198 (CP-03), #205 (CP-04), #208 (CP-05), #210 (L2a calendar title), #211 (dependency update), and #212 (isolated recovery verifier). Parent reports #210 head `63249db` and #212 head `e8115d` merged with CI passing. | These are source/CI facts, not fresh C1 runtime evidence. #212 is not the true Google restore CP-06-E. L2b, L3, L5 and L6 candidates below are not in this baseline. |
| CP-05 / CP-06 | #208 source is merged. CP-05 accepts a single patient identifier; no preview/fingerprint or hash-bound confirmation API exists. #212 verifies an isolated read-only recovery path. | CP-05 preview/fingerprint remains a contract gap, not a completed test. CP-06-E true Google restore remains `NOT_RUN`, separately authorized, and required before final current-project acceptance. |
| CP-07 / PR #213 | Head `7397f8e59553dc5022d0f29be20e56857104509d`; CI787 / run `36805449273`, 12/12 jobs passed. Ready for review; not merged or deployed. | This source is absent from baseline `0870a5f`. Final merged-release CI, C1 runtime, receipts and manual walkthrough remain pending. |
| L2b / PR #215 | Head `efcec63c6d2c4497ddf09f3da11c1ed6c79889de` includes window fixture and `waitAuthenticatedShell`; independent review passed. | Runtime CI pending. Shared SHA formatter patch has a raw-comment decoy bypass; second lexical repair is in progress. Final exact CI: `PENDING_ROOT_FINAL_READBACK`. |
| L3 / PR #216 | Candidate prefix `bb916811…` adds business Workbench UI, actual CSV label `預約 CSV 匯出`, and reauthentication bridge. Initial source tests: 75; follow-up `0299` post-await/retry fixes cover 64 fixtures. | Final exact CI/review, merge, C1 runtime and blind walkthrough remain pending. Measured performance is `PASS`: initial integrated bundle 95,655 B (93.4 KiB; script 66,490 B, style 16,395 B, document 10,120 B, image 2,650 B); shared budget total/script/style 95/66/18 KiB; total delta +3 KiB within approved +5 KiB. Four deferred chunks total 65,019 gzip B under the new 68 KiB aggregate gate. Global COOP `same-origin` remains a known popup obstacle; no header relaxation is proposed or implemented. |
| L5 / PR #213 | Head `7397f8e59553dc5022d0f29be20e56857104509d`; CI787/run `36805449273`, 12/12 jobs passed, ready for review. | Not merged or deployed; C1 runtime/receipts and final release CI pending. PR #216 is L3, not L5. |
| L6 / PR #214 | Candidate prefix `f29ead5…` includes the allowlist ingress and monthly capture-gap fail-closed changes. Earlier teardown emulator head `f6ee…` passed CI789, 12/12 jobs. Terraform v1.16.4 and Google provider 7.46.1 formatting/validation plus 34 mock tests passed; no backend state or cloud plan was used. | Current CI791 failed the Terraform SHA formatting checker and a historical Gitleaks full-ref false positive; repairs and exact final CI are pending. The ingress fix was independently scoped-tested before integration; do not report the current PR as finally verified. Final exact PR head/CI: `PENDING_ROOT_FINAL_READBACK`. |
| Business Delivery coverage | `BUSINESS_DELIVERY_OBSERVED_SINCE` must bind to the first **complete classified capture** after valid ingress is available. A coverage gap yields partial/null fee plus a marker in existing `bd_milestones`, with no PII. | Bootstrap or allowlist-unready intervals are not complete coverage; do not backfill events or infer unknown accounts as maintenance. Fresh C1 plan/apply/readback is `NOT_RUN`. |
| C1 Terraform | Current source includes more than the C5 `export_chunk_ttl`: Business Delivery API environment wiring, a maintenance Secret Manager container, API-only IAM and the two-stage opt-in. Payload stays in an owner-controlled private file; Terraform variables/state contain only the numeric version pin. | Terraform CLI blocker is resolved. A local source verification is not a cloud plan. Fresh cloud plan, apply, credentials and readbacks remain `NOT_RUN`; Stage 1 and Stage 2 each require complete plans and separate approvals. |
| Earlier integration snapshot | Private tree `6e7f2b4…` passed gates before unit tests, then had 3 unit failures: 2 Terraform string checker failures and 1 browser fixture. Recorded summary: 197 files, 194 pass/3 fail; 2,318 tests pass, 3 fail, 1 skip, 2,322 total. | This earlier snapshot is not current release proof. Later candidate fixes still need exact verification. Browser/emulator downloads returned 403 and were not retried. |
| Sibling checker findings | Shared SHA formatter patch review found a raw-comment decoy bypass; second lexical repair is in progress. Unchanged `c1-foundation`, `c2-c6`, and `wp-b4` static inputs match current unformatted source. Gitleaks remediation commits `52cd…` / `62466b…` pass isolated tests 4/4 and have no L3 dependency. | SHA gate remains blocked pending repair. Gitleaks remediation remains blocked pending independent review/final CI despite isolated tests passing. No unrelated Terraform reformat, blanket file ignore, or history rewrite is included. |
| CP-08 | [Worksheet](../plans/2026-10-01-cp-08-regression-evidence-worksheet.md) retains 88 matrix IDs, with all 84 applicable rows `NOT_RUN`; required manual reauthentication and human acceptance are also `NOT_RUN`. | BKG-06 keeps its existing owner-approved N/A. GATE-03/04/05 remain separate gates. No screenshots were captured; all 16 entries are fresh synthetic capture placeholders. |
| CP-10 | [Checklist](../plans/2026-10-01-cp-10-current-project-acceptance-checklist.md) has blank owner signature/date and remains `BLOCKED / NOT_SIGNED`. | CP-06-E remains a final acceptance prerequisite. Engineering test/tuning duration and true-calendar-month payment acceptance remain separate. The private commercial-policy discrepancy is sanitized; owner reconciliation is pending and no local policy was changed. |
| CP-07 lifecycle | The manual and checklist require a 30-day notice, then a data-return receipt, then 30 days of controlled retention. Each POST requires fresh Google+TOTP. Missing receipt/steps or early close is rejected; an eligible close only reaches `manual_close_review`. | No same-day positive close. Human backup/audit/access receipts do not prove actual cloud deletion or access revocation. |

## Source and runtime distinctions

The L2a, L4, CP-03, CP-04, and CP-05 source already in baseline must not be conflated with current C1 behavior. CP-03 synthetic C1 events can validate runtime-versus-maintenance classification; that does not establish formal financial usage and does not mean every synthetic event is excluded from a monthly report. CP-04/05 merged API source and CI evidence do not establish current C1 hosting, Cloud Run, TTL, export, retention, or UI readbacks.

CP-09 has an unresolved private-source discrepancy between the current document index and the repository-approved policy concerning commercial terms and trial/tuning duration. It is recorded only as a sanitized conflict. Do not copy private amounts, Drive IDs, or source text into this repository, and do not alter the approved local policy before owner resolution.

The packet distinguishes the Terraform apply UTC window, Firebase Hosting channel expiry, and booking-gate expiry. Each mutation/test checkpoint has a quantity field `<OWNER_APPROVED_LIMIT>`; blank budgets are `BLOCKED`, not implicit permission. Any CP-02 worker processing, outbox drain/retry, or Calendar write needs a separate bounded approval. The packet does not claim a paused worker completed a projection.

## Documentation and history

This docs branch is `agent/luna-l7-pr`, based on main source baseline `0870a5fd16c720cafc085f29594bef7afb30a71b`; earlier docs snapshot `1ed6c34db838a6e1211abbbf138b39e2f7aa1ba2` is retained for verifier comparison. Owner assigned at most six Luna xhigh workers to bounded source preparation without mid-run monitoring; independent review follows handoff. This update changes documentation only. Source candidates remain separate main-based workstreams, one PR per package, without stacking. Preparation authorization does not authorize auto-merge, deploy, apply, or runtime data mutation. A docs commit may be included in a final release SHA, but the document commit alone is not deployment or apply authority. Root's private integration check is separate from merged exact-release CI.

## Closure matrix

| Scope | Status | Evidence / remaining condition |
| --- | --- | --- |
| L1 CP-05 source | `ALREADY-CORRECT` | PR #208 merged source is in baseline. The separate preview/fingerprint contract gap remains `BLOCKED` / `NOT_PROVEN`; do not invent a preview test. |
| L2a calendar title | `ALREADY-CORRECT` | PR #210 merged in baseline; parent reports CI passed. |
| L2b manual event suggestion | `BLOCKED` | PR #215 independent review passed; runtime CI pending. Shared SHA raw-comment decoy remains under lexical repair. |
| L3 business Workbench | `BLOCKED` | PR #216 has 75 initial tests; follow-up `0299` post-await/retry fixes cover 64 fixtures. Final exact CI/review, merge and C1 runtime pending. Measured performance gate `PASS`. |
| L4 isolated recovery verifier | `ALREADY-CORRECT` | PR #212 merged source/CI is in baseline; true Google restore CP-06-E remains separately `BLOCKED` / `NOT_RUN`. |
| L5 termination API/domain | `BLOCKED` | PR #213 CI787 12/12 passed and is ready for review; merge, deploy and runtime receipts pending. |
| L6 source | `BLOCKED` | PR #214 final CI791 findings and exact-head CI remain pending. Terraform local fmt/validate/34 mock tests are not cloud-plan evidence. |
| L6 runtime | `BLOCKED` | No fresh C1 credentials, full plans, apply, hosting deployment or Cloud Run/Hosting/TTL readbacks. |
| L7 docs | `FIXED` | Eight docs updated; formatting, `check:docs`, governance and diff checks pass. Handoff hashes exclude this handoff. |
| L7 runtime | `BLOCKED` | All 84 applicable CP-08 rows and manual checks `NOT_RUN`; screenshots absent; CP-10 unsigned; CP-06-E remains required. |
| Shared SHA formatter | `BLOCKED` | Raw-comment decoy bypass found; second lexical repair in progress; no final gate result claimed. |
| Shared Gitleaks remediation | `BLOCKED` | Commits `52cd…` / `62466b…` pass isolated tests 4/4 with no L3 dependency; independent review/final CI pending. |
| Unchanged Terraform static checks | `ALREADY-CORRECT` | `c1-foundation`, `c2-c6`, and `wp-b4` inputs match current unformatted source; avoid unrelated reformat. |
| Prior integration snapshot | `BLOCKED` | Earlier `6e7f2b4…` snapshot recorded 3 unit failures; later fixes need final exact verification. |

Within the bounded L1–L7 source-readiness and confirmed-sibling scope, every item is categorized above; no additional unclassified blocker was identified in the reviewed artifacts. Full candidate SHAs/CI and runtime evidence remain explicit root/owner actions, not inferred completion.

## Source and policy artifacts

| Artifact | SHA-256 |
| --- | --- |
| `docs/plans/2026-10-01-c1-batch-deployment-packet.md` | `41752fac54af0f6f9ced85e30678fd92a89fd995b10edffd830ba2ee87199521` |
| `docs/plans/2026-10-01-cp-08-regression-evidence-worksheet.md` | `b2c6fae24b06735cce1184368dd31fa77fdc286340eac32e0c2ba1e48653804e` |
| `docs/runbooks/manager-operations-manual.md` | `1a315cb0dbf0e69b19aeef0081793baf35b416c12fa5a8f8d4d4664e34d1fcaa` |
| `docs/plans/2026-10-01-cp-10-current-project-acceptance-checklist.md` | `91f436ee702e08af158675f3a6fa528b5e52f539ca65ce267c341284ba241020` |
| `docs/plans/2026-09-30-luna-execution-plan.md` | `3086255fec4170b0932a4a0c43b057599d19cf302c2fc587cca0663d29e8e098` |
| `docs/plans/2026-09-22-current-project-acceptance-matrix.md` | `288bb0239ebd931216967c1a51fc512d1c2b8c46708dfeb4cdc764243f278268` |
| `docs/README.md` | `6734f55ad4f33d253ba6a179a5489720972a046329c2bc538f70f5100d5dc9cb` |

This handoff is omitted from the table to avoid self-hashing. No screenshots or runtime evidence artifacts were created.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Formatting | `PASS` | Prettier `--write` and `--check` on all 8 changed docs. |
| `check:docs` | `PASS` | Node 24.20.0 / pnpm 11.9 path; this branch checked 268 documentation files and links/index/lifecycle passed (integration tree reported 269). |
| `check:governance` | `PASS` | Passed; docs/INDEX.md is 6,107 B here (integration tree 6,124 B); both remain below the 6,144 B limit. Existing size warnings are recorded by the command. |
| `git diff --check` | `PASS` | No whitespace errors. |
| Application tests / CI | `NOT_RUN` | No application source changed; exact candidate CI states are listed above. |
| Cloud plan/apply, Hosting deployment, runtime/readback | `NOT_RUN` | No credentials or cloud operations were used. |
| CP-08, screenshots, CP-06-E true restore, CP-10 signature | `NOT_RUN` | Requires an approved exact release, runtime access, owner evidence and separate restore authorization. |

## Owner and source actions remaining

1. Finish independent review and exact runtime CI for PRs #214–#216; capture full final candidate heads and CI outcomes. Do not treat isolated source checks as merged-release CI.
2. Validate the reauthentication popup under current security headers; preserve the measured performance PASS and the 68 KiB deferred aggregate gate.
3. Merge source PRs through the owner-approved sequence and run CI on the final exact release. Recheck the whole Terraform diff, then obtain separate C1 Stage 1/Stage 2 full-plan and apply approvals with explicit per-action budgets and fresh readbacks.
4. Resolve the sanitized CP-09 commercial-policy conflict before updating any policy mapping or signing CP-10. Keep engineering acceptance separate from the true-calendar-month payment acceptance.
5. Run all 84 applicable CP-08 rows, manual reauthentication, human walkthrough and 16 fresh synthetic captures against one exact release. Preserve the CP-05 preview/fingerprint contract gap and known COOP popup dependency in test outcomes.
6. Perform CP-06-E under its own exact authorization before final `CURRENT_PROJECT_ACCEPTANCE`. AWS/site work remains deferred.

**Current stage:** `L6/L7 SOURCE_READINESS_PARTIAL`. Runtime credentials/approval, final merged source SHA and CI, C1 readbacks, screenshots, owner policy resolution and signature remain pending. There is no deployment, runtime acceptance, CP-08 PASS, owner acceptance, or change to production/public-launch/real-data authority.
