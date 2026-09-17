import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * BD-04 evaluates backup evidence without performing backup, clone, restore,
 * deletion, or alerting operations. The policy is injected so an owner can
 * decide retention, location, and recovery targets at an adapter boundary.
 */
export type BackupCopyKind =
  'primary_database' | 'daily_backup' | 'independent_copy';

export type BackupEvidenceStatus =
  'verified' | 'insufficient_evidence' | 'failed';

export type BackupEvidenceIssue =
  | 'COPY_COUNT_TOO_LOW'
  | 'INDEPENDENT_COPY_MISSING'
  | 'DISTINCT_LOCATION_MISSING'
  | 'RETENTION_TOO_SHORT'
  | 'COPY_NOT_RECOVERABLE'
  | 'COPY_ACCESS_NOT_CONTROLLED'
  | 'RESTORE_DRILL_MISSING'
  | 'RESTORE_DRILL_FAILED'
  | 'RPO_TARGET_EXCEEDED'
  | 'RTO_TARGET_EXCEEDED'
  | 'FAILURE_ALERT_MISSING';

export interface BackupCopyEvidence {
  readonly copyId: string;
  readonly kind: BackupCopyKind;
  readonly location: string;
  readonly retentionDays: number;
  readonly recoverable: boolean;
  readonly accessControlled: boolean;
}

export interface BackupRestoreDrillEvidence {
  readonly sourceCopyId: string;
  readonly targetDatabaseId: string;
  readonly startedAt: string;
  readonly usableAt: string;
  readonly passed: boolean;
  readonly rpoMinutes?: number | null;
  readonly rtoMinutes?: number | null;
}

export interface BusinessBackupEvidencePolicy {
  readonly minimumCopyCount: number;
  readonly minimumRetentionDays: number;
  readonly requireIndependentCopy: boolean;
  readonly requireDistinctLocation: boolean;
  readonly requireRestoreDrill: boolean;
  readonly requireFailureAlert: boolean;
  readonly maximumRpoMinutes?: number | null;
  readonly maximumRtoMinutes?: number | null;
}

export interface BusinessBackupEvidenceAssessment {
  readonly ok: boolean;
  readonly status: BackupEvidenceStatus;
  readonly copyCount: number;
  readonly independentCopyCount: number;
  readonly locationCount: number;
  readonly restoreDrill: 'verified' | 'missing' | 'failed' | 'not_required';
  readonly failureAlert: 'verified' | 'missing' | 'not_required';
  readonly issues: readonly BackupEvidenceIssue[];
}

const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const LOCATION = /^[A-Za-z0-9._-]{1,128}$/;

function assertOpaque(value: string, fieldName: string): void {
  if (!OPAQUE_IDENTIFIER.test(value)) {
    throw new DomainError('INVALID_VALUE', `${fieldName} must be opaque.`);
  }
}

function assertPolicy(policy: BusinessBackupEvidencePolicy): void {
  for (const [fieldName, value] of [
    ['minimumCopyCount', policy.minimumCopyCount],
    ['minimumRetentionDays', policy.minimumRetentionDays]
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new DomainError(
        'INVALID_VALUE',
        `${fieldName} must be a positive integer.`
      );
    }
  }
  for (const [fieldName, value] of [
    ['maximumRpoMinutes', policy.maximumRpoMinutes],
    ['maximumRtoMinutes', policy.maximumRtoMinutes]
  ] as const) {
    if (
      value !== undefined &&
      value !== null &&
      (!Number.isInteger(value) || value < 0)
    ) {
      throw new DomainError(
        'INVALID_VALUE',
        `${fieldName} must be a non-negative integer when supplied.`
      );
    }
  }
}

function assertCopies(copies: readonly BackupCopyEvidence[]): {
  readonly independentCopyCount: number;
  readonly locationCount: number;
  readonly copyIds: ReadonlySet<string>;
} {
  const copyIds = new Set<string>();
  const locations = new Set<string>();
  let independentCopyCount = 0;
  for (const copy of copies) {
    assertOpaque(copy.copyId, 'backup.copyId');
    if (copyIds.has(copy.copyId)) {
      throw new DomainError(
        'INVALID_VALUE',
        'backup copy identifiers must be unique.'
      );
    }
    copyIds.add(copy.copyId);
    if (!LOCATION.test(copy.location)) {
      throw new DomainError(
        'INVALID_VALUE',
        'backup locations must be safe identifiers.'
      );
    }
    locations.add(copy.location);
    if (!Number.isInteger(copy.retentionDays) || copy.retentionDays < 1) {
      throw new DomainError(
        'INVALID_VALUE',
        'backup retentionDays must be a positive integer.'
      );
    }
    if (copy.kind === 'independent_copy') independentCopyCount += 1;
  }
  return {
    independentCopyCount,
    locationCount: locations.size,
    copyIds
  };
}

