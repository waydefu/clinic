output "api_service_account" {
  value = google_service_account.api.email
}

output "worker_service_account" {
  value = google_service_account.worker.email
}

output "scheduler_service_account" {
  value = google_service_account.scheduler.email
}

output "builder_service_account" {
  value = google_service_account.builder.email
}

output "image_repository" {
  value = google_artifact_registry_repository.images.name
}

output "scheduler_job" {
  value = google_cloud_scheduler_job.sync.id
}

output "secret_containers" {
  value     = sort(keys(google_secret_manager_secret.pilot))
  sensitive = true
}
