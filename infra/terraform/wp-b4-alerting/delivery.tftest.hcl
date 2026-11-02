# B-08: credential-free source proposal, never real IAM or delivery proof.
mock_provider "google" {}

variables {
  exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  project_id                = "beauessence-clinic-stg-ci"
  alert_email_address       = "fixture\u0040example.invalid"
  application_delivery = {
    project_number              = "000000000000"
    monitoring_publisher_member  = "serviceAccount:service-000000000000\u0040gcp-sa-monitoring-notification.iam.gserviceaccount.com"
    worker_member                = "serviceAccount:internal-test-outbox\u0040beauessence-clinic-stg-ci.iam.gserviceaccount.com"
    pubsub_service_agent_member = "serviceAccount:service-000000000000\u0040gcp-sa-pubsub.iam.gserviceaccount.com"
  }
}

run "default_sha_with_binding_is_still_noop" {
  command = plan
  variables {
    exact_apply_authority_sha = "not_granted"
  }
  assert {
    condition = (
      length(google_pubsub_topic.application_alerts) == 0 &&
      length(google_pubsub_topic.application_alerts_dead_letter) == 0 &&
      length(google_pubsub_subscription.application_alerts_worker) == 0 &&
      length(google_pubsub_subscription.application_alerts_dead_letter_review) == 0 &&
      length(google_pubsub_topic_iam_member.application_monitoring_publisher) == 0 &&
      length(google_pubsub_topic_iam_member.application_dead_letter_publisher) == 0 &&
      length(google_pubsub_subscription_iam_member.application_worker) == 0 &&
      length(google_pubsub_subscription_iam_member.application_dead_letter_forwarder) == 0 &&
      length(google_monitoring_notification_channel.application_pubsub) == 0
    )
    error_message = "Even explicit delivery inputs must create nothing with the default SHA."
  }
  assert {
    condition     = !output.application_delivery_pairing.configured && !output.application_delivery_pairing.runtime_verified
    error_message = "A no-op is not configured delivery or runtime proof."
  }
}

run "unconfigured_delivery_never_claims_a_working_channel" {
  command = plan
  variables {
    application_delivery = null
  }
  assert {
    condition = (
      length(google_monitoring_notification_channel.application_pubsub) == 1 &&
      length(google_monitoring_notification_channel.human_email) == 1 &&
      length(google_pubsub_subscription.application_alerts_worker) == 0 &&
      output.application_delivery_pairing.status == "UNCONFIGURED" &&
      !output.application_delivery_pairing.runtime_verified
    )
    error_message = "Missing principals must leave the application transport unconfigured, without breaking the existing email path."
  }
}

