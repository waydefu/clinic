# C1 isolated foundation (source only)

**Not C1 PASS.** Default `exact_apply_authority_sha = not_granted`
creates **zero** resources. Existing `beauessence-clinic-staging` is
rejected as `project_id`. Placeholder `beauessence-clinic-stg-unapplied`
is for validate/tests only (it is longer than GCP's 30-character
project-id limit and cannot be applied). Live ids are
`beauessence-clinic-stg-` plus 1–7 `[a-z0-9]` characters.

Do not `terraform apply` until a local packet names this directory's
exact SHA and injects billing via uncommitted tfvars. C1 still excludes
Firestore, Identity Platform, Cloud Run, Scheduler, Artifact Registry,
production, Calendar and DR secondary.

SHA-gated `google_monitoring_alert_policy.iam_setiampolicy` fires on the
existing `c1-iam-setiampolicy` log metric and notifies the budget Pub/Sub
channel only. Email recipients stay out of the repository. Default SHA
creates zero alert policies. Sequential C1 smoke does not require the
live policy (completed C1 evidence stays valid). Inspect with
`pnpm inspect:internal-test-monitoring`.

First apply uses human ADC (JIT ≤8h). The module then creates WIF +
`c1-terraform-ci` for later CI. No Owner/Editor, no `datastore.user`,
no secret versions.

The WIF trust is pinned to the repository name, the immutable numeric
`github_repository_id` and `github_repository_owner_id`, and the exact
`github_allowed_refs` (default `refs/heads/main`). Both ids default to
`not_granted`; a named apply SHA is rejected until the owner reads the
numeric ids from GitHub and passes them in uncommitted tfvars. Source only;
the live WIF provider is not changed by this module until that apply.

## B-01: current role-to-operation map (not least-privilege approval)

All nine roles below are the current `google_project_iam_member.terraform_ci`
inventory in `main.tf`, scoped to `var.project_id` and the created
`google_service_account.terraform_ci`. This maps declared operations, not
Google permission sufficiency or necessity. No grant is added, removed or
applied by this review.

- `roles/serviceusage.serviceUsageAdmin`: API allowlist in
  `google_project_service.c1`.
- `roles/iam.serviceAccountAdmin`: CI identity and its WIF member in
  `google_service_account.terraform_ci` and
  `google_service_account_iam_member.terraform_ci_wif`.
  First bootstrap uses human ADC, not this CI identity.
- `roles/iam.workloadIdentityPoolAdmin`: WIF pool/provider in
  `google_iam_workload_identity_pool.github` and
  `google_iam_workload_identity_pool_provider.github`.
- `roles/resourcemanager.projectIamAdmin`: the current project grants in
  `google_project_iam_member.terraform_ci`. Self-management is a declared
  operation, not approval of continuing project-wide IAM administration.
- `roles/secretmanager.admin`: empty container in
  `google_secret_manager_secret.reserved`. No secret version is owned here;
  container management does not prove the full admin role necessary.
- `roles/logging.admin`: `google_logging_project_bucket_config.c1` and
  `google_logging_metric.iam_setiampolicy`.
- `roles/monitoring.admin`: `google_monitoring_notification_channel.budget_pubsub`
  and `google_monitoring_alert_policy.iam_setiampolicy`; existing Pub/Sub
  notification only.
- `roles/pubsub.admin`: `google_pubsub_topic.budget` and its two publisher
  IAM members.
- `roles/storage.admin`: `versions.tf` GCS backend. The local packet creates
  `${PROJECT_ID}-tfstate` before Terraform and initializes prefix
  `c1-foundation`. The state bucket is not a resource in this module.
  Its existence, bucket-scoped permissions and later CI's need for
  project-wide storage administration are not proven.

The operations above do not prove any full project-wide admin role necessary
for the approved later CI actions; that necessity remains unverified for all
nine roles.

The billing budget is scoped by `var.billing_account_id`, not by these project
role grants. Its first apply uses the separately authorized human bootstrap;
this table must not infer billing authority for the CI identity.

The credential-free C1 mock plan proves the default SHA creates zero project
IAM members and the named-SHA role inventory matches the current manifest.
Source mutation tests bind the project, role expression and CI principal.
They do not prove applied IAM state or that every broad role is necessary.
Terraform 1.9.8 plan mocks leave computed service-account emails unknown, so a
source principal relation must not be reported as a mock-resolved email.

B-01 remains open for infrastructure-owner review of the exact later CI
operations, backend bucket scope and separately authorized runtime evidence.
Do not invent replacement roles/buckets, run an apply, or treat the current
smoke role list as least-privilege approval. This is technical evidence, not a
new business-policy question.

See [c0-engineering-recommendations](../../../docs/architecture/c0-engineering-recommendations.md)
and the local packet
[c1-local-execution-packet.md](../../../docs/runbooks/c1-local-execution-packet.md).
