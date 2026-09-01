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
- Firestore Emulator: 10 test files／82 tests pass, including active-lease
  protection, one-winner recovery races, zero-write migration drift and fresh
  regenerated-etag verification. When a full sync deterministically produces
  the same candidate ID, repository replacement is allowed only for the exact
  migration-marked tombstone that still lacks `expectedEtag`; unrelated
  superseded candidates remain immutable.
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

The expiry extension and budget step completed first:

- integration PR #34 passed 11／11 checks and merged as
  `77255e1e1503d5cb062b53f46a86039f0150088f`;
- application expiry is `2026-11-28T04:51:37Z`, generation remains 1;
- reviewed Terraform plan SHA-256 is
  `2CC09E65ECB629473FD429E6B44A16EFDF141A8E197565AF82ED3090AF909DC2`;
  it applied `0 added, 1 changed, 0 destroyed` to the existing NT$30 budget,
  and the post-apply plan reported no changes;
- Cloud Build `cdc22a08-8621-4133-ba34-5ea1d84a7bc6` succeeded for the exact
  merge SHA and produced both immutable application images.

The first runtime-update attempt then stopped safely before any Firestore index,
Cloud Run revision, migration or Hosting release was created. Firebase CLI
rejected an unsupported `--quiet` flag. The catch path left Scheduler `PAUSED`,
both switches disabled, the #31 API／Worker／Hosting baseline unchanged, all 30
pending candidates intact and no outbox backlog. A follow-up hotfix removes the
unsupported flag and requires an explicit `ResumeSafeStoppedAttempt` gate that
proves Scheduler and both switches are already stopped before continuing.

Hotfix PR #35 passed 11／11 checks and merged as
`d4a8cc7c16b1e88a3996c1a580a2a0178684e6f8`. Exact-main Cloud Build
`5e6d9aa5-3b20-48ad-8540-8f3525147057` succeeded and produced reviewed API and
Worker digests ending in `…a18f6` and `…ad85e` respectively.

The resumed attempt deployed the Firestore rules and expired-processing index;
the index reached `READY`, and both new revisions were created at 0% with
successful platform startup checks. The Worker authenticated HTTP smoke then
failed closed: a temporary cross-project Calendar writer invoker binding was
present in IAM but Cloud Run rejected that principal. No traffic moved, no
candidate was migrated, no Hosting release was created, and Scheduler plus both
switches remained stopped. Read-back showed the #31 revisions still at 100%,
all 30 pending candidates intact, exactly 29 legacy candidates and no outbox
backlog.

Follow-up PR #36 removes temporary Calendar-writer Run IAM entirely. Zero-traffic
health smoke and the single controlled full sync use the already authenticated
deployment operator; the ordinary private Worker IAM remains Scheduler-only. It
also resolves baseline images from the actual 100%-traffic revision, rather than
the latest service template, so a safely stopped retry cannot misidentify a
0%-traffic candidate as active.

PR #36 passed 11／11 checks and merged as
`6e3f351b8eeaa17d995b09573df77cac9099095a`. Exact-main Cloud Build
`eabb01df-4a13-429f-a499-cb3a4c62c92f` succeeded. The next guarded attempt
created API revision `cal-pilot-api-00003-muy` and Worker revision
`cal-pilot-worker-00003-nuf`, passed both 0% health smokes and moved each to
100%. Exactly 29 legacy candidates were superseded, a controlled full sync ran,
and exactly 29 regenerated candidates were verified with fresh matching etags.

Hosting release `09ca5b147ea8e576` also finalized successfully with preview
expiry `2026-10-01T11:06:13.085614582Z` and the reviewed CSP. Firebase CLI mixed
predeploy text with its JSON output, so the local parser failed after the
release. The catch path again paused Scheduler and disabled both switches.
Read-back proved zero legacy candidates, 30 pending sanitized candidates, empty
outbox, new Run revisions at 100%, new Hosting active and private Worker IAM
still Scheduler-only.

Follow-up PR #37 adds a dedicated post-migration finalizer and stops parsing
mixed Hosting deployment stdout as JSON. The finalizer cannot deploy, migrate,
change IAM or touch Secrets; it verifies the exact post-migration safe-stop
state and only then re-enables both switches and the five-minute Scheduler.

PR #37 passed 11／11 checks and merged as
`dedec4929a958c33f757b7197dde536c6890bfcd`. Its first read-only finalizer
preflight failed closed because PowerShell converted ISO timestamps to date
objects before a string comparison. Live read-back showed no actual drift:
Scheduler remained paused, both switches disabled, zero legacy candidates, 30
pending candidates and empty outbox. PR #38 normalizes application and Hosting
timestamps to UTC instants before comparison; it does not broaden any accepted
state or mutate cloud resources.

PR #38 passed 11／11 checks and merged as
`22b8998e1a399127140c3164a7cf28f3dc8180eb`. The next read-only preflight
normalized both timestamps correctly, then failed closed at the Scheduler-only
IAM comparison because PowerShell unwrapped the one-member result into a scalar
string before index access. Direct IAM read-back still showed exactly the one
approved Scheduler invoker. PR #39 keeps the sorted result inside an explicit
array; no accepted principal or cloud state changes.

Pending after PR #39: the final merge SHA and CI run,
Terraform plan digest, new revisions and immutable images, Hosting release and
expiry, actual application expiry, regenerated candidate count, online smoke,
Scheduler state, unchanged Identity／Secret／account／Calendar boundaries and the
executed rollback command inputs. It must not contain secret or Google object
identifiers.
