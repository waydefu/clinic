import assert from 'node:assert/strict';
import { checkCalendarPilotObservations } from './calendar-pilot-observation-check.mjs';
import {
  parseTrialArguments,
  planTrials,
  REQUIRED_PROJECT_ID,
  sanitizeLink
} from './calendar-pilot-fault-trials.mjs';

const links = [
  '--links',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
];
const env = {
  CALENDAR_PILOT_TRIAL_PROJECT_ID: REQUIRED_PROJECT_ID,
  CALENDAR_PILOT_TRIAL_CALENDAR_ID:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef@group.calendar.google.com',
  CALENDAR_PILOT_TRIAL_AUTHORIZATION: 'ref'
};
const execute = [
  ...links,
  '--execute-synthetic-trials',
  '--driver',
  'd.mjs',
  '--out',
  'o.json'
];

// Default is a dry run and needs no environment.
assert.equal(parseTrialArguments(links, {}).execute, false);
assert.throws(() => parseTrialArguments([...links, '--out', 'o.json'], {}));
assert.throws(() => parseTrialArguments([...links, '--trials', '49'], {}));
assert.throws(() => parseTrialArguments(['--trials', '50'], {}));
assert.throws(() => parseTrialArguments([...links, '--bogus'], {}));
// Execute needs the exact project, a dedicated synthetic calendar and a reference.
assert.equal(parseTrialArguments(execute, env).execute, true);
assert.throws(() => parseTrialArguments(execute, {}));
assert.throws(() =>
  parseTrialArguments(execute, {
    ...env,
    CALENDAR_PILOT_TRIAL_PROJECT_ID: 'other'
  })
);
for (const calendar of ['primary', 'clinic@gmail.com', undefined])
  assert.throws(() =>
    parseTrialArguments(execute, {
      ...env,
      CALENDAR_PILOT_TRIAL_CALENDAR_ID: calendar
    })
  );
assert.throws(() =>
  parseTrialArguments(execute, {
    ...env,
    CALENDAR_PILOT_TRIAL_AUTHORIZATION: ''
  })
);
assert.throws(() => parseTrialArguments(execute.slice(0, -2), env));

// Output is accepted by the observation checker and carries no raw fields.
const plan = planTrials(parseTrialArguments(links, {}));
assert.equal(plan.length, 50);
const fields = {
  id: 'e',
  linkId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  status: 'confirmed',
  title: 't',
  startsAt: 's',
  endsAt: 'n'
};
const sanitized = sanitizeLink({
  id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  outcome: 'converged',
  eventCount: 1,
  expected: fields,
  observed: fields
});
assert.deepEqual(Object.keys(sanitized).sort(), [
  'eventCount',
  'expectedDigest',
  'id',
  'observedDigest',
  'outcome'
]);
const blocked = sanitizeLink({
  id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  outcome: 'blocked'
});
assert.equal(
  checkCalendarPilotObservations(
    plan.map((item) => ({ trial: item.trial, links: [sanitized, blocked] }))
  ).blocked,
  50
);
process.stdout.write('synthetic fault trial guard checks passed\n');
