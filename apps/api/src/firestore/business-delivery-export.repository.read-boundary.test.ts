import { createHash } from 'node:crypto';

import { resolveApprovedBusinessDeliveryPolicy } from '@beauessence/domain';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import {
  FirestoreBusinessExportRepository,
  type CreateExportCommand
} from './business-delivery-export.repository.js';
import { ConflictError } from '../platform/errors/api-error.js';

const NOW = '2030-10-20T00:00:00.000Z';
const CONTENT = 'synthetic export fixture\n';
const COMMAND: CreateExportCommand = {
  idempotencyKey: 'synthetic_export_version_key',
  from: '2030-10-01',
  to: '2030-10-31',
  startAt: '2030-09-30T16:00:00.000Z',
  endAt: '2030-10-31T16:00:00.000Z',
  actorRef: 'a'.repeat(64),
  now: NOW,
  policy: resolveApprovedBusinessDeliveryPolicy(
    'BD-POLICY-2026-09-29',
    'internal_synthetic'
  )
};
const JOB = {
  schemaVersion: 1,
  exportId: `exp_${createHash('sha256')
    .update(`bd-export:${COMMAND.idempotencyKey}`)
    .digest('hex')
    .slice(0, 40)}`,
  format: 'csv',
  from: COMMAND.from,
  to: COMMAND.to,
  rowCount: 0,
  byteLength: Buffer.byteLength(CONTENT, 'utf8'),
  sha256: createHash('sha256').update(CONTENT, 'utf8').digest('hex'),
  chunkCount: 1,
  createdAt: NOW,
  createdByRef: COMMAND.actorRef,
  downloadExpiresAt: '2030-10-21T00:00:00.000Z',
  maxDownloads: 3,
  downloadCount: 0,
  purgeAt: Timestamp.fromDate(new Date('2030-10-27T00:00:00.000Z')),
  revokedAt: null,
  idempotencyKey: COMMAND.idempotencyKey,
  requestHash: createHash('sha256')
    .update(JSON.stringify(['csv', COMMAND.from, COMMAND.to]))
    .digest('hex'),
  policyVersion: COMMAND.policy.policyVersion
};
const MISSING_VERSION: Record<string, unknown> = { ...JOB };
delete MISSING_VERSION['schemaVersion'];

function boundary(record: unknown) {
  const read = vi.fn().mockResolvedValue({ exists: true, data: () => record });
  const chunks = vi
    .fn()
    .mockResolvedValue([{ exists: true, data: () => ({ content: CONTENT }) }]);
  const transaction = {
    get: read,
    getAll: chunks,
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  };
  const reference = { get: read };
  const collection = {
    doc: vi.fn(() => reference),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis()
  };
  const db = {
    collection: vi.fn(() => collection),
    runTransaction: vi.fn(
      async (operation: (value: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
    )
  } as unknown as Firestore;
  return {
    repository: new FirestoreBusinessExportRepository(db),
    chunks,
    transaction
  };
}

const OPERATIONS = ['create', 'get', 'download', 'revoke'] as const;
type Operation = (typeof OPERATIONS)[number];

async function perform(
  repository: FirestoreBusinessExportRepository,
  operation: Operation
) {
  switch (operation) {
    case 'create':
      return repository.create(COMMAND);
    case 'get':
      return repository.get(JOB.exportId, NOW);
    case 'download':
      return (await repository.download(JOB.exportId, COMMAND.actorRef, NOW))
        ?.job;
    case 'revoke':
      return repository.revoke(
        JOB.exportId,
        'synthetic_revoke_version_key',
        COMMAND.actorRef,
        NOW
      );
  }
}

describe.each(OPERATIONS)(
  'export record version admission (%s)',
  (operation) => {
    it('preserves the supported version-one path', async () => {
      const { repository } = boundary(JOB);
      await expect(perform(repository, operation)).resolves.toMatchObject({
        exportId: JOB.exportId,
        format: 'csv',
        status: operation === 'revoke' ? 'revoked' : 'ready'
      });
    });

    it.each([
      ['missing', MISSING_VERSION],
      ['zero', { ...JOB, schemaVersion: 0 }],
      ['future', { ...JOB, schemaVersion: 2 }],
      ['string', { ...JOB, schemaVersion: '1' }],
      ['null', { ...JOB, schemaVersion: null }]
    ])(
      'rejects a %s version before chunk access or mutation',
      async (_, record) => {
        const { repository, chunks, transaction } = boundary(record);
        await expect(perform(repository, operation)).rejects.toBeInstanceOf(
          ConflictError
        );
        expect(chunks).not.toHaveBeenCalled();
        expect(transaction.create).not.toHaveBeenCalled();
        expect(transaction.update).not.toHaveBeenCalled();
        expect(transaction.delete).not.toHaveBeenCalled();
      }
    );
  }
);
