locals {
  apply_enabled = var.exact_apply_authority_sha != "not_granted"
  mount_secrets = local.apply_enabled && var.secret_resource_version != "not_granted"
  labels = {
    application = "c1-internal-test-run"
    data_class  = "synthetic-only"
    environment = "staging"
    slice       = "stage-f"
  }
  required_services = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudscheduler.googleapis.com"
  ])
  # c1-calendar-service-account-json is a leftover empty container from the
  # key-JSON attempt. It is not mounted. Stage F worker auth is CLOUD_ADC.
  runtime_secrets = toset([
    "c1-staff-firebase-web-api-key",
    "c1-staff-manager-allowlist",
    "c1-staff-front-desk-allowlist",
    "c1-calendar-service-account-json",
    "c1-synthetic-calendar-id"
  ])
  api_secret_env = {
    CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "c1-staff-firebase-web-api-key"
    CALENDAR_PILOT_MANAGER_EMAILS       = "c1-staff-manager-allowlist"
    CALENDAR_PILOT_FRONT_DESK_EMAILS    = "c1-staff-front-desk-allowlist"
  }
  worker_secret_env = {
    GOOGLE_CALENDAR_ID = "c1-synthetic-calendar-id"
  }
  api_secret_env_when_mounted    = local.mount_secrets ? local.api_secret_env : {}
  worker_secret_env_when_mounted = local.mount_secrets ? local.worker_secret_env : {}
}

check "images_required_on_apply" {
  assert {
    condition = !local.apply_enabled || (
      var.api_image != "" &&
      var.worker_image != "" &&
      strcontains(var.api_image, var.project_id) &&
      strcontains(var.worker_image, var.project_id)
    )
    error_message = "Applying C1 internal-test Cloud Run requires digest-pinned api_image and worker_image for this project_id."
  }
}

check "booking_expiry_required_when_enabled" {
  assert {
    condition     = !var.internal_test_booking_enabled || var.internal_test_booking_expires_at_utc != ""
    error_message = "Enabling isolated booking writes requires INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC."
  }
}

check "auth_domain_required_on_apply" {
  assert {
    condition = !local.apply_enabled || (
      var.firebase_auth_domain != "" &&
      !strcontains(var.firebase_auth_domain, "firebaseapp.com")
    )
    error_message = "Applying C1 internal-test Cloud Run requires firebase_auth_domain set to an authorized isolated Hosting host. There is no fallback to project_id.firebaseapp.com."
  }
}

resource "google_project_service" "stage_f" {
  for_each           = local.apply_enabled ? local.required_services : toset([])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "internal_test" {
  count         = local.apply_enabled ? 1 : 0
  project       = var.project_id
  location      = var.region
  repository_id = "internal-test"
  description   = "Immutable SHA-tagged isolated internal-test images"
  format        = "DOCKER"
  labels        = local.labels
  depends_on    = [google_project_service.stage_f]
}

resource "google_service_account" "api" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  account_id   = "internal-test-api"
  display_name = "Isolated internal-test API"
  description  = "Least privilege runtime. No Owner/Editor. Public booking stays accountless at the API layer."
}

resource "google_service_account" "worker" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  account_id   = "internal-test-outbox"
  display_name = "Isolated internal-test outbox worker"
  description  = "Calendar projection worker. No unauthenticated invoke. No production Calendar."
}

resource "google_service_account" "scheduler" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  account_id   = "internal-test-scheduler"
  display_name = "Isolated internal-test outbox scheduler"
}

resource "google_service_account" "builder" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  account_id   = "internal-test-builder"
  display_name = "Isolated internal-test image builder"
}

resource "google_project_iam_member" "api_firestore" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.api[0].email}"
}

resource "google_project_iam_member" "worker_firestore" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.worker[0].email}"
}

resource "google_project_iam_member" "builder_logging" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.builder[0].email}"
}

resource "google_artifact_registry_repository_iam_member" "builder_images" {
  count      = local.apply_enabled ? 1 : 0
  project    = var.project_id
  location   = google_artifact_registry_repository.internal_test[0].location
  repository = google_artifact_registry_repository.internal_test[0].name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.builder[0].email}"
}

resource "google_artifact_registry_repository_iam_member" "runtime_images" {
  for_each = local.apply_enabled ? {
    api    = google_service_account.api[0].email
    worker = google_service_account.worker[0].email
  } : {}
  project    = var.project_id
  location   = google_artifact_registry_repository.internal_test[0].location
  repository = google_artifact_registry_repository.internal_test[0].name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${each.value}"
}

resource "google_project_iam_member" "terraform_ci_stage_f" {
  for_each = local.apply_enabled ? toset([
    "roles/run.admin",
    "roles/artifactregistry.admin",
    "roles/cloudscheduler.admin",
    "roles/iam.serviceAccountUser"
  ]) : toset([])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:c1-terraform-ci@${var.project_id}.iam.gserviceaccount.com"
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = local.apply_enabled ? local.runtime_secrets : toset([])
  project   = var.project_id
  secret_id = each.value
  labels    = local.labels
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each  = local.apply_enabled ? local.api_secret_env_when_mounted : {}
  project   = var.project_id
  secret_id = google_secret_manager_secret.runtime[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api[0].email}"
}

