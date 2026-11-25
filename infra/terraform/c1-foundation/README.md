# C1 isolated foundation (source only)

**Not C1 PASS.** Default `exact_apply_authority_sha = not_granted` makes
`terraform plan` fail closed (a precondition on `data.google_project.c1`);
the authority never controls whether resources exist, so revoking it can
never plan a destroy (B-11; `moved.tf` migrated the old `[0]` addresses).
Existing `beauessence-clinic-staging` is
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
channel only. Email recipients stay out of the repository. Sequential C1 smoke does not require the
live policy (completed C1 evidence stays valid). Inspect with
`pnpm inspect:internal-test-monitoring`.

First apply uses human ADC (JIT ≤8h). The module then creates WIF +
`c1-terraform-ci` for later CI. No Owner/Editor, no `datastore.user`,
no secret versions.

The WIF trust is pinned to the repository name, the immutable numeric
`github_repository_id` and `github_repository_owner_id`, and the exact
`github_allowed_refs` (default `refs/heads/main`), and maps
`attribute.workflow_ref = assertion.workflow_ref`. Both ids default to
`not_granted`; a named apply SHA is rejected until the owner reads the
numeric ids from GitHub and passes them in uncommitted tfvars. Because no
GitHub Actions workflow uses WIF yet (W3-05 Q8=A),
`github_wif_binding_enabled` defaults to `false`, keeping
`google_service_account_iam_member.terraform_ci_wif` empty (zero bindings)
until an approved CI workflow explicitly opts in. In addition,
`terraform_ci_disabled` defaults to `true` to reflect the 2026-11-17
owner-approved disabled state of `c1-terraform-ci`, so `terraform plan` does
not propose re-enabling the service account; re-enabling it requires explicitly
setting `terraform_ci_disabled = false` with owner approval. Source only; the
live WIF provider, binding and service-account state are not changed by this
module until an authorized apply.

## B-01 / B-02 / NEW-10: converged CI role map (source only, not applied)

`roles/resourcemanager.projectIamAdmin` (B-01) and project-wide
`roles/storage.admin` (B-01 / NEW-10 CI sub-item) have been removed from
`google_project_iam_member.terraform_ci`. The seven remaining roles below
are the current `google_project_iam_member.terraform_ci` inventory in
`main.tf`, scoped to `var.project_id` and the created
`google_service_account.terraform_ci`. In `c1-internal-test-run`,
project-wide `roles/iam.serviceAccountUser` has also been removed from
`terraform_ci_stage_f` and replaced with per-service-account
`google_service_account_iam_member.terraform_ci_act_as_runtime` bindings on
this module's runtime accounts (`api`, `worker`, `scheduler`, `builder`,
and `calendar_sync` when enabled).

- `roles/serviceusage.serviceUsageAdmin`: API allowlist in
  `google_project_service.c1`.
- `roles/iam.serviceAccountAdmin`: CI identity and its optional WIF member
  in `google_service_account.terraform_ci` and
  `google_service_account_iam_member.terraform_ci_wif`.
  First bootstrap uses human ADC, not this CI identity.
- `roles/iam.workloadIdentityPoolAdmin`: WIF pool/provider in
  `google_iam_workload_identity_pool.github` and
  `google_iam_workload_identity_pool_provider.github`.
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

The operations above do not prove any remaining project-wide admin role
necessary for future CI actions; that necessity remains subject to owner
review. Project-wide `roles/resourcemanager.projectIamAdmin` and
`roles/storage.admin` are no longer granted in this module.

The state bucket `${PROJECT_ID}-tfstate` is created outside Terraform by
the local execution packet and is not managed by this module. The
remaining cloud-side NEW-10 item — `roles/storage.objectAdmin` held by the
default Compute Engine and Cloud Build service accounts on the tfstate
bucket — is outside Terraform management and stays with the owner for a
future authorized cloud IAM window.

The billing budget is scoped by `var.billing_account_id`, not by these project
role grants. Its first apply uses the separately authorized human bootstrap;
this table must not infer billing authority for the CI identity.

The credential-free C1 mock plan proves a revoked, empty or mismatched SHA fails the
plan, the default `github_wif_binding_enabled = false`
keeps the WIF binding at zero memberships even with a named SHA, the default
`terraform_ci_disabled = true` keeps `google_service_account.terraform_ci`
disabled even with a named SHA (requiring explicit `terraform_ci_disabled = false`
to enable), and the named-SHA
role inventory matches the seven-role manifest without `projectIamAdmin` or
project-wide `storage.admin`. Source mutation tests bind the project, role
expression and CI principal. They do not prove applied IAM state or that
every remaining broad role is necessary. Terraform 1.9.8 plan mocks leave
computed service-account emails unknown, so a source principal relation must
not be reported as a mock-resolved email.

Applying these source changes to live C1 (`beauessence-clinic-stg-c1a01`)
and remediating the unmanaged default compute / Cloud Build tfstate bucket
permissions remain owner-authorized cloud operations. Do not run an apply
from this source-only change.

See [c0-engineering-recommendations](../../../docs/architecture/c0-engineering-recommendations.md)
and the local packet
[c1-local-execution-packet.md](../../../docs/runbooks/c1-local-execution-packet.md).
