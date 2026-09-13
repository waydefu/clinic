# Internal-preproduction owner direction — 2026-09-13

Dated evidence, not a production grant. Records the in-flight owner
direction that splits **internal-test completion** from **public
production launch**. Canonical packet:
[decision register IP-001-2026-09-13](../product/phase-1-decision-register.md).

**Executor:** `GROK_PROJECT_CLOSER`. Laptop Luna playbook remains
`GROK_RESTS` / `LUNA_SOLE_EXECUTOR`.

## What changed

| Previous shorthand | Current split |
| --- | --- |
| `PROJECT_COMPLETE = production launched` | Stage target is `INTERNAL_PREPRODUCTION_COMPLETE` |
| Any `/v1/bookings` route = production launch | `INTERNAL_TEST_ROUTE_AUTHORIZED` vs `PUBLIC_PRODUCTION_ROUTE_NOT_AUTHORIZED` |
| D-001–D-005 pending blocks all implementation | Pending still blocks **production/legal** ceremony; IP-001 provisional rules may be implemented internally |
| D-007 / D-014 / D-015 pending block Phase 1 | `DEFERRED_OUTSIDE_CURRENT_PHASE1_DELIVERY` |
| D-011 URL undecided blocks completion | `GO_LIVE_DEFERRED`; Firebase preview / `.web.app` is enough |
| Clinic public website unfinished = HUMAN_BLOCKED | `DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE` |
| Missing gcloud binary = permanent HUMAN_BLOCKER | Attempt supported install; interactive `--no-launch-browser` login is allowed |

D-001–D-005 / D-009 / D-016 **production** rows were **not** flipped to
`approved`. Real patient data is still unauthorised.
`FUNCTIONALLY COMPLETE ≠ REAL PATIENT DATA AUTHORIZED`.

## Delivery scope this stage

Owner-facing product: **Booking page + Patient portal**. Staff
workbench, API, Firestore, Auth, RBAC, Calendar (synthetic/CAL-PILOT),
audit, monitoring and synthetic migration remain required internal
dependencies. Clinic marketing / corporate main website is deferred
because the vendor lease is still active — not a quality failure.

## Blocker classes

- `INTERNAL_TEST_BLOCKER` — stops `INTERNAL_PREPRODUCTION_COMPLETE`
- `GO_LIVE_DEFERRED_ITEM` — production launch only; does **not** by
  itself force `INTERNAL_PREPRODUCTION_COMPLETE = HUMAN_BLOCKED`
- `HUMAN_ACTION_REQUIRED` — password / 2FA / security key / CAPTCHA /
  named approval / manual AT / merge token / interactive browser login
  at a waiting CLI prompt

## As-of Git (this record)

Recorded before the internal-test composing module lands. Bind SHAs with
`git log` on this path; a document cannot cite its own commit.

| Ref | Meaning |
| --- | --- |
| `origin/main` | `#118` merged (`02b949f`); contains `#117` |
| PR #119 | B-013 stored-role; exact-head `0c03679` 12/12; merge candidate |
| PR #120 | rebased #116 intent onto `0c03679`; keep draft until **new** exact-head CI |
| PR #116 | superseded by #120 after #120 lands |

This token cannot merge (`permissions.push=false`).
