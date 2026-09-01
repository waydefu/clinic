# AI retrieval map

Minimum authoritative context by task scope. Not the document catalogue —
that remains [README.md](README.md). Authority scopes:
[GOVERNANCE.md](../GOVERNANCE.md). Safety Floor: [AGENTS.md](../AGENTS.md).
Generated projection (not Canon): [state/current.md](state/current.md).
Unresolved dated conflicts: [state/conflicts.md](state/conflicts.md).

Load only the matching route. Do not load backend, security-history or
deployment evidence for a UI-only change.

| Scope | Canon | ADR / contract | State | Procedure |
| --- | --- | --- | --- | --- |
| frontend/UI | [design/ui-ux-rules.md](design/ui-ux-rules.md) R-1–R-26; [design/test-only-operations-ui.md](design/test-only-operations-ui.md); sandbox [product/test-only-sandbox-baseline.md](product/test-only-sandbox-baseline.md) | ADR-0001, ADR-0003 (browser never writes Firestore) | visual baseline in [README.md](README.md) §4 | `.claude/rules/web-ui.md`; skill `ui-check` |
| API/domain | [architecture/domain-boundaries.md](architecture/domain-boundaries.md); `packages/domain`; `packages/contracts`; `packages/domain/src/roles.ts` | ADR-0001, ADR-0004, ADR-0005 | decision register for any policy-shaped change | `.claude/rules/domain-and-api.md` |
| Firestore/rules | [architecture/firestore-local-baseline.md](architecture/firestore-local-baseline.md) | ADR-0003 | Emulator only unless deployment authority exists | `test:rules`; domain-and-api rule |
| auth/RBAC | `packages/domain/src/roles.ts`; D-006 in the [register](product/phase-1-decision-register.md) | ADR-0001 | register status; do not infer from UI `admin` strings | domain-and-api rule; `physician` stays empty-permission |
| Calendar | [architecture/calendar-event-id.md](architecture/calendar-event-id.md); D-009 / D-016 in the register | ADR-0002 | [architecture/stage-2-gate-status.json](architecture/stage-2-gate-status.json) | [runbooks/calendar-sync-failure.md](runbooks/calendar-sync-failure.md) |
| data/privacy | [security/privacy-policy-checklist.md](security/privacy-policy-checklist.md); [security/taiwan-privacy-legal-baseline.md](security/taiwan-privacy-legal-baseline.md); D-001–D-003 | — | register; [legal/privacy-policy-draft.md](legal/privacy-policy-draft.md) is draft | AGENTS Safety Floor item 1; CONTRIBUTING 3–4; [SECURITY.md](../SECURITY.md) (report intake; not product policy) |
| CI/gates | [document-lifecycle.md](document-lifecycle.md); D-013 in the register | — | CI evidence is dated; do not restate as approval | `.claude/rules/gates-and-ci.md`; skill `verify-gates`; `pnpm verify` |
| deployment | D-010 in the register; AGENTS Safety Floor item 8 and Remain disabled; [architecture/infrastructure-and-operations-plan-2026-07-24.md](architecture/infrastructure-and-operations-plan-2026-07-24.md) (plan-only) | — | `stage-2-gate-status.json` `deploymentAuthorities`; preview runbooks | `.claude/hooks/guard-commands.mjs`; [runbooks/synthetic-online-preview.md](runbooks/synthetic-online-preview.md) |
| supply-chain | CONTRIBUTING 9; [security/audit-exceptions.json](../security/audit-exceptions.json) | — | projection `auditExceptions` counts | `check:supply-chain`; gates-and-ci rule |
| documentation/evidence | [document-lifecycle.md](document-lifecycle.md); this catalogue [README.md](README.md) | — | [state/current.md](state/current.md) | `.claude/rules/docs-and-evidence.md`; skills `handoff-record`, `closeout` |
| governance-change | [GOVERNANCE.md](../GOVERNANCE.md); AGENTS Safety Floor; this file | do not add ADRs for meta-governance | [state/conflicts.md](state/conflicts.md); waivers `docs/governance/waivers.json` | `.claude/README.md`; `check:governance` |

D-series answers are only in the [decision register](product/phase-1-decision-register.md).
Owner input is not approval. Do not guess.
