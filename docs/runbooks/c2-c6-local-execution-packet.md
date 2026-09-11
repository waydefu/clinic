# C2～C6 local execution packet (source / dry-run / sequential)

**Type:** local ADC/CLI packet. Not production. Not a slice PASS until
that slice is `granted`, applied when it is a cloud slice, and the
matching smoke/source evaluator exits 0.
**Depends on:** [C1 local execution packet](c1-local-execution-packet.md)
and `node scripts/sequential-c-gate.mjs`.
**Date:** 2026-09-11
Lookup SHA: `git rev-parse HEAD`
Do not paste credentials, tokens, billing IDs or service-account JSON
into chat or the repository.

This agent sandbox has no `gcloud` / Terraform / Firebase CLI. Cloud
slices stay `UNAVAILABLE` here. Run apply only on a local ADC host after
the previous gate is `completed`.

## Sequence

`C0 completed → C1 granted → C1 smoke PASS → grant C2 → C2 smoke PASS →
grant C3 → C3 source PASS → grant C4 → C4 source PASS → grant C5 →
C5 smoke PASS → grant C6 → C6 smoke PASS`

One slice per step. `sequential-c-gate --write` is legal only against a
copy or after real evidence; it never grants C3～C6 in the C1 step and
never routes booking.

## C2 Identity (cloud)

Preconditions: C1 `completed`; C2 `granted`. Forbidden:
`beauessence-clinic-staging`.

```bash
cd infra/terraform/c2-identity
cp terraform.tfvars.example terraform.tfvars
# set project_id to the isolated C1 project
# exact_apply_authority_sha=$(git rev-parse HEAD)
terraform init -backend-config="bucket=<state-bucket>" -backend-config="prefix=c2-identity"
terraform plan -out=c2.tfplan
terraform apply c2.tfplan
C2_IDENTITY_APPLY=granted GOOGLE_CLOUD_PROJECT="$PROJECT_ID" node scripts/configure-c2-identity.mjs
node scripts/c2-c6-smoke-evidence.mjs C2 /tmp/c2-smoke.json
node scripts/sequential-c-gate.mjs --c1-smoke /tmp/c1-smoke.json --c2-smoke /tmp/c2-smoke.json
```

C2 must enable `identitytoolkit.googleapis.com` with TOTP
`adjacentIntervals=1`. It must not create Firestore or enable Calendar
JSON API.

## C3 session (source)

No Terraform. After C2 PASS and C3 `granted`,
`sequential-c-gate` evaluates `__session` HttpOnly/Secure/SameSite=Strict,
idle 30m, absolute 8h, and disabled-user rejection on the CAL-PILOT
session module. That is C3 source PASS for the synthetic surface, not
production staff Hosting.

## C4 RBAC (source)

No Terraform. After C3 PASS and C4 `granted`, the evaluator checks
`packages/domain/src/roles.ts` (`manager` / `front_desk`) and
`staff-auth-parameters.ts` (lockout 5 / 15m base / manager unlock /
break-glass not provisioned). Authorization-code KDF remains unspecified
in Canon — do not guess a hash.

## C5 Firestore (cloud)

Preconditions: C4 `completed`; C5 `granted`. Native + PITR + delete
protection in `asia-east1`. Synthetic data only.

```bash
cd infra/terraform/c5-firestore
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config="bucket=<state-bucket>" -backend-config="prefix=c5-firestore"
terraform plan -out=c5.tfplan
terraform apply c5.tfplan
node scripts/c2-c6-smoke-evidence.mjs C5 /tmp/c5-smoke.json
```

## C6 Calendar API (cloud)

Preconditions: C5 `completed`; C6 `granted`. Enables
`calendar-json.googleapis.com` only. Formal booking and
`CalendarWatchController` stay **UNROUTED**. Production Calendar remains
blocked by D-009 / D-016.

```bash
cd infra/terraform/c6-calendar
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config="bucket=<state-bucket>" -backend-config="prefix=c6-calendar"
terraform plan -out=c6.tfplan
terraform apply c6.tfplan
node scripts/c2-c6-smoke-evidence.mjs C6 /tmp/c6-smoke.json
```

## Rollback

Disable the slice API / SA just added. Do not delete the C1 project. Do
not detach billing. Do not route `/v1/bookings`.
