import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  resolveApprovedBusinessDeliveryPolicy,
  RETENTION_EXPIRY_REASON_CODE,
  RETENTION_EXPIRY_SYSTEM_ACTOR_REF
} from '@beauessence/domain';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { AutomaticPatientRetentionService } from '../../apps/api/src/business-delivery/automatic-patient-retention.service.js';
import type { BusinessDeliveryConfig } from '../../apps/api/src/business-delivery/business-delivery.config.js';
import {
  FirestoreBusinessRetentionRepository,
  RETENTION_COLLECTIONS
} from '../../apps/api/src/firestore/business-delivery-retention.repository.js';
import { COLLECTIONS } from '../../apps/api/src/firestore/booking.repository.js';
import {
  FirestorePatientDirectory,
  opaqueLookupIdentity,
  PATIENT_COLLECTIONS
} from '../../apps/api/src/patients/patient-directory.js';
import { ConflictError } from '../../apps/api/src/platform/errors/api-error.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const CONFIG = {
  enabled: true,
  scope: 'internal_synthetic',
  policy: POLICY,
  observedSince: '2030-09-01T00:00:00.000Z'
} satisfies BusinessDeliveryConfig;
const NOW = '2030-10-20T00:00:00.000Z';
const OLD_APPOINTMENT_START = '2028-10-20T00:00:00.000Z';
const PATIENT_ID = 'patient_auto_retention_001';
const PATIENT_PREFIX = 'patient_auto_retention_';
const APPOINTMENT_PREFIX = 'appointment_auto_retention_';
const APPOINTMENT_ID = `${APPOINTMENT_PREFIX}001`;
const PHONE = '0900000099';
const BIRTH_MONTH_DAY = '--02-01';
const SYNTHETIC_NAME = '合成保留測試患者';
const LOOKUP_ID = opaqueLookupIdentity(PHONE, BIRTH_MONTH_DAY);
const MANAGER_REF = 'a'.repeat(64);
const APPOINTMENT = {
  patientId: PATIENT_ID,
  status: 'completed',
  startsAt: OLD_APPOINTMENT_START
};

let app: App;
let db: Firestore;
let repository: FirestoreBusinessRetentionRepository;
let directory: FirestorePatientDirectory;

function retentionService(now = NOW): AutomaticPatientRetentionService {
  return new AutomaticPatientRetentionService(
    CONFIG,
    {
      archiveExpiredPatient: repository.archiveExpiredPatient.bind(repository)
    },
    () => now
  );
}

async function cleanupOwnedFixtures(): Promise<void> {
  const [patients, appointments, logs, jobs] = await Promise.all([
    db.collection(PATIENT_COLLECTIONS.patients).get(),
    db.collection(COLLECTIONS.appointments).get(),
    db
      .collection(RETENTION_COLLECTIONS.log)
      .where('patientId', '==', PATIENT_ID)
      .get(),
    db.collection(COLLECTIONS.outboxJobs).get()
  ]);
  const ownedPatients = patients.docs.filter((doc) =>
    doc.id.startsWith(PATIENT_PREFIX)
  );
  const ownedAppointments = appointments.docs.filter(
    (doc) =>
      doc.id.startsWith(APPOINTMENT_PREFIX) ||
      doc.data()['patientId'] === PATIENT_ID
  );
  const ownedJobs = jobs.docs.filter((doc) =>
    String(doc.data()['appointmentId'] ?? '').startsWith(APPOINTMENT_PREFIX)
  );
  await Promise.all([
    ...ownedPatients.map((doc) => doc.ref.delete()),
    ...ownedAppointments.map((doc) => doc.ref.delete()),
    ...logs.docs.map((doc) => doc.ref.delete()),
    ...ownedJobs.map((doc) => doc.ref.delete()),
    db.collection(PATIENT_COLLECTIONS.lookupIndex).doc(LOOKUP_ID).delete()
  ]);
}

async function seedPatient(
  fields: Record<string, unknown> = {}
): Promise<void> {
  await db
    .collection(PATIENT_COLLECTIONS.patients)
    .doc(PATIENT_ID)
    .set({
      patientId: PATIENT_ID,
      name: SYNTHETIC_NAME,
      phoneDigits: PHONE,
      birthMonthDay: BIRTH_MONTH_DAY,
      ...fields
    });
  await db
    .collection(PATIENT_COLLECTIONS.lookupIndex)
    .doc(LOOKUP_ID)
    .set({
      patientIds: [PATIENT_ID],
      createdAt: NOW,
      updatedAt: NOW
    });
}

