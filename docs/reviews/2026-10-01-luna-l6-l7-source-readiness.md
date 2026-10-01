# L6/L7 source-readiness handoff (2026-10-01)

## One-line result

Prepared the C1 batch deployment packet, CP-08 regression worksheet, Traditional Chinese manager manual, and CP-10 owner checklist, then reconciled the current plan and evidence matrix. This handoff is `PARTIAL`: documents are ready for review while final infra source/CI, current C1 runtime, and owner acceptance remain pending. No C1 deployment, runtime test, Drive edit, true restore, or owner acceptance occurred.

## Stage and bounded closure set

Authoritative scope: L6/L7 in [the 2026-09-30 Luna execution plan](../plans/2026-09-30-luna-execution-plan.md), R-DEPLOY CP-03/04/05/07 and CP-08/09/10 in [the execution packets](../plans/2026-09-22-current-project-execution-packets.md), the 88-ID [current-project acceptance matrix](../plans/2026-09-22-current-project-acceptance-matrix.md), `OWNER-BATCH-2026-09-29B`, and `BD-POLICY-2026-09-29`.

| Item | Terminal state | Evidence / blocker |
| --- | --- | --- |
| L6 C1 batch deployment packet | `BLOCKED` | [Packet](../plans/2026-10-01-c1-batch-deployment-packet.md) has C1 project/channel, commands, variables, two-stage fail-closed Terraform prerequisites/enable, expiry, checkpoints, and rollback. Initial infra commit `8ebbe840ad875e27d2c453036e0956f172de8b72` has the known first-enable gap and no CI; follow-up source SHA/PR/CI pending. CP-07 merge also remains a prerequisite. Exact source SHA and new owner authority are blank by design. |
| CP-08 regression worksheet | `DEFERRED` | [Worksheet](../plans/2026-10-01-cp-08-regression-evidence-worksheet.md) lists all 88 matrix IDs: 84 applicable rows `NOT_RUN`, BKG-06 owner-approved N/A, and GATE-03/04/05 separate gates. Reauth and human acceptance checks are also `NOT_RUN`. Requires same-release C1 runtime and fresh exact-SHA authority. |
| CP-09 manager operations manual | `DEFERRED` | [Manual](../runbooks/manager-operations-manual.md) is source-guided and Traditional Chinese. Workbench features for CP-03/04/05 and all CP-07 termination UI remain pending; blind walk and fresh synthetic screenshots are not done. |
| CP-10 owner acceptance checklist | `BLOCKED` | [Checklist](../plans/2026-10-01-cp-10-current-project-acceptance-checklist.md) preserves blank signature/date fields and CP-06-E as final-acceptance prerequisite. Owner reconciliation is required for the sanitized Drive v2 versus repo-policy commercial/period discrepancy. |
| Current evidence matrix reconciliation | `FIXED` | Source merge status and pending runtime/UI limits are separated. `DOC-01` is `BLOCKED`; `DOC-02` is `SOURCE_PROVEN`; CP-03/04/05 source rows are not promoted to runtime or human acceptance. |
| Execution plan/index/this handoff | `FIXED` | Dated 2026-10-01 addendum preserves the 2026-09-30 history while correcting stale #205 waiting-for-merge, TTL-only, and runtime/source claims. All new documents are indexed. |
| CP-09 commercial/policy crosswalk | `BLOCKED` | Fresh remote index and local approved policy differ on total/installment amounts and trial/tuning duration. No private figures, Drive IDs, or source text are copied here; the policy is not changed. Owner must resolve and approve a dated crosswalk. |
| CP-06-E true restore | `DEFERRED` | Owner batch moves the exercise to post-test-delivery tuning and requires separate exact authorization; it remains necessary before final current-project acceptance. No restore occurred. |

## Revisions and source baseline

Branch: `agent/luna-l6-l7`. Starting/current source baseline: `0870a5fd16c720cafc085f29594bef7afb30a71b`. No application-source commit or PR was created here. No merge commit was created by this worktree.

Existing source merges included in that baseline: PR #198 (CP-03), #205 (CP-04), #208 (CP-05), #210 (calendar title), #211 (dependency update), and #212 (isolated recovery verifier). Context supplied for this handoff records #210 head `63249db` and #212 head `e8115d` as CI-passing and merged. No CI result is claimed for #198, #205, #208, or #211 in this handoff. Individual merge hashes were not independently queried here. #212 is a read-only recovery clone verifier; it is not CP-06-E and does not prove an actual restore.

