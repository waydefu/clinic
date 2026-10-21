# Inert scanner fixtures: never plan or apply this directory.
# The digest below is a format fixture, not provenance for a registry image.

resource "google_cloud_run_v2_service" "synthetic_unpinned" {
  template {
    containers {
      # ruleid: clinic.terraform.literal-runtime-image-without-digest
      image = "registry.example.invalid/synthetic/api:latest"
    }
  }
}

resource "google_cloud_run_v2_service" "synthetic_pinned" {
  template {
    containers {
      # ok: clinic.terraform.literal-runtime-image-without-digest
      image = "registry.example.invalid/synthetic/api@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e"
    }
  }
}

resource "google_cloud_run_v2_service" "synthetic_dynamic" {
  template {
    containers {
      # ok: clinic.terraform.literal-runtime-image-without-digest
      image = var.synthetic_runtime_image
    }
  }
}

resource "google_compute_instance" "synthetic_non_container" {
  boot_disk {
    initialize_params {
      # ok: clinic.terraform.literal-runtime-image-without-digest
      image = "synthetic-os-image"
    }
  }
}
