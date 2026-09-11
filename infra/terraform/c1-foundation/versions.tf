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

provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}
