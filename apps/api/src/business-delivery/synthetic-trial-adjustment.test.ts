import { NotFoundException } from '@nestjs/common';
import {
  calculateBusinessDeliveryMilestones,
  evaluateBusinessMilestones,
  ROLES,
  resolveApprovedBusinessDeliveryPolicy
} from '@beauessence/domain';
import { describe, expect, it, vi } from 'vitest';

import { CANDIDATE_ROLE_PERMISSIONS } from '../platform/authorization/rbac.js';
import { BusinessDeliveryApplicationService } from './business-delivery.application-service.js';
import {
  initialSyntheticTrialAdjustment,
  planSyntheticTrialAdjustment,
  resolveSyntheticTrialAdjustmentDays,
  type SyntheticTrialAdjustmentCommand
} from './synthetic-trial-adjustment.js';

const policy = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const maxDays = policy.milestones.maxAdjustmentDays;
const firstEligibleUseAt = '2030-10-01T00:00:00.000Z';
const owner = ROLES.find((role) =>
  CANDIDATE_ROLE_PERMISSIONS[role].includes('read_business_delivery')
)!;
const authentication = { actorId: 'synthetic_staff', actorRole: owner };
const approval: SyntheticTrialAdjustmentCommand = {
  commandId: 'synthetic_command_a',
  kind: 'approve',
  adjustmentId: 'synthetic_adjustment_a',
  adjustmentDays: maxDays,
  approvalRef: 'synthetic_approval_a',
  expectedVersion: 0,
  actorRef: 'a'.repeat(64),
  approvedAt: '2030-10-02T00:00:00.000Z'
};
const initial = () =>
  initialSyntheticTrialAdjustment({
    firstEligibleUseAt,
    policy,
    revision: 0
  });
const resolve = (snapshot: unknown, revision: number) =>
  resolveSyntheticTrialAdjustmentDays({
    snapshot,
    firstEligibleUseAt,
    milestoneRevision: revision,
    policy
  });

function plan(
  state = initial(),
  input: SyntheticTrialAdjustmentCommand = approval
) {
  return planSyntheticTrialAdjustment(state, input, policy);
}

function fixture(snapshot?: unknown, revision = 0) {
  const repository = {
    usageEventsBetween: vi.fn(async () => []),
    hasStaffUsageCaptureGap: vi.fn(async () => false),
    milestoneState: vi.fn(async () => ({
      revision,
      firstEligibleUseAt,
      acknowledgements: {},
      ...(snapshot === undefined ? {} : { syntheticTrialAdjustment: snapshot })
    })),
    acknowledge: vi.fn(async () => ({ revision: 1, replayed: false }))
  };
  const service = new BusinessDeliveryApplicationService(
    {
      enabled: true,
      policy,
      scope: 'internal_synthetic',
      observedSince: firstEligibleUseAt
    },
    repository,
    { assertFresh: vi.fn(async () => undefined) },
    () => '2030-10-22T00:00:00.000Z'
  );
  return { repository, service };
}

