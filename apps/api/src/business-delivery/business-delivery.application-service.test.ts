import { NotFoundException } from '@nestjs/common';
import {
  ROLES,
  resolveApprovedBusinessDeliveryPolicy,
  type BusinessReportEvent
} from '@beauessence/domain';
import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import type {
  AcknowledgeMilestoneCommand,
  MilestoneState
} from '../firestore/business-delivery.repository.js';
import { CANDIDATE_ROLE_PERMISSIONS } from '../platform/authorization/rbac.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../platform/errors/api-error.js';
import { BusinessDeliveryApplicationService } from './business-delivery.application-service.js';
import type { BusinessDeliveryConfig } from './business-delivery.config.js';
import { actorRefForUid } from './usage-events.js';

const POLICY = resolveApprovedBusinessDeliveryPolicy(
  'BD-POLICY-2026-09-29',
  'internal_synthetic'
);
const ENABLED: BusinessDeliveryConfig = {
  enabled: true,
  policy: POLICY,
  scope: 'internal_synthetic',
  observedSince: '2030-09-01T00:00:00.000Z'
};

// Roles come from the single source; the permission table decides who may act.
const readers = ROLES.filter((role) =>
  CANDIDATE_ROLE_PERMISSIONS[role].includes('read_business_delivery')
);
const acknowledgers = ROLES.filter((role) =>
  CANDIDATE_ROLE_PERMISSIONS[role].includes('acknowledge_business_milestone')
);
const OWNER_ROLE = readers[0]!;

function staff(actorRole: string): AuthenticationContext {
  return { actorId: 'staff_uid_01', actorRole };
}

function fakeRepository(
  options: {
    readonly events?: BusinessReportEvent[];
    readonly state?: MilestoneState;
  } = {}
) {
  const ranges: Array<[string, string]> = [];
  const acknowledged: AcknowledgeMilestoneCommand[] = [];
  return {
    ranges,
    acknowledged,
    repository: {
      usageEventsBetween(startAt: string, endAt: string) {
        ranges.push([startAt, endAt]);
        return Promise.resolve(options.events ?? []);
      },
      milestoneState() {
        return Promise.resolve(
          options.state ?? { revision: 0, acknowledgements: {} }
        );
      },
      acknowledge(command: AcknowledgeMilestoneCommand) {
        acknowledged.push(command);
        return Promise.resolve({ revision: 1, replayed: false });
      }
    }
  };
}

function service(
  now: string,
  repository = fakeRepository().repository,
  reauthentication: { assertFresh: () => Promise<void> } = {
    assertFresh: () => Promise.resolve()
  },
  config: BusinessDeliveryConfig = ENABLED
) {
  return new BusinessDeliveryApplicationService(
    config,
    repository,
    reauthentication,
    () => now
  );
}

const staffLogin = (eventId: string, occurredAt: string, actorId: string) => ({
  eventId,
  occurredAt,
  kind: 'staff_login' as const,
  eventClass: 'runtime' as const,
  actorId
});