resource "google_secret_manager_secret_iam_member" "worker" {
  for_each  = local.apply_enabled ? local.worker_secret_env_when_mounted : {}
  project   = var.project_id
  secret_id = google_secret_manager_secret.runtime[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker[0].email}"
}

resource "google_cloud_run_v2_service" "api" {
  count               = local.apply_enabled ? 1 : 0
  project             = var.project_id
  name                = var.api_service_id
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true
  labels              = local.labels
  depends_on          = [google_project_service.stage_f]

  template {
    service_account                  = google_service_account.api[0].email
    timeout                          = "60s"
    max_instance_request_concurrency = 80
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    containers {
      name  = "api"
      image = var.api_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      startup_probe {
        http_get {
          path = "/v1/health/live"
          port = 8080
        }
        period_seconds    = 10
        timeout_seconds   = 3
        failure_threshold = 12
      }
      liveness_probe {
        http_get {
          path = "/v1/health/live"
          port = 8080
        }
        period_seconds  = 20
        timeout_seconds = 3
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "HOST"
        value = "0.0.0.0"
      }
      # Cloud Run v2 reserves PORT and injects it from container_port.
      env {
        name  = "ALLOW_NON_LOOPBACK_BIND"
        value = "true"
      }
      env {
        name  = "TRUSTED_PROXY_HOPS"
        value = "1"
      }
      env {
        name  = "INTERNAL_TEST_BOOKING_ENABLED"
        value = var.internal_test_booking_enabled ? "true" : "false"
      }
      env {
        name  = "INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC"
        value = var.internal_test_booking_expires_at_utc
      }
      env {
        name  = "INTERNAL_TEST_SOURCE_SHA"
        value = var.exact_apply_authority_sha
      }
      env {
        name  = "CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN"
        value = var.firebase_auth_domain
      }
      dynamic "env" {
        for_each = local.apply_enabled ? local.api_secret_env_when_mounted : {}
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[env.value].secret_id
              version = var.secret_resource_version
            }
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    # Firebase Hosting pinTag adds a tagged 0% revision. Do not strip it.
    ignore_changes = [traffic]
  }
}

resource "google_cloud_run_v2_service" "worker" {
  count               = local.apply_enabled ? 1 : 0
  project             = var.project_id
  name                = var.worker_service_id
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true
  labels              = local.labels
  depends_on          = [google_project_service.stage_f]

  # Scheduler OIDC hits run.app. IAM grants only the scheduler SA
  # run.invoker. Unauthenticated drain remains denied.

  template {
    service_account                  = google_service_account.worker[0].email
    timeout                          = "240s"
    max_instance_request_concurrency = 1
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      name  = "worker"
      image = var.worker_image
      ports {
        container_port = 8080
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
      startup_probe {
        http_get {
          path = "/live"
          port = 8080
        }
        period_seconds    = 10
        timeout_seconds   = 3
        failure_threshold = 12
      }
      liveness_probe {
        http_get {
          path = "/live"
          port = 8080
        }
        period_seconds  = 20
        timeout_seconds = 3
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "HOST"
        value = "0.0.0.0"
      }
      # Cloud Run v2 reserves PORT and injects it from container_port.
      env {
        name  = "INTERNAL_TEST_OUTBOX_EXECUTION"
        value = "cloud"
      }
      env {
        name  = "INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED"
        value = var.worker_processing_enabled ? "true" : "false"
      }
      env {
        name  = "GOOGLE_CALENDAR_INTEGRATION_MODE"
        value = "test"
      }
      env {
        name  = "GOOGLE_CALENDAR_AUTH"
        value = "CLOUD_ADC"
      }
      env {
        name  = "INTERNAL_TEST_SOURCE_SHA"
        value = var.exact_apply_authority_sha
      }
      dynamic "env" {
        for_each = local.apply_enabled ? local.worker_secret_env_when_mounted : {}
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[env.value].secret_id
              version = var.secret_resource_version
            }
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [traffic]
  }
}

resource "google_cloud_run_v2_service_iam_member" "api_hosting_invoke" {
  count    = local.apply_enabled ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "worker_scheduler_invoke" {
  count    = local.apply_enabled ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.worker[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler[0].email}"
}

resource "google_cloud_scheduler_job" "outbox_drain" {
  count            = local.apply_enabled ? 1 : 0
  project          = var.project_id
  region           = var.region
  name             = "internal-test-outbox-drain"
  description      = "Isolated outbox drain; paused until a Stage F packet unpauses processing."
  schedule         = "* * * * *"
  time_zone        = "UTC"
  paused           = var.worker_schedule_paused
  attempt_deadline = "240s"
  retry_config {
    retry_count          = 2
    min_backoff_duration = "10s"
    max_backoff_duration = "60s"
    max_doublings        = 2
  }
  http_target {
    uri         = "${google_cloud_run_v2_service.worker[0].uri}/tasks/outbox-drain"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.scheduler[0].email
      audience              = google_cloud_run_v2_service.worker[0].uri
    }
  }
  depends_on = [google_project_service.stage_f]
}
