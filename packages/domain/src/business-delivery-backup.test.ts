import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { assessBusinessBackupEvidence } from './business-delivery-backup.js';

const policy = {
  minimumCopyCount: 2,
  minimumRetentionDays: 30,
  requireIndependentCopy: true,
  requireDistinctLocation: true,
  requireRestoreDrill: true,
  requireFailureAlert: true,
  maximumRpoMinutes: 60,
  maximumRtoMinutes: 240
} as const;

const copies = [
  {
    copyId: 'primary_001',
    kind: 'primary_database' as const,
    location: 'asia-east1',
    retentionDays: 30,
    recoverable: true,
    accessControlled: true
  },
  {
    copyId: 'independent_001',
    kind: 'independent_copy' as const,
    location: 'asia-southeast1',
    retentionDays: 30,
    recoverable: true,
    accessControlled: true
  }
] as const;

const drill = {
  sourceCopyId: 'independent_001',
  targetDatabaseId: 'restore_drill_001',
  startedAt: '2030-01-01T00:00:00.000Z',
  usableAt: '2030-01-01T00:15:00.000Z',
  passed: true,
  rpoMinutes: 5,
  rtoMinutes: 15
} as const;

describe('assessBusinessBackupEvidence', () => {
  it('verifies copies, independent location, restore drill, and alert evidence', () => {
    expect(
      assessBusinessBackupEvidence({
        copies,
        restoreDrill: drill,
        failureAlertVerified: true,
        policy
      })
    ).toEqual({
      ok: true,
      status: 'verified',
      copyCount: 2,
      independentCopyCount: 1,
      locationCount: 2,
      restoreDrill: 'verified',
      failureAlert: 'verified',
      issues: []
    });
  });

  it('does not treat a same-location daily backup as an independent copy', () => {
    const result = assessBusinessBackupEvidence({
      copies: [
        copies[0],
        {
          ...copies[0],
          copyId: 'daily_001',
          kind: 'daily_backup',
          location: 'asia-east1'
        }
      ],
      policy: {
        ...policy,
        requireRestoreDrill: false,
        requireFailureAlert: false
      }
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe('insufficient_evidence');
    expect(result.issues).toEqual([
      'INDEPENDENT_COPY_MISSING',
      'DISTINCT_LOCATION_MISSING'
    ]);
  });

  it('marks missing restore and alert evidence as insufficient, not unused', () => {
    const result = assessBusinessBackupEvidence({ copies, policy });
    expect(result).toMatchObject({
      ok: false,
      status: 'insufficient_evidence',
      restoreDrill: 'missing',
      failureAlert: 'missing'
    });
    expect(result.issues).toEqual([
      'RESTORE_DRILL_MISSING',
      'FAILURE_ALERT_MISSING'
    ]);
  });

  it('marks a failed drill or exceeded target as failed', () => {
    const result = assessBusinessBackupEvidence({
      copies,
      restoreDrill: {
        ...drill,
        passed: false,
        rtoMinutes: 300
      },
      failureAlertVerified: true,
      policy
    });
    expect(result.status).toBe('failed');
    expect(result.issues).toEqual([
      'RESTORE_DRILL_FAILED',
      'RTO_TARGET_EXCEEDED'
    ]);
  });

  it('refuses duplicate copies, unknown sources, and in-place restore targets', () => {
    expect(() =>
      assessBusinessBackupEvidence({
        copies: [copies[0], copies[0]],
        policy
      })
    ).toThrow(/unique/);
    expect(() =>
      assessBusinessBackupEvidence({
        copies,
        restoreDrill: { ...drill, sourceCopyId: 'unknown_001' },
        policy
      })
    ).toThrow(DomainError);
    expect(() =>
      assessBusinessBackupEvidence({
        copies,
        restoreDrill: { ...drill, targetDatabaseId: '(default)' },
        policy
      })
    ).toThrow(/new target/);
  });
});
