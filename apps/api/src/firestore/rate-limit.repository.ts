import type { RateLimitPolicy } from '@beauessence/domain';
import type { Firestore } from 'firebase-admin/firestore';

import {
  planDurableRateLimit,
  type DurableRateLimitConsumeResult,
  type DurableRateLimitStore
} from '../platform/runtime/durable-rate-limit-store.js';

export const RATE_LIMIT_COLLECTION = 'rate_limit_state';

function documentId(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
}

export class FirestoreDurableRateLimitStore implements DurableRateLimitStore {
  public constructor(private readonly db: Firestore) {}

  public async consume(
    key: string,
    policy: RateLimitPolicy,
    nowMs: number
  ): Promise<DurableRateLimitConsumeResult> {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.db
        .collection(RATE_LIMIT_COLLECTION)
        .doc(documentId(key));
      const snapshot = await transaction.get(ref);
      const data = snapshot.data() ?? {};
      const current =
        typeof data['count'] === 'number' &&
        typeof data['windowStartMs'] === 'number'
          ? {
              count: data['count'],
              windowStartMs: data['windowStartMs'],
              lockedUntilMs:
                typeof data['lockedUntilMs'] === 'number'
                  ? data['lockedUntilMs']
                  : null
            }
          : undefined;
      const planned = planDurableRateLimit(current, policy, nowMs);
      transaction.set(ref, {
        count: planned.record.count,
        windowStartMs: planned.record.windowStartMs,
        lockedUntilMs: planned.record.lockedUntilMs,
        updatedAt: new Date(nowMs).toISOString()
      });
      return planned.result;
    });
  }
}
