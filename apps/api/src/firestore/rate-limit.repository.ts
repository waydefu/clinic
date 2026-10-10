import { createHash } from 'node:crypto';
import type { RateLimitPolicy } from '@beauessence/domain';
import type { Firestore } from 'firebase-admin/firestore';

import {
  planDurableRateLimit,
  type DurableRateLimitConsumeResult,
  type DurableRateLimitStore
} from '../platform/runtime/durable-rate-limit-store.js';

export const RATE_LIMIT_COLLECTION = 'rate_limit_state';

function legacyDocumentId(key: string): string {
  return key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
}

function documentId(key: string): string {
  // A dot cannot appear in a sanitized legacy alias, including a crafted key.
  return `v2.${createHash('sha256').update(key).digest('hex')}`;
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
      // Carry forward an existing lock/counter once, without changing or
      // deleting the old record. New-version writers have independent keys.
      const legacy = snapshot.exists
        ? undefined
        : await transaction.get(
            this.db.collection(RATE_LIMIT_COLLECTION).doc(legacyDocumentId(key))
          );
      const data = (snapshot.exists ? snapshot.data() : legacy?.data()) as
        Record<string, unknown> | undefined;
      const current =
        data === undefined
          ? undefined
          : {
              count: data['count'],
              windowStartMs: data['windowStartMs'],
              lockedUntilMs: data['lockedUntilMs'] ?? null
            };
      const planned = planDurableRateLimit(
        current as Parameters<typeof planDurableRateLimit>[0],
        policy,
        nowMs
      );
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
