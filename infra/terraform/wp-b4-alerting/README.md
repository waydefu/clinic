# WP-B4 application alerting (source only)

**Not applied.** Default `exact_apply_authority_sha = not_granted`
creates **zero** resources. `beauessence-clinic-staging` is rejected.

This module is the Stage F exact-SHA apply target for:

1. Pub/Sub topic `c1-application-alerts`
2. Email notification channel whose address comes only from
   `alert_email_address` tfvar/secret
3. Log-based metrics and alert policies matching
   [wp-b4-alert-policies.json](../../monitoring/wp-b4-alert-policies.json)

Applying (a named SHA) requires `alert_email_address`. That is a variable
validation, so `terraform plan` fails with a non-zero exit when it is missing;
a `check` block would only warn. This needs Terraform 1.9 or later.

Human notification status after this source lands:

`HUMAN_NOTIFICATION_PATH_IMPLEMENTED_NOT_DEPLOYED`

All nine sparse log-metric policies treat missing data as non-violating,
auto-close after 30 minutes as a fallback, and notify on both opening and
closure. This prevents a one-shot proof or recovered workload from leaving a
seven-day incident open merely because no later matching log arrives.

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

## B-08 source-only delivery proposal

Authorized source scope: Decision Register, **2026-10-31 Sol: four source
choices**, and [owner checkpoint](https://github.com/waydefu/clinic/pull/268#issuecomment-6561809243).
This is not apply, C1 work, a confirmed principal inventory or worker wiring.

`application_delivery = null` is backward-compatible and creates no new
transport resources. The existing application channel may be declared, but
`application_delivery_pairing.status` is `UNCONFIGURED`, never delivered.
With explicit inputs and a named SHA, the proposal pairs:

- Monitoring publisher: only `roles/pubsub.publisher` on the existing
  `c1-application-alerts` topic; the channel depends on that binding.
- `c1-application-alerts-worker`: pull only, worker-only subscriber permission
  (plus the Pub/Sub broker permission needed for dead-letter forwarding).
- `c1-application-alerts-dlq`: only the explicit Pub/Sub service agent may
  publish; `c1-application-alerts-dlq-review` preserves messages for a separately
  authorized reviewer. This proposal grants nobody DLQ-reader access.
- Source consumer: `consumeAlertMessage` in `apps/worker`; no entrypoint imports
  it, and no SDK, polling loop, sender, dedupe store or provider is connected.

The source proposal uses a 30-second ack deadline, 7-day unacknowledged-message
retention, 10–600-second retry backoff and 5 maximum delivery attempts before
broker dead lettering (Pub/Sub's delivery-attempt threshold is best effort).
These are reviewable engineering inputs, not approved operating settings.
`alertAckDecision` is pure: success/duplicate may ack; retry must nack;
permanent/malformed failures may ack only after durable quarantine succeeds.
It does not perform those actions. Without quarantine, nack allows the broker's
bounded-retry/DLQ policy to act instead of dropping the message.

Principals must be explicitly provided by a future authorized operator.
Validation restricts service-agent formats to one supplied project number and
worker membership to the source-declared `internal-test-outbox` account of the
selected project; it does **not** verify number-to-project ownership or confirm
that any identity exists. No identity is discovered, created or borrowed from
the budget topic. `runtime_verified` is always false, even for valid inputs.

Tests: `delivery.tftest.hcl` adds mock-only positive pairing, default-SHA no-op,
unconfigured-channel, public publisher, API consumer and cross-project broker
cases. The existing required CI runs these through `scripts/terraform-ci.mjs`;
no local Terraform commands are needed or authorized. Worker fake/source tests
cover acknowledgement/quarantine and retain existing projection/dedupe cases.
External delivery evidence and real resource changes remain separate.
