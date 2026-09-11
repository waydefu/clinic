output "apply_enabled" {
  value       = local.apply_enabled
  description = "False when exact_apply_authority_sha is not_granted."
}

output "project_id" {
  value       = var.project_id
  description = "Target isolated C1 project id. Not beauessence-clinic-staging."
}

output "terraform_ci_email" {
  value       = local.apply_enabled ? google_service_account.terraform_ci[0].email : null
  description = "WIF Terraform service account. Null while the module is a no-op."
}

output "wif_provider" {
  value       = local.apply_enabled ? google_iam_workload_identity_pool_provider.github[0].name : null
  description = "Workload identity provider resource name."
}

output "budget_pubsub_topic" {
  value       = local.apply_enabled ? google_pubsub_topic.budget[0].id : null
  description = "Budget 50/80/100 notification topic. Freeze/pause remain operator actions."
}
