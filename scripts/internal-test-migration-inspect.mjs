import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  FORBIDDEN_STAGING_PROJECT,
  isIsolatedC1ProjectId,
  isolatedC1ProjectIdError
} from './isolated-c1-project-id.mjs';

export const STAGING_SCOPED_MIGRATE_SCRIPT =
  'scripts/migrate-cal-pilot-legacy-candidates.mjs';
export const CURRENT_DOCUMENT_SCHEMA_VERSION = 1;

function assertIsolatedC1Project(projectId, context) {
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    throw new Error(isolatedC1ProjectIdError(projectId, context));
  }
  if (!isIsolatedC1ProjectId(projectId)) {
    throw new Error(isolatedC1ProjectIdError(projectId, context));
  }
}

export function internalTestMigrationCollectCommands(projectId) {
  assertIsolatedC1Project(projectId, 'internal-test migration inspect');
  return [
    `gcloud firestore databases describe '(default)' --project=${projectId} --format=json`
  ];
}

function documentsFrom(snapshot, keys) {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.documents)) return value.documents;
  }
  return [];
}

function recordOf(document) {
  if (
    document === null ||
    typeof document !== 'object' ||
    Array.isArray(document)
  ) {
    return null;
  }
  const nested = document.data;
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested;
  }
  return document;
}

export function missingExpectedEtag(candidate) {
  return (
    typeof candidate?.expectedEtag !== 'string' ||
    candidate.expectedEtag.trim() === ''
  );
}

export function isLegacyCalendarCandidate(candidate) {
  const record = recordOf(candidate);
  if (record === null) return false;
  if (record.status !== undefined && record.status !== 'pending') return false;
  return record.kind === 'invalid_format' && missingExpectedEtag(record);
}

export function isUnreadableSchemaVersion(document) {
  const record = recordOf(document);
  if (record === null) return true;
  return (
    Object.prototype.hasOwnProperty.call(record, 'schemaVersion') &&
    record.schemaVersion !== CURRENT_DOCUMENT_SCHEMA_VERSION
  );
}

export function assembleInternalTestMigrationEvidence(snapshot) {
  const projectId = String(snapshot?.projectId ?? '').trim();
  const appointments = documentsFrom(snapshot, ['appointments']);
  const slots = documentsFrom(snapshot, ['slots']);
  const followUps = documentsFrom(snapshot, ['followUps', 'follow_ups']);
  const calendarPilotCandidates = documentsFrom(snapshot, [
    'calendarPilotCandidates',
    'calendar_pilot_candidates'
  ]);
  return {
    projectId,
    appointmentCount: appointments.length,
    unreadableAppointmentCount: appointments.filter(isUnreadableSchemaVersion)
      .length,
    slotCount: slots.length,
    unreadableSlotCount: slots.filter(isUnreadableSchemaVersion).length,
    followUpCount: followUps.length,
    unreadableFollowUpCount: followUps.filter(isUnreadableSchemaVersion).length,
    calendarCandidateCount: calendarPilotCandidates.length,
    legacyCalendarCandidateCount: calendarPilotCandidates.filter(
      isLegacyCalendarCandidate
    ).length
  };
}

