# WP-B4 application monitoring (source only)

This directory is the exact resource plan for Stage E. It is **not**
applied. `HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED` is the
maximum honest status until Stage F has exact-SHA authority and a real
inbox proof.

- [wp-b4-alert-policies.json](wp-b4-alert-policies.json) — immediate
  catalog aligned with `packages/domain/src/observability.ts`
- [notification-path.json](notification-path.json) — alert → Pub/Sub +
  email channel → human. Recipient addresses stay in secret/tfvar.
- Terraform: [../terraform/wp-b4-alerting](../terraform/wp-b4-alerting)

Do not `gcloud` mutate, `terraform apply`, or claim
`HUMAN_NOTIFICATION_PROVEN` from these files.
