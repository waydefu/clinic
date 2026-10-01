import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  RECOVERY_COLLECTIONS,
  parseRecoveryArgs,
  runRecoveryCloneVerifier,
  validateRecoveryTarget,
  verifyRecoveryClone
} from './recovery-clone-verify.mjs';

const PROJECT = 'beauessence-clinic-stg-a';
const DATABASE = 'recovery-verify-test';
const EMULATOR_DATABASE = `recovery-verify-${Date.now()}`;

function makeManifest() {
  return {
    schemaVersion: 1,
    expectedCounts: {
      appointments: 10,
      patients: 1,
      slots: 0,
      patient_lookup_index_v2: 0,
      audit_events: 2,
      outbox_jobs: 0
    },
    sampleAppointments: Array.from({ length: 10 }, (_, index) => ({
      id: `synthetic_appointment_${String(index + 1).padStart(2, '0')}`,
      fields: {
        bookingKind: 'initial',
        syntheticFixture: `fixture-${index + 1}`
      }
    })),
    expectedAuditEvents: [
      { id: 'synthetic_audit_01', occurredAt: '2030-01-01T00:00:00.000Z' },
      { id: 'synthetic_audit_02', occurredAt: '2030-01-01T00:01:00.000Z' }
    ]
  };
}

function fakeSnapshot(id, data) {
  return {
    id,
    exists: data !== undefined,
    data: () => data
  };
}

function fakeDb({
  omitAppointmentField = false,
  omitAppointmentId,
  omitAuditId,
  terseAuditTime = false
} = {}) {
  const documents = new Map(
    RECOVERY_COLLECTIONS.map((collection) => [collection, new Map()])
  );
  for (const [
    index,
    appointment
  ] of makeManifest().sampleAppointments.entries()) {
    if (appointment.id === omitAppointmentId) continue;
    const data = { ...appointment.fields };
    if (omitAppointmentField && index === 0) delete data.syntheticFixture;
    documents.get('appointments').set(appointment.id, data);
  }
  documents.get('patients').set('synthetic_patient_01', { fixture: true });
  for (const event of makeManifest().expectedAuditEvents) {
    if (event.id !== omitAuditId)
      documents.get('audit_events').set(event.id, {
        occurredAt: terseAuditTime
          ? event.occurredAt.replace('.000Z', 'Z')
          : new Date(event.occurredAt)
      });
  }

  return {
    collection(name) {
      const collection = documents.get(name);
      return {
        select(...selectedFields) {
          return {
            async get() {
              const docs = [...collection.entries()].map(([id, data]) => ({
                id,
                data: () =>
                  Object.fromEntries(
                    selectedFields
                      .filter((field) => field !== '__name__')
                      .filter((field) => Object.hasOwn(data, field))
                      .map((field) => [field, data[field]])
                  )
              }));
              return { size: docs.length, docs };
            }
          };
        },
        doc(id) {
          return { id, collection: name };
        }
      };
    },
    async getAll(reference, options) {
      const collection = documents.get(reference.collection);
      const data = collection.get(reference.id);
      const selected =
        data === undefined
          ? undefined
          : Object.fromEntries(
              options.fieldMask
                .filter((field) => Object.hasOwn(data, field))
                .map((field) => [field, data[field]])
            );
      return [fakeSnapshot(reference.id, selected)];
    }
  };
}

