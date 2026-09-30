import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { isIsolatedC1ProjectId } from './isolated-c1-project-id.mjs';

export const RECOVERY_COLLECTIONS = Object.freeze([
  'appointments',
  'patients',
  'slots',
  'patient_lookup_index_v2',
  'audit_events',
  'outbox_jobs'
]);

const DATABASE_PATTERN = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;
const FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

function fail(message) {
  throw new Error(message);
}

export function validateRecoveryTarget({ project, database }) {
  if (!isIsolatedC1ProjectId(project))
    fail('project must be an isolated C1 project id.');
  if (typeof database !== 'string' || !DATABASE_PATTERN.test(database))
    fail('database must be a valid named database id.');
  if (database === '(default)') fail('database must not be (default).');
}

function validateManifest(manifest) {
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest)
  )
    fail('manifest must be a JSON object.');
  if (manifest.schemaVersion !== 1) fail('manifest schemaVersion must be 1.');

  const expectedCounts = manifest.expectedCounts;
  if (
    expectedCounts === null ||
    typeof expectedCounts !== 'object' ||
    Array.isArray(expectedCounts)
  )
    fail('manifest expectedCounts must be an object.');
  const keys = Object.keys(expectedCounts).sort();
  if (keys.join('\0') !== [...RECOVERY_COLLECTIONS].sort().join('\0'))
    fail(
      'manifest expectedCounts must contain exactly the six recovery collections.'
    );
  for (const collection of RECOVERY_COLLECTIONS) {
    const count = expectedCounts[collection];
    if (!Number.isSafeInteger(count) || count < 0)
      fail(`manifest count for ${collection} must be a non-negative integer.`);
  }

  const sampleAppointments = manifest.sampleAppointments;
  if (!Array.isArray(sampleAppointments) || sampleAppointments.length !== 10)
    fail(
      'manifest sampleAppointments must list exactly 10 synthetic appointments.'
    );
  const appointmentIds = new Set();
  for (const [index, appointment] of sampleAppointments.entries()) {
    if (
      appointment === null ||
      typeof appointment !== 'object' ||
      Array.isArray(appointment) ||
      typeof appointment.id !== 'string' ||
      appointment.id.length === 0 ||
      appointment.fields === null ||
      typeof appointment.fields !== 'object' ||
      Array.isArray(appointment.fields)
    )
      fail(`manifest sampleAppointments[${index}] must contain id and fields.`);
    if (appointmentIds.has(appointment.id))
      fail('manifest sampleAppointments ids must be unique.');
    appointmentIds.add(appointment.id);
    const fields = Object.keys(appointment.fields);
    if (
      fields.length === 0 ||
      fields.some((field) => !FIELD_PATTERN.test(field))
    )
      fail(
        `manifest sampleAppointments[${index}].fields must use simple field names.`
      );
  }

  const expectedAuditEvents = manifest.expectedAuditEvents;
  if (!Array.isArray(expectedAuditEvents))
    fail('manifest expectedAuditEvents must be an array.');
  const auditIds = new Set();
  for (const [index, event] of expectedAuditEvents.entries()) {
    if (
      event === null ||
      typeof event !== 'object' ||
      Array.isArray(event) ||
      typeof event.id !== 'string' ||
      event.id.length === 0 ||
      typeof event.occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(event.occurredAt))
    )
      fail(
        `manifest expectedAuditEvents[${index}] must contain id and occurredAt.`
      );
    if (auditIds.has(event.id))
      fail('manifest expectedAuditEvents ids must be unique.');
    auditIds.add(event.id);
  }

  if (expectedCounts.appointments < 10)
    fail('manifest appointments count must cover all 10 sample appointments.');
  if (expectedCounts.audit_events !== expectedAuditEvents.length)
    fail('manifest audit_events count must match expectedAuditEvents length.');

  return { expectedCounts, sampleAppointments, expectedAuditEvents };
}

function snapshotData(snapshot) {
  if (typeof snapshot?.data === 'function') return snapshot.data() ?? {};
  return snapshot ?? {};
}

function valuesEqual(actual, expected) {
  return isDeepStrictEqual(actual, expected);
}

function normalizeOccurredAt(value) {
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : null;
  }
  if (value && typeof value.toDate === 'function')
    return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

/**
 * Read-only V1–V3 verification against a caller-supplied cutoff manifest.
 * Manifest provenance and completeness are not established here; V2 checks
 * only its listed fields, and V3 checks only the listed audit receipts. The
 * supplied db must be bound to the validated named database. No mutation
 * methods are called. V4–V6 remain for the authorised CP-06-E drill.
 */
