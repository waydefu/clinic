import { describe, expect, it } from 'vitest';

import * as browser from '../apps/web/public/vendor/domain/index.js';
import * as domain from '../packages/domain/src/index.ts';
import { resolveFollowUpReminderProjection } from '../apps/worker/src/outbox-processor.ts';
import {
  assertCalendarPilotWorkerLease,
  CalendarPilotLeaseLostError
} from '../apps/worker/src/calendar-sync/calendar-pilot-worker-lease.ts';
import {
  evaluateRequiredCloudConfig,
  loadC1ConfigContract
} from './c1-config-contract.mjs';

const validTimes = [
  '2030-01-01T01:00:00Z',
  '2030-01-01T01:00:00.000Z',
  '2030-01-01T01:00:00.1Z',
  '2030-01-01T01:00:00.123456Z'
];
const invalidTimes = [
  'Jul 25 2030 Z',
  '2030-01-01 01:00:00Z',
  '2030-01-01',
  '2030-01-01T01:00:00',
  '2030-01-01T01:00:00+00:00',
  '2030-01-01T01:00:00+08:00',
  '2030-02-30T01:00:00Z',
  '2030-01-01T24:00:00Z'
];
// Keep the window open even for legacy Date.parse values, so denial tests the
// timestamp boundary rather than an unrelated cancellation/lead-time cutoff.
const laterAppointment = '2040-01-02T04:00:00.000Z';

for (const [name, rules] of [
  ['domain', domain],
  ['browser', browser]
]) {
  describe(`${name} UTC caller boundaries`, () => {
    const auditInput = {
      eventId: 'synthetic_utc_event',
      action: 'appointment_confirmed',
      resourceType: 'appointment',
      resourceId: 'synthetic_utc_appointment',
      before: null,
      after: { status: 'confirmed', slotId: 'synthetic_utc_slot' },
      context: {
        actorId: 'synthetic_utc_actor',
        actorRole: rules.ROLES[0],
        correlationId: 'synthetic_utc_correlation',
        source: 'system',
        reasonCode: null,
        policyVersion: null
      }
    };

    it.each(validTimes)('preserves legal caller input %s', (value) => {
      expect(
        rules.planAuditEvent({ ...auditInput, occurredAt: value })
      ).toMatchObject({
        occurredAt: value,
        schemaVersion: rules.AUDIT_SCHEMA_VERSION
      });
      expect(rules.isUtcIsoTimestamp(rules.selfCancelCutoffAt(value))).toBe(
        true
      );
      expect(() =>
        rules.assertWithinSelfCancelWindow(laterAppointment, value)
      ).not.toThrow();
      expect(() =>
        rules.assertWithinSelfRescheduleWindow(laterAppointment, value)
      ).not.toThrow();
      expect(() =>
        rules.assertSlotMeetsEarliestLead(laterAppointment, value)
      ).not.toThrow();
    });

    it.each(invalidTimes)(
      'denies invalid input at the real callers: %s',
      (value) => {
        expect(() =>
          rules.planAuditEvent({ ...auditInput, occurredAt: value })
        ).toThrow(rules.DomainError);
        expect(() => rules.selfCancelCutoffAt(value)).toThrow(
          rules.DomainError
        );
        expect(() =>
          rules.assertWithinSelfCancelWindow(laterAppointment, value)
        ).toThrow(rules.DomainError);
        expect(() =>
          rules.assertWithinSelfCancelWindow(value, validTimes[0])
        ).toThrow(rules.DomainError);
        expect(() =>
          rules.assertWithinSelfRescheduleWindow(laterAppointment, value)
        ).toThrow(rules.DomainError);
        expect(() =>
          rules.assertWithinSelfRescheduleWindow(value, validTimes[0])
        ).toThrow(rules.DomainError);
        expect(() =>
          rules.assertSlotMeetsEarliestLead(laterAppointment, value)
        ).toThrow(rules.DomainError);
        expect(() =>
          rules.assertSlotMeetsEarliestLead(value, validTimes[0])
        ).toThrow(rules.DomainError);
      }
    );
  });
}

describe('worker stored follow-up UTC boundary', () => {
  it.each(validTimes)('preserves a legal stored dueAt: %s', (value) => {
    expect(
      resolveFollowUpReminderProjection({ decision: 'required', dueAt: value })
    ).toEqual({
      projectionStatus: 'follow_up_required',
      startsAt: value
    });
  });

  it.each(invalidTimes)('does not project an invalid dueAt: %s', (value) => {
    expect(() =>
      resolveFollowUpReminderProjection({ decision: 'required', dueAt: value })
    ).toThrow();
  });
});

