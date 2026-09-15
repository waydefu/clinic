output "apply_enabled" {
  description = "False when exact_apply_authority_sha is not_granted."
  value       = local.apply_enabled
}

output "api_service_id" {
  description = "Isolated API Cloud Run service id."
  value       = var.api_service_id
}

output "worker_service_id" {
  description = "Isolated outbox worker Cloud Run service id."
  value       = var.worker_service_id
}

output "artifact_registry_repository" {
  description = "Intended C1 Artifact Registry repository id."
  value       = "internal-test"
}

output "execute" {
  description = "Source plans never execute."
  value       = false
}