describe('recovery clone verifier target guard', () => {
  it('requires an isolated C1 project and a valid named database', () => {
    expect(() =>
      validateRecoveryTarget({
        project: 'beauessence-clinic-staging',
        database: DATABASE
      })
    ).toThrow();
    expect(() =>
      validateRecoveryTarget({ project: PROJECT, database: '(default)' })
    ).toThrow();
    expect(() =>
      validateRecoveryTarget({ project: PROJECT, database: 'Bad_Name' })
    ).toThrow();
    expect(
      parseRecoveryArgs([
        '--project',
        PROJECT,
        '--database',
        DATABASE,
        '--manifest',
        'expected.json'
      ])
    ).toEqual({
      project: PROJECT,
      database: DATABASE,
      manifestPath: 'expected.json'
    });
  });

  it('rejects unsafe CLI targets before reading a manifest or connecting', async () => {
    let read = false;
    let connect = false;
    await expect(
      runRecoveryCloneVerifier({
        argv: [
          '--project',
          'beauessence-clinic-staging',
          '--database',
          DATABASE,
          '--manifest',
          'expected.json'
        ],
        readManifestFile: () => {
          read = true;
          return Promise.resolve('{}');
        },
        createDb: () => {
          connect = true;
          return fakeDb();
        }
      })
    ).rejects.toThrow();
    expect(read).toBe(false);
    expect(connect).toBe(false);
  });

  it('passes the validated project and named database to the Firestore factory', async () => {
    const db = fakeDb();
    const app = { delete: vi.fn(() => Promise.resolve()) };
    const createDb = vi.fn(() => Promise.resolve({ db, app }));
    const report = await runRecoveryCloneVerifier({
      argv: [
        '--project',
        PROJECT,
        '--database',
        DATABASE,
        '--manifest',
        'expected.json'
      ],
      createDb,
      readManifestFile: () => Promise.resolve(JSON.stringify(makeManifest()))
    });

    expect(createDb).toHaveBeenCalledExactlyOnceWith(PROJECT, DATABASE);
    expect(app.delete).toHaveBeenCalledOnce();
    expect(report.overall).toBe('PASS');
    expect(report).not.toHaveProperty('project');
    expect(report).not.toHaveProperty('database');
  });

  it('uses the installed Firestore SDK getAll fieldMask API, not DocumentReference.select', async () => {
    const [{ initializeApp }, { getFirestore }] = await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/firestore')
    ]);
    const app = initializeApp(
      { projectId: PROJECT },
      `recovery-sdk-shape-${Date.now()}`
    );
    const db = getFirestore(app, DATABASE);
    const reference = db.collection('appointments').doc('synthetic-check');
    expect(typeof db.getAll).toBe('function');
    expect(typeof reference.select).toBe('undefined');
    await app.delete();
  });
});

describe('recovery clone verification report', () => {
  it('passes counts, ten manifest-selected appointment rows, and the expected audit list', async () => {
    const report = await verifyRecoveryClone({
      project: PROJECT,
      database: DATABASE,
      manifest: makeManifest(),
      db: fakeDb()
    });
    expect(report.overall).toBe('PASS');
    expect(report.checks.V1.status).toBe('PASS');
    expect(report.checks.V2).toMatchObject({
      status: 'PASS',
      expected: 10,
      matched: 10
    });
    expect(report.checks.V3).toMatchObject({
      status: 'PASS',
      expected: 2,
      actual: 2,
      matchesExpectedList: true
    });
  });

  it('compares equivalent UTC audit timestamp strings as the same instant', async () => {
    const report = await verifyRecoveryClone({
      project: PROJECT,
      database: DATABASE,
      manifest: makeManifest(),
      db: fakeDb({ terseAuditTime: true })
    });
    expect(report.checks.V3.status).toBe('PASS');
  });

  it('fails count, row-field, and missing-audit receipt comparisons without exposing values', async () => {
    const manifest = makeManifest();
    manifest.expectedCounts.patients = 2;
    const db = fakeDb({
      omitAppointmentField: true,
      omitAuditId: 'synthetic_audit_02'
    });
    const getAllSpy = vi.spyOn(db, 'getAll');
    const report = await verifyRecoveryClone({
      project: PROJECT,
      database: DATABASE,
      manifest,
      db
    });
    expect(report.overall).toBe('FAIL');
    expect(report.checks.V1.status).toBe('FAIL');
    expect(report.checks.V2.status).toBe('FAIL');
    expect(report.checks.V2.mismatches[0]).toEqual({
      fields: ['syntheticFixture']
    });
    expect(getAllSpy).toHaveBeenCalledTimes(10);
    expect(getAllSpy).toHaveBeenCalledWith(
      { id: 'synthetic_appointment_01', collection: 'appointments' },
      { fieldMask: ['bookingKind', 'syntheticFixture'] }
    );
    expect(report.checks.V3).toMatchObject({
      status: 'FAIL',
      expected: 2,
      actual: 1,
      matchesExpectedList: false
    });
    expect(JSON.stringify(report)).not.toContain('fixture-');
  });

  it('fails V2 when a manifest appointment document is absent', async () => {
    const report = await verifyRecoveryClone({
      project: PROJECT,
      database: DATABASE,
      manifest: makeManifest(),
      db: fakeDb({ omitAppointmentId: 'synthetic_appointment_01' })
    });
    expect(report.checks.V2).toMatchObject({
      status: 'FAIL',
      expected: 10,
      matched: 9,
      mismatches: [{ fields: ['bookingKind', 'syntheticFixture'] }]
    });
  });

  it('requires exactly ten unique sample appointments and six count entries', async () => {
    const manifest = makeManifest();
    manifest.sampleAppointments.pop();
    await expect(
      verifyRecoveryClone({
        project: PROJECT,
        database: DATABASE,
        manifest,
        db: fakeDb()
      })
    ).rejects.toThrow('exactly 10');
  });
});

