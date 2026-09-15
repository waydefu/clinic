# Isolated C1 Cloud Run / Artifact Registry (source only)

**Not applied.** Default `exact_apply_authority_sha = not_granted`
creates **zero** resources. `beauessence-clinic-staging` is refused.
Region is `asia-east1` (C1/C5 Firestore `locationId`, not guessed).

This module is the Stage F exact-SHA apply target for:

1. API enablement: `run`, `artifactregistry`, `cloudbuild`, `cloudscheduler`
2. Artifact Registry repository `internal-test`
3. Runtime service accounts `internal-test-api` and `internal-test-outbox`
4. Cloud Run services `internal-test-api` and `internal-test-outbox`
5. Empty Secret Manager containers (no versions; values never in git)
6. Paused Cloud Scheduler drain of the outbox worker

Production-shaped defaults stay fail-closed: booking writes off, worker
processing off, scheduler paused, images must be digest-pinned, mutable
`latest` refused.

`allUsers` `run.invoker` on the API is **Hosting rewrite transport only**.
Staff/admin routes still require session + CSRF + RBAC. Public booking
stays accountless at the API layer. The worker uses `INGRESS_TRAFFIC_ALL`
so Cloud Scheduler can reach `run.app`, but IAM grants `run.invoker` only
to the scheduler service account. Unauthenticated drain is denied.

Calendar projection uses **keyless Cloud Run ADC**
(`GOOGLE_CALENDAR_AUTH=CLOUD_ADC`): attached `internal-test-outbox`
identity → metadata server short-lived token → Calendar API. Do not
create a user-managed service-account key and do not set
`GOOGLE_APPLICATION_CREDENTIALS`. Share the synthetic test calendar to
the worker identity. `DOMAIN_WIDE_DELEGATION_REQUIRED = NO`. Do not
enable `events.watch`.

Do not `terraform apply` until a post-merge exact-SHA packet names this
directory. Agent sandbox does not apply. Do not re-apply
`exact_apply_authority_sha=not_granted` onto `c1-foundation` or
`c5-firestore`.

Rollback (future packet): route Cloud Run traffic to the previous
revision/digest; set `worker_processing_enabled=false` and keep the
scheduler paused; do not destroy the stack.

See [c1-local-execution-packet.md](../../../docs/runbooks/c1-local-execution-packet.md).