export function evaluateInternalTestMigration(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return {
      ok: false,
      issues: ['internal-test migration evidence must be a JSON object']
    };
  }
  const issues = [];
  const projectId = evidence.projectId;
  if (projectId === FORBIDDEN_STAGING_PROJECT) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-test migration inspect')
    );
  } else if (!isIsolatedC1ProjectId(projectId)) {
    issues.push(
      isolatedC1ProjectIdError(projectId, 'internal-test migration inspect')
    );
  }
  if (evidence.unreadableAppointmentCount > 0) {
    issues.push(
      `internal-test migration found ${evidence.unreadableAppointmentCount} appointment document(s) the current schemaVersion=${CURRENT_DOCUMENT_SCHEMA_VERSION} parser cannot read; do not guess a rewrite.`
    );
  }
  if (evidence.unreadableSlotCount > 0) {
    issues.push(
      `internal-test migration found ${evidence.unreadableSlotCount} slot document(s) the current schemaVersion=${CURRENT_DOCUMENT_SCHEMA_VERSION} parser cannot read; do not guess a rewrite.`
    );
  }
  if (evidence.unreadableFollowUpCount > 0) {
    issues.push(
      `internal-test migration found ${evidence.unreadableFollowUpCount} follow-up document(s) the current schemaVersion=${CURRENT_DOCUMENT_SCHEMA_VERSION} parser cannot read; do not guess a rewrite.`
    );
  }
  if (evidence.legacyCalendarCandidateCount > 0) {
    issues.push(
      `internal-test migration found ${evidence.legacyCalendarCandidateCount} CAL-PILOT legacy candidate(s). ${STAGING_SCOPED_MIGRATE_SCRIPT} stays staging-scoped to ${FORBIDDEN_STAGING_PROJECT}; do not run it against isolated C1. Record a fresh exact-SHA packet.`
    );
  }
  return { ok: issues.length === 0, issues };
}

export function assertInternalTestMigrationPacket(packet, headSha) {
  const sha = String(packet?.sha ?? '').trim();
  const projectId = String(packet?.projectId ?? '').trim();
  const operator = String(packet?.operator ?? '').trim();
  const approver = String(packet?.approver ?? '').trim();
  const expectedSha = String(headSha ?? '').trim();

  if (expectedSha === '' || !/^[a-f0-9]{40}$/.test(expectedSha)) {
    throw new Error(
      'internal-test migration plan requires the current 40-char HEAD SHA.'
    );
  }
  if (sha !== expectedSha) {
    throw new Error(
      'internal-test migration packet SHA is not this HEAD; earlier packets are not reusable.'
    );
  }
  assertIsolatedC1Project(projectId, 'internal-test migration plan');
  if (operator === '' || approver === '') {
    throw new Error(
      'internal-test migration packet must name operator and approver.'
    );
  }
  return { sha, projectId, operator, approver };
}

export function planInternalTestMigration(packet, headSha) {
  const authorized = assertInternalTestMigrationPacket(packet, headSha);
  return {
    execute: false,
    projectId: authorized.projectId,
    migrateCommand: null,
    stagingMigrateScript: STAGING_SCOPED_MIGRATE_SCRIPT,
    note: `CAL-PILOT legacy candidate migrate remains staging-scoped to ${FORBIDDEN_STAGING_PROJECT}. Do not run ${STAGING_SCOPED_MIGRATE_SCRIPT} against isolated C1.`
  };
}

export function migrationPacketFromEnv(env = process.env) {
  return {
    sha: env['INTERNAL_TEST_MIGRATION_SHA'],
    projectId: env['INTERNAL_TEST_MIGRATION_PROJECT'],
    operator: env['INTERNAL_TEST_MIGRATION_OPERATOR'],
    approver: env['INTERNAL_TEST_MIGRATION_APPROVER']
  };
}

export const INSPECT_USAGE =
  'Usage: pnpm inspect:internal-test-migration -- inspect <snapshot.json>\nOr: set INTERNAL_TEST_MIGRATION_{SHA,PROJECT,OPERATOR,APPROVER} then pnpm inspect:internal-test-migration -- plan <40-char-HEAD-sha>\nDoes not migrate or shell out. Live/staging/production are refused. CAL-PILOT legacy migrate stays on beauessence-clinic-staging.\n';

export function runInternalTestMigrationCli({
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
      const evidence = assembleInternalTestMigrationEvidence(snapshot);
      const result = evaluateInternalTestMigration(evidence);
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
    const plan = planInternalTestMigration(
      migrationPacketFromEnv(env),
      headSha
    );
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
  process.exitCode = runInternalTestMigrationCli({
    argv: process.argv.slice(2),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr
  });
}
