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

run "staging_project_is_rejected" {
  command = plan

  variables {
    project_id = "beauessence-clinic-staging"
  }

  expect_failures = [
    var.project_id
  ]
}
