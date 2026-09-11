# First-stage C0 authority (live split)

**Type:** current authority pointer, not a production grant.
**Status:** `OWNER_AUTHORITY_CONFIRMED` /
`ENGINEERING_RECOMMENDATION_COMPLETE` / `NAMED_REVIEWER_METADATA_PENDING`
(umbrella: engineering C0 `completed`)
**Canon:** [decision register](../product/phase-1-decision-register.md)
FS-001, C0-DIR-2026-09-11, CAL-SYNC-DIR-2026-09-11, C0-ENG-REC-2026-09-11,
C0-ENG-ACCEPT-2026-09-11.
**Machine gate:** [stage-2-gate-status.json](stage-2-gate-status.json)
`stageSlices.C0=completed`; `deploymentAuthorities.C1=granted`; C2～C6
`not_granted`.

This file exists so agents cannot collapse four layers into one lamp:

| Layer | Current value |
| --- | --- |
| Owner/product direction (2026-09-11) | approved |
| Engineering recommendations | `ENGINEERING_RECOMMENDATION_COMPLETE` |
| Owner engineering acceptance | `OWNER_AUTHORITY_CONFIRMED` |
| Named reviewer identity fields | `NAMED_REVIEWER_METADATA_PENDING` |
| Engineering C0 (`stageSlices.C0`) | `completed` |
| C1 deployment authority | `granted` (start C1; not C1 PASS) |
| C2～C6 deployment authority | `not_granted` until the prior gate PASSes |
| Production / real data / DNS | `NOT_AUTHORIZED` |

Machine vocabulary for engineering C0 is `completed`, not the invalid
word `approved` in `stage-2-gate-status.json`. Owner engineering
acceptance of C0-ENG-REC (including synthetic-staging Firestore
database-scope residual risk) is recorded as C0-ENG-ACCEPT-2026-09-11.
`NAMED_REVIEWER_METADATA_PENDING` is a missing person-name field, not a
block on engineering C0. It does **not** invent a technical or security
reviewer identity.

C1 `granted` authorises the isolated synthetic foundation packet. It is
not C1 PASS, not apply evidence, not C2～C6, and not production. This
session still does not run `terraform apply`; local ADC/CLI executes the
packet. AGENTS.md Safety Floor item 8 still forbids live-channel and
production backend enablement.

## Owner direction that is now recorded

- Google Cloud + Firebase; Firestore Native; primary `asia-east1`.
- Isolated test vs production; no shared real patient data.
- Developer-held test billing is allowed; private account / project id /
  billing / email must not be hardcoded as production dependencies.
- Production eventually clinic-owned (IAM, billing, domain, highest admin).
- Staff: independent accounts, Google + clinic-managed, MFA, idle 30
  minutes, absolute 8 hours, disable-on-next-request.
- Phase 1 owner-visible vs hidden capabilities: FS-001.
- Existing public site stays; suggested hostnames are not DNS authority.
- Calendar bidirectional sync is a Phase 1 product capability, with
  cutover semantics in CAL-SYNC-DIR (Calendar is the clinic's legacy
  operational *surface* before cutover; Firestore slot transactions remain
  the availability lock per [ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)).

## Engineering C0 values now accepted

Owner 2026-09-11 continuation accepts
[c0-engineering-recommendations](c0-engineering-recommendations.md)
(`C0-ENG-REC-2026-09-11`) for Phase-1 synthetic staging:

1. **NAMED_REVIEWER_METADATA_PENDING** — person-name signature fields
   remain empty; do not fabricate them. Owner authority is confirmed.
2. IAM / JIT / residual risk — least privilege, no primitive
   Owner/Editor, WIF, IAM Conditions ≤8h; collection-scoped Firestore IAM
   is impossible. Synthetic-staging residual risk (runtime SA
   `datastore.user` can RW the whole database) is **accepted** with the
   recorded mitigations. Production residual-risk acceptance is separate.
3. Budget **actions** at 50% / 80% / 100% — notify; freeze further
   C-slice apply at 80%; pause Scheduler/non-essential APIs at 100%; never
   auto-detach billing. Proposed month amount NT$2,000.
4. DR option — A as C5/C6 baseline plus B secondary project in
   `asia-east1`; reject C and D. Failback is manual.
5. MFA recovery / TOTP / authorization-code lock —
   `adjacentIntervals=1`, in-person second-manager rebind, 5-failure /
   15-minute exponential lock, `manager` unlock, 24h TTL, break-glass
   not provisioned.
6. C1 strategy — new isolated project. Existing
   `beauessence-clinic-staging` stays CAL-PILOT + preview only.

## Transferability (design, not apply)

- All project ids, billing accounts, emails, calendar ids and OAuth
  clients come from environment / Secret Manager, not source constants
  treated as production identity.
- Clinic organisation, billing attach, IAM downgrade of developer `owner`,
  and credential rotation are settings changes, not a rewrite.
- This document does not perform those mutations.

## Calendar executable split (technical truth)

| Surface | Current truth |
| --- | --- |
| ADR-0002 | Calendar is a projection, not the availability lock |
| CAL-PILOT | synthetic-only exception; five-minute Scheduler; not production |
| Worker `syncToken` engine | implemented for incremental list + `410` rebuild |
| `events.watch` / webhook receiver | helpers + unused watch client + **unrouted** `CalendarWatchController`; **not** on AppModule or CAL-PILOT HTTP |
| 2026-09-11 watch + 1–5 minute compensation | product direction; not deployed |

Notification-driven inbound is therefore `IMPLEMENTED=NO` /
`AUTHORIZED=product-direction-only` / `PRODUCTION_AUTHORIZED=NO`.

## Formal booking

`AppointmentController` exists and remains unrouted.
`IMPLEMENTED` / `UNROUTED` / `NOT PRODUCTION AUTHORIZED`.

## Rollback

This file and the matching register records are documentation. Reverting
them restores the previous wording. It does not create or destroy cloud
resources. Moving `stageSlices.C0` back to `revise` would again require
`stage_slice:C0` remaining blockers.
