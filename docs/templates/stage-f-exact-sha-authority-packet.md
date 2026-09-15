# Stage F exact-SHA authority packet template

Copy after E1–E7 engineering is **merged** to `main`. Bind every field
to the fresh `origin/main` 40-character SHA. Do not fill this template
on a feature branch and treat it as apply authority.

```text
PACKET_COMMIT_IS_NOT_AUTHORITY_SHA = true
CLOUD_MUTATION = NONE
STAGE_F_APPLY = NOT_STARTED
```

Preferred publication: GitHub Actions artifact or unsigned review
attached to the engineering merge commit. If governance later requires
the packet text in git, it must name the **already-merged engineering
SHA** and must not be merged in a way that moves `origin/main` off that
SHA.

Owner checkboxes stay unchecked until the clinic owner signs.

---

## Identity

```text
REPO = waydefu/clinic
AUTHORITY_SHA = <POST_MERGE_ORIGIN_MAIN_40_CHAR_SHA>
BUILD_SOURCE_SHA = <same>
IMAGE_SOURCE_SHA = <same>
PROJECT = beauessence-clinic-stg-c1a01
REGION = asia-east1
CLOUD_RUN_API = internal-test-api
CLOUD_RUN_WORKER = internal-test-outbox
ARTIFACT_REGISTRY = asia-east1-docker.pkg.dev/beauessence-clinic-stg-c1a01/internal-test
HOSTING_SITE_CHANNEL = beauessence-clinic-stg-c1a01 / internal-preproduction
HOSTING_CONFIG = firebase.isolated-api-preview.json
HOSTING_ROLLBACK_CONFIG = firebase.isolated-preview.json
FIRESTORE_DATABASE = (default)
SYNTHETIC_CALENDAR_ID = <SECRET_REFERENCE only>
```

Apply guard:

```text
origin/main
== AUTHORITY_SHA
== BUILD_SOURCE_SHA
== IMAGE_SOURCE_SHA
```

Any mismatch: `AUTHORITY_INVALIDATED` / STOP.

## Status block

```text
APPLY_ON_THIS_SHA = READY | BLOCKED_BY_SOURCE_GAPS | WAITING_FOR_POST_MERGE_SHA
CLOUD_MUTATION = NONE
STAGE_F_APPLY = NOT_STARTED

OWNER DECISION:
[ ] APPROVE
[ ] REJECT
```

Fill `APPLY_ON_THIS_SHA = READY` only when `pnpm inspect:stage-f-graph`
reports E1–E7 `CLOSED` on this SHA.

## Exact planned mutation list

For each resource: current state, desired state, exact command, reason,
rollback, evidence. `execute = false` until APPROVE.

Include at least:

- API enablement still disabled in cloud (`run`, `artifactregistry`,
  `cloudbuild`, `cloudscheduler`)
- Artifact Registry repository `internal-test`
- Cloud Run `internal-test-api` and `internal-test-outbox`
- IAM: `internal-test-api`, `internal-test-outbox`, scheduler, builder.
  No Owner/Editor.
- Digest-pinned images (`@sha256:…`, never `latest`)
- Hosting preview rewrite `/v1/**` → `internal-test-api`
- Firestore composite indexes from `firestore.indexes.json`
- WP-B4 policies / `c1-application-alerts` / email channel (address from
  tfvar/secret, never git)
- Secret Manager **versions** as references only
- Cost / preview expiry
- Acceptance matrix (Booking / Workbench / Calendar / monitoring / backup)

## Exclusions

```text
REAL_PATIENT_DATA = NOT_AUTHORIZED
PUBLIC_PRODUCTION_LAUNCH = DEFERRED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
PUBLIC_MARKETING_HOMEPAGE = OUT_OF_SCOPE
CURRENT_WIDGET_EMBED = DISABLED
```
