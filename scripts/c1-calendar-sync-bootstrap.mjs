import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const C1_CALENDAR_SYNC_PROJECT = 'beauessence-clinic-stg-c1a01';
export const C1_CALENDAR_SYNC_SOURCE_ID = 'c1_synthetic_calendar';

function utc(value, name) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  )
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

function isDirectRun() {
  const invoked = process.argv[1];
  return (
    typeof invoked === 'string' &&
    invoked !== '' &&
    import.meta.url === pathToFileURL(invoked).href
  );
}

if (isDirectRun()) {
  bootstrapC1CalendarSync().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Bootstrap failed.'}\n`
      );
      process.exitCode = 1;
    }
  );
}
