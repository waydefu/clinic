---
name: verify-gates
description: Pick and run the blocking gates that actually cover a change in this repository, then report a truthful evidence rung with every gate marked PASS, FAIL, NOT_RUN or UNAVAILABLE. Use after editing code, scripts, workflows or docs, and before claiming any work is done or handing a branch over.
when_to_use: After making changes and before reporting completion; when asked "did you verify this", "run the checks", "is this ready to push", or when preparing a handoff or PR.
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
| Broad or uncertain | `corepack pnpm verify` (the full local gate) |

Run the narrow gates first — a fast failure is worth more than a slow one.

## Is this red yours?

Before reporting a failure as caused by your change, check whether it was
already failing. `git stash` is not the way to find out — run the same gate on
`main`, or read the last CI run there.

There is no known pre-existing red at the moment: `main` has been green on every
job since `SCM-R05` closed `SCM-006` on 2026-08-17. If you find one anyway, it
is new information — report it with its evidence rather than clearing it by
relaxing a threshold, registering an audit exception or dismissing an alert.
Those are the three moves the supply-chain rule exists to forbid.

## The one local trap

`test:rules` starts a Firestore Emulator whose JVM cannot resolve a working
directory containing non-ASCII characters, and this workspace lives under a CJK
path. It fails instantly with `FileNotFoundException` on a mangled path.
`JAVA_TOOL_OPTIONS` does not fix it. Map an ASCII drive for the run:

```powershell
subst Y: "<repository root>"
cd Y:\
corepack pnpm run test:rules
cd \
subst Y: /D
```

This is a local-environment limitation only — Linux CI is unaffected. It is
never a reason to skip the gate or to describe the Rules as untested.

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
