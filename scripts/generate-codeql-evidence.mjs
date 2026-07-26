import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const outputDirectory =
  process.env.CODEQL_EVIDENCE_OUTPUT_DIR ?? 'output/evidence';
const outcome = process.env.CODEQL_ANALYZE_OUTCOME || 'missing';
const passed = outcome === 'success';
const repository = process.env.GITHUB_REPOSITORY ?? 'unknown/unknown';
const runId = process.env.GITHUB_RUN_ID ?? 'unknown';
const runUrl =
  runId === 'unknown'
    ? null
    : `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${runId}`;

const evidence = {
  schemaVersion: 1,
  kind: 'codeql-verification',
  generatedAt: new Date().toISOString(),
  repository,
  commit: process.env.GITHUB_SHA ?? 'unknown',
  ref: process.env.GITHUB_REF ?? 'unknown',
  event: process.env.GITHUB_EVENT_NAME ?? 'unknown',
  querySuite: 'security-extended',
  languages: ['javascript-typescript'],
  analyzeOutcome: outcome,
  run: {
    id: runId,
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? 'unknown',
    url: runUrl
  },
  conclusion: passed ? 'success' : 'failure'
};

const summary = [
  '# CodeQL evidence',
  '',
  `- Conclusion: **${evidence.conclusion}**`,
  `- Analyze outcome: \`${outcome}\``,
  `- Commit: \`${evidence.commit}\``,
  '- Language: `javascript-typescript`',
  '- Query suite: `security-extended`',
  runUrl === null ? '- Run: unavailable' : `- Run: ${runUrl}`,
  `- Generated: ${evidence.generatedAt}`,
  '',
  'The findings themselves remain in GitHub code scanning; this artifact binds the analyze outcome to the exact commit and run.',
  ''
].join('\n');

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    join(outputDirectory, 'codeql-verification.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8'
  ),
  writeFile(join(outputDirectory, 'codeql-verification.md'), summary, 'utf8')
]);

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, {
    encoding: 'utf8',
    flag: 'a'
  });
}

console.log(
  `CodeQL evidence written to ${outputDirectory} (${evidence.conclusion}).`
);
if (!passed) process.exitCode = 1;
