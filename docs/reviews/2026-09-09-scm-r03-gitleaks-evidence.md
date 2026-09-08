# SCM-R03 Gitleaks in Verification evidence — 2026-09-09

**Type:** dated evidence. Records that Gitleaks is now a required job inside
the existing `Verification evidence` aggregate, that a red scan blocks merge,
and that no new GitHub required context was added. It is not Canon for
Dependabot (`SCM-R04`), production, or real data.

**Baseline (green):** `origin/main` `6e91bdacfbeb6a13c3a3b587ab95f54f848d8d17`
(PR #89 squash). Exact-head `verify` run
[34262629891](https://github.com/waydefu/clinic/actions/runs/34262629891)
SUCCESS, including `Gitleaks secret scan` (8s) and `Verification evidence`.

**Negative control:** PR #91 head `b1cd402deb9ba8f0f14dfae5572fee26d0c135b8`,
run [34265160446](https://github.com/waydefu/clinic/actions/runs/34265160446).
Closed unmerged; probe branch deleted.

---

## 1. What landed on `main`

- `.github/workflows/verify.yml` — sixth required job `gitleaks`: checkout
  `fetch-depth: 0`, checksum-pinned Gitleaks 8.30.1
  (`sha256:551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`),
  `gitleaks detect --source . --verbose --redact --config gitleaks.toml --exit-code 1`.
- `scripts/generate-ci-evidence.mjs` — `schemaVersion` 3; `REQUIRED_JOBS`
  includes `gitleaks`.
- Branch protection still has **one** required context: `Verification evidence`.
  `enforce_admins=true` is unchanged (D-013 amended 2026-09-09).

This is the Q-SCOPE grant: Gitleaks is enforced by aggregating into the
already-required check, not by adding a GitHub required check name.

---

## 2. Negative control

A synthetic `generic-api-key` assignment (high-entropy, includes digits; not an
AWS/GitHub/GitLab/Slack token shape) was added only on PR #91 so default
Gitleaks must fire. No allowlist was widened. No real credential.

| Job | Result |
| --- | --- |
| `Gitleaks secret scan` | failure (9s) |
| `Verification evidence` | failure; artifact `gitleaks: failure`, `schemaVersion` 3, `conclusion: failure` |
| `verify` / `rules` / `e2e` / `supply-chain` / `sast` | success |

Evidence JSON bind: repository `waydefu/clinic`, event `pull_request`,
`ref: refs/pull/91/merge`, run `34265160446`. The artifact's `commit` field is
the PR merge ref `59ee338eacaab9aa782d6377e74a20641cc6f6ca` (expected for
`pull_request`); the probe commit on the head branch is `b1cd402`.

A first probe (PR #90) used an `AKIA`+digit string. That made
`check:tracked-secrets` red and left Gitleaks green, because Gitleaks 8.30.1
`aws-access-token` charset is `A-Z2-7`. #90 was closed unmerged.

---

## 3. Closure

`SCM-R03` is closed: pinned scan, same-run aggregate, synthetic fixture blocked
merge, redacted scanner output, no extra required GitHub context.

Still open and **not** this record: `SCM-R04` Dependabot triage, `DATA-R03`,
staging apply, BOOK-PILOT production mount, D-004/D-005, C0/Stage 2.
