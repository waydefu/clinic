variable "project_id" {
  type        = string
  description = "Existing synthetic-only Firebase project."
  default     = "beauessence-clinic-staging"
}

variable "region" {
  type        = string
  description = "CAL-PILOT primary region."
  default     = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "CAL-PILOT is approved only for asia-east1."
  }
}

variable "worker_service_url" {
  type        = string
  description = "Private Cloud Run worker URL. The reviewed placeholder is safe only while the Scheduler is paused."
  default     = "https://cal-pilot-worker.invalid"
  validation {
    condition = (
      var.worker_service_url == "https://cal-pilot-worker.invalid" ||
      can(regex("^https://cal-pilot-worker-[a-z0-9-]+\\.(?:a\\.)?run\\.app$", var.worker_service_url))
    )
    error_message = "worker_service_url must be the paused placeholder or exact cal-pilot-worker Cloud Run URL."
  }
}

variable "budget_amount_twd" {
  type        = number
  description = "Alerting budget; not a hard spending cap."
  default     = 30
  validation {
    condition     = var.budget_amount_twd == 30
    error_message = "This pilot is approved with a NT$30 alerting budget only."
  }
}
