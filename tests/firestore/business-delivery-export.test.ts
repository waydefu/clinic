import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { resolveApprovedBusinessDeliveryPolicy } from '@beauessence/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '../../apps/api/src/firestore/booking.repository.js';
import {
  EXPORT_COLLECTIONS,
  FirestoreBusinessExportRepository,
  type CreateExportCommand
} from '../../apps/api/src/firestore/business-delivery-export.repository.js';
import { PATIENT_COLLECTIONS } from '../../apps/api/src/patients/patient-directory.js';
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
const ACTOR = 'a'.repeat(64);
const HOUR = 3_600_000;
const at = (offsetMs: number) =>
  new Date(Date.parse(NOW) + offsetMs).toISOString();

let app: App;
let db: Firestore;
let repository: FirestoreBusinessExportRepository;

function command(
  overrides: Partial<CreateExportCommand> = {}
): CreateExportCommand {
  return {
    idempotencyKey: 'export-key-00000001',
    from: '2030-10-01',
    to: '2030-10-31',
    startAt: '2030-09-30T16:00:00.000Z',
    endAt: '2030-10-31T16:00:00.000Z',
    actorRef: ACTOR,
    now: NOW,
    policy: POLICY,
    ...overrides
  };
}

async function wipe(): Promise<void> {
  for (const collection of [
    COLLECTIONS.appointments,
    PATIENT_COLLECTIONS.patients,
    ...Object.values(EXPORT_COLLECTIONS)
  ]) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

async function seed(): Promise<void> {
  await db.collection(PATIENT_COLLECTIONS.patients).doc('patient_exp_1').set({
    patientId: 'patient_exp_1',
    name: '合成患者甲',
    phoneDigits: '0912000001',
    birthMonthDay: '--05-20'
  });
  // A record from before contact storage: only the name is known.
  await db.collection(PATIENT_COLLECTIONS.patients).doc('patient_exp_2').set({
    patientId: 'patient_exp_2',
    name: '合成患者乙'
  });
  const appointments = db.collection(COLLECTIONS.appointments);
  await appointments.doc('appointment_exp_in_1').set({
    patientId: 'patient_exp_1',
    slotId: 'slot_1',
    startsAt: '2030-10-02T04:00:00.000Z',
    bookingKind: 'initial',
    itemId: 'service_snoring',
    status: 'confirmed',
    intakeNationality: 'domestic',
    patientNote: '合成備註'
  });
  await appointments.doc('appointment_exp_in_2').set({
    patientId: 'patient_exp_2',
    slotId: 'slot_2',
    startsAt: '2030-10-31T15:59:00.000Z',
    bookingKind: 'follow_up',
    itemId: 'service_aesthetic',
    status: 'completed'
  });
  // 2030-11-01 00:00 Taipei: just outside the inclusive range.
  await appointments.doc('appointment_exp_out').set({
    patientId: 'patient_exp_1',
    slotId: 'slot_3',
    startsAt: '2030-10-31T16:00:00.000Z',
    bookingKind: 'initial',
    itemId: 'service_snoring',
    status: 'confirmed'
  });
}

async function chunkCount(): Promise<number> {
  return (await db.collection(EXPORT_COLLECTIONS.chunks).get()).size;
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `business-export-${Date.now()}`
  );
  db = getFirestore(app);
  repository = new FirestoreBusinessExportRepository(db);
});

afterAll(async () => {
  // Suites share one emulator database; leave no appointments or patients
  // behind for the next suite.
  await wipe();
  await deleteApp(app);
});

beforeEach(async () => {
  await wipe();
  await seed();
});

