import { pathToFileURL } from 'node:url';

import { REQUIRED_PROJECT_ID } from './calendar-pilot-fault-trials.mjs';

// Operator-only "normal convergence" driver for calendar-pilot-fault-trials.mjs
// (`--driver <this file>`). It injects no faults and creates no Calendar or Firestore
// client itself: the operator's separately authorised ports do all external access.
// Not run by CI; the tests use fake ports.
export const MAX_WINDOW_WRITES = 50;
export const MAX_CONSECUTIVE_5XX = 3;
const SYNTHETIC_LINK = /^synthetic_[a-z0-9_]{1,64}$/u;
// Same dedicated-calendar rule as calendar-pilot-fault-trials.mjs.
const SYNTHETIC_CALENDAR =
  /^synthetic[a-z0-9_-]{3,64}@group\.calendar\.google\.com$/u;

// Throws on anything outside the authorised synthetic project, calendar and write cap.
export function readDriverGuard(env) {
  if (
    env.CALENDAR_PILOT_TRIAL_PROJECT_ID !== REQUIRED_PROJECT_ID ||
    (env.GOOGLE_CLOUD_PROJECT !== undefined &&
      env.GOOGLE_CLOUD_PROJECT !== REQUIRED_PROJECT_ID)
  )
    throw new Error('Project is not the authorised synthetic project.');
  const calendarId = env.CALENDAR_PILOT_TRIAL_CALENDAR_ID;
  if (typeof calendarId !== 'string' || !SYNTHETIC_CALENDAR.test(calendarId))
    throw new Error('A dedicated synthetic calendar id is required.');
  const raw = env.CALENDAR_PILOT_DRIVER_MAX_WRITES;
  const maxWrites = raw === undefined ? MAX_WINDOW_WRITES : Number(raw);
  if (
    !Number.isSafeInteger(maxWrites) ||
    maxWrites < 1 ||
    maxWrites > MAX_WINDOW_WRITES
  )
    throw new Error('Window write cap must be an integer from 1 to 50.');
  return { calendarId, maxWrites };
}

// Same fields, in the runbook's digest order; ports return UTC ISO times.
const FIELDS = ['id', 'linkId', 'status', 'title', 'startsAt', 'endsAt'];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ports: readScanMarker() -> string | undefined   (config lastSuccessfulSyncAt)
//        readExpected(linkId) -> { id, linkId, status, title, startsAt, endsAt } | undefined
//        listEvents(calendarId, linkId) -> every page's events, same field names
//        mutate?(linkId, trial)  optional; each call counts as one window write
export function createConvergenceDriver({
  env,
  ports,
  waitMs = 600_000,
  pollMs = 5_000,
  wait = sleep
}) {
  const { calendarId, maxWrites } = readDriverGuard(env);
  let writes = 0;
  let marker;
  let started = false;
  let consecutive5xx = 0;

  // Retries only 5xx, up to the plan's stop limit; everything else stops the window.
  const call = async (operation) => {
    for (;;) {
      try {
        const result = await operation();
        consecutive5xx = 0;
        return result;
      } catch (error) {
        const status = error?.status ?? error?.code;
        if (!(Number.isInteger(status) && status >= 500 && status < 600))
          throw error;
        consecutive5xx += 1;
        if (consecutive5xx >= MAX_CONSECUTIVE_5XX)
          throw new Error('Stop: three consecutive 5xx responses.', {
            cause: error
          });
        await wait(pollMs);
      }
    }
  };

  const waitForNewScanRound = async () => {
    if (!started) {
      marker = await call(() => ports.readScanMarker());
      started = true;
    }
    for (let waited = 0; waited <= waitMs; waited += pollMs) {
      const next = await call(() => ports.readScanMarker());
      if (typeof next === 'string' && next !== marker) {
        marker = next;
        return;
      }
      await wait(pollMs);
    }
    throw new Error('Stop: no new full scan round completed.');
  };

  return {
    async runTrial(item) {
      if (!Array.isArray(item.links) || item.links.length === 0)
        throw new Error('Stop: no synthetic links.');
      if (item.links.some((id) => !SYNTHETIC_LINK.test(id)))
        throw new Error('Stop: non-synthetic link id.');
      if (ports.mutate !== undefined) {
        for (const linkId of item.links) {
          if (writes >= maxWrites)
            throw new Error('Stop: window write cap reached.');
          writes += 1;
          await call(() => ports.mutate(linkId, item.trial));
        }
      }
      await waitForNewScanRound();
      const results = [];
      for (const linkId of item.links) {
        const expected = await call(() => ports.readExpected(linkId));
        const events = await call(() => ports.listEvents(calendarId, linkId));
        const [observed] = events;
        // Anything but exactly one matching event is a stop, never a counted convergence.
        if (
          expected === undefined ||
          expected.linkId !== linkId ||
          events.length !== 1 ||
          observed.id !== expected.id ||
          FIELDS.some((field) => observed[field] !== expected[field])
        )
          throw new Error('Stop: link did not converge to one owned event.');
        results.push({
          id: linkId,
          outcome: 'converged',
          eventCount: 1,
          expected,
          observed
        });
      }
      return results;
    }
  };
}

let driver;
// Entry point used by `--driver`: the operator's ports module (ESM) is named by env and
// must export createPorts({ calendarId, projectId }).
export async function runTrial(item, env = process.env) {
  if (driver === undefined) {
    const path = env.CALENDAR_PILOT_DRIVER_PORTS;
    if (!path) throw new Error('CALENDAR_PILOT_DRIVER_PORTS is required.');
    const { calendarId } = readDriverGuard(env);
    const module = await import(pathToFileURL(path).href);
    driver = createConvergenceDriver({
      env,
      ports: await module.createPorts({
        calendarId,
        projectId: REQUIRED_PROJECT_ID
      })
    });
  }
  return driver.runTrial(item);
}
