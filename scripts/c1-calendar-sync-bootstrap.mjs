import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { isUtcIsoTimestamp } from '../apps/web/public/vendor/domain/timestamp.js';
import { ISOLATED_C1_PROJECT_ID } from './internal-test-c1-identity.mjs';

export const C1_CALENDAR_SYNC_PROJECT = ISOLATED_C1_PROJECT_ID;
export const C1_CALENDAR_SYNC_SOURCE_ID = 'c1_synthetic_calendar';

function utc(value, name) {
  if (!isUtcIsoTimestamp(value))
    throw new Error(`${name} must be an exact UTC timestamp.`);
  return value;
}

export function planC1CalendarSyncBootstrap(environment, now = new Date()) {
  if (environment['GOOGLE_CLOUD_PROJECT'] !== C1_CALENDAR_SYNC_PROJECT)
    throw new Error(
      'Refusing C1 Calendar sync bootstrap outside the isolated project.'
    );
  if (environment['C1_CALENDAR_SYNC_BOOTSTRAP_CONFIRM'] !== 'YES')
    throw new Error(
      'C1 Calendar sync bootstrap requires explicit confirmation.'
    );
  const sourceSha = environment['C1_CALENDAR_SYNC_AUTHORITY_SHA'];
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/u.test(sourceSha))
    throw new Error('C1 Calendar sync bootstrap requires an exact source SHA.');
  const expiresAt = utc(
    environment['C1_CALENDAR_SYNC_EXPIRES_AT'],
    'C1_CALENDAR_SYNC_EXPIRES_AT'
  );
  const nowMs = now.getTime();
  const expiresAtMs = Date.parse(expiresAt);
  if (expiresAtMs <= nowMs || expiresAtMs - nowMs > 31 * 24 * 60 * 60 * 1000)
    throw new Error(
      'C1 Calendar sync expiry must be future and no more than 31 days.'
    );
  const occurredAt = now.toISOString();
  return {
    sourceSha,
    configuration: {
      activeSourceId: C1_CALENDAR_SYNC_SOURCE_ID,
      previousSourceId: null,
      version: 1,
      expiresAt,
      health: 'idle',
      lastSuccessfulSyncAt: null,
      nextScheduledSyncAt: null,
      inboundEnabled: true,
      outboundEnabled: true,
      workerLeaseOwner: null,
      workerLeaseExpiresAt: null,
      synthetic: true,
      sourceSha,
      createdAt: occurredAt
    },
    source: {
      displayName: 'C1 synthetic Calendar',
      enabled: true,
      state: 'active',
      syncToken: null,
      lastSyncedAt: null,
      lastFullSyncAt: null,
      lastErrorCode: null,
      synthetic: true,
      sourceSha,
      createdAt: occurredAt
    },
    audit: {
      action: 'c1_calendar_sync_bootstrapped',
      sourceId: C1_CALENDAR_SYNC_SOURCE_ID,
      sourceSha,
      occurredAt
    }
  };
}

export async function bootstrapC1CalendarSync(environment = process.env) {
  const plan = planC1CalendarSyncBootstrap(environment);
  if (getApps().length === 0)
    initializeApp({ projectId: C1_CALENDAR_SYNC_PROJECT });
  const db = getFirestore();
  const configurationRef = db
    .collection('calendar_pilot_configuration')
    .doc('active');
  const sourceRef = db
    .collection('calendar_pilot_sources')
    .doc(C1_CALENDAR_SYNC_SOURCE_ID);
  const auditRef = db
    .collection('calendar_pilot_audit_events')
    .doc(randomUUID());

  await db.runTransaction(async (transaction) => {
    const [configuration, source] = await Promise.all([
      transaction.get(configurationRef),
      transaction.get(sourceRef)
    ]);
    if (configuration.exists || source.exists)
      throw new Error('C1 Calendar sync bootstrap refuses to overwrite state.');
    transaction.create(configurationRef, plan.configuration);
    transaction.create(sourceRef, plan.source);
    transaction.create(auditRef, plan.audit);
  });
  return {
    projectId: C1_CALENDAR_SYNC_PROJECT,
    sourceId: C1_CALENDAR_SYNC_SOURCE_ID,
    sourceSha: plan.sourceSha
  };
}

