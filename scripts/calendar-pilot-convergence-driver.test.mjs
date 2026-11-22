import { describe, expect, it } from 'vitest';

import { checkCalendarPilotObservations } from './calendar-pilot-observation-check.mjs';
import {
  planTrials,
  REQUIRED_PROJECT_ID,
  sanitizeLink
} from './calendar-pilot-fault-trials.mjs';
import {
  createConvergenceDriver,
  readDriverGuard
} from './calendar-pilot-convergence-driver.mjs';

const env = {
  CALENDAR_PILOT_TRIAL_PROJECT_ID: REQUIRED_PROJECT_ID,
  CALENDAR_PILOT_TRIAL_CALENDAR_ID:
    'synthetic-trials-1@group.calendar.google.com'
};
const fields = (linkId) => ({
  id: `calpilot${linkId}`,
  linkId,
  status: 'confirmed',
  title: 't',
  startsAt: '2026-11-23T01:00:00.000Z',
  endsAt: '2026-11-23T01:30:00.000Z'
});

// Fake Calendar/Firestore: every readScanMarker call after a "scan" yields a new value.
function fakePorts(overrides = {}) {
  let tick = 0;
  const calls = { mutate: 0, calendarIds: [] };
  return {
    calls,
    readScanMarker: () => `m${Math.floor(tick++ / 2)}`,
    readExpected: (linkId) => fields(linkId),
    listEvents: (calendarId, linkId) => {
      calls.calendarIds.push(calendarId);
      return [fields(linkId)];
    },
    ...overrides
  };
}
const make = (ports, extra = {}, e = env) =>
  createConvergenceDriver({
    env: e,
    ports,
    pollMs: 0,
    wait: () => Promise.resolve(),
    ...extra
  });
const item = (links = ['synthetic_a', 'synthetic_b']) => ({
  trial: 1,
  scenario: 'x',
  links
});

describe('calendar pilot convergence driver guard', () => {
  it('accepts only the authorised project, synthetic calendar and cap <= 50', () => {
    expect(readDriverGuard(env)).toEqual({
      calendarId: env.CALENDAR_PILOT_TRIAL_CALENDAR_ID,
      maxWrites: 50
    });
    for (const bad of [
      { CALENDAR_PILOT_TRIAL_PROJECT_ID: 'other' },
      { GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-staging' },
      { CALENDAR_PILOT_TRIAL_CALENDAR_ID: 'primary' },
      { CALENDAR_PILOT_TRIAL_CALENDAR_ID: undefined },
      { CALENDAR_PILOT_DRIVER_MAX_WRITES: '51' },
      { CALENDAR_PILOT_DRIVER_MAX_WRITES: '0' },
      { CALENDAR_PILOT_DRIVER_MAX_WRITES: 'x' }
    ])
      expect(() => readDriverGuard({ ...env, ...bad })).toThrow();
    expect(
      readDriverGuard({ ...env, CALENDAR_PILOT_DRIVER_MAX_WRITES: '20' })
        .maxWrites
    ).toBe(20);
  });
});

describe('calendar pilot convergence driver', () => {
  it('produces 50 observations the checker accepts, using only the env calendar', async () => {
    const ports = fakePorts();
    const driver = make(ports);
    const plan = planTrials({
      trials: 50,
      linkIds: ['synthetic_a', 'synthetic_b']
    });
    const observations = [];
    for (const trial of plan)
      observations.push({
        trial: trial.trial,
        links: (await driver.runTrial(trial)).map(sanitizeLink)
      });
    expect(checkCalendarPilotObservations(observations)).toEqual({
      observations: 50,
      blocked: 0,
      conflicts: 0,
      allConverged: true
    });
    expect(new Set(ports.calls.calendarIds)).toEqual(
      new Set([env.CALENDAR_PILOT_TRIAL_CALENDAR_ID])
    );
  });

  it('refuses non-synthetic link ids and bad environments', async () => {
    await expect(make(fakePorts()).runTrial(item(['real_1']))).rejects.toThrow(
      'non-synthetic'
    );
    expect(() =>
      make(fakePorts(), {}, { ...env, CALENDAR_PILOT_TRIAL_PROJECT_ID: 'x' })
    ).toThrow();
  });

  it.each([
    ['duplicate events', { listEvents: (_c, id) => [fields(id), fields(id)] }],
    ['missing event', { listEvents: () => [] }],
    [
      'title drift',
      {
        listEvents: (_c, id) => [{ ...fields(id), title: 'other' }]
      }
    ],
    ['missing expectation', { readExpected: () => undefined }],
    ['foreign expectation', { readExpected: () => fields('synthetic_other') }]
  ])('stops on %s', async (_name, override) => {
    await expect(
      make(fakePorts(override)).runTrial(item(['synthetic_a']))
    ).rejects.toThrow('Stop');
  });

  it('stops when no new scan round completes', async () => {
    await expect(
      make(fakePorts({ readScanMarker: () => 'same' }), {
        waitMs: 20,
        pollMs: 10
      }).runTrial(item())
    ).rejects.toThrow('no new full scan round');
  });

  it('stops at the window write cap', async () => {
    const ports = fakePorts({ mutate: () => Promise.resolve() });
    const driver = make(
      ports,
      {},
      {
        ...env,
        CALENDAR_PILOT_DRIVER_MAX_WRITES: '3'
      }
    );
    await driver.runTrial(item());
    await expect(driver.runTrial(item())).rejects.toThrow('write cap');
  });

  it('retries 5xx but stops after three in a row', async () => {
    let failures = 0;
    const flaky = fakePorts({
      readExpected: (id) => {
        if (failures++ < 2)
          throw Object.assign(new Error('x'), { status: 503 });
        return fields(id);
      }
    });
    await expect(
      make(flaky).runTrial(item(['synthetic_a']))
    ).resolves.toHaveLength(1);
    const down = fakePorts({
      readExpected: () => {
        throw Object.assign(new Error('x'), { status: 500 });
      }
    });
    await expect(make(down).runTrial(item(['synthetic_a']))).rejects.toThrow(
      '5xx'
    );
  });
});
