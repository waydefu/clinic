import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  ISOLATED_PROJECT_PATTERN,
  UNAPPLIED_PLACEHOLDER,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export {
  FORBIDDEN_STAGING_PROJECT,
  ISOLATED_PROJECT_PATTERN,
  UNAPPLIED_PLACEHOLDER
};

export function assertIsolatedSliceProjectId(projectId, slice) {
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(isolatedC1ProjectIdError(projectId, `${slice} smoke`));
  }
}

export function bookingAndWatchRemainUnrouted(appModuleSource) {
  return !/AppointmentController|BookPilotModule|CalendarWatchController/.test(
    appModuleSource
  );
}

function projectIssues(evidence, slice) {
  const issues = [];
  const projectId = evidence?.projectId;
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    issues.push(
      `${slice} smoke used beauessence-clinic-staging; that project is not C1.`
    );
  } else if (!isIsolatedC1ProjectId(projectId)) {
    issues.push(
      `${slice} projectId must be beauessence-clinic-stg- plus 1-7 lowercase alphanumeric chars (GCP max 30).`
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

function apiIdFromService(entry) {
  const name = entry?.config?.name ?? entry?.name ?? '';
  const match = String(name).match(/([a-z0-9.-]+\.googleapis\.com)$/);
  return match ? match[1] : '';
}

function enabledApisFromSnapshot(snapshot) {
  if (Array.isArray(snapshot.enabledApis)) return snapshot.enabledApis;
  return (snapshot.services ?? []).map(apiIdFromService).filter(Boolean);
}

function firestoreDatabasesFromSnapshot(snapshot) {
  const value = snapshot.firestoreDatabases;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.databases)) return value.databases;
  return [];
}

export function totpAdjacentIntervalsFromIdentityConfig(config) {
  const providers = config?.mfa?.providerConfigs;
  if (!Array.isArray(providers)) return undefined;
  const totp = providers.find((provider) => provider?.totpProviderConfig);
  return totp?.totpProviderConfig?.adjacentIntervals;
}

export function c2SmokeCollectCommands(projectId) {
  assertIsolatedSliceProjectId(projectId, 'C2');
  return [
    `gcloud services list --enabled --project=${projectId} --format=json`,
    `gcloud firestore databases list --project=${projectId} --format=json`,
    `# Identity Toolkit admin config (local ADC; do not paste the token): curl -sS -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: ${projectId}" "https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config"`
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

export function assembleC2SmokeEvidence(snapshot) {
  assertIsolatedSliceProjectId(snapshot.projectId, 'C2');
  const databases = firestoreDatabasesFromSnapshot(snapshot);
  return {
    projectId: snapshot.projectId,
    region: snapshot.region,
    enabledApis: enabledApisFromSnapshot(snapshot),
    totpAdjacentIntervals: totpAdjacentIntervalsFromIdentityConfig(
      snapshot.identityConfig
    ),
    firestoreDatabase: databases.length > 0
  };
}

export function assembleC5SmokeEvidence(snapshot) {
  assertIsolatedSliceProjectId(snapshot.projectId, 'C5');
  const databases = firestoreDatabasesFromSnapshot(snapshot);
  const database = databases[0] ?? {};
  return {
    projectId: snapshot.projectId,
    region: snapshot.region ?? database.locationId,
    enabledApis: enabledApisFromSnapshot(snapshot),
    firestoreType: database.type,
    pointInTimeRecovery: database.pointInTimeRecoveryEnablement,
    deleteProtection: database.deleteProtectionState
  };
}

export function assembleC6SmokeEvidence(snapshot, appModuleSource) {
  assertIsolatedSliceProjectId(snapshot.projectId, 'C6');
  const hasSource =
    typeof appModuleSource === 'string' && appModuleSource.length > 0;
  const unrouted = hasSource
    ? bookingAndWatchRemainUnrouted(appModuleSource)
    : undefined;
  return {
    projectId: snapshot.projectId,
    region: snapshot.region,
    enabledApis: enabledApisFromSnapshot(snapshot),
    bookingUnrouted: unrouted,
    watchUnrouted: unrouted
  };
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
  const evaluators = {
    C2: evaluateC2Smoke,
    C5: evaluateC5Smoke,
    C6: evaluateC6Smoke
  };
  const assemblers = {
    C2: assembleC2SmokeEvidence,
    C5: assembleC5SmokeEvidence,
    C6: (snapshot) =>
      assembleC6SmokeEvidence(
        snapshot,
        readFileSync(join(root, 'apps/api/src/app.module.ts'), 'utf8')
      )
  };

  if (process.argv[2] === 'assemble') {
    const slice = process.argv[3];
    const path = process.argv[4];
    if (!assemblers[slice] || !path) {
      process.stderr.write(
        'Usage: node scripts/c2-c6-smoke-evidence.mjs assemble <C2|C5|C6> <gcloud-snapshot.json>\n'
      );
      process.exit(2);
    }
    const snapshot = JSON.parse(readFileSync(path, 'utf8'));
    process.stdout.write(
      `${JSON.stringify(assemblers[slice](snapshot), null, 2)}\n`
    );
    process.exit(0);
  }

  const slice = process.argv[2];
  const path = process.argv[3];
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
