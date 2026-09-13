#!/usr/bin/env node
/**
 * Luna Checkpoint Writer
 *
 * Writes `output/evidence/luna-checkpoint.txt` with the standard checkpoint block.
 * Reads current git state and accepts CLI args for the variable fields.
 *
 * Usage:
 *   node scripts/luna-checkpoint.mjs \
 *     --phase 0 \
 *     --completed "0" \
 *     --in-progress "Card 8 isolated project read-back" \
 *     --blockers "none" \
 *     --booking UNROUTED \
 *     --test-state "gates PASS" \
 *     --authority "PRODUCTION=NO REAL_DATA=NO DNS=NO LIVE_HOSTING=NO PROD_CALENDAR=NO BOOKING=UNROUTED" \
 *     --cloud-state "isolated=beauessence-clinic-stg-c1a01 production=NOT_AUTHORIZED" \
 *     --identity-state "gcloud=missing adc=UNAVAILABLE firebase=verified terraform=missing" \
 *     --browser-state "clinic-synthetic=UNAVAILABLE default-browser-unsupported" \
 *     --resolved-blockers "Firebase CLI login/project-list read-back; branch protection read-back" \
 *     --human-blocker-queue "PR #116 merge authority; owner Chrome profile; gcloud/ADC; terraform; D-series approvals; TW-05" \
 *     --next-action "Card 8 isolated project read-back"
 *
 * All args optional; defaults pulled from git where possible.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EVIDENCE_DIR = join(ROOT, 'output', 'evidence');

function run(cmd) {
  const [exe, ...args] = cmd.split(' ');
  const result = spawnSync(exe, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false
  });
  if (result.error || result.status !== 0) {
    return '';
  }
  return result.stdout.trim();
}

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = process.argv[i + 1]?.startsWith('--')
        ? ''
        : process.argv[++i];
      args[key] = val;
    }
  }
  return args;
}

const cli = parseArgs();

mkdirSync(EVIDENCE_DIR, { recursive: true });

// Git-derived values
const baseMain = run('git rev-parse origin/main');
const head = run('git rev-parse HEAD');
const workBranch = run('git branch --show-current');

// CLI overrides or defaults
const phase = cli.phase || '0';
const completed = cli.completed || phase;
const inProgress = cli['in-progress'] || `Phase ${phase} work`;
const blockers = cli.blockers || 'none';
const testState = cli['test-state'] || 'gates PASS';
const authority =
  cli.authority ||
  'PRODUCTION=NO REAL_DATA=NO DNS=NO LIVE_HOSTING=NO PROD_CALENDAR=NO BOOKING=UNROUTED';
const cloudState =
  cli['cloud-state'] ||
  'isolated=beauessence-clinic-stg-c1a01 production=NOT_AUTHORIZED';
const identityState =
  cli['identity-state'] ||
  'gcloud=missing adc=UNAVAILABLE firebase=verified terraform=missing';
const browserState =
  cli['browser-state'] ||
  'clinic-synthetic=UNAVAILABLE default-browser-unsupported';
const resolvedBlockers =
  cli['resolved-blockers'] ||
  'Firebase CLI login/project-list read-back; branch protection read-back';
const humanBlockerQueue =
  cli['human-blocker-queue'] ||
  'PR #116 merge authority; owner Chrome profile; gcloud/ADC; terraform; D-series approvals; TW-05';
const nextAction = cli['next-action'] || `Continue Phase ${phase}`;

const now =
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    dateStyle: 'short',
    timeStyle: 'medium',
    hourCycle: 'h23'
  })
    .format(new Date())
    .replace(' ', 'T') + '+08:00';

const lines = [];
lines.push(`PROJECT: waydefu/clinic`);
lines.push(`BASE MAIN: ${baseMain || 'UNKNOWN'}`);
lines.push(`WORK BRANCH: ${workBranch || 'cursor/luna-local-now'}`);
lines.push(`HEAD: ${head || 'UNKNOWN'}`);
lines.push(`CURRENT PHASE: ${phase}`);
lines.push(`COMPLETED: ${completed}`);
lines.push(`IN PROGRESS: ${inProgress}`);
lines.push(`BLOCKERS: ${blockers}`);
lines.push(`AUTHORITY: ${authority}`);
lines.push(`CLOUD STATE: ${cloudState}`);
lines.push(`IDENTITY STATE: ${identityState}`);
lines.push(`BROWSER STATE: ${browserState}`);
lines.push(`RESOLVED BLOCKERS: ${resolvedBlockers}`);
lines.push(`HUMAN BLOCKER QUEUE: ${humanBlockerQueue}`);
lines.push(`TEST STATE: ${testState}`);
lines.push(`NEXT EXACT ACTION: ${nextAction}`);
lines.push(
  `DO NOT REOPEN: C0-C6 synthetic slices; PR #112; vendor comment-drift on 16e3bfc`
);
lines.push(`TIMESTAMP: ${now} Asia/Taipei`);

const output = lines.join('\n') + '\n';

const outPath = join(EVIDENCE_DIR, 'luna-checkpoint.txt');
writeFileSync(outPath, output);

console.log(output);
console.log(`\nWritten to ${outPath}`);
