# Booking Preview Independent Validation — 2026-08-20

## Classification and result

This is dated verification evidence for **BOOK-MVP-004**. It records what the
synthetic browser-local Booking Preview proved at commit
`ba39690af1bfb201b5970e20afde53655f86c30f`; it is not product authority, a
privacy approval, a production-readiness claim, or permission to use real data.

**Result: PASS.** GitHub-hosted run
[`32341449657`](https://github.com/waydefu/clinic/actions/runs/32341449657)
passed every required job, including the repository verify job, all six E2E
groups, Firestore Emulator, supply-chain/secrets, Semgrep SAST and Verification
evidence.

## Validated boundary

- `/booking` remains `noindex` and visibly identifies itself as
  `LOCAL TEST ONLY`.
- The active page now states `勿填真實患者或健康資料；測試資料只存本機瀏覽器。`.
  The warning is static patient-page content, not an editable workbench
  announcement or a query/storage/remote switch.
- The existing patient-field allowlist remains exact. No new identity or health
  field was added.
- After the initial static page/module load, create and cancel complete without
  any browser network request. The preview therefore did not call an API,
  Firestore, Calendar, LINE, Meta or NAS.
- Only synthetic fixtures were exercised. No production resource or real data
  was used.

## Behavioral cross-check

| Boundary | Evidence and expected result |
| --- | --- |
| Patient create/current/cancel | A synthetic booking is created, shown as the current booking and cancelled through the real browser UI. |
| Slot conflict | A second booking against a reserved slot is rejected; persisted state is byte-for-byte equivalent and appointment, patient, audit and outbox counts do not change. |
| Staff reschedule | The target slot becomes occupied, the original slot is released, the appointment changes, and the expected audit/outbox projections are added. |
| Screen identity | Staff screen projection masks the synthetic ID as `A12****789`; the complete ID remains confined to the hidden print layer. |
| Keyboard path | Keyboard activation advances the booking steps and the resulting panels are visible. |
| Responsive/accessibility | Existing mobile, overflow, focus, privacy/noindex and axe coverage all pass on the packaged application. |
| Frozen surfaces | Clinic 30-file freeze and BOOK-MVP-003 Case/Payroll isolation remain green. |
| Performance | The unchanged 7 KiB `/patient.html` document budget and all five entry budgets pass. |

The browser tests prove both the user-visible lifecycle and the persisted-state
invariants. They do not infer isolation merely from source text or from the
absence of a production credential.

## Findings resolved during validation

Two introduced regressions were caught before acceptance:

1. Run `32340933231` found that a new standalone warning panel exceeded the
   patient document budget, shifted the mobile first-question position and
   exposed a keyboard-test interaction that did not exercise the real element.
2. Run `32341224942` proved the interaction and mobile fixes, but the remaining
   duplicate warning text still left `/patient.html` over budget.

The accepted version consolidates the real-data warning into the existing
always-visible data-retention card, preserves the existing header/footer, and
uses real element keyboard activation. No budget, threshold, checker, workflow,
patient module edge or patient data model was changed to obtain a green result.

## Authoritative remote evidence

- Accepted implementation: `ba39690af1bfb201b5970e20afde53655f86c30f`.
- Workflow: `32341449657` — `success`.
- Core verify: job `96341222556` — structure 216, docs 132, clinic freeze
  30/30, architecture, UI, format, types, lint, clean build, five entry
  performance budgets, and 64 test files / 1,042 tests all passed.
- Firestore Emulator: job `96341222586` — `success`.
- Supply-chain/secrets: job `96341222747` — `success`.
- Accessibility, mobile, appointments, patient portal, UI and auth/RBAC E2E:
  jobs `96341222777`, `96341222781`, `96341222799`, `96341222803`,
  `96341222880`, `96341222885` — all `success`.
- Semgrep SAST: job `96341222873` — `success`.
- Verification evidence: job `96341791420` — `success`.

## Limits and rollback

This remains a synthetic browser-local preview. It is not a production API,
production Firebase connection, availability authority, transaction lock,
Calendar integration, privacy notice approval or website-vendor integration.
BOOK-MVP-005 and later steps are separate gates.

Rollback is by `git revert` in reverse order for `ba39690`, `bb2c5d4` and
`8093314`; shared history must not be rewritten. The dated record remains
historical evidence if a later baseline supersedes it.
