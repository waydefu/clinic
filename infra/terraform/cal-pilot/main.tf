locals {
  labels = {
    application = "cal-pilot"
    data_class  = "synthetic-only"
    environment = "staging"
    expires     = "30-days"
  }
  services = toset([
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbuild.googleapis.com",
    "firestore.googleapis.com",
    "identitytoolkit.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com"
  ])
  secret_access = {
    api = toset([
      "cal-pilot-manager-allowlist",
      "cal-pilot-firebase-web-api-key"
    ])
    worker = toset([
      "cal-pilot-reader-service-account",
      "cal-pilot-writer-service-account",
      "cal-pilot-source-map",
      "cal-pilot-pseudonym-key"
    ])
  }
}

data "google_project" "pilot" {
  project_id = var.project_id
}

resource "google_project_service" "required" {
  for_each           = local.services
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "cal-pilot-api"
  display_name = "CAL-PILOT synthetic API"
}

resource "google_service_account" "worker" {
  project      = var.project_id
  account_id   = "cal-pilot-worker"
  display_name = "CAL-PILOT private Calendar worker"
}

resource "google_service_account" "scheduler" {
  project      = var.project_id
  account_id   = "cal-pilot-scheduler"
  display_name = "CAL-PILOT five-minute scheduler"
}

resource "google_service_account" "builder" {
  project      = var.project_id
  account_id   = "cal-pilot-builder"
  display_name = "CAL-PILOT immutable image builder"
}

resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = "cal-pilot"
  description   = "Immutable synthetic-only CAL-PILOT images"
  format        = "DOCKER"
  labels        = local.labels
  depends_on    = [google_project_service.required]
}

resource "google_project_iam_member" "builder_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_project_iam_member" "builder_source" {
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_artifact_registry_repository_iam_member" "builder_images" {
  project    = var.project_id
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.builder.email}"
}

resource "google_project_iam_member" "api_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_identity" {
  project = var.project_id
  role    = "roles/firebaseauth.admin"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "worker_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_secret_manager_secret" "pilot" {
  for_each  = setunion(local.secret_access.api, local.secret_access.worker)
  project   = var.project_id
  secret_id = each.value
  labels    = local.labels
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each  = local.secret_access.api
  project   = var.project_id
  secret_id = google_secret_manager_secret.pilot[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "worker" {
  for_each  = local.secret_access.worker
  project   = var.project_id
  secret_id = google_secret_manager_secret.pilot[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.worker.email}"
}

resource "google_firestore_database" "pilot" {
  project                           = var.project_id
  name                              = "(default)"
  location_id                       = var.region
  type                              = "FIRESTORE_NATIVE"
  concurrency_mode                  = "PESSIMISTIC"
  app_engine_integration_mode       = "DISABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  deletion_policy                   = "ABANDON"
  depends_on                        = [google_project_service.required]
}

resource "google_cloud_scheduler_job" "sync" {
  project          = var.project_id
  region           = var.region
  name             = "cal-pilot-five-minute-sync"
  description      = "Synthetic-only Calendar sync; disabled until post-smoke release."
  schedule         = "*/5 * * * *"
  time_zone        = "Asia/Taipei"
  paused           = true
  attempt_deadline = "240s"

  retry_config {
    retry_count          = 2
    min_backoff_duration = "10s"
    max_backoff_duration = "60s"
    max_doublings        = 2
  }

  http_target {
    uri         = "${var.worker_service_url}/tasks/calendar-sync"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = var.worker_service_url
    }
  }
  depends_on = [google_project_service.required]
}

resource "google_billing_budget" "pilot" {
  billing_account = data.google_project.pilot.billing_account
  display_name    = "CAL-PILOT 30-day synthetic alert budget"
  budget_filter {
    projects = ["projects/${data.google_project.pilot.number}"]
  }
  amount {
    specified_amount {
      currency_code = "TWD"
      units         = tostring(var.budget_amount_twd)
    }
  }
  dynamic "threshold_rules" {
    for_each = toset([0.5, 0.8, 1.0])
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }
  depends_on = [google_project_service.required]
}
