# L6/L7 source-readiness handoff (2026-10-01)

## Result

`PARTIAL`. The C1 batch deployment packet, CP-08 worksheet, Traditional Chinese clinic-manager manual, and CP-10 owner checklist are prepared as source-readiness documents. This follow-up corrected source/CI descriptions and protocol details; it does not claim L7 runtime completion, deployment authority, or owner acceptance. No cloud operation, Drive write, runtime test, screenshot capture, or restore was performed in this docs-only worktree.

## Current evidence and blockers

| Item | State | Evidence / blocker |
| --- | --- | --- |
| L6 batch packet | `BLOCKED` | [Packet](../plans/2026-10-01-c1-batch-deployment-packet.md) records project `beauessence-clinic-stg-c1a01`, region `asia-east1`, channel `internal-preproduction`, commands, two-stage Terraform sequence, expiry boundaries, owner-filled per-action budgets, checkpoints, and rollback. Exact release SHA and apply authority remain blank. |
| CP-07 source | `SOURCE_CI_PROVEN / NOT_MERGED` | PR #213 head `7397f8e59553dc5022d0f29be20e56857104509d`; CI787/run `36805449273`, 12/12 jobs succeeded. The PR is reviewable, not merged or deployed. Current baseline `0870a5fd16c720cafc085f29594bef7afb30a71b` still lacks this behavior; L3 termination UI exists only in the separate unmerged candidate below, with no runtime evidence. |
| L3 business UI | `SOURCE_CANDIDATE / REVIEW_PENDING` | Candidate commit `b8ef86159fa062deed99ebccb1bdc1a48418f156` adds the Workbench business tab, monthly usage/milestones, CSV export, retention and termination UI plus a reauth bridge. 75 scoped tests passed; independent review is in progress. No exact CI, merge, deploy, C1 runtime or blind-walk proof. |
| C1 Business Delivery Terraform | `BLOCKED` | Source chain `8ebbe840...` → `04b897d5...` → `f14181ef4d09ebda03edb12ee492f8e8da6f415a`. Commit `04b897d5...` has 23 scoped tests/builds passing and adds `business_delivery_maintenance_prerequisites_enabled`. Follow-up `f14181e` has 21 scoped unit tests, API build, and usage/emulator-type checks passing; independent review and exact CI are pending. It addresses the reviewed allowlist defect so missing/invalid allowlist does not generate usage/first-use events while valid allowlisted ingress stays atomic when reporting is disabled. Not merged or deployable; do not infer unknown identities as maintenance or backfill false usage evidence. |
| CP-08 worksheet | `NOT_RUN` | [Worksheet](../plans/2026-10-01-cp-08-regression-evidence-worksheet.md) keeps all 84 applicable matrix rows, manual reauthentication scenarios, and the human acceptance test `NOT_RUN`. BKG-06 retains its owner-approved N/A; GATE-03/04/05 remain separate gates. |
| Clinic manager manual | `SOURCE_GUIDED / RUNTIME_NOT_RUN` | [Manual](../runbooks/manager-operations-manual.md) uses operator-facing language and the actual L3 candidate labels/forms; the candidate is not merged or runtime-verified. CP-05 has no preview/fingerprint endpoint. CP-07 lifecycle is 30-day notice, return receipt, then 30-day controlled retention; close only enters `manual_close_review`. All CP-07 writes require fresh Google+TOTP. Screenshots are exact capture placeholders only. |
| CP-10 owner checklist | `BLOCKED / NOT_SIGNED` | [Checklist](../plans/2026-10-01-cp-10-current-project-acceptance-checklist.md) leaves signature/date empty, preserves CP-06-E true restore as a final acceptance prerequisite, and separates the local 20-day test + up-to-10-day tuning record from true-calendar-month payment acceptance. |
| Commercial/policy reconciliation | `BLOCKED` | Fresh current Drive index and repository-approved register differ on total/installment values and trial/tuning duration. Only a sanitized description is recorded; no private Drive IDs, figures, or source text were copied. Owner resolution is required; local approved policy was not changed. |
| C1 runtime, Hosting, and usage/export readbacks | `NOT_RUN` | No credentials/readback or C1 deployment was accessed in this worktree. |
| CP-06-E real Google restore | `NOT_RUN` | Owner batch places it in post-test-delivery tuning, with its own exact authorization; it remains required before final `CURRENT_PROJECT_ACCEPTANCE`. |