describe('export creation', () => {
  it('writes the approved columns for the Taipei range only', async () => {
    const job = await repository.create(command());
    expect(job).toMatchObject({
      status: 'ready',
      format: 'csv',
      rowCount: 2,
      downloadsRemaining: 3,
      downloadExpiresAt: at(24 * HOUR),
      purgeAt: at(7 * 24 * HOUR),
      replayed: false
    });
    const file = await repository.download(job.exportId, ACTOR, NOW);
    const lines = file!.content.split('\r\n');
    expect(lines[0]).toBe(
      '﻿姓名,電話,生日（月-日）,國籍,預約時間（台北）,初診／回診,服務,狀態,備註'
    );
    expect(lines[1]).toBe(
      '合成患者甲,0912-000-001,05-20,本國,2030-10-02 12:00,初診,止鼾,已預約,合成備註'
    );
    expect(lines[2]).toBe('合成患者乙,,,,2030-10-31 23:59,回診,醫美,已完成,');
    expect(lines).toHaveLength(4);
  });

  it('replays the same request and rejects the same key with other dates', async () => {
    const first = await repository.create(command());
    const replay = await repository.create(command({ now: at(HOUR) }));
    expect(replay).toMatchObject({ exportId: first.exportId, replayed: true });
    expect(await chunkCount()).toBe(1);
    await expect(
      repository.create(command({ to: '2030-10-30' }))
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('keeps no patient value in the export log', async () => {
    const job = await repository.create(command());
    await repository.download(job.exportId, ACTOR, NOW);
    const log = await db.collection(EXPORT_COLLECTIONS.log).get();
    expect(log.size).toBe(2);
    const serialized = JSON.stringify(
      log.docs.map((document) => document.data())
    );
    expect(serialized).not.toContain('合成患者');
    expect(serialized).not.toContain('0912');
  });

  it('exports a few hundred rows in one transaction', async () => {
    const batch = db.batch();
    for (let index = 0; index < 400; index += 1) {
      batch.set(
        db.collection(COLLECTIONS.appointments).doc(`appointment_big_${index}`),
        {
          patientId: 'patient_exp_1',
          slotId: `slot_big_${index}`,
          startsAt: '2030-10-05T04:00:00.000Z',
          bookingKind: 'initial',
          itemId: 'service_snoring',
          status: 'confirmed',
          patientNote: '甲'.repeat(120)
        }
      );
    }
    await batch.commit();
    const job = await repository.create(
      command({ idempotencyKey: 'export-key-00000002' })
    );
    expect(job.rowCount).toBe(402);
    expect(
      await db
        .collection(EXPORT_COLLECTIONS.jobs)
        .count()
        .get()
        .then((r) => r.data().count)
    ).toBe(1);
  });
});

describe('download limits', () => {
  it('allows three downloads and then refuses', async () => {
    const job = await repository.create(command());
    for (let index = 0; index < 3; index += 1) {
      expect(
        (await repository.download(job.exportId, ACTOR, NOW))?.job
          .downloadsRemaining
      ).toBe(2 - index);
    }
    await expect(
      repository.download(job.exportId, ACTOR, NOW)
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await repository.get(job.exportId, NOW))?.status).toBe('exhausted');
  });

  it('lets only one of two parallel requests take the last download', async () => {
    const job = await repository.create(command());
    await repository.download(job.exportId, ACTOR, NOW);
    await repository.download(job.exportId, ACTOR, NOW);
    const settled = await Promise.allSettled([
      repository.download(job.exportId, ACTOR, NOW),
      repository.download(job.exportId, ACTOR, NOW)
    ]);
    expect(
      settled.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
  });

  it('refuses after the 24-hour window and after purgeAt even before TTL runs', async () => {
    const job = await repository.create(command());
    await expect(
      repository.download(job.exportId, ACTOR, at(24 * HOUR))
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await repository.get(job.exportId, at(24 * HOUR)))?.status).toBe(
      'expired'
    );
    expect(
      (await repository.get(job.exportId, at(7 * 24 * HOUR)))?.status
    ).toBe('purged');
  });

  it('answers undefined for an unknown export', async () => {
    expect(
      await repository.download(`exp_${'d'.repeat(40)}`, ACTOR, NOW)
    ).toBeUndefined();
  });
});

describe('revoke', () => {
  it('deletes the stored file at once and blocks downloads', async () => {
    const job = await repository.create(command());
    const revoked = await repository.revoke(
      job.exportId,
      'revoke-key-000001',
      ACTOR,
      NOW
    );
    expect(revoked).toMatchObject({ status: 'revoked', replayed: false });
    expect(await chunkCount()).toBe(0);
    await expect(
      repository.download(job.exportId, ACTOR, NOW)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('replays the same revoke key and rejects a different one', async () => {
    const job = await repository.create(command());
    await repository.revoke(job.exportId, 'revoke-key-000001', ACTOR, NOW);
    expect(
      await repository.revoke(job.exportId, 'revoke-key-000001', ACTOR, NOW)
    ).toMatchObject({ replayed: true });
    await expect(
      repository.revoke(job.exportId, 'revoke-key-000002', ACTOR, NOW)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('empty range', () => {
  it('writes a header-only file', async () => {
    const job = await repository.create(
      command({
        idempotencyKey: 'export-key-00000003',
        from: '2031-01-01',
        to: '2031-01-01',
        startAt: '2030-12-31T16:00:00.000Z',
        endAt: '2031-01-01T16:00:00.000Z'
      })
    );
    expect(job.rowCount).toBe(0);
    const file = await repository.download(job.exportId, ACTOR, NOW);
    expect(file?.content.split('\r\n')).toHaveLength(2);
  });
});
