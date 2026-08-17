---
paths:
  - 'docs/**'
---

# Documentation and evidence

This repository carries more governance documentation than code, and a stale
cross-reference misleads exactly as much as stale code does.

## What `check:docs` enforces

- Every document under `docs/` must be linked from
  [`docs/README.md`](../../docs/README.md), or the gate fails. Dated review and
  handoff records belong in the **Review record** section; retired material
  belongs under **Superseded**.
- Every relative markdown link in the repository must resolve.
- A short list of known-obsolete claims is rejected by name. If you are
  correcting one of those, update the check as well.

## Dated facts are not approvals

A recorded state ("branch protection was verified on 2026-07-31", "Dependabot
reports 9 open alerts") is evidence with a date on it. It never becomes
permission. When you cite one, cite the date with it, and never restate a
snapshot as a decision that has been approved.

Policy answers live in
[`docs/product/phase-1-decision-register.md`](../../docs/product/phase-1-decision-register.md).
If the answer is not there, it has not been decided — record the question and its
owner rather than implementing a guess.

## Evidence vocabulary

In any review, handoff or delivery record, each gate is reported as `PASS`,
`FAIL`, `NOT_RUN` or `UNAVAILABLE`, with a reason for the last two, and with the
real numbers rather than the word "passed". Never run a gate purely to fill a
number in during read-only or unauthorised work — write `NOT_RUN` and why.

A document cannot cite its own commit hash. Say so and give
`git log -- <path>` as the lookup, instead of inventing a hash that an amend
would invalidate.

A stage is not complete until its dated handoff record exists and is indexed.
Run `/handoff-record` rather than assembling one by hand.
