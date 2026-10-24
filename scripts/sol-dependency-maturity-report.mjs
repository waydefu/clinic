import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const directory = 'output/supply-chain-diagnostic';
const packages = [
  { name: 'zod', version: '4.6.6', file: 'zod-time.json' },
  { name: 'fast-uri', version: '3.1.9', file: 'fast-uri-time.json' },
  { name: 'fast-uri', version: '4.2.3', file: 'fast-uri-time.json' }
];
const observedAt = new Date();
const releases = packages.map(({ name, version, file }) => {
  const time = JSON.parse(readFileSync(`${directory}/${file}`, 'utf8'));
  assert.equal(typeof time[version], 'string', `Missing published release: ${name}@${version}`);
  const releasedAt = new Date(time[version]);
  assert(Number.isFinite(releasedAt.getTime()));
  const ageMs = observedAt.getTime() - releasedAt.getTime();
  return { name, version, releasedAt: releasedAt.toISOString(), eligibleAt: new Date(releasedAt.getTime() + 24 * 60 * 60_000).toISOString(), ageMs, mature24Hours: ageMs >= 24 * 60 * 60_000 };
});
const result = { input: readFileSync(`${directory}/input-commit.txt`, 'utf8').trim(), diagnostic: readFileSync(`${directory}/diagnostic-commit.txt`, 'utf8').trim(), observedAt: observedAt.toISOString(), releases, policySha256: createHash('sha256').update(readFileSync('pnpm-workspace.yaml')).digest('hex'), minimumReleaseAgeChanged: false, newAuditException: false };
assert.equal(result.input, '2ba13d8ca2cd1c58c2f7571493419d850fe122a0');
assert.match(result.diagnostic, /^[a-f0-9]{40}$/u);
writeFileSync(`${directory}/release-maturity.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
assert(releases.every((item) => item.mature24Hours), 'A patched release has not cleared the unchanged 24-hour maturity floor. Stop without a release-age exclusion.');
