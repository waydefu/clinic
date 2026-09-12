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

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFirebaseLoginAccount,
  redactAccount
} from './phase0-snapshot-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EVIDENCE_DIR = join(ROOT, 'output', 'evidence');

function run(cmd, { silent = false, ignoreError = false } = {}) {
  const [exe, ...args] = cmd.split(' ');
  const result = spawnSync(exe, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: silent ? 'pipe' : 'inherit',
    shell: false
  });
  if (result.error) {
    if (ignoreError) return '';
    throw result.error;
  }
  if (result.status !== 0 && !ignoreError) {
    const err = new Error(`Command failed: ${cmd}`);
    err.status = result.status;
    err.stderr = result.stderr;
    throw err;
  }
  return result.stdout.trim();
}

function runSilent(cmd) {
  return run(cmd, { silent: true, ignoreError: true });
}

function runShell(cmd, { silent = true, ignoreError = true } = {}) {
  // For commands that need shell features (pipes, redirections)
  const result = spawnSync('bash', ['-c', cmd], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: silent ? 'pipe' : 'inherit'
  });
  if (result.error && !ignoreError) throw result.error;
  if (result.status !== 0 && !ignoreError) {
    const err = new Error(`Shell command failed: ${cmd}`);
    err.status = result.status;
    err.stderr = result.stderr;
    throw err;
  }
  return result.stdout.trim();
}

function runShellSilent(cmd) {
  return runShell(cmd, { silent: true, ignoreError: true });
}

mkdirSync(EVIDENCE_DIR, { recursive: true });

const lines = [];
lines.push('ACCOUNT_CONTEXT_SNAPSHOT');
lines.push(`environment: synthetic-isolated`);
lines.push(
  `current authority: GROK_UNRESTED / GROK_PROJECT_CLOSER + LUNA_SOLE_EXECUTOR; GROK_RESTS superseded 2026-09-13 (not production)`
);

// gcloud configuration
const gcloudConfig = runShellSilent(
  'gcloud config configurations list --format="value(name)" | grep -x clinic-staging'
);
lines.push(`gcloud configuration: ${gcloudConfig || 'MISSING'}`);

// gcloud identity
const gcloudAccount = runSilent('gcloud config get-value account');
lines.push(
  `gcloud identity: ${gcloudAccount ? redactAccount(gcloudAccount) : 'UNVERIFIED'}`
);

// gcloud project
const gcloudProject = runSilent('gcloud config get-value project');
lines.push(`gcloud project: ${gcloudProject || 'UNSET'}`);

// organization
const orgId = runShellSilent(
  "gcloud organizations list --format='value(name)' | awk 'NR==1'"
);
let orgLine = 'ORG_VISIBLE=no';
if (orgId) {
  const folders = runShellSilent(
    `gcloud resource-manager folders list --organization="${orgId}" --format='value(name)' | head -5`
  );
  orgLine = `org=${orgId}${folders ? ` folders=${folders.replace(/\n/g, ',')}` : ''}`;
}
lines.push(`organization: ${orgLine}`);

// folder (from project parent)
const projectParent = runShellSilent(
  "gcloud projects describe beauessence-clinic-stg-c1a01 --format='value(parent)' 2>/dev/null"
);
lines.push(`folder: ${projectParent || 'unknown'}`);

// billing account
const billing = runShellSilent(
  'gcloud billing accounts list --format="value(name)" | head -1'
);
lines.push(`billing account: ${billing ? 'present' : 'absent'}`);

// ADC
const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'unset';
lines.push(`GOOGLE_APPLICATION_CREDENTIALS: ${gac}`);

let adcIdentity = 'UNVERIFIED';
let adcToken = '';
let adcSource;
if (gac !== 'unset') {
  adcSource = 'GAC-env';
} else {
  adcToken = runShellSilent(
    'gcloud auth application-default print-access-token >/dev/null 2>&1 && echo ADC_TOKEN_OK || echo ADC_MISSING'
  );
  if (adcToken.includes('ADC_TOKEN_OK')) {
    adcSource = 'user-adc'; // could be impersonation too; we don't distinguish here
    adcIdentity = 'token-present';
  } else {
    adcSource = 'missing';
  }
}
lines.push(`ADC identity / source: ${adcIdentity} / ${adcSource}`);

// Firebase CLI
const firebaseLoginOutput = runShellSilent('firebase login:list 2>/dev/null');
const firebaseAccount = parseFirebaseLoginAccount(firebaseLoginOutput);
lines.push(
  `Firebase CLI account: ${firebaseAccount ? redactAccount(firebaseAccount) : 'UNSET'}`
);

const firebaseProjects = runShellSilent(
  'firebase projects:list 2>/dev/null | grep -F beauessence-clinic-stg-c1a01'
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
const hasAdcToken = gac !== 'unset' || adcToken.includes('ADC_TOKEN_OK');
const agree =
  gcloudProject === 'beauessence-clinic-stg-c1a01' &&
  hasAdcToken &&
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
