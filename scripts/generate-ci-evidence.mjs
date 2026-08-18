import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// 這份證據是 `main` 的必要檢查所引用的東西。它的判斷規則只有一條，但那一條必須
// 是對的：**任何一個必要 job 不是 success，結論就是 failure**——包括「沒有回報
// 結果」。一個把 missing 當成通過的證據產生器，會讓被跳過的 job 看起來像跑過。
// 因此純邏輯全部匯出，可在沒有 CI 環境的情況下測試。
//
// `SCM-R01` 起 `sast` 也是必要 job，而它多帶一個條件：**掃描自報的 commit 必須等於
// 這個 run 的候選 commit**。同 run 執行這件事在架構上已經成立（`verify.yml` 以本地
// 路徑呼叫可重用 workflow，那一定是同一個 commit），但「成立」和「被記錄下來」是兩
// 件事——稽核讀的是證據檔，不是 workflow 的註解。對不上就是 failure，理由與缺少結果
// 相同：一份不能指名 commit 的掃描結果，證明不了這個 commit 被掃過。

export const REQUIRED_JOBS = [
  ['verify', 'CI_EVIDENCE_VERIFY_RESULT'],
  ['rules', 'CI_EVIDENCE_RULES_RESULT'],
  ['e2e', 'CI_EVIDENCE_E2E_RESULT'],
  ['supply-chain', 'CI_EVIDENCE_SUPPLY_CHAIN_RESULT'],
  ['sast', 'CI_EVIDENCE_SAST_RESULT']
];

export const safeMarkdown = (value) =>
  String(value).replaceAll('|', '\|').replaceAll('\n', ' ');

export function createCiEvidence({ env = {}, now = new Date() } = {}) {
  const jobs = REQUIRED_JOBS.map(([name, variable]) => ({
    name,
    result: env[variable] ?? 'missing'
  }));
  const commit = env.GITHUB_SHA ?? 'unknown';
  // 空字串代表被呼叫的 SAST workflow 沒有回傳 output——job 失敗、被取消或被跳過時
  // 都是如此。那和「回報了別的 commit」一樣不可接受，因此收斂成同一種結果。
  const sastReportedCommit = env.CI_EVIDENCE_SAST_COMMIT || 'missing';
  const sastCommitMatchesCandidate =
    commit !== 'unknown' && sastReportedCommit === commit;
  const passed =
    jobs.every(({ result }) => result === 'success') &&
    sastCommitMatchesCandidate;
  const serverUrl = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const repository = env.GITHUB_REPOSITORY ?? 'unknown/unknown';
  const runId = env.GITHUB_RUN_ID ?? 'unknown';

  return {
    // 2：新增 `sast` 必要 job 與它的 commit 綁定欄位（`SCM-R01`）。
    schemaVersion: 2,
    kind: 'ci-verification',
    generatedAt: now.toISOString(),
    repository,
    commit,
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
    sast: {
      reportedCommit: sastReportedCommit,
      commitMatchesCandidate: sastCommitMatchesCandidate
    },
    conclusion: passed ? 'success' : 'failure'
  };
}

export function renderCiEvidenceSummary(evidence) {
  const passed = evidence.conclusion === 'success';
  const everyJobPassed = evidence.requiredJobs.every(
    ({ result }) => result === 'success'
  );
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
    `- SAST evidence commit: \`${safeMarkdown(
      evidence.sast.reportedCommit
    )}\` (${
      evidence.sast.commitMatchesCandidate
        ? 'matches this candidate commit'
        : 'does not match this candidate commit'
    })`,
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
      ? 'All required verification jobs completed successfully, and the SAST evidence names this exact commit.'
      : everyJobPassed
        ? 'Every required job reported success, but the SAST evidence does not name this commit, so this run is not accepted.'
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
