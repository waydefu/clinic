# Credential-free proof that every WP-B4 policy closes after sparse log data
# recovers and sends both opening and closure notifications.

mock_provider "google" {}

run "recovery_strategy_is_bounded" {
  command = plan

  variables {
    exact_apply_authority_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    project_id                = "beauessence-clinic-stg-c1a01"
    alert_email_address       = "fixture\u0040example.invalid"
  }

  assert {
    condition = alltrue([
      for policy in google_monitoring_alert_policy.application :
      policy.conditions[0].condition_threshold[0].evaluation_missing_data == "EVALUATION_MISSING_DATA_INACTIVE"
    ])
    error_message = "Every WP-B4 application condition must close when sparse log data stops arriving."
  }

  assert {
    condition = alltrue([
      for policy in google_monitoring_alert_policy.application :
      policy.alert_strategy[0].auto_close == "1800s" &&
      length(policy.alert_strategy[0].notification_prompts) == 2 &&
      contains(policy.alert_strategy[0].notification_prompts, "OPENED") &&
      contains(policy.alert_strategy[0].notification_prompts, "CLOSED")
    ])
    error_message = "Every WP-B4 application policy must auto-close within 30 minutes and notify on open/close."
  }

  assert {
    condition = (
      google_monitoring_alert_policy.outbox_age[0].conditions[0].condition_threshold[0].evaluation_missing_data == "EVALUATION_MISSING_DATA_INACTIVE" &&
      google_monitoring_alert_policy.outbox_age[0].alert_strategy[0].auto_close == "1800s" &&
      contains(google_monitoring_alert_policy.outbox_age[0].alert_strategy[0].notification_prompts, "OPENED") &&
      contains(google_monitoring_alert_policy.outbox_age[0].alert_strategy[0].notification_prompts, "CLOSED")
    )
    error_message = "WP-B4 outbox-age recovery must be explicit and bounded."
  }

  assert {
    condition = (
      google_monitoring_alert_policy.iam_setiampolicy_application[0].conditions[0].condition_threshold[0].evaluation_missing_data == "EVALUATION_MISSING_DATA_INACTIVE" &&
      google_monitoring_alert_policy.iam_setiampolicy_application[0].alert_strategy[0].auto_close == "1800s" &&
      contains(google_monitoring_alert_policy.iam_setiampolicy_application[0].alert_strategy[0].notification_prompts, "OPENED") &&
      contains(google_monitoring_alert_policy.iam_setiampolicy_application[0].alert_strategy[0].notification_prompts, "CLOSED")
    )
    error_message = "WP-B4 IAM recovery must be explicit and bounded."
  }
}
