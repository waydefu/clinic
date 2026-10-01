import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { resolveApprovedBusinessDeliveryPolicy } from '@beauessence/domain';
import type { BusinessTerminationResponse } from '@beauessence/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  EXPORT_COLLECTIONS,
  FirestoreBusinessExportRepository,
  type CreateExportCommand
} from '../../apps/api/src/firestore/business-delivery-export.repository.js';
import {
  FirestoreBusinessTerminationRepository,
  TERMINATION_COLLECTIONS,
  type AcknowledgeTerminationCommand,
  type CloseTerminationCommand,
  type CreateTerminationCommand
} from '../../apps/api/src/firestore/business-delivery-termination.repository.js';
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
const ACTOR = 'a'.repeat(64);
const NOTICE_AT = '2030-10-20T04:00:00.000Z';
const NOTICE_DATE = '2030-10-20';
const NOTICE_DUE = '2030-11-19T04:00:00.000Z';
const RETENTION_DUE = '2030-12-19T04:00:00.000Z';
const HOUR = 3_600_000;
const at = (value: string, offsetMs: number) =>
  new Date(Date.parse(value) + offsetMs).toISOString();

let app: App;
let db: Firestore;
let exports: FirestoreBusinessExportRepository;
let terminations: FirestoreBusinessTerminationRepository;

function createTerminationCommand(
  overrides: Partial<CreateTerminationCommand> = {}
): CreateTerminationCommand {
  return {
    idempotencyKey: 'termination-key-00000001',
    noticeDate: NOTICE_DATE,
    actorRef: ACTOR,
    now: NOTICE_AT,
    scope: 'internal_synthetic',
    policy: POLICY,
    ...overrides
  };
}

function createExportCommand(
  overrides: Partial<CreateExportCommand> = {}
): CreateExportCommand {
  return {
    idempotencyKey: 'termination-export-00000001',
    from: NOTICE_DATE,
    to: NOTICE_DATE,
    startAt: '2030-10-19T16:00:00.000Z',
    endAt: '2030-10-20T16:00:00.000Z',
    actorRef: ACTOR,
    now: NOTICE_DUE,
    policy: POLICY,
    ...overrides
  };
}

async function downloadedExport(overrides: Partial<CreateExportCommand> = {}) {
  const command = createExportCommand(overrides);
  const job = await exports.create(command);
  const downloaded = await exports.download(job.exportId, ACTOR, command.now);
  expect(downloaded).toBeDefined();
  return job;
}

function acknowledgement(
  terminationId: string,
  request: AcknowledgeTerminationCommand['request'],
  now: string
): AcknowledgeTerminationCommand {
  return {
    terminationId,
    request,
    actorRef: ACTOR,
    now,
    scope: 'internal_synthetic',
    policy: POLICY
  };
}

function closeCommand(
  terminationId: string,
  expectedVersion: number,
  now: string,
  idempotencyKey = 'termination-close-00000001'
): CloseTerminationCommand {
  return {
    terminationId,
    idempotencyKey,
    expectedVersion,
    actorRef: ACTOR,
    now,
    scope: 'internal_synthetic',
    policy: POLICY
  };
}

async function wipe(): Promise<void> {
  for (const collection of [
    ...Object.values(TERMINATION_COLLECTIONS),
    ...Object.values(EXPORT_COLLECTIONS)
  ]) {
    const documents = await db.collection(collection).listDocuments();
    await Promise.all(documents.map((document) => document.delete()));
  }
}

beforeAll(() => {
  app = initializeApp(
    { projectId: LOCAL_FIREBASE_PROJECT_ID },
    `business-termination-${Date.now()}`
  );
  db = getFirestore(app);
  exports = new FirestoreBusinessExportRepository(db);
  terminations = new FirestoreBusinessTerminationRepository(db);
});

afterAll(async () => {
  await wipe();
  await deleteApp(app);
});

beforeEach(wipe);

