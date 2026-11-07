import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  DomainError,
  resolveApprovedBusinessDeliveryPolicy
} from '@beauessence/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  FirestoreBusinessRetentionRepository,
  RETENTION_COLLECTIONS,
  type ArchivePatientCommand,
  type PermanentlyDeletePatientCommand,
  type RestorePatientCommand,
  type SetPatientLegalHoldCommand
} from '../../apps/api/src/firestore/business-delivery-retention.repository.js';
import {
  EXPORT_COLLECTIONS,
  FirestoreBusinessExportRepository
} from '../../apps/api/src/firestore/business-delivery-export.repository.js';
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
const NOW = '2030-10-20T00:00:00.000Z';
const ARCHIVE_NOW = '2030-10-01T00:00:00.000Z';
const RESTORABLE_UNTIL = '2030-10-31T00:00:00.000Z';
const PATIENT_ID = 'patient_ret_1';
const ACTOR_REF = 'a'.repeat(64);
const AUDIT_ID = 'audit_retention_keep';
const INDEX_ID = opaqueLookupIdentity('0900000001', '--05-20');

let app: App;
let db: Firestore;
let repository: FirestoreBusinessRetentionRepository;
let exportRepository: FirestoreBusinessExportRepository;

function baseCommand(overrides: Partial<ArchivePatientCommand> = {}) {
  return {
    idempotencyKey: 'retention-key-000001',
    patientId: PATIENT_ID,
    actorRef: ACTOR_REF,
    now: NOW,
    scope: 'internal_synthetic' as const,
    policy: POLICY,
    ...overrides
  };
}

async function wipe(): Promise<void> {
  for (const collection of [
    PATIENT_COLLECTIONS.patients,
    PATIENT_COLLECTIONS.lookupIndex,
    PATIENT_COLLECTIONS.returnSessions,
    PATIENT_COLLECTIONS.followUpState,
    COLLECTIONS.appointments,
    COLLECTIONS.patientBookingGuards,
    COLLECTIONS.followUps,
    RETENTION_COLLECTIONS.log,
    ...Object.values(EXPORT_COLLECTIONS)
  ]) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
  await db.collection(COLLECTIONS.auditEvents).doc(AUDIT_ID).delete();
  // outbox_jobs is shared with other emulator files: remove only retention jobs.
  const retentionJobs = (
    await db.collection(COLLECTIONS.outboxJobs).get()
  ).docs.filter((document) =>
    /_ret_(archive|restore|delete)_/.test(document.id)
  );
  await Promise.all(retentionJobs.map((document) => document.ref.delete()));
}

async function retentionJobs(): Promise<Record<string, unknown>[]> {
  const snapshot = await db.collection(COLLECTIONS.outboxJobs).get();
  return snapshot.docs
    .filter((document) => /_ret_(archive|restore|delete)_/.test(document.id))
    .map((document) => document.data())
    .sort((left, right) =>
      String(left['idempotencyKey']).localeCompare(
        String(right['idempotencyKey'])
      )
    );
}

async function seedTitledHistory(archived: boolean): Promise<void> {
  await db
    .collection(COLLECTIONS.appointments)
    .doc('appointment_ret_titled')
    .set({
      patientId: PATIENT_ID,
      status: 'completed',
      startsAt: '2030-09-02T02:00:00.000Z',
      ...(archived ? { patientArchived: true } : {})
    });
  await db.collection(COLLECTIONS.followUps).doc('appointment_ret_titled').set({
    schemaVersion: 1,
    appointmentId: 'appointment_ret_titled',
    patientId: PATIENT_ID,
    decision: 'required',
    dueAt: '2030-11-02T02:00:00.000Z',
    decidedAt: '2030-09-02T03:00:00.000Z'
  });
}

function expectNoPatientFields(jobs: readonly Record<string, unknown>[]): void {
  const serialized = JSON.stringify(jobs);
  for (const value of ['合成患者甲', '0900000001', '05-20']) {
    expect(serialized).not.toContain(value);
  }
}