describe('synthetic trial adjustment data flow', () => {
  it.each([0, maxDays])(
    'carries a %s-day fixture through repository port, service and domain',
    async (adjustmentDays) => {
      const planned = plan(initial(), { ...approval, adjustmentDays });
      const { service, repository } = fixture(planned.state, 1);
      const view = await service.milestones(authentication);
      const calculated = calculateBusinessDeliveryMilestones({
        firstEligibleUse: {
          occurredAt: firstEligibleUseAt,
          actorKind: 'real_staff'
        },
        policy: policy.milestones,
        adjustmentDays
      });
      expect(view.trial).toMatchObject({
        startDate: calculated.firstEligibleUseDate,
        endExclusiveDate: calculated.adjustedTrialEndExclusiveDate
      });
      expect(view.finalPayment.status).toBe('blocked');
      expect(view.formalLaunch.status).toBe('awaiting_acknowledgement');
      expect(repository.acknowledge).not.toHaveBeenCalled();
    }
  );

  it('keeps existing behavior without synthetic input', async () => {
    const ordinary = await fixture().service.milestones(authentication);
    const empty = await fixture(initial()).service.milestones(authentication);
    expect(empty).toEqual(ordinary);
    expect(resolve(undefined, 0)).toBeUndefined();
  });

  it('replays without extending twice or mutating state', () => {
    const before = initial();
    const first = plan(before);
    const replay = plan(first.state);
    expect(before.log).toEqual([]);
    expect(replay.state).toBe(first.state);
    expect(replay.replayed).toBe(true);
    expect(replay.revision).toBe(1);
    expect(resolve(replay.state, 1)).toBe(approval.adjustmentDays);
    expect(first.state.log).toHaveLength(1);
    const { commandId, ...rest } = approval;
    expect(plan(first.state, { ...rest, commandId }).replayed).toBe(true);
  });

  it('rejects conflicting, stale and reused approvals', () => {
    const first = plan();
    const conflict = { ...approval, adjustmentDays: 0 };
    const stale = { ...approval, commandId: 'synthetic_command_b' };
    const reused = {
      ...approval,
      commandId: 'synthetic_command_b',
      adjustmentId: 'synthetic_adjustment_b',
      expectedVersion: 1
    };
    expect(() => plan(first.state, conflict)).toThrow();
    expect(() => plan(first.state, stale)).toThrow();
    expect(() => plan(first.state, reused)).toThrow();
  });

  it.each([-1, 0.5, maxDays + 1, NaN, Infinity])(
    'rejects an invalid or excessive total %s without changing the log',
    (adjustmentDays) => {
      const before = initial();
      expect(() => plan(before, { ...approval, adjustmentDays })).toThrow();
      expect(before.log).toEqual([]);
    }
  );

  it('revokes without deleting history or permitting replay', async () => {
    const first = plan();
    const revoked = plan(first.state, {
      commandId: 'synthetic_revoke_a',
      kind: 'revoke',
      adjustmentId: approval.adjustmentId,
      approvalRef: 'synthetic_revocation_a',
      expectedVersion: 1,
      actorRef: 'b'.repeat(64),
      approvedAt: '2030-10-03T00:00:00.000Z'
    });
    expect(revoked.state.log).toHaveLength(2);
    expect(revoked.state.log[0]).toEqual(approval);
    expect(resolve(revoked.state, 2)).toBe(0);
    expect(() => plan(revoked.state)).toThrow();
    const { service } = fixture(revoked.state, 2);
    const view = await service.milestones(authentication);
    const ordinary = await fixture().service.milestones(authentication);
    expect(view.trial).toEqual(ordinary.trial);
  });

  it('rejects malformed or mismatched stored fixtures', async () => {
    const first = plan().state;
    for (const malformed of [
      null,
      { ...first, schemaVersion: 2 },
      { ...first, policyVersion: 'unknown_policy' },
      { ...first, firstEligibleUseAt: '2030-10-02T00:00:00.000Z' },
      { ...first, revision: 0 },
      { ...first, unexpected: true },
      { ...first, log: [{ ...approval, unexpected: true }] },
      { ...first, log: [{ ...approval, approvalRef: '' }] },
      { ...first, log: [{ ...approval, actorRef: 'unverified' }] },
      { ...first, log: [{ ...approval, approvedAt: 'not_utc' }] }
    ]) {
      const { service } = fixture(malformed, 1);
      await expect(service.milestones(authentication)).rejects.toThrow();
    }
    const { service } = fixture(first, 0);
    await expect(service.milestones(authentication)).rejects.toThrow();
  });

  it('shares the existing acknowledgement revision', async () => {
    const first = plan().state;
    const { service, repository } = fixture(first, 1);
    const permission = 'acknowledge_business_milestone';
    const acknowledger = ROLES.find((role) =>
      CANDIDATE_ROLE_PERMISSIONS[role].includes(permission)
    )!;
    repository.acknowledge.mockResolvedValue({ revision: 2, replayed: false });
    await expect(
      service.acknowledge(
        'formal_launch',
        {
          idempotencyKey: 'synthetic_ack_00000001',
          expectedVersion: 1,
          evidenceRef: 'synthetic_launch_evidence',
          launchDate: '2030-10-15'
        },
        'synthetic_recent_token',
        { ...authentication, actorRole: acknowledger }
      )
    ).resolves.toMatchObject({ revision: 2, replayed: false });
    repository.milestoneState.mockResolvedValue({
      revision: 2,
      firstEligibleUseAt,
      acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } },
      syntheticTrialAdjustment: first
    });
    const view = await service.milestones(authentication);
    expect(view.formalLaunch.status).toBe('acknowledged');
    expect(resolve(first, 2)).toBe(approval.adjustmentDays);
    const revoke: SyntheticTrialAdjustmentCommand = {
      commandId: 'synthetic_shared_revision_revoke',
      kind: 'revoke',
      adjustmentId: approval.adjustmentId,
      approvalRef: 'synthetic_shared_revision_authority',
      expectedVersion: 2,
      actorRef: 'b'.repeat(64),
      approvedAt: '2030-10-22T00:00:00.000Z'
    };
    expect(() => planSyntheticTrialAdjustment(first, revoke, policy)).toThrow();
    const revoked = planSyntheticTrialAdjustment(first, revoke, policy, 2);
    expect(revoked.revision).toBe(3);
    expect(resolve(revoked.state, 3)).toBe(0);
    expect(first.log).toHaveLength(1);
  });

  it.each([
    '2032-02-09T16:00:00.000Z',
    '2030-01-31T15:59:59.000Z',
    '2030-01-31T16:00:00.000Z'
  ])('preserves the Taipei calculator boundary across %s', (start) => {
    const state = initialSyntheticTrialAdjustment({
      firstEligibleUseAt: start,
      policy,
      revision: 0
    });
    const adjusted = plan(state, { ...approval, approvedAt: start }).state;
    const days = resolveSyntheticTrialAdjustmentDays({
      snapshot: adjusted,
      firstEligibleUseAt: start,
      milestoneRevision: 1,
      policy
    });
    const calculated = calculateBusinessDeliveryMilestones({
      firstEligibleUse: { occurredAt: start, actorKind: 'real_staff' },
      policy: policy.milestones,
      ...(days === undefined ? {} : { adjustmentDays: days })
    });
    expect(calculated.adjustmentDays).toBe(maxDays);
    expect(calculated.firstEligibleUseAt).toBe(start);
    const before = new Date(
      Date.parse(calculated.adjustedTrialEndExclusiveAt) - 1
    ).toISOString();
    const statusAt = (now: string) =>
      evaluateBusinessMilestones({
        policy,
        now,
        firstEligibleUseAt: start,
        ...(days === undefined ? {} : { adjustmentDays: days }),
        acknowledgements: {}
      });
    expect(statusAt(before).trial.status).toBe('in_progress');
    const end = statusAt(calculated.adjustedTrialEndExclusiveAt);
    expect(end.trial.status).toBe('ended');
  });

  it('rejects an adjustment without the original first use', () => {
    expect(() =>
      evaluateBusinessMilestones({
        policy,
        now: firstEligibleUseAt,
        adjustmentDays: 0,
        acknowledgements: {}
      })
    ).toThrow();
  });

  it('rejects adjustment acknowledgement commands', async () => {
    const { service, repository } = fixture();
    await expect(
      service.acknowledge('trial_adjustment', {}, undefined, authentication)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.acknowledge).not.toHaveBeenCalled();
  });
});
