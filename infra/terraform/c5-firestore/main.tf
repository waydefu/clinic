locals {
  apply_enabled = var.exact_apply_authority_sha != "not_granted"
}

resource "google_project_service" "c5" {
  for_each           = local.apply_enabled ? toset(["firestore.googleapis.com"]) : toset([])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_firestore_database" "synthetic" {
  count                             = local.apply_enabled ? 1 : 0
  project                           = var.project_id
  name                              = "(default)"
  location_id                       = var.region
  type                              = "FIRESTORE_NATIVE"
  concurrency_mode                  = "PESSIMISTIC"
  app_engine_integration_mode       = "DISABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  deletion_policy                   = "ABANDON"
  depends_on                        = [google_project_service.c5]
}

# C0-ENG-REC necessary baseline: same-location daily backup, 30-day retention.
# PITR is the 7-day window on the database. This schedule is SHA-gated; default
# SHA creates zero backups. Apply still needs a fresh exact-SHA packet.
resource "google_firestore_backup_schedule" "daily" {
  count      = local.apply_enabled ? 1 : 0
  project    = var.project_id
  database   = "(default)"
  retention  = "2592000s"
  daily_recurrence {}
  depends_on = [google_firestore_database.synthetic]
}
