locals {
  apply_enabled = var.exact_apply_authority_sha != "not_granted"
  labels = {
    application = "wp-b4-alerting"
    data_class  = "synthetic-only"
    environment = "staging"
    slice       = "wp-b4"
  }
}

check "email_required_on_apply" {
  assert {
    condition     = !local.apply_enabled || var.alert_email_address != ""
    error_message = "Applying WP-B4 requires alert_email_address from secret/tfvar. Recipients never land in git."
  }
}

resource "google_pubsub_topic" "application_alerts" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "c1-application-alerts"
  labels  = local.labels
}

resource "google_monitoring_notification_channel" "application_pubsub" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  display_name = "WP-B4 application Pub/Sub"
  type         = "pubsub"
  labels = {
    topic = google_pubsub_topic.application_alerts[0].id
  }
}

resource "google_monitoring_notification_channel" "human_email" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  display_name = "WP-B4 human email"
  type         = "email"
  labels = {
    email_address = var.alert_email_address
  }
}

resource "google_logging_metric" "http_5xx" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "wp-b4-http-5xx"
  filter  = "jsonPayload.errorCode=\"INTERNAL_ERROR\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "booking_write_failure" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "wp-b4-booking-write-failure"
  filter  = "jsonPayload.operation=\"POST_v1_bookings\" AND jsonPayload.result=\"error\" AND jsonPayload.errorCode!=\"SERVICE_UNAVAILABLE\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "booking_transaction_failure" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "wp-b4-booking-transaction-failure"
  filter  = "jsonPayload.errorCode=\"SLOT_UNAVAILABLE\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "backup_failure" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "wp-b4-backup-failure"
  filter  = "jsonPayload.errorCode=\"BACKUP_FAILED\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "outbox_dead_letter" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "wp-b4-outbox-dead-letter"
  filter  = "jsonPayload.retryState=\"dead_lettered\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "auth_failure" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "wp-b4-auth-failure"
  filter  = "jsonPayload.errorCode=\"AUTHENTICATION_REQUIRED\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "authz_denial" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "wp-b4-authz-denial"
  filter  = "jsonPayload.errorCode=\"AUTHORIZATION_DENIED\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

locals {
  application_policies = local.apply_enabled ? {
    http_5xx = {
      display_name = "WP-B4 API 5xx burst"
      metric       = google_logging_metric.http_5xx[0].name
      threshold    = 3
    }
    booking_write = {
      display_name = "WP-B4 durable booking write failure"
      metric       = google_logging_metric.booking_write_failure[0].name
      threshold    = 3
    }
    booking_tx = {
      display_name = "WP-B4 Firestore transaction failure"
      metric       = google_logging_metric.booking_transaction_failure[0].name
      threshold    = 3
    }
    backup = {
      display_name = "WP-B4 backup failure"
      metric       = google_logging_metric.backup_failure[0].name
      threshold    = 1
    }
    dead_letter = {
      display_name = "WP-B4 outbox dead-letter"
      metric       = google_logging_metric.outbox_dead_letter[0].name
      threshold    = 1
    }
    auth_failure = {
      display_name = "WP-B4 auth failure spike"
      metric       = google_logging_metric.auth_failure[0].name
      threshold    = 10
    }
    authz_denial = {
      display_name = "WP-B4 authorization denial spike"
      metric       = google_logging_metric.authz_denial[0].name
      threshold    = 10
    }
  } : {}
}

resource "google_logging_metric" "outbox_oldest_age" {
  count   = local.apply_enabled ? 1 : 0
  project = var.project_id
  name    = "wp-b4-outbox-oldest-age"
  filter  = "jsonPayload.oldestPendingAgeSeconds>=0"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "DISTRIBUTION"
    unit        = "s"
  }
  value_extractor = "EXTRACT(jsonPayload.oldestPendingAgeSeconds)"
  bucket_options {
    exponential_buckets {
      num_finite_buckets = 16
      growth_factor      = 2
      scale              = 1
    }
  }
}

resource "google_monitoring_alert_policy" "application" {
  for_each     = local.apply_enabled ? local.application_policies : {}
  project      = var.project_id
  display_name = each.value.display_name
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.application_pubsub[0].name,
    google_monitoring_notification_channel.human_email[0].name
  ]
  conditions {
    display_name = "${each.value.display_name} threshold"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${each.value.metric}\" AND resource.type=\"global\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.threshold - 1
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_DELTA"
      }
      trigger {
        count = 1
      }
    }
  }
  documentation {
    content   = "WP-B4 application alert. Recipients are not stored in git. HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED until Stage F delivery proof."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "outbox_age" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  display_name = "WP-B4 excessive outbox age"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.application_pubsub[0].name,
    google_monitoring_notification_channel.human_email[0].name
  ]
  conditions {
    display_name = "WP-B4 excessive outbox age threshold"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.outbox_oldest_age[0].name}\" AND resource.type=\"global\""
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 59
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_PERCENTILE_99"
      }
      trigger {
        count = 1
      }
    }
  }
  documentation {
    content   = "Outbox oldest age remains 60 seconds. Do not relax to 5 minutes. Recipients are not stored in git."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "iam_setiampolicy_application" {
  count        = local.apply_enabled ? 1 : 0
  project      = var.project_id
  display_name = "WP-B4 IAM SetIamPolicy"
  combiner     = "OR"
  enabled      = true
  notification_channels = [
    google_monitoring_notification_channel.application_pubsub[0].name,
    google_monitoring_notification_channel.human_email[0].name
  ]
  conditions {
    display_name = "WP-B4 IAM SetIamPolicy threshold"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/c1-iam-setiampolicy\" AND resource.type=\"global\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_DELTA"
      }
      trigger {
        count = 1
      }
    }
  }
  documentation {
    content   = "Additional application notification path. Reuses the existing C1 log metric c1-iam-setiampolicy. Do not destroy the C1 budget Pub/Sub path."
    mime_type = "text/markdown"
  }
}
