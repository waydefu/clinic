---
name: "verify-gates"
description: "Pick and run the blocking gates that actually cover a change in this repository, then report a truthful evidence rung with every gate marked PASS, FAIL, NOT_RUN or UNAVAILABLE. Use after editing code, scripts, workflows or docs, and before claiming any work is done or handing a branch over. Local resource limits may move expensive gates to required CI; they never omit or weaken required verification. After making changes and before reporting completion; when asked \"did you verify this\", \"run the checks\", \"is this ready to push\", or when preparing a handoff or PR. Also when local disk, memory, browser or JVM limits make the full matrix unsafe to run here."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/verify-gates/SKILL.md"
---
# Verify the change

Runs the smallest set of gates that actually covers what changed, and produces
the evidence block the completion contract in `CLAUDE.md` requires.

## Preconditions — check before running anything

1. `git status --short` and `git rev-parse --show-toplevel`. **Run every command
   from the repository root**; the gate scripts resolve paths against the current
   directory and fail confusingly from anywhere else.
2. `node_modules/` must already exist and `corepack` must be available. If either
   is missing, stop and report the environment prerequisite. A package script may
   start an implicit install; that must never be a side effect of verification.
3. If the tree contains changes you did not make, say so before running anything
   that writes (`format`, `build`, `capture:ui`).
4. Before a **resource-intensive** gate (full `verify`, broad build, full unit
   matrix, SBOM, Firestore Emulator, browser/Playwright), glance at whether this
   environment can take it: free disk, the runtime exists, and whether a JVM or
   browser run is reasonable here. This is a judgment, not a benchmark suite.
   Known dated incidents (low disk, `SQLITE_FULL`, pnpm junction/purge, CJK
   Emulator path) stay dated evidence. They do not become machine-specific Canon.

Cheap local checks (run when practical): targeted unit tests for the files you
touched; `check:governance`; `check:docs`; `check:structure`; format; lint;
narrow type/build; generator/gate tests.

Resource-sensitive checks (run locally only when it is safe): full/broad build,
the whole unit matrix, SBOM, Firestore Emulator, browser automation. If running
them here risks filling the disk, exhausting RAM, or destabilising the workspace,
**do not** smash the environment to obtain a local green. Delegate execution to
required PR CI. That is a change of venue, not a skip.

Authoritative full verification remains the PR's clean GitHub Actions matrix:
applicable `pnpm verify`, Firestore Emulator, E2E groups, supply-chain, SAST,
and commit-bound `Verification evidence`. Do not remove or cheapen CI jobs
because the laptop is weak. Do not deploy or mutate cloud to obtain evidence.

## Decide what is already covered

Pick gates by what changed, then run only the ones whose evidence is not already
good. For each candidate gate, classify its existing evidence:

| | Meaning | Do |
| --- | --- | --- |
| `FRESH` | It ran in this session, after the last edit to any file it covers | Reuse it. Say when it ran |
| `STALE` | It ran, but you have edited a file it covers since | Re-run it |
| `MISSING` | It has not run against this tree | Run it |

A gate is not made fresher by a different gate passing, by CI passing on an
earlier commit, or by the change "obviously" not affecting it. Equally, do not
re-run an expensive suite that is `FRESH` merely for reassurance — that buys no
evidence and costs the user real time.

## Choose the gates from what changed

| Changed | Run |
| --- | --- |
| Anything at all | `corepack pnpm run check:format`, `corepack pnpm run check:lint` |
| `packages/**`, `apps/api/**`, `apps/worker/**` | `corepack pnpm run check:types`, `corepack pnpm run check:architecture`, `corepack pnpm run test:unit` |
| `packages/domain/**` | also `corepack pnpm run check:sync` |
| `firestore.rules`, `tests/firestore/**` | `corepack pnpm run test:rules` |
| `apps/web/**`, `tests/e2e/**` | `/ui-check` — it covers this row properly |
| `scripts/**` | `corepack pnpm run test:unit` (it collects `scripts/**/*.test.mjs`) plus the gate you changed |
| `docs/**`, any `*.md` | `corepack pnpm run check:docs` |
| `package.json`, `pnpm-workspace.yaml`, lockfile | `corepack pnpm run check:supply-chain` |
| `.github/workflows/**`, `security/**` | `corepack pnpm run check:structure` and read the workflow diff for unpinned actions. If you touched the `sast` job, `sast-scan.yml` or the `evidence` job’s `needs`, you changed the merge gate — prove it with an intentional-failure pull request, not by reading the YAML |
| Broad or uncertain | `corepack pnpm verify` when this environment can run it safely; otherwise Tier-1 local gates plus truthful `NOT_RUN`/`UNAVAILABLE` for the rest, with the CI job that replaces them |

