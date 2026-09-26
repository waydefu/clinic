import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '../../apps/api/src/firestore/booking.repository.js';
import { FirestorePatientDirectory } from '../../apps/api/src/patients/patient-directory.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const PATIENT = 'patient_follow_state_001';
const FOLLOW_UP = 'appointment_follow_state_001';

let app: App;
let db: Firestore;

async function seed(status: string): Promise<void> {
  await db.collection(COLLECTIONS.appointments).doc(FOLLOW_UP).set({
    slotId: 'slot_20300102_1215',
    startsAt: '2030-01-02T04:15:00.000Z',
    patientId: PATIENT,
    bookingKind: 'follow_up',
    status
  });
  await db.collection(COLLECTIONS.followUpState).doc(PATIENT).set({
    required: true,
    sourceAppointmentId: 'appointment_source_001',
    activeFollowUpAppointmentId: FOLLOW_UP
  });
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    'patient-follow-up-state'
  );
  db = getFirestore(app);
});

beforeEach(async () => {
  await db.collection(COLLECTIONS.appointments).doc(FOLLOW_UP).delete();
  await db.collection(COLLECTIONS.followUpState).doc(PATIENT).delete();
});

afterAll(async () => {
  await db.collection(COLLECTIONS.appointments).doc(FOLLOW_UP).delete();
  await db.collection(COLLECTIONS.followUpState).doc(PATIENT).delete();
  await deleteApp(app);
});

describe('FirestorePatientDirectory follow-up state', () => {
  it.each(['cancelled', 'no_show'])(
    'drops a stale active pointer to a %s follow-up',
    async (status) => {
      await seed(status);

      const state = await new FirestorePatientDirectory(db).readFollowUpState(
        PATIENT
      );

      expect(state).toEqual({
        required: true,
        sourceAppointmentId: 'appointment_source_001'
      });
    }
  );

  it('keeps the pointer while the follow-up is still confirmed', async () => {
    await seed('confirmed');

    const state = await new FirestorePatientDirectory(db).readFollowUpState(
      PATIENT
    );

    expect(state?.activeFollowUpAppointmentId).toBe(FOLLOW_UP);
  });
});
