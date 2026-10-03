terraform {
  # 1.9 lets a variable validation refer to locals, which the blocking required
  # condition in variables.tf depends on.
  required_version = ">= 1.9.0"

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