## Baseline and source notes

Docs worktree: branch `agent/luna-l6-l7-fix`, starting base `3b6aa08e78a2a560f1801599a3e7cf38b86c3ada`. Application source was not changed. The project source baseline remains `0870a5fd16c720cafc085f29594bef7afb30a71b` and includes PR #198 (CP-03), #205 (CP-04), #208 (CP-05), #210 (Calendar title), #211 (dependency update), and #212 (isolated recovery verifier). Parent-provided context records #210 head `63249db` and #212 head `e8115d` as CI-passing and merged; this work makes no new CI claim for the other source PRs. #212 is not the real Google restore exercise.

The earlier C1 infra commit `8ebbe840ad875e27d2c453036e0956f172de8b72` had a first-enable ordering gap. Candidate `04b897d5f89d46aaf059f9de9b6457f603fd5329` adds the typed Business Delivery settings and explicit two-stage prerequisite opt-in. Follow-up candidate `f14181ef4d09ebda03edb12ee492f8e8da6f415a` addresses the separately found ingress defect: missing/invalid maintenance allowlist must not emit runtime usage/first-use markers, while valid allowlisted ingress remains atomic even when report routes are disabled. That follow-up has 21 scoped unit tests, API build, and usage/emulator-type checks reported passed; independent review and exact CI are pending. These candidates are not merged. Stage 1 leaves the business gate false and secret version `not_granted`: it creates the secret container and API-only IAM, with no maintenance-secret mount and no worker permission. After an owner-controlled private payload file is added as a new Secret Manager version, Stage 2 uses only the numeric version pin in tfvars/state and mounts it only into the API. Identities/payload do not belong in Terraform values/state. `BUSINESS_DELIVERY_OBSERVED_SINCE` must start at the first valid allowlisted ingress after the source correction; invalid/missing-allowlist or bootstrap gaps cannot be represented as valid coverage.

CP-07 source and its passing CI exist on PR #213 but are not merged into the current source baseline and are not deployed. L3 UI candidate `b8ef86159fa062deed99ebccb1bdc1a48418f156` includes termination form source; its review/CI/merge and runtime remain pending. The lifecycle requires 30 days of notice and then 30 days of controlled-copy retention after the data-return receipt. Backup/audit/access entries are human disposition statements, not evidence of underlying cloud deletion or access revocation. Close can only set `manual_close_review`; it does not stop service, terminate the relationship, delete data, or revoke access.

CP-05 source accepts one patient ID per request and has no preview/fingerprint API or hash-bound confirmation contract. CP-08 and CP-10 identify that source gap and leave acceptance `NOT_RUN`; no preview endpoint is described as existing. C1 synthetic events can verify the runtime-versus-maintenance classification logic, but that test does not itself establish formal financial usage or exclude every synthetic event from the approved monthly report.

Global COOP `same-origin` is a known Google reauthentication popup obstacle and remains an L3 source/runtime decision dependency, even though the candidate contains a reauth bridge. If popup reauthentication is blocked, stop the action and keep current security headers; no security relaxation is proposed or implemented.

Owner authorized at most six Luna xhigh workers for bounded source preparation without mid-run monitoring; independent review follows handoff. For source PRs, keep one workstream per PR on a branch based on main and do not stack unmerged branches; owner may squash-merge sequentially. The docs-fix branch is separate and preserves the prior committed docs snapshot for verifier comparison. Root's planned private integration-tree compatibility check is separate from merged exact-release CI. Source-preparation authorization does not authorize merge, deployment, apply, or runtime data mutation.

## Source and policy artifacts

