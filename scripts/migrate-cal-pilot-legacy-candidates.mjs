import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPROVED_PROJECT = 'beauessence-clinic-staging';
const APPROVED_EXPIRY = '2026-11-28T04:51:37Z';
const MIGRATION_REASON = 'legacy_candidate_requires_resync';

function missingExpectedEtag(candidate) {
  return (
    typeof candidate.expectedEtag !== 'string' ||
    candidate.expectedEtag.trim() === ''
  );
}

function assertProjectAndCount(projectId, expectedCount) {
  if (projectId !== APPROVED_PROJECT)
    throw new Error('Refusing to migrate outside beauessence-clinic-staging.');
  if (
    !Number.isInteger(expectedCount) ||
    expectedCount < 1 ||
    expectedCount > 100
  )
    throw new Error('Expected legacy candidate count is invalid.');
}

export async function inspectLegacyCalendarCandidates({
  db,
  projectId,
  expectedCount,
  expectedSourceGeneration
}) {
  assertProjectAndCount(projectId, expectedCount);
  const [configurationDocument, enabledSources, pendingCandidates] =
    await Promise.all([
      db.collection('calendar_pilot_configuration').doc('active').get(),
      db
        .collection('calendar_pilot_sources')
        .where('enabled', '==', true)
        .get(),
      db
        .collection('calendar_pilot_candidates')
        .where('status', '==', 'pending')
        .get()
    ]);
  if (!configurationDocument.exists)
    throw new Error('CAL-PILOT configuration is missing.');
  const configuration = configurationDocument.data();
  if (
    configuration.expiresAt !== APPROVED_EXPIRY ||
    configuration.version !== expectedSourceGeneration ||
    typeof configuration.activeSourceId !== 'string'
  )
    throw new Error('CAL-PILOT configuration drifted from the migration gate.');
  const enabledSourceIds = enabledSources.docs.map((document) => document.id);
  if (
    enabledSourceIds.length !== 2 ||
    !enabledSourceIds.includes(configuration.activeSourceId)
  )
    throw new Error(
      'CAL-PILOT source allowlist drifted from the migration gate.'
    );
  const legacyCandidates = pendingCandidates.docs.filter((document) => {
    const candidate = document.data();
    return (
      candidate.kind === 'invalid_format' && missingExpectedEtag(candidate)
    );
  });
  if (legacyCandidates.length !== expectedCount)
    throw new Error(
      'Legacy candidate count drifted from the approved migration.'
    );
  return {
    activeSourceId: configuration.activeSourceId,
    sourceGeneration: configuration.version,
    switchesDisabled:
      configuration.inboundEnabled === false &&
      configuration.outboundEnabled === false,
    candidateIds: legacyCandidates.map((document) => document.id)
  };
}

