# C1 isolated foundation (source only)

**Not C1 PASS.** Default `exact_apply_authority_sha = not_granted`
creates **zero** resources. Existing `beauessence-clinic-staging` is
rejected as `project_id`. Placeholder `beauessence-clinic-stg-unapplied`
is for validate/tests only (it is longer than GCP's 30-character
project-id limit and cannot be applied). Live ids are
`beauessence-clinic-stg-` plus 1–7 `[a-z0-9]` characters.

Do not `terraform apply` until a local packet names this directory's
exact SHA and injects billing via uncommitted tfvars. C1 still excludes
Firestore, Identity Platform, Cloud Run, Scheduler, Artifact Registry,
production, Calendar and DR secondary.

First apply uses human ADC (JIT ≤8h). The module then creates WIF +
`c1-terraform-ci` for later CI. No Owner/Editor, no `datastore.user`,
no secret versions.

See [c0-engineering-recommendations](../../../docs/architecture/c0-engineering-recommendations.md)
and the local packet
[c1-local-execution-packet.md](../../../docs/runbooks/c1-local-execution-packet.md).
