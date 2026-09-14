import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';

export const IAM_SETIAMPOLICY_METRIC = 'c1-iam-setiampolicy';

export function internalTestMonitoringCollectCommands(projectId) {
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(
      isolatedC1ProjectIdError(projectId, 'internal-test monitoring inspect')
    );
  }
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(
      isolatedC1ProjectIdError(projectId, 'internal-test monitoring inspect')
    );
  }
  return [
    `gcloud logging metrics list --project=${projectId} --format=json`,
    `gcloud monitoring policies list --project=${projectId} --format=json`
  ];
}

function metricsFromSnapshot(snapshot) {
  const value = snapshot?.loggingMetrics ?? snapshot?.metrics;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.metrics)) return value.metrics;
  return [];
}

function policiesFromSnapshot(snapshot) {
  const value = snapshot?.alertPolicies ?? snapshot?.policies;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.alertPolicies)) return value.alertPolicies;
  return [];
}

function metricName(metric) {
  const name = metric?.name ?? metric?.metricDescriptor?.name;
  return typeof name === 'string' ? name : '';
}

function policyWatchesIamMetric(policy) {
  const encoded = JSON.stringify(policy ?? {});
  return encoded.includes(IAM_SETIAMPOLICY_METRIC);
}

export function assembleInternalTestMonitoringEvidence(snapshot) {
  const projectId = String(snapshot?.projectId ?? '').trim();
  const metrics = metricsFromSnapshot(snapshot);
  const policies = policiesFromSnapshot(snapshot);
  const iamMetric = metrics.find((metric) =>
    metricName(metric).includes(IAM_SETIAMPOLICY_METRIC)
  );
  const iamPolicy = policies.find((policy) => policyWatchesIamMetric(policy));
  return {
    projectId,
    iamMetricName: iamMetric === undefined ? null : metricName(iamMetric),
    iamAlertDisplayName:
      typeof iamPolicy?.displayName === 'string'
        ? iamPolicy.displayName
        : typeof iamPolicy?.display_name === 'string'
          ? iamPolicy.display_name
          : null,
    alertPolicyCount: policies.length
  };
}

export function evaluateInternalTestMonitoring(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return {
      ok: false,
      issues: ['internal-test monitoring evidence must be a JSON object']
    };
  }
  const issues = [];
  const projectId = evidence.projectId;
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-test monitoring inspect')
    );
  } else if (!isIsolatedC1ProjectId(projectId)) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-test monitoring inspect')
    );
  }
  if (
    typeof evidence.iamMetricName !== 'string' ||
    !evidence.iamMetricName.includes(IAM_SETIAMPOLICY_METRIC)
  ) {
    issues.push(
      `internal-test monitoring requires logging metric ${IAM_SETIAMPOLICY_METRIC}.`
    );
  }
  if (
    typeof evidence.iamAlertDisplayName !== 'string' ||
    evidence.iamAlertDisplayName.trim() === ''
  ) {
    issues.push(
      `internal-test monitoring requires an alert policy on ${IAM_SETIAMPOLICY_METRIC}; SHA-gated C1 source exists, apply needs a fresh exact-SHA packet.`
    );
  }
  return { ok: issues.length === 0, issues };
}

export const INSPECT_USAGE =
  'Usage: pnpm inspect:internal-test-monitoring -- inspect <snapshot.json>\nDoes not apply Terraform or mutate Monitoring. Live/staging/production are refused.\n';

export function runInternalTestMonitoringCli({
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
    const evidence = assembleInternalTestMonitoringEvidence(snapshot);
    const result = evaluateInternalTestMonitoring(evidence);
    stdout.write(
      `${JSON.stringify({ execute: false, evidence, result }, null, 2)}\n`
    );
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
  process.exitCode = runInternalTestMonitoringCli({
    argv: process.argv.slice(2),
    stdout: process.stdout,
    stderr: process.stderr
  });
}