Run the narrow gates first — a fast failure is worth more than a slow one. Do
not launch the largest possible suite on constrained hardware by default.

## Is this red yours?

Before reporting a failure as caused by your change, check whether it was
already failing. `git stash` is not the way to find out — run the same gate on
`main`, or read the last CI run there.

There is no standing assumption that `main` is green. Read the latest
`Verification evidence` on `origin/main` for that commit. If you find a red
gate, report it with evidence rather than clearing it by relaxing a
threshold, registering an audit exception or dismissing an alert. Those are
the three moves the supply-chain rule exists to forbid.

## Local environment limits are venue changes

`test:rules` starts a Firestore Emulator whose JVM cannot resolve a working
directory containing non-ASCII characters, and this workspace may live under a
CJK path. It then fails instantly with `FileNotFoundException` on a mangled
path. `JAVA_TOOL_OPTIONS` does not fix it. If you can map an ASCII drive, run
it locally:

```powershell
subst Y: "<repository root>"
cd Y:\
corepack pnpm run test:rules
cd \
subst Y: /D
```

If you cannot run it here, the local status is `UNAVAILABLE`, not a skip and
not a `PASS`. Reason: this filesystem/JVM cannot execute the Emulator reliably.
Final merge requirement: the Firestore Emulator job on this exact PR commit.
Linux CI is unaffected. Do not describe the Rules as untested.

The same pattern applies to other heavy gates. Example: `test:e2e` may be
local `NOT_RUN` when the browser matrix is intentionally delegated to required
PR CI. Final merge requirement: exact-commit CI `PASS`. Do not use
`UNAVAILABLE` merely because a test is slow.

A local failure caused by disk or RAM exhaustion is still a local `FAIL` until
you classify it as a repository defect or an environment/resource failure. If
it is environmental, report that truthfully and obtain clean CI on this
commit. Never convert it to `PASS`. Never change `FAIL` to `NOT_RUN`.

Targeted local gates that pass, with required CI not yet run, are at most
`GATE-VERIFIED`. After this exact commit's required jobs and `Verification
evidence` pass, `CI-VERIFIED` is allowed. Earlier-commit CI is not this
commit's evidence.

## Fail-safe

Resource awareness does not permit: reducing coverage; weakening thresholds;
making CI cheaper because the local machine is weak; skipping a required PR
CI job; hiding a repository failure behind a resource story; registering a
governance or security waiver solely because hardware cannot run a test;
deploying or mutating cloud to obtain verification; claiming CI from another
commit. A weak local machine is an execution constraint, not a policy
exception.

## Report

Emit exactly this, and nothing softer:

- **Evidence rung** — one of `CODE-ONLY`, `TEST-VERIFIED`, `GATE-VERIFIED`,
  `CI-VERIFIED`, `DEPLOYED-NOT-SMOKED`, `VERIFIED-PRODUCTION`.
- **Gate table** — every gate you selected above, each `PASS`, `FAIL`, `NOT_RUN`
  or `UNAVAILABLE`, with the real counts (files, tests, findings) rather than the
  word "passed", and a reason for every `NOT_RUN` / `UNAVAILABLE`.
- **Not covered** — what these gates do not prove for this change.

## Done when

Every selected gate has a status, no status was inferred from another gate, and
the rung claimed is the one actually reached. A gate you chose not to run is
listed as `NOT_RUN` with its reason — it is never dropped from the table.
