import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
if (projectId !== 'beauessence-clinic-staging')
  throw new Error('Refusing to inspect outside beauessence-clinic-staging.');
if (getApps().length === 0) initializeApp({ projectId });
await getFirestore()
  .collection('calendar_pilot_outbox')
  .where('status', '==', 'processing')
  .where('leaseExpiresAt', '<=', new Date().toISOString())
  .orderBy('leaseExpiresAt', 'asc')
  .limit(1)
  .get();
process.stdout.write('CAL-PILOT expired-processing recovery index is ready.\n');
