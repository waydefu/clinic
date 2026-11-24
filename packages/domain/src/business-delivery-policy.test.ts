import { describe, expect, it } from 'vitest';

import {
  assertMilestoneAcknowledgementAllowed,
  assessMonthlyUsageCompleteness,
  evaluateBusinessMilestones,
  resolveApprovedBusinessDeliveryPolicy,
  taipeiMonthRange
} from './business-delivery-policy.js';
import { calculateBusinessDeliveryMilestones } from './business-delivery.js';
import { DomainError } from './errors.js';

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);

describe('resolveApprovedBusinessDeliveryPolicy', () => {
  it('returns the owner-approved 2026-09-29 values', () => {
    expect(POLICY.milestones).toEqual({
      trialCalendarDays: 20,
      maxAdjustmentDays: 10,
      formalOperationCalendarMonths: 1
    });
    expect(POLICY.lateEventCutoffDays).toBe(5);
    expect(POLICY.maintenanceFeesTwd).toEqual({ normal: 1800, unused: 500 });
    expect(POLICY.reauthenticationMaxAgeSeconds).toBe(600);
    expect(POLICY.termination).toEqual({
      minimumNoticeDays: 30,
      controlledCopyRetentionDays: 30
    });
  });

  it.each([
    [undefined, 'internal_synthetic'],
    ['', 'internal_synthetic'],
    ['BD-POLICY-2030-01-01', 'internal_synthetic'],
    ['BD-POLICY-2026-09-29', undefined],
    ['BD-POLICY-2026-09-29', 'production'],
    ['BD-POLICY-2026-09-29', 'unknown_scope']
  ])('fails closed for version %s in scope %s', (version, scope) => {
    expect(() => resolveApprovedBusinessDeliveryPolicy(version, scope)).toThrow(
      DomainError
    );
  });

  it('cannot be mutated by a caller', () => {
    expect(Object.isFrozen(POLICY)).toBe(true);
    expect(Object.isFrozen(POLICY.milestones)).toBe(true);
    expect(Object.isFrozen(POLICY.termination)).toBe(true);
  });
});

describe('taipeiMonthRange', () => {
  it('uses Taipei midnight as a half-open UTC range', () => {
    expect(taipeiMonthRange('2030-10')).toEqual({
      startAt: '2030-09-30T16:00:00.000Z',
      endAt: '2030-10-31T16:00:00.000Z'
    });
  });

  it('rolls December into the next year', () => {
    expect(taipeiMonthRange('2030-12').endAt).toBe('2030-12-31T16:00:00.000Z');
  });

  it.each(['2030-13', '2030-00', '2030-1', 'abc'])('rejects %s', (month) => {
    expect(() => taipeiMonthRange(month)).toThrow(DomainError);
  });
});

describe('assessMonthlyUsageCompleteness', () => {
  const base = {
    month: '2030-10',
    observedSince: '2030-09-01T00:00:00.000Z',
    lateEventCutoffDays: 5
  };

  it('stays partial until five Taipei days after month end', () => {
    expect(
      assessMonthlyUsageCompleteness({
        ...base,
        now: '2030-11-05T15:59:59.999Z'
      })
    ).toEqual({
      completeness: 'partial',
      lockedAt: '2030-11-05T16:00:00.000Z'
    });
  });

  it('becomes complete exactly at the lock instant', () => {
    expect(
      assessMonthlyUsageCompleteness({
        ...base,
        now: '2030-11-05T16:00:00.000Z'
      }).completeness
    ).toBe('complete');
  });

  it('keeps a known capture-gap month partial after the late-event cutoff', () => {
    expect(
      assessMonthlyUsageCompleteness({
        ...base,
        now: '2031-01-01T00:00:00.000Z',
        hasCaptureGap: true
      })
    ).toEqual({
      completeness: 'partial',
      lockedAt: '2030-11-05T16:00:00.000Z'
    });
  });

  it('does not change pre-existing partial or unknown coverage for a capture gap', () => {
    expect(
      assessMonthlyUsageCompleteness({
        ...base,
        now: '2030-11-05T15:59:59.999Z',
        hasCaptureGap: true
      }).completeness
    ).toBe('partial');
    expect(
      assessMonthlyUsageCompleteness({
        ...base,
        observedSince: '2030-11-01T00:00:00.000Z',
        now: '2031-01-01T00:00:00.000Z',
        hasCaptureGap: true
      }).completeness
    ).toBe('unknown');
  });

  it('is partial when observation started inside the month', () => {
    expect(
      assessMonthlyUsageCompleteness({
        ...base,
        observedSince: '2030-10-15T00:00:00.000Z',
        now: '2031-01-01T00:00:00.000Z'
      }).completeness
    ).toBe('partial');
  });

  it('is complete when observation started exactly at month start', () => {
    expect(
      assessMonthlyUsageCompleteness({
        ...base,
        observedSince: '2030-09-30T16:00:00.000Z',
        now: '2031-01-01T00:00:00.000Z'
      }).completeness
    ).toBe('complete');
  });

  it('is unknown for a month before observation began', () => {
    expect(
      assessMonthlyUsageCompleteness({
        ...base,
        observedSince: '2030-11-01T00:00:00.000Z',
        now: '2031-01-01T00:00:00.000Z'
      }).completeness
    ).toBe('unknown');
  });

  it('rejects an invalid cutoff instead of defaulting', () => {
    expect(() =>
      assessMonthlyUsageCompleteness({
        ...base,
        lateEventCutoffDays: -1,
        now: '2031-01-01T00:00:00.000Z'
      })
    ).toThrow(DomainError);
  });
});

