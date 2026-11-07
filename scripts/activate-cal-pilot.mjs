import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { validateActivationWindow } from './cal-pilot-extension-policy.mjs';

const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
if (projectId !== 'beauessence-clinic-staging')
  throw new Error('Refusing to activate outside beauessence-clinic-staging.');
if (getApps().length === 0) initializeApp({ projectId });
const db = getFirestore();
const now = new Date().toISOString();
await db.runTransaction(async (transaction) => {
  const configRef = db.collection('calendar_pilot_configuration').doc('active');
  const config = await transaction.get(configRef);
  validateActivationWindow({
    configurationExists: config.exists,
    expiresAt: config.data()?.expiresAt,
    now
  });
  transaction.update(configRef, {
    inboundEnabled: true,
    outboundEnabled: true,
    health: 'idle',
    activatedAt: now
  });
  transaction.create(db.collection('calendar_pilot_audit_events').doc(), {
    action: 'calendar_pilot_activated',
    actorId: 'deployment_operator',
    occurredAt: now
  });
});
process.stdout.write('CAL-PILOT inbound and outbound switches enabled.\n');
