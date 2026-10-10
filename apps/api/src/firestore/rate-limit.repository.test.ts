import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_POLICIES } from '@beauessence/domain';
import { FirestoreDurableRateLimitStore } from './rate-limit.repository.js';

// Serial transaction seam with rollback and read-before-write checks. This is
// deterministic contention evidence, not a Firestore emulator/provider test.
function database() {
  const rows = new Map<string, Record<string, unknown>>();
  let queue = Promise.resolve();
  const db = {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction: <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const result = queue.then(async () => {
        const pending = new Map<string, Record<string, unknown>>();
        const value = await work({
          get: async (ref: { id: string }) => {
            if (pending.size > 0)
              return Promise.reject(new Error('read_after_write'));
            return Promise.resolve({
              exists: rows.has(ref.id),
              data: () => rows.get(ref.id)
            });
          },
          set: (ref: { id: string }, data: Record<string, unknown>) => {
            pending.set(ref.id, data);
          }
        });
        for (const [id, row] of pending) rows.set(id, row);
        return value;
      });
      queue = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    }
  };
  return { rows, db, store: new FirestoreDurableRateLimitStore(db as never) };
}
const policy = RATE_LIMIT_POLICIES.lookup_or_auth_failure;
const NOW = 1_790_812_800_000;
const legacy = (key: string) =>
  key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
const hashed = (key: string) =>
  `v2.${createHash('sha256').update(key).digest('hex')}`;

describe('durable full-key quota and conservative legacy cutover', () => {
  it.each([
    ['opaque:a', 'opaque/a'],
    [`opaque_${'a'.repeat(160)}_x`, `opaque_${'a'.repeat(160)}_y`]
  ])('keeps distinct full keys independent: %s', async (a, b) => {
    const { store, rows } = database();
    for (let n = 0; n < policy.limit; n++) {
      expect((await store.consume(a, policy, NOW)).allowed).toBe(true);
    }
    expect((await store.consume(a, policy, NOW)).allowed).toBe(false);
    expect((await store.consume(b, policy, NOW)).allowed).toBe(true);
    expect(rows.has(hashed(a))).toBe(true);
    expect(rows.has(hashed(b))).toBe(true);
  });

  it('preserves active legacy counters, locks, restart and natural expiry', async () => {
    const { store, rows, db } = database();
    const key = 'opaque:legacy';
    const old = {
      count: policy.limit - 1,
      windowStartMs: NOW,
      lockedUntilMs: null
    };
    rows.set(legacy(key), old);
    expect((await store.consume(key, policy, NOW)).allowed).toBe(true);
    const restarted = new FirestoreDurableRateLimitStore(db as never);
    expect((await restarted.consume(key, policy, NOW + 1)).allowed).toBe(false);
    expect(rows.get(legacy(key))).toEqual(old);
    expect(
      (
        await restarted.consume(
          key,
          policy,
          NOW + policy.windowMs + policy.lockMs
        )
      ).allowed
    ).toBe(true);
    const lockedKey = 'opaque:locked';
    rows.set(legacy(lockedKey), { ...old, lockedUntilMs: NOW + policy.lockMs });
    expect((await restarted.consume(lockedKey, policy, NOW)).allowed).toBe(
      false
    );
  });

  it.each([NaN, -1, 1.5, Infinity])(
    'denies corrupt legacy count %s without reset',
    async (count) => {
      const { store, rows } = database();
      rows.set(legacy('opaque:corrupt'), {
        count,
        windowStartMs: NOW,
        lockedUntilMs: null
      });
      await expect(
        store.consume('opaque:corrupt', policy, NOW)
      ).rejects.toThrow();
      expect(rows.has(hashed('opaque:corrupt'))).toBe(false);
    }
  );

  it('keeps the new namespace disjoint from every sanitized legacy alias', async () => {
    const { store, rows } = database();
    const first = 'opaque:namespace';
    const alias = hashed(first);
    await store.consume(first, policy, NOW);
    await store.consume(alias, policy, NOW);
    expect(hashed(first)).not.toBe(legacy(alias));
    expect(rows.get(hashed(first))?.count).toBe(1);
    expect(rows.get(hashed(alias))?.count).toBe(1);
  });

  it('serializes competing consumers without exceeding quota and survives restart', async () => {
    const { store, db } = database();
    const results = await Promise.all(
      Array.from({ length: policy.limit + 3 }, () =>
        store.consume('opaque:race', policy, NOW)
      )
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(
      policy.limit
    );
    expect(
      (
        await new FirestoreDurableRateLimitStore(db as never).consume(
          'opaque:race',
          policy,
          NOW
        )
      ).allowed
    ).toBe(false);
  });
});