export async function verifyRecoveryClone({ project, database, manifest, db }) {
  validateRecoveryTarget({ project, database });
  const expected = validateManifest(manifest);
  if (!db || typeof db.collection !== 'function')
    fail('a Firestore database is required.');

  const counts = {};
  for (const collection of RECOVERY_COLLECTIONS) {
    const result = await db.collection(collection).select().get();
    counts[collection] = result.size;
  }
  const countMismatches = RECOVERY_COLLECTIONS.filter(
    (collection) => counts[collection] !== expected.expectedCounts[collection]
  );

  const appointmentMismatches = [];
  let fieldComparisons = 0;
  for (const item of expected.sampleAppointments) {
    const fields = Object.keys(item.fields);
    fieldComparisons += fields.length;
    const snapshot = await db
      .collection('appointments')
      .doc(item.id)
      .select(...fields)
      .get();
    const data = snapshotData(snapshot);
    const mismatchedFields = fields.filter(
      (field) => !valuesEqual(data[field], item.fields[field])
    );
    if (!snapshot.exists || mismatchedFields.length > 0) {
      appointmentMismatches.push({
        fields: snapshot.exists ? mismatchedFields : fields
      });
    }
  }

  const auditSnapshot = await db
    .collection('audit_events')
    .select('occurredAt')
    .get();
  const actualAuditEvents = auditSnapshot.docs
    .map((document) => ({
      id: document.id,
      occurredAt: normalizeOccurredAt(snapshotData(document).occurredAt)
    }))
    .sort((left, right) =>
      left.occurredAt === right.occurredAt
        ? left.id.localeCompare(right.id)
        : (Date.parse(left.occurredAt ?? '') || 0) -
          (Date.parse(right.occurredAt ?? '') || 0)
    );
  const expectedSortedAuditEvents = expected.expectedAuditEvents
    .map((event) => ({
      id: event.id,
      occurredAt: normalizeOccurredAt(event.occurredAt)
    }))
    .sort((left, right) =>
      left.occurredAt === right.occurredAt
        ? left.id.localeCompare(right.id)
        : Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    );
  const auditMatchesExpectedList = valuesEqual(
    actualAuditEvents,
    expectedSortedAuditEvents
  );

  const checks = {
    V1: {
      status: countMismatches.length === 0 ? 'PASS' : 'FAIL',
      collections: Object.fromEntries(
        RECOVERY_COLLECTIONS.map((collection) => [
          collection,
          {
            expected: expected.expectedCounts[collection],
            actual: counts[collection]
          }
        ])
      )
    },
    V2: {
      status: appointmentMismatches.length === 0 ? 'PASS' : 'FAIL',
      expected: expected.sampleAppointments.length,
      matched:
        expected.sampleAppointments.length - appointmentMismatches.length,
      fieldComparisons,
      mismatches: appointmentMismatches
    },
    V3: {
      status: auditMatchesExpectedList ? 'PASS' : 'FAIL',
      expected: expectedSortedAuditEvents.length,
      actual: actualAuditEvents.length,
      matchesExpectedList: auditMatchesExpectedList
    }
  };

  return {
    schemaVersion: 1,
    checks,
    overall: Object.values(checks).every((check) => check.status === 'PASS')
      ? 'PASS'
      : 'FAIL'
  };
}

export function parseRecoveryArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--project', '--database', '--manifest'].includes(key))
      fail(`unsupported argument: ${key}`);
    if (options[key] !== undefined) fail(`duplicate argument: ${key}`);
    const value = argv[index + 1];
    if (typeof value !== 'string' || value.startsWith('--'))
      fail(`missing value for ${key}`);
    options[key] = value;
    index += 1;
  }
  const result = {
    project: options['--project'],
    database: options['--database'],
    manifestPath: options['--manifest']
  };
  if (!result.project || !result.database || !result.manifestPath)
    fail('required arguments: --project, --database, --manifest.');
  validateRecoveryTarget(result);
  return result;
}

export async function runRecoveryCloneVerifier({
  argv = process.argv.slice(2),
  createDb = async (project, database) => {
    const [{ initializeApp }, { getFirestore }] = await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/firestore')
    ]);
    const app = initializeApp(
      { projectId: project },
      `recovery-verify-${Date.now()}`
    );
    return { db: getFirestore(app, database), app };
  },
  readManifestFile = (path) => readFile(path, 'utf8')
} = {}) {
  const { project, database, manifestPath } = parseRecoveryArgs(argv);
  const manifest = JSON.parse(await readManifestFile(manifestPath));
  const created = await createDb(project, database);
  try {
    return await verifyRecoveryClone({
      project,
      database,
      manifest,
      db: created.db ?? created
    });
  } finally {
    if (created.app) await created.app.delete();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  try {
    const report = await runRecoveryCloneVerifier();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.overall !== 'PASS') process.exitCode = 1;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, overall: 'FAIL', error: error instanceof SyntaxError ? 'invalid_manifest_json' : 'verification_failed' }, null, 2)}\n`
    );
    process.exitCode = 1;
  }
}