async function seedPatient(
  input: {
    readonly archived?: boolean;
    readonly legalHold?: boolean;
    readonly withIndex?: boolean;
  } = {}
): Promise<void> {
  await db
    .collection(PATIENT_COLLECTIONS.patients)
    .doc(PATIENT_ID)
    .set({
      patientId: PATIENT_ID,
      name: '合成患者甲',
      phoneDigits: '0900000001',
      birthMonthDay: '--05-20',
      ...(input.archived
        ? {
            archivedAt: ARCHIVE_NOW,
            archivedByRef: ACTOR_REF,
            restorableUntil: RESTORABLE_UNTIL
          }
        : {}),
      ...(input.legalHold ? { legalHold: true } : {})
    });
  if (input.withIndex !== false) {
    await db
      .collection(PATIENT_COLLECTIONS.lookupIndex)
      .doc(INDEX_ID)
      .set({
        patientIds: [PATIENT_ID],
        createdAt: ARCHIVE_NOW,
        updatedAt: ARCHIVE_NOW
      });
  }
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `business-retention-${Date.now()}`
  );
  db = getFirestore(app);
  repository = new FirestoreBusinessRetentionRepository(db);
  exportRepository = new FirestoreBusinessExportRepository(db);
});

afterAll(async () => {
  // Emulator test files share a database; leave no synthetic patient data behind.
  await wipe();
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
});

describe('calendar projection on retention', () => {
  it('removes the visit event and the reminder from the calendar on archive', async () => {
    await seedPatient();
    await seedTitledHistory(false);

    await repository.archive(baseCommand({ now: ARCHIVE_NOW }));

    const jobs = await retentionJobs();
    expect(
      jobs.map((job) => [
        job['appointmentId'],
        job['appointmentStatus'],
        job['followUpSourceId'] ?? null,
        job['startsAt'] ?? null
      ])
    ).toEqual(
      expect.arrayContaining([
        ['appointment_ret_titled', 'completed', null, null],
        [
          'appointment_ret_titled',
          'follow_up_not_required',
          'appointment_ret_titled',
          null
        ]
      ])
    );
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      // The archive episode marker is the very value stored on the patient.
      expect(job).toMatchObject({
        status: 'pending',
        attempts: 0,
        retentionOperation: 'archive',
        retentionArchivedAt: ARCHIVE_NOW
      });
    }
    expect(
      (
        await db.collection(PATIENT_COLLECTIONS.patients).doc(PATIENT_ID).get()
      ).get('archivedAt')
    ).toBe(ARCHIVE_NOW);
    expectNoPatientFields(jobs);
  });

  it('re-adds only the reminder this return still needs on restore, not the old visit', async () => {
    await seedPatient({ archived: true });
    await seedTitledHistory(true);

    await repository.restore(baseCommand({ now: '2030-10-10T00:00:00.000Z' }));

    const jobs = await retentionJobs();
    expect(
      jobs.map((job) => [job['appointmentStatus'], job['startsAt'] ?? null])
    ).toEqual([['follow_up_required', '2030-11-02T02:00:00.000Z']]);
    expect(jobs[0]).toMatchObject({ retentionOperation: 'restore' });
    expectNoPatientFields(jobs);
  });

  it('re-adds an open future booking on restore and skips past or closed ones', async () => {
    await seedPatient({ archived: true });
    await seedTitledHistory(true);
    for (const [id, status, startsAt] of [
      ['appointment_ret_open', 'confirmed', '2030-12-01T02:00:00.000Z'],
      ['appointment_ret_closed', 'cancelled', '2030-12-02T02:00:00.000Z'],
      ['appointment_ret_past', 'confirmed', '2030-10-09T02:00:00.000Z']
    ] as const) {
      await db.collection(COLLECTIONS.appointments).doc(id).set({
        patientId: PATIENT_ID,
        patientArchived: true,
        status,
        startsAt
      });
    }

    await repository.restore(baseCommand({ now: '2030-10-10T00:00:00.000Z' }));

    const jobs = await retentionJobs();
    expect(jobs.map((job) => job['appointmentId']).sort()).toEqual([
      'appointment_ret_open',
      'appointment_ret_titled'
    ]);
  });

  it('deletes every calendar event the patient owned on permanent delete', async () => {
    await seedPatient({ archived: true });
    await seedTitledHistory(true);

    await repository.permanentlyDelete({
      ...baseCommand(),
      idempotencyKey: 'delete-key-calendar-01',
      now: '2030-10-31T00:00:00.000Z',
      reasonCode: 'patient_request'
    });

    const jobs = await retentionJobs();
    expect(
      jobs.map((job) => [job['appointmentStatus'], job['startsAt'] ?? null])
    ).toEqual(
      expect.arrayContaining([
        ['deleted', null],
        ['follow_up_not_required', null]
      ])
    );
    expect(jobs).toHaveLength(2);
    expectNoPatientFields(jobs);
    expect(
      (
        await db
          .collection(COLLECTIONS.appointments)
          .doc('appointment_ret_titled')
          .get()
      ).exists
    ).toBe(false);
  });

  it('does not enqueue calendar work when the archive is refused', async () => {
    await seedPatient();
    await db
      .collection(COLLECTIONS.appointments)
      .doc('appointment_ret_future')
      .set({
        patientId: PATIENT_ID,
        status: 'confirmed',
        startsAt: '2031-01-01T02:00:00.000Z'
      });

    await expect(repository.archive(baseCommand())).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(await retentionJobs()).toEqual([]);
  });
});

