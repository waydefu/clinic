import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import {
  createInternalTestOutboxRuntime,
  readOutboxQueueSnapshot
} from './internal-test-outbox-runtime.js';

const INVALID_UTC = [
  '2026-02-30T00:00:00Z',
  '2026-01-01T24:00:00Z',
  '2026-01-01T00:00:00',
  '2026-01-01T08:00:00+08:00',
  'Jan 1 2026 GMT'
];
const VALID_UTC = ['2028-02-29T01:00:00Z', '2028-02-29T01:00:00.123456789Z'];

// These are query-result doubles, not Firestore query or transaction semantics.
function fakeStore(nextAttemptAt?: string) {
  const docs =
    nextAttemptAt === undefined ? [] : [{ data: () => ({ nextAttemptAt }) }];
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: () =>
      Promise.resolve({ size: docs.length, empty: docs.length === 0, docs })
  };
  const collection = vi.fn(() => query);
  return { db: { collection } as unknown as Firestore, collection };
}

describe('readOutboxQueueSnapshot UTC admission', () => {
  it.each(INVALID_UTC)(
    'rejects clock %s before reading a collection',
    async (now) => {
      const { db, collection } = fakeStore();
      await expect(readOutboxQueueSnapshot(db, now)).rejects.toThrow(/UTC/);
      expect(collection).not.toHaveBeenCalled();
    }
  );

  it.each(VALID_UTC)(
    'accepts leap-day clock %s with an empty queue',
    async (now) => {
      const { db } = fakeStore();
      await expect(readOutboxQueueSnapshot(db, now)).resolves.toEqual({
        pending: 0,
        inProgress: 0,
        deadLettered: 0,
        oldestPendingAgeSeconds: 0
      });
    }
  );

  it.each(INVALID_UTC)(
    'keeps unreadable-age fallback for selected field %s',
    async (oldest) => {
      const { db } = fakeStore(oldest);
      await expect(
        readOutboxQueueSnapshot(db, VALID_UTC[1]!)
      ).resolves.toMatchObject({
        oldestPendingAgeSeconds: 0
      });
    }
  );

  it('derives age from a valid fractional UTC field', async () => {
    const { db } = fakeStore('2028-02-29T00:59:00.123456789Z');
    await expect(
      readOutboxQueueSnapshot(db, VALID_UTC[1]!)
    ).resolves.toMatchObject({
      oldestPendingAgeSeconds: 60
    });
  });

  it('keeps a valid future UTC field clamped to zero', async () => {
    const { db } = fakeStore('2028-02-29T01:00:01.123456789Z');
    await expect(
      readOutboxQueueSnapshot(db, VALID_UTC[1]!)
    ).resolves.toMatchObject({
      oldestPendingAgeSeconds: 0
    });
  });

  it('retains the existing fallback for an unparsable stored field', async () => {
    const { db } = fakeStore('not-a-date');
    await expect(
      readOutboxQueueSnapshot(db, VALID_UTC[1]!)
    ).resolves.toMatchObject({
      oldestPendingAgeSeconds: 0
    });
  });
});

describe.each(['inspect', 'run'] as const)(
  'internal outbox %s UTC admission',
  (method) => {
    it.each(INVALID_UTC)(
      'rejects explicit clock %s before collection access or drain',
      async (now) => {
        const { db, collection } = fakeStore();
        const runtime = createInternalTestOutboxRuntime({ db });
        await expect(runtime[method](now)).rejects.toThrow(/UTC/);
        expect(collection).not.toHaveBeenCalled();
      }
    );

    it.each(INVALID_UTC)(
      'rejects injected clock %s before collection access or drain',
      async (now) => {
        const { db, collection } = fakeStore();
        const runtime = createInternalTestOutboxRuntime({
          db,
          clock: () => now
        });
        await expect(runtime[method]()).rejects.toThrow(/UTC/);
        expect(collection).not.toHaveBeenCalled();
      }
    );

    it.each(VALID_UTC)(
      'accepts injected leap-day clock %s with an empty queue',
      async (now) => {
        const { db } = fakeStore();
        const runtime = createInternalTestOutboxRuntime({
          db,
          clock: () => now
        });
        await expect(runtime[method]()).resolves.toMatchObject({
          snapshot: {
            pending: 0,
            inProgress: 0,
            deadLettered: 0,
            oldestPendingAgeSeconds: 0
          }
        });
      }
    );
  }
);
