variable "exact_apply_authority_sha" {
  type        = string
  description = "Exact commit SHA named by a Stage F apply packet. Default keeps this module a no-op."
  default     = "not_granted"
  validation {
    condition = (
      var.exact_apply_authority_sha == "not_granted" ||
      can(regex("^[a-f0-9]{40}$", var.exact_apply_authority_sha))
    )
    error_message = "C1 internal-test apply SHA must be not_granted or a 40-character lowercase Git SHA."
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
    error_message = "C1 internal-test project id must be isolated C1; beauessence-clinic-staging is refused."
  }
}

variable "region" {
  type        = string
  description = "Resolved from C1/C5 Firestore locationId. Not guessed."
  default     = "asia-east1"
  validation {
    condition     = var.region == "asia-east1"
    error_message = "C1 internal-test Cloud Run is approved only for asia-east1."
  }
}

variable "api_service_id" {
  type        = string
  description = "Exact isolated API Cloud Run service id."
  default     = "internal-test-api"
  validation {
    condition     = var.api_service_id == "internal-test-api"
    error_message = "API Cloud Run service id must remain internal-test-api."
  }
}

variable "worker_service_id" {
  type        = string
  description = "Exact isolated outbox worker Cloud Run service id."
  default     = "internal-test-outbox"
  validation {
    condition     = var.worker_service_id == "internal-test-outbox"
    error_message = "Worker Cloud Run service id must remain internal-test-outbox."
  }
}

variable "calendar_sync_service_id" {
  type        = string
  description = "Exact isolated inbound Calendar sync Cloud Run service id."
  default     = "internal-test-calendar-sync"
  validation {
    condition     = var.calendar_sync_service_id == "internal-test-calendar-sync"
    error_message = "Calendar sync Cloud Run service id must remain internal-test-calendar-sync."
  }
}

variable "api_image" {
  type        = string
  description = "Digest-pinned API image. Empty when not applying. Mutable latest is refused."
  default     = ""
  validation {
    condition = (
      var.api_image == "" || (
        can(regex("^asia-east1-docker\\.pkg\\.dev/beauessence-clinic-stg-[a-z0-9]{1,7}/internal-test/api@sha256:[a-f0-9]{64}$", var.api_image)) &&
        !strcontains(var.api_image, ":latest") &&
        !strcontains(var.api_image, "beauessence-clinic-staging") &&
        !strcontains(var.api_image, "/cal-pilot/")
      )
    )
    error_message = "API image must be empty or a digest-pinned asia-east1 internal-test/api image. latest and staging cal-pilot paths are refused."
  }
}

variable "worker_image" {
  type        = string
  description = "Digest-pinned worker image. Empty when not applying. Mutable latest is refused."
  default     = ""
  validation {
    condition = (
      var.worker_image == "" || (
        can(regex("^asia-east1-docker\\.pkg\\.dev/beauessence-clinic-stg-[a-z0-9]{1,7}/internal-test/worker@sha256:[a-f0-9]{64}$", var.worker_image)) &&
        !strcontains(var.worker_image, ":latest") &&
        !strcontains(var.worker_image, "beauessence-clinic-staging") &&
        !strcontains(var.worker_image, "/cal-pilot/")
      )
    )
    error_message = "Worker image must be empty or a digest-pinned asia-east1 internal-test/worker image. latest and staging cal-pilot paths are refused."
  }
}

variable "internal_test_booking_enabled" {
  type        = bool
  description = "Production default is fail-closed. Stage F packet may set true with an expiry."
  default     = false
}

variable "internal_test_booking_expires_at_utc" {
  type        = string
  description = "RFC3339 expiry for the internal-test booking gate. Required when enabling writes."
  default     = ""
}

variable "worker_processing_enabled" {
  type        = bool
  description = "Cloud outbox drain default is disabled so rollback can stop processing without destroying the service."
  default     = false
}

variable "worker_schedule_paused" {
  type        = bool
  description = "Cloud Scheduler default is paused. A Stage F packet may unpause."
  default     = true
}

variable "calendar_sync_enabled" {
  type        = bool
  description = "Default false. An exact-SHA Stage F packet may deploy the isolated inbound sync service."
  default     = false
}

variable "calendar_sync_prerequisites_enabled" {
  type        = bool
  description = "First-stage opt-in: create only the dedicated identity, secret container, and access bindings, without the inbound service or Scheduler."
  default     = false
}

