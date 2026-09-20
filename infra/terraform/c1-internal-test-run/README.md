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

`CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN` is the explicit non-secret input
`firebase_auth_domain`. There is no fallback to
`${project_id}.firebaseapp.com`. Empty is allowed only while
`exact_apply_authority_sha = not_granted`. Apply requires the exact
authorized isolated Hosting host (no scheme):

`beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app`

Scheme, wildcards, `firebaseapp.com`, `beauessence-clinic-staging`,
official `beauessence.com.tw` hosts, production domains, and arbitrary
hosts are refused. Do not infer authDomain from the request `Host`
header.

Secret Manager mounts use **independent per-service version inputs**:
`api_secret_versions` and `worker_secret_versions`. A missing required
pin fails closed on apply. `latest` is refused. The retired shared
`secret_resource_version` input cannot pin any mount.

Local `terraform.tfvars` migration: stop copying one numeric version
onto every secret. Delete or ignore leftover `secret_resource_version`
(including `= 1`). Set each API pin independently. Set
`worker_secret_versions.GOOGLE_CALENDAR_ID` to the current approved C1
Calendar input (`2` in `terraform.tfvars.example`). That `2` is an
input pin, not a permanent source invariant — a later authorized
rotation is `2` → `3` by changing the input only. Do not `terraform
apply` from this packet.

This source does not mutate the OAuth client
`clinic-c1-internal-preproduction-staff`. A future, separately
authorized cloud mutation must add

`https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app/__/auth/handler`

to that client's Authorized Redirect URIs, then apply the env above.
`CLOUD_MUTATION = NONE` in this directory's source PR.

`allUsers` `run.invoker` on the API is **Hosting rewrite transport only**.
Staff/admin routes still require session + CSRF + RBAC. Public booking
stays accountless at the API layer. The worker uses `INGRESS_TRAFFIC_ALL`
so Cloud Scheduler can reach `run.app`, but IAM grants `run.invoker` only
to the scheduler service account. Unauthenticated drain is denied.

The API sets `TRUSTED_PROXY_HOPS=2` for the controlled Firebase Hosting
rewrite plus Cloud Run frontend chain. This selects the stable client address
without trusting an arbitrary leftmost `X-Forwarded-For` value; reducing it to
one hop fragments durable rate-limit keys across Google frontend addresses.

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
