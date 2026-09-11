# Credential-free proof that the default SHA creates zero Firestore resources.
# Not C5 authority and not apply.

mock_provider "google" {}

run "default_sha_is_noop" {
  command = plan

  assert {
    condition     = local.apply_enabled == false
    error_message = "C5 apply_enabled must be false when SHA is not_granted."
  }

  assert {
    condition     = length(google_project_service.c5) == 0
    error_message = "C5 must enable zero Firestore APIs when SHA is not_granted."
  }

  assert {
    condition     = length(google_firestore_database.synthetic) == 0
    error_message = "C5 must create zero Firestore databases when SHA is not_granted."
  }
}

run "named_sha_enables_native_firestore" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
  }

  assert {
    condition     = local.apply_enabled == true
    error_message = "C5 apply_enabled must be true for a 40-character SHA."
  }

  assert {
    condition     = length(google_firestore_database.synthetic) == 1
    error_message = "C5 must create the Native Firestore database when SHA-gated apply is on."
  }

  assert {
    condition     = google_firestore_database.synthetic[0].type == "FIRESTORE_NATIVE"
    error_message = "C5 database type must be FIRESTORE_NATIVE."
  }

  assert {
    condition     = google_firestore_database.synthetic[0].location_id == "asia-east1"
    error_message = "C5 database location must be asia-east1."
  }

  assert {
    condition     = google_firestore_database.synthetic[0].point_in_time_recovery_enablement == "POINT_IN_TIME_RECOVERY_ENABLED"
    error_message = "C5 must enable point-in-time recovery."
  }

  assert {
    condition     = google_firestore_database.synthetic[0].delete_protection_state == "DELETE_PROTECTION_ENABLED"
    error_message = "C5 must enable delete protection."
  }

  assert {
    condition = contains(
      keys(google_project_service.c5),
      "firestore.googleapis.com"
    )
    error_message = "C5 must enable firestore.googleapis.com."
  }

  assert {
    condition = !contains(
      keys(google_project_service.c5),
      "calendar-json.googleapis.com"
    )
    error_message = "C5 must not enable Calendar JSON API; that is C6."
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
