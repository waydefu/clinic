# Credential-free proof that the authority SHA gates apply fail-closed and
# never controls resource existence (B-11). This is not apply and not C1 PASS.

mock_provider "google" {}

# A revoked, missing or mismatched authority must fail the plan. A failed plan
# can never contain a destroy, so revoking the SHA cannot remove resources.
run "revoked_authority_fails_closed" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    project_id                = "beauessence-clinic-stg-smoke1"
    billing_account_id        = "000000-000000-000000"
  }

  expect_failures = [
    data.google_project.c1
  ]
}

run "empty_authority_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = ""
  }

  expect_failures = [
    var.exact_apply_authority_sha
  ]
}

run "mismatched_authority_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not-a-40-character-sha"
  }

  expect_failures = [
    var.exact_apply_authority_sha
  ]
}

run "named_sha_enables_c1_allowlist_only" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-smoke1"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "123456789"
    github_repository_owner_id = "987654321"
  }

  assert {
    condition     = local.apply_enabled == true
    error_message = "C1 apply_enabled must be true for a 40-character SHA."
  }

  assert {
    condition     = length(google_project_service.c1) == 11
    error_message = "C1 must enable exactly the eleven allowlist APIs."
  }

  assert {
    condition     = google_service_account.terraform_ci.account_id == "c1-terraform-ci"
    error_message = "C1 must create the terraform-ci service account when SHA-gated apply is on."
  }

  assert {
    condition     = google_service_account.terraform_ci.disabled == true
    error_message = "C1 terraform-ci service account must default to disabled = true."
  }

  assert {
    condition = !contains(
      keys(google_project_service.c1),
      "identitytoolkit.googleapis.com"
    )
    error_message = "C1 must not enable Identity Platform."
  }

  assert {
    condition = !contains(
      keys(google_project_service.c1),
      "firestore.googleapis.com"
    )
    error_message = "C1 must not enable Firestore."
  }

  assert {
    condition = !contains(
      keys(google_project_service.c1),
      "calendar-json.googleapis.com"
    )
    error_message = "C1 must not enable Calendar JSON API; that is C6."
  }

  assert {
    condition     = google_billing_budget.c1.display_name == "C1 synthetic staging alerting budget"
    error_message = "C1 must create the NT$2000 alerting budget when SHA-gated apply is on."
  }

  assert {
    condition     = google_billing_budget.c1.amount[0].specified_amount[0].currency_code == "TWD"
    error_message = "C1 budget currency must be TWD."
  }

  assert {
    condition     = google_billing_budget.c1.amount[0].specified_amount[0].units == "2000"
    error_message = "C1 budget amount must be NT$2000."
  }

  assert {
    condition     = google_logging_project_bucket_config.c1.bucket_id == "c1-foundation"
    error_message = "C1 logging bucket must be c1-foundation."
  }

  assert {
    condition     = google_logging_project_bucket_config.c1.location == "asia-east1"
    error_message = "C1 logging bucket must be in asia-east1."
  }

  assert {
    condition     = google_iam_workload_identity_pool.github.workload_identity_pool_id == "c1-github"
    error_message = "C1 WIF pool must be c1-github."
  }

  assert {
    condition     = google_pubsub_topic_iam_member.monitoring_publisher.role == "roles/pubsub.publisher"
    error_message = "C1 must grant the Monitoring service agent Pub/Sub publisher before the notification channel."
  }

  assert {
    condition = (
      google_pubsub_topic_iam_member.budget_publisher.member ==
      "serviceAccount:billing-budget-alert@system.gserviceaccount.com"
    )
    error_message = "C1 budget Pub/Sub publisher must be billing-budget-alert@system.gserviceaccount.com, not gcp-sa-billingbudgets."
  }

  assert {
    condition     = google_monitoring_alert_policy.iam_setiampolicy.enabled == true
    error_message = "C1 must create the IAM SetIamPolicy alert when SHA-gated apply is on."
  }

  assert {
    condition     = google_monitoring_alert_policy.iam_setiampolicy.display_name == "C1 IAM SetIamPolicy"
    error_message = "C1 IAM alert display name must be C1 IAM SetIamPolicy."
  }

  assert {
    condition     = google_monitoring_alert_policy.iam_setiampolicy.combiner == "OR"
    error_message = "C1 IAM alert combiner must be OR."
  }
}