variable "calendar_sync_schedule_paused" {
  type        = bool
  description = "Inbound sync scheduler remains paused; bounded verification invokes it explicitly."
  default     = true
  validation {
    condition     = var.calendar_sync_schedule_paused == true
    error_message = "C1 inbound Calendar scheduler must remain paused."
  }
}

variable "calendar_sync_pseudonym_secret_version" {
  type        = string
  description = "Explicit numeric Secret Manager version for the C1 candidate pseudonym key. Required only when calendar_sync_enabled."
  default     = "not_granted"
  validation {
    condition = (
      var.calendar_sync_pseudonym_secret_version == "not_granted" ||
      can(regex("^[0-9]+$", var.calendar_sync_pseudonym_secret_version))
    )
    error_message = "calendar_sync_pseudonym_secret_version must be not_granted or numeric. latest is refused."
  }
}

variable "api_secret_versions" {
  type = object({
    CALENDAR_PILOT_FIREBASE_WEB_API_KEY = string
    CALENDAR_PILOT_MANAGER_EMAILS       = string
    CALENDAR_PILOT_FRONT_DESK_EMAILS    = string
  })
  description = "Independent per-env Secret Manager version pins for C1 API mounts. Does not pin worker Calendar. not_granted skips that mount; never commit secret values."
  default = {
    CALENDAR_PILOT_FIREBASE_WEB_API_KEY = "not_granted"
    CALENDAR_PILOT_MANAGER_EMAILS       = "not_granted"
    CALENDAR_PILOT_FRONT_DESK_EMAILS    = "not_granted"
  }
  validation {
    condition = alltrue([
      for version in [
        var.api_secret_versions.CALENDAR_PILOT_FIREBASE_WEB_API_KEY,
        var.api_secret_versions.CALENDAR_PILOT_MANAGER_EMAILS,
        var.api_secret_versions.CALENDAR_PILOT_FRONT_DESK_EMAILS
      ] : version == "not_granted" || can(regex("^[0-9]+$", version))
    ])
    error_message = "Each api_secret_versions pin must be not_granted or a numeric Secret Manager version. latest is refused."
  }
}

variable "worker_secret_versions" {
  type = object({
    GOOGLE_CALENDAR_ID = string
  })
  description = "Independent per-env Secret Manager version pins for C1 worker mounts. GOOGLE_CALENDAR_ID is the Calendar pin and is not coupled to API pins. Current approved C1 input is 2; a later authorized rotation is an input change only. not_granted skips that mount; never commit secret values."
  default = {
    GOOGLE_CALENDAR_ID = "not_granted"
  }
  validation {
    condition = (
      var.worker_secret_versions.GOOGLE_CALENDAR_ID == "not_granted" ||
      can(regex("^[0-9]+$", var.worker_secret_versions.GOOGLE_CALENDAR_ID))
    )
    error_message = "worker_secret_versions.GOOGLE_CALENDAR_ID must be not_granted or a numeric Secret Manager version. latest is refused."
  }
}

variable "secret_resource_version" {
  type        = string
  description = "Retired shared pin. It is not read by any mount. Keep not_granted or omit it; set api_secret_versions and worker_secret_versions instead. Never commit secret values."
  default     = "not_granted"
  validation {
    condition = (
      var.secret_resource_version == "not_granted" ||
      can(regex("^[0-9]+$", var.secret_resource_version))
    )
    error_message = "Retired secret_resource_version must be not_granted or numeric if a local file still declares it. It cannot pin mounts; latest is refused."
  }
}

variable "firebase_auth_domain" {
  type        = string
  description = "Non-secret Firebase authDomain for isolated C1 Hosting. No scheme. Empty when not applying. Never project_id.firebaseapp.com."
  default     = ""
  validation {
    condition = (
      var.firebase_auth_domain == "" || (
        var.firebase_auth_domain == "beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app" &&
        !strcontains(var.firebase_auth_domain, "://") &&
        !strcontains(var.firebase_auth_domain, "*") &&
        !strcontains(var.firebase_auth_domain, "/") &&
        !strcontains(var.firebase_auth_domain, "firebaseapp.com") &&
        !strcontains(var.firebase_auth_domain, "beauessence-clinic-staging") &&
        !strcontains(var.firebase_auth_domain, "beauessence.com.tw")
      )
    )
    error_message = "C1 firebase_auth_domain must be empty (noop) or the exact authorized isolated Hosting host. Scheme, wildcards, firebaseapp.com, beauessence-clinic-staging, production, official clinic domains, and arbitrary hosts are refused. Do not infer from request Host."
  }
}
