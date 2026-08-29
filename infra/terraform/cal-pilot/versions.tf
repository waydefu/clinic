terraform {
  required_version = ">= 1.8.0"

  # The bucket and prefix are supplied only at init time so this reusable
  # candidate never hard-codes an environment or allows local apply state.
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
