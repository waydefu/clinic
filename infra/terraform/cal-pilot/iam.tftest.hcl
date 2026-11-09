# B-41: credential-free plan of today's CAL-PILOT source, not role approval.
# Computed identity/secret/repository targets are pinned by the source test;
# Terraform 1.9.8 does not resolve those computed values in a plan-only run.
mock_provider "google" {}

run "unpaused_scheduler_rejects_placeholder" {
  command = plan

  variables {
    project_id         = "synthetic-lifecycle-project"
    billing_account_id = "000000-000000-000000"
  }

  expect_failures = [google_cloud_scheduler_job.sync]
}

run "unpaused_scheduler_accepts_worker_url" {
  command = plan

  variables {
    project_id         = "synthetic-lifecycle-project"
    billing_account_id = "000000-000000-000000"
    worker_service_url = "https://cal-pilot-worker-synthetic.run.app"
  }

  assert {
    condition = (
      google_cloud_scheduler_job.sync.paused == false &&
      google_cloud_scheduler_job.sync.http_target[0].uri == "https://cal-pilot-worker-synthetic.run.app/tasks/calendar-sync"
    )
    error_message = "A valid worker URL must preserve the existing unpaused scheduler target."
  }
}

run "current_cal_pilot_iam_manifest" {
  command = plan

  variables {
    project_id         = "synthetic-iam-project"
    billing_account_id = "000000-000000-000000"
    worker_service_url = "https://cal-pilot-worker-synthetic.run.app"
  }

  assert {
    condition = toset(keys(google_project_service.required)) == toset([
      "artifactregistry.googleapis.com",
      "billingbudgets.googleapis.com",
      "cloudbuild.googleapis.com",
      "firestore.googleapis.com",
      "identitytoolkit.googleapis.com",
      "run.googleapis.com",
      "secretmanager.googleapis.com",
      "cloudscheduler.googleapis.com"
    ])
    error_message = "CAL-PILOT must retain the exact current API inventory, not an expanded service set."
  }

  assert {
    condition = (
      google_service_account.api.account_id == "cal-pilot-api" &&
      google_service_account.worker.account_id == "cal-pilot-worker" &&
      google_service_account.scheduler.account_id == "cal-pilot-scheduler" &&
      google_service_account.builder.account_id == "cal-pilot-builder"
    )
    error_message = "CAL-PILOT must retain its four documented dedicated service identities."
  }

  assert {
    condition = (
      google_project_iam_member.builder_logging.role == "roles/logging.logWriter" &&
      google_project_iam_member.builder_source.role == "roles/storage.objectViewer" &&
      google_project_iam_member.api_firestore.role == "roles/datastore.user" &&
      google_project_iam_member.api_identity.role == "roles/firebaseauth.admin" &&
      google_project_iam_member.worker_firestore.role == "roles/datastore.user" &&
      google_artifact_registry_repository_iam_member.builder_images.role == "roles/artifactregistry.writer" &&
      google_artifact_registry_repository.images.repository_id == "cal-pilot" &&
      google_artifact_registry_repository.images.project == var.project_id &&
      google_artifact_registry_repository.images.location == var.region
    )
    error_message = "Each CAL-PILOT grant must use its current role at its exact resource, not another baseline role. Broad-role necessity remains open under B-09/NEW-10."
  }

  assert {
    condition = (
      toset(keys(google_secret_manager_secret_iam_member.api)) == toset([
        "cal-pilot-manager-allowlist",
        "cal-pilot-firebase-web-api-key"
      ]) &&
      toset(keys(google_secret_manager_secret_iam_member.worker)) == toset([
        "cal-pilot-reader-service-account",
        "cal-pilot-writer-service-account",
        "cal-pilot-source-map",
        "cal-pilot-pseudonym-key"
      ]) &&
      alltrue([
        for name, secret in google_secret_manager_secret.pilot :
        secret.secret_id == name && secret.project == var.project_id
      ]) &&
      alltrue([
        for grant in concat(
          values(google_secret_manager_secret_iam_member.api),
          values(google_secret_manager_secret_iam_member.worker)
        ) : grant.role == "roles/secretmanager.secretAccessor"
      ])
    )
    error_message = "API and worker secret grants must keep their separate exact container sets and accessor-only roles. No secret values are read by this mock."
  }

  assert {
    condition = alltrue([
      for grant in concat(
        [
          google_project_iam_member.builder_logging,
          google_project_iam_member.builder_source,
          google_project_iam_member.api_firestore,
          google_project_iam_member.api_identity,
          google_project_iam_member.worker_firestore,
          google_artifact_registry_repository_iam_member.builder_images
        ],
        values(google_secret_manager_secret_iam_member.api),
        values(google_secret_manager_secret_iam_member.worker)
      ) : grant.project == var.project_id
    ])
    error_message = "Every current IAM grant must target the explicit synthetic project. Computed principal expressions are checked separately at the source boundary."
  }
}
