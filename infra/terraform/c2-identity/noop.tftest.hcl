# Credential-free proof that the default SHA creates zero Identity resources.
# Not C2 authority and not apply.

mock_provider "google" {}

run "default_sha_is_noop" {
  command = plan

  assert {
    condition     = local.apply_enabled == false
    error_message = "C2 apply_enabled must be false when SHA is not_granted."
  }

  assert {
    condition     = length(google_project_service.c2) == 0
    error_message = "C2 must enable zero Identity APIs when SHA is not_granted."
  }
}

run "named_sha_enables_identity_only" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
  }

  assert {
    condition     = local.apply_enabled == true
    error_message = "C2 apply_enabled must be true for a 40-character SHA."
  }

  assert {
    condition     = length(google_project_service.c2) == 1
    error_message = "C2 must enable only identitytoolkit.googleapis.com."
  }

  assert {
    condition = contains(
      keys(google_project_service.c2),
      "identitytoolkit.googleapis.com"
    )
    error_message = "C2 must enable identitytoolkit.googleapis.com."
  }

  assert {
    condition = !contains(
      keys(google_project_service.c2),
      "firestore.googleapis.com"
    )
    error_message = "C2 must not enable Firestore; that is C5."
  }

  assert {
    condition = !contains(
      keys(google_project_service.c2),
      "calendar-json.googleapis.com"
    )
    error_message = "C2 must not enable Calendar JSON API; that is C6."
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
