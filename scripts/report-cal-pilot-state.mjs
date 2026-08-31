import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';

const APPROVED_PROJECT = 'beauessence-clinic-staging';

async function countByField(collection, field) {
  const snapshot = await collection.get();
  const counts = {};
  for (const document of snapshot.docs) {
    const value = document.data()[field];
    const key = typeof value === 'string' ? value : 'missing';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export async function reportCalendarPilotState({ db, projectId }) {
  if (projectId !== APPROVED_PROJECT)
    throw new Error('Refusing to inspect outside beauessence-clinic-staging.');
  const [configurationDocument, enabledSources, candidateStatus, jobStatus] =
    await Promise.all([
      db.collection('calendar_pilot_configuration').doc('active').get(),
      db
        .collection('calendar_pilot_sources')
        .where('enabled', '==', true)
        .get(),
      countByField(db.collection('calendar_pilot_candidates'), 'status'),
      countByField(db.collection('calendar_pilot_outbox'), 'status')
    ]);
  if (!configurationDocument.exists)
    throw new Error('CAL-PILOT configuration is missing.');
  const configuration = configurationDocument.data();
  const pendingCandidates = await db
    .collection('calendar_pilot_candidates')
    .where('status', '==', 'pending')
    .get();
  const legacyCandidateCount = pendingCandidates.docs.filter((document) => {
    const candidate = document.data();
    return (
      candidate.kind === 'invalid_format' &&
      (typeof candidate.expectedEtag !== 'string' ||
        candidate.expectedEtag.trim() === '')
    );
  }).length;
  return {
    expiresAt: configuration.expiresAt,
    generation: configuration.version,
    health: configuration.health,
    inboundEnabled: configuration.inboundEnabled,
    outboundEnabled: configuration.outboundEnabled,
    enabledSourceCount: enabledSources.size,
    activeSourceIsEnabled: enabledSources.docs.some(
      (document) => document.id === configuration.activeSourceId
    ),
    candidateStatus,
    legacyCandidateCount,
    jobStatus
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
  if (getApps().length === 0) initializeApp({ projectId });
  const report = await reportCalendarPilotState({
    db: getFirestore(),
    projectId
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
