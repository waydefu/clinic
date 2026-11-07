import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Operator-only. Not run by CI or any repo script. Defaults to a dry run that touches nothing.
export const REQUIRED_PROJECT_ID = 'beauessence-clinic-stg-c1a01';
export const SCENARIOS = [
  'lease_lost_during_dispatch',
  'precondition_failed_412',
  'provider_503',
  'unknown_outcome',
  'duplicate_events',
  'cursor_invalid',
  'restart_mid_scan',
  'stuck_owner'
];
const executeFlag = '--execute-synthetic-trials';

// Throws unless the arguments and environment are safe; never reads credentials.
export function parseTrialArguments(argv, env) {
  const options = { execute: false, trials: 50, linkIds: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === executeFlag) options.execute = true;
    else if (arg === '--trials') options.trials = Number(argv[++i]);
    else if (arg === '--links') options.linkIds = (argv[++i] ?? '').split(',');
    else if (arg === '--driver') options.driver = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else throw new Error('Unknown argument.');
  }
  if (!Number.isSafeInteger(options.trials) || options.trials < 50)
    throw new Error('At least 50 trials are required.');
  if (
    options.linkIds.length === 0 ||
    new Set(options.linkIds).size !== options.linkIds.length ||
    options.linkIds.some((id) => !/^synthetic_[a-z0-9_]{1,64}$/u.test(id))
  )
    throw new Error('Provide unique synthetic_ link ids with --links.');
  if (!options.execute) {
    if (options.driver !== undefined || options.out !== undefined)
      throw new Error('--driver and --out require the execute flag.');
    return options;
  }
  const calendarId = env.CALENDAR_PILOT_TRIAL_CALENDAR_ID;
  if (env.CALENDAR_PILOT_TRIAL_PROJECT_ID !== REQUIRED_PROJECT_ID)
    throw new Error('Project id is not the authorised synthetic project.');
  if (
    typeof calendarId !== 'string' ||
    !/^synthetic[a-z0-9_-]{3,64}@group\.calendar\.google\.com$/u.test(
      calendarId
    )
  )
    throw new Error('A dedicated synthetic calendar id is required.');
  if (!env.CALENDAR_PILOT_TRIAL_AUTHORIZATION)
    throw new Error('An authorisation reference is required.');
  if (!options.driver || !options.out)
    throw new Error('--driver and --out are required to execute.');
  return options;
}

const digest = (fields) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        fields.id,
        fields.linkId,
        fields.status,
        fields.title,
        fields.startsAt,
        fields.endsAt
      ])
    )
    .digest('hex');

// Keeps only digests and counts; the driver's raw event fields never reach the output.
export function sanitizeLink(link) {
  if (link.outcome === 'blocked' || link.outcome === 'conflict')
    return { id: link.id, outcome: link.outcome };
  return {
    id: link.id,
    outcome: 'converged',
    eventCount: link.eventCount,
    expectedDigest: digest(link.expected),
    observedDigest: digest(link.observed)
  };
}

export function planTrials(options) {
  return Array.from({ length: options.trials }, (_, index) => ({
    trial: index + 1,
    scenario: SCENARIOS[index % SCENARIOS.length],
    links: options.linkIds
  }));
}

async function main() {
  const options = parseTrialArguments(process.argv.slice(2), process.env);
  const plan = planTrials(options);
  if (!options.execute) {
    process.stdout.write(`${JSON.stringify({ dryRun: true, plan })}\n`);
    return;
  }
  // The driver is the operator's separately authorised Calendar/Firestore access.
  const driver = await import(pathToFileURL(resolve(options.driver)).href);
  const observations = [];
  for (const item of plan) {
    const links = await driver.runTrial(item);
    observations.push({ trial: item.trial, links: links.map(sanitizeLink) });
  }
  writeFileSync(options.out, `${JSON.stringify(observations)}\n`, {
    flag: 'wx'
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    process.stderr.write('Synthetic fault trials refused or failed.\n');
    process.exitCode = 1;
  });
}
