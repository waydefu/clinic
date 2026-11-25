output "apply_enabled" {
  value       = local.apply_enabled
  description = "False when exact_apply_authority_sha is not_granted."
}

output "project_id" {
  value       = var.project_id
  description = "Target isolated C1 project id. Not beauessence-clinic-staging."
}

output "terraform_ci_email" {
  value       = google_service_account.terraform_ci.email
  description = "WIF Terraform service account. Resource always exists; authority only gates apply."
}

output "wif_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Workload identity provider resource name."
}

output "budget_pubsub_topic" {
  value       = google_pubsub_topic.budget.id
  description = "Budget 50/80/100 notification topic. Freeze/pause remain operator actions."
}
