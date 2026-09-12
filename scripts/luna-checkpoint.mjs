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
const booking = cli.booking || 'UNROUTED';
const testState = cli['test-state'] || 'gates PASS';
const nextAction = cli['next-action'] || `Continue Phase ${phase}`;

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

const lines = [];
lines.push(`PROJECT: waydefu/clinic`);
lines.push(`BASE MAIN: ${baseMain || 'UNKNOWN'}`);
lines.push(`WORK BRANCH: ${workBranch || 'cursor/luna-local-now'}`);
lines.push(`HEAD: ${head || 'UNKNOWN'}`);
lines.push(`CURRENT PHASE: ${phase}`);
lines.push(`COMPLETED: ${completed}`);
lines.push(`IN PROGRESS: ${inProgress}`);
lines.push(`BLOCKERS: ${blockers}`);
lines.push(
  `AUTHORITY: PRODUCTION=NO REAL_DATA=NO DNS=NO LIVE_HOSTING=NO PROD_CALENDAR=NO BOOKING=${booking}`
);
lines.push(
  `CLOUD STATE: isolated=beauessence-clinic-stg-c1a01 staging=CAL-PILOT+preview-only production=NOT_AUTHORIZED`
);
lines.push(
  `IDENTITY STATE: gcloud_account=<email-or-UNVERIFIED> gcloud_config=<clinic-staging|clinic-production|other> adc_source=<user-adc|impersonation|GAC-env|UNVERIFIED> firebase_account=<email-or-UNSET> gac_env=<unset|path-only>`
);
lines.push(
  `BROWSER STATE: profile=<clinic-synthetic|clinic-production> account=<verified|unverified> mix=NO`
);
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