function emulatorHostIsLoopback(value) {
  if (!value) return false;
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

const emulatorAvailable = emulatorHostIsLoopback(
  process.env['FIRESTORE_EMULATOR_HOST']
);
let emulatorApp;
let emulatorDb;

async function clearEmulatorDatabase() {
  for (const collection of RECOVERY_COLLECTIONS) {
    const documents = await emulatorDb.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

beforeAll(async () => {
  if (!emulatorAvailable) return;
  const [{ initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore')
  ]);
  emulatorApp = initializeApp(
    { projectId: PROJECT },
    `recovery-verifier-test-${Date.now()}`
  );
  emulatorDb = getFirestore(emulatorApp, EMULATOR_DATABASE);
  await clearEmulatorDatabase();
});

afterAll(async () => {
  if (!emulatorDb) return;
  await clearEmulatorDatabase();
  await emulatorApp.delete();
});

describe.skipIf(!emulatorAvailable)(
  'named database emulator integration',
  () => {
    it('uses the named database and returns one PASS and one FAIL report', async () => {
      const manifest = makeManifest();
      for (const collection of RECOVERY_COLLECTIONS) {
        const count = manifest.expectedCounts[collection];
        for (let index = 0; index < count; index += 1) {
          if (collection === 'appointments') {
            const sample = manifest.sampleAppointments[index];
            await emulatorDb
              .collection(collection)
              .doc(sample.id)
              .set(sample.fields);
          } else if (collection === 'audit_events') {
            const sample = manifest.expectedAuditEvents[index];
            await emulatorDb
              .collection(collection)
              .doc(sample.id)
              .set({ occurredAt: sample.occurredAt });
          } else {
            await emulatorDb
              .collection(collection)
              .doc(`synthetic_${collection}_${index + 1}`)
              .set({ fixture: true });
          }
        }
      }

      const pass = await runRecoveryCloneVerifier({
        argv: [
          '--project',
          PROJECT,
          '--database',
          EMULATOR_DATABASE,
          '--manifest',
          'synthetic-manifest.json'
        ],
        readManifestFile: () => Promise.resolve(JSON.stringify(manifest))
      });
      const failManifest = {
        ...manifest,
        expectedCounts: { ...manifest.expectedCounts, patients: 2 }
      };
      const fail = await runRecoveryCloneVerifier({
        argv: [
          '--project',
          PROJECT,
          '--database',
          EMULATOR_DATABASE,
          '--manifest',
          'synthetic-failing-manifest.json'
        ],
        readManifestFile: () => Promise.resolve(JSON.stringify(failManifest))
      });
      expect(pass.overall).toBe('PASS');
      expect(fail.overall).toBe('FAIL');
    });
  }
);
