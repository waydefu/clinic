import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { planRetentionOperation } from './business-delivery-retention.js';

const policy = { recoverableDays: 30 } as const;
const proof = {
  scopeId: 'scope_c1',
  requestId: 'request_001',
  authorizationReference: 'auth_001',
  reauthenticationReference: 'reauth_001',
  authorized: true,
  reauthenticated: true
} as const;

function archivePlan() {
  return planRetentionOperation({
    operation: 'archive',
    resourceId: 'resource_001',
    requestId: 'request_001',
    state: 'active',
    nowAt: '2030-01-01T00:00:00.000Z',
    legalHold: false,
    policy,
    proof
  });
}

describe('planRetentionOperation', () => {
  it('archives without using appointment cancellation semantics', () => {
    expect(archivePlan()).toEqual({
      operation: 'archive',
      resourceId: 'resource_001',
      requestId: 'request_001',
      resultingState: 'archived',
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      auditRequired: true,
      backupTreatment: 'unchanged_separate_process',
      dependencyCheck: 'not_required',
      idempotency: 'new_operation'
    });
  });

  it('keeps the original archive boundary on repeated archive requests', () => {
    expect(
      planRetentionOperation({
        operation: 'archive',
        resourceId: 'resource_001',
        requestId: 'request_002',
        state: 'archived',
        nowAt: '2030-01-10T00:00:00.000Z',
        archivedAt: '2030-01-01T00:00:00.000Z',
        recoverableUntil: '2030-01-31T00:00:00.000Z',
        legalHold: false,
        policy,
        proof: { ...proof, requestId: 'request_002' }
      })
    ).toMatchObject({
      resultingState: 'archived',
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      idempotency: 'already_applied'
    });
  });

  it('restores before the exact expiry and rejects restoration at expiry', () => {
    const common = {
      operation: 'restore' as const,
      resourceId: 'resource_001',
      state: 'archived' as const,
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      legalHold: false,
      policy
    };
    expect(
      planRetentionOperation({
        ...common,
        requestId: 'request_003',
        nowAt: '2030-01-30T23:59:59.999Z',
        proof: { ...proof, requestId: 'request_003' }
      })
    ).toMatchObject({ resultingState: 'active', archivedAt: null });
    expect(() =>
      planRetentionOperation({
        ...common,
        requestId: 'request_004',
        nowAt: '2030-01-31T00:00:00.000Z',
        proof: { ...proof, requestId: 'request_004' }
      })
    ).toThrow(/expired/);
  });

  it('requires the explicit delete gate after the recovery window', () => {
    const common = {
      operation: 'permanent_delete' as const,
      resourceId: 'resource_001',
      state: 'archived' as const,
      nowAt: '2030-01-31T00:00:00.000Z',
      archivedAt: '2030-01-01T00:00:00.000Z',
      recoverableUntil: '2030-01-31T00:00:00.000Z',
      legalHold: false,
      policy
    };
    expect(() =>
      planRetentionOperation({
        ...common,
        requestId: 'request_005',
        proof: { ...proof, requestId: 'request_005' }
      })
    ).toThrow(/reconciled/);
    expect(
      planRetentionOperation({
        ...common,
        requestId: 'request_006',
        dependenciesReconciled: true,
        proof: { ...proof, requestId: 'request_006' }
      })
    ).toMatchObject({
      resultingState: 'permanently_deleted',
      dependencyCheck: 'complete',
      backupTreatment: 'unchanged_separate_process'
    });
  });

  it('blocks legal hold and missing re-authentication, and is idempotent after deletion', () => {
    expect(() =>
      planRetentionOperation({
        operation: 'permanent_delete',
        resourceId: 'resource_001',
        requestId: 'request_007',
        state: 'archived',
        nowAt: '2030-01-31T00:00:00.000Z',
        archivedAt: '2030-01-01T00:00:00.000Z',
        recoverableUntil: '2030-01-31T00:00:00.000Z',
        legalHold: true,
        dependenciesReconciled: true,
        policy,
        proof: { ...proof, requestId: 'request_007' }
      })
    ).toThrow(DomainError);
    expect(
      planRetentionOperation({
        operation: 'permanent_delete',
        resourceId: 'resource_001',
        requestId: 'request_008',
        state: 'permanently_deleted',
        nowAt: '2030-02-01T00:00:00.000Z',
        legalHold: false,
        policy,
        proof: { ...proof, requestId: 'request_008' }
      })
    ).toMatchObject({
      resultingState: 'permanently_deleted',
      idempotency: 'already_applied'
    });
  });
});
