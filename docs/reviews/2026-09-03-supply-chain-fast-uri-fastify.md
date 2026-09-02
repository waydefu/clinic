# Supply-chain hotfix: fast-uri 3.1.7 / 4.1.4 and fastify 5.12.1

**Type:** dated evidence. Records the 2026-09-03 production-audit red that
blocked unrelated PRs, and the smallest same-major repair. It is not Canon,
does not change Stage, D-series, audit thresholds, or Day 1 / Day 2 product
work.

**Baseline:** `origin/main` `c2a50139ef220a21f0cfc768846c54373729df57`.
Independent branch `agent/supply-chain-fast-uri-fastify`. PR #50 is untouched.

---

## 1. Reproduction

On that exact main lockfile, `corepack pnpm audit --prod --audit-level moderate`
failed with **10 findings: 8 high + 2 moderate**.

| Package | Resolved | Advisory (this audit) | Severity |
| --- | --- | --- | --- |
| `fast-uri` 3.1.5 | `@fastify/ajv-compiler` / `ajv` | GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp | high |
| `fast-uri` 4.1.2 | `fast-json-stringify@7` | same four, 4.x ranges | high |
| `fastify` 5.10.0 | `@nestjs/platform-fastify@11.1.28` | GHSA-w2qp-rph6-63g4, GHSA-3m5p-2c4r-xxw2 | moderate |

`audit:prod` uses `--audit-level moderate`, so the two Fastify moderates also
block. No `auditConfig.ignoreGhsas` entry was added.

---

## 2. Parent ranges and the chosen patch

| Package | Parent declared range | Why the lockfile was stale |
| --- | --- | --- |
| `fast-uri` 3.x | `@fastify/ajv-compiler@4.0.5` `^3.0.0`; `ajv@8.20.0` `^3.0.1` | Existing override floor `^3.1.5` already allowed 3.1.7; lockfile had not been re-resolved |
| `fast-uri` 4.x | `fast-json-stringify@7.0.1` `^4.0.0` | Same for `^4.1.2` vs 4.1.4 |
| `fastify` 5.x | `@nestjs/platform-fastify@11.1.28` **exact** `5.10.0` | Normal upgrade of Nest 11 cannot reach `>=5.12.1`: 11.1.29 pins 5.11.0, 11.2.3 pins 5.11.3. Nest 12.0.1 pins 5.12.1 and is a framework major — not used |

**fast-uri:** bump the existing per-major floors to `^3.1.7` and `^4.1.4`. A
bare `fast-uri: ^3.1.7` would collapse the 4.x line. 3.1.6 / 4.1.3 satisfy
the npm-audit patched floors, but GitHub GHSA-58mr-gqgx-xq4g and
GHSA-qw65-cvwx-89v3 (2026-09-02) list those exact versions as affected;
patched versions are 3.1.7 / 4.1.4. No 2.x is on the tree.

**fastify:** add `fastify: '^5.12.1'` the same way as `find-my-way` (unscoped
selector), because a `fastify@^5` selector may not match an exact `5.10.0`
request. Same major only.

**Maturity exclude:** pnpm 11.9 refused 3.1.7 / 4.1.4 as younger than the
release-age window. `minimumReleaseAgeExclude: fast-uri@3.1.7 || 4.1.4` is
required for the resolver. It is **not** an audit exception and does not
lower `audit:prod` / `audit:all` thresholds.

---

## 3. Files

- `pnpm-workspace.yaml` — floors, Fastify override, maturity exclude, comments
- `pnpm-lock.yaml` — 3.1.7, 4.1.4, 5.12.1 only (no unrelated graph bump)
- this record and the current-pin row in
  [web-quality-gates-2026-07-24.md](../architecture/web-quality-gates-2026-07-24.md)

No product code, no Day 1 documents, no PR #50, no Day 2 auth/UI work.

---

## 4. Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| `audit:prod` | PASS | 0 findings after lockfile update (was 8 high + 2 moderate) |
| `audit:all` | PASS | 11 remaining: 1 low / 10 moderate; 0 high |
| `check:audit-exceptions` | PASS | empty ignore list |
| `check:secrets` | PASS | 672 tracked files |
| `check:docs` | PASS | 171 files |
| `sbom` | PASS | CycloneDX 1.6, 921 components, 81 runtime; 0 reviewed license exceptions |
| `pnpm verify` | UNAVAILABLE | local `node_modules` recreate hits Windows `EPERM` on `@axe-core/playwright` copyfile; not a repository defect |
| `test:rules` | UNAVAILABLE | same install break, plus CJK-path Emulator constraint on this workspace |
| applicable E2E | NOT_RUN | no web/UI/spec change; product paths unchanged |

Exact-head CI on this PR is the merge evidence. Production is not in scope.

