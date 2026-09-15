# WP-B4 application alerting (source only)

**Not applied.** Default `exact_apply_authority_sha = not_granted`
creates **zero** resources. `beauessence-clinic-staging` is rejected.

This module is the Stage F exact-SHA apply target for:

1. Pub/Sub topic `c1-application-alerts`
2. Email notification channel whose address comes only from
   `alert_email_address` tfvar/secret
3. Log-based metrics and alert policies matching
   [wp-b4-alert-policies.json](../../monitoring/wp-b4-alert-policies.json)

Human notification status after this source lands:

`HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED`

Do not claim `HUMAN_NOTIFICATION_PROVEN`. Do not `terraform apply` until
a local packet names this directory's exact SHA. Agent sandbox does not
apply.

IAM SetIamPolicy remains on the existing C1 budget Pub/Sub in
`c1-foundation`. This module adds the **application** path required by
signed WP-B4, including `excessive_outbox_age` (60 seconds, not 5
minutes) and an additional IAM SetIamPolicy policy that reuses
`c1-iam-setiampolicy`. Do not destroy the C1 budget path.

Synthetic alert trigger design (do not send in this round): emit a
structured log with `oldestPendingAgeSeconds>=60` or
`retryState="dead_lettered"` against the isolated project, then confirm
the policy condition without delivering email. `HUMAN_NOTIFICATION_PATH`
stays `IMPLEMENTED_NOT_DEPLOYED` until Stage F delivery proof.

See [c1-local-execution-packet.md](../../../docs/runbooks/c1-local-execution-packet.md)
and [stage-e-operational.md](../../../docs/runbooks/stage-e-operational.md).
