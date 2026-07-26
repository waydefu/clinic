import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const outputDirectory = process.env.CI_EVIDENCE_OUTPUT_DIR ?? 'output/evidence';

const jobs = [
  ['verify', process.env.CI_EVIDENCE_VERIFY_RESULT],
  ['rules', process.env.CI_EVIDENCE_RULES_RESULT],
  ['e2e', process.env.CI_EVIDENCE_E2E_RESULT],
  ['supply-chain', process.env.CI_EVIDENCE_SUPPLY_CHAIN_RESULT]
].map(([name, result]) => ({
  name,
  result: result ?? 'missing'
}));

const passed = jobs.every(({ result }) => result === 'success');
const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const repository = process.env.GITHUB_REPOSITORY ?? 'unknown/unknown';
const runId = process.env.GITHUB_RUN_ID ?? 'unknown';
const runUrl =
  runId === 'unknown'
    ? null
    : `${serverUrl}/${repository}/actions/runs/${runId}`;

const evidence = {
  schemaVersion: 1,
  kind: 'ci-verification',
  generatedAt: new Date().toISOString(),
  repository,
  commit: process.env.GITHUB_SHA ?? 'unknown',
  ref: process.env.GITHUB_REF ?? 'unknown',
  event: process.env.GITHUB_EVENT_NAME ?? 'unknown',
  workflow: process.env.GITHUB_WORKFLOW ?? 'verify',
  run: {
    id: runId,
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? 'unknown',
    url: runUrl
  },
  requiredJobs: jobs,
  conclusion: passed ? 'success' : 'failure'
};

const safeMarkdown = (value) =>
  String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

const summary = [
  '# Verification evidence',
  '',
  `- Conclusion: **${evidence.conclusion}**`,
  `- Commit: \`${safeMarkdown(evidence.commit)}\``,
  `- Ref: \`${safeMarkdown(evidence.ref)}\``,
  `- Event: \`${safeMarkdown(evidence.event)}\``,
  runUrl === null ? '- Run: unavailable' : `- Run: ${runUrl}`,
  `- Generated: ${evidence.generatedAt}`,
  '',
  '| Required job | Result |',
  '| --- | --- |',
  ...jobs.map(
    ({ name, result }) => `| ${safeMarkdown(name)} | ${safeMarkdown(result)} |`
  ),
  '',
  passed
    ? 'All required verification jobs completed successfully.'
    : 'At least one required verification job did not complete successfully.',
  ''
].join('\n');

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    join(outputDirectory, 'ci-verification.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8'
  ),
  writeFile(join(outputDirectory, 'ci-verification.md'), summary, 'utf8')
]);

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, {
    encoding: 'utf8',
    flag: 'a'
  });
}

console.log(
  `CI evidence written to ${outputDirectory} (${evidence.conclusion}).`
);
if (!passed) process.exitCode = 1;
