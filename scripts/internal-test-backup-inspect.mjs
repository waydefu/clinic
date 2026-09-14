import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';

export const PITR_RETENTION = '604800s';
export const DAILY_BACKUP_RETENTION = '2592000s';
const DESTINATION_PATTERN = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;

export function internalTestBackupCollectCommands(projectId) {
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(
      isolatedC1ProjectIdError(projectId, 'internal-test backup inspect')
    );
  }
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(
      isolatedC1ProjectIdError(projectId, 'internal-test backup inspect')
    );
  }
  return [
    `gcloud firestore databases list --project=${projectId} --format=json`,
    `gcloud firestore backups schedules list --database='(default)' --project=${projectId} --format=json`
  ];
}

function databasesFromSnapshot(snapshot) {
  const value = snapshot?.databases ?? snapshot?.firestoreDatabases;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.databases)) return value.databases;
  return [];
}

function schedulesFromSnapshot(snapshot) {
  const value = snapshot?.backupSchedules ?? snapshot?.schedules;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.backupSchedules)) return value.backupSchedules;
  return [];
}

function isDailySchedule(schedule) {
  return (
    schedule?.dailyRecurrence !== undefined ||
    schedule?.daily_recurrence !== undefined
  );
}

export function assembleInternalTestBackupEvidence(snapshot) {
  const projectId = String(snapshot?.projectId ?? '').trim();
  const databases = databasesFromSnapshot(snapshot);
  const database = databases[0] ?? {};
  const schedules = schedulesFromSnapshot(snapshot);
  const daily = schedules.find(
    (schedule) =>
      isDailySchedule(schedule) &&
      (schedule.retention === DAILY_BACKUP_RETENTION ||
        schedule.retention === '2592000s')
  );
  return {
    projectId,
    region: database.locationId,
    firestoreType: database.type,
    pointInTimeRecovery: database.pointInTimeRecoveryEnablement,
    deleteProtection: database.deleteProtectionState,
    pitrRetention: database.versionRetentionPeriod,
    dailyBackupRetention: daily?.retention,
    scheduleCount: schedules.length
  };
}

export function evaluateInternalTestBackup(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return {
      ok: false,
      issues: ['internal-test backup evidence must be a JSON object']
    };
  }
  const issues = [];
  const projectId = evidence.projectId;
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-test backup inspect')
    );
  } else if (!isIsolatedC1ProjectId(projectId)) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-test backup inspect')
    );
  }
  if (evidence.region !== 'asia-east1') {
    issues.push('internal-test backup requires asia-east1.');
  }
  if (evidence.firestoreType !== 'FIRESTORE_NATIVE') {
    issues.push('internal-test backup requires FIRESTORE_NATIVE.');
  }
  if (evidence.pointInTimeRecovery !== 'POINT_IN_TIME_RECOVERY_ENABLED') {
    issues.push('internal-test backup requires PITR enabled.');
  }
  if (evidence.deleteProtection !== 'DELETE_PROTECTION_ENABLED') {
    issues.push('internal-test backup requires delete protection.');
  }
  if (evidence.pitrRetention !== PITR_RETENTION) {
    issues.push(
      `internal-test backup requires PITR retention ${PITR_RETENTION}.`
    );
  }
  if (evidence.dailyBackupRetention !== DAILY_BACKUP_RETENTION) {
    issues.push(
      `internal-test backup requires a same-location daily schedule with retention ${DAILY_BACKUP_RETENTION}; SHA-gated C5 source exists, apply needs a fresh exact-SHA packet.`
    );
  }
  return { ok: issues.length === 0, issues };
}

