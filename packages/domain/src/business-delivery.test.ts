import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  calculateBusinessDeliveryMilestones,
  selectFirstEligibleUsage,
  selectFirstEligibleUsageFromReplay
} from './business-delivery.js';

const POLICY = {
  trialCalendarDays: 20,
  maxAdjustmentDays: 10,
  formalOperationCalendarMonths: 1
} as const;

const realStaff = (occurredAt: string) => ({
  occurredAt,
  actorKind: 'real_staff' as const
});

describe('selectFirstEligibleUsage', () => {
  it('ignores maintenance and test accounts and selects the earliest staff use', () => {
    expect(
      selectFirstEligibleUsage([
        { occurredAt: '2030-01-01T01:00:00.000Z', actorKind: 'test' },
        { occurredAt: '2030-01-01T02:00:00.000Z', actorKind: 'maintenance' },
        realStaff('2030-01-02T16:30:00.000Z'),
        realStaff('2030-01-02T01:00:00.000Z')
      ])
    ).toEqual(realStaff('2030-01-02T01:00:00.000Z'));
  });

  it('rejects a list with no eligible real-staff use', () => {
    expect(() =>
      selectFirstEligibleUsage([
        { occurredAt: '2030-01-01T01:00:00.000Z', actorKind: 'test' }
      ])
    ).toThrow(DomainError);
  });
});

describe('calculateBusinessDeliveryMilestones', () => {
  it('counts 20 Taipei dates from the first use and emits UTC boundaries', () => {
    expect(
      calculateBusinessDeliveryMilestones({
        firstEligibleUse: realStaff('2030-01-01T16:30:00.000Z'),
        policy: POLICY
      })
    ).toMatchObject({
      timeZone: 'Asia/Taipei',
      firstEligibleUseDate: '2030-01-02',
      trialEndExclusiveDate: '2030-01-22',
      trialEndExclusiveAt: '2030-01-21T16:00:00.000Z',
      formalOperationCheckpointDate: '2030-02-02',
      formalOperationCheckpointAt: '2030-02-01T16:00:00.000Z',
      adjustmentDays: 0,
      earlyEnd: null
    });
  });

  it('supports the maximum adjustment without changing the original boundary', () => {
    const result = calculateBusinessDeliveryMilestones({
      firstEligibleUse: realStaff('2030-01-01T01:00:00.000Z'),
      policy: POLICY,
      adjustmentDays: 10
    });
    expect(result.trialEndExclusiveDate).toBe('2030-01-21');
    expect(result.adjustedTrialEndExclusiveDate).toBe('2030-01-31');
  });

  it('clamps the formal-operation checkpoint at February month end', () => {
    const result = calculateBusinessDeliveryMilestones({
      firstEligibleUse: realStaff('2031-01-30T16:00:00.000Z'),
      policy: POLICY
    });
    expect(result.firstEligibleUseDate).toBe('2031-01-31');
    expect(result.formalOperationCheckpointDate).toBe('2031-02-28');
  });

  it('requires an opaque confirmation for an early end inside the scheduled window', () => {
    expect(
      calculateBusinessDeliveryMilestones({
        firstEligibleUse: realStaff('2030-01-01T01:00:00.000Z'),
        policy: POLICY,
        earlyEnd: {
          endedAt: '2030-01-10T01:00:00.000Z',
          confirmedByRole: 'clinic_owner',
          confirmationReference: 'confirm_20300110_01'
        }
      }).earlyEnd
    ).toEqual({
      endedAt: '2030-01-10T01:00:00.000Z',
      confirmedByRole: 'clinic_owner',
      confirmationReference: 'confirm_20300110_01'
    });
  });

  it('rejects over-limit adjustments, invalid dates, and an early end at the boundary', () => {
    expect(() =>
      calculateBusinessDeliveryMilestones({
        firstEligibleUse: realStaff('2030-01-01T01:00:00.000Z'),
        policy: POLICY,
        adjustmentDays: 11
      })
    ).toThrow(/exceeds/);
    expect(() =>
      calculateBusinessDeliveryMilestones({
        firstEligibleUse: realStaff('2030-01-01T01:00:00.000Z'),
        policy: POLICY,
        earlyEnd: {
          endedAt: '2030-01-21T16:00:00.000Z',
          confirmedByRole: 'clinic_owner',
          confirmationReference: 'confirm_20300121_01'
        }
      })
    ).toThrow(/inside/);
  });

  it('does not move the selected start when the same event is replayed', () => {
    expect(
      selectFirstEligibleUsageFromReplay([
        realStaff('2030-01-02T01:00:00.000Z'),
        realStaff('2030-01-02T01:00:00.000Z')
      ])
    ).toBe('2030-01-02T01:00:00.000Z');
  });
});