function assertDrillShape(
  drill: BackupRestoreDrillEvidence,
  copyIds: ReadonlySet<string>
): void {
  assertOpaque(drill.sourceCopyId, 'backup.sourceCopyId');
  if (
    drill.targetDatabaseId === '(default)' ||
    !copyIds.has(drill.sourceCopyId)
  ) {
    throw new DomainError(
      'INVALID_VALUE',
      'restore drills require a known source copy and a new target database.'
    );
  }
  assertOpaque(drill.targetDatabaseId, 'backup.targetDatabaseId');
  assertUtcTimestamp(drill.startedAt, 'backup.startedAt');
  assertUtcTimestamp(drill.usableAt, 'backup.usableAt');
  if (Date.parse(drill.usableAt) < Date.parse(drill.startedAt)) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      'backup.usableAt cannot precede backup.startedAt.'
    );
  }
  for (const [fieldName, value] of [
    ['rpoMinutes', drill.rpoMinutes],
    ['rtoMinutes', drill.rtoMinutes]
  ] as const) {
    if (
      value !== undefined &&
      value !== null &&
      (!Number.isInteger(value) || value < 0)
    ) {
      throw new DomainError(
        'INVALID_VALUE',
        `${fieldName} must be a non-negative integer when supplied.`
      );
    }
  }
}

/**
 * Assesses one evidence packet. The result intentionally contains counts and
 * fixed issue codes only; opaque copy and database identifiers never leave
 * the input boundary.
 */
export function assessBusinessBackupEvidence(input: {
  readonly copies: readonly BackupCopyEvidence[];
  readonly restoreDrill?: BackupRestoreDrillEvidence | null;
  readonly failureAlertVerified?: boolean;
  readonly policy: BusinessBackupEvidencePolicy;
}): BusinessBackupEvidenceAssessment {
  assertPolicy(input.policy);
  const { independentCopyCount, locationCount, copyIds } = assertCopies(
    input.copies
  );
  const issues: BackupEvidenceIssue[] = [];
  if (input.copies.length < input.policy.minimumCopyCount) {
    issues.push('COPY_COUNT_TOO_LOW');
  }
  if (input.policy.requireIndependentCopy && independentCopyCount < 1) {
    issues.push('INDEPENDENT_COPY_MISSING');
  }
  if (input.policy.requireDistinctLocation && locationCount < 2) {
    issues.push('DISTINCT_LOCATION_MISSING');
  }
  for (const copy of input.copies) {
    if (copy.retentionDays < input.policy.minimumRetentionDays) {
      issues.push('RETENTION_TOO_SHORT');
    }
    if (!copy.recoverable) issues.push('COPY_NOT_RECOVERABLE');
    if (!copy.accessControlled) issues.push('COPY_ACCESS_NOT_CONTROLLED');
  }

  let restoreDrill: BusinessBackupEvidenceAssessment['restoreDrill'] =
    'not_required';
  const drill = input.restoreDrill ?? null;
  if (input.policy.requireRestoreDrill && drill === null) {
    restoreDrill = 'missing';
    issues.push('RESTORE_DRILL_MISSING');
  } else if (drill !== null) {
    assertDrillShape(drill, copyIds);
    restoreDrill = drill.passed ? 'verified' : 'failed';
    if (!drill.passed) issues.push('RESTORE_DRILL_FAILED');
    if (
      input.policy.maximumRpoMinutes !== undefined &&
      input.policy.maximumRpoMinutes !== null &&
      (drill.rpoMinutes === undefined ||
        drill.rpoMinutes === null ||
        drill.rpoMinutes > input.policy.maximumRpoMinutes)
    ) {
      issues.push('RPO_TARGET_EXCEEDED');
    }
    if (
      input.policy.maximumRtoMinutes !== undefined &&
      input.policy.maximumRtoMinutes !== null &&
      (drill.rtoMinutes === undefined ||
        drill.rtoMinutes === null ||
        drill.rtoMinutes > input.policy.maximumRtoMinutes)
    ) {
      issues.push('RTO_TARGET_EXCEEDED');
    }
  }

  let failureAlert: BusinessBackupEvidenceAssessment['failureAlert'] =
    'not_required';
  if (input.policy.requireFailureAlert) {
    failureAlert = input.failureAlertVerified === true ? 'verified' : 'missing';
    if (failureAlert === 'missing') issues.push('FAILURE_ALERT_MISSING');
  } else if (input.failureAlertVerified === true) {
    failureAlert = 'verified';
  }

  const failedIssues = new Set<BackupEvidenceIssue>([
    'COPY_NOT_RECOVERABLE',
    'COPY_ACCESS_NOT_CONTROLLED',
    'RESTORE_DRILL_FAILED',
    'RPO_TARGET_EXCEEDED',
    'RTO_TARGET_EXCEEDED'
  ]);
  const status: BackupEvidenceStatus =
    issues.length === 0
      ? 'verified'
      : issues.some((issue) => failedIssues.has(issue))
        ? 'failed'
        : 'insufficient_evidence';
  return {
    ok: issues.length === 0,
    status,
    copyCount: input.copies.length,
    independentCopyCount,
    locationCount,
    restoreDrill,
    failureAlert,
    issues: Object.freeze([...issues])
  };
}