describe('archive and restore', () => {
  it('archives the patient and hides archived appointments and return lookup', async () => {
    await seedPatient();
    await db.collection(COLLECTIONS.appointments).doc('appointment_ret_1').set({
      patientId: PATIENT_ID,
      startsAt: '2030-10-02T00:00:00.000Z',
      bookingKind: 'initial',
      slotId: 'slot_ret_1',
      status: 'completed'
    });
    await db.collection(COLLECTIONS.followUpState).doc(PATIENT_ID).set({
      required: true
    });

    const archived = await repository.archive(baseCommand());
    expect(archived).toEqual({
      patientId: PATIENT_ID,
      state: 'archived',
      restorableUntil: '2030-11-19T00:00:00.000Z'
    });
    expect(
      (
        await db.collection(PATIENT_COLLECTIONS.patients).doc(PATIENT_ID).get()
      ).data()
    ).toMatchObject({
      archivedAt: NOW,
      archivedByRef: ACTOR_REF,
      legalHold: false,
      restorableUntil: '2030-11-19T00:00:00.000Z'
    });
    expect(
      (
        await db
          .collection(COLLECTIONS.appointments)
          .doc('appointment_ret_1')
          .get()
      ).data()
    ).toMatchObject({ patientArchived: true });

    const directory = new FirestorePatientDirectory(db);
    await expect(directory.listClinic(50)).resolves.toEqual([]);
    await expect(
      directory.lookupReturn(
        '0900000001',
        '--05-20',
        NOW,
        () => 'session_ret_1'
      )
    ).resolves.toBeUndefined();
  });

  it.each(['confirmed', 'arrived'] as const)(
    'rejects archiving when a future %s appointment exists',
    async (status) => {
      await seedPatient();
      await db
        .collection(COLLECTIONS.appointments)
        .doc('appointment_ret_future')
        .set({
          patientId: PATIENT_ID,
          startsAt: '2030-10-20T00:00:00.001Z',
          status
        });
      await expect(repository.archive(baseCommand())).rejects.toBeInstanceOf(
        ConflictError
      );
      expect(
        (
          await db
            .collection(PATIENT_COLLECTIONS.patients)
            .doc(PATIENT_ID)
            .get()
        ).get('archivedAt')
      ).toBeUndefined();
    }
  );

  it.each([
    ['confirmed', 'not-a-timestamp'],
    ['arrived', 'not-a-timestamp'],
    ['confirmed', '2030-10-21T00:00:00'],
    ['confirmed', '2030-10-21T08:00:00+08:00'],
    ['confirmed', '2030-02-30T00:00:00.000Z'],
    ['confirmed', null],
    ['confirmed', 42],
    ['confirmed', undefined]
  ] as const)(
    'refuses active %s with malformed stored startsAt %s without effects',
    async (status, startsAt) => {
      await seedPatient();
      const appointment = db
        .collection(COLLECTIONS.appointments)
        .doc('appointment_ret_invalid_utc');
      await appointment.set({
        patientId: PATIENT_ID,
        status,
        ...(startsAt === undefined ? {} : { startsAt })
      });
      const patient = db
        .collection(PATIENT_COLLECTIONS.patients)
        .doc(PATIENT_ID);
      const index = db
        .collection(PATIENT_COLLECTIONS.lookupIndex)
        .doc(INDEX_ID);
      const patientBefore = (await patient.get()).data();
      const appointmentBefore = (await appointment.get()).data();
      const indexBefore = (await index.get()).data();

      await expect(repository.archive(baseCommand())).rejects.toBeInstanceOf(
        DomainError
      );
      expect((await patient.get()).data()).toEqual(patientBefore);
      expect((await appointment.get()).data()).toEqual(appointmentBefore);
      expect((await index.get()).data()).toEqual(indexBefore);
      expect(await retentionJobs()).toEqual([]);
      expect((await db.collection(RETENTION_COLLECTIONS.log).get()).empty).toBe(
        true
      );
    }
  );

  it.each([
    '2030-10-30T23:59:59.999Z',
    RESTORABLE_UNTIL,
    '2032-01-01T00:00:00.000Z'
  ])(
    'restores an undeleted archived patient without a time limit at %s',
    async (now) => {
      await seedPatient({ archived: true });
      await db
        .collection(COLLECTIONS.appointments)
        .doc('appointment_ret_restore')
        .set({
          patientId: PATIENT_ID,
          patientArchived: true,
          status: 'completed'
        });
      const command: RestorePatientCommand = {
        ...baseCommand(),
        idempotencyKey: 'restore-key-000001',
        now
      };
      await expect(repository.restore(command)).resolves.toEqual({
        patientId: PATIENT_ID,
        state: 'active'
      });
      expect(
        (
          await db
            .collection(PATIENT_COLLECTIONS.patients)
            .doc(PATIENT_ID)
            .get()
        ).get('archivedAt')
      ).toBeUndefined();
      expect(
        (
          await db
            .collection(COLLECTIONS.appointments)
            .doc('appointment_ret_restore')
            .get()
        ).get('patientArchived')
      ).toBeUndefined();

      const replay = await repository.restore(command);
      expect(replay).toEqual({ patientId: PATIENT_ID, state: 'active' });
    }
  );

  it('keeps archived IDs in the lookup and refuses restoration after a replacement', async () => {
    await seedPatient({ archived: true });
    const directory = new FirestorePatientDirectory(db);
    const newId = await directory.resolveFromIntake(
      {
        name: '合成患者甲',
        phone: '0900-000-001',
        birthDate: '--05-20',
        nationality: 'domestic',
        privacyConsent: true
      },
      NOW,
      () => 'patient_ret_new'
    );
    expect(newId).toBe('patient_ret_new');
    expect(
      (
        await db.collection(PATIENT_COLLECTIONS.lookupIndex).doc(INDEX_ID).get()
      ).get('patientIds')
    ).toEqual([PATIENT_ID, 'patient_ret_new']);
    await expect(
      repository.restore({
        ...baseCommand(),
        idempotencyKey: 'restore-conflict-0001'
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      (
        await db.collection(PATIENT_COLLECTIONS.patients).doc(PATIENT_ID).get()
      ).get('archivedAt')
    ).toBe(ARCHIVE_NOW);
  });
});

describe('permanent deletion', () => {
  function deleteCommand(
    overrides: Partial<PermanentlyDeletePatientCommand> = {}
  ): PermanentlyDeletePatientCommand {
    return {
      ...baseCommand(),
      idempotencyKey: 'delete-key-000001',
      now: '2030-10-31T00:00:00.000Z',
      reasonCode: 'patient_request',
      ...overrides
    };
  }

  it('rejects deletion before 30 days and while legal hold is set', async () => {
    await seedPatient({ archived: true });
    await expect(
      repository.permanentlyDelete(
        deleteCommand({ now: '2030-10-30T23:59:59.999Z' })
      )
    ).rejects.toBeInstanceOf(ConflictError);

    const holdCommand: SetPatientLegalHoldCommand = {
      ...baseCommand(),
      idempotencyKey: 'legal-hold-key-0001',
      hold: true,
      reasonCode: 'other'
    };
    await repository.setLegalHold(holdCommand);
    await expect(
      repository.permanentlyDelete(
        deleteCommand({ idempotencyKey: 'delete-held-key-00001' })
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('removes listed data, preserves the audit event and returns layer counts', async () => {
    await seedPatient({ archived: true });
    await db
      .collection(COLLECTIONS.appointments)
      .doc('appointment_ret_delete')
      .set({
        patientId: PATIENT_ID,
        patientArchived: true,
        status: 'completed'
      });
    await db.collection(COLLECTIONS.patientBookingGuards).doc(PATIENT_ID).set({
      patientId: PATIENT_ID
    });
    await db.collection(COLLECTIONS.followUpState).doc(PATIENT_ID).set({
      patientId: PATIENT_ID,
      required: false
    });
    await db
      .collection(PATIENT_COLLECTIONS.returnSessions)
      .doc('session_ret_1')
      .set({
        patientId: PATIENT_ID
      });
    await db.collection(COLLECTIONS.followUps).doc('follow_ret_1').set({
      patientId: PATIENT_ID
    });
    await db.collection(COLLECTIONS.auditEvents).doc(AUDIT_ID).set({
      action: 'retention_test',
      targetId: PATIENT_ID,
      actorRef: ACTOR_REF
    });
    const auditCountBefore = (
      await db.collection(COLLECTIONS.auditEvents).get()
    ).size;

    const result = await repository.permanentlyDelete(deleteCommand());
    expect(result.layers).toEqual({
      patients: 1,
      appointments: 1,
      patient_booking_guards: 1,
      patient_follow_up_states: 1,
      return_sessions: 1,
      follow_ups: 1,
      patient_lookup_index_v2: 1
    });
    expect(
      await db.collection(PATIENT_COLLECTIONS.patients).doc(PATIENT_ID).get()
    ).toMatchObject({ exists: false });
    for (const collection of [
      COLLECTIONS.appointments,
      COLLECTIONS.patientBookingGuards,
      COLLECTIONS.followUpState,
      PATIENT_COLLECTIONS.returnSessions,
      COLLECTIONS.followUps,
      PATIENT_COLLECTIONS.lookupIndex
    ]) {
      expect((await db.collection(collection).get()).size).toBe(0);
    }
    expect((await db.collection(COLLECTIONS.auditEvents).get()).size).toBe(
      auditCountBefore
    );
    expect(
      await db.collection(COLLECTIONS.auditEvents).doc(AUDIT_ID).get()
    ).toMatchObject({ exists: true });
  });

  it('shows only expired archived records in the pending-deletion list', async () => {
    await seedPatient({ archived: true, legalHold: true });
    await expect(repository.pendingDeletion(NOW)).resolves.toEqual({
      patients: []
    });
    const pending = await repository.pendingDeletion(RESTORABLE_UNTIL);
    expect(pending).toEqual({
      patients: [
        {
          patientId: PATIENT_ID,
          archivedAt: ARCHIVE_NOW,
          restorableUntil: RESTORABLE_UNTIL,
          legalHold: true
        }
      ]
    });
    expect(JSON.stringify(pending)).not.toContain('合成患者甲');
  });

  it('excludes archived appointments from business exports', async () => {
    await seedPatient({ archived: true });
    await db
      .collection(COLLECTIONS.appointments)
      .doc('appointment_ret_export')
      .set({
        patientId: PATIENT_ID,
        patientArchived: true,
        startsAt: '2030-10-02T04:00:00.000Z',
        bookingKind: 'initial',
        itemId: 'service_snoring',
        status: 'completed'
      });
    const job = await exportRepository.create({
      idempotencyKey: 'retention-export-key-01',
      from: '2030-10-01',
      to: '2030-10-31',
      startAt: '2030-09-30T16:00:00.000Z',
      endAt: '2030-10-31T16:00:00.000Z',
      actorRef: ACTOR_REF,
      now: NOW,
      policy: POLICY
    });
    expect(job.rowCount).toBe(0);
  });

  it('excludes an archived patient from exports even when the appointment flag is missing', async () => {
    await seedPatient({ archived: true });
    for (const [id, patientId] of [
      ['appointment_ret_export_unflagged', PATIENT_ID],
      ['appointment_ret_export_active', 'patient_ret_export_active']
    ] as const) {
      await db.collection(COLLECTIONS.appointments).doc(id).set({
        patientId,
        startsAt: '2030-10-02T04:00:00.000Z',
        bookingKind: 'initial',
        itemId: 'service_snoring',
        status: 'completed'
      });
    }
    await db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc('patient_ret_export_active')
      .set({ patientId: 'patient_ret_export_active', name: '合成患者丁' });
    const job = await exportRepository.create({
      idempotencyKey: 'retention-export-key-02',
      from: '2030-10-01',
      to: '2030-10-31',
      startAt: '2030-09-30T16:00:00.000Z',
      endAt: '2030-10-31T16:00:00.000Z',
      actorRef: ACTOR_REF,
      now: NOW,
      policy: POLICY
    });
    // Only the active patient's row is exported.
    expect(job.rowCount).toBe(1);
  });
});

describe('idempotency and transaction bounds', () => {
  it('replays the same request and rejects a reused key with different content', async () => {
    await seedPatient();
    const first = await repository.archive(baseCommand());
    await expect(repository.archive(baseCommand())).resolves.toEqual(first);
    await expect(
      repository.archive(baseCommand({ patientId: 'patient_ret_other' }))
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await db.collection(RETENTION_COLLECTIONS.log).get()).size).toBe(1);
  });

  it('allows only one of two concurrent archive operations', async () => {
    await seedPatient();
    const results = await Promise.allSettled([
      repository.archive(baseCommand({ idempotencyKey: 'archive-key-000001' })),
      repository.archive(baseCommand({ idempotencyKey: 'archive-key-000002' }))
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected')
    ).toHaveLength(1);
  });

  it('rejects a transaction above 400 writes without archiving', async () => {
    await seedPatient();
    const batch = db.batch();
    for (let index = 0; index < 399; index += 1) {
      batch.set(
        db
          .collection(COLLECTIONS.appointments)
          .doc(`appointment_ret_bulk_${index}`),
        {
          patientId: PATIENT_ID,
          status: 'completed',
          startsAt: '2030-10-02T00:00:00.000Z'
        }
      );
    }
    await batch.commit();
    await expect(repository.archive(baseCommand())).rejects.toBeInstanceOf(
      ConflictError
    );
    expect((await db.collection(RETENTION_COLLECTIONS.log).get()).size).toBe(0);
    expect(
      (
        await db.collection(PATIENT_COLLECTIONS.patients).doc(PATIENT_ID).get()
      ).get('archivedAt')
    ).toBeUndefined();
  });
});

// A03 (SOL-RETENTION): the pending-deletion list is read in bounded pages that
// continue after the last record returned, ordered by (restorableUntil, ID),
// so records with the same time are neither skipped nor repeated.
describe('pending-deletion list paging (A03)', () => {
  async function seedArchived(
    id: string,
    restorableUntil: string,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    await db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc(id)
      .set({
        patientId: id,
        name: '合成患者甲',
        archivedAt: ARCHIVE_NOW,
        archivedByRef: ACTOR_REF,
        restorableUntil,
        ...extra
      });
  }

  async function pageThrough(limit: number) {
    const pages: string[][] = [];
    let after: { restorableUntil: string; patientId: string } | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await repository.pendingDeletion(NOW, {
        limit,
        ...(after === undefined ? {} : { after })
      });
      pages.push(page.patients.map((patient) => patient.patientId));
      if (page.next === undefined) break;
      after = page.next;
    }
    return pages;
  }

  it('pages equal restorableUntil values without omissions or repeats and keeps the hold flag', async () => {
    // Five records share one time; one is later; one is not yet expired and one
    // was never archived, so neither is listed.
    for (const id of ['patient_pd_a', 'patient_pd_b', 'patient_pd_c'])
      await seedArchived(id, '2030-10-10T00:00:00.000Z');
    await seedArchived('patient_pd_d', '2030-10-10T00:00:00.000Z', {
      legalHold: true
    });
    await seedArchived('patient_pd_e', '2030-10-10T00:00:00.000Z');
    await seedArchived('patient_pd_f', '2030-10-15T00:00:00.000Z');
    await seedArchived('patient_pd_future', '2030-12-01T00:00:00.000Z');
    await db
      .collection(PATIENT_COLLECTIONS.patients)
      .doc('patient_pd_active')
      .set({ patientId: 'patient_pd_active', name: '合成患者乙' });

    const pages = await pageThrough(2);

    expect(pages).toEqual([
      ['patient_pd_a', 'patient_pd_b'],
      ['patient_pd_c', 'patient_pd_d'],
      ['patient_pd_e', 'patient_pd_f']
    ]);
    const all = await repository.pendingDeletion(NOW);
    expect(all.next).toBeUndefined();
    expect(
      all.patients.find((patient) => patient.patientId === 'patient_pd_d')
    ).toMatchObject({ legalHold: true });
    expect(
      all.patients.find((patient) => patient.patientId === 'patient_pd_a')
    ).toMatchObject({ legalHold: false });
    expect(JSON.stringify(all)).not.toContain('合成患者');
  });

  it('reports no continuation for exactly one full page, and one for one more record', async () => {
    for (const id of ['patient_pd_a', 'patient_pd_b'])
      await seedArchived(id, '2030-10-10T00:00:00.000Z');

    const exact = await repository.pendingDeletion(NOW, { limit: 2 });
    expect(exact.patients).toHaveLength(2);
    expect(exact.next).toBeUndefined();

    await seedArchived('patient_pd_c', '2030-10-10T00:00:00.000Z');
    const more = await repository.pendingDeletion(NOW, { limit: 2 });
    expect(more.patients).toHaveLength(2);
    expect(more.next).toEqual({
      restorableUntil: '2030-10-10T00:00:00.000Z',
      patientId: 'patient_pd_b'
    });
  });

  it('never deletes or changes what it lists', async () => {
    await seedArchived('patient_pd_a', '2030-10-10T00:00:00.000Z');
    const before = (
      await db
        .collection(PATIENT_COLLECTIONS.patients)
        .doc('patient_pd_a')
        .get()
    ).data();

    await repository.pendingDeletion(NOW, { limit: 1 });

    expect(
      (
        await db
          .collection(PATIENT_COLLECTIONS.patients)
          .doc('patient_pd_a')
          .get()
      ).data()
    ).toEqual(before);
  });
});
