import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { calendarEventIdForAppointment } from '@beauessence/domain';
import { describe, expect, it, vi } from 'vitest';

import { clinicEventEnd } from './calendar-port.js';
import {
  APPOINTMENTS_COLLECTION,
  OUTBOX_COLLECTION,
  OutboxProcessor
} from './outbox-processor.js';

function setup() {
  const query = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(() => Promise.resolve({ docs: [] }))
  };
  const collection = vi.fn(() => query);
  const runTransaction = vi.fn(() => Promise.resolve(false));
  const calendar = {
    project: vi.fn(() => Promise.resolve()),
    ready: vi.fn(() => Promise.resolve())
  };
  const processor = new OutboxProcessor(
    { collection, runTransaction } as unknown as Firestore,
    calendar
  );
  return { processor, collection, runTransaction, calendar };
}

const LEASE_NOW = '2028-02-29T00:00:00Z';

function setupStoredLease(
  leaseExpiresAt: string | undefined,
  status: 'pending' | 'in_progress' = 'in_progress'
) {
  const stored: Record<string, unknown> = {
    appointmentId: 'synthetic-appointment',
    correlationId: 'corr_synthetic_lease',
    causationId: 'audit_synthetic_lease',
    idempotencyKey: calendarEventIdForAppointment('synthetic-appointment'),
    type: 'calendar_projection_requested',
    status,
    attempts: 0,
    nextAttemptAt: LEASE_NOW,
    ...(leaseExpiresAt === undefined ? {} : { leaseExpiresAt })
  };
  const snapshot = {
    id: 'synthetic-job-lease',
    exists: true,
    data: () => ({ ...stored })
  };
  const update = vi.fn(
    (_reference: unknown, patch: Record<string, unknown>) => {
      Object.assign(stored, patch);
    }
  );
  const transaction = { get: vi.fn(() => Promise.resolve(snapshot)), update };
  // Deliberately supply candidates to test the transaction recheck, not query semantics.
  const query = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(() => Promise.resolve({ docs: [snapshot] })),
    doc: (id: string) => ({ id })
  };
  const collection = vi.fn((name: string) => {
    if (name === OUTBOX_COLLECTION) return query;
    if (name === APPOINTMENTS_COLLECTION)
      return {
        doc: () => ({
          get: () =>
            Promise.resolve({
              exists: true,
              data: () => ({
                status: 'confirmed',
                startsAt: LEASE_NOW,
                bookingKind: 'initial'
              })
            })
        })
      };
    throw new Error('Unexpected collection in synthetic lease fixture.');
  });
  const runTransaction = vi.fn(
    async (run: (tx: Transaction) => Promise<unknown>) =>
      run(transaction as unknown as Transaction)
  );
  const calendar = {
    project: vi.fn(async () => {}),
    ready: vi.fn(async () => {})
  };
  const processor = new OutboxProcessor(
    { collection, runTransaction } as unknown as Firestore,
    calendar,
    undefined,
    undefined,
    () => 0,
    'synthetic-worker'
  );
  return { processor, stored, update, calendar, collection };
}

describe('stored outbox lease UTC admission with synthetic transaction recheck', () => {
  it.each([
    '2026-02-30T00:00:00Z',
    '2026-02-28T24:00:00Z',
    '2026-02-28T00:00:00',
    '2026-02-28T08:00:00+08:00',
    'Feb 28 2026 GMT',
    'unreadable'
  ])(
    'does not claim an active lease with noncanonical expiry %s',
    async (expiry) => {
      const { processor, stored, update, calendar, collection } =
        setupStoredLease(expiry);
      await expect(processor.processDue(LEASE_NOW, 1)).resolves.toEqual({
        claimed: 0,
        completed: 0,
        retried: 0,
        deadLettered: 0
      });
      expect(update).not.toHaveBeenCalled();
      expect(collection).not.toHaveBeenCalledWith(APPOINTMENTS_COLLECTION);
      expect(calendar.project).not.toHaveBeenCalled();
      expect(stored['leaseExpiresAt']).toBe(expiry);
    }
  );

  it('leaves a valid future lease owned without updating or projecting', async () => {
    const { processor, update, calendar } = setupStoredLease(
      '2028-03-01T00:00:00Z'
    );
    expect((await processor.processDue(LEASE_NOW, 1)).claimed).toBe(0);
    expect(update).not.toHaveBeenCalled();
    expect(calendar.project).not.toHaveBeenCalled();
  });

  it.each(['2028-02-28T00:00:00.123456789Z', undefined])(
    'preserves expiry/missing-lease recheck admission: %s',
    async (expiry) => {
      const { processor, update, calendar } = setupStoredLease(expiry);
      await expect(processor.processDue(LEASE_NOW, 1)).resolves.toEqual({
        claimed: 1,
        completed: 1,
        retried: 0,
        deadLettered: 0
      });
      expect(update).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({
          status: 'in_progress',
          leaseOwner: 'synthetic-worker',
          generation: 1,
          leaseExpiresAt: expect.stringMatching(/Z$/u)
        })
      );
      expect(calendar.project).toHaveBeenCalledOnce();
    }
  );

  it('does not apply an irrelevant stale lease string to pending work', async () => {
    const { processor, calendar } = setupStoredLease(
      '2026-02-30T00:00:00Z',
      'pending'
    );
    expect((await processor.processDue(LEASE_NOW, 1)).completed).toBe(1);
    expect(calendar.project).toHaveBeenCalledOnce();
  });
});

describe('outbox UTC admission with memory-only store and calendar', () => {
  it.each([
    '2026-02-30T00:00:00Z',
    '2026-02-29T00:00:00Z',
    '2026-02-28T24:00:00Z',
    '2026-02-28T00:00:00',
    '2026-02-28T08:00:00+08:00',
    'Feb 28 2026 GMT'
  ])('rejects clock/start %s before store or Calendar calls', async (now) => {
    const { processor, collection, runTransaction, calendar } = setup();
    await expect(processor.processDue(now)).rejects.toThrow(/UTC/iu);
    await expect(
      processor.requeue('synthetic-job', 'synthetic-operator', now)
    ).rejects.toThrow(/UTC/iu);
    expect(() => clinicEventEnd(now)).toThrow(/UTC/iu);
    expect(collection).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(calendar.project).not.toHaveBeenCalled();
    expect(calendar.ready).not.toHaveBeenCalled();
  });

  it.each(['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.123456Z'])(
    'accepts real leap-day UTC %s',
    async (now) => {
      const { processor, collection, runTransaction, calendar } = setup();
      await expect(processor.processDue(now)).resolves.toEqual({
        claimed: 0,
        completed: 0,
        retried: 0,
        deadLettered: 0
      });
      await expect(
        processor.requeue('synthetic-job', 'synthetic-operator', now)
      ).resolves.toBe(false);
      expect(clinicEventEnd(now)).toBe(
        new Date(Date.parse(now) + 60 * 60_000).toISOString()
      );
      expect(collection).toHaveBeenCalled();
      expect(runTransaction).toHaveBeenCalledOnce();
      expect(calendar.project).not.toHaveBeenCalled();
    }
  );
});
