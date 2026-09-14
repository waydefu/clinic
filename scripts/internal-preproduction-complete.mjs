import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';
import {
  assembleInternalTestBackupEvidence,
  evaluateInternalTestBackup
} from './internal-test-backup-inspect.mjs';
import { evaluateInternalTestBookingSmoke } from './internal-test-booking-smoke.mjs';
import {
  assembleInternalTestHostingEvidence,
  evaluateInternalTestHosting
} from './internal-test-hosting-inspect.mjs';
import {
  assembleInternalTestMigrationEvidence,
  evaluateInternalTestMigration
} from './internal-test-migration-inspect.mjs';
import {
  assembleInternalTestMonitoringEvidence,
  evaluateInternalTestMonitoring
} from './internal-test-monitoring-inspect.mjs';

export const GO_LIVE_DEFERRED_ITEMS = Object.freeze([
  'official DNS / custom domain',
  'clinic main-website takeover',
  'production Calendar D-009/D-016',
  'real patient data',
  'live Hosting',
  'terraform apply to production'
]);

export const HUMAN_QUEUE_NOT_STAGE_BLOCKING = Object.freeze([
  'interactive patient Firebase Auth / staff Google+TOTP',
  'TW-05 manual AT',
  'named-reviewer person-names'
]);

function nestedResult(section, assemble, evaluate, missingIssue) {
  if (section === undefined || section === null) {
    return { ok: false, issues: [missingIssue] };
  }
  if (section.result && typeof section.result.ok === 'boolean') {
    return {
      ok: section.result.ok,
      issues: Array.isArray(section.result.issues) ? section.result.issues : []
    };
  }
  return evaluate(assemble(section));
}

function evaluateCiSection(section, headSha) {
  const issues = [];
  const expectedHead = String(headSha ?? '').trim();
  if (!/^[a-f0-9]{40}$/.test(expectedHead)) {
    issues.push(
      'internal-preproduction requires the current 40-char HEAD SHA.'
    );
  }
  if (section?.conclusion !== 'success') {
    issues.push(
      'internal-preproduction requires exact-head CI conclusion success; Verification evidence may name the pull_request merge ref.'
    );
  }
  const runUrl = String(section?.runUrl ?? section?.run?.url ?? '').trim();
  if (!runUrl.startsWith('https://github.com/waydefu/clinic/actions/runs/')) {
    issues.push(
      'internal-preproduction requires a GitHub Actions run URL for this HEAD.'
    );
  }
  // Actions run headSha must be this branch HEAD. Artifact `commit` may still
  // be the pull_request merge ref.
  const runHeadSha = String(
    section?.headSha ?? section?.run?.headSha ?? ''
  ).trim();
  if (runHeadSha !== expectedHead) {
    issues.push(
      "internal-preproduction requires the GitHub Actions run headSha to equal this HEAD; a prior SHA's green is not this HEAD. Merge-ref Verification evidence remains allowed."
    );
  }
  return { ok: issues.length === 0, issues };
}

function evaluateSmokeSection(section) {
  if (section?.result && typeof section.result.ok === 'boolean') {
    return {
      ok: section.result.ok,
      issues: Array.isArray(section.result.issues) ? section.result.issues : []
    };
  }
  if (section && typeof section.ok === 'boolean') {
    return {
      ok: section.ok,
      issues: Array.isArray(section.issues) ? section.issues : []
    };
  }
  const probes = Array.isArray(section?.probes) ? section.probes : [];
  if (probes.length === 0) {
    return {
      ok: false,
      issues: [
        'internal-preproduction requires fail-closed smoke probes against an isolated preview URL.'
      ]
    };
  }
  return evaluateInternalTestBookingSmoke(probes);
}