export async function migrateLegacyCalendarCandidates({
  db,
  projectId,
  expectedCount,
  expectedSourceGeneration,
  auditId = randomUUID(),
  occurredAt = new Date().toISOString()
}) {
  const inspection = await inspectLegacyCalendarCandidates({
    db,
    projectId,
    expectedCount,
    expectedSourceGeneration
  });
  if (!inspection.switchesDisabled)
    throw new Error('CAL-PILOT switches must be disabled before migration.');
  const configRef = db.collection('calendar_pilot_configuration').doc('active');
  const sourceRef = db
    .collection('calendar_pilot_sources')
    .doc(inspection.activeSourceId);
  const auditRef = db.collection('calendar_pilot_audit_events').doc(auditId);

  await db.runTransaction(async (transaction) => {
    const [configurationDocument, sourceDocument] = await Promise.all([
      transaction.get(configRef),
      transaction.get(sourceRef)
    ]);
    if (!configurationDocument.exists || !sourceDocument.exists)
      throw new Error('CAL-PILOT migration state is missing.');
    const configuration = configurationDocument.data();
    if (
      configuration.expiresAt !== APPROVED_EXPIRY ||
      configuration.version !== expectedSourceGeneration ||
      configuration.activeSourceId !== inspection.activeSourceId ||
      configuration.inboundEnabled !== false ||
      configuration.outboundEnabled !== false ||
      sourceDocument.data().enabled !== true
    )
      throw new Error(
        'CAL-PILOT migration state changed during the transaction.'
      );

    const candidateDocuments = await Promise.all(
      inspection.candidateIds.map((candidateId) =>
        transaction.get(
          db.collection('calendar_pilot_candidates').doc(candidateId)
        )
      )
    );
    const candidateRecords = candidateDocuments.map((document) => {
      if (!document.exists) throw new Error('Legacy candidate disappeared.');
      const candidate = document.data();
      if (
        candidate.status !== 'pending' ||
        candidate.kind !== 'invalid_format' ||
        candidate.sourceId !== inspection.activeSourceId ||
        candidate.sourceVersion !== expectedSourceGeneration ||
        typeof candidate.expectedVersion !== 'number' ||
        typeof candidate.mirrorId !== 'string' ||
        candidate.mirrorId.trim() === '' ||
        !missingExpectedEtag(candidate)
      )
        throw new Error('Legacy candidate changed during the transaction.');
      return { document, candidate };
    });
    const mirrorDocuments = await Promise.all(
      candidateRecords.map(({ candidate }) =>
        transaction.get(
          db.collection('calendar_pilot_mirrors').doc(candidate.mirrorId)
        )
      )
    );
    for (const mirrorDocument of mirrorDocuments) {
      if (!mirrorDocument.exists) throw new Error('Legacy mirror disappeared.');
      const mirror = mirrorDocument.data();
      if (
        mirror.sourceId !== inspection.activeSourceId ||
        mirror.sourceVersion !== expectedSourceGeneration ||
        mirror.localDirty !== false ||
        mirror.linkId !== undefined ||
        typeof mirror.externalEventId !== 'string' ||
        typeof mirror.etag !== 'string' ||
        typeof mirror.parsed !== 'object' ||
        mirror.parsed === null ||
        mirror.parsed.ok !== false
      )
        throw new Error('Legacy mirror is not safe to rebuild.');
    }

    for (const { document, candidate } of candidateRecords)
      transaction.update(document.ref, {
        status: 'superseded',
        expectedVersion: candidate.expectedVersion + 1,
        reviewedBy: 'deployment_operator',
        reviewedAt: occurredAt,
        supersededReason: MIGRATION_REASON
      });
    for (const mirrorDocument of mirrorDocuments)
      transaction.delete(mirrorDocument.ref);
    transaction.update(sourceRef, {
      syncToken: null,
      lastErrorCode: 'legacy_candidate_resync_requested'
    });
    transaction.create(auditRef, {
      action: 'calendar_pilot_legacy_candidates_superseded',
      actorId: 'deployment_operator',
      occurredAt,
      sourceGeneration: expectedSourceGeneration,
      candidateCount: candidateRecords.length
    });
  });

  return { migratedCount: expectedCount, auditId };
}

