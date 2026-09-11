# C1 local execution packet

**Type:** local ADC/CLI packet. Not production. Not C1 PASS until
apply + smoke evidence is recorded against the exact SHA.
**Date:** 2026-09-11
Lookup SHA: `git rev-parse HEAD` (tree SHA that GitHub
`Verification evidence` passed — not a path-filtered
`git log -- infra/terraform/c1-foundation`).
Do not paste credentials, tokens, billing IDs or service-account JSON
into chat or the repository.

## Preconditions

- C0 `completed`; C1 `granted`; C2～C6 `not_granted`
- This agent sandbox has no `gcloud`. Terraform apply is denied here.
- Human/local environment already authenticated (ADC); do not send
  secrets back
- Confirm `node scripts/sequential-c-gate.mjs` prints
  `exactAuthorityRequest.sha` equal to `git rev-parse HEAD` and to the
  green Verification evidence SHA before apply
- Billing account **currency is TWD** (C0-ENG-REC). A USD account
  rejects `specified_amount.currency_code = TWD`.
- Caller can create a billing budget (`billing.budgets.create` on that
  account). Values stay local.

## Environment

- Directory: `infra/terraform/c1-foundation`
- Region: `asia-east1`
- Project id: `beauessence-clinic-stg-` + **1–7** chars `[a-z0-9]`
  (prefix is 23 characters; GCP project ids are max **30**). Example
  suffix: `c1a01`. Forbidden: `beauessence-clinic-stg-replace-me`
  (33 characters) and `beauessence-clinic-stg-unapplied` (placeholder).
- State bucket: `gs://${PROJECT_ID}-tfstate` in `asia-east1` (create
  after enabling Storage; never use `beauessence-clinic-staging`)
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
APPLY_SHA="$(git rev-parse HEAD)"
echo "$APPLY_SHA"
```

2. Pick an unused 1–7 character suffix, create the project under the
   owner org/folder (not no-org), and link billing:

```bash
SUFFIX="c1a01" # 1-7 [a-z0-9]; pick unused; do not commit
PROJECT_ID="beauessence-clinic-stg-${SUFFIX}"
test "${#PROJECT_ID}" -ge 24 && test "${#PROJECT_ID}" -le 30
gcloud projects create "$PROJECT_ID" \
  --name="Beau Essence C1 synthetic staging" \
  --folder="$FOLDER_ID" # or --organization="$ORG_ID"; values stay local
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID"
```

3. Enable the C1 API allowlist **before** Terraform. The provider sets
   `user_project_override` (required by Billing Budgets). Quota checks
   and the Billing Budgets service agent fail on a brand-new project
   until these APIs exist. This also enables Storage for the state
   bucket:

```bash
gcloud services enable \
  billingbudgets.googleapis.com \
  cloudbilling.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  sts.googleapis.com \
  --project="$PROJECT_ID"
STATE_BUCKET="${PROJECT_ID}-tfstate"
gcloud storage buckets create "gs://${STATE_BUCKET}" \
  --project="$PROJECT_ID" \
  --location=asia-east1 \
  --uniform-bucket-level-access
gcloud storage buckets update "gs://${STATE_BUCKET}" --versioning
```

4. Credential-free mock plan, then exact-SHA apply:

```bash
cd infra/terraform/c1-foundation
terraform test
cp terraform.tfvars.example terraform.tfvars
# set project_id to $PROJECT_ID (24-30 chars), billing_account_id locally
# exact_apply_authority_sha="$APPLY_SHA"
terraform init \
  -backend-config="bucket=${STATE_BUCKET}" \
  -backend-config="prefix=c1-foundation"
terraform plan -out=c1.tfplan
terraform apply c1.tfplan
```

5. Dump gcloud JSON snapshots locally (no tokens, no billing account
   id) into one snapshot file, assemble, then evaluate.

Assembler derives `region` from the `c1-foundation` logging bucket,
`budgetAmountTwd` / `budgetThresholds` from `gcloud billing budgets list`,
and `billingDetached` from `gcloud billing projects describe`. Typed
`region` / `budgetAmountTwd` / `billingDetached` fields are ignored.
The assembled evidence must not contain a billing account id.

IAM evidence is **only** roles granted to `c1-terraform-ci`. A
creating-user `roles/owner` binding is expected on a new project and
is not C1 smoke failure. `c1-terraform-ci` must not have Owner,
Editor, or `datastore.user`.

```bash
# static SHA-gate (no credentials): node scripts/terraform-sha-gate.mjs
# commands: node -e "import {c1SmokeCollectCommands} from './scripts/collect-c1-smoke.mjs'; console.log(c1SmokeCollectCommands(process.env.PROJECT_ID).join('\n'))"
node scripts/collect-c1-smoke.mjs /tmp/c1-gcloud-snapshot.json > /tmp/c1-smoke.json
node scripts/c1-smoke-evidence.mjs /tmp/c1-smoke.json
```

Expected JSON fields: `projectId`, `region`, `enabledApis`, `iamRoles`
(terraform-ci SA only; the nine C1 least-privilege roles),
`wifPoolId` (`c1-github`), `terraformCiSa` (`c1-terraform-ci`),
`secretVersionCount` (`0`), `budgetAmountTwd` (`2000`),
`budgetThresholds` (`[0.5, 0.8, 1.0]`), `billingDetached` (`false`),
`firestoreDatabase` (`false`), `identityPlatformEnabled` (`false`).
Exit 0 is smoke PASS for C1 foundation only. Exit 1 prints issues.
Do not paste the JSON into chat if it contains account identifiers
beyond the synthetic project id.

6. Smoke (expected): APIs in the C0-ENG-REC allowlist enabled; WIF pool
   `c1-github` exists; SA `c1-terraform-ci` has no Owner/Editor and no
   `datastore.user`; secret `c1-bootstrap-reserved` has **no** versions;
   budget NT$2000 with 50/80/100 Pub/Sub; logging bucket `c1-foundation`;
   Firestore / Identity / Run / Scheduler **absent**.

## Rollback

Disable the new SA and APIs; keep the project. Do not delete the project
as the default rollback. Do not detach billing.

## Expected result

`DEPLOYED` for C1 foundation only, still `PRODUCTION_AUTHORIZED=NO`.
C2 remains `not_granted` until this smoke is verified. After exit 0,
run `node scripts/sequential-c-gate.mjs --c1-smoke /tmp/c1-smoke.json`
to propose C1 `completed` and C2 `granted` only. Do not grant C3～C6
in that step.
