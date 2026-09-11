import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertC1CollectProjectId(projectId) {
  if (projectId === 'beauessence-clinic-staging') {
    throw new Error(
      'C1 smoke collect refuses beauessence-clinic-staging; that project is not C1.'
    );
  }
  if (
    typeof projectId !== 'string' ||
    !/^beauessence-clinic-stg-[a-z0-9-]+$/.test(projectId) ||
    projectId === 'beauessence-clinic-stg-unapplied'
  ) {
    throw new Error(
      'C1 smoke collect requires a real isolated beauessence-clinic-stg-* project.'
    );
  }
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
    `gcloud services list --enabled --project=${projectId} --filter=config.name:identitytoolkit.googleapis.com --format=json`
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

  return {
    projectId: snapshot.projectId,
    region: snapshot.region,
    enabledApis,
    iamRoles,
    wifPoolId,
    terraformCiSa,
    secretVersionCount,
    budgetAmountTwd: snapshot.budgetAmountTwd,
    budgetThresholds: snapshot.budgetThresholds,
    billingDetached: snapshot.billingDetached,
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
