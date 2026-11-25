# B-11: authority no longer controls resource existence. Existing state at
# [0] migrates to the unindexed address with zero create/update/destroy.
moved {
  from = google_service_account.terraform_ci[0]
  to   = google_service_account.terraform_ci
}

moved {
  from = google_iam_workload_identity_pool.github[0]
  to   = google_iam_workload_identity_pool.github
}

moved {
  from = google_iam_workload_identity_pool_provider.github[0]
  to   = google_iam_workload_identity_pool_provider.github
}

moved {
  from = google_logging_project_bucket_config.c1[0]
  to   = google_logging_project_bucket_config.c1
}

moved {
  from = google_pubsub_topic.budget[0]
  to   = google_pubsub_topic.budget
}

moved {
  from = google_pubsub_topic_iam_member.budget_publisher[0]
  to   = google_pubsub_topic_iam_member.budget_publisher
}

moved {
  from = google_pubsub_topic_iam_member.monitoring_publisher[0]
  to   = google_pubsub_topic_iam_member.monitoring_publisher
}

moved {
  from = google_billing_budget.c1[0]
  to   = google_billing_budget.c1
}

moved {
  from = google_monitoring_notification_channel.budget_pubsub[0]
  to   = google_monitoring_notification_channel.budget_pubsub
}

moved {
  from = google_logging_metric.iam_setiampolicy[0]
  to   = google_logging_metric.iam_setiampolicy
}

moved {
  from = google_monitoring_alert_policy.iam_setiampolicy[0]
  to   = google_monitoring_alert_policy.iam_setiampolicy
}
