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

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ISOLATED_C1_PROJECT_ID } from './internal-test-c1-identity.mjs';
import {
  commandSucceeds,
  outputLines,
  parseFirebaseLoginAccount,
  redactAccount,
  runCommand
} from './phase0-snapshot-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EVIDENCE_DIR = join(ROOT, 'output', 'evidence');

// Every command is an argv array run without a shell (E2-07). What the old
// pipes did (grep, head, awk) is done on the output here.
const run = (argv) => runCommand(argv, { cwd: ROOT });
const firstLine = (text) => outputLines(text)[0] ?? '';

mkdirSync(EVIDENCE_DIR, { recursive: true });

const lines = [];
lines.push('ACCOUNT_CONTEXT_SNAPSHOT');
lines.push(`environment: synthetic-isolated`);
lines.push(
  `current authority: GROK_UNRESTED / GROK_PROJECT_CLOSER + LUNA_SOLE_EXECUTOR; GROK_RESTS superseded 2026-09-13 (not production)`
);

// gcloud configuration
const gcloudConfig =
  outputLines(
    run([
      'gcloud',
      'config',
      'configurations',
      'list',
      '--filter=is_active=true',
      '--format=value(name)'
    ])
  ).find((name) => name === 'clinic-staging') ?? '';
lines.push(`gcloud configuration: ${gcloudConfig || 'MISSING'}`);

// gcloud identity
const gcloudAccount = run(['gcloud', 'config', 'get-value', 'account']);
lines.push(
  `gcloud identity: ${gcloudAccount ? redactAccount(gcloudAccount) : 'UNVERIFIED'}`
);

// gcloud project
const gcloudProject = run(['gcloud', 'config', 'get-value', 'project']);
lines.push(`gcloud project: ${gcloudProject || 'UNSET'}`);

// organization
const orgId = firstLine(
  run(['gcloud', 'organizations', 'list', '--format=value(name)'])
);
let orgLine = 'ORG_VISIBLE=no';
if (orgId) {
  const folders = outputLines(
    run([
      'gcloud',
      'resource-manager',
      'folders',
      'list',
      `--organization=${orgId}`,
      '--format=value(name)'
    ])
  ).slice(0, 5);
  orgLine = `org=${orgId}${folders.length > 0 ? ` folders=${folders.join(',')}` : ''}`;
}
lines.push(`organization: ${orgLine}`);

// folder (from project parent)
const projectParent = run([
  'gcloud',
  'projects',
  'describe',
  ISOLATED_C1_PROJECT_ID,
  '--format=value(parent)'
]);
lines.push(`folder: ${projectParent || 'unknown'}`);

// billing account
const billing = firstLine(
  run(['gcloud', 'billing', 'accounts', 'list', '--format=value(name)'])
);
lines.push(`billing account: ${billing ? 'present' : 'absent'}`);

// ADC
const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'unset';
lines.push(`GOOGLE_APPLICATION_CREDENTIALS: ${gac}`);

let adcIdentity = 'UNVERIFIED';
let adcTokenOk = false;
let adcSource;
if (gac !== 'unset') {
  adcSource = 'GAC-env';
} else {
  // Exit status only: the access token is never captured.
  adcTokenOk = commandSucceeds(
    ['gcloud', 'auth', 'application-default', 'print-access-token'],
    { cwd: ROOT }
  );
  if (adcTokenOk) {
    adcSource = 'user-adc'; // could be impersonation too; we don't distinguish here
    adcIdentity = 'token-present';
  } else {
    adcSource = 'missing';
  }
}
lines.push(`ADC identity / source: ${adcIdentity} / ${adcSource}`);

// Firebase CLI
const firebaseLoginOutput = run(['firebase', 'login:list']);
const firebaseAccount = parseFirebaseLoginAccount(firebaseLoginOutput);
lines.push(
  `Firebase CLI account: ${firebaseAccount ? redactAccount(firebaseAccount) : 'UNSET'}`
);

const firebaseProjects = outputLines(run(['firebase', 'projects:list']))
  .filter((line) => line.includes(ISOLATED_C1_PROJECT_ID))
  .join('\n');
lines.push(
  `Firebase project: ${ISOLATED_C1_PROJECT_ID} listed? ${firebaseProjects ? 'yes' : 'no'}`
);

// Browser (manual check reminder)
lines.push(
  `browser Google account / Chrome profile: clinic-synthetic (manual verify)`
);

// Terraform target
lines.push(`Terraform target: none this card (no apply)`);

// Agreement check
const hasAdcToken = gac !== 'unset' || adcTokenOk;
const agree =
  gcloudProject === ISOLATED_C1_PROJECT_ID &&
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
