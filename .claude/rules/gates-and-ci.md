---
paths:
  - 'scripts/**'
  - '.claude/hooks/**'
  - '.github/workflows/**'
  - 'security/**'
  - 'package.json'
  - 'pnpm-workspace.yaml'
---

# Blocking gates, CI and supply chain

A gate decides what reaches `main`. Treat everything here as product code.

## The gate contract

- A new or changed check under `scripts/` ships with its `*.test.mjs`. Those
  tests run inside `test:unit`, so the gate that guards `main` is itself guarded.
  The agent-harness hooks under `.claude/hooks/` are held to the same standard
  and are collected by the same run; `vitest.config.ts` has to name that
  directory explicitly, because its `include` globs do not match a dot-directory.
- Define behaviour for three states: a clean tree, a dirty tree **containing
  deletions**, and a fresh clone. A check that crashes reports a scan failure as
  a finding — a false red — and a check whose tests lag its implementation
  produces a false green. Both are defects.
- Never weaken a rule, budget, threshold or exception to turn a gate green. Fix
  the finding, or record the exception through its own approval path.

## Supply chain

- Any `auditConfig.ignoreGhsas` entry must also exist in
  [`security/audit-exceptions.json`](../../security/audit-exceptions.json) with an
  approval ID, status, expiry, scope, rationale and release condition;
  `check:audit-exceptions` fails on a missing, incomplete or expired entry. Green
  means "registered and time-boxed", not "risk accepted".
- Never dismiss a Dependabot alert to make a gate green.
- Version pins in `pnpm-workspace.yaml` carry a comment explaining the advisory
  and the path. Remove a pin only when upstream actually carries the fix, and
  remove the comment with it.

## Workflows

- Every action is pinned to a **commit SHA** with a human-readable version
  comment. Update both together. An annotated tag must be dereferenced to the
  commit; the tag object's own SHA is rejected by Actions.
- `Verification evidence` is the single required check and aggregates the matrix
  jobs. `e2e` runs `fail-fast: false` and per-group artifact names on purpose —
  reverting either returns CI to "something broke, unknown what".
- **SAST is part of that aggregate since `SCM-R01` (2026-08-18).** Actions has no
  cross-workflow `needs`, so the scan lives in `sast-scan.yml` as a `workflow_call`
  workflow, `verify.yml` invokes it as the `sast` job in the same run, and
  `evidence` needs it. Same-commit is a property of the call: a `./`-prefixed
  reusable workflow comes from the caller’s commit. `sast.yml` is now only the
  weekly/manual wrapper over the same implementation — do not give it back its
  `push`/`pull_request` triggers, that scans each commit twice and puts a second,
  non-required SAST result next to the one that actually blocks.
- Changing any of that changes the merge gate. Re-prove it the way it was proven:
  an intentional-failure pull request that trips an existing rule, showing `sast`
  **and** `Verification evidence` red on the same commit while everything else is
  green. A YAML diff that looks right is not evidence.

## Semgrep rule files are fixtures

The files under `security/semgrep/` are the scanner's own positive and negative
test cases. They contain unsafe patterns deliberately and are excluded from
ESLint. Do not "fix" them, and do not relax a rule to clear a finding.