The separate `agent/luna-l6-infra` candidate commit `8ebbe840ad875e27d2c453036e0956f172de8b72` adds typed `business_delivery_*` inputs, the `c1-business-delivery-maintenance-emails` Secret Manager reference/container, and API-only IAM/env mount. It has no CI and parent review found a first-enable sequencing gap. A follow-up is in progress. The packet now records two full Terraform plans: first explicit prerequisites opt-in with gate false, version `not_granted`, and no mount; then, after owner-private payload version creation, a separately reviewed numeric pin and gate-on plan. Update exact bootstrap opt-in variable names and final diff after the follow-up merges. Do not rely on this candidate commit or place maintenance identities/credential values in the repository.

Separate concurrent context: PR #213 head `7397f8e59553dc5022d0f29be20e56857104509d` passed CI run `36805449273` (`CI787`, 12/12 jobs successful; [run](https://github.com/waydefu/clinic/actions/runs/36805449273)). It remains draft/unmerged/undeployed and is not this docs branch's L6/L7 or C1 runtime evidence.

## Verification gates

| Gate | Result | Evidence / reason |
| --- | --- | --- |
| Source review of governing docs and source contracts | `PASS` | Reviewed AGENTS/CLAUDE and docs rules; handoff-record/closeout instructions; L6/L7, R-DEPLOY, CP-08/09/10, live Decision Register and policy; C1 Terraform/Hosting, CP-03/04/05 contracts, retention, backup and architecture constraints. Read-only review only. |
| `node scripts/check-docs-links.mjs` | `PASS` | 268 documentation files; links, index, and lifecycle checks passed on branch `agent/luna-l6-l7`, baseline `0870a5f`. |
| `check:docs` | `PASS` | `PATH=/tmp/clinic-luna-tools/node_modules/node-linux-x64/bin:$PATH corepack pnpm --config.verify-deps-before-run=false run check:docs`; Node `v24.20.0`; 268 documentation files, links/index/lifecycle checks passed. |
| `check:governance` | `PASS` | Same Node path; governance script passed. It warned AGENTS.md 8,096 bytes/151 lines and INDEX 6,107 bytes. INDEX remains below the 6,144-byte task limit; neither file was widened by this work. |
| `check:format` | `UNAVAILABLE` | Same Node path reached `prettier --check .` but exited `prettier: not found`; repo `node_modules` and local Prettier are absent. No installation was attempted. |
| Source/unit/emulator/E2E/CI test suites | `NOT_RUN` | Docs-only scope; no tests or CI were run or inferred. |
| C1 Terraform plan/apply / Hosting deployment | `NOT_RUN` | Outside this docs-only scope; no cloud credentials/readback or new exact-SHA owner authorization. |
| CP-08 C1 regression and manual human acceptance | `NOT_RUN` | C1 release not deployed; UI/runtime, fresh reauth, screenshots, and owner walkthrough pending. |
| CP-06-E real Google restore | `NOT_RUN` | Separate exact-SHA/resource/window approval and cost cap required. |
| CP-09 Drive synchronization | `NOT_RUN` | No Drive write. Current owner decision is blocked by policy discrepancy. |

## Artifacts

| Artifact | SHA-256 |
| --- | --- |
| `docs/plans/2026-10-01-c1-batch-deployment-packet.md` | `a748ee88dd22ec9bf035f2c0061a08679b74e89f2874f97f936e45dbf302c212` |
| `docs/plans/2026-10-01-cp-08-regression-evidence-worksheet.md` | `ddc81fec901eeb1240825f94a7cd108c282484c5cf491e1a345517aa96b83105` |
| `docs/runbooks/manager-operations-manual.md` | `133134c741ac37505932f5e23c58050cf81329d6d4f716d9f20b84b60cfc9ae1` |
| `docs/plans/2026-10-01-cp-10-current-project-acceptance-checklist.md` | `4a299112c666f55ac88f37c450f1cd6ea6612d4383127a86da008379bf905057` |
| `docs/reviews/2026-10-01-luna-l6-l7-source-readiness.md` | Not cited; a document cannot cite its own commit/hash. Use `git log -- docs/reviews/2026-10-01-luna-l6-l7-source-readiness.md` after commit. |