run "application_delivery_is_paired_and_least_privilege" {
  command = plan
  assert {
    condition = (
      google_pubsub_topic_iam_member.application_monitoring_publisher["application"].topic == google_pubsub_topic.application_alerts[0].name &&
      google_pubsub_topic_iam_member.application_monitoring_publisher["application"].role == "roles/pubsub.publisher" &&
      google_pubsub_topic_iam_member.application_monitoring_publisher["application"].member == var.application_delivery.monitoring_publisher_member &&
      google_pubsub_subscription.application_alerts_worker["application"].topic == google_pubsub_topic.application_alerts[0].name &&
      google_pubsub_subscription_iam_member.application_worker["application"].subscription == google_pubsub_subscription.application_alerts_worker["application"].name &&
      google_pubsub_subscription_iam_member.application_worker["application"].role == "roles/pubsub.subscriber" &&
      google_pubsub_subscription_iam_member.application_worker["application"].member == var.application_delivery.worker_member
    )
    error_message = "The explicit Monitoring publisher must publish only to the application topic; only the designated worker consumes its subscription."
  }
  assert {
    condition = (
      google_pubsub_subscription.application_alerts_worker["application"].ack_deadline_seconds == 30 &&
      google_pubsub_subscription.application_alerts_worker["application"].message_retention_duration == "604800s" &&
      google_pubsub_subscription.application_alerts_worker["application"].retry_policy[0].minimum_backoff == "10s" &&
      google_pubsub_subscription.application_alerts_worker["application"].retry_policy[0].maximum_backoff == "600s" &&
      google_pubsub_subscription.application_alerts_worker["application"].dead_letter_policy[0].max_delivery_attempts == 5 &&
      google_pubsub_subscription.application_alerts_worker["application"].dead_letter_policy[0].dead_letter_topic == "projects/${var.project_id}/topics/${google_pubsub_topic.application_alerts_dead_letter["application"].name}" &&
      google_pubsub_subscription.application_alerts_dead_letter_review["application"].topic == google_pubsub_topic.application_alerts_dead_letter["application"].name
    )
    error_message = "Pull retry, retention and dead-letter pairing must be explicit, not provider defaults."
  }
  assert {
    condition = (
      google_pubsub_topic_iam_member.application_dead_letter_publisher["application"].topic == google_pubsub_topic.application_alerts_dead_letter["application"].name &&
      google_pubsub_topic_iam_member.application_dead_letter_publisher["application"].role == "roles/pubsub.publisher" &&
      google_pubsub_topic_iam_member.application_dead_letter_publisher["application"].member == var.application_delivery.pubsub_service_agent_member &&
      google_pubsub_subscription_iam_member.application_dead_letter_forwarder["application"].subscription == google_pubsub_subscription.application_alerts_worker["application"].name &&
      google_pubsub_subscription_iam_member.application_dead_letter_forwarder["application"].role == "roles/pubsub.subscriber" &&
      google_pubsub_subscription_iam_member.application_dead_letter_forwarder["application"].member == var.application_delivery.pubsub_service_agent_member &&
      output.application_delivery_pairing.configured &&
      output.application_delivery_pairing.status == "SOURCE_ONLY_NOT_DEPLOYED" &&
      !output.application_delivery_pairing.runtime_verified
    )
    error_message = "Only the explicit Pub/Sub broker may forward to the matching DLQ; source configuration is never proof of delivery."
  }
}

run "public_publisher_is_rejected" {
  command = plan
  variables {
    application_delivery = {
      project_number              = "000000000000"
      monitoring_publisher_member  = "allUsers"
      worker_member                = "serviceAccount:internal-test-outbox\u0040beauessence-clinic-stg-ci.iam.gserviceaccount.com"
      pubsub_service_agent_member = "serviceAccount:service-000000000000\u0040gcp-sa-pubsub.iam.gserviceaccount.com"
    }
  }
  expect_failures = [var.application_delivery]
}

run "api_consumer_is_rejected" {
  command = plan
  variables {
    application_delivery = {
      project_number              = "000000000000"
      monitoring_publisher_member  = "serviceAccount:service-000000000000\u0040gcp-sa-monitoring-notification.iam.gserviceaccount.com"
      worker_member                = "serviceAccount:internal-test-api\u0040beauessence-clinic-stg-ci.iam.gserviceaccount.com"
      pubsub_service_agent_member = "serviceAccount:service-000000000000\u0040gcp-sa-pubsub.iam.gserviceaccount.com"
    }
  }
  expect_failures = [var.application_delivery]
}

run "cross_project_broker_is_rejected" {
  command = plan
  variables {
    application_delivery = {
      project_number              = "000000000000"
      monitoring_publisher_member  = "serviceAccount:service-000000000000\u0040gcp-sa-monitoring-notification.iam.gserviceaccount.com"
      worker_member                = "serviceAccount:internal-test-outbox\u0040beauessence-clinic-stg-ci.iam.gserviceaccount.com"
      pubsub_service_agent_member = "serviceAccount:service-111111111111\u0040gcp-sa-pubsub.iam.gserviceaccount.com"
    }
  }
  expect_failures = [var.application_delivery]
}