export async function verifyLegacyCalendarCandidateRegeneration({
  db,
  projectId,
  expectedCount,
  expectedSourceGeneration
}) {
  assertProjectAndCount(projectId, expectedCount);
  const [configurationDocument, audits, pending, mirrors] = await Promise.all([
    db.collection('calendar_pilot_configuration').doc('active').get(),
    db
      .collection('calendar_pilot_audit_events')
      .where('action', '==', 'calendar_pilot_legacy_candidates_superseded')
      .get(),
    db
      .collection('calendar_pilot_candidates')
      .where('status', '==', 'pending')
      .get(),
    db.collection('calendar_pilot_mirrors').get()
  ]);
  if (!configurationDocument.exists)
    throw new Error('CAL-PILOT configuration is missing during verification.');
  const configuration = configurationDocument.data();
  if (
    configuration.expiresAt !== APPROVED_EXPIRY ||
    configuration.version !== expectedSourceGeneration ||
    typeof configuration.activeSourceId !== 'string'
  )
    throw new Error('CAL-PILOT verification state drifted.');
  const matchingAudits = audits.docs
    .map((document) => document.data())
    .filter(
      (audit) =>
        audit.sourceGeneration === expectedSourceGeneration &&
        audit.candidateCount === expectedCount &&
        typeof audit.occurredAt === 'string'
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const migrationAudit = matchingAudits[0];
  if (migrationAudit === undefined)
    throw new Error('Legacy candidate migration audit is missing.');
  const regeneratedCandidates = pending.docs
    .map((document) => document.data())
    .filter(
      (candidate) =>
        candidate.kind === 'invalid_format' &&
        candidate.sourceId === configuration.activeSourceId &&
        candidate.sourceVersion === expectedSourceGeneration &&
        typeof candidate.createdAt === 'string' &&
        Date.parse(candidate.createdAt) >=
          Date.parse(migrationAudit.occurredAt) &&
        typeof candidate.expectedEtag === 'string' &&
        candidate.expectedEtag.trim() !== ''
    );
  if (regeneratedCandidates.length !== expectedCount)
    throw new Error('Regenerated legacy candidate count is incomplete.');
  const pendingByMirror = new Map(
    regeneratedCandidates.map((candidate) => [candidate.mirrorId, candidate])
  );
  const mirrorById = new Map(
    mirrors.docs.map((document) => [document.id, document.data()])
  );
  for (const [mirrorId, candidate] of pendingByMirror) {
    const mirror = mirrorById.get(mirrorId);
    if (
      typeof mirrorId !== 'string' ||
      mirror === undefined ||
      candidate.sourceVersion !== expectedSourceGeneration ||
      mirror.sourceId !== configuration.activeSourceId ||
      mirror.sourceVersion !== expectedSourceGeneration ||
      typeof candidate.expectedEtag !== 'string' ||
      candidate.expectedEtag.trim() === '' ||
      candidate.expectedEtag !== mirror.etag
    )
      throw new Error('Legacy candidate regeneration verification failed.');
  }
  return { regeneratedCount: expectedCount };
}

async function main() {
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
  const expectedCount = Number.parseInt(
    process.env['CALENDAR_PILOT_EXPECTED_LEGACY_CANDIDATES'] ?? '',
    10
  );
  const expectedSourceGeneration = Number.parseInt(
    process.env['CALENDAR_PILOT_EXPECTED_SOURCE_GENERATION'] ?? '',
    10
  );
  const mode = process.env['CALENDAR_PILOT_LEGACY_MIGRATION_MODE'] ?? 'plan';
  if (getApps().length === 0) initializeApp({ projectId });
  const db = getFirestore();

  if (mode === 'plan') {
    const result = await inspectLegacyCalendarCandidates({
      db,
      projectId,
      expectedCount,
      expectedSourceGeneration
    });
    process.stdout.write(
      `Legacy candidate migration preflight passed for ${result.candidateIds.length} synthetic candidates; no changes made.\n`
    );
    return;
  }
  if (mode === 'apply') {
    if (process.env['CALENDAR_PILOT_CONFIRM_LEGACY_MIGRATION'] !== 'YES')
      throw new Error(
        'Legacy candidate migration requires explicit confirmation.'
      );
    const result = await migrateLegacyCalendarCandidates({
      db,
      projectId,
      expectedCount,
      expectedSourceGeneration
    });
    process.stdout.write(
      `Superseded ${result.migratedCount} legacy synthetic candidates and requested a full resync.\n`
    );
    return;
  }
  if (mode === 'verify') {
    const result = await verifyLegacyCalendarCandidateRegeneration({
      db,
      projectId,
      expectedCount,
      expectedSourceGeneration
    });
    process.stdout.write(
      `Verified ${result.regeneratedCount} regenerated candidates with fresh server-side etags.\n`
    );
    return;
  }
  throw new Error('Unknown CAL-PILOT legacy migration mode.');
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
)
  await main();