describe('business termination notice and receipts', () => {
  it('records a manager-started notice, preserves idempotency, and rejects key reuse', async () => {
    const command = createTerminationCommand();
    const created = await terminations.create(command);
    expect(created).toMatchObject({
      state: 'termination_pending',
      noticeDate: NOTICE_DATE,
      noticeStartedAt: NOTICE_AT,
      noticeDueAt: NOTICE_DUE,
      version: 1,
      closeReadiness: {
        ready: false,
        missingSteps: expect.arrayContaining(['data_return'])
      }
    });
    await expect(
      terminations.get(created.terminationId, NOTICE_AT, 'production')
    ).resolves.toBeUndefined();
    const replay = await terminations.create(command);
    expect(replay).toMatchObject({
      terminationId: created.terminationId,
      version: 1,
      replayed: true
    });
    await expect(
      terminations.create({ ...command, noticeDate: '2030-10-21' })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects return acknowledgement before the 30-day notice boundary', async () => {
    const created = await terminations.create(createTerminationCommand());
    const job = await downloadedExport();
    await expect(
      terminations.acknowledge(
        acknowledgement(
          created.terminationId,
          {
            idempotencyKey: 'termination-ack-early-00001',
            receiptKind: 'data_return',
            exportId: job.exportId
          },
          at(NOTICE_DUE, -1)
        )
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('uses only a downloaded server export job hash and rejects invalid receipts', async () => {
    const created = await terminations.create(createTerminationCommand());
    const job = await downloadedExport();
    const ackCommand = acknowledgement(
      created.terminationId,
      {
        idempotencyKey: 'termination-ack-valid-0001',
        receiptKind: 'data_return',
        exportId: job.exportId
      },
      NOTICE_DUE
    );
    const ack = await terminations.acknowledge(ackCommand);
    expect(ack).toMatchObject({
      state: 'controlled_retention',
      version: 2,
      controlledRetentionUntil: RETENTION_DUE,
      receipts: [
        {
          receiptKind: 'data_return',
          exportId: job.exportId,
          actorRef: ACTOR,
          acknowledgedAt: NOTICE_DUE,
          sha256: job.sha256
        }
      ]
    });
    expect(await terminations.acknowledge(ackCommand)).toMatchObject({
      replayed: true,
      version: 2,
      receipts: ack.receipts
    });
    const storedReceipt = await db
      .collection(TERMINATION_COLLECTIONS.exportReceipts)
      .doc(job.exportId)
      .get();
    expect(storedReceipt.data()).toMatchObject({
      terminationId: created.terminationId,
      actorRef: ACTOR,
      acknowledgedAt: NOTICE_DUE,
      sha256: job.sha256
    });
    const auditLogs = await db
      .collection(TERMINATION_COLLECTIONS.log)
      .where('terminationId', '==', created.terminationId)
      .get();
    expect(auditLogs.size).toBe(2);
    const auditEvents = auditLogs.docs.map((document) => document.data());
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'created',
          actorRef: ACTOR,
          at: NOTICE_AT,
          version: 1,
          idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/)
        }),
        expect.objectContaining({
          action: 'acknowledged',
          actorRef: ACTOR,
          at: NOTICE_DUE,
          version: 2,
          idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/)
        })
      ])
    );
    expect(JSON.stringify(auditEvents)).not.toContain(
      'termination-ack-valid-0001'
    );

    const badId = `exp_${'f'.repeat(40)}`;
    await db
      .collection(EXPORT_COLLECTIONS.jobs)
      .doc(badId)
      .set({
        schemaVersion: 1,
        exportId: badId,
        format: 'csv',
        sha256: 'not-a-hash',
        downloadCount: 1,
        revokedAt: null,
        purgeAt: new Date('2031-01-01T00:00:00.000Z')
      });
    const other = await terminations.create(
      createTerminationCommand({ idempotencyKey: 'termination-key-00000002' })
    );
    await expect(
      terminations.acknowledge(
        acknowledgement(
          other.terminationId,
          {
            idempotencyKey: 'termination-ack-badhash-00001',
            receiptKind: 'data_return',
            exportId: badId
          },
          NOTICE_DUE
        )
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('prevents one export receipt from being assigned to two termination cases', async () => {
    const job = await downloadedExport();
    const first = await terminations.create(createTerminationCommand());
    const second = await terminations.create(
      createTerminationCommand({ idempotencyKey: 'termination-key-00000002' })
    );
    const request = {
      idempotencyKey: 'termination-ack-crosscase-001',
      receiptKind: 'data_return' as const,
      exportId: job.exportId
    };
    await terminations.acknowledge(
      acknowledgement(first.terminationId, request, NOTICE_DUE)
    );
    await expect(
      terminations.acknowledge(
        acknowledgement(second.terminationId, request, NOTICE_DUE)
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('business termination close review', () => {
  it('requires receipt, all checklist evidence, elapsed retention and the current version', async () => {
    const job = await downloadedExport();
    const created = await terminations.create(createTerminationCommand());
    const returned = await terminations.acknowledge(
      acknowledgement(
        created.terminationId,
        {
          idempotencyKey: 'termination-ack-close-0001',
          receiptKind: 'data_return',
          exportId: job.exportId
        },
        NOTICE_DUE
      )
    );
    const closeEarly = closeCommand(
      created.terminationId,
      returned.version,
      at(RETENTION_DUE, -1)
    );
    await expect(terminations.close(closeEarly)).rejects.toMatchObject({
      missingSteps: [
        'controlled_copy_retention',
        'backup_disposition',
        'audit_disposition',
        'access_revocation'
      ]
    });

    let current = returned;
    for (const [index, receiptKind] of (
      ['backup_disposition', 'audit_disposition'] as const
    ).entries()) {
      current = await terminations.acknowledge(
        acknowledgement(
          created.terminationId,
          {
            idempotencyKey: `termination-checklist-${String(index).padStart(4, '0')}`,
            receiptKind,
            evidenceRef: `evidence_${receiptKind}`
          },
          at(NOTICE_DUE, index * HOUR)
        )
      );
    }
    expect(current.closeReadiness).toEqual({
      ready: false,
      missingSteps: ['access_revocation']
    });
    await expect(
      terminations.close(
        closeCommand(created.terminationId, current.version, RETENTION_DUE)
      )
    ).rejects.toMatchObject({ missingSteps: ['access_revocation'] });
    current = await terminations.acknowledge(
      acknowledgement(
        created.terminationId,
        {
          idempotencyKey: 'termination-checklist-revoke-01',
          receiptKind: 'access_revocation',
          evidenceRef: 'evidence_access_revocation'
        },
        RETENTION_DUE
      )
    );
    expect(current.closeReadiness).toEqual({ ready: true, missingSteps: [] });

    await expect(
      terminations.close(
        closeCommand(created.terminationId, current.version - 1, RETENTION_DUE)
      )
    ).rejects.toBeInstanceOf(ConflictError);
    const competingCommands = [
      closeCommand(
        created.terminationId,
        current.version,
        RETENTION_DUE,
        'termination-close-race-0001'
      ),
      closeCommand(
        created.terminationId,
        current.version,
        RETENTION_DUE,
        'termination-close-race-0002'
      )
    ];
    const competing = await Promise.allSettled(
      competingCommands.map((command) => terminations.close(command))
    );
    const successes = competing.filter(
      (result): result is PromiseFulfilledResult<BusinessTerminationResponse> =>
        result.status === 'fulfilled'
    );
    const failures = competing.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBeInstanceOf(ConflictError);
    const ready = successes[0]!.value;
    expect(ready).toMatchObject({
      state: 'manual_close_review',
      version: current.version + 1,
      closeReadiness: { ready: true, missingSteps: [] }
    });
    const replay = await terminations.close(
      competingCommands[competing[0]?.status === 'fulfilled' ? 0 : 1]!
    );
    expect(replay).toMatchObject({ replayed: true, version: ready.version });
  });

  it('lists every missing step and does not accept a client assertion of completion', async () => {
    const created = await terminations.create(createTerminationCommand());
    const readiness = await terminations.get(
      created.terminationId,
      NOTICE_AT,
      'internal_synthetic'
    );
    expect(readiness?.closeReadiness.missingSteps).toEqual([
      'data_return',
      'controlled_copy_retention',
      'backup_disposition',
      'audit_disposition',
      'access_revocation'
    ]);
    await expect(
      terminations.close({
        ...closeCommand(created.terminationId, 1, NOTICE_AT),
        complete: true
      } as CloseTerminationCommand)
    ).rejects.toMatchObject({
      missingSteps: readiness?.closeReadiness.missingSteps
    });
  });
});
