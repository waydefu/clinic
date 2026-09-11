variable "exact_apply_authority_sha" {
  type        = string
  description = "Exact commit SHA named by a C6 apply packet. Default keeps this module a no-op."
  default     = "not_granted"
  validation {
    condition = (
      var.exact_apply_authority_sha == "not_granted" ||
      can(regex("^[a-f0-9]{40}$", var.exact_apply_authority_sha))
    )
    error_message = "C6 apply SHA must be not_granted or a 40-character lowercase Git SHA."
  }
}

variable "project_id" {
  type        = string
  description = "Isolated C1 project that C6 Calendar API attaches to. Suffix after beauessence-clinic-stg- is 1-7 [a-z0-9] (GCP max 30). Must not be existing staging."
  default     = "beauessence-clinic-stg-unapplied"
  validation {
    condition = (
      var.project_id != "beauessence-clinic-staging" && (
        var.project_id == "beauessence-clinic-stg-unapplied" ||
        can(regex("^beauessence-clinic-stg-[a-z0-9]{1,7}$", var.project_id))
      )
    )
    error_message = "C6 project id must be beauessence-clinic-stg- plus 1-7 lowercase alphanumeric chars (GCP max 30); beauessence-clinic-staging is not C1."
  }
}

variable "region" {
  type    = string
  default = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "C6 is approved only for asia-east1."
  }
}
