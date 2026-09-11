locals {
  apply_enabled = var.exact_apply_authority_sha != "not_granted"
}

resource "google_project_service" "c6" {
  for_each = local.apply_enabled ? toset(["calendar-json.googleapis.com"]) : toset([])
  project  = var.project_id
  service  = each.value
  disable_on_destroy = false
}