export function evaluateInternalPreproduction(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      ok: false,
      stage: 'INTERNAL_PREPRODUCTION',
      projectComplete: 'NOT_CLAIMED',
      dSeriesForged: false,
      goLiveDeferred: [...GO_LIVE_DEFERRED_ITEMS],
      humanQueueNotBlockingStage: [...HUMAN_QUEUE_NOT_STAGE_BLOCKING],
      humanBlockers: [],
      issues: ['internal-preproduction evidence must be a JSON object']
    };
  }

  const projectId = String(snapshot.projectId ?? '').trim();
  const headSha = String(snapshot.headSha ?? '').trim();
  const issues = [];
  const humanBlockers = [];

  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-preproduction inspect')
    );
  } else if (!isIsolatedC1ProjectId(projectId)) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-preproduction inspect')
    );
  }

  const ci = evaluateCiSection(snapshot.ci, headSha);
  const hosting = nestedResult(
    snapshot.hosting,
    assembleInternalTestHostingEvidence,
    evaluateInternalTestHosting,
    'internal-preproduction requires Hosting channel inspect evidence.'
  );
  const backup = nestedResult(
    snapshot.backup,
    assembleInternalTestBackupEvidence,
    evaluateInternalTestBackup,
    'internal-preproduction requires backup inspect evidence.'
  );
  const monitoring = nestedResult(
    snapshot.monitoring,
    assembleInternalTestMonitoringEvidence,
    evaluateInternalTestMonitoring,
    'internal-preproduction requires monitoring inspect evidence.'
  );
  const migration = nestedResult(
    snapshot.migration,
    assembleInternalTestMigrationEvidence,
    evaluateInternalTestMigration,
    'internal-preproduction requires migration inspect evidence.'
  );
  const smoke = evaluateSmokeSection(snapshot.smoke);

  for (const result of [ci, hosting, backup, monitoring, migration, smoke]) {
    issues.push(...result.issues);
  }

  if (!ci.ok) {
    humanBlockers.push('exact-head CI success for this HEAD');
  }
  if (!hosting.ok) {
    humanBlockers.push(
      'named Safety Floor 8 preview packet plus isolated C1 preview channel (not live)'
    );
  }
  if (!smoke.ok) {
    humanBlockers.push(
      'pnpm smoke:internal-test-booking against the named isolated preview URL'
    );
  }
  if (!backup.ok) {
    humanBlockers.push(
      'fresh exact-SHA packet to apply the SHA-gated C5 daily backup schedule'
    );
  }
  if (!monitoring.ok) {
    humanBlockers.push(
      'fresh exact-SHA packet to apply the SHA-gated C1 IAM SetIamPolicy alert'
    );
  }
  if (!migration.ok) {
    humanBlockers.push(
      'internal-test migration inspect on isolated C1; do not retarget staging CAL-PILOT migrate'
    );
  }

  const uniqueIssues = [...new Set(issues)];
  const uniqueBlockers =
    uniqueIssues.some((issue) =>
      issue.includes('beauessence-clinic-staging')
    ) ||
    (projectId !== FORBIDDEN_STAGING_PROJECT &&
      !isIsolatedC1ProjectId(projectId))
      ? []
      : [...new Set(humanBlockers)];

  return {
    execute: false,
    ok: uniqueIssues.length === 0,
    stage: 'INTERNAL_PREPRODUCTION',
    projectComplete: 'NOT_CLAIMED',
    dSeriesForged: false,
    goLiveDeferred: [...GO_LIVE_DEFERRED_ITEMS],
    humanQueueNotBlockingStage: [...HUMAN_QUEUE_NOT_STAGE_BLOCKING],
    humanBlockers: uniqueBlockers,
    issues: uniqueIssues
  };
}

export const INSPECT_USAGE =
  'Usage: pnpm inspect:internal-preproduction -- inspect <snapshot.json>\nDoes not deploy, apply, smoke a live URL, or forge D-series approval. GO_LIVE_DEFERRED does not set PROJECT_COMPLETE = HUMAN_BLOCKED.\n';

export function runInternalPreproductionCli({
  argv,
  stdout,
  stderr,
  readFile
}) {
  const reader = readFile ?? ((path) => readFileSync(path, 'utf8'));
  const args = argv.filter((argument) => argument !== '--');
  const [mode, operand] = args;
  if (mode !== 'inspect') {
    stderr.write(INSPECT_USAGE);
    return 2;
  }
  if (typeof operand !== 'string' || operand === '') {
    stderr.write(INSPECT_USAGE);
    return 2;
  }
  try {
    const snapshot = JSON.parse(reader(operand));
    const result = evaluateInternalPreproduction(snapshot);
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 2;
  }
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  process.exitCode = runInternalPreproductionCli({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr
  });
}