describe('evaluateBusinessMilestones', () => {
  it('has nothing started before any real staff use or acknowledgement', () => {
    expect(
      evaluateBusinessMilestones({
        policy: POLICY,
        now: '2030-10-01T00:00:00.000Z',
        acknowledgements: {}
      })
    ).toEqual({
      trial: { status: 'not_started' },
      formalLaunch: { status: 'awaiting_acknowledgement' },
      formalOperation: { status: 'not_started' },
      finalPayment: { status: 'blocked' },
      maintenance: { status: 'not_started' }
    });
  });

  it('counts the 20-day trial from the first real staff use, inclusive', () => {
    const result = evaluateBusinessMilestones({
      policy: POLICY,
      now: '2030-10-20T15:59:59.999Z',
      firstEligibleUseAt: '2030-10-01T01:00:00.000Z',
      acknowledgements: {}
    });
    expect(result.trial).toEqual({
      status: 'in_progress',
      startDate: '2030-10-01',
      endExclusiveDate: '2030-10-21'
    });
    expect(
      evaluateBusinessMilestones({
        policy: POLICY,
        now: '2030-10-20T16:00:00.000Z',
        firstEligibleUseAt: '2030-10-01T01:00:00.000Z',
        acknowledgements: {}
      }).trial.status
    ).toBe('ended');
  });

  it('keeps the final payment blocked for the whole formal operation month', () => {
    const result = evaluateBusinessMilestones({
      policy: POLICY,
      now: '2030-11-14T15:59:59.999Z',
      acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } }
    });
    expect(result.formalOperation).toEqual({
      status: 'in_progress',
      checkpointDate: '2030-11-15'
    });
    expect(result.finalPayment).toEqual({ status: 'blocked' });
  });

  it('waits for the owner once the month is reached; time alone never pays', () => {
    const result = evaluateBusinessMilestones({
      policy: POLICY,
      now: '2031-06-01T00:00:00.000Z',
      acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } }
    });
    expect(result.formalOperation.status).toBe('reached');
    expect(result.finalPayment).toEqual({ status: 'awaiting_acknowledgement' });
    expect(result.maintenance).toEqual({ status: 'not_started' });
  });

  it('clamps a month-end launch into a shorter month', () => {
    expect(
      evaluateBusinessMilestones({
        policy: POLICY,
        now: '2031-01-31T00:00:00.000Z',
        acknowledgements: { formalLaunch: { launchDate: '2031-01-31' } }
      }).formalOperation
    ).toEqual({ status: 'in_progress', checkpointDate: '2031-02-28' });
  });

  it('starts maintenance the Taipei day after the final-payment confirmation', () => {
    const acknowledgements = {
      formalLaunch: { launchDate: '2030-10-15' },
      // 2030-11-20 23:30 Taipei
      finalPayment: { acknowledgedAt: '2030-11-20T15:30:00.000Z' }
    };
    expect(
      evaluateBusinessMilestones({
        policy: POLICY,
        now: '2030-11-20T15:59:59.999Z',
        acknowledgements
      }).maintenance
    ).toEqual({ status: 'scheduled', startDate: '2030-11-21' });
    const active = evaluateBusinessMilestones({
      policy: POLICY,
      now: '2030-11-20T16:00:00.000Z',
      acknowledgements
    });
    expect(active.maintenance).toEqual({
      status: 'active',
      startDate: '2030-11-21'
    });
    expect(active.finalPayment).toEqual({
      status: 'acknowledged',
      acknowledgedDate: '2030-11-20'
    });
  });
});