describe('worker lease UTC admission', () => {
  // Isolate format admission from expiry: no real lease is created or renewed.
  const early = '2026-01-01T00:00:00.000Z';
  const configuration = {
    version: 1,
    expiresAt: laterAppointment,
    inboundEnabled: true,
    outboundEnabled: true,
    workerLeaseOwner: 'synthetic_utc_worker',
    workerLeaseExpiresAt: laterAppointment
  };
  const lease = {
    owner: 'synthetic_utc_worker',
    generation: 1,
    now: () => early
  };
  const job = {
    status: 'processing',
    leaseOwner: lease.owner,
    leaseExpiresAt: laterAppointment
  };

  it.each(validTimes)(
    'accepts legal precision at all four fields: %s',
    (value) => {
      expect(
        assertCalendarPilotWorkerLease(
          configuration,
          { ...lease, now: () => value },
          job
        )
      ).toBe(value);
      expect(
        assertCalendarPilotWorkerLease(
          { ...configuration, expiresAt: value },
          lease,
          job
        )
      ).toBe(early);
      expect(
        assertCalendarPilotWorkerLease(
          { ...configuration, workerLeaseExpiresAt: value },
          lease,
          job
        )
      ).toBe(early);
      expect(
        assertCalendarPilotWorkerLease(configuration, lease, {
          ...job,
          leaseExpiresAt: value
        })
      ).toBe(early);
    }
  );

  it.each(invalidTimes)(
    'denies legacy values at all four fields: %s',
    (value) => {
      expect(() =>
        assertCalendarPilotWorkerLease(
          configuration,
          { ...lease, now: () => value },
          job
        )
      ).toThrow(CalendarPilotLeaseLostError);
      expect(() =>
        assertCalendarPilotWorkerLease(
          { ...configuration, expiresAt: value },
          lease,
          job
        )
      ).toThrow(CalendarPilotLeaseLostError);
      expect(() =>
        assertCalendarPilotWorkerLease(
          { ...configuration, workerLeaseExpiresAt: value },
          lease,
          job
        )
      ).toThrow(CalendarPilotLeaseLostError);
      expect(() =>
        assertCalendarPilotWorkerLease(configuration, lease, {
          ...job,
          leaseExpiresAt: value
        })
      ).toThrow(CalendarPilotLeaseLostError);
      expect(configuration.workerLeaseExpiresAt).toBe(laterAppointment);
      expect(job.leaseExpiresAt).toBe(laterAppointment);
    }
  );
});

const contract = loadC1ConfigContract();
const utcFields = contract.entries.filter(
  (entry) =>
    entry.cloudRequired === true &&
    entry.class !== 'FORBIDDEN_TO_STORE_IN_REPO' &&
    entry.validation === 'UTC_ISO_8601_OR_EMPTY'
);

it('has real declared C1 UTC consumers, not an empty matrix', () => {
  expect(utcFields.length).toBeGreaterThan(0);
});

for (const entry of utcFields) {
  for (const surface of entry.requiredFor) {
    describe(`C1 ${surface} ${entry.name}`, () => {
      const envFor = (value) => ({
        ...entry.requiredWhen,
        [entry.name]: value
      });
      it.each(validTimes)('accepts legal UTC metadata: %s', (value) => {
        const { missing } = evaluateRequiredCloudConfig(
          envFor(value),
          surface,
          contract
        );
        expect(missing).not.toContain(entry.name);
        expect(missing).not.toContain(`${entry.name}_INVALID`);
      });
      it.each(invalidTimes)('rejects invalid UTC metadata: %s', (value) => {
        expect(
          evaluateRequiredCloudConfig(envFor(value), surface, contract).missing
        ).toContain(`${entry.name}_INVALID`);
      });
      it('preserves the existing raw-business versus trimmed-config boundary', () => {
        const { missing } = evaluateRequiredCloudConfig(
          envFor(` ${validTimes[0]} `),
          surface,
          contract
        );
        expect(missing.includes(`${entry.name}_INVALID`)).toBe(
          entry.name.startsWith('BUSINESS_DELIVERY_')
        );
      });
    });
  }
}
