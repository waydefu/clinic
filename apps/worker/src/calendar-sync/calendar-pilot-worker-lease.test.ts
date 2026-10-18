import { describe, expect, it } from 'vitest';

import {
  assertCalendarPilotWorkerLease,
  CalendarPilotLeaseLostError
} from './calendar-pilot-worker-lease.js';

const NOW = '2026-09-01T00:00:00.000Z';
const DEADLINE = '2026-09-01T00:04:00.000Z';
const configuration = {
  version: 1,
  expiresAt: '2026-09-02T00:00:00.000Z',
  inboundEnabled: true,
  outboundEnabled: true,
  workerLeaseOwner: 'worker',
  workerLeaseExpiresAt: DEADLINE
};
const lease = { owner: 'worker', generation: 1, now: () => NOW };
const job = {
  status: 'processing',
  leaseOwner: 'worker',
  leaseExpiresAt: DEADLINE
};

describe('CAL-PILOT live worker lease fence', () => {
  it('returns the fresh clock value without renewing or mutating state', () => {
    let clock = NOW;
    const current = { ...lease, now: () => clock };
    expect(assertCalendarPilotWorkerLease(configuration, current, job)).toBe(
      NOW
    );
    clock = '2026-09-01T00:00:01.000Z';
    expect(assertCalendarPilotWorkerLease(configuration, current, job)).toBe(
      clock
    );
    clock = DEADLINE;
    expect(() =>
      assertCalendarPilotWorkerLease(configuration, current, job)
    ).toThrow(CalendarPilotLeaseLostError);
    expect(configuration.workerLeaseExpiresAt).toBe(DEADLINE);
    expect(job.leaseExpiresAt).toBe(DEADLINE);
  });

  it('preserves source generation zero allowed by the current contract', () => {
    expect(
      assertCalendarPilotWorkerLease(
        { ...configuration, version: 0 },
        { ...lease, generation: 0 },
        job
      )
    ).toBe(NOW);
  });

  it('allows an inbound context without an outbox job', () => {
    expect(assertCalendarPilotWorkerLease(configuration, lease)).toBe(NOW);
  });

  it.each([
    { expiresAt: NOW },
    { expiresAt: 'invalid' },
    { expiresAt: undefined },
    { workerLeaseExpiresAt: NOW },
    { workerLeaseExpiresAt: 'invalid' },
    { workerLeaseExpiresAt: null },
    { workerLeaseOwner: 'successor' },
    { workerLeaseOwner: undefined },
    { inboundEnabled: false },
    { outboundEnabled: false },
    { outboundEnabled: 'true' },
    { version: 2 }
  ])('rejects invalid configuration or current ownership: %j', (change) => {
    expect(() =>
      assertCalendarPilotWorkerLease(
        { ...configuration, ...change },
        lease,
        job
      )
    ).toThrow(CalendarPilotLeaseLostError);
  });

  it.each([
    { now: () => 'invalid' },
    { now: () => '2026-09-02T00:00:00.000Z' },
    { owner: '' },
    { owner: '   ' },
    { generation: -1 },
    { generation: 1.5 },
    { generation: Number.NaN }
  ])('rejects invalid clock or run identity: %j', (change) => {
    expect(() =>
      assertCalendarPilotWorkerLease(
        configuration,
        { ...lease, ...change },
        job
      )
    ).toThrow(CalendarPilotLeaseLostError);
  });

  it.each([
    { status: 'completed' },
    { status: 'pending' },
    { leaseOwner: 'successor' },
    { leaseOwner: null },
    { leaseExpiresAt: NOW },
    { leaseExpiresAt: undefined },
    { leaseExpiresAt: 'invalid' }
  ])(
    'rejects a stale current job without relying on the global owner alone: %j',
    (change) => {
      expect(() =>
        assertCalendarPilotWorkerLease(configuration, lease, {
          ...job,
          ...change
        })
      ).toThrow(CalendarPilotLeaseLostError);
    }
  );
});
