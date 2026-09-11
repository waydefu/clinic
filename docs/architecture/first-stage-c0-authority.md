# First-stage C0 authority (live split)

**Type:** current authority pointer, not a deployment grant.
**Status:** `OWNER_DIRECTION_APPROVED` /
`ENGINEERING_RECOMMENDATION_COMPLETE` / `HUMAN_REVIEW_SIGNATURE_PENDING`
(umbrella: `ENGINEERING_CLOSURE_PENDING` until signatures exist)
**Canon:** [decision register](../product/phase-1-decision-register.md)
FS-001, C0-DIR-2026-09-11, CAL-SYNC-DIR-2026-09-11, C0-ENG-REC-2026-09-11.
**Machine gate:** [stage-2-gate-status.json](stage-2-gate-status.json)
`stageSlices.C0=revise`; C1～C6 `deploymentAuthorities=not_granted`.

This file exists so agents cannot collapse four layers into one lamp:

| Layer | Current value |
| --- | --- |
| Owner/product direction (2026-09-11) | approved |
| Engineering recommendations | `ENGINEERING_RECOMMENDATION_COMPLETE` |
| Human signatures | `HUMAN_REVIEW_SIGNATURE_PENDING` |
| Engineering C0 (`stageSlices.C0`) | `revise` |
| C1～C6 deployment authority | `not_granted` |
| Production / real data / DNS | `NOT_AUTHORIZED` |

Changing `stageSlices.C0` to `approved` is forbidden until every
ENGINEERING_CLOSURE_PENDING item below is signed by the named technical
and security reviewers. Recording owner direction here does **not**
grant Terraform apply, Firebase deploy, Cloud Run, IAM, billing, DNS,
secrets, live Hosting, production Calendar, or real patient data.

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

## ENGINEERING_CLOSURE_PENDING

Moving `stageSlices.C0` from `revise` to `approved` still requires named
technical and security reviewer signatures. Engineering values for items
2–6 are now selected in
[c0-engineering-recommendations](c0-engineering-recommendations.md)
(`ENGINEERING_RECOMMENDATION_COMPLETE`). Do not treat that file as a
signature or as apply authority.

1. **HUMAN_REVIEW_SIGNATURE_PENDING** — named technical reviewer and
   security reviewer signatures on C0 engineering acceptance, including
   Firestore database-scope residual-risk **acceptance**. Do not
   fabricate signatures.
2. IAM / JIT / residual risk — **engineering selected:** least privilege,
   no primitive Owner/Editor, WIF, IAM Conditions ≤8h; collection-scoped
   Firestore IAM is impossible. Residual risk remains for human
   acceptance.
3. Budget **actions** at 50% / 80% / 100% — **engineering selected:** notify;
   freeze further C-slice apply at 80%; pause Scheduler/non-essential
   APIs at 100%; never auto-detach billing.
4. DR option — **engineering selected:** A as C5/C6 baseline plus B
   secondary project in `asia-east1`; reject C and D. Failback is manual.
5. MFA recovery / TOTP / authorization-code lock — **engineering selected:**
   `adjacentIntervals=1`, in-person second-manager rebind, 5-failure /
   15-minute exponential lock, `manager` unlock, 24h TTL, break-glass
   not provisioned.
6. C1 strategy — **engineering selected:** new isolated project.
   Existing `beauessence-clinic-staging` stays CAL-PILOT + preview only.

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
resources. `stage-2-gate-status.json` is unchanged by this pointer.
