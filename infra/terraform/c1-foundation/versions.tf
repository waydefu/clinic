terraform {
  required_version = ">= 1.8.0"

  # Bucket/prefix only at init. This module is source-only until an exact
  # SHA apply packet names them.
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}

# Billing budgets require user_project_override. Enable the C1 API
# allowlist with gcloud before apply so quota checks against this new
# project succeed and the Billing Budgets service agent exists.
provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}
