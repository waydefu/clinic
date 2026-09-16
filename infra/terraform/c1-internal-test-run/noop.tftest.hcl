# Credential-free proof that the default SHA creates zero Cloud Run resources.
# This is not apply and not Stage F cloud mutation.

mock_provider "google" {}

run "default_sha_is_noop" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = ""
    api_image                 = ""
    worker_image              = ""
    secret_resource_version   = "not_granted"
  }

  assert {
    condition     = local.apply_enabled == false
    error_message = "C1 internal-test apply_enabled must be false when SHA is not_granted."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.api) == 0
    error_message = "C1 internal-test must create zero API Cloud Run services when SHA is not_granted."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.worker) == 0
    error_message = "C1 internal-test must create zero worker Cloud Run services when SHA is not_granted."
  }

  assert {
    condition     = length(google_artifact_registry_repository.internal_test) == 0
    error_message = "C1 internal-test must create zero Artifact Registry repositories when SHA is not_granted."
  }

  assert {
    condition     = length(google_project_service.stage_f) == 0
    error_message = "C1 internal-test must enable zero APIs when SHA is not_granted."
  }

  assert {
    condition     = length(google_project_iam_custom_role.api_firebaseauth_session_runtime) == 0
    error_message = "C1 internal-test must create zero Firebase Auth session custom roles when SHA is not_granted."
  }

  assert {
    condition     = length(google_project_iam_member.api_firebaseauth_session_runtime) == 0
    error_message = "C1 internal-test must grant zero Firebase Auth session bindings when SHA is not_granted."
  }

  assert {
    condition     = length(local.api_secret_env_when_mounted) == 0
    error_message = "C1 internal-test must mount zero API secrets when SHA is not_granted."
  }

  assert {
    condition     = length(local.worker_secret_env_when_mounted) == 0
    error_message = "C1 internal-test must mount zero worker secrets when SHA is not_granted."
  }
}

run "named_sha_without_images_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "1"
      CALENDAR_PILOT_MANAGER_EMAILS       = "1"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "1"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "2"
    }
  }

  expect_failures = [
    check.images_required_on_apply
  ]
}

run "named_sha_with_digest_plans_isolated_run" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image              = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "1"
      CALENDAR_PILOT_MANAGER_EMAILS       = "1"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "1"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "2"
    }
  }

  assert {
    condition     = local.apply_enabled == true
    error_message = "C1 internal-test apply_enabled must be true for a 40-character SHA."
  }

  assert {
    condition     = length(google_cloud_run_v2_service.api) == 1
    error_message = "C1 internal-test must plan the API Cloud Run service when SHA-gated apply is on."
  }

  assert {
    condition     = google_cloud_run_v2_service.api[0].name == "internal-test-api"
    error_message = "API service id must be internal-test-api."
  }

  assert {
    condition     = google_cloud_run_v2_service.api[0].location == "asia-east1"
    error_message = "API region must be asia-east1."
  }

  assert {
    condition     = google_cloud_run_v2_service.worker[0].name == "internal-test-outbox"
    error_message = "Worker service id must be internal-test-outbox."
  }

  assert {
    condition     = google_cloud_scheduler_job.outbox_drain[0].paused == true
    error_message = "Outbox scheduler must stay paused until a Stage F packet unpauses it."
  }

  assert {
    condition = contains(
      keys(google_project_service.stage_f),
      "run.googleapis.com"
    )
    error_message = "Stage F source must declare run.googleapis.com enablement."
  }

  assert {
    condition     = var.firebase_auth_domain == "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    error_message = "C1 apply plan must keep firebase_auth_domain on the authorized isolated preview host."
  }

  assert {
    condition     = !strcontains(var.firebase_auth_domain, "firebaseapp.com")
    error_message = "C1 runtime authDomain must not be firebaseapp.com."
  }

  assert {
    condition     = length(google_project_iam_custom_role.api_firebaseauth_session_runtime) == 1
    error_message = "C1 API must receive exactly one Firebase Auth session custom role when SHA-gated apply is on."
  }

  assert {
    condition     = google_project_iam_custom_role.api_firebaseauth_session_runtime[0].role_id == "clinicC1FirebaseAuthSessionRuntime"
    error_message = "C1 Firebase Auth session custom role id must be clinicC1FirebaseAuthSessionRuntime."
  }

  assert {
    condition     = google_project_iam_custom_role.api_firebaseauth_session_runtime[0].title == "Clinic C1 Firebase Auth Session Runtime"
    error_message = "C1 Firebase Auth session custom role title must remain Clinic C1 Firebase Auth Session Runtime."
  }

  assert {
    condition = toset(google_project_iam_custom_role.api_firebaseauth_session_runtime[0].permissions) == toset([
      "firebaseauth.users.get",
      "firebaseauth.users.createSession",
    ])
    error_message = "C1 Firebase Auth session custom role must contain exactly users.get and users.createSession."
  }

  assert {
    condition     = length(google_project_iam_member.api_firebaseauth_session_runtime) == 1
    error_message = "C1 API must receive exactly one Firebase Auth session custom-role binding when SHA-gated apply is on."
  }
}

