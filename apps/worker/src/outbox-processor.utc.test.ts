import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { clinicEventEnd } from './calendar-port.js';
import { OutboxProcessor } from './outbox-processor.js';

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
