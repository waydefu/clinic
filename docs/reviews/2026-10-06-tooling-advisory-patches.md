# 2026-10-06 tooling advisory patch handoff

**Outcome at handoff: TEST-VERIFIED / dependency gates PASS; final required CI pending.** This is a separate dependency repair, not a production audit implementation packet or a change to docs-only PR #241. This file records pre-commit evidence; subsequent exact-head CI and delivery are bound in the repair PR. No merge, deployment, cloud/data operation or gate waiver is authorised or performed.

## Source and bounded change

Baseline `f7ace1a8ac8626783af342b89b0ad14b1ae400de`, branch `agent/supply-chain-tooling-patches-20261006`; evidence covers the local dirty candidate. `origin/main` was fetched before work. Node 24.20.0, pnpm 11.9.0, Vitest 4.1.11, TypeScript 5.9.3 and Prettier 3.9.5 remain unchanged.

The original CI supply-chain failure is **PROVEN** on the baseline: `audit:all` exits 1 with these three advisories. Only same-major patch overrides, their regenerated lockfile entries, a regression test and this handoff/index are changed.

| Advisory | Real dependency path | Before → after |
| --- | --- | --- |
| [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | firebase-tools → Express 4/5 → proxy-addr | 2.0.7 → 2.0.8 |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | Vitest → Vite → PostCSS → source-map-js | 1.2.1 → 1.2.2 |
| [GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95) | firebase-tools → superstatic → compression | 1.8.1 → 1.8.2 |

Registry release dates are respectively 2026-09-15, 2026-09-30 and 2026-09-11, all beyond the unchanged 24-hour maturity gate. Upstream patched source was inspected; same-major compatibility is additionally exercised, not assumed from the version number.

Lockfile assertions prove every direct importer and all **276 production/optional snapshot nodes** are unchanged; only these three package versions change. Compression adds a reference to already-present `destroy@1.2.0`. Other package records, the Firebase FTP-chain snapshots, `auditConfig`, build permissions and maturity settings remain unchanged. There is no application source, contract, IAM, Terraform, workflow, threshold or exception change.

## Regression before / after

`node node_modules/vitest/vitest.mjs run scripts/tooling-advisory-compatibility.test.mjs` (pinned native Node executable): baseline **15 fail / 3 pass**; candidate **18/18 pass**.

- Resolve patched versions through the installed parent chains, not an unrelated root package.
- Reject unsafe IPv6 trust ranges for plain/mapped IPv4 candidates on both single- and multi-subnet paths; preserve valid IPv4, mapped and native IPv6 trust semantics. Documentation-only synthetic IP ranges, no network attack.
- Reject invalid/unbounded indexed-map offsets and nested accumulated offsets at construction; preserve normal mapping round trips. The blocking generator loop is never executed with enormous offsets.
- Use the installed compression middleware and real native zlib on a bounded synthetic response seam; both interrupted and pre-closed responses release their stream, while a normal gzip response completes and decompresses. No real application traffic or provider data.

## Gate record

| Gate | Result | Evidence / limit |
| --- | --- | --- |
| Target regression | PASS | 18/18; before 15 RED and 3 unchanged positive cases |
| Production audit | PASS | 0 known vulnerabilities; moderate threshold unchanged |
| Full dependency audit | PASS | 0 critical; remaining 11 moderate and the previously approved braces high exception; no new ignore/waiver |
| Audit-exception registry | PASS | Existing single registered exception unchanged; passing is not new risk acceptance |
| Frozen install / SBOM / licence policy | PASS | Lockfile reproducible; SBOM 914 components / 82 unique runtime components; existing 3 reviewed licence exceptions unchanged |
| Firebase CLI compatibility | PASS | 15.25.0 `--version` and `--help`; no login, cloud query, serve or deploy |
| Importers / production graph / unchanged FTP chain | PASS | Exact parsed lockfile equality against baseline, 276 runtime snapshot nodes |
| Structure / clinic freeze / architecture / UI / public pages / tokens / docs / governance / E2E inventory | PASS | 361 required files, 30 frozen files, unchanged safety boundaries; existing governance advisory warnings retained |
| Format / lint / screenshot-config types | PASS | Whole repository matched files checked; Markdown remains excluded by repo policy |
| TypeScript / web build / domain sync / performance | PASS | All 5 build-bearing workspaces compiled; 40 vendor files synchronized, 109 web files / 85 content-hashed; 5-entry performance budget |
| Full local unit suite | FAIL | 2524 assertions: 2522 pass, 1 fail, 1 existing skip; sole failure is unchanged FTP loopback fixture `ECONNRESET` |
| Unmodified baseline FTP reproduction | FAIL | Same fixture/path/`ECONNRESET` on a separate unmodified baseline worktree; 1/2 pass. The first candidate failure and one diagnostic rerun were retained; no assertion was relaxed |
| Full `verify` wrapper | UNAVAILABLE | Windows native-path/TTY launcher attempts did not reliably execute the target gate chain; no wrapper exit 0 is counted as proof. Gates above were executed directly with the pinned native binaries instead |
| Fresh required CI / Emulator / E2E | NOT_RUN at handoff | User subsequently authorised continuing the separately scoped repair PR. Actual results must be read back against that exact commit; fresh Linux required CI includes the existing FTP regression |
| Main / planning PR #241 unblocked | NOT_RUN | No repair commit on main; #241 remains docs-only at its original failed CI head. No merge authority |

## Handoff / rollback

Local candidate files are `pnpm-workspace.yaml`, generated `pnpm-lock.yaml`, `scripts/tooling-advisory-compatibility.test.mjs`, this review and the necessary `docs/README.md` route. There is one writer and no user change was overwritten. The rollback boundary is this separate uncommitted candidate, not the planning PR or current main.

The user authorised publication of one independent repair PR and its exact-head required CI after the local progress report. Keep the main/merge/deploy boundary: CI-green alone does not approve merge. Preserve the baseline Windows FTP failure and use Linux required CI as an additional verification venue, not a test skip or waiver. If that gate is red there, investigate it separately before release.

SOL-00's 31 original claim/source anchors and final semantic/owner/runtime acceptance remain incomplete; this dependency patch does not resolve them or authorise production construction. The authorised publication contains only safe source/tests/metadata, never the local private audit checkpoints or runtime payloads. To locate the delivered commit without self-reference, use `git log -- docs/reviews/2026-10-06-tooling-advisory-patches.md`; the exact PR head and run are recorded separately.
