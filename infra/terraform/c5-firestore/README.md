# C5 Firestore Native (source only)

**Not C5 authority.** The default SHA fails the plan closed (precondition on
the database) and never removes resources (B-11; `moved.tf` migrated the old
`[0]` addresses). Location
`asia-east1`, PITR enabled, delete protection on, SHA-gated same-location
daily backup with 30-day retention, plus a weekly (Sunday) backup kept 14 weeks
(BACKUP-B-2026-11-15). The monthly out-of-project export (2 years) is not
implemented yet; it needs an external storage location decided first.
Synthetic data only.
Not C1. Residual database-scope IAM risk is accepted for synthetic
staging in C0-ENG-ACCEPT; runtime SA still must be dedicated and clients
remain deny-by-default. Copy `terraform.tfvars.example` locally; apply
only after C4 PASS and C5 `granted`. Local packet:
[c2-c6-local-execution-packet.md](../../../docs/runbooks/c2-c6-local-execution-packet.md).
