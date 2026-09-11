import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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
  }
  if (
    typeof projectId !== 'string' ||
    !/^beauessence-clinic-stg-[a-z0-9-]+$/.test(projectId) ||
    projectId === 'beauessence-clinic-stg-unapplied'
  ) {
    issues.push(
      'C1 projectId must be a real isolated beauessence-clinic-stg-* id.'
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
  for (const forbidden of [
    'roles/owner',
    'roles/editor',
    'roles/datastore.user'
  ]) {
    if (roles.includes(forbidden)) {
      issues.push(`C1 IAM includes forbidden role ${forbidden}.`);
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
  if (evidence.billingDetached === true) {
    issues.push('C1 must not auto-detach billing.');
  }
  if (evidence.firestoreDatabase) {
    issues.push('C1 must not create a Firestore database.');
  }
  if (evidence.identityPlatformEnabled) {
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
