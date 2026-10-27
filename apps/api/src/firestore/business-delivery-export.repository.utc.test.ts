import { Timestamp } from 'firebase-admin/firestore';
import { DomainError } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

import { exportStatus } from './business-delivery-export.repository.js';

const NOW = '2030-10-20T00:00:00.000Z';
const JOB: Parameters<typeof exportStatus>[0] = {
  schemaVersion: 1,
  exportId: 'synthetic_export_utc',
  format: 'csv',
  createdAt: NOW,
  createdByRef: 'a'.repeat(64),
  from: '2030-10-01',
  to: '2030-10-31',
  sha256: 'b'.repeat(64),
  downloadExpiresAt: '2030-10-21T00:00:00.000Z',
  purgeAt: Timestamp.fromDate(new Date('2030-10-27T00:00:00.000Z')),
  rowCount: 0,
  byteLength: 0,
  chunkCount: 0,
  downloadCount: 0,
  maxDownloads: 3,
  idempotencyKey: 'synthetic_export_utc_key',
  requestHash: 'b'.repeat(64),
  policyVersion: 'synthetic_policy',
  revokedAt: null
};
const INVALID_TIMESTAMPS = [
  'not-a-timestamp',
  '2030-10-21T00:00:00',
  '2030-10-21T08:00:00+08:00',
  '2030-02-30T00:00:00.000Z'
];

describe('export status UTC consumption', () => {
  it.each(INVALID_TIMESTAMPS)('rejects invalid selected clock %s', (now) => {
    expect(() => exportStatus(JOB, now)).toThrow(DomainError);
  });

  it.each(INVALID_TIMESTAMPS)(
    'rejects invalid selected stored expiry %s',
    (downloadExpiresAt) => {
      expect(() => exportStatus({ ...JOB, downloadExpiresAt }, NOW)).toThrow(
        DomainError
      );
    }
  );

  it.each([
    '2030-10-21T00:00:00Z',
    '2030-10-21T00:00:00.000Z',
    '2030-10-21T00:00:00.123456Z'
  ])('keeps valid UTC expiry %s available', (downloadExpiresAt) => {
    expect(exportStatus({ ...JOB, downloadExpiresAt }, NOW)).toBe('ready');
  });

  it('does not interpret unused expiry after revocation or purge', () => {
    const job = { ...JOB, downloadExpiresAt: 'not-a-timestamp' };
    expect(exportStatus({ ...job, revokedAt: NOW }, NOW)).toBe('revoked');
    expect(exportStatus(job, '2030-10-27T00:00:00.000Z')).toBe('purged');
  });
});