async function seedAppointment(
  id: string,
  fields: Record<string, unknown> = APPOINTMENT
): Promise<void> {
  await db.collection(COLLECTIONS.appointments).doc(id).set(fields);
}

async function patientState(): Promise<Record<string, unknown> | null> {
  return (
    (
      await db.collection(PATIENT_COLLECTIONS.patients).doc(PATIENT_ID).get()
    ).data() ?? null
  );
}

async function appointmentState(): Promise<Record<string, unknown>[]> {
  const appointments = await db
    .collection(COLLECTIONS.appointments)
    .where('patientId', '==', PATIENT_ID)
    .get();
  return appointments.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((left, right) =>
      String(left['id']).localeCompare(String(right['id']))
    );
}

async function ownLogs(): Promise<Record<string, unknown>[]> {
  const logs = await db
    .collection(RETENTION_COLLECTIONS.log)
    .where('patientId', '==', PATIENT_ID)
    .get();
  return logs.docs.map((doc) => doc.data());
}

async function ownOutboxJobs(): Promise<Record<string, unknown>[]> {
  const jobs = await db.collection(COLLECTIONS.outboxJobs).get();
  return jobs.docs
    .filter((doc) =>
      String(doc.data()['appointmentId'] ?? '').startsWith(APPOINTMENT_PREFIX)
    )
    .map((doc) => doc.data());
}

async function expectConflictWithoutWrites(): Promise<void> {
  const patientBefore = await patientState();
  const appointmentsBefore = await appointmentState();
  await expect(
    retentionService().archiveIfExpired({
      patientId: PATIENT_ID,
      idempotencyKey: `auto-expiry-${appointmentsBefore.length}-${Date.now()}`
    })
  ).rejects.toBeInstanceOf(ConflictError);
  expect(await patientState()).toEqual(patientBefore);
  expect(await appointmentState()).toEqual(appointmentsBefore);
  expect(await ownLogs()).toEqual([]);
  expect(await ownOutboxJobs()).toEqual([]);
}