describe('assertMilestoneAcknowledgementAllowed', () => {
  it('accepts a past or same-day launch date', () => {
    expect(() =>
      assertMilestoneAcknowledgementAllowed({
        milestoneId: 'formal_launch',
        policy: POLICY,
        now: '2030-10-15T01:00:00.000Z',
        launchDate: '2030-10-15',
        acknowledgements: {}
      })
    ).not.toThrow();
  });

  it.each([undefined, '2030-10-16', '2030-02-30', '2030/10/15'])(
    'rejects launch date %s',
    (launchDate) => {
      expect(() =>
        assertMilestoneAcknowledgementAllowed({
          milestoneId: 'formal_launch',
          policy: POLICY,
          now: '2030-10-15T01:00:00.000Z',
          ...(launchDate === undefined ? {} : { launchDate }),
          acknowledgements: {}
        })
      ).toThrow(DomainError);
    }
  );

  it('rejects the final payment before launch or before the month is reached', () => {
    expect(() =>
      assertMilestoneAcknowledgementAllowed({
        milestoneId: 'final_payment',
        policy: POLICY,
        now: '2031-06-01T00:00:00.000Z',
        acknowledgements: {}
      })
    ).toThrow(DomainError);
    expect(() =>
      assertMilestoneAcknowledgementAllowed({
        milestoneId: 'final_payment',
        policy: POLICY,
        now: '2030-11-14T15:59:59.999Z',
        acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } }
      })
    ).toThrow(DomainError);
  });

  it('accepts the final payment once the formal month is reached', () => {
    expect(() =>
      assertMilestoneAcknowledgementAllowed({
        milestoneId: 'final_payment',
        policy: POLICY,
        now: '2030-11-14T16:00:00.000Z',
        acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } }
      })
    ).not.toThrow();
  });

  it('rejects a launch date sent with the final payment', () => {
    expect(() =>
      assertMilestoneAcknowledgementAllowed({
        milestoneId: 'final_payment',
        policy: POLICY,
        now: '2031-06-01T00:00:00.000Z',
        launchDate: '2030-10-15',
        acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } }
      })
    ).toThrow(DomainError);
  });

  it('rejects a second final-payment confirmation', () => {
    expect(() =>
      assertMilestoneAcknowledgementAllowed({
        milestoneId: 'final_payment',
        policy: POLICY,
        now: '2031-06-01T00:00:00.000Z',
        acknowledgements: {
          formalLaunch: { launchDate: '2030-10-15' },
          finalPayment: { acknowledgedAt: '2030-11-20T00:00:00.000Z' }
        }
      })
    ).toThrow(DomainError);
  });
});

describe('BD-POLICY-2026-11-24 contract alignment (A-10)', () => {
  const POLICY_1124 = resolveApprovedBusinessDeliveryPolicy(
    'BD-POLICY-2026-11-24',
    'internal_synthetic'
  );

  it('resolves with 30-day trial and 30-day adjustment cap, rest as 09-29', () => {
    expect(POLICY_1124.milestones).toEqual({
      trialCalendarDays: 30,
      maxAdjustmentDays: 30,
      formalOperationCalendarMonths: 1
    });
    expect(POLICY_1124.maintenanceStart).toBe('formal_launch_date');
    expect(POLICY.maintenanceStart).toBe('day_after_final_payment');
    expect(POLICY_1124.lateEventCutoffDays).toBe(5);
    expect(POLICY_1124.maintenanceFeesTwd).toEqual({
      normal: 1800,
      unused: 500
    });
    expect(POLICY_1124.export).toEqual(POLICY.export);
    expect(POLICY_1124.retention).toEqual(POLICY.retention);
    expect(POLICY_1124.termination).toEqual(POLICY.termination);
    expect(() =>
      resolveApprovedBusinessDeliveryPolicy(
        'BD-POLICY-2026-11-24',
        'production'
      )
    ).toThrow(DomainError);
  });

  it('starts maintenance on the launch date without a final payment', () => {
    const acknowledgements = {
      formalLaunch: { launchDate: '2030-10-15' }
    };
    expect(
      evaluateBusinessMilestones({
        policy: POLICY_1124,
        now: '2030-10-14T15:59:59.999Z',
        acknowledgements
      }).maintenance
    ).toEqual({ status: 'scheduled', startDate: '2030-10-15' });
    const active = evaluateBusinessMilestones({
      policy: POLICY_1124,
      now: '2030-10-14T16:00:00.000Z',
      acknowledgements
    });
    expect(active.maintenance).toEqual({
      status: 'active',
      startDate: '2030-10-15'
    });
    expect(active.finalPayment).toEqual({ status: 'blocked' });
  });

  it('keeps the launch start after the final payment is acknowledged', () => {
    const status = evaluateBusinessMilestones({
      policy: POLICY_1124,
      now: '2030-11-20T16:00:00.000Z',
      acknowledgements: {
        formalLaunch: { launchDate: '2030-10-15' },
        finalPayment: { acknowledgedAt: '2030-11-20T15:30:00.000Z' }
      }
    });
    expect(status.maintenance).toEqual({
      status: 'active',
      startDate: '2030-10-15'
    });
  });

  it('09-29 still starts maintenance the day after payment', () => {
    expect(
      evaluateBusinessMilestones({
        policy: POLICY,
        now: '2030-11-25T00:00:00.000Z',
        acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } }
      }).maintenance
    ).toEqual({ status: 'not_started' });
  });

  it('rejects an adjustment above 30 days and accepts 30', () => {
    const input = {
      firstEligibleUse: {
        occurredAt: '2030-10-01T02:00:00.000Z',
        actorKind: 'real_staff' as const
      },
      policy: POLICY_1124.milestones
    };
    expect(() =>
      calculateBusinessDeliveryMilestones({ ...input, adjustmentDays: 31 })
    ).toThrow(DomainError);
    expect(
      calculateBusinessDeliveryMilestones({ ...input, adjustmentDays: 30 })
        .adjustmentDays
    ).toBe(30);
  });
});
