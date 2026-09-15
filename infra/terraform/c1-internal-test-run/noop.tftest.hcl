# Credential-free proof that the default SHA creates zero Cloud Run resources.
# This is not apply and not Stage F cloud mutation.

mock_provider "google" {}

run "default_sha_is_noop" {
  command = plan

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
}

run "named_sha_without_images_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-smoke1"
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
}

run "latest_image_is_rejected" {
  command = plan

  variables {
    api_image = "asia-east1-docker.pkg.dev/beauessence-clinic-stg-smoke1/internal-test/api:latest"
  }

  expect_failures = [
    var.api_image
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

run "wrong_region_is_rejected" {
  command = plan

  variables {
    region = "us-central1"
  }

  expect_failures = [
    var.region
  ]
}

run "production_service_name_is_rejected" {
  command = plan

  variables {
    api_service_id = "production-api"
  }

  expect_failures = [
    var.api_service_id
  ]
}