describe('synthetic automatic patient-retention expiry', () => {
  beforeAll(() => {
    requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
    app = initializeApp(
      { projectId: LOCAL_FIREBASE_PROJECT_ID },
      `patient-retention-expiry-${Date.now()}`
    );
    db = getFirestore(app);
    repository = new FirestoreBusinessRetentionRepository(db);
    directory = new FirestorePatientDirectory(db);
  });

  beforeEach(async () => {
    await cleanupOwnedFixtures();
  });

  afterAll(async () => {
    await cleanupOwnedFixtures();
    await deleteApp(app);
  });

  it('archives through the real service and repository under true same-key concurrency', async () => {
    await seedPatient();
    await seedAppointment(APPOINTMENT_ID);

    const [first, concurrent] = await Promise.all([
      retentionService().archiveIfExpired({
        patientId: PATIENT_ID,
        idempotencyKey: 'auto-expiry-parallel-001'
      }),
      retentionService().archiveIfExpired({
        patientId: PATIENT_ID,
        idempotencyKey: 'auto-expiry-parallel-001'
      })
    ]);
    expect(first).toEqual(concurrent);
    expect(first).toEqual({
      patientId: PATIENT_ID,
      state: 'archived',
      restorableUntil: expect.any(String)
    });

    const patient = await patientState();
    expect(patient).toMatchObject({
      archivedByRef: RETENTION_EXPIRY_SYSTEM_ACTOR_REF,
      archivedAt: NOW
    });
    expect((await appointmentState())[0]).toMatchObject({
      id: APPOINTMENT_ID,
      patientArchived: true
    });

    const logs = await ownLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'archive',
      reasonCode: RETENTION_EXPIRY_REASON_CODE,
      actorRef: RETENTION_EXPIRY_SYSTEM_ACTOR_REF
    });
    expect(Object.keys(logs[0] ?? {}).some((key) => /reauth/i.test(key))).toBe(
      false
    );

    const jobs = await ownOutboxJobs();
    expect(jobs).toHaveLength(1);
    // The automatic archive removes the event; its marker is the archive date.
    expect(jobs[0]).toMatchObject({
      retentionOperation: 'archive',
      retentionArchivedAt: (await patientState())?.['archivedAt']
    });
    const serializedJobs = JSON.stringify(jobs);
    for (const value of [PATIENT_ID, SYNTHETIC_NAME, PHONE, BIRTH_MONTH_DAY]) {
      expect(serializedJobs).not.toContain(value);
    }

    const clinicList = await directory.listClinic(100);
    const lookupReturn = await directory.lookupReturn(
      PHONE,
      BIRTH_MONTH_DAY,
      NOW,
      () => 'session_auto_retention_001'
    );
    expect(lookupReturn).toBeUndefined();
    const serializedList = JSON.stringify(clinicList);
    for (const value of [PATIENT_ID, SYNTHETIC_NAME, PHONE]) {
      expect(serializedList).not.toContain(value);
    }
  });

  it('does not extend an existing archive years later, then permits manager repository restore', async () => {
    await seedPatient();
    await seedAppointment(APPOINTMENT_ID);
    const initial = await retentionService().archiveIfExpired({
      patientId: PATIENT_ID,
      idempotencyKey: 'auto-expiry-replay-original'
    });
    const originalPatient = await patientState();
    const originalLogs = await ownLogs();
    const originalJobs = await ownOutboxJobs();

    const replay = await retentionService(
      '2035-10-20T00:00:00.000Z'
    ).archiveIfExpired({
      patientId: PATIENT_ID,
      idempotencyKey: 'auto-expiry-replay-later-key'
    });
    expect(replay).toEqual(initial);
    expect((await patientState())?.['restorableUntil']).toBe(
      originalPatient?.['restorableUntil']
    );
    expect(await ownLogs()).toEqual(originalLogs);
    expect(await ownOutboxJobs()).toEqual(originalJobs);
    expect(await patientState()).not.toBeNull();
    expect(await appointmentState()).toHaveLength(1);

    const restored = await repository.restore({
      patientId: PATIENT_ID,
      actorRef: MANAGER_REF,
      idempotencyKey: 'manager-restore-after-retention-window',
      now: '2035-10-20T00:00:00.000Z',
      scope: 'internal_synthetic',
      policy: POLICY
    });
    expect(restored).toEqual({ patientId: PATIENT_ID, state: 'active' });
    expect(await patientState()).not.toHaveProperty('archivedAt');
    expect((await patientState())?.['archivedByRef']).toBeUndefined();
    expect((await appointmentState())[0]).not.toHaveProperty('patientArchived');
    expect(await ownLogs()).toHaveLength(2);
    expect(await ownOutboxJobs()).toHaveLength(2);
  });

  it('does not treat a manual operation log as system authority for the same key', async () => {
    await seedPatient();
    await seedAppointment(APPOINTMENT_ID);
    const request = {
      patientId: PATIENT_ID,
      idempotencyKey: 'manual-auto-shared-key-001'
    };
    const manual = await repository.archive({
      ...request,
      actorRef: MANAGER_REF,
      now: NOW,
      scope: 'internal_synthetic',
      policy: POLICY
    });
    await expect(retentionService().archiveIfExpired(request)).resolves.toEqual(
      manual
    );
    const logs = await ownLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'archive', actorRef: MANAGER_REF });
    expect(logs[0]).not.toHaveProperty('reasonCode');
    expect(await ownOutboxJobs()).toHaveLength(1);
  });

  it('rejects an active patient with no appointment history without writes', async () => {
    await seedPatient();
    await expectConflictWithoutWrites();
  });

  it('rejects true and malformed legal holds without writes', async () => {
    for (const hold of [true, 'true']) {
      await cleanupOwnedFixtures();
      await seedPatient({ legalHold: hold });
      await seedAppointment(APPOINTMENT_ID);
      await expectConflictWithoutWrites();
    }
  });

  it('uses the latest appointment date regardless of completed, cancelled, or confirmed status', async () => {
    for (const status of ['completed', 'cancelled', 'confirmed']) {
      await cleanupOwnedFixtures();
      await seedPatient();
      await seedAppointment(APPOINTMENT_ID);
      await seedAppointment(`${APPOINTMENT_PREFIX}latest`, {
        patientId: PATIENT_ID,
        status,
        startsAt: '2029-10-20T00:00:00.000Z'
      });
      await expectConflictWithoutWrites();
    }
  });

  it('rejects a future confirmed appointment without writes', async () => {
    await seedPatient();
    await seedAppointment(APPOINTMENT_ID);
    await seedAppointment(`${APPOINTMENT_PREFIX}future`, {
      patientId: PATIENT_ID,
      status: 'confirmed',
      startsAt: '2031-01-01T00:00:00.000Z'
    });
    await expectConflictWithoutWrites();
  });

  it('rejects malformed, missing, and offset appointment timestamps without writes', async () => {
    for (const startsAt of [
      'not-a-date',
      undefined,
      '2028-10-20T00:00:00-07:00'
    ]) {
      await cleanupOwnedFixtures();
      await seedPatient();
      await seedAppointment(APPOINTMENT_ID);
      await seedAppointment(`${APPOINTMENT_PREFIX}invalid`, {
        patientId: PATIENT_ID,
        status: 'completed',
        ...(startsAt === undefined ? {} : { startsAt })
      });
      await expectConflictWithoutWrites();
    }
  });

  it('re-reads a legal hold written immediately before the real transaction', async () => {
    await seedPatient();
    await seedAppointment(APPOINTMENT_ID);
    const realRunTransaction = db.runTransaction.bind(db);
    const spy = vi.spyOn(db, 'runTransaction');
    spy.mockImplementationOnce(async (updateFunction, options) => {
      await db
        .collection(PATIENT_COLLECTIONS.patients)
        .doc(PATIENT_ID)
        .update({ legalHold: true });
      return realRunTransaction(updateFunction, options);
    });

    try {
      await expect(
        retentionService().archiveIfExpired({
          patientId: PATIENT_ID,
          idempotencyKey: 'auto-expiry-race-hold'
        })
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      spy.mockRestore();
    }

    expect(await patientState()).toMatchObject({ legalHold: true });
    expect(await patientState()).not.toHaveProperty('archivedAt');
    expect((await appointmentState())[0]).not.toHaveProperty('patientArchived');
    expect(await ownLogs()).toEqual([]);
    expect(await ownOutboxJobs()).toEqual([]);
  });

  it('re-reads a later appointment written immediately before the real transaction', async () => {
    await seedPatient();
    await seedAppointment(APPOINTMENT_ID);
    const realRunTransaction = db.runTransaction.bind(db);
    const spy = vi.spyOn(db, 'runTransaction');
    spy.mockImplementationOnce(async (updateFunction, options) => {
      await seedAppointment(`${APPOINTMENT_PREFIX}race-latest`, {
        patientId: PATIENT_ID,
        status: 'completed',
        startsAt: '2029-10-20T00:00:00.000Z'
      });
      return realRunTransaction(updateFunction, options);
    });

    try {
      await expect(
        retentionService().archiveIfExpired({
          patientId: PATIENT_ID,
          idempotencyKey: 'auto-expiry-race-latest'
        })
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      spy.mockRestore();
    }

    expect(await patientState()).not.toHaveProperty('archivedAt');
    expect(await appointmentState()).toHaveLength(2);
    expect((await appointmentState())[0]).not.toHaveProperty('patientArchived');
    expect((await appointmentState())[1]).not.toHaveProperty('patientArchived');
    expect(await ownLogs()).toEqual([]);
    expect(await ownOutboxJobs()).toEqual([]);
  });

  it('does not recreate a missing patient and rejects a production-scope repository call', async () => {
    await expect(
      retentionService().archiveIfExpired({
        patientId: PATIENT_ID,
        idempotencyKey: 'auto-expiry-missing-patient'
      })
    ).rejects.toThrow();
    expect(await patientState()).toBeNull();

    await expect(
      repository.archiveExpiredPatient({
        patientId: PATIENT_ID,
        idempotencyKey: 'auto-expiry-production-scope',
        now: NOW,
        scope: 'production' as never,
        policy: POLICY
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await patientState()).toBeNull();
    expect(await ownLogs()).toEqual([]);
    expect(await ownOutboxJobs()).toEqual([]);
  });
});
