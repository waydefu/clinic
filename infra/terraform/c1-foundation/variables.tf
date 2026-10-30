variable "exact_apply_authority_sha" {
  type        = string
  description = "Exact commit SHA named by a C1 apply packet. Default keeps this module a no-op."
  default     = "not_granted"
  validation {
    condition = (
      var.exact_apply_authority_sha == "not_granted" ||
      can(regex("^[a-f0-9]{40}$", var.exact_apply_authority_sha))
    )
    error_message = "C1 apply SHA must be not_granted or a 40-character lowercase Git SHA."
  }
}

variable "project_id" {
  type        = string
  description = "New isolated synthetic C1 project. GCP ids are max 30 characters, so the suffix after beauessence-clinic-stg- is 1-7 [a-z0-9]. Must not be the existing CAL-PILOT/preview project."
  default     = "beauessence-clinic-stg-unapplied"
  validation {
    condition = (
      var.project_id != "beauessence-clinic-staging" && (
        var.project_id == "beauessence-clinic-stg-unapplied" ||
        can(regex("^beauessence-clinic-stg-[a-z0-9]{1,7}$", var.project_id))
      )
    )
    error_message = "C1 project id must be beauessence-clinic-stg- plus 1-7 lowercase alphanumeric chars (GCP max 30); beauessence-clinic-staging is not C1."
  }
}

variable "region" {
  type        = string
  description = "C1 primary region."
  default     = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "C1 is approved only for asia-east1."
  }
}

variable "billing_account_id" {
  type        = string
  description = "Billing account for the C1 budget. Empty until an apply packet injects it locally. Never commit the value."
  default     = ""
  sensitive   = true
  validation {
    condition = (
      var.billing_account_id == "" ||
      can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account_id))
    )
    error_message = "billing_account_id must be empty or a Google Cloud billing account ID."
  }
}

variable "github_repository" {
  type        = string
  description = "GitHub repository allowed to impersonate the C1 Terraform WIF service account."
  default     = "waydefu/clinic"
  validation {
    condition     = var.github_repository == "waydefu/clinic"
    error_message = "C1 WIF is locked to waydefu/clinic."
  }
}

variable "github_repository_id" {
  type        = string
  description = "Immutable numeric GitHub repository id for waydefu/clinic, read by the owner from GitHub. Required before apply; never guess it."
  default     = "not_granted"
  validation {
    condition = (
      var.github_repository_id == "not_granted" ||
      can(regex("^[1-9][0-9]{0,19}$", var.github_repository_id))
    )
    error_message = "github_repository_id must be not_granted or a numeric GitHub repository id."
  }
  validation {
    condition = (
      var.exact_apply_authority_sha == "not_granted" ||
      can(regex("^[1-9][0-9]{0,19}$", var.github_repository_id))
    )
    error_message = "Applying C1 requires the numeric github_repository_id so the WIF trust is pinned to the immutable repository identity."
  }
}

variable "github_repository_owner_id" {
  type        = string
  description = "Immutable numeric GitHub owner id for the repository owner, read by the owner from GitHub. Required before apply; never guess it."
  default     = "not_granted"
  validation {
    condition = (
      var.github_repository_owner_id == "not_granted" ||
      can(regex("^[1-9][0-9]{0,19}$", var.github_repository_owner_id))
    )
    error_message = "github_repository_owner_id must be not_granted or a numeric GitHub owner id."
  }
  validation {
    condition = (
      var.exact_apply_authority_sha == "not_granted" ||
      can(regex("^[1-9][0-9]{0,19}$", var.github_repository_owner_id))
    )
    error_message = "Applying C1 requires the numeric github_repository_owner_id so the WIF trust is pinned to the immutable owner identity."
  }
}

variable "github_allowed_refs" {
  type        = list(string)
  description = "Exact Git refs allowed to impersonate the C1 Terraform service account. No wildcards."
  default     = ["refs/heads/main"]
  validation {
    condition = (
      length(var.github_allowed_refs) > 0 &&
      alltrue([
        for ref in var.github_allowed_refs :
        can(regex("^refs/(heads|tags)/[A-Za-z0-9._/-]+$", ref))
      ])
    )
    error_message = "github_allowed_refs must be a non-empty list of exact refs/heads/* or refs/tags/* names with no wildcard or quote."
  }
}

variable "budget_amount_twd" {
  type        = number
  description = "Alerting budget in TWD; not a hard spending cap and never auto-detaches billing."
  default     = 2000
  validation {
    condition     = var.budget_amount_twd == 2000
    error_message = "C1 alerting budget is NT$2000 as recorded in C0-ENG-REC."
  }
}
