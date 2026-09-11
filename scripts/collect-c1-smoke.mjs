import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';
import { loadC0EngineeringRecs } from './c1-smoke-evidence.mjs';

export function assertC1CollectProjectId(projectId) {
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(isolatedC1ProjectIdError(projectId, 'C1 smoke collect'));
  }
}

export function c1PreApplyEnableApisCommand(projectId) {
  assertC1CollectProjectId(projectId);
  const apis = loadC0EngineeringRecs().c1.apiAllowlist.join(' \\\n  ');
  return `gcloud services enable \\\n  ${apis} \\\n  --project=${projectId}`;
}

export function c1SmokeCollectCommands(projectId) {
  assertC1CollectProjectId(projectId);
  return [
    `gcloud services list --enabled --project=${projectId} --format=json`,
    `gcloud projects get-iam-policy ${projectId} --format=json`,
    `gcloud iam workload-identity-pools list --location=global --project=${projectId} --format=json`,
    `gcloud iam service-accounts list --project=${projectId} --format=json`,
    `gcloud secrets versions list c1-bootstrap-reserved --project=${projectId} --format=json`,
    `gcloud firestore databases list --project=${projectId} --format=json`,
    `gcloud services list --enabled --project=${projectId} --filter=config.name:identitytoolkit.googleapis.com --format=json`,
    `gcloud logging buckets list --project=${projectId} --location=asia-east1 --format=json`,
    `gcloud billing projects describe ${projectId} --format=json`,
    `# local only; do not commit or paste the account id: gcloud billing budgets list --billing-account="$BILLING_ACCOUNT_ID" --format=json`
  ];
}

function apiIdFromService(entry) {
  const name = entry?.config?.name ?? entry?.name ?? '';
  const match = String(name).match(/([a-z0-9.-]+\.googleapis\.com)$/);
  return match ? match[1] : '';
}

function poolIdFromName(name) {
  const match = String(name).match(/workloadIdentityPools\/([^/]+)$/);
  return match ? match[1] : '';
}

function saIdFromEmail(email) {
  const match = String(email).match(/^([^@]+)@/);
  return match ? match[1] : '';
}

function isTerraformCiMember(member) {
  return (
    typeof member === 'string' &&
    member.startsWith('serviceAccount:c1-terraform-ci@')
  );
}

function loggingBucketsFromSnapshot(snapshot) {
  const value = snapshot.loggingBuckets;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.buckets)) return value.buckets;
  return [];
}

function regionFromLoggingBuckets(buckets) {
  for (const bucket of buckets) {
    const name = String(bucket?.name ?? bucket?.bucketId ?? '');
    const match = name.match(/locations\/([^/]+)\/buckets\/c1-foundation$/);
    if (match) return match[1];
    if (
      (bucket?.bucketId === 'c1-foundation' || name === 'c1-foundation') &&
      typeof bucket?.location === 'string'
    ) {
      return bucket.location.toLowerCase();
    }
  }
  return undefined;
}

function budgetsFromSnapshot(snapshot) {
  const value = snapshot.budgets;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.budgets)) return value.budgets;
  return [];
}

function budgetAmountTwdFromBudgets(budgets) {
  const amount = budgets[0]?.amount?.specifiedAmount;
  const currency = amount?.currencyCode ?? amount?.currency_code;
  if (currency !== 'TWD') return undefined;
  if (amount?.units === undefined || amount?.units === null) return undefined;
  const parsed = Number(amount.units);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function budgetThresholdsFromBudgets(budgets) {
  const rules = budgets[0]?.thresholdRules ?? budgets[0]?.threshold_rules;
  if (!Array.isArray(rules)) return undefined;
  return rules.map((rule) => rule.thresholdPercent ?? rule.threshold_percent);
}

function billingDetachedFromSnapshot(snapshot) {
  const billing = snapshot.billingProject;
  if (!billing || typeof billing !== 'object') return undefined;
  if (billing.billingEnabled === false) return true;
  if (
    billing.billingEnabled === true &&
    typeof billing.billingAccountName === 'string' &&
    billing.billingAccountName.startsWith('billingAccounts/')
  ) {
    return false;
  }
  return undefined;
}

export function assembleC1SmokeEvidence(snapshot) {
  assertC1CollectProjectId(snapshot.projectId);
  const enabledApis = (snapshot.services ?? [])
    .map(apiIdFromService)
    .filter(Boolean);
  const iamRoles = (snapshot.iamPolicy?.bindings ?? [])
    .filter((binding) =>
      (binding.members ?? []).some((member) => isTerraformCiMember(member))
    )
    .map((binding) => binding.role);
  const wifPoolId =
    (snapshot.wifPools ?? [])
      .map((pool) => poolIdFromName(pool.name))
      .find((id) => id === 'c1-github') ?? '';
  const terraformCiSa =
    (snapshot.serviceAccounts ?? [])
      .map((account) => saIdFromEmail(account.email))
      .find((id) => id === 'c1-terraform-ci') ?? '';
  const secretVersionCount = Array.isArray(snapshot.secretVersions)
    ? snapshot.secretVersions.length
    : -1;
  const firestoreDatabase = Array.isArray(snapshot.firestoreDatabases)
    ? snapshot.firestoreDatabases.length > 0
    : Boolean(snapshot.firestoreDatabases);
  const identityPlatformEnabled =
    (snapshot.identityServices ?? []).some(
      (entry) => apiIdFromService(entry) === 'identitytoolkit.googleapis.com'
    ) || enabledApis.includes('identitytoolkit.googleapis.com');
  const budgets = budgetsFromSnapshot(snapshot);

  return {
    projectId: snapshot.projectId,
    region: regionFromLoggingBuckets(loggingBucketsFromSnapshot(snapshot)),
    enabledApis,
    iamRoles,
    wifPoolId,
    terraformCiSa,
    secretVersionCount,
    budgetAmountTwd: budgetAmountTwdFromBudgets(budgets),
    budgetThresholds: budgetThresholdsFromBudgets(budgets),
    billingDetached: billingDetachedFromSnapshot(snapshot),
    firestoreDatabase,
    identityPlatformEnabled
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) {
    process.stderr.write(
      'Usage: node scripts/collect-c1-smoke.mjs <gcloud-snapshot.json>\n'
    );
    process.exit(2);
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const evidence = assembleC1SmokeEvidence(snapshot);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
