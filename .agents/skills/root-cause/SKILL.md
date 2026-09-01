---
name: "root-cause"
description: "Systematic debugging for this repository - reproduce the defect, find the earliest incorrect state, name the root cause with evidence, add a failing regression test, then apply the smallest fix at the owning boundary. Use when a defect's cause is not already proven; skip it for a typo or a fix whose cause is visible in the diff. A bug report, a failing test or CI job, unexpected runtime behaviour, or a red gate whose cause is not obvious. Not for a typo, a known-cause one-liner, or a change the user has already diagnosed."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/root-cause/SKILL.md"
---
# Find the root cause

Do not patch a symptom you cannot explain, and do not refactor on a theory.

## 1. Reproduce

Produce a command that fails: a unit test, `test:rules`, a Playwright spec, or a
script invocation. Record the exact command and output.

If you cannot reproduce it, stop here and report
`NEEDS-RUNTIME-REPRODUCTION` with what you tried and what you would need
(a browser session, an emulator run, a device, a CI log). Do not continue.

## 2. Locate the earliest incorrect state

Find where the value first becomes wrong, not where the failure surfaced. Useful
here: narrow with a targeted test rather than logging; check the boundary
crossings first (contract → domain → application service → repository → worker);
`git log -S` and `git bisect` when the behaviour used to be correct.

## 3. Name the root cause

State it in one sentence with the evidence that proves it. Then classify:

| Class | Meaning |
| --- | --- |
| `CONFIRMED` | Reproduced, and the cause is proven by evidence. |
| `LIKELY` | Reproduced, cause strongly indicated but not proven. |
| `NEEDS-RUNTIME-REPRODUCTION` | Not reproducible with what is available here. |
| `NOT-A-BUG` | Behaves as specified or as a decision requires. |

`LIKELY` does not authorise a refactor. Either get to `CONFIRMED`, or make the
smallest change that is safe under both readings and say which.

## 4. Regression test first

Add the smallest test that fails **before** the fix and passes after. Put it at
the layer that owns the rule. Run it and show it failing before you edit source.
For a booking or guard defect, cover the denied and contended cases too.

If a regression test is genuinely impossible, say why in the report — do not
skip it silently.

## 5. Smallest fix at the owning boundary

Fix the package that owns the rule, not the caller that noticed. No opportunistic
cleanup in the same change. If the minimal fix would hard-code a pending policy,
weaken a safety boundary or create a second source of truth, stop and propose the
smallest safe prerequisite instead.

## 6. Verify

Run the new test, then `/verify-gates` for the touched area.

## Done when

The report contains: the reproduction command, the earliest incorrect state, the
root cause in one sentence, the classification, the regression test and its
before/after result, the files changed, and the evidence rung. A fix reported
without a reproduction and a failing-first test is incomplete.
