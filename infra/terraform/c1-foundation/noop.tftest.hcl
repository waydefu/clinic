# Credential-free proof that the default SHA creates zero Google resources.
# This is not apply and not C1 PASS.

mock_provider "google" {}

run "default_sha_is_noop" {
  command = plan

  assert {
    condition     = local.apply_enabled == false
    error_message = "C1 apply_enabled must be false when SHA is not_granted."
  }

  assert {
    condition     = length(google_project_service.c1) == 0
    error_message = "C1 must create zero project services when SHA is not_granted."
  }

  assert {
    condition     = length(google_service_account.terraform_ci) == 0
    error_message = "C1 must create zero service accounts when SHA is not_granted."
  }

  assert {
    condition     = length(google_iam_workload_identity_pool.github) == 0
    error_message = "C1 must create zero WIF pools when SHA is not_granted."
  }

  assert {
    condition     = length(google_secret_manager_secret.reserved) == 0
    error_message = "C1 must create zero secrets when SHA is not_granted."
  }

  assert {
    condition     = length(google_billing_budget.c1) == 0
    error_message = "C1 must create zero budgets when SHA is not_granted."
  }
}

run "named_sha_enables_c1_allowlist_only" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    billing_account_id        = "000000-000000-000000"
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
    condition     = length(google_service_account.terraform_ci) == 1
    error_message = "C1 must create the terraform-ci service account when SHA-gated apply is on."
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
    condition     = length(google_billing_budget.c1) == 1
    error_message = "C1 must create the NT$2000 alerting budget when SHA-gated apply is on."
  }

  assert {
    condition     = google_billing_budget.c1[0].amount[0].specified_amount[0].currency_code == "TWD"
    error_message = "C1 budget currency must be TWD."
  }

  assert {
    condition     = google_billing_budget.c1[0].amount[0].specified_amount[0].units == "2000"
    error_message = "C1 budget amount must be NT$2000."
  }

  assert {
    condition     = google_logging_project_bucket_config.c1[0].bucket_id == "c1-foundation"
    error_message = "C1 logging bucket must be c1-foundation."
  }

  assert {
    condition     = google_logging_project_bucket_config.c1[0].location == "asia-east1"
    error_message = "C1 logging bucket must be in asia-east1."
  }

  assert {
    condition     = google_iam_workload_identity_pool.github[0].workload_identity_pool_id == "c1-github"
    error_message = "C1 WIF pool must be c1-github."
  }
}

run "oversized_project_id_is_rejected" {
  command = plan

  variables {
    project_id = "beauessence-clinic-stg-replace-me"
  }

  expect_failures = [
    var.project_id
  ]
}

run "staging_project_is_rejected" {
  command = plan

  variables {
    project_id = "beauessence-clinic-staging"
  }

  expect_failures = [
    var.project_id
  ]
}
