variable "exact_apply_authority_sha" {
  type        = string
  description = "Exact commit SHA named by a Stage F apply packet. Default keeps this module a no-op."
  default     = "not_granted"
  validation {
    condition = (
      var.exact_apply_authority_sha == "not_granted" ||
      can(regex("^[a-f0-9]{40}$", var.exact_apply_authority_sha))
    )
    error_message = "WP-B4 apply SHA must be not_granted or a 40-character lowercase Git SHA."
  }
}

variable "project_id" {
  type        = string
  description = "Isolated synthetic C1 project. Must not be beauessence-clinic-staging."
  default     = "beauessence-clinic-stg-unapplied"
  validation {
    condition = (
      var.project_id != "beauessence-clinic-staging" && (
        var.project_id == "beauessence-clinic-stg-unapplied" ||
        can(regex("^beauessence-clinic-stg-[a-z0-9]{1,7}$", var.project_id))
      )
    )
    error_message = "WP-B4 project id must be isolated C1; beauessence-clinic-staging is refused."
  }
}

variable "region" {
  type        = string
  description = "Primary region."
  default     = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "WP-B4 alerting is approved only for asia-east1."
  }
}

variable "alert_email_address" {
  type        = string
  description = "Human email from local tfvar or secret. Never commit the value. Required when applying."
  default     = ""
  sensitive   = true
  validation {
    condition = (
      var.alert_email_address == "" ||
      can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email_address))
    )
    error_message = "alert_email_address must be empty in git or a single email supplied via local tfvar/secret."
  }
  # Required condition (blocking): naming a SHA to apply needs the recipient.
  validation {
    condition     = !local.apply_enabled || var.alert_email_address != ""
    error_message = "Applying WP-B4 requires alert_email_address from secret/tfvar. Recipients never land in git."
  }
}

# Optional source proposal. Values must be explicitly supplied and confirmed by
# an authorized operator later; format checks do not confirm real identities.
variable "application_delivery" {
  type = object({
    project_number              = string
    monitoring_publisher_member = string
    worker_member               = string
    pubsub_service_agent_member = string
  })
  description = "Explicit application delivery identities; null leaves transport unconfigured. No discovery or principal guessing."
  default     = null
  validation {
    condition = var.application_delivery == null || try(alltrue([
      can(regex("^[0-9]+$", var.application_delivery.project_number)),
      var.application_delivery.monitoring_publisher_member == "serviceAccount:service-${var.application_delivery.project_number}@gcp-sa-monitoring-notification.iam.gserviceaccount.com",
      var.application_delivery.pubsub_service_agent_member == "serviceAccount:service-${var.application_delivery.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com",
      var.application_delivery.worker_member == "serviceAccount:internal-test-outbox@${var.project_id}.iam.gserviceaccount.com"
    ]), false)
    error_message = "Application delivery needs explicit same-project Monitoring/PubSub agents and the isolated worker, never a public, API or unrelated principal. Format is not identity confirmation."
  }
}
