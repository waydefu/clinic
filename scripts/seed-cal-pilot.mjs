import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
const expiresAt = process.env['CALENDAR_PILOT_EXPIRES_AT'];
if (projectId !== 'beauessence-clinic-staging')
  throw new Error('Refusing to seed outside beauessence-clinic-staging.');
if (
  expiresAt === undefined ||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(expiresAt)
)
  throw new Error('CALENDAR_PILOT_EXPIRES_AT must be an exact UTC timestamp.');

if (getApps().length === 0) initializeApp({ projectId });
const db = getFirestore();
const batch = db.batch();
const now = new Date().toISOString();

batch.set(db.collection('calendar_pilot_configuration').doc('active'), {
  activeSourceId: 'calendar_source_primary',
  previousSourceId: null,
  version: 1,
  expiresAt,
  health: 'idle',
  lastSuccessfulSyncAt: null,
  nextScheduledSyncAt: null,
  inboundEnabled: false,
  outboundEnabled: false,
  workerLeaseOwner: null,
  workerLeaseExpiresAt: null,
  createdAt: now
});

for (const source of [
  ['calendar_source_primary', 'CAL-PILOT 假來源'],
  ['calendar_source_secondary', 'CAL-PILOT 測試目的地']
]) {
  batch.set(db.collection('calendar_pilot_sources').doc(source[0]), {
    displayName: source[1],
    enabled: true,
    state: 'standby',
    syncToken: null,
    lastSyncedAt: null,
    lastErrorCode: null
  });
}

for (let number = 1; number <= 30; number += 1) {
  const patientCode = `A${String(number).padStart(2, '0')}`;
  batch.set(db.collection('calendar_pilot_patients').doc(patientCode), {
    enabled: true,
    synthetic: true
  });
}

await batch.commit();
process.stdout.write(
  'Seeded synthetic CAL-PILOT configuration (no patient identity data).\n'
);
