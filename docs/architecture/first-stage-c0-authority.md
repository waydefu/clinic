# First-stage C0 authority (live split)

**Type:** current authority pointer, not a deployment grant.
**Status:** `OWNER_DIRECTION_APPROVED` / `ENGINEERING_CLOSURE_PENDING`
**Canon:** [decision register](../product/phase-1-decision-register.md)
FS-001, C0-DIR-2026-09-11, CAL-SYNC-DIR-2026-09-11.
**Machine gate:** [stage-2-gate-status.json](stage-2-gate-status.json)
`stageSlices.C0=revise`; C1～C6 `deploymentAuthorities=not_granted`.

This file exists so agents cannot collapse four layers into one lamp:

| Layer | Current value |
| --- | --- |
| Owner/product direction (2026-09-11) | approved |
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

These still block moving `stageSlices.C0` from `revise` to `approved`.
Do not invent answers.

1. Named technical reviewer and security reviewer signatures on C0
   engineering acceptance (not the same as the owner direction packet).
2. Accepted Cloud IAM matrix, JIT/review, and Firestore database-scope
   residual risk (proposal already in
   [C0 readiness artifacts](stage-2-c0-readiness-artifacts-2026-07-29.md)).
3. Budget **actions** at 50% / 80% / 100% (recipients alone are not a
   control). D-010 recorded input already flags this gap.
4. Selected regional-failure DR option (A/B/C), secondary location
   principle, failback owner.
5. MFA recovery path, TOTP clock-skew, authorization-code lock/unlock
   parameters; keep fail-closed (no shared emergency account) unless a
   later named decision says otherwise.
6. Explicit C1 packet: new isolated project versus documented gap-closure
   on existing `beauessence-clinic-staging`. Existing staging is not C1
   complete.

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
