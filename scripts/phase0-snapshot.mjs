#!/usr/bin/env node
/**
 * Phase 0 — Account Context Snapshot (Card 7 / Phase 0 CLI)
 *
 * Rebuilds the ACCOUNT_CONTEXT_SNAPSHOT and writes to
 * output/evidence/account-context-snapshot.txt (gitignored).
 * Also prints to stdout for immediate verification.
 *
 * Usage:
 *   node scripts/phase0-snapshot.mjs
 *
 * Exit codes:
 *   0 = all checks consistent (CLI + ADC + Firebase agree)
 *   1 = mismatch / NO-HARD-STOP (read-only only)
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EVIDENCE_DIR = join(ROOT, 'output', 'evidence');

function run(cmd, { silent = false, ignoreError = false } = {}) {
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit'
    });
    return out.trim();
  } catch (e) {
    if (ignoreError) return '';
    throw e;
  }
}

function runSilent(cmd) {
  return run(cmd, { silent: true, ignoreError: true });
}

mkdirSync(EVIDENCE_DIR, { recursive: true });

const lines = [];
lines.push('ACCOUNT_CONTEXT_SNAPSHOT');
lines.push(`environment: synthetic-isolated`);
lines.push(
  `current authority: LUNA_SOLE_EXECUTOR / GROK_RESTS (not production)`
);

// gcloud configuration
const gcloudConfig = runSilent(
  'gcloud config configurations list --format="value(name)" | grep -x clinic-staging'
);
lines.push(`gcloud configuration: ${gcloudConfig || 'MISSING'}`);

// gcloud identity
const gcloudAccount = runSilent('gcloud config get-value account');
lines.push(`gcloud identity: ${gcloudAccount || 'UNVERIFIED'}`);

// gcloud project
const gcloudProject = runSilent('gcloud config get-value project');
lines.push(`gcloud project: ${gcloudProject || 'UNSET'}`);

// organization
const orgId = runSilent(
  "gcloud organizations list --format='value(name)' | awk 'NR==1'"
);
let orgLine = 'ORG_VISIBLE=no';
if (orgId) {
  const folders = runSilent(
    `gcloud resource-manager folders list --organization="${orgId}" --format='value(name)' | head -5`
  );
  orgLine = `org=${orgId}${folders ? ` folders=${folders.replace(/\n/g, ',')}` : ''}`;
}
lines.push(`organization: ${orgLine}`);

// folder (from project parent)
const projectParent = runSilent(
  "gcloud projects describe beauessence-clinic-stg-c1a01 --format='value(parent)' 2>/dev/null"
);
lines.push(`folder: ${projectParent || 'unknown'}`);

// billing account
const billing = runSilent(
  'gcloud billing accounts list --format="value(name)" | head -1'
);
lines.push(`billing account: ${billing ? 'present' : 'absent'}`);

// ADC
const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'unset';
lines.push(`GOOGLE_APPLICATION_CREDENTIALS: ${gac}`);

let adcSource = 'missing';
let adcIdentity = 'UNVERIFIED';
if (gac !== 'unset') {
  adcSource = 'GAC-env';
} else {
  const adcToken = runSilent(
    'gcloud auth application-default print-access-token >/dev/null 2>&1 && echo ADC_TOKEN_OK || echo ADC_MISSING'
  );
  if (adcToken.includes('ADC_TOKEN_OK')) {
    adcSource = 'user-adc'; // could be impersonation too; we don't distinguish here
    const adcAct = runSilent(
      'gcloud auth application-default print-access-token 2>/dev/null | head -c 20'
    );
    adcIdentity = adcAct ? 'token-present' : 'UNVERIFIED';
  } else {
    adcSource = 'missing';
  }
}
lines.push(`ADC identity / source: ${adcIdentity} / ${adcSource}`);

// Firebase CLI
const firebaseAccount = runSilent(
  'firebase login:list --format=json 2>/dev/null | jq -r ".[0].user.email" 2>/dev/null'
);
lines.push(`Firebase CLI account: ${firebaseAccount || 'UNSET'}`);

const firebaseProjects = runSilent(
  'firebase projects:list --json 2>/dev/null | jq -r ".result[].projectId" 2>/dev/null | grep beauessence-clinic-stg-c1a01'
);
lines.push(
  `Firebase project: beauessence-clinic-stg-c1a01 listed? ${firebaseProjects ? 'yes' : 'no'}`
);

// Browser (manual check reminder)
lines.push(
  `browser Google account / Chrome profile: clinic-synthetic (manual verify)`
);

// Terraform target
lines.push(`Terraform target: none this card (no apply)`);

// Agreement check
const agree =
  gcloudProject === 'beauessence-clinic-stg-c1a01' &&
  adcToken?.includes('ADC_TOKEN_OK') &&
  firebaseProjects &&
  gcloudConfig === 'clinic-staging'
    ? 'yes'
    : 'NO-HARD-STOP';
lines.push(`CLI + browser + Terraform agree: ${agree}`);

const output = lines.join('\n') + '\n';

// Write file
const snapPath = join(EVIDENCE_DIR, 'account-context-snapshot.txt');
writeFileSync(snapPath, output);
console.log(output);
console.log(`\nWritten to ${snapPath}`);

// Exit code for scripting
if (agree === 'NO-HARD-STOP') {
  console.error(
    '\n⚠️  NO-HARD-STOP: read-only only. Do not continue to Card 8.'
  );
  process.exit(1);
} else {
  console.log('\n✅ Snapshot consistent. Ready for Card 8.');
  process.exit(0);
}
