# CAL-PILOT synthetic-only foundation

Review-only until the final exact deployment confirmation. This configuration
creates service identities, least-privilege IAM, empty Secret Manager
containers, a deny-direct-browser Firestore database, a **paused** five-minute
Scheduler job and the NT$30 50/80/100% alert budget. The budget uses one static
custom period from 2026-08-30 through 2026-11-28, so it does not reset monthly.
The API `end_date` is therefore 2026-11-29 because Google treats that field as
exclusive.
It does not create secret versions, Calendar ACLs, Cloud Run revisions or
Hosting releases.

The first foundation plan uses the reviewed
`https://cal-pilot-worker.invalid` placeholder only because the Scheduler is
paused. It must never be resumed with that target.

The Firestore and Identity Platform resources are one-per-project. Before the
first plan, import any existing `(default)` database and Identity configuration;
never allow Terraform to replace them. State must use a reviewed encrypted
GCS backend before any apply; pass its bucket and a staging-only prefix to
`terraform init -backend-config`, and enable uniform access, public-access
prevention and object versioning on that bucket. The approved
`2026-11-28T04:51:37Z` expiry remains an application kill switch even if
cleanup is delayed.

Pass the owner-approved billing account through the sensitive
`TF_VAR_billing_account_id` environment variable for every plan and apply. The
configuration never infers or commits a billing account identifier.

Release sequencing is owned by `scripts/cal-pilot-release.ps1`: after the
reviewed foundation has been applied, it accepts immutable image digests,
deploys 0% revisions, runs authenticated synthetic smoke, moves the exact
revision traffic, updates the still-paused Scheduler to the resulting private
Worker URL, publishes an expiring Hosting preview, configures Identity Platform,
then enables the application switches and Scheduler. Secret values are piped
directly from local files or generated memory to Secret Manager and are never
Terraform inputs or outputs. The final Terraform plan must pass the exact
Worker URL so the reviewed state agrees with the release update.

The 2026-08-31 extension does not rerun the release script or seed. Use
`scripts/cal-pilot-extend.ps1` only from the exact approved extension commit;
it verifies the frozen Cloud Run and Hosting baseline before changing only the
application expiry plus its anonymous audit. Firebase preview channels still
expire within 30 days, so `scripts/cal-pilot-renew-hosting.ps1` changes only the
channel `expireTime` in the final seven days and verifies that the Hosting
release version did not change.

The Scheduler declaration now records `paused = false` because the reviewed
2026-08-30 release already enabled that exact five-minute job. This is state
reconciliation only: an extension plan is acceptable only when it contains no
Scheduler action and exactly one in-place budget update.

After the extension and budget are applied, subsequent reviewed runtime updates
use `scripts/cal-pilot-update.ps1`, not the first-release script. The update
path verifies the prior rollback revisions／Hosting version and all six enabled
Secret versions, pauses Scheduler, disables both application switches, waits
for the expired-processing recovery index, runs 0% authenticated smoke,
performs the guarded legacy-candidate rebuild and full-sync verification,
publishes the matching Hosting build, then resumes Scheduler. Any failure
leaves the pilot stopped; it never reseeds, rotates secrets or changes Identity.
