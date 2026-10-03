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

# AUD-14: the required recipient must block the plan, not just warn. Expecting
# var.* here fails with "Missing expected failure" if that validation stops
# blocking; never expect a check.* block for a required condition.
run "named_sha_without_alert_email_is_rejected" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-c1a01"
    alert_email_address       = ""
  }

  expect_failures = [
    var.alert_email_address
  ]
}
