# B-11: authority no longer controls resource existence. Existing state at
# [0] migrates to the unindexed address with zero create/update/destroy.
moved {
  from = google_firestore_database.synthetic[0]
  to   = google_firestore_database.synthetic
}

moved {
  from = google_firestore_backup_schedule.daily[0]
  to   = google_firestore_backup_schedule.daily
}

moved {
  from = google_firestore_backup_schedule.weekly[0]
  to   = google_firestore_backup_schedule.weekly
}

moved {
  from = google_firestore_field.export_chunk_ttl[0]
  to   = google_firestore_field.export_chunk_ttl
}