No fresh screenshots or runtime evidence artifacts were created. Historical artifacts are not reused as evidence for the new source release. The CP-08 worksheet contains 88 IDs but does not claim 88 passing runs.

## Findings, risks, and uncovered scope

- **Commercial authority conflict:** the fresh current Drive v2 index differs from the local owner-approved register/policy on total/installment amounts and the trial/tuning periods. The discrepancy is intentionally summarized without copying private figures, document IDs, or source text. Keep local approved policy unchanged until the owner resolves it. The true-calendar-month formal-operation condition remains a separate later payment acceptance criterion; engineering `CURRENT_PROJECT_ACCEPTANCE` does not include that month.
- **Pending source:** CP-07 termination case/controller/UI source is not in the current baseline. CP-03/04/05 API source is merged, but fresh C1 runtime/config and manager UI are not verified. The workbench's present UI does not support the described business-delivery actions.
- **Infra pending:** CP-03/04/05 API expects Business Delivery env settings; baseline C1 Terraform lacked these inputs. A separate source worker is adding fail-closed wiring. Read final Terraform diff and plan before calling the packet current; the diff includes env wiring in addition to the separately confirmed C5 `export_chunk_ttl` source.
- **Known reauth dependency:** current global COOP `same-origin` is a popup obstacle for Google reauth. Worksheet/manual record this as an L3 source/runtime decision dependency. Do not relax security headers or route around the popup.
- **Recovery and scope:** CP-06-E true restore has not happened. AWS and clinic-site work remain after current-project acceptance and are not implied complete or made acceptance blockers.
- **Screenshots and signatures:** all manager-manual captures are placeholders pending fresh synthetic C1 capture. CP-10 owner decision, signature/date, and credential custody receipt are blank.

Sibling search covered current docs for the stale “new form not implemented”, missing CP-03/04/05 source, #205 waiting-for-merge, and TTL-only Terraform claims. The current matrix source rows were corrected; the 2026-09-30 plan now carries an explicitly dated correction for the stale #205 appendix and initial TTL-only expectation. The remaining `RET-06` backup policy/runtime gap and `TERM-05` termination executor/runtime gap are real and remain open. Older 2026-07 historical production-readiness statements were left unchanged as dated history.

Coverage: repository documents, source-level contracts and C1 Terraform source were reviewed. No live Google Drive content beyond the parent-provided sanitized discrepancy, no cloud state, no deployed revision, no current Hosting channel readback, no credentials, no production, no real data, and no staff/owner interview were accessed.

## Environment traps

The default shell reports Node `v24.19.0`; targeted docs/governance gates were run with the parent-provided `/tmp/clinic-luna-tools/node_modules/node-linux-x64/bin` path and Node `v24.20.0`. Corepack pnpm is `11.9.0`; repository `node_modules` and Prettier are absent. Do not install packages just to fill a check count. Docs and governance pass; formatting remains unavailable.

## Next person: ordered first steps

1. Inspect the final `agent/luna-l6-infra` commit, exact CI result, and full C1/C5 Terraform diff. Update the packet's actual variable names, plan command, env changes, and expected plan before asking the parent for review.
2. Complete and merge CP-07 source with its own exact-CI evidence; until then L1–L5 deployment precondition is not met.
3. Have the owner resolve the sanitized CP-09 commercial/policy conflict, then approve a dated crosswalk; keep `DOC-01`, `USE-04`, `MILE-03`, and CP-10 A-10 blocked until then.
4. Parent independently reviews the packet and docs. Only after all source prerequisites merge may the owner issue new exact-SHA, UTC window, mutation-budget, rollback, and operator authority for the C1 batch. This document is not that authority.
5. After C1 source/UI deployment, execute CP-08 with fresh synthetic evidence, complete the blind manual/human AT and captures, and run CP-06-E under its separate exact authorization. Then the owner can assess CP-10 engineering acceptance. Track a true calendar month and written owner confirmation separately for later payment acceptance.

Current stage position is `L6/L7 SOURCE_READINESS_PARTIAL`; documents are prepared and linked, but final infra source/CI, CP-07, current C1 runtime, CP-06-E, CP-08, CP-09 reconciliation, fresh screenshots, and owner signature remain pending. There is no cloud/runtime acceptance or change to production, public-launch, or real-data authorization.
