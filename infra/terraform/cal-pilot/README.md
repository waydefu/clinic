# CAL-PILOT 30-day foundation candidate

Review-only until the final exact deployment confirmation. This configuration
creates service identities, least-privilege IAM, empty Secret Manager
containers, a deny-direct-browser Firestore database, a **paused** five-minute
Scheduler job and the NT$30 50/80/100% alert budget. It does not create secret
versions, Calendar ACLs, Cloud Run revisions or Hosting releases.

The first foundation plan uses the reviewed
`https://cal-pilot-worker.invalid` placeholder only because the Scheduler is
paused. It must never be resumed with that target.

The Firestore and Identity Platform resources are one-per-project. Before the
first plan, import any existing `(default)` database and Identity configuration;
never allow Terraform to replace them. State must use a reviewed encrypted
GCS backend before any apply; pass its bucket and a staging-only prefix to
`terraform init -backend-config`, and enable uniform access, public-access
prevention and object versioning on that bucket. The 30-day expiry remains an
application kill switch even if cleanup is delayed.

Release sequencing is owned by `scripts/cal-pilot-release.ps1`: after the
reviewed foundation has been applied, it accepts immutable image digests,
deploys 0% revisions, runs authenticated synthetic smoke, moves the exact
revision traffic, updates the still-paused Scheduler to the resulting private
Worker URL, publishes a 30-day Hosting preview, configures Identity Platform,
then enables the application switches and Scheduler. Secret values are piped
directly from local files or generated memory to Secret Manager and are never
Terraform inputs or outputs. The final Terraform plan must pass the exact
Worker URL so the reviewed state agrees with the release update.
