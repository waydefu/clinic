import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkCalendarPilotObservations } from './calendar-pilot-observation-check.mjs';
import {
  executeTrials,
  parseTrialArguments,
  REQUIRED_PROJECT_ID
} from './calendar-pilot-fault-trials.mjs';

const env = {
  CALENDAR_PILOT_TRIAL_PROJECT_ID: REQUIRED_PROJECT_ID,
  CALENDAR_PILOT_TRIAL_CALENDAR_ID:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef@group.calendar.google.com',
  CALENDAR_PILOT_TRIAL_AUTHORIZATION: 'ref'
};
const fields = (id) => ({
  id: `e_${id}`,
  linkId: id,
  status: 'confirmed',
  title: 't',
  startsAt: 's',
  endsAt: 'n'
});
const converge = (item) =>
  Promise.resolve(
    item.links.map((id) => ({
      id,
      outcome: 'converged',
      eventCount: 1,
      expected: fields(id),
      observed: fields(id)
    }))
  );
const directory = mkdtempSync(join(tmpdir(), 'trials-'));
const args = (...extra) =>
  parseTrialArguments(
    [
      '--links',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '--execute-synthetic-trials',
      '--driver',
      'd.mjs',
      ...extra
    ],
    env
  );
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

describe('fault trials resume', () => {
  it('accumulates 20 + 30 trials into one result the checker accepts', async () => {
    const out = join(directory, 'a.json');
    await executeTrials(args('--out', out, '--limit', '20'), converge);
    expect(read(out)).toHaveLength(20);
    expect(() => checkCalendarPilotObservations(read(out))).toThrow();
    await executeTrials(args('--resume', out, '--limit', '30'), converge);
    expect(checkCalendarPilotObservations(read(out)).allConverged).toBe(true);
    expect(read(out).map((item) => item.trial)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1)
    );
  });

  it('keeps completed trials when a later one throws', async () => {
    const out = join(directory, 'b.json');
    let calls = 0;
    await expect(
      executeTrials(args('--out', out), (item) =>
        ++calls === 8 ? Promise.reject(new Error('stop')) : converge(item)
      )
    ).rejects.toThrow('stop');
    expect(read(out)).toHaveLength(7);
    await executeTrials(args('--resume', out), converge);
    expect(checkCalendarPilotObservations(read(out)).observations).toBe(50);
  });

  it('refuses an existing --out, a foreign resume file, and bad arguments', async () => {
    const out = join(directory, 'c.json');
    await executeTrials(args('--out', out, '--limit', '1'), converge);
    await expect(executeTrials(args('--out', out), converge)).rejects.toThrow(
      'already exists'
    );
    const other = parseTrialArguments(
      [
        '--links',
        '11111111111111111111111111111111,22222222222222222222222222222222',
        '--execute-synthetic-trials',
        '--driver',
        'd.mjs',
        '--resume',
        out
      ],
      env
    );
    await expect(executeTrials(other, converge)).rejects.toThrow('Resume');
    expect(() => args()).toThrow();
    expect(() => args('--out', 'o', '--resume', 'r')).toThrow();
    expect(() => args('--out', 'o', '--limit', '0')).toThrow();
  });
});

process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
