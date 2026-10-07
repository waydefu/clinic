# MCP SDK OAuth advisory repair — pre-commit handoff

**Scope:** exact development-tool override `@modelcontextprotocol/sdk` 1.30.0 → 1.31.0, generated lockfile, bounded security regression and this evidence route. Source baseline `01d36c96ae6be6cea91c891c494a6601b2abd4a3`. No application/domain/worker source, Firebase CLI upgrade, new audit exception, waiver, threshold or maturity-policy change.

## Root cause and candidate

[GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) affects SDK `>=1.12.0 <1.31.0`. Actual dependency path: `firebase-tools@15.25.0 → @modelcontextprotocol/sdk@1.30.0`; parent declares `^1.24.0`. An existing exact workspace override, not just the lockfile, prevented the patched resolution. SDK 1.31.0 was published `2026-09-28T18:59:36.307Z`, beyond the unchanged 24-hour maturity rule.

SDK 1.31.0 binds client information and tokens to the actual selected authorization-server URL. A saved client issuer mismatch is rejected before token exchange; an issuer-mismatched refresh token is discarded rather than sent. Metadata echoing a trusted issuer must not substitute for the actual selected server. This is dependency advisory remediation, not proof of a production OAuth exploit in this application. The bounded Firebase CLI caller search found no direct SDK OAuth-client provider implementation; all 276 production/optional snapshots remain unchanged.

## Regression and compatibility evidence

`vitest run scripts/mcp-sdk-oauth-compatibility.test.mjs` has **8 cases**: real parent resolution/floor; three trusted URL-equivalence/refresh/issuer persistence cases; three changed server/tenant credential-denial cases; one mismatched refresh-token non-reuse case. Actual auth API and in-memory `fetchFn` responses are used. Global real fetch is forbidden. No real tokens, users, OAuth requests, credential/Calendar/provider data, registration or cloud mutations occur.

Baseline SDK 1.30.0: **8 failed**. Patched SDK 1.31.0: **8/8 PASS**. The three positive flows also require the new persisted issuer binding; their baseline failure is that binding assertion, not evidence that ordinary OAuth refresh was previously broken. The tests do not reproduce the implementation's URL comparison or hard-pin future Firebase CLI releases.

| Gate | Local result / evidence limit |
| --- | --- |
| SDK security regression | PASS 8/8, baseline RED retained |
| Firebase CLI version/help | PASS 15.25.0; no login, deploy or serve |
| Production audit | PASS, 0 known vulnerabilities |
| Full audit | PASS, 11 moderate / 1 existing approved braces high / 0 critical; SDK advisory removed, no new exception |
| Parsed production graph / lock minimality | PASS, 276 production/optional snapshots and direct importers unchanged; only SDK package/node and parent's SDK pointer changed; all unrelated packages/snapshots unchanged |
| Exception registry / maturity / build policies | PASS / unchanged |
| Targeted ESLint / format | PASS; rerun final covered-file gates before publication |
| Initial full local unit attempt | FAIL / 180-second timeout retained, no owned lingering Vitest workers found |
| Full unit, local resource-bounded 2 workers | FAIL: **2530 PASS / 1 FTP ECONNRESET FAIL / 1 existing SKIP**, 201 files; full coverage not reduced |
| Unmodified-main-equivalent FTP producer | Same failure reproduced with `vitest run scripts/basic-ftp-compatibility.test.mjs --maxWorkers 2`; baseline tree equals main, not attributed to the SDK patch |
| Fresh required CI / emulator / six E2E / SAST / build/types/lint | NOT_RUN at this pre-commit snapshot; exact head's required Linux producers must run unchanged; not waived by this record |

## Delivery boundary

Do not self-reference the containing commit. Find it with `git log -- docs/reviews/2026-10-07-mcp-sdk-advisory-repair.md`; subsequent head/run/job/digest readback belongs in the repair PR. The normal publication is authorised; protected main merge is not. Mark MERGE_READY only after the exact-head required aggregate and applicable producers pass; then record OWNER_MERGE_REQUIRED without repeated approval prompts.

Keep #241 docs-only. After a separately authorised merge, fetch new main, merge it into #241 without rebase/force-push, and verify #241's own new head. The user has separately revised SOL-00 orchestration closeout: its 31 historical source gaps become `PROVENANCE_CLOSED_WITH_GAP`, not restored original assertions or fixed findings. Dependency green never proves historical claims or remediation completion.
