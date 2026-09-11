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

run "named_sha_enables_calendar_json_only" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
  }

  assert {
    condition     = local.apply_enabled == true
    error_message = "C6 apply_enabled must be true for a 40-character SHA."
  }

  assert {
    condition     = length(google_project_service.c6) == 1
    error_message = "C6 must enable only calendar-json.googleapis.com."
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
