import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreCalendarTitleSource } from '../../apps/worker/src/calendar-title-source.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const projectId = LOCAL_FIREBASE_PROJECT_ID;
const APPOINTMENTS = 'appointments';
const PATIENTS = 'patients';

let app: App;
let db: Firestore;
let source: FirestoreCalendarTitleSource;

async function wipe(): Promise<void> {
  for (const collection of [APPOINTMENTS, PATIENTS]) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

beforeAll(() => {
  app = initializeApp({ projectId }, `calendar-title-${Date.now()}`);
  db = getFirestore(app);
  source = new FirestoreCalendarTitleSource(db);
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

beforeEach(wipe);

describe('FirestoreCalendarTitleSource', () => {
  it('reads and formats only the approved appointment title fields', async () => {
    await db
      .collection(APPOINTMENTS)
      .doc('calendar_title_appointment_001')
      .set({
        patientId: 'calendar_title_patient_001',
        bookingKind: 'initial',
        itemId: 'service_snoring',
        patientNote: '流程詢問\n時段確認'
      });
    await db.collection(PATIENTS).doc('calendar_title_patient_001').set({
      name: '合成患者甲',
      phoneDigits: '99999999',
      birthMonthDay: '--05-20',
      archivedAt: null
    });

    await expect(
      source.titleFor('calendar_title_appointment_001')
    ).resolves.toBe('止鼾初診/合成患者甲99999999 0520/流程詢問 時段確認');
    await expect(
      source.titleFor('calendar_title_appointment_001', 'follow_up')
    ).resolves.toBe('止鼾回診/合成患者甲99999999 0520/流程詢問 時段確認');
  });

  it('omits archived or missing patient records and missing appointments', async () => {
    await db
      .collection(APPOINTMENTS)
      .doc('calendar_title_appointment_001')
      .set({
        patientId: 'calendar_title_patient_001',
        bookingKind: 'initial',
        itemId: 'service_snoring'
      });
    await db.collection(PATIENTS).doc('calendar_title_patient_001').set({
      name: '合成患者甲',
      phoneDigits: '99999999',
      birthMonthDay: '--05-20',
      archivedAt: '2030-01-01T00:00:00.000Z'
    });

    await expect(
      source.titleFor('calendar_title_appointment_001')
    ).resolves.toBeUndefined();
    await db.collection(PATIENTS).doc('calendar_title_patient_001').delete();
    await expect(
      source.titleFor('calendar_title_appointment_001')
    ).resolves.toBeUndefined();
    await expect(
      source.titleFor('calendar_title_missing_001')
    ).resolves.toBeUndefined();
  });
});
