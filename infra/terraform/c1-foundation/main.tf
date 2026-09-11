locals {
  apply_enabled = var.exact_apply_authority_sha != "not_granted"
  labels = {
    application = "c1-foundation"
    data_class  = "synthetic-only"
    environment = "staging"
    slice       = "c1"
  }
  # Keep in lockstep with docs/architecture/c0-engineering-recommendations.json
  # c1.apiAllowlist. C1 must not enable Firestore, Identity Platform, Cloud Run,
  # Scheduler or Artifact Registry.
  allowed_services = toset([
    "billingbudgets.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com"
  ])
  empty_secrets = toset([
    "c1-bootstrap-reserved"
  ])
}

data "google_project" "c1" {
  count      = local.apply_enabled ? 1 : 0
  project_id = var.project_id
}

resource "google_project_service" "c1" {
  for_each           = local.apply_enabled ? local.allowed_services : toset([])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "terraform_ci" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  account_id   = "c1-terraform-ci"
  display_name = "C1 Terraform CI via WIF"
  description  = "Least-privilege CI account. No Owner/Editor. No datastore.user."
}

resource "google_iam_workload_identity_pool" "github" {
  count                     = local.apply_enabled ? 1 : 0
  project                   = var.project_id
  workload_identity_pool_id = "c1-github"
  display_name              = "C1 GitHub WIF"
  description               = "GitHub Actions OIDC for waydefu/clinic. No long-lived keys."
  depends_on                = [google_project_service.c1]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = local.apply_enabled ? 1 : 0
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "terraform_ci_wif" {
  count              = local.apply_enabled ? 1 : 0
  service_account_id = google_service_account.terraform_ci[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "terraform_ci" {
  for_each = local.apply_enabled ? toset([
    "roles/serviceusage.serviceUsageAdmin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.workloadIdentityPoolAdmin",
    "roles/resourcemanager.projectIamAdmin",
    "roles/secretmanager.admin",
    "roles/logging.admin",
    "roles/monitoring.admin",
    "roles/pubsub.admin",
    "roles/storage.admin"
  ]) : toset([])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.terraform_ci[0].email}"
}

resource "google_secret_manager_secret" "reserved" {
  for_each  = local.apply_enabled ? local.empty_secrets : toset([])
  project   = var.project_id
  secret_id = each.value
  labels    = local.labels
  replication {
    user_managed {
      replicas { location = var.region }
    }
  }
  depends_on = [google_project_service.c1]
}

resource "google_logging_project_bucket_config" "c1" {
  count          = local.apply_enabled ? 1 : 0
  project        = var.project_id
  location       = var.region
  bucket_id      = "c1-foundation"
  retention_days = 30
  depends_on     = [google_project_service.c1]
}

resource "google_pubsub_topic" "budget" {
  count      = local.apply_enabled ? 1 : 0
  project    = var.project_id
  name       = "c1-budget-notifications"
  labels     = local.labels
  depends_on = [google_project_service.c1]
}

resource "google_pubsub_topic_iam_member" "budget_publisher" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  topic   = google_pubsub_topic.budget[0].name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${data.google_project.c1[0].number}@gcp-sa-billingbudgets.iam.gserviceaccount.com"
}

resource "google_billing_budget" "c1" {
  count           = local.apply_enabled ? 1 : 0
  billing_account = var.billing_account_id
  display_name    = "C1 synthetic staging alerting budget"
  budget_filter {
    projects = ["projects/${data.google_project.c1[0].number}"]
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
  all_updates_rule {
    pubsub_topic                   = google_pubsub_topic.budget[0].id
    schema_version                 = "1.0"
    disable_default_iam_recipients = false
  }
  depends_on = [google_project_service.c1]

  lifecycle {
    precondition {
      condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account_id))
      error_message = "C1 apply requires a billing account via local tfvars; do not commit it."
    }
    precondition {
      condition     = var.project_id != "beauessence-clinic-stg-unapplied"
      error_message = "C1 apply requires a real isolated project id, not the unapplied placeholder."
    }
  }
}

resource "google_monitoring_notification_channel" "budget_pubsub" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  display_name = "C1 budget Pub/Sub"
  type         = "pubsub"
  labels = {
    topic = google_pubsub_topic.budget[0].id
  }
  depends_on = [google_project_service.c1]
}

resource "google_logging_metric" "iam_setiampolicy" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "c1-iam-setiampolicy"
  filter  = "protoPayload.methodName=\"SetIamPolicy\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
  depends_on = [google_project_service.c1]
}