function requiredText(environment, name) {
  const value = environment[name];
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${name} is required for C1 Calendar sync renewal.`);
  return value.trim();
}

export function planC1CalendarSyncRenewal(environment, now = new Date()) {
  const plan = planC1CalendarSyncBootstrap(environment, now);
  return {
    sourceSha: plan.sourceSha,
    expiresAt: plan.configuration.expiresAt,
    operator: requiredText(environment, 'C1_CALENDAR_SYNC_OPERATOR'),
    reason: requiredText(environment, 'C1_CALENDAR_SYNC_RENEW_REASON')
  };
}

export function assertC1CalendarSyncRenewable(
  configuration,
  source,
  now = new Date()
) {
  if (!configuration.exists || !source.exists)
    throw new Error('C1 Calendar sync renewal requires existing state.');
  const config = configuration.data();
  const sourceData = source.data();
  if (
    config['synthetic'] !== true ||
    config['activeSourceId'] !== C1_CALENDAR_SYNC_SOURCE_ID ||
    sourceData['synthetic'] !== true
  )
    throw new Error('C1 Calendar sync renewal refuses non-C1 state.');
  if (config['workerLeaseOwner'] != null)
    throw new Error('C1 Calendar sync renewal refuses a held worker lease.');
  const expiresAt = config['expiresAt'];
  if (
    typeof expiresAt !== 'string' ||
    !isUtcIsoTimestamp(expiresAt) ||
    Date.parse(expiresAt) > now.getTime()
  )
    throw new Error('C1 Calendar sync renewal refuses an unexpired config.');
  if (typeof config['version'] !== 'number')
    throw new Error('C1 Calendar sync renewal requires a numeric version.');
  return { previousExpiresAt: expiresAt, version: config['version'] };
}

export async function renewC1CalendarSync(
  environment = process.env,
  now = new Date(),
  database = undefined
) {
  const plan = planC1CalendarSyncRenewal(environment, now);
  let db = database;
  if (db === undefined) {
    if (getApps().length === 0)
      initializeApp({ projectId: C1_CALENDAR_SYNC_PROJECT });
    db = getFirestore();
  }
  const configurationRef = db
    .collection('calendar_pilot_configuration')
    .doc('active');
  const sourceRef = db
    .collection('calendar_pilot_sources')
    .doc(C1_CALENDAR_SYNC_SOURCE_ID);
  const auditRef = db
    .collection('calendar_pilot_audit_events')
    .doc(randomUUID());

  await db.runTransaction(async (transaction) => {
    const [configuration, source] = await Promise.all([
      transaction.get(configurationRef),
      transaction.get(sourceRef)
    ]);
    const current = assertC1CalendarSyncRenewable(configuration, source, now);
    transaction.update(configurationRef, {
      expiresAt: plan.expiresAt,
      version: current.version + 1
    });
    transaction.create(auditRef, {
      action: 'c1_calendar_sync_renewed',
      sourceId: C1_CALENDAR_SYNC_SOURCE_ID,
      sourceSha: plan.sourceSha,
      occurredAt: now.toISOString(),
      previousExpiresAt: current.previousExpiresAt,
      expiresAt: plan.expiresAt,
      operator: plan.operator,
      reason: plan.reason
    });
  });
  return {
    projectId: C1_CALENDAR_SYNC_PROJECT,
    sourceId: C1_CALENDAR_SYNC_SOURCE_ID,
    expiresAt: plan.expiresAt
  };
}

function isDirectRun() {
  const invoked = process.argv[1];
  return (
    typeof invoked === 'string' &&
    invoked !== '' &&
    import.meta.url === pathToFileURL(invoked).href
  );
}

if (isDirectRun()) {
  (process.argv.includes('--renew-expired')
    ? renewC1CalendarSync()
    : bootstrapC1CalendarSync()
  ).then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Bootstrap failed.'}\n`
      );
      process.exitCode = 1;
    }
  );
}