export function assertInternalTestRestorePacket(packet, headSha) {
  const sha = String(packet?.sha ?? '').trim();
  const projectId = String(packet?.projectId ?? '').trim();
  const destinationDatabase = String(packet?.destinationDatabase ?? '').trim();
  const snapshotTime = String(packet?.snapshotTime ?? '').trim();
  const operator = String(packet?.operator ?? '').trim();
  const approver = String(packet?.approver ?? '').trim();
  const expectedSha = String(headSha ?? '').trim();

  if (expectedSha === '' || !/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new Error(
      'internal-test restore plan requires the current 40-char HEAD SHA.'
    );
  }
  if (sha !== expectedSha) {
    throw new Error(
      'internal-test restore packet SHA is not this HEAD; earlier packets are not reusable.'
    );
  }
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(
      isolatedC1ProjectIdError(projectId, 'internal-test restore')
    );
  }
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(
      isolatedC1ProjectIdError(projectId, 'internal-test restore')
    );
  }
  if (
    destinationDatabase === '(default)' ||
    destinationDatabase === 'default'
  ) {
    throw new Error(
      'internal-test restore refuses in-place clone onto (default); C0 requires a new database.'
    );
  }
  if (!DESTINATION_PATTERN.test(destinationDatabase)) {
    throw new Error(
      'internal-test restore requires a new Firestore database id `[a-z][a-z0-9-]{2,61}[a-z0-9]`.'
    );
  }
  if (snapshotTime === '' || operator === '' || approver === '') {
    throw new Error(
      'internal-test restore packet must name snapshotTime, operator, and approver.'
    );
  }
  if (Number.isNaN(Date.parse(snapshotTime))) {
    throw new Error(
      'internal-test restore snapshotTime must be a parseable UTC timestamp.'
    );
  }
  return {
    sha,
    projectId,
    destinationDatabase,
    snapshotTime,
    operator,
    approver
  };
}

export function planInternalTestRestore(packet, headSha) {
  const authorized = assertInternalTestRestorePacket(packet, headSha);
  return {
    execute: false,
    projectId: authorized.projectId,
    destinationDatabase: authorized.destinationDatabase,
    cloneCommand: [
      'gcloud',
      'firestore',
      'databases',
      'clone',
      '(default)',
      `--destination-database=${authorized.destinationDatabase}`,
      `--snapshot-time=${authorized.snapshotTime}`,
      `--project=${authorized.projectId}`
    ].join(' '),
    note: 'Clone to a new database only. Do not in-place restore. Do not target beauessence-clinic-staging or production.'
  };
}

export function restorePacketFromEnv(env = process.env) {
  return {
    sha: env['INTERNAL_TEST_RESTORE_SHA'],
    projectId: env['INTERNAL_TEST_RESTORE_PROJECT'],
    destinationDatabase: env['INTERNAL_TEST_RESTORE_DESTINATION_DATABASE'],
    snapshotTime: env['INTERNAL_TEST_RESTORE_SNAPSHOT_TIME'],
    operator: env['INTERNAL_TEST_RESTORE_OPERATOR'],
    approver: env['INTERNAL_TEST_RESTORE_APPROVER']
  };
}

export const INSPECT_USAGE =
  'Usage: pnpm inspect:internal-test-backup -- inspect <snapshot.json>\nOr: set INTERNAL_TEST_RESTORE_{SHA,PROJECT,DESTINATION_DATABASE,SNAPSHOT_TIME,OPERATOR,APPROVER} then pnpm inspect:internal-test-backup -- plan <40-char-HEAD-sha>\nDoes not apply Terraform, clone, or restore. Live/staging/production are refused.\n';

export function runInternalTestBackupCli({
  argv,
  env,
  stdout,
  stderr,
  readFile
}) {
  const reader = readFile ?? ((path) => readFileSync(path, 'utf8'));
  const args = argv.filter((argument) => argument !== '--');
  const [mode, operand] = args;
  if (mode !== 'inspect' && mode !== 'plan') {
    stderr.write(INSPECT_USAGE);
    return 2;
  }
  try {
    if (mode === 'inspect') {
      if (typeof operand !== 'string' || operand === '') {
        stderr.write(INSPECT_USAGE);
        return 2;
      }
      const snapshot = JSON.parse(reader(operand));
      const evidence = assembleInternalTestBackupEvidence(snapshot);
      const result = evaluateInternalTestBackup(evidence);
      stdout.write(
        `${JSON.stringify({ execute: false, evidence, result }, null, 2)}\n`
      );
      return result.ok ? 0 : 1;
    }
    const headSha = args.find((argument) => /^[a-f0-9]{40}$/.test(argument));
    if (headSha === undefined) {
      stderr.write(INSPECT_USAGE);
      return 2;
    }
    const plan = planInternalTestRestore(restorePacketFromEnv(env), headSha);
    stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
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
  process.exitCode = runInternalTestBackupCli({
    argv: process.argv.slice(2),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr
  });
}
