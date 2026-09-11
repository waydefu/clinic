locals {
  apply_enabled = var.exact_apply_authority_sha != "not_granted"
  allowed_services = toset([
    "identitytoolkit.googleapis.com"
  ])
}

resource "google_project_service" "c2" {
  for_each           = local.apply_enabled ? local.allowed_services : toset([])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
