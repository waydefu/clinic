import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FORBIDDEN_STAGING_PROJECT = 'beauessence-clinic-staging';
export const UNAPPLIED_PLACEHOLDER = 'beauessence-clinic-stg-unapplied';
export const ISOLATED_PROJECT_PATTERN = /^beauessence-clinic-stg-[a-z0-9-]+$/;

export function assertIsolatedSliceProjectId(projectId, slice) {
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(
      `${slice} smoke refuses beauessence-clinic-staging; that project is CAL-PILOT, not C1.`
    );
  }
  if (
    typeof projectId !== 'string' ||
    !ISOLATED_PROJECT_PATTERN.test(projectId) ||
    projectId === UNAPPLIED_PLACEHOLDER
  ) {
    throw new Error(
      `${slice} smoke requires a real isolated beauessence-clinic-stg-* project.`
    );
  }
}

function projectIssues(evidence, slice) {
  const issues = [];
  const projectId = evidence?.projectId;
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    issues.push(
      `${slice} smoke used beauessence-clinic-staging; that project is not C1.`
    );
  }
  if (
    typeof projectId !== 'string' ||
    !ISOLATED_PROJECT_PATTERN.test(projectId) ||
    projectId === UNAPPLIED_PLACEHOLDER
  ) {
    issues.push(
      `${slice} projectId must be a real isolated beauessence-clinic-stg-* id.`
    );
  }
  if (evidence?.region !== 'asia-east1') {
    issues.push(`${slice} region must be asia-east1.`);
  }
  return issues;
}

function enabledApis(evidence) {
  return Array.isArray(evidence?.enabledApis) ? evidence.enabledApis : [];
}

export function c2SmokeCollectCommands(projectId) {
  assertIsolatedSliceProjectId(projectId, 'C2');
  return [
    `gcloud services list --enabled --project=${projectId} --format=json`,
    `gcloud firestore databases list --project=${projectId} --format=json`
  ];
}

export function c5SmokeCollectCommands(projectId) {
  assertIsolatedSliceProjectId(projectId, 'C5');
  return [
    `gcloud firestore databases list --project=${projectId} --format=json`,
    `gcloud services list --enabled --project=${projectId} --format=json`
  ];
}

export function c6SmokeCollectCommands(projectId) {
  assertIsolatedSliceProjectId(projectId, 'C6');
  return [
    `gcloud services list --enabled --project=${projectId} --format=json`
  ];
}

export function evaluateC2Smoke(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, issues: ['C2 evidence must be a JSON object'] };
  }
  const issues = projectIssues(evidence, 'C2');
  const apis = enabledApis(evidence);
  if (!apis.includes('identitytoolkit.googleapis.com')) {
    issues.push('C2 must enable identitytoolkit.googleapis.com.');
  }
  if (apis.includes('firestore.googleapis.com')) {
    issues.push('C2 must not enable Firestore; that is C5.');
  }
  if (apis.includes('calendar-json.googleapis.com')) {
    issues.push('C2 must not enable Calendar JSON API; that is C6.');
  }
  if (evidence.firestoreDatabase) {
    issues.push('C2 must not create a Firestore database.');
  }
  if (evidence.totpAdjacentIntervals !== 1) {
    issues.push('C2 TOTP adjacentIntervals must be 1.');
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateC5Smoke(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, issues: ['C5 evidence must be a JSON object'] };
  }
  const issues = projectIssues(evidence, 'C5');
  const apis = enabledApis(evidence);
  if (!apis.includes('firestore.googleapis.com')) {
    issues.push('C5 must enable firestore.googleapis.com.');
  }
  if (evidence.firestoreType !== 'FIRESTORE_NATIVE') {
    issues.push('C5 Firestore type must be FIRESTORE_NATIVE.');
  }
  if (evidence.pointInTimeRecovery !== 'POINT_IN_TIME_RECOVERY_ENABLED') {
    issues.push('C5 must enable point-in-time recovery.');
  }
  if (evidence.deleteProtection !== 'DELETE_PROTECTION_ENABLED') {
    issues.push('C5 must enable delete protection.');
  }
  if (apis.includes('calendar-json.googleapis.com')) {
    issues.push('C5 must not enable Calendar JSON API; that is C6.');
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateC6Smoke(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, issues: ['C6 evidence must be a JSON object'] };
  }
  const issues = projectIssues(evidence, 'C6');
  const apis = enabledApis(evidence);
  if (!apis.includes('calendar-json.googleapis.com')) {
    issues.push('C6 must enable calendar-json.googleapis.com.');
  }
  if (evidence.bookingUnrouted !== true) {
    issues.push('C6 must keep formal booking UNROUTED.');
  }
  if (evidence.watchUnrouted !== true) {
    issues.push('C6 must keep CalendarWatchController UNROUTED.');
  }
  return { ok: issues.length === 0, issues };
}

function isDirectRun() {
  const invoked = process.argv[1];
  if (typeof invoked !== 'string' || invoked === '') return false;
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isDirectRun()) {
  const slice = process.argv[2];
  const path = process.argv[3];
  const evaluators = {
    C2: evaluateC2Smoke,
    C5: evaluateC5Smoke,
    C6: evaluateC6Smoke
  };
  if (!evaluators[slice] || !path) {
    process.stderr.write(
      'Usage: node scripts/c2-c6-smoke-evidence.mjs <C2|C5|C6> <local-evidence.json>\n'
    );
    process.exit(2);
  }
  const evidence = JSON.parse(readFileSync(path, 'utf8'));
  const result = evaluators[slice](evidence);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
