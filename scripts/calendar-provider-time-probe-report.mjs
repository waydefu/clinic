import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const directory = process.argv[2] ?? 'output/calendar-time-probe';
const input = readFileSync(`${directory}/input-commit.txt`, 'utf8').trim();
const diagnostic = readFileSync(`${directory}/diagnostic-commit.txt`, 'utf8').trim();
const mode = process.argv[3] ?? 'red';
const expectedInput = process.argv[4] ?? 'e3f0eb2eb5dfb640aaf2d7d39d7a5b35b4ffe3dd';
assert.equal(input, expectedInput);
assert.match(diagnostic, /^[a-f0-9]{40}$/u);
assert(['red', 'green'].includes(mode));
const result = JSON.parse(readFileSync(`${directory}/result.json`, 'utf8'));
const assertions = result.testResults.flatMap((suite) => suite.assertionResults);
const negative = assertions.filter((test) => test.title.startsWith('rejects malformed RFC3339'));
const positive = assertions.filter((test) => !test.title.startsWith('rejects malformed RFC3339'));
assert.equal(negative.length, 2 * 2 * 8 * 2 + 2 * 8);
assert.equal(positive.length, 2 * (6 + 1) + 6);
assert.equal(result.numTotalTests, assertions.length);
assert(assertions.every((test) => ['passed', 'failed'].includes(test.status)));
assert(positive.every((test) => test.status === 'passed'));
const failed = negative.filter((test) => test.status === 'failed');
assert.equal(result.numFailedTests, failed.length);
if (mode === 'red') {
  assert(failed.length > 0, 'Legacy source unexpectedly denied every malformed input.');
  for (const runtime of ['domain', 'browser', 'worker']) {
    assert(failed.some((test) => test.fullName.replaceAll("'", '').includes(runtime + ' external Calendar datetime admission')));
  }
} else {
  assert.equal(failed.length, 0);
  assert.equal(result.numPassedTests, assertions.length);
}
const summary = {
  input,
  diagnostic,
  mode,
  providerCalled: false,
  total: assertions.length,
  failed: failed.length,
  passed: assertions.length - failed.length,
  validOffsetAndAllDayCasesPassed: positive.length,
  harnessSha256: createHash('sha256').update(readFileSync(`${directory}/calendar-time-admission-parity.test.mjs`)).digest('hex'),
  failureNames: failed.map((test) => test.fullName),
  evidence: 'Canonical domain, compiled browser and pure worker sanitizer, with explicit-offset/all-day positive controls. CI-only synthetic execution; not a provider or deployed-system test.'
};
writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
