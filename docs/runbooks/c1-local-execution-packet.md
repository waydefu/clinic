# C1 local execution packet

**Type:** local ADC/CLI packet. Not production. Not C1 PASS until
apply + smoke evidence is recorded against the exact SHA.
**Date:** 2026-09-11
Lookup SHA: `git log -1 --format=%H -- infra/terraform/c1-foundation`
Do not paste credentials, tokens, billing IDs or service-account JSON
into chat or the repository.

## Preconditions

- C0 `completed`; C1 `granted`; C2～C6 `not_granted`
- This agent sandbox has no `gcloud` / Terraform / Firebase CLI
- Human/local environment already authenticated (ADC); do not send
  secrets back

## Environment

- Directory: `infra/terraform/c1-foundation`
- Region: `asia-east1`
- Project id pattern: `beauessence-clinic-stg-<unique-suffix>`
- Forbidden: `beauessence-clinic-staging`, official DNS hostnames,
  Firestore, Identity Platform, Cloud Run, Scheduler, Artifact Registry

## Commands (local)

1. Confirm identity (values stay local):

```bash
gcloud auth list
gcloud config list
gcloud organizations list
gcloud resource-manager folders list
gcloud billing accounts list
```

2. Pick an unused project id, create it, link billing:

```bash
PROJECT_ID="beauessence-clinic-stg-<suffix>"
gcloud projects create "$PROJECT_ID" --name="Beau Essence C1 synthetic staging"
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID"
```

3. Create a versioned GCS state bucket in `asia-east1`, then:

```bash
cd infra/terraform/c1-foundation
cp terraform.tfvars.example terraform.tfvars
# set project_id, billing_account_id, exact_apply_authority_sha=$(git log -1 --format=%H -- infra/terraform/c1-foundation)
terraform init -backend-config="bucket=<state-bucket>" -backend-config="prefix=c1-foundation"
terraform plan -out=c1.tfplan
terraform apply c1.tfplan
```

4. Collect **metadata-only** JSON locally (no tokens, no billing account
   id, no secret values) and evaluate:

```bash
node scripts/c1-smoke-evidence.mjs /tmp/c1-smoke.json
```

Expected JSON fields: `projectId`, `region`, `enabledApis`, `iamRoles`,
`wifPoolId` (`c1-github`), `terraformCiSa` (`c1-terraform-ci`),
`secretVersionCount` (`0`), `budgetAmountTwd` (`2000`),
`budgetThresholds` (`[0.5, 0.8, 1.0]`), `billingDetached` (`false`),
`firestoreDatabase` (`false`), `identityPlatformEnabled` (`false`).
Exit 0 is smoke PASS for C1 foundation only. Exit 1 prints issues.
Do not paste the JSON into chat if it contains account identifiers
beyond the synthetic project id.

5. Smoke (expected): APIs in the C0-ENG-REC allowlist enabled; WIF pool
   `c1-github` exists; SA `c1-terraform-ci` has no Owner/Editor and no
   `datastore.user`; secret `c1-bootstrap-reserved` has **no** versions;
   budget NT$2000 with 50/80/100 Pub/Sub; logging bucket `c1-foundation`;
   Firestore / Identity / Run / Scheduler **absent**.

## Rollback

Disable the new SA and APIs; keep the project. Do not delete the project
as the default rollback. Do not detach billing.

## Expected result

`DEPLOYED` for C1 foundation only, still `PRODUCTION_AUTHORIZED=NO`.
C2 remains `not_granted` until this smoke is verified.