run "latest_image_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = ""
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api:latest"
  }

  expect_failures = [
    var.api_image
  ]
}

run "staging_project_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = ""
    project_id                = "beauessence-clinic-staging"
  }

  expect_failures = [
    var.project_id
  ]
}

run "wrong_region_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = ""
    region                    = "us-central1"
  }

  expect_failures = [
    var.region
  ]
}

run "production_service_name_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = ""
    api_service_id            = "production-api"
  }

  expect_failures = [
    var.api_service_id
  ]
}

run "named_sha_without_auth_domain_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image              = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    firebase_auth_domain      = ""
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "1"
      CALENDAR_PILOT_MANAGER_EMAILS       = "1"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "1"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "2"
    }
  }

  expect_failures = [
    check.auth_domain_required_on_apply
  ]
}

run "firebaseapp_auth_domain_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01.firebaseapp.com"
  }

  expect_failures = [
    var.firebase_auth_domain
  ]
}

run "staging_auth_domain_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = "beauessence-clinic-staging.firebaseapp.com"
  }

  expect_failures = [
    var.firebase_auth_domain
  ]
}

run "production_auth_domain_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = "beauessence.com.tw"
  }

  expect_failures = [
    var.firebase_auth_domain
  ]
}

run "unrelated_auth_domain_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = "example.com"
  }

  expect_failures = [
    var.firebase_auth_domain
  ]
}

run "auth_domain_with_scheme_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = "https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
  }

  expect_failures = [
    var.firebase_auth_domain
  ]
}

run "current_c1_input_pins_calendar_to_explicit_approved_version" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image              = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "1"
      CALENDAR_PILOT_MANAGER_EMAILS       = "1"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "1"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "2"
    }
  }

  assert {
    condition     = var.worker_secret_versions.GOOGLE_CALENDAR_ID == "2"
    error_message = "Current C1 fixture must supply Calendar pin 2 as an explicit input."
  }

  assert {
    condition     = local.resolved_google_calendar_id_secret_version == var.worker_secret_versions.GOOGLE_CALENDAR_ID
    error_message = "Resolved Calendar secret version must equal the explicit worker input."
  }

  assert {
    condition     = local.planned_worker_secret_mount_versions["GOOGLE_CALENDAR_ID"] == var.worker_secret_versions.GOOGLE_CALENDAR_ID
    error_message = "Worker Calendar mount must use the explicit worker input pin."
  }

  assert {
    condition     = local.planned_api_secret_mount_versions["CALENDAR_PILOT_FIREBASE_WEB_API_KEY"] == "1"
    error_message = "Current C1 fixture must mount the explicit API pin, not the Calendar pin."
  }
}

run "changing_another_pin_cannot_alter_calendar" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image              = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "4"
      CALENDAR_PILOT_MANAGER_EMAILS       = "5"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "6"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "2"
    }
  }

  assert {
    condition     = local.resolved_google_calendar_id_secret_version == var.worker_secret_versions.GOOGLE_CALENDAR_ID
    error_message = "Calendar pin must remain the explicit worker input when API pins change."
  }

  assert {
    condition     = local.planned_worker_secret_mount_versions["GOOGLE_CALENDAR_ID"] == var.worker_secret_versions.GOOGLE_CALENDAR_ID
    error_message = "Changing API pins must not alter the worker Calendar mount."
  }

  assert {
    condition     = local.planned_api_secret_mount_versions["CALENDAR_PILOT_FIREBASE_WEB_API_KEY"] == "4"
    error_message = "API web-api-key mount must follow its own pin."
  }

  assert {
    condition     = local.planned_api_secret_mount_versions["CALENDAR_PILOT_MANAGER_EMAILS"] == "5"
    error_message = "API manager-allowlist mount must follow its own pin."
  }

  assert {
    condition     = local.planned_api_secret_mount_versions["CALENDAR_PILOT_FRONT_DESK_EMAILS"] == "6"
    error_message = "API front-desk-allowlist mount must follow its own pin."
  }

  assert {
    condition     = local.planned_worker_secret_mount_versions["GOOGLE_CALENDAR_ID"] != local.planned_api_secret_mount_versions["CALENDAR_PILOT_FIREBASE_WEB_API_KEY"]
    error_message = "Calendar mount version must stay independent of the API web-api-key pin."
  }
}

