# CAL-PILOT controlled-correction deployment record（2026-08-31）

## 1. Scope and authority

The owner directed integration, deployment, testing and documentation of the
already reviewed extension and controlled-correction work in the existing
`beauessence-clinic-staging`／`asia-east1` synthetic-only pilot. The exact
candidate must first enter `main` through a green integration pull request.

Production D-009／D-016, real patient or clinical data, names, phones, editor or
source free text, anesthesia, payments, new accounts, additional calendars,
Identity configuration and Secret values remain outside this change.

## 2. Pre-apply live baseline

Read-only verification on 2026-08-31 confirmed:

- API revision `cal-pilot-api-00001-xiv` at 100%, immutable image ending in
  `a0f1012a5dba…f79c6`;
- Worker revision `cal-pilot-worker-00001-gow` at 100%, immutable image ending
  in `1aefde570671…49f67c`;
- Hosting version `29a02d4e51c819c1`, preview expiry
  `2026-09-29T05:18:46.938568327Z`;
- Scheduler enabled at `*/5 * * * *`, 240-second deadline;
- application expiry `2026-09-29T04:51:37Z`, generation 1, healthy, both
  switches enabled, exactly two enabled sources and the active source enabled;
- 30 pending candidates, of which exactly 29 are legacy `invalid_format`
  candidates without `expectedEtag`; no Calendar outbox jobs were pending or
  processing.

No Calendar ID, raw Google event ID, etag, sync token, Secret value or full
billing identifier was emitted by the preflight.

## 3. Required integration and local evidence

- #31 is merged to `main`; #32 and #33 were merged only into their preceding
  feature branches and therefore require a new integration PR to `main`.
- The integration adds expired-`processing` lease recovery, its Firestore index,
  a guarded legacy-candidate rebuild and sanitized state reporting.
- Firestore Emulator: 10 test files／80 tests pass, including active-lease
  protection, one-winner recovery races, zero-write migration drift and fresh
  regenerated-etag verification.
- Exact integration PR, merge SHA, 11 required GitHub checks, full verify／E2E,
  Cloud Build IDs and immutable image digests: pending.

## 4. Apply sequence and hard stop

1. Apply the guarded application expiry extension and the reviewed Terraform
   budget plan (`0 added, 1 changed, 0 destroyed`; no Scheduler action).
2. Pause Scheduler and disable inbound／outbound.
3. Deploy Firestore rules／indexes and prove the expired-processing query is
   ready.
4. Deploy new API／Worker revisions at 0%, run authenticated health smoke, then
   move traffic to the exact new revisions.
5. In one guarded transaction supersede exactly 29 legacy candidates, delete
   only their unlinked invalid mirrors, clear the active cursor and append an
   anonymous batch audit. Perform one controlled full sync and prove all 29
   replacement candidates carry a fresh matching server-side etag.
6. Publish the exact Hosting build, run browser/CSP/login/sanitized-network
   smoke, recheck six Secret versions and frozen boundaries, then resume the
   five-minute Scheduler.

Any error from step 2 onward leaves Scheduler paused and both switches disabled.
The #31 revisions and Hosting version above are the exact rollback targets;
appointments, candidates, mirrors and anonymous audit are retained.

## 5. Post-apply evidence

Pending. This section must record the integration PR and merge SHA, CI run,
Terraform plan digest, new revisions and immutable images, Hosting release and
expiry, actual application expiry, regenerated candidate count, online smoke,
Scheduler state, unchanged Identity／Secret／account／Calendar boundaries and the
executed rollback command inputs. It must not contain secret or Google object
identifiers.
