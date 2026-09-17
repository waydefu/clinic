import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { planBusinessTerminationOperation } from './business-delivery-termination.js';

const policy = {
  minimumNoticeDays: 30,
  controlledCopyRetentionDays: 30
} as const;

const proof = {
  scopeId: 'scope_c1',
  requestId: 'request_001',
  authorizationReference: 'auth_001',
  reauthenticationReference: 'reauth_001',
  authorized: true,
  reauthenticated: true
} as const;

function openNotice() {
  return planBusinessTerminationOperation({
    operation: 'open_notice',
    terminationId: 'termination_001',
    requestId: 'request_001',
    state: 'active',
    nowAt: '2030-01-01T00:00:00.000Z',
    policy,
    proof
  });
}

describe('planBusinessTerminationOperation', () => {
  it('opens a notice with injected policy boundaries and separate treatments', () => {
    expect(openNotice()).toEqual({
      operation: 'open_notice',
      terminationId: 'termination_001',
      requestId: 'request_001',
      resultingState: 'termination_pending',
      noticeStartedAt: '2030-01-01T00:00:00.000Z',
      noticeDueAt: '2030-01-31T00:00:00.000Z',
      noticeExceptionReference: null,
      returnManifestReference: null,
      recipientConfirmationReference: null,
      returnCompletedAt: null,
      controlledRetentionUntil: null,
      activeDataTreatment: 'return_once',
      controlledCopyTreatment: 'retain_until_policy_expiry',
      backupTreatment: 'unchanged_separate_process',
      auditTreatment: 'retain_separate_policy',
      deletion: 'manual_review_only',
      idempotency: 'new_operation'
    });
  });

  it('keeps the original notice boundary on repeated requests', () => {
    expect(
      planBusinessTerminationOperation({
        operation: 'open_notice',
        terminationId: 'termination_001',
        requestId: 'request_002',
        state: 'termination_pending',
        nowAt: '2030-01-10T00:00:00.000Z',
        noticeStartedAt: '2030-01-01T00:00:00.000Z',
        noticeDueAt: '2030-01-31T00:00:00.000Z',
        policy,
        proof: { ...proof, requestId: 'request_002' }
      })
    ).toMatchObject({
      noticeStartedAt: '2030-01-01T00:00:00.000Z',
      noticeDueAt: '2030-01-31T00:00:00.000Z',
      idempotency: 'already_applied'
    });
  });

  it('requires complete return evidence and respects the notice boundary', () => {
    const common = {
      operation: 'record_return' as const,
      terminationId: 'termination_001',
      requestId: 'request_003',
      state: 'termination_pending' as const,
      nowAt: '2030-01-30T00:00:00.000Z',
      noticeStartedAt: '2030-01-01T00:00:00.000Z',
      noticeDueAt: '2030-01-31T00:00:00.000Z',
      policy
    };
    expect(() =>
      planBusinessTerminationOperation({
        ...common,
        proof: { ...proof, requestId: 'request_003' },
        returnManifestReference: 'manifest_003',
        recipientConfirmationReference: 'recipient_003'
      })
    ).toThrow(/notice period/);
    expect(
      planBusinessTerminationOperation({
        ...common,
        requestId: 'request_004',
        nowAt: '2030-01-30T00:00:00.000Z',
        noticeExceptionReference: 'exception_004',
        returnManifestReference: 'manifest_004',
        recipientConfirmationReference: 'recipient_004',
        proof: { ...proof, requestId: 'request_004' }
      })
    ).toMatchObject({
      resultingState: 'returned',
      returnCompletedAt: '2030-01-30T00:00:00.000Z'
    });
  });

  it('starts controlled retention once and never moves the original expiry', () => {
    const input = {
      operation: 'start_controlled_retention' as const,
      terminationId: 'termination_001',
      requestId: 'request_005',
      state: 'returned' as const,
      nowAt: '2030-02-01T00:00:00.000Z',
      noticeStartedAt: '2030-01-01T00:00:00.000Z',
      noticeDueAt: '2030-01-31T00:00:00.000Z',
      returnManifestReference: 'manifest_005',
      recipientConfirmationReference: 'recipient_005',
      returnCompletedAt: '2030-01-31T00:00:00.000Z',
      policy,
      proof: { ...proof, requestId: 'request_005' }
    };
    expect(planBusinessTerminationOperation(input)).toMatchObject({
      resultingState: 'controlled_retention',
      controlledRetentionUntil: '2030-03-02T00:00:00.000Z',
      deletion: 'manual_review_only'
    });
    expect(() =>
      planBusinessTerminationOperation({
        ...input,
        requestId: 'request_006',
        state: 'controlled_retention',
        nowAt: '2030-02-10T00:00:00.000Z',
        controlledRetentionUntil: '2030-03-12T00:00:00.000Z',
        proof: { ...proof, requestId: 'request_006' }
      })
    ).toThrow(/original retention boundary/);
  });

  it('requires backup and audit evidence before manual closure review', () => {
    const common = {
      operation: 'request_manual_close_review' as const,
      terminationId: 'termination_001',
      state: 'controlled_retention' as const,
      nowAt: '2030-03-02T00:00:00.000Z',
      noticeStartedAt: '2030-01-01T00:00:00.000Z',
      noticeDueAt: '2030-01-31T00:00:00.000Z',
      returnManifestReference: 'manifest_007',
      recipientConfirmationReference: 'recipient_007',
      returnCompletedAt: '2030-01-31T00:00:00.000Z',
      controlledRetentionUntil: '2030-03-02T00:00:00.000Z',
      policy
    };
    expect(() =>
      planBusinessTerminationOperation({
        ...common,
        requestId: 'request_007',
        proof: { ...proof, requestId: 'request_007' }
      })
    ).toThrow(/backup and audit/);
    expect(
      planBusinessTerminationOperation({
        ...common,
        requestId: 'request_008',
        backupDispositionConfirmed: true,
        auditDispositionConfirmed: true,
        proof: { ...proof, requestId: 'request_008' }
      })
    ).toMatchObject({
      resultingState: 'manual_close_review',
      backupTreatment: 'unchanged_separate_process',
      auditTreatment: 'retain_separate_policy',
      deletion: 'manual_review_only'
    });
    expect(
      planBusinessTerminationOperation({
        ...common,
        state: 'manual_close_review',
        requestId: 'request_009',
        backupDispositionConfirmed: true,
        auditDispositionConfirmed: true,
        proof: { ...proof, requestId: 'request_009' }
      })
    ).toMatchObject({
      resultingState: 'manual_close_review',
      idempotency: 'already_applied'
    });
  });

  it('fails closed for missing authorization and opaque references', () => {
    expect(() =>
      planBusinessTerminationOperation({
        operation: 'open_notice',
        terminationId: 'termination_001',
        requestId: 'request_010',
        state: 'active',
        nowAt: '2030-01-01T00:00:00.000Z',
        policy,
        proof: { ...proof, requestId: 'request_010', authorized: false }
      })
    ).toThrow(DomainError);
    expect(() =>
      planBusinessTerminationOperation({
        operation: 'open_notice',
        terminationId: 'contains patient data',
        requestId: 'request_011',
        state: 'active',
        nowAt: '2030-01-01T00:00:00.000Z',
        policy,
        proof: { ...proof, requestId: 'request_011' }
      })
    ).toThrow(/opaque/);
  });
});
