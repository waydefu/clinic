import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FirestorePatientDirectory,
  PATIENT_COLLECTIONS,
  opaqueLookupIdentity
} from '../../apps/api/src/patients/patient-directory.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const NOW = '2026-09-28T04:00:00.000Z';

let app: App;
let db: Firestore;
let sequence = 0;
const nextId = (prefix: string) => () => {
  sequence += 1;
  return `${prefix}_${sequence}`;
};

const intake = (phone: string, name: string) => ({
  name,
  phone,
  birthDate: '--02-29',
  nationality: 'domestic' as const,
  privacyConsent: true as const
});

async function indexIds(phone: string): Promise<string[]> {
  const snapshot = await db
    .collection(PATIENT_COLLECTIONS.lookupIndex)
    .doc(opaqueLookupIdentity(phone, '--02-29'))
    .get();
  const value: unknown = snapshot.data()?.['patientIds'];
  return Array.isArray(value) ? (value as string[]) : [];
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    'patient-lookup-v2'
  );
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

describe('patient lookup v2 on the Firestore emulator', () => {
  it('lets concurrent creates for the same person converge on one patient', async () => {
    const directory = new FirestorePatientDirectory(db);
    const phone = '0900000101';
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        directory.resolveFromIntake(
          intake(phone, '合成患者丙'),
          NOW,
          nextId('patient_v2_same')
        )
      )
    );
    expect(new Set(results).size).toBe(1);
    expect(await indexIds(phone)).toEqual([results[0]]);
  });

  it('lets exactly one of two different people on the same key through', async () => {
    const directory = new FirestorePatientDirectory(db);
    const phone = '0900000102';
    const settled = await Promise.allSettled([
      directory.resolveFromIntake(
        intake(phone, '合成患者丙'),
        NOW,
        nextId('patient_v2_race')
      ),
      directory.resolveFromIntake(
        intake(phone, '合成患者丁'),
        NOW,
        nextId('patient_v2_race')
      )
    ]);
    const fulfilled = settled.filter((item) => item.status === 'fulfilled');
    const rejected = settled.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'PATIENT_IDENTITY_AMBIGUOUS'
    });
    expect(await indexIds(phone)).toHaveLength(1);
  });

  it('never reads or rewrites the legacy v1 index', async () => {
    const legacyRef = db
      .collection(PATIENT_COLLECTIONS.legacyLookupIndex)
      .doc('rlk_legacy_fixture_0001');
    await legacyRef.set({ patientId: 'patient_legacy_0001', createdAt: NOW });
    const directory = new FirestorePatientDirectory(db);
    await directory.resolveFromIntake(
      intake('0900000103', '合成患者戊'),
      NOW,
      nextId('patient_v2_legacy')
    );
    expect((await legacyRef.get()).data()).toEqual({
      patientId: 'patient_legacy_0001',
      createdAt: NOW
    });
    await legacyRef.delete();
  });
});

describe('patient contact storage on the Firestore emulator', () => {
  it('stores phone digits and month-day with the new patient', async () => {
    const directory = new FirestorePatientDirectory(db);
    const id = await directory.resolveFromIntake(
      intake('0900-000-201', '合成患者丁'),
      NOW,
      nextId('patient_contact_new')
    );
    const data = (
      await db.collection(PATIENT_COLLECTIONS.patients).doc(id).get()
    ).data();
    expect(data).toMatchObject({
      name: '合成患者丁',
      phoneDigits: '0900000201',
      birthMonthDay: '--02-29'
    });
  });

  it('fills a pre-existing record once on reuse and never overwrites', async () => {
    const directory = new FirestorePatientDirectory(db);
    const phone = '0900000202';
    await db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(opaqueLookupIdentity(phone, '--02-29'))
      .set({ patientIds: ['patient_contact_legacy'] });
    await db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc('patient_contact_legacy')
      .set({ patientId: 'patient_contact_legacy', name: '合成患者戊' });

    await directory.resolveFromIntake(
      intake(phone, '合成患者戊'),
      NOW,
      nextId('unused')
    );
    const ref = db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc('patient_contact_legacy');
    expect((await ref.get()).data()).toMatchObject({
      phoneDigits: '0900000202',
      birthMonthDay: '--02-29'
    });

    await ref.update({ phoneDigits: '0900000999' });
    await directory.resolveFromIntake(
      intake(phone, '合成患者戊'),
      NOW,
      nextId('unused')
    );
    expect((await ref.get()).data()?.['phoneDigits']).toBe('0900000999');
  });
});
