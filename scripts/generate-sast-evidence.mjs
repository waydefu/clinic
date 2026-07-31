import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_PATHS = {
  json: 'output/evidence/semgrep-results.json',
  sarif: 'output/evidence/semgrep-results.sarif',
  exitCode: 'output/evidence/semgrep-exit-code.txt',
  version: 'output/evidence/semgrep-version.txt'
};

function parseJson(raw) {
  if (raw === null) return { value: null, error: 'missing' };
  try {
    return { value: JSON.parse(raw), error: null };
  } catch {
    return { value: null, error: 'invalid-json' };
  }
}

function parseExitCode(raw) {
  if (raw === null) return null;
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
}

function commaSeparated(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sha256(raw) {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function parseRuleManifest(raw, expectedCount) {
  if (raw === null)
    return { valid: false, error: 'missing', entries: [], sha256: null };

  const entries = raw.trimEnd().split(/\r?\n/);
  const safePath = /^(?:javascript|typescript)\/[A-Za-z0-9._/-]+\.ya?ml$/u;
  if (
    entries.length !== expectedCount ||
    entries.some(
      (entry) =>
        entry.length === 0 || entry.includes('..') || !safePath.test(entry)
    ) ||
    entries.some((entry, index) => index > 0 && entry <= entries[index - 1])
  )
    return {
      valid: false,
      error: 'invalid-entries',
      entries: [],
      sha256: sha256(raw)
    };

  return { valid: true, error: null, entries, sha256: sha256(raw) };
}

function summarizeRules({ env, ruleFiles, ruleManifestRaw }) {
  const localConfigs = commaSeparated(env.SAST_LOCAL_RULE_CONFIGS);
  const manifestPath = env.SAST_UPSTREAM_RULE_MANIFEST ?? 'unknown';
  const upstreamRoot = (
    env.SAST_UPSTREAM_RULE_ROOT ?? '.semgrep-rules'
  ).replace(/\\/gu, '/');
  const expectedUpstreamCount = Number.parseInt(
    env.SAST_EXPECTED_UPSTREAM_RULE_COUNT ?? '',
    10
  );
  const configuredRuleCount = Number.parseInt(
    env.SAST_CONFIGURED_RULE_COUNT ?? '',
    10
  );
  const manifest = parseRuleManifest(ruleManifestRaw, expectedUpstreamCount);
  const expectedPaths = [
    ...localConfigs,
    ...manifest.entries.map((entry) => `${upstreamRoot}/${entry}`)
  ];
  const filesByPath = new Map(
    ruleFiles.map(({ path, raw }) => [path.replace(/\\/gu, '/'), raw])
  );
  const files = expectedPaths.map((path) => {
    const raw = filesByPath.get(path) ?? null;
    return {
      path,
      sha256: raw === null ? null : sha256(raw)
    };
  });
  const missingFiles = files
    .filter((file) => file.sha256 === null)
    .map((file) => file.path);
  const valid =
    localConfigs.length > 0 &&
    Number.isInteger(expectedUpstreamCount) &&
    expectedUpstreamCount > 0 &&
    Number.isInteger(configuredRuleCount) &&
    configuredRuleCount > 0 &&
    manifest.valid &&
    missingFiles.length === 0 &&
    ruleFiles.length === expectedPaths.length;

  return {
    valid,
    error: valid
      ? null
      : (manifest.error ??
        (missingFiles.length > 0 ? 'missing-rule-files' : 'invalid-metadata')),
    repository: env.SAST_RULES_REPOSITORY ?? 'unknown',
    revision: env.SAST_RULES_REVISION ?? 'unknown',
    localConfigs,
    upstreamManifest: {
      path: manifestPath,
      sha256: manifest.sha256,
      entries: manifest.entries.length,
      expectedEntries: Number.isInteger(expectedUpstreamCount)
        ? expectedUpstreamCount
        : null
    },
    configuredRuleCount: Number.isInteger(configuredRuleCount)
      ? configuredRuleCount
      : null,
    fileCount: files.length,
    files,
    testOutcome: env.SAST_RULE_TEST_OUTCOME ?? 'missing'
  };
}

function semgrepJsonSummary(raw) {
  const parsed = parseJson(raw);
  if (parsed.error !== null)
    return {
      valid: false,
      error: parsed.error,
      findings: [],
      errors: [],
      scannedFiles: []
    };

  const findings = parsed.value?.results;
  const errors = parsed.value?.errors;
  const scannedFiles = parsed.value?.paths?.scanned;
  if (
    !Array.isArray(findings) ||
    !Array.isArray(errors) ||
    !Array.isArray(scannedFiles)
  ) {
    return {
      valid: false,
      error: 'invalid-shape',
      findings: [],
      errors: [],
      scannedFiles: []
    };
  }

  return {
    valid: true,
    error: null,
    findings,
    errors,
    scannedFiles
  };
}

function sarifSummary(raw) {
  const parsed = parseJson(raw);
  if (parsed.error !== null)
    return {
      valid: false,
      error: parsed.error,
      resultCount: 0,
      runCount: 0,
      ruleCount: 0,
      levels: {}
    };

  const document = parsed.value;
  if (document?.version !== '2.1.0' || !Array.isArray(document.runs)) {
    return {
      valid: false,
      error: 'invalid-shape',
      resultCount: 0,
      runCount: 0,
      ruleCount: 0,
      levels: {}
    };
  }

  const levels = {};
  let resultCount = 0;
  let ruleCount = 0;
  for (const run of document.runs) {
    if (
      !String(run?.tool?.driver?.name ?? '')
        .toLowerCase()
        .includes('semgrep')
    )
      return {
        valid: false,
        error: 'unexpected-tool',
        resultCount: 0,
        runCount: document.runs.length,
        ruleCount: 0,
        levels: {}
      };
    if (!Array.isArray(run?.tool?.driver?.rules))
      return {
        valid: false,
        error: 'invalid-rules',
        resultCount: 0,
        runCount: document.runs.length,
        ruleCount: 0,
        levels: {}
      };
    if (run.results !== undefined && !Array.isArray(run.results))
      return {
        valid: false,
        error: 'invalid-results',
        resultCount: 0,
        runCount: document.runs.length,
        ruleCount: 0,
        levels: {}
      };

    ruleCount += run.tool.driver.rules.length;
    for (const result of run.results ?? []) {
      resultCount += 1;
      const level = String(result?.level ?? 'unspecified');
      levels[level] = (levels[level] ?? 0) + 1;
    }
  }

  return {
    valid: true,
    error: null,
    resultCount,
    runCount: document.runs.length,
    ruleCount,
    levels
  };
}

function classify({
  scanOutcome,
  exitCode,
  json,
  sarif,
  engineVersion,
  rules
}) {
  if (!rules.valid)
    return { conclusion: 'failure', reason: 'invalid-evidence' };

  if (rules.testOutcome !== 'success')
    return {
      conclusion: 'failure',
      reason:
        rules.testOutcome === 'failure' ? 'scanner-error' : 'invalid-evidence'
    };

  if (
    exitCode === null ||
    engineVersion.length === 0 ||
    !json.valid ||
    !sarif.valid ||
    json.findings.length !== sarif.resultCount ||
    sarif.ruleCount !== rules.configuredRuleCount
  )
    return { conclusion: 'failure', reason: 'invalid-evidence' };

  const expectedOutcome = exitCode === 0 ? 'success' : 'failure';
  if (scanOutcome !== expectedOutcome)
    return { conclusion: 'failure', reason: 'invalid-evidence' };

  if (json.errors.length > 0 || exitCode >= 2)
    return { conclusion: 'failure', reason: 'scanner-error' };

  if (json.findings.length > 0 && exitCode === 1)
    return { conclusion: 'failure', reason: 'findings' };

  if (json.findings.length > 0 || exitCode !== 0)
    return { conclusion: 'failure', reason: 'invalid-evidence' };

  return { conclusion: 'success', reason: null };
}

export function createSastEvidence({
  now = new Date(),
  env = {},
  jsonRaw = null,
  sarifRaw = null,
  exitCodeRaw = null,
  versionRaw = null,
  ruleFiles = [],
  ruleManifestRaw = null
}) {
  const json = semgrepJsonSummary(jsonRaw);
  const sarif = sarifSummary(sarifRaw);
  const rules = summarizeRules({ env, ruleFiles, ruleManifestRaw });
  const exitCode = parseExitCode(exitCodeRaw);
  const engineVersion = versionRaw?.trim() ?? '';
  const scanOutcome = env.SAST_SCAN_OUTCOME ?? 'missing';
  const classification = classify({
    scanOutcome,
    exitCode,
    json,
    sarif,
    engineVersion,
    rules
  });
  const repository = env.GITHUB_REPOSITORY ?? 'unknown/unknown';
  const runId = env.GITHUB_RUN_ID ?? 'unknown';
  const runUrl =
    runId === 'unknown'
      ? null
      : `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${runId}`;

  return {
    schemaVersion: 1,
    kind: 'sast-verification',
    generatedAt: now.toISOString(),
    repository,
    commit: env.GITHUB_SHA ?? 'unknown',
    ref: env.GITHUB_REF ?? 'unknown',
    event: env.GITHUB_EVENT_NAME ?? 'unknown',
    engine: {
      name: 'Semgrep Community Edition',
      version: engineVersion || 'unknown',
      image: env.SAST_ENGINE_IMAGE ?? 'unknown',
      mode: 'oss-only'
    },
    rules,
    scan: {
      stepOutcome: scanOutcome,
      exitCode,
      jsonValid: json.valid,
      jsonError: json.error,
      sarifValid: sarif.valid,
      sarifError: sarif.error,
      findings: json.valid ? json.findings.length : null,
      scannerErrors: json.valid ? json.errors.length : null,
      scannedFiles: json.valid ? json.scannedFiles.length : null,
      sarifRuns: sarif.valid ? sarif.runCount : null,
      sarifResults: sarif.valid ? sarif.resultCount : null,
      sarifRules: sarif.valid ? sarif.ruleCount : null,
      sarifLevels: sarif.valid ? sarif.levels : {}
    },
    githubCodeScanning: {
      uploadAttempted: false,
      status:
        env.GITHUB_CODE_SCANNING_UPLOAD_STATUS ??
        'not-configured-for-this-workflow'
    },
    run: {
      id: runId,
      attempt: env.GITHUB_RUN_ATTEMPT ?? 'unknown',
      url: runUrl
    },
    conclusion: classification.conclusion,
    failureReason: classification.reason
  };
}

function safeMarkdown(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderSastEvidenceSummary(evidence) {
  const result =
    evidence.conclusion === 'success'
      ? 'Semgrep completed with no findings or scanner errors.'
      : evidence.failureReason === 'findings'
        ? 'Semgrep produced one or more findings; this run is blocked.'
        : evidence.failureReason === 'scanner-error'
          ? 'Semgrep did not complete cleanly; this run is blocked.'
          : 'The scan evidence is missing, malformed or inconsistent; this run is blocked.';

  return [
    '# SAST verification evidence',
    '',
    `- Conclusion: **${safeMarkdown(evidence.conclusion)}**`,
    `- Failure reason: \`${safeMarkdown(evidence.failureReason ?? 'none')}\``,
    `- Commit: \`${safeMarkdown(evidence.commit)}\``,
    `- Semgrep CE: \`${safeMarkdown(evidence.engine.version)}\``,
    `- Scanner image: \`${safeMarkdown(evidence.engine.image)}\``,
    `- Rules revision: \`${safeMarkdown(evidence.rules.revision)}\``,
    `- Rule tests: \`${safeMarkdown(evidence.rules.testOutcome)}\``,
    `- Configured rules: \`${safeMarkdown(
      evidence.rules.configuredRuleCount ?? 'unknown'
    )}\``,
    `- Hashed rule files: \`${safeMarkdown(
      evidence.rules.fileCount ?? 'unknown'
    )}\``,
    `- Scan exit code: \`${safeMarkdown(evidence.scan.exitCode ?? 'missing')}\``,
    `- Findings: \`${safeMarkdown(evidence.scan.findings ?? 'unknown')}\``,
    `- Scanner errors: \`${safeMarkdown(
      evidence.scan.scannerErrors ?? 'unknown'
    )}\``,
    `- Files scanned: \`${safeMarkdown(
      evidence.scan.scannedFiles ?? 'unknown'
    )}\``,
    `- GitHub code-scanning upload: \`${safeMarkdown(
      evidence.githubCodeScanning.status
    )}\` (not attempted)`,
    evidence.run.url === null
      ? '- Run: unavailable'
      : `- Run: ${evidence.run.url}`,
    `- Generated: ${safeMarkdown(evidence.generatedAt)}`,
    '',
    result,
    '',
    'Semgrep Community Edition is the blocking SAST gate for this run. It is not represented as equivalent to CodeQL cross-file analysis, and GitHub SARIF upload capability is reported separately from the scan result.',
    ''
  ].join('\n');
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function runCli() {
  const outputDirectory =
    process.env.SAST_EVIDENCE_OUTPUT_DIR ?? 'output/evidence';
  const manifestPath =
    process.env.SAST_UPSTREAM_RULE_MANIFEST ??
    'security/semgrep/upstream-rules.txt';
  const [jsonRaw, sarifRaw, exitCodeRaw, versionRaw, ruleManifestRaw] =
    await Promise.all([
      readOptional(process.env.SAST_JSON_PATH ?? DEFAULT_PATHS.json),
      readOptional(process.env.SAST_SARIF_PATH ?? DEFAULT_PATHS.sarif),
      readOptional(process.env.SAST_EXIT_CODE_PATH ?? DEFAULT_PATHS.exitCode),
      readOptional(process.env.SAST_VERSION_PATH ?? DEFAULT_PATHS.version),
      readOptional(manifestPath)
    ]);
  const parsedManifest = parseRuleManifest(
    ruleManifestRaw,
    Number.parseInt(process.env.SAST_EXPECTED_UPSTREAM_RULE_COUNT ?? '', 10)
  );
  const upstreamRoot = process.env.SAST_UPSTREAM_RULE_ROOT ?? '.semgrep-rules';
  const rulePaths = [
    ...commaSeparated(process.env.SAST_LOCAL_RULE_CONFIGS),
    ...parsedManifest.entries.map((entry) => join(upstreamRoot, entry))
  ];
  const ruleFiles = await Promise.all(
    rulePaths.map(async (path) => ({
      path: path.replace(/\\/gu, '/'),
      raw: await readOptional(path)
    }))
  );
  const evidence = createSastEvidence({
    env: process.env,
    jsonRaw,
    sarifRaw,
    exitCodeRaw,
    versionRaw,
    ruleFiles,
    ruleManifestRaw
  });
  const summary = renderSastEvidenceSummary(evidence);

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(outputDirectory, 'sast-verification.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8'
    ),
    writeFile(join(outputDirectory, 'sast-verification.md'), summary, 'utf8')
  ]);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, {
      encoding: 'utf8',
      flag: 'a'
    });
  }

  console.log(
    `SAST evidence written to ${outputDirectory} (${evidence.conclusion}).`
  );
  if (evidence.conclusion !== 'success') process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) await runCli();
