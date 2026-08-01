import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// 這份證據是 `main` 的必要檢查所引用的東西。它的判斷規則只有一條，但那一條必須
// 是對的：**任何一個必要 job 不是 success，結論就是 failure**——包括「沒有回報
// 結果」。一個把 missing 當成通過的證據產生器，會讓被跳過的 job 看起來像跑過。
// 因此純邏輯全部匯出，可在沒有 CI 環境的情況下測試。

export const REQUIRED_JOBS = [
  ['verify', 'CI_EVIDENCE_VERIFY_RESULT'],
  ['rules', 'CI_EVIDENCE_RULES_RESULT'],
  ['e2e', 'CI_EVIDENCE_E2E_RESULT'],
  ['supply-chain', 'CI_EVIDENCE_SUPPLY_CHAIN_RESULT']
];

export const safeMarkdown = (value) =>
  String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

export function createCiEvidence({ env = {}, now = new Date() } = {}) {
  const jobs = REQUIRED_JOBS.map(([name, variable]) => ({
    name,
    result: env[variable] ?? 'missing'
  }));
  const passed = jobs.every(({ result }) => result === 'success');
  const serverUrl = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const repository = env.GITHUB_REPOSITORY ?? 'unknown/unknown';
  const runId = env.GITHUB_RUN_ID ?? 'unknown';

  return {
    schemaVersion: 1,
    kind: 'ci-verification',
    generatedAt: now.toISOString(),
    repository,
    commit: env.GITHUB_SHA ?? 'unknown',
    ref: env.GITHUB_REF ?? 'unknown',
    event: env.GITHUB_EVENT_NAME ?? 'unknown',
    workflow: env.GITHUB_WORKFLOW ?? 'verify',
    run: {
      id: runId,
      attempt: env.GITHUB_RUN_ATTEMPT ?? 'unknown',
      url:
        runId === 'unknown'
          ? null
          : `${serverUrl}/${repository}/actions/runs/${runId}`
    },
    requiredJobs: jobs,
    conclusion: passed ? 'success' : 'failure'
  };
}

export function renderCiEvidenceSummary(evidence) {
  const passed = evidence.conclusion === 'success';
  return [
    '# Verification evidence',
    '',
    `- Conclusion: **${evidence.conclusion}**`,
    `- Commit: \`${safeMarkdown(evidence.commit)}\``,
    `- Ref: \`${safeMarkdown(evidence.ref)}\``,
    `- Event: \`${safeMarkdown(evidence.event)}\``,
    evidence.run.url === null
      ? '- Run: unavailable'
      : `- Run: ${evidence.run.url}`,
    `- Generated: ${evidence.generatedAt}`,
    '',
    '| Required job | Result |',
    '| --- | --- |',
    ...evidence.requiredJobs.map(
      ({ name, result }) =>
        `| ${safeMarkdown(name)} | ${safeMarkdown(result)} |`
    ),
    '',
    passed
      ? 'All required verification jobs completed successfully.'
      : 'At least one required verification job did not complete successfully.',
    ''
  ].join('\n');
}

async function main() {
  const outputDirectory =
    process.env.CI_EVIDENCE_OUTPUT_DIR ?? 'output/evidence';
  const evidence = createCiEvidence({ env: process.env });
  const summary = renderCiEvidenceSummary(evidence);

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
  if (evidence.conclusion !== 'success') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
