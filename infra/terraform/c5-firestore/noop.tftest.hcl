# Credential-free proof that the authority SHA gates apply fail-closed and
# never controls resource existence (B-11). Not C5 authority and not apply.

mock_provider "google" {}

# A revoked, missing or mismatched authority must fail the plan. A failed plan
# can never contain a destroy, so revoking the SHA cannot remove the database,
# backup schedules or TTL policy.
run "revoked_authority_fails_closed" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    project_id                = "beauessence-clinic-stg-smoke1"
  }

  expect_failures = [
    google_firestore_database.synthetic
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
    condition     = google_firestore_database.synthetic.deletion_policy == "ABANDON"
    error_message = "C5 must keep deletion_policy ABANDON."
  }

  assert {
    condition     = google_firestore_database.synthetic.type == "FIRESTORE_NATIVE"
    error_message = "C5 database type must be FIRESTORE_NATIVE."
  }

  assert {
    condition     = google_firestore_database.synthetic.location_id == "asia-east1"
    error_message = "C5 database location must be asia-east1."
  }

  assert {
    condition     = google_firestore_database.synthetic.point_in_time_recovery_enablement == "POINT_IN_TIME_RECOVERY_ENABLED"
    error_message = "C5 must enable point-in-time recovery."
  }

  assert {
    condition     = google_firestore_database.synthetic.delete_protection_state == "DELETE_PROTECTION_ENABLED"
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

  assert {
    condition     = google_firestore_backup_schedule.daily.retention == "2592000s"
    error_message = "C5 daily backup retention must be 30 days (2592000s)."
  }

  assert {
    condition     = google_firestore_backup_schedule.daily.database == "(default)"
    error_message = "C5 daily backup must target the default database."
  }

  assert {
    condition     = google_firestore_backup_schedule.weekly.retention == "8467200s"
    error_message = "C5 weekly backup retention must be 14 weeks (8467200s)."
  }

  assert {
    condition     = google_firestore_backup_schedule.weekly.database == "(default)"
    error_message = "C5 weekly backup must target the default database."
  }

  assert {
    condition     = one(google_firestore_backup_schedule.weekly.weekly_recurrence).day == "SUNDAY"
    error_message = "C5 weekly backup must run on SUNDAY."
  }

  assert {
    condition     = google_firestore_field.export_chunk_ttl.collection == "bd_export_chunks"
    error_message = "C5 export TTL must target only the export chunk collection."
  }

  assert {
    condition     = google_firestore_field.export_chunk_ttl.field == "purgeAt"
    error_message = "C5 export TTL must use the purgeAt field."
  }
}

run "oversized_project_id_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-replace-me"
  }

  expect_failures = [
    var.project_id
  ]
}

run "staging_project_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-staging"
  }

  expect_failures = [
    var.project_id
  ]
}
