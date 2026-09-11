# Credential-free proof that the default SHA creates zero Calendar API resources.
# Not C6 authority, not production Calendar, and not apply.

mock_provider "google" {}

run "default_sha_is_noop" {
  command = plan

  assert {
    condition     = local.apply_enabled == false
    error_message = "C6 apply_enabled must be false when SHA is not_granted."
  }

  assert {
    condition     = length(google_project_service.c6) == 0
    error_message = "C6 must enable zero Calendar APIs when SHA is not_granted."
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
