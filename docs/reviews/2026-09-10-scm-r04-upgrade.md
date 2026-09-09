# SCM-R04 upgrade — 2026-09-10 fresh-check

**Type:** dated evidence. Construction versions are from this day's
Dependabot API, `npm view`, and `pnpm audit`. Not the 2026-09-08/09
inventory. Not Canon for production, real data, audit-threshold changes, or
alert dismissal.

**Owner of this record:** technical owner under the 2026-09-09 Q-SCM-R04
upgrade grant (necessary majors plus minimal compatibility; no dismiss-to-clear).

`SCM-R04` stays **open**: `csv-parse@5` and `stream-json@1` still need a
firebase-tools parent that can load the patched majors.

---

## Fresh-check (this construction)

GitHub Dependabot `state=open` on `waydefu/clinic` (2026-09-10 Asia/Taipei),
all `development` / `pnpm-lock.yaml` except vitest also on `package.json`.
**8 open, all medium, 0 high / 0 critical:**

| Alert | Package | First patched | Notes |
| --- | --- | --- | --- |
| #31 | `stream-json` | 3.5.0 (npm 3.x latest 3.6.0) | still open after this PR |
| #32 | `csv-parse` | 7.0.2 | still open after this PR |
| #33–#35 | `vitest` / `@vitest/mocker` | 4.1.11 | 3.x will not be patched; vitest 5 not taken |
| #36, #38 | `hono` | 4.13.5 (npm 4.x latest 4.13.7) | same major |
| #39 | `morgan` | 1.12.0 | same major; firebase-tools `^1.10.0` |

Parent tool: `firebase-tools` lock **15.25.0**, npm latest **15.29.0**. No
16.x. 15.29.0 still declares `csv-parse ^5.0.4` and `stream-json ^1.7.3`.

`pnpm audit` after the upgrades below: `audit:prod` 0; `audit:all` 2
moderate remaining (`csv-parse`, `stream-json`). Two extra `qs` 6.x
moderates (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g) were in the audit
graph but not yet in the Dependabot open list; they are same-major and
were patched here.

---

## What this change does

- `vitest` **3.2.7 → 4.1.11** (first patched; not 5.0.0). Unit suite 1403
  passed locally on 4.1.11 with no config change.
- Overrides: `hono` 4.13.7, `morgan` 1.12.0, `qs@^6` 6.16.0. Existing
  same-major pins (`postcss@^8` 8.5.23, `undici@^6`, `re2` 1.26.1) stay.
- No `auditConfig.ignoreGhsas`. No Dependabot dismissal. No gate-threshold
  change. No production, cloud, IAM, secret, traffic, or real data.

## What this change does not do

Forcing `stream-json@3.6.0` under firebase-tools 15.25.0 makes
`firebase help` exit 2: `Cannot find module '…/stream-json/src/filters/Pick'`.
That path exists on 1.x and is gone on 3.x. `csv-parse@7` was not applied
for the same parent-incompatibility reason. Those two alerts stay visible
until a parent line can load the patched majors.

---

## Local gates on this branch

| Gate | Status | Evidence |
| --- | --- | --- |
| `audit:prod` | PASS | 0 findings |
| `audit:all` | PASS | 2 remaining moderate, 0 high (threshold is high) |
| `test:unit` | PASS | vitest 4.1.11, 97 files / 1403 tests |
| `firebase help` | PASS | after dropping stream-json 3; failed under 3.6.0 |
| `check:types` / `check:lint` | PASS | lint after `tsc` (verify.yml order) |
| `check:docs` / `check:format` / `check:structure` / `check:supply-chain` | PASS | this tree |
| Firestore Emulator | UNAVAILABLE locally | port 8080 already taken in this environment; CI `Firestore Emulator` job replaces it |
| E2E | NOT_RUN | delegated to exact-head CI |

Production is not in scope.