| Artifact | SHA-256 |
| --- | --- |
| `docs/plans/2026-10-01-c1-batch-deployment-packet.md` | `55f8e55750ad2e9e14098393f8eea58a282e946954d2c8d952ddb0353552a77d` |
| `docs/plans/2026-10-01-cp-08-regression-evidence-worksheet.md` | `3818fbc060b9d9e14d3b7d2487a49f50e9c967555d9a2c187a06cc6c7cb7a9d3` |
| `docs/runbooks/manager-operations-manual.md` | `0560e179351961fa76f78ef37a63df9f6cc99a1316e602d7240f57e2505178fd` |
| `docs/plans/2026-10-01-cp-10-current-project-acceptance-checklist.md` | `748297979e5007b45223d64aacd5476286c78d1cc44f7a8cfdb22cd1e4eaf705` |
| `docs/plans/2026-09-30-luna-execution-plan.md` | `414bc87891f90a3a24ceba2ce8765b25ae8b45ee5effa307ce7ee90bc1324f92` |
| `docs/plans/2026-09-22-current-project-acceptance-matrix.md` | `d84fc2dffb59f704bbc28d587fa79b6a1196bf1119360488c9c254fe197322fe` |
| `docs/README.md` | `ba6c13f785db0cee787fd91d8cb8f4ab595f51b0c4d508402f9c8707182ed8d3` |

This handoff is intentionally omitted from the artifact hash table so it does not self-hash. No screenshots or runtime evidence artifacts were created.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Formatting of changed docs | `PASS` | Preinstalled Prettier 3.9.5 `--write` and `--check` on all 8 changed docs; all files use Prettier style. |
| `check:docs` | `PASS` | `PATH=/tmp/clinic-luna-tools/node_modules/node-linux-x64/bin:$PATH corepack pnpm --config.verify-deps-before-run=false run check:docs`; Node 24.20.0; 268 documentation files, links/index/lifecycle checks passed. |
| `check:governance` | `PASS` | Same Node/pnpm path; governance passed. Existing warnings: AGENTS.md 8,096 bytes/151 lines, docs/INDEX.md 6,107 bytes (below the 6,144-byte hard limit), CLAUDE.md advisory size 10,667 bytes/214 lines. No index-size relaxation. |
| `git diff --check` | `PASS` | No whitespace errors. |
| Application tests / CI | `NOT_RUN` | No broad installs or tests; no application source changed. |
| Terraform plan/apply, Hosting deployment, Cloud readback | `NOT_RUN` | Not performed. |
| CP-08 runtime, reauth/manual acceptance, screenshot capture | `NOT_RUN` | Same-release C1 release and approved owner budgets are absent. |
| CP-06-E true restore / Google Drive update | `NOT_RUN` | Separate authorization required; no Drive write performed. |

## Remaining owner and source actions

1. Independently review L6 ingress candidate `f14181ef4d09ebda03edb12ee492f8e8da6f415a` and L3 UI candidate `b8ef86159fa062deed99ebccb1bdc1a48418f156`; run exact CI for their final heads, repair if review finds more issues, then merge through the owner-approved sequence. Recheck the full Terraform diff and plan before refreshing any C1 authority packet.
2. Merge CP-07 PR #213 only after its normal review/merge process, then bind a final release SHA. A docs commit may be included in that release SHA; it does not itself authorize deployment.
3. Resolve the sanitized CP-09 commercial/policy discrepancy and approve a dated crosswalk. Keep `DOC-01`, formal `USE-04`, `MILE-03`, and CP-10 A-10 blocked until resolution.
4. Owner must separately approve the exact source SHA, UTC apply window, Hosting channel expiry, booking gate expiry, rollback plan, credentials/operator, and explicit count budgets for each mutation/test class in the packet. No quantity placeholder is an authorization.
5. After L3 review/CI/merge, resolve the COOP popup dependency through source/header review and actual popup validation; then deploy only under separate C1 authority. Perform CP-08, human walkthrough and fresh synthetic screenshots against one release. CP-07 close must stop at `manual_close_review`.
6. Run CP-06-E under its own exact authorization and cost/window bounds. Only after all current acceptance evidence is complete may the owner sign CP-10. Track the true-calendar-month payment acceptance separately from engineering acceptance. AWS/site work remains deferred.

**Current stage:** `L6/L7 SOURCE_READINESS_PARTIAL`. Source/docs readiness is reviewable; merged final source SHA, runtime credentials/approval, C1 readbacks, screenshots, owner policy resolution and signature remain unverified or blocked. There is no deployment, runtime acceptance, CP-08 PASS, owner acceptance, or change to production/public-launch/real-data authority.
