import assert from 'node:assert/strict';
import { checkCalendarPilotObservations } from './calendar-pilot-observation-check.mjs';

const hash = 'a'.repeat(64);
const observations = Array.from({ length: 50 }, (_, index) => ({
  trial: index + 1,
  links: [{ id: 'synthetic_link', outcome: 'converged', eventCount: 1, expectedDigest: hash, observedDigest: hash }]
}));
assert.deepEqual(checkCalendarPilotObservations(observations), { observations: 50, blocked: 0, conflicts: 0, allConverged: true });
assert.throws(() => checkCalendarPilotObservations(observations.slice(0, 49)));
assert.throws(() => checkCalendarPilotObservations([...observations, observations[0]]));
assert.throws(() => checkCalendarPilotObservations([{ ...observations[0], links: [{ ...observations[0].links[0], id: 'synthetic_other' }] }, ...observations.slice(1)]));
assert.throws(() => checkCalendarPilotObservations([{ ...observations[0], links: [{ ...observations[0].links[0], eventCount: 2 }] }, ...observations.slice(1)]));
assert.throws(() => checkCalendarPilotObservations([{ ...observations[0], links: [{ ...observations[0].links[0], observedDigest: 'b'.repeat(64) }] }, ...observations.slice(1)]));
assert.equal(checkCalendarPilotObservations([{ ...observations[0], links: [{ id: 'synthetic_link', outcome: 'blocked' }] }, ...observations.slice(1)]).allConverged, false);
assert.equal(checkCalendarPilotObservations([{ ...observations[0], links: [{ id: 'synthetic_link', outcome: 'conflict' }] }, ...observations.slice(1)]).allConverged, false);
process.stdout.write('synthetic observation checks passed\n');