run "future_calendar_pin_follows_explicit_input_only" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image              = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "1"
      CALENDAR_PILOT_MANAGER_EMAILS       = "1"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "1"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "3"
    }
  }

  assert {
    condition     = var.worker_secret_versions.GOOGLE_CALENDAR_ID == "3"
    error_message = "Future-version fixture must supply Calendar pin 3 as an explicit input."
  }

  assert {
    condition     = local.resolved_google_calendar_id_secret_version == var.worker_secret_versions.GOOGLE_CALENDAR_ID
    error_message = "A later authorized Calendar rotation must resolve from the worker input only."
  }

  assert {
    condition     = local.planned_worker_secret_mount_versions["GOOGLE_CALENDAR_ID"] == var.worker_secret_versions.GOOGLE_CALENDAR_ID
    error_message = "Worker Calendar mount must follow a future explicit input without a source invariant."
  }

  assert {
    condition     = local.planned_api_secret_mount_versions["CALENDAR_PILOT_FIREBASE_WEB_API_KEY"] == "1"
    error_message = "A Calendar input change must not rewrite API secret pins."
  }
}

run "retired_shared_pin_cannot_govern_all_mounts" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image              = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    secret_resource_version   = "1"
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "4"
      CALENDAR_PILOT_MANAGER_EMAILS       = "4"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "4"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "2"
    }
  }

  assert {
    condition     = var.secret_resource_version == "1"
    error_message = "This fixture keeps the retired shared pin set to 1 to prove it cannot govern mounts."
  }

  assert {
    condition     = local.planned_worker_secret_mount_versions["GOOGLE_CALENDAR_ID"] == var.worker_secret_versions.GOOGLE_CALENDAR_ID
    error_message = "Retired secret_resource_version must not pin worker Calendar."
  }

  assert {
    condition     = local.planned_worker_secret_mount_versions["GOOGLE_CALENDAR_ID"] != var.secret_resource_version
    error_message = "Worker Calendar mount must not equal the retired shared pin."
  }

  assert {
    condition     = local.planned_api_secret_mount_versions["CALENDAR_PILOT_FIREBASE_WEB_API_KEY"] == "4"
    error_message = "API mounts must follow api_secret_versions, not the retired shared pin."
  }

  assert {
    condition     = local.planned_api_secret_mount_versions["CALENDAR_PILOT_FIREBASE_WEB_API_KEY"] != var.secret_resource_version
    error_message = "API mounts must not equal the retired shared pin."
  }
}

run "missing_calendar_pin_on_apply_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image              = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "1"
      CALENDAR_PILOT_MANAGER_EMAILS       = "1"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "1"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "not_granted"
    }
  }

  expect_failures = [
    check.secret_pins_required_on_apply
  ]

  assert {
    condition     = length(local.worker_secret_env_when_mounted) == 0
    error_message = "A missing Calendar pin must not mount GOOGLE_CALENDAR_ID."
  }
}

run "missing_api_pin_on_apply_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
    api_image                 = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    worker_image              = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/worker@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    firebase_auth_domain      = "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app"
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "not_granted"
      CALENDAR_PILOT_MANAGER_EMAILS       = "1"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "1"
    }
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "2"
    }
  }

  expect_failures = [
    check.secret_pins_required_on_apply
  ]

  assert {
    condition     = local.resolved_google_calendar_id_secret_version == var.worker_secret_versions.GOOGLE_CALENDAR_ID
    error_message = "A missing API pin must not rewrite the Calendar input."
  }
}

run "latest_calendar_pin_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = ""
    worker_secret_versions = {
      GOOGLE_CALENDAR_ID = "latest"
    }
  }

  expect_failures = [
    var.worker_secret_versions
  ]
}

run "latest_api_pin_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = ""
    api_secret_versions = {
      CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "latest"
      CALENDAR_PILOT_MANAGER_EMAILS       = "1"
      CALENDAR_PILOT_FRONT_DESK_EMAILS    = "1"
    }
  }

  expect_failures = [
    var.api_secret_versions
  ]
}

run "latest_retired_shared_pin_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "not_granted"
    firebase_auth_domain      = ""
    secret_resource_version   = "latest"
  }

  expect_failures = [
    var.secret_resource_version
  ]
}
