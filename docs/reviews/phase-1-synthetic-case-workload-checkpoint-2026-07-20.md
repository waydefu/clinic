# Phase 1 Synthetic Case-Manager Workload Checkpoint — 2026-07-20

## Purpose

This checkpoint tests only the reporting primitive needed to answer: “how
many distinct patients did an opaque case-manager ID receive in a Taipei
calendar month?” It uses synthetic opaque IDs and completed synthetic
appointments only.

## Explicit non-decisions

This is not a decision about a real initial assignment, reassignment, case
closure, eligible service, compensation amount, cutoff, approval authority or
month-close process. D-007 and D-008 remain `pending`; no test fixture is a
clinic rule.

## Required report behaviour

1. Count a distinct patient once per manager and Taipei month in the headline
   workload total, even if multiple valid synthetic ledger entries exist under
   different rule versions.
2. Preserve a metric/rule-version breakdown so a later approved payroll rule
   can be reviewed without overwriting history.
3. Reject duplicate or malformed synthetic ledger records instead of silently
   inflating a workload result.
4. Return only opaque IDs, period, rule version and counts. It must not expose
   a patient name, contact field, diagnosis, salary amount or free-text note.

## Boundary

The result is an in-memory local test output, shown only when the existing
double loopback flags are enabled. It is neither a payroll ledger nor an
authorised staff report.

## Evidence

- `corepack pnpm verify` passed: 48 required files, four workspace builds and
  23 unit tests. `corepack pnpm test:rules` also passed its two direct-client
  Firestore-denial tests.
- Focused domain and API-service tests prove aggregation, rule-version
  preservation, duplicate-credit rejection, same-patient deduplication and
  reset behaviour.
- A headed loopback browser run completed two synthetic appointments for the
  same synthetic patient. The visible workload remained one distinct patient
  and one synthetic credit, with no patient identifier or compensation amount.
- The local visual evidence is retained at
  [`../../output/playwright/test-only-case-manager-workload-summary-2026-07-20.png`](../../output/playwright/test-only-case-manager-workload-summary-2026-07-20.png)
  and is deliberately ignored by version control.
