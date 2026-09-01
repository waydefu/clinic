---
name: "handoff-record"
description: "Write the dated handoff record that closes a delivery stage in this repository and register it in the documentation index, using the execution book template - real gate numbers, defects found, what was left undone, local environment traps and the next person's first step. Use when a stage, branch or delivery is being called complete. When finishing a stage or delivery branch, when asked to \"write the handoff\", \"record the evidence\", \"close this stage\", or when picking up a stage someone else left."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/handoff-record/SKILL.md"
---
# Write the handoff record

A stage is not complete until this record exists and is indexed. The template is
§10.4 of
[the execution book](../../../docs/product/full-project-execution-book-2026-07-31.md);
the rule that makes it mandatory is item 10 of
[`CONTRIBUTING.md`](../../../CONTRIBUTING.md).

## 1. Gather facts, do not run gates to fill gaps

Collect: the delivered commits and the merge commit; the CI run and its
conclusion; each gate's real result; the defects found and whether they were
fixed; what was left undone; the local traps you hit.

If a gate was not run, it is `NOT_RUN` with a reason. **Never execute a gate
merely to have a number to write down**, particularly during read-only or
unauthorised work.

## 2. Write it

Create `docs/reviews/YYYY-MM-DD-<topic>.md` covering, at minimum:

- delivered commits and merge commit, and the CI run;
- every gate as `PASS` / `FAIL` / `NOT_RUN` / `UNAVAILABLE`, with the actual
  numbers — test counts, finding counts, sizes — not the word "passed";
- audit coverage **and what it did not cover**;
- artifact names with their SHA-256 where one exists;
- real defects found, and whether each was fixed;
- unresolved findings with an owner;
- local environment traps the next person will hit;
- the next approvable roadmap ID and the first concrete step.

Constraints: the record is dated evidence and approves nothing. A
non-portable local absolute path is never the only delivery location — keep a
Markdown copy in the repository. A document cannot cite its own commit hash; say
so and give `git log -- <path>` instead of inventing one.

## 3. Register and verify

Add the link to the **Review record** section of
[`docs/README.md`](../../../docs/README.md), then run
`corepack pnpm run check:docs`. An unindexed document fails that gate.

## Done when

The file exists, is linked from the index, `check:docs` passes, and the record
would let someone who was not present take over — which means it lists what was
**not** done as clearly as what was.
