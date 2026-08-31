import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
if (projectId !== 'beauessence-clinic-staging')
  throw new Error('Refusing to disable outside beauessence-clinic-staging.');
if (getApps().length === 0) initializeApp({ projectId });
const db = getFirestore();
const now = new Date().toISOString();
await db.runTransaction(async (transaction) => {
  const configRef = db.collection('calendar_pilot_configuration').doc('active');
  const config = await transaction.get(configRef);
  if (!config.exists) throw new Error('CAL-PILOT configuration is missing.');
  transaction.update(configRef, {
    inboundEnabled: false,
    outboundEnabled: false,
    health: 'degraded',
    disabledAt: now
  });
  transaction.create(db.collection('calendar_pilot_audit_events').doc(), {
    action: 'calendar_pilot_disabled',
    actorId: 'deployment_operator',
    occurredAt: now
  });
});
process.stdout.write('CAL-PILOT inbound and outbound switches disabled.\n');