describe('BusinessDeliveryApplicationService permissions', () => {
  it('grants both actions to exactly one role', () => {
    expect(readers).toHaveLength(1);
    expect(acknowledgers).toEqual(readers);
  });

  it.each(ROLES.filter((role) => !readers.includes(role)))(
    'denies the %s role every route',
    async (role) => {
      const instance = service('2030-11-10T00:00:00.000Z');
      await expect(
        instance.monthlyUsage({ month: '2030-10' }, staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
      await expect(instance.milestones(staff(role))).rejects.toBeInstanceOf(
        AuthorizationDeniedError
      );
      await expect(
        instance.acknowledge('formal_launch', {}, 'token', staff(role))
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    }
  );

  it('denies an unknown or legacy-alias role instead of mapping it', async () => {
    const instance = service('2030-11-10T00:00:00.000Z');
    for (const role of ['admin', '', 'Manager']) {
      await expect(instance.milestones(staff(role))).rejects.toBeInstanceOf(
        AuthorizationDeniedError
      );
    }
  });

  it('answers 404 before authorization when the feature is off', async () => {
    const instance = service(
      '2030-11-10T00:00:00.000Z',
      fakeRepository().repository,
      undefined,
      { enabled: false }
    );
    await expect(
      instance.monthlyUsage({ month: '2030-10' }, staff('someone'))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(instance.milestones(staff(OWNER_ROLE))).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

describe('monthlyUsage', () => {
  it('queries the Taipei month and reports a complete used month at NT$1,800', async () => {
    const fake = fakeRepository({
      events: [
        staffLogin('e1', '2030-10-02T01:00:00.000Z', 'a1'),
        staffLogin('e2', '2030-10-03T01:00:00.000Z', 'a1'),
        {
          eventId: 'e3',
          occurredAt: '2030-10-04T01:00:00.000Z',
          kind: 'booking_created',
          eventClass: 'runtime'
        }
      ]
    });
    const report = await service(
      '2030-11-05T16:00:00.000Z',
      fake.repository
    ).monthlyUsage({ month: '2030-10' }, staff(OWNER_ROLE));
    expect(fake.ranges).toEqual([
      ['2030-09-30T16:00:00.000Z', '2030-10-31T16:00:00.000Z']
    ]);
    expect(report).toEqual({
      policyVersion: 'BD-POLICY-2026-09-29',
      scope: 'internal_synthetic',
      month: '2030-10',
      timeZone: 'Asia/Taipei',
      completeness: 'complete',
      lockedAt: '2030-11-05T16:00:00.000Z',
      uniqueStaffUsers: 1,
      bookingCreatedCount: 1,
      usageClassification: 'used',
      maintenanceFeeTwd: 1800
    });
  });

  it('reports a complete empty month as unused at NT$500', async () => {
    const report = await service('2030-12-01T00:00:00.000Z').monthlyUsage(
      { month: '2030-10' },
      staff(OWNER_ROLE)
    );
    expect(report.usageClassification).toBe('unused');
    expect(report.maintenanceFeeTwd).toBe(500);
  });

  it('never turns an unlocked month into unused, even with no events', async () => {
    const report = await service('2030-11-05T15:59:59.999Z').monthlyUsage(
      { month: '2030-10' },
      staff(OWNER_ROLE)
    );
    expect(report.completeness).toBe('partial');
    expect(report.usageClassification).toBe('insufficient_evidence');
    expect(report.maintenanceFeeTwd).toBeNull();
  });

  it('marks a month before observation began as unknown', async () => {
    const report = await service('2031-01-01T00:00:00.000Z').monthlyUsage(
      { month: '2030-08' },
      staff(OWNER_ROLE)
    );
    expect(report.completeness).toBe('unknown');
    expect(report.maintenanceFeeTwd).toBeNull();
  });

  it('excludes maintenance logins from usage', async () => {
    const fake = fakeRepository({
      events: [
        {
          ...staffLogin('e1', '2030-10-02T01:00:00.000Z', 'a1'),
          eventClass: 'maintenance'
        }
      ]
    });
    const report = await service(
      '2030-12-01T00:00:00.000Z',
      fake.repository
    ).monthlyUsage({ month: '2030-10' }, staff(OWNER_ROLE));
    expect(report.uniqueStaffUsers).toBe(0);
    expect(report.usageClassification).toBe('unused');
  });

  it('rejects an invalid or extra query field', async () => {
    const instance = service('2030-12-01T00:00:00.000Z');
    await expect(
      instance.monthlyUsage({ month: '2030-13' }, staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      instance.monthlyUsage(
        { month: '2030-10', scope: 'production' },
        staff(OWNER_ROLE)
      )
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe('milestones', () => {
  it('returns the server-evaluated view with the stored revision', async () => {
    const fake = fakeRepository({
      state: {
        revision: 1,
        firstEligibleUseAt: '2030-10-01T01:00:00.000Z',
        acknowledgements: { formalLaunch: { launchDate: '2030-10-15' } }
      }
    });
    const view = await service(
      '2030-11-20T00:00:00.000Z',
      fake.repository
    ).milestones(staff(OWNER_ROLE));
    expect(view).toEqual({
      policyVersion: 'BD-POLICY-2026-09-29',
      scope: 'internal_synthetic',
      revision: 1,
      trial: {
        status: 'ended',
        startDate: '2030-10-01',
        endExclusiveDate: '2030-10-21'
      },
      formalLaunch: { status: 'acknowledged', launchDate: '2030-10-15' },
      formalOperation: { status: 'reached', checkpointDate: '2030-11-15' },
      finalPayment: { status: 'awaiting_acknowledgement' },
      maintenance: { status: 'not_started' }
    });
  });
});

describe('acknowledge', () => {
  const body = {
    idempotencyKey: 'ack-key-0000000001',
    expectedVersion: 0,
    evidenceRef: 'evidence_ref_01',
    launchDate: '2030-10-15'
  };

  it('passes server-derived actor and time, never client values', async () => {
    const fake = fakeRepository();
    const result = await service(
      '2030-10-20T00:00:00.000Z',
      fake.repository
    ).acknowledge('formal_launch', body, 'fresh', staff(OWNER_ROLE));
    expect(result).toEqual({
      milestoneId: 'formal_launch',
      revision: 1,
      replayed: false
    });
    expect(fake.acknowledged).toEqual([
      {
        milestoneId: 'formal_launch',
        idempotencyKey: 'ack-key-0000000001',
        expectedVersion: 0,
        evidenceRef: 'evidence_ref_01',
        launchDate: '2030-10-15',
        actorRef: actorRefForUid('staff_uid_01'),
        now: '2030-10-20T00:00:00.000Z',
        policy: POLICY
      }
    ]);
  });

  it('requires fresh re-authentication before writing anything', async () => {
    const fake = fakeRepository();
    const instance = service('2030-10-20T00:00:00.000Z', fake.repository, {
      assertFresh: () => Promise.reject(new AuthenticationRequiredError())
    });
    await expect(
      instance.acknowledge('formal_launch', body, undefined, staff(OWNER_ROLE))
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(fake.acknowledged).toEqual([]);
  });

  it('answers 404 for an unknown milestone', async () => {
    await expect(
      service('2030-10-20T00:00:00.000Z').acknowledge(
        'trial',
        body,
        'fresh',
        staff(OWNER_ROLE)
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects client-supplied actor or time fields', async () => {
    await expect(
      service('2030-10-20T00:00:00.000Z').acknowledge(
        'formal_launch',
        { ...body, acknowledgedAt: '2030-01-01T00:00:00.000Z' },
        'fresh',
        staff(OWNER_ROLE)
      )
    ).rejects.toBeInstanceOf(ZodError);
  });
});
