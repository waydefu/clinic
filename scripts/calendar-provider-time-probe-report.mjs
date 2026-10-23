import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const directory = 'output/calendar-time-probe';
const input = readFileSync(`${directory}/input-commit.txt`, 'utf8').trim();
const diagnostic = readFileSync(`${directory}/diagnostic-commit.txt`, 'utf8').trim();
assert.equal(input, 'e3f0eb2eb5dfb640aaf2d7d39d7a5b35b4ffe3dd');
assert.match(diagnostic, /^[a-f0-9]{40}$/u);
const result = JSON.parse(readFileSync(`${directory}/result.json`, 'utf8'));
const assertions = result.testResults.flatMap((suite) => suite.assertionResults);
const expectedNegativeCount = 2 * 2 * 8 * 2;
const expectedPositiveCount = 2 * (5 + 1);
assert.equal(assertions.length, expectedNegativeCount + expectedPositiveCount);
assert.equal(result.numTotalTests, assertions.length);
assert(assertions.every((test) => ['passed', 'failed'].includes(test.status)));
const negative = assertions.filter((test) => test.title.startsWith('rejects malformed RFC3339'));
const positive = assertions.filter((test) => !test.title.startsWith('rejects malformed RFC3339'));
assert.equal(negative.length, expectedNegativeCount);
assert.equal(positive.length, expectedPositiveCount);
assert(positive.every((test) => test.status === 'passed'));
const failed = negative.filter((test) => test.status === 'failed');
assert(failed.length > 0, 'The existing source unexpectedly denied every malformed input.');
assert.equal(result.numFailedTests, failed.length);
for (const runtime of ['domain', 'browser']) {
  for (const target of ['projection', 'entry']) {
    assert(failed.some((test) => test.fullName.includes(runtime + ' external Calendar datetime admission') && test.title.includes(target + ' input')));
  }
}
const summary = {
  input,
  diagnostic,
  sourceChanged: false,
  providerCalled: false,
  total: assertions.length,
  failed: failed.length,
  passed: assertions.length - failed.length,
  validOffsetAndAllDayCasesPassed: positive.length,
  harnessSha256: createHash('sha256').update(readFileSync(`${directory}/calendar-provider-time-probe.test.mjs`)).digest('hex'),
  failureNames: failed.map((test) => test.fullName),
  evidence: 'The real canonical domain and compiled browser functions accepted malformed external datetime inputs. All explicit-offset and separate all-day positive controls passed. This is CI-only synthetic reproduction, not a provider or deployed-system test.'
};
writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
