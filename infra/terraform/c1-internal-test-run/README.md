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

Business Delivery report routes also default off. Enabling them requires the
exact isolated C1 project, policy `BD-POLICY-2026-09-29`, scope
`internal_synthetic`, and a valid UTC ISO-8601
`business_delivery_observed_since` instant recording when ingress observation
began. Prepare the maintenance/developer email allowlist in two separately
authorized full Stage F plans. For the first plan, keep
`business_delivery_enabled = false` and
`business_delivery_maintenance_emails_secret_version = "not_granted"`, then
set `business_delivery_maintenance_prerequisites_enabled = true`. The full
plan creates the empty Secret Manager container and API-only accessor binding;
the Cloud Run env remains unmounted. Do not use `-target`.

After that stage is applied under fresh exact-SHA authority, add the
comma-separated allowlist as a Secret Manager version using the approved
private process. Keep those identities out of `terraform.tfvars` and other
Terraform values; the API receives them through the existing secret mount.
Never put the value in Terraform state, source control, shell history, logs,
plans, or outputs. For the second full plan, set
`business_delivery_maintenance_emails_secret_version` to that numeric version
(never `latest`) and keep `business_delivery_maintenance_prerequisites_enabled = true`.
Do not set the flag back to `false`: with the flag `false`, a later return of the
pin to `not_granted` (for example the fail-closed rollback below) makes the plan
destroy `google_secret_manager_secret.runtime["c1-business-delivery-maintenance-emails"]`
and every secret version in it. If that
separately authorized plan is intended to enable reports, set
`business_delivery_enabled = true`, policy
`BD-POLICY-2026-09-29`, scope `internal_synthetic`, and the actual UTC
`business_delivery_observed_since` instant when ingress observation began.
Otherwise keep the gate false and enable it only in a later authorized plan.
While the pin is numeric the container and IAM binding stay in the plan whatever
the flag says; the flag keeps them there when the pin is `not_granted`. The API
service explicitly depends on that binding before it mounts the version.
Inspect and apply the complete plan under fresh authority. Do not enable this
gate in production or for real data.

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

Required conditions are `validation` blocks in `variables.tf`, not `check`
blocks: a failed `check` only prints a warning and `terraform plan` still exits
0. A named SHA without digest-pinned images for this project, without
`firebase_auth_domain`, or without a numeric pin for every mount, Calendar sync
outside the exact C1 project, and booking writes without an expiry therefore
fail `terraform plan` with a non-zero exit, and `noop.tftest.hcl` expects each
failure on its variable. This needs Terraform 1.9 or later.

Local `terraform.tfvars` migration: stop copying one numeric version
onto every secret. Delete or ignore leftover `secret_resource_version`
(including `= 1`). Set each API pin independently. Set
`worker_secret_versions.GOOGLE_CALENDAR_ID` to the current approved C1
Calendar input (`2` in `terraform.tfvars.example`). That `2` is an
input pin, not a permanent source invariant — a later authorized
rotation is `2` → `3` by changing the input only. Do not `terraform
apply` from this packet.

`INTERNAL_TEST_SOURCE_SHA` follows the image, not the approval. The API
reports `api_source_sha` and the outbox and inbound sync services report
`worker_source_sha`; each falls back to `exact_apply_authority_sha` when
empty. A reconciling apply whose images were built from earlier commits
must set both to their build commits, or the plan rewrites the env and
every service gets a new revision.

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

Inbound candidate verification has two explicit stages. First apply with
`calendar_sync_prerequisites_enabled=true` and `calendar_sync_enabled=false`
to create the inbound component's dedicated keyless identity, secret
container, and bindings; this stage does not create the inbound service or
Scheduler and needs no pseudonym secret version. The module may still update
the existing API/outbox services according to the exact-SHA image inputs, so
inspect the whole saved plan before applying. In the separately authorized
cloud packet, add a
fresh random pseudonym value as a Secret Manager version without printing it,
record its numeric version, and grant only this identity access to the
synthetic Calendar. Then apply with `calendar_sync_enabled=true` and that
numeric `calendar_sync_pseudonym_secret_version`. This deploys
`internal-test-calendar-sync` from the same digest-pinned worker image and
overrides only the process entrypoint. The outbox worker gains no new secret
access. Its Scheduler remains paused and has no automatic retry; an authorized
packet invokes individual runs. The C1 bootstrap script creates one bounded
synthetic source and refuses to overwrite existing state.

Do not `terraform apply` until a post-merge exact-SHA packet names this
directory. Agent sandbox does not apply. Do not re-apply
`exact_apply_authority_sha=not_granted` onto `c1-foundation` or
`c5-firestore`.

Rollback (future packet): route Cloud Run traffic to the previous
revision/digest; set `worker_processing_enabled=false` and keep the
scheduler paused; do not destroy the stack.
For Business Delivery, the fail-closed rollback reuses the Stage 1 inputs
(`business_delivery_enabled = false`, pin `not_granted`, prerequisites flag
`true`): it unmounts the secret and leaves the container and its versions in
place.

See [c1-local-execution-packet.md](../../../docs/runbooks/c1-local-execution-packet.md).
