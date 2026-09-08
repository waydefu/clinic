# SCM-R04 Dependabot triage — 2026-09-09

**Type:** dated evidence. Fresh-check of open Dependabot alerts on
`waydefu/clinic` and same-major patches where the parent range already
allows them. Not Canon for production, real data, audit-threshold changes, or
alert dismissal.

**Fresh-check:** GitHub GraphQL `vulnerabilityAlerts(states: OPEN)` at
2026-09-08T19:10Z (alerts 13–21, 31 as previously seen; **alert 32 opened
2026-09-08T18:47:02Z**). Count is **10 open**, not the 2026-08-11 snapshot of
9. Severity: 9 moderate, 1 low. **0 high / 0 critical.** All
`development` scope via `pnpm-lock.yaml`.

**Owner of this record:** technical owner under the 2026-09-09 Q-SCM-R04
grant (per-alert fields, no dismiss-to-clear, High/Critical escalate).

`SCM-R04` stays **open** after this change: two alerts need a firebase-tools
major-line upgrade that 15.x does not declare.

---

## 1. Inventory

| Alert | Dependency | Severity | Reachability | Affected path | Patched version | Owner | Resolution | Rationale | Expiry / review |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [#13](https://github.com/waydefu/clinic/security/dependabot/13) | `postcss` 8.5.20 | moderate | dev-only | `vitest` → `vite@7.3.6` → `postcss` | 8.5.23 | technical owner | **patched** this PR | same major; GHSA-fxqj-rqcc-2cmp `from`-unset sourceMappingURL | n/a after merge |
| [#14](https://github.com/waydefu/clinic/security/dependabot/14) | `undici` 6.27.0 | moderate | dev-only | `firebase-tools@15.25.0` → `undici` (`^6.19.0`) | 6.28.0 | technical owner | **patched** (lock 6.28.1) | same major; GHSA-8xcm-r25x-g524 retry desync | n/a after merge |
| [#15](https://github.com/waydefu/clinic/security/dependabot/15) | `undici` 6.27.0 | moderate | dev-only | same | 6.28.0 | technical owner | **patched** (lock 6.28.1) | GHSA-v3r7-h72x-cjcm cookie attribute injection | n/a after merge |
| [#16](https://github.com/waydefu/clinic/security/dependabot/16) | `undici` 6.27.0 | moderate | dev-only | same | 6.28.0 | technical owner | **patched** (lock 6.28.1) | GHSA-m8rv-5g2x-5cg5 CRLF via blob `type` | n/a after merge |
| [#18](https://github.com/waydefu/clinic/security/dependabot/18) | `re2` 1.26.0 | moderate | dev-only (optional native) | `firebase-tools` → `superstatic` optional `re2`; `allowBuilds.re2=false` | 1.26.1 | technical owner | **patched** | same major; GHSA-j4r3-hg7j-8chg OOB read | n/a after merge |
| [#19](https://github.com/waydefu/clinic/security/dependabot/19) | `hono` 4.12.31 | moderate | dev-only | `firebase-tools` → `@modelcontextprotocol/sdk@1.30.0` / `@hono/node-server@2.0.12` | 4.12.34 | technical owner | **patched** (exact 4.12.34, not `^`) | GHSA-54fx-42gc-7vw4 language-middleware DoS | n/a after merge |
| [#20](https://github.com/waydefu/clinic/security/dependabot/20) | `hono` 4.12.31 | low | dev-only | same | 4.12.34 | technical owner | **patched** | GHSA-79qm-7rj5-m7r9 proxy `Connection` hop-by-hop | n/a after merge |
| [#21](https://github.com/waydefu/clinic/security/dependabot/21) | `hono` 4.12.31 | moderate | dev-only | same | 4.12.34 | technical owner | **patched** | GHSA-f23p-vx2j-j53r `memo()` cross-request SSR leak | n/a after merge |
| [#31](https://github.com/waydefu/clinic/security/dependabot/31) | `stream-json` 1.9.1 | moderate | dev-only | `firebase-tools@15.25.0` declares `^1.7.3` | 3.5.0 | technical owner | **open — not patched** | patched version is **3.x**; 15.29.0 still declares `^1.7.3`. GHSA-528h-pc64-c93x nested-filter DoS. No dismiss. | **2026-10-09** (moderate 30d) |
| [#32](https://github.com/waydefu/clinic/security/dependabot/32) | `csv-parse` 5.6.0 | moderate | dev-only | `firebase-tools@15.25.0` declares `^5.0.4`; opened 2026-09-08T18:47:02Z | 7.0.2 | technical owner | **open — not patched** | patched version is **7.x**; 15.29.0 still `^5.0.4`. GHSA-8cw4-87c7-c6xx prototype replacement via `columns`. No dismiss. | **2026-10-09** (moderate 30d) |

No production/runtime path: `audit:prod` remains the shipping bar (`--prod --audit-level moderate`). These packages enter through `firebase-tools` (CLI) and `vite` (dev). `apps/api` does not depend on Hono.

---

## 2. What this PR changes

`pnpm-workspace.yaml` overrides (comments included):

- `hono: '4.12.34'`
- `postcss@^8: '8.5.23'`
- `undici@^6: '^6.28.0'` (lock resolved `6.28.1`)
- `re2: '1.26.1'`

No `auditConfig.ignoreGhsas`. No Dependabot dismissal.

Not done: firebase-tools major, csv-parse 7, stream-json 3, production, real
data, lowering `audit:prod` / `audit:all`.

---

## 4. Local gates on this branch

| Gate | Status | Evidence |
| --- | --- | --- |
| `audit:prod` | PASS | 0 findings |
| `audit:all` | PASS | 4 remaining moderate, 0 high (threshold is high) |
| `check:docs` | PASS | 183 files |
| `check:structure` | PASS | 238 required files |
| `pnpm verify` / Emulator / E2E | NOT_RUN | delegated to exact-head CI; lockfile + docs only besides overrides |

Exact-head `Verification evidence` on the PR is the merge evidence. Production is not in scope.

---

## 5. Closure rule

`SCM-R04` closes when every open alert is either patched on a compatible line
or has a still-valid named review date — and no High/Critical remains
unaddressed. After this PR, two moderate firebase-tools majors remain, so the
ID stays open until 2026-10-09 review or a parent-range upgrade.
