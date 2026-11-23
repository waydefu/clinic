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

export function loggingBucketsFromSnapshot(snapshot) {
  const value = snapshot.loggingBuckets;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.buckets)) return value.buckets;
  return [];
}

export function regionFromC1FoundationLogging(snapshot) {
  return regionFromLoggingBuckets(loggingBucketsFromSnapshot(snapshot));
}

export function regionFromLoggingBuckets(buckets) {
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

export const C1_BUDGET_DISPLAY_NAME = 'C1 synthetic staging alerting budget';

function projectNumberFromSnapshot(snapshot) {
  if (
    typeof snapshot.projectNumber === 'string' &&
    /^\d+$/.test(snapshot.projectNumber.trim())
  ) {
    return snapshot.projectNumber.trim();
  }
  const sources = [
    ...loggingBucketsFromSnapshot(snapshot).map((item) => item?.name),
    ...(Array.isArray(snapshot.wifPools) ? snapshot.wifPools : []).map(
      (item) => item?.name
    ),
    ...(Array.isArray(snapshot.services) ? snapshot.services : []).map(
      (item) => item?.config?.name ?? item?.name
    )
  ];
  for (const source of sources) {
    const match = /^projects\/(\d+)\//.exec(String(source ?? ''));
    if (match !== null) return match[1];
  }
  return undefined;
}

function budgetsFromSnapshot(snapshot) {
  const value = snapshot.budgets;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.budgets)) return value.budgets;
  return [];
}

function matchesC1TargetBudget(budget, { projectId, projectNumber }) {
  if (!budget || typeof budget !== 'object') return false;
  const displayName = budget.displayName ?? budget.display_name;
  if (displayName !== undefined && displayName !== C1_BUDGET_DISPLAY_NAME) {
    return false;
  }
  const filter = budget.budgetFilter ?? budget.budget_filter;
  const filterProjects = filter?.projects;
  const allUpdates = budget.allUpdatesRule ?? budget.all_updates_rule;
  const pubsubTopic = allUpdates?.pubsubTopic ?? allUpdates?.pubsub_topic;

  const allowedRefs = new Set([`projects/${projectId}`]);
  if (projectNumber !== undefined) allowedRefs.add(`projects/${projectNumber}`);

  const hasFilterProjects =
    Array.isArray(filterProjects) && filterProjects.length > 0;
  if (hasFilterProjects) {
    const singleTarget =
      filterProjects.length === 1 && allowedRefs.has(filterProjects[0]);
    if (!singleTarget) return false;
  }

  const expectedTopic = `projects/${projectId}/topics/c1-budget-notifications`;
  const matchesTopic = pubsubTopic === expectedTopic;
  if (pubsubTopic !== undefined && !matchesTopic) return false;

  return hasFilterProjects || matchesTopic;
}

export function selectC1TargetBudget(budgets, target) {
  const matches = budgets.filter((budget) =>
    matchesC1TargetBudget(budget, target)
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function budgetAmountTwdFromBudget(budget) {
  const specified =
    budget?.amount?.specifiedAmount ?? budget?.amount?.specified_amount;
  const currency = specified?.currencyCode ?? specified?.currency_code;
  if (currency !== 'TWD') return undefined;
  if (specified?.units === undefined || specified?.units === null) {
    return undefined;
  }
  const units = String(specified.units).trim();
  if (units === '') return undefined;
  const parsed = Number(units);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function budgetThresholdsFromBudget(budget) {
  const rules = budget?.thresholdRules ?? budget?.threshold_rules;
  if (!Array.isArray(rules) || rules.length === 0) return undefined;
  const values = rules.map(
    (rule) => rule?.thresholdPercent ?? rule?.threshold_percent
  );
  const allFinite = values.every(
    (value) => typeof value === 'number' && Number.isFinite(value)
  );
  return allFinite ? values : undefined;
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
  const firestoreLists = snapshot.firestoreDatabases;
  const firestoreDatabase = Array.isArray(firestoreLists)
    ? firestoreLists.length > 0
    : Array.isArray(firestoreLists?.databases)
      ? firestoreLists.databases.length > 0
      : undefined;
  const identityPlatformEnabled =
    (snapshot.identityServices ?? []).some(
      (entry) => apiIdFromService(entry) === 'identitytoolkit.googleapis.com'
    ) || enabledApis.includes('identitytoolkit.googleapis.com');
  const budgets = budgetsFromSnapshot(snapshot);
  const targetBudget = selectC1TargetBudget(budgets, {
    projectId: snapshot.projectId,
    projectNumber: projectNumberFromSnapshot(snapshot)
  });

  return {
    projectId: snapshot.projectId,
    region: regionFromC1FoundationLogging(snapshot),
    enabledApis,
    iamRoles,
    wifPoolId,
    terraformCiSa,
    secretVersionCount,
    budgetAmountTwd: budgetAmountTwdFromBudget(targetBudget),
    budgetThresholds: budgetThresholdsFromBudget(targetBudget),
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
