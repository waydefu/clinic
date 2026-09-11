import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isIsolatedC1ProjectId } from './isolated-c1-project-id.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Least-privilege roles C1 Terraform grants to `c1-terraform-ci` only. */
export const C1_TERRAFORM_CI_ROLES = [
  'roles/serviceusage.serviceUsageAdmin',
  'roles/iam.serviceAccountAdmin',
  'roles/iam.workloadIdentityPoolAdmin',
  'roles/resourcemanager.projectIamAdmin',
  'roles/secretmanager.admin',
  'roles/logging.admin',
  'roles/monitoring.admin',
  'roles/pubsub.admin',
  'roles/storage.admin'
];

export const C1_FORBIDDEN_SA_ROLES = [
  'roles/owner',
  'roles/editor',
  'roles/datastore.user'
];

export function loadC0EngineeringRecs() {
  return JSON.parse(
    readFileSync(
      join(root, 'docs/architecture/c0-engineering-recommendations.json'),
      'utf8'
    )
  );
}

export function evaluateC1Smoke(evidence, recs) {
  const issues = [];
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, issues: ['evidence must be a JSON object'] };
  }

  const projectId = evidence.projectId;
  if (projectId === recs.c1.existingStaging) {
    issues.push(
      'C1 smoke used beauessence-clinic-staging; that project is not C1.'
    );
  } else if (!isIsolatedC1ProjectId(projectId)) {
    issues.push(
      'C1 projectId must be beauessence-clinic-stg- plus 1-7 lowercase alphanumeric chars (GCP max 30).'
    );
  }

  if (evidence.region !== 'asia-east1') {
    issues.push('C1 region must be asia-east1.');
  }

  const enabled = Array.isArray(evidence.enabledApis)
    ? evidence.enabledApis
    : [];
  for (const api of recs.c1.apiAllowlist) {
    if (!enabled.includes(api)) {
      issues.push(`C1 allowlist API missing: ${api}`);
    }
  }
  for (const api of recs.c1.excludedApis) {
    if (enabled.includes(api)) {
      issues.push(`C1 excluded API is enabled: ${api}`);
    }
  }

  const roles = Array.isArray(evidence.iamRoles) ? evidence.iamRoles : [];
  for (const required of C1_TERRAFORM_CI_ROLES) {
    if (!roles.includes(required)) {
      issues.push(`C1 terraform-ci SA missing role ${required}.`);
    }
  }
  for (const forbidden of C1_FORBIDDEN_SA_ROLES) {
    if (roles.includes(forbidden)) {
      issues.push(`C1 terraform-ci SA has forbidden role ${forbidden}.`);
    }
  }

  if (evidence.wifPoolId !== 'c1-github') {
    issues.push('C1 WIF pool must be c1-github.');
  }
  if (evidence.terraformCiSa !== 'c1-terraform-ci') {
    issues.push('C1 Terraform CI SA must be c1-terraform-ci.');
  }
  if (evidence.secretVersionCount !== 0) {
    issues.push('C1 secret containers must have zero versions.');
  }
  if (evidence.budgetAmountTwd !== recs.budget.proposedMonthlyAmount) {
    issues.push('C1 budget amount must be NT$2000.');
  }
  const thresholds = Array.isArray(evidence.budgetThresholds)
    ? evidence.budgetThresholds
    : [];
  if (!recs.budget.thresholds.every((value) => thresholds.includes(value))) {
    issues.push('C1 budget must notify at 50/80/100.');
  }
  if (evidence.billingDetached !== false) {
    issues.push('C1 must record billingDetached=false (no auto-detach).');
  }
  if (evidence.firestoreDatabase !== false) {
    issues.push('C1 must not create a Firestore database.');
  }
  if (evidence.identityPlatformEnabled !== false) {
    issues.push('C1 must not enable Identity Platform.');
  }

  return { ok: issues.length === 0, issues };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write(
      'Usage: node scripts/c1-smoke-evidence.mjs <local-evidence.json>\n'
    );
    process.exit(2);
  }
  const evidence = JSON.parse(readFileSync(path, 'utf8'));
  const result = evaluateC1Smoke(evidence, loadC0EngineeringRecs());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