run "wif_trust_is_pinned_to_numeric_ids_and_approved_refs" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-smoke1"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "123456789"
    github_repository_owner_id = "987654321"
  }

  assert {
    condition = (
      google_iam_workload_identity_pool_provider.github.attribute_condition ==
      "assertion.repository == 'waydefu/clinic' && assertion.repository_id == '123456789' && assertion.repository_owner_id == '987654321' && assertion.ref in ['refs/heads/main']"
    )
    error_message = "C1 WIF trust must pin repository name, numeric repository id, numeric owner id and the approved ref."
  }

  assert {
    condition = (
      google_iam_workload_identity_pool_provider.github.attribute_mapping["attribute.workflow_ref"] ==
      "assertion.workflow_ref"
    )
    error_message = "C1 WIF provider must map attribute.workflow_ref to assertion.workflow_ref."
  }

  assert {
    condition     = length(google_service_account_iam_member.terraform_ci_wif) == 0
    error_message = "C1 WIF binding must default to count = 0 when github_wif_binding_enabled is false."
  }
}

run "wif_binding_requires_explicit_opt_in" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-smoke1"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "123456789"
    github_repository_owner_id = "987654321"
    github_wif_binding_enabled = true
  }

  assert {
    condition     = length(google_service_account_iam_member.terraform_ci_wif) == 1
    error_message = "C1 WIF binding must create one membership when github_wif_binding_enabled is explicitly true."
  }

  assert {
    condition     = google_service_account_iam_member.terraform_ci_wif["enabled"].role == "roles/iam.workloadIdentityUser"
    error_message = "C1 WIF binding must grant roles/iam.workloadIdentityUser only."
  }
}

run "terraform_ci_enable_requires_explicit_opt_in" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-smoke1"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "123456789"
    github_repository_owner_id = "987654321"
    terraform_ci_disabled      = false
  }

  assert {
    condition     = google_service_account.terraform_ci.account_id == "c1-terraform-ci"
    error_message = "C1 must create the terraform-ci service account when SHA-gated apply is on."
  }

  assert {
    condition     = google_service_account.terraform_ci.disabled == false
    error_message = "C1 terraform-ci service account must become enabled only when terraform_ci_disabled is explicitly set to false."
  }
}

run "named_sha_without_repository_id_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-smoke1"
    billing_account_id         = "000000-000000-000000"
    github_repository_owner_id = "987654321"
  }

  expect_failures = [
    var.github_repository_id
  ]
}

run "named_sha_without_owner_id_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    billing_account_id        = "000000-000000-000000"
    github_repository_id      = "123456789"
  }

  expect_failures = [
    var.github_repository_owner_id
  ]
}

run "non_numeric_repository_id_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-smoke1"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "waydefu"
    github_repository_owner_id = "987654321"
  }

  expect_failures = [
    var.github_repository_id
  ]
}

run "wildcard_ref_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-smoke1"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "123456789"
    github_repository_owner_id = "987654321"
    github_allowed_refs        = ["refs/heads/*"]
  }

  expect_failures = [
    var.github_allowed_refs
  ]
}

run "ci_principal_has_no_basic_or_data_or_key_roles" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-smoke1"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "123456789"
    github_repository_owner_id = "987654321"
  }

  # Pin today's converged inventory after removing projectIamAdmin and
  # project-wide storage.admin (B-01 / NEW-10).
  assert {
    condition = toset(keys(google_project_iam_member.terraform_ci)) == toset([
      "roles/serviceusage.serviceUsageAdmin",
      "roles/iam.serviceAccountAdmin",
      "roles/iam.workloadIdentityPoolAdmin",
      "roles/secretmanager.admin",
      "roles/logging.admin",
      "roles/monitoring.admin",
      "roles/pubsub.admin"
    ])
    error_message = "C1 project IAM grants must exactly match the current source inventory, with no additional or missing roles."
  }

  assert {
    condition = alltrue([
      for role, grant in google_project_iam_member.terraform_ci :
      grant.role == role && grant.project == var.project_id
    ])
    error_message = "Every C1 CI grant must use its manifest role and the isolated project."
  }

  # B-01 / B-41 / NEW-10: negative baseline. These roles must never appear.
  assert {
    condition = length(setintersection(
      toset(keys(google_project_iam_member.terraform_ci)),
      toset([
        "roles/owner",
        "roles/editor",
        "roles/viewer",
        "roles/datastore.user",
        "roles/resourcemanager.projectIamAdmin",
        "roles/storage.admin",
        "roles/iam.securityAdmin",
        "roles/iam.serviceAccountKeyAdmin",
        "roles/iam.serviceAccountTokenCreator"
      ])
    )) == 0
    error_message = "C1 Terraform CI must not hold basic, Firestore data, projectIamAdmin, project-wide storage.admin or service-account key/token roles."
  }
}

run "oversized_project_id_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-stg-replace-me"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "123456789"
    github_repository_owner_id = "987654321"
  }

  expect_failures = [
    var.project_id
  ]
}

run "staging_project_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                 = "beauessence-clinic-staging"
    billing_account_id         = "000000-000000-000000"
    github_repository_id       = "123456789"
    github_repository_owner_id = "987654321"
  }

  expect_failures = [
    var.project_id
  ]
}
