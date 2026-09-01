---
name: "closeout"
description: "Close a bounded set of related findings to exhaustion rather than stopping after the first fix - declare the closure set from its authoritative source, track every item to a terminal state, search for siblings of each confirmed failure class, and carry the set across as many rollback-safe pull requests as it needs. Use for a release preflight, a dated audit's ID list, a migration, or a repository-wide correctness sweep. When the work is \"fix all of X\", \"close out the audit findings\", \"get this branch ready to merge\", \"sweep the repository for this class of defect\", or when a named ID list from a dated review is being implemented. Not for a single defect - that is /root-cause."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/closeout/SKILL.md"
---
# Close the set, not the first item

The failure mode this exists to prevent: fixing the first finding, opening a
correct pull request, writing an honest report, and leaving the other forty
findings unmentioned. **"One pull request per concern" bounds the pull request.
It never bounds the closure.**

## 1. Declare the closure set before changing anything

Name the set and its authoritative source, in writing, before the first edit. In
this repository the source is almost always an existing dated document, not your
own reading of the tree:

| Kind of closeout | Where the set is defined |
| --- | --- |
| Modernization / audit findings | The dated review's ID table — for example [the 2026-08-11 modernization audit](../../../docs/reviews/2026-08-11-enterprise-modernization-audit.md), whose §6 issue list and §14 Roadmap carry the IDs |
| Stage or delivery closure | [The execution book](../../../docs/product/full-project-execution-book-2026-07-31.md) step list for that stage |
| Owner requests | The OR numbers in [the consolidated list](../../../docs/product/owner-requests-consolidated-2026-07-31.md) |
| A defect class you found | Every sibling occurrence — see step 3 |

Write down, for each item: its ID, what closes it, and what authorises it. An
item whose authorising decision is not approved is **in the set and blocked**,
not silently dropped. IDs have prerequisites here — the audit records
`SCM-R01` as depending on `SCM-R05` — so order the set by dependency and say so.

If the set cannot be bounded, stop and say that. An unbounded closeout is a
different task and the user should get to scope it.

## 2. Track every item to a terminal state

Keep a matrix for the whole run. Every item ends in exactly one state:

`FIXED` · `ALREADY-CORRECT` · `BLOCKED` (name the decision or prerequisite) ·
`OUT-OF-SCOPE` (say who decided) · `DEFERRED` (name where it is now recorded)

`NOT-YET-LOOKED-AT` is not terminal. The closeout is not finished while one
exists.

## 3. Search for siblings of every confirmed failure class

This is the step that makes a closeout worth more than a list of fixes. When you
confirm a defect, the useful question is not "is it fixed" but **"where else is
this same mistake?"** Before closing the item, search the tree for its class:

- the same wrong call shape or argument order elsewhere;
- the same missing `await` in the other write paths;
- the same gate blind spot in the sibling gates (`check:perf` not seeing
  `og:image` is a class, not an instance);
- the same stale claim in the other documents that assert it.

Add what you find to the closure set. A sibling found and left unrecorded is the
same defect shipped twice.

## 4. Fix in rollback-safe batches

Work in batches that revert cleanly on their own. After each batch run the
targeted gates for what that batch touched — `/verify-gates` picks them — not
the full suite each time. Run the full local gate once, at the end.

Follow the repository's ordinary discipline inside each batch: smallest fix at
the owning boundary, a regression test for every deterministic defect, no
opportunistic refactors riding along. If an item's cause is not proven, run
`/root-cause` for that item and **return to this closeout with the result** —
debugging one item never ends the closure.

When a batch is a pull request, its description says which IDs it closes and
which remain open in the set, so the next reviewer can see the closure is
partial by design.

## 5. Stop condition

The closeout ends when every declared item is in a terminal state — not when the
first pull request merges, not when the session gets long. If you must stop
early, say exactly which IDs remain, in which state, and what the next person's
first step is.

Then report:

- the closure set, its source, and the matrix with every item's terminal state;
- the sibling occurrences found by class, and where each was recorded;
- gates per `/verify-gates`, with the evidence rung;
- what is still `BLOCKED`, and on which decision.

If the closeout closed a delivery stage, that report becomes the dated handoff
record — run `/handoff-record`.

## Done when

Every declared ID is terminal, each confirmed failure class has had its sibling
search, no fix is reported without its evidence, and the remaining blocked items
each name the decision that blocks them.
