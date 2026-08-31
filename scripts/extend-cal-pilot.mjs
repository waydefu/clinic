import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  validateExtensionRequest,
  validateExtensionState
} from './cal-pilot-extension-policy.mjs';

export async function extendCalPilot({
  db,
  projectId,
  expectedCurrentExpiry,
  requestedExpiry,
  expectedSourceGeneration,
  auditId = randomUUID(),
  occurredAt = new Date().toISOString()
}) {
  validateExtensionRequest({
    projectId,
    expectedCurrentExpiry,
    requestedExpiry
  });

  const configRef = db.collection('calendar_pilot_configuration').doc('active');
  const auditRef = db.collection('calendar_pilot_audit_events').doc(auditId);

  const result = await db.runTransaction(async (transaction) => {
    const [configurationDocument, enabledSources] = await Promise.all([
      transaction.get(configRef),
      transaction.get(
        db.collection('calendar_pilot_sources').where('enabled', '==', true)
      )
    ]);
    if (!configurationDocument.exists)
      throw new Error('CAL-PILOT configuration is missing.');
    const configuration = configurationDocument.data();
    const activeSourceEnabled = enabledSources.docs.some(
      (document) => document.id === configuration.activeSourceId
    );
    validateExtensionState({
      expiresAt: configuration.expiresAt,
      inboundEnabled: configuration.inboundEnabled,
      outboundEnabled: configuration.outboundEnabled,
      health: configuration.health,
      sourceGeneration: configuration.version,
      expectedSourceGeneration,
      enabledSourceIds: enabledSources.docs.map((document) => document.id),
      activeSourceEnabled
    });

    transaction.update(configRef, { expiresAt: requestedExpiry });
    transaction.create(auditRef, {
      action: 'calendar_pilot_expiry_extended',
      actorId: 'deployment_operator',
      occurredAt,
      previousExpiresAt: expectedCurrentExpiry,
      expiresAt: requestedExpiry
    });
    return { sourceGeneration: expectedSourceGeneration, auditId };
  });

  const updated = await configRef.get();
  const updatedConfiguration = updated.data();
  if (
    updatedConfiguration?.expiresAt !== requestedExpiry ||
    updatedConfiguration?.version !== result.sourceGeneration
  )
    throw new Error('CAL-PILOT extension verification failed.');

  return result;
}

async function main() {
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
  const expectedCurrentExpiry =
    process.env['CALENDAR_PILOT_EXPECTED_CURRENT_EXPIRY'];
  const requestedExpiry = process.env['CALENDAR_PILOT_EXTENDED_EXPIRY'];
  const expectedSourceGeneration = Number.parseInt(
    process.env['CALENDAR_PILOT_EXPECTED_SOURCE_GENERATION'] ?? '',
    10
  );
  if (process.env['CALENDAR_PILOT_CONFIRM_EXTENSION'] !== 'YES')
    throw new Error(
      'Extension is review-only; CALENDAR_PILOT_CONFIRM_EXTENSION=YES is required.'
    );

  if (getApps().length === 0) initializeApp({ projectId });
  const result = await extendCalPilot({
    db: getFirestore(),
    projectId,
    expectedCurrentExpiry,
    requestedExpiry,
    expectedSourceGeneration
  });
  process.stdout.write(
    `Extended synthetic CAL-PILOT to ${requestedExpiry}; source generation ${result.sourceGeneration} unchanged.\n`
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
)
  await main();
