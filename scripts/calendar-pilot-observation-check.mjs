import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const digest = /^[a-f0-9]{64}$/u;

// This checks sanitized operator-supplied observations; it cannot prove their provenance.
export function checkCalendarPilotObservations(input) {
  if (!Array.isArray(input) || input.length < 50)
    throw new Error('At least 50 synthetic observations are required.');
  const ids = new Set();
  let expectedLinkIds;
  let blocked = 0;
  let conflicts = 0;
  for (const observation of input) {
    if (typeof observation !== 'object' || observation === null || Array.isArray(observation) ||
        !Number.isSafeInteger(observation.trial) || observation.trial < 1 || ids.has(observation.trial) ||
        !Array.isArray(observation.links) || observation.links.length === 0)
      throw new Error('Invalid or duplicate observation.');
    ids.add(observation.trial);
    const linkIds = new Set();
    for (const link of observation.links) {
      if (typeof link !== 'object' || link === null || Array.isArray(link) ||
          typeof link.id !== 'string' || !/^synthetic_[a-z0-9_]{1,64}$/u.test(link.id) || linkIds.has(link.id))
        throw new Error('Invalid or duplicate synthetic link.');
      linkIds.add(link.id);
      if (link.outcome === 'blocked') { blocked += 1; continue; }
      if (link.outcome === 'conflict') { conflicts += 1; continue; }
      if (link.outcome !== 'converged' || link.eventCount !== 1 ||
          typeof link.expectedDigest !== 'string' || !digest.test(link.expectedDigest) ||
          typeof link.observedDigest !== 'string' || link.expectedDigest !== link.observedDigest)
        throw new Error('A converged link must have one matching event.');
    }
    if (expectedLinkIds === undefined) expectedLinkIds = linkIds;
    else if (linkIds.size !== expectedLinkIds.size || [...linkIds].some((id) => !expectedLinkIds.has(id)))
      throw new Error('Every observation must contain the same synthetic links.');
  }
  return { observations: input.length, blocked, conflicts, allConverged: blocked === 0 && conflicts === 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Provide one sanitized JSON observation file.');
    const result = checkCalendarPilotObservations(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.allConverged) process.exitCode = 1;
  } catch {
    process.stderr.write('Invalid or incomplete synthetic observations.\n');
    process.exitCode = 1;
  }
}
