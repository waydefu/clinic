# Credential-free proof that the default SHA creates zero Google resources.
# This is not apply and not Stage F monitoring acceptance.

mock_provider "google" {}

run "default_sha_is_noop" {
  command = plan

  assert {
    condition     = local.apply_enabled == false
    error_message = "WP-B4 apply_enabled must be false when SHA is not_granted."
  }

  assert {
    condition     = length(google_pubsub_topic.application_alerts) == 0
    error_message = "WP-B4 must create zero Pub/Sub topics when SHA is not_granted."
  }

  assert {
    condition     = length(google_monitoring_notification_channel.human_email) == 0
    error_message = "WP-B4 must create zero email channels when SHA is not_granted."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.application) == 0
    error_message = "WP-B4 must create zero alert policies when SHA is not_granted."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.outbox_age) == 0
    error_message = "WP-B4 must create zero outbox-age policies when SHA is not_granted."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.iam_setiampolicy_application) == 0
    error_message = "WP-B4 must create zero IAM application policies when SHA is not_granted."
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
