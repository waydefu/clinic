import { planDeniedAccessAudit } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

import {
  AUTHORIZATION_DENIAL_COLLECTION,
  FirestoreDeniedAccessAuditStore
} from './denied-access-audit.repository.js';

const EVENT = planDeniedAccessAudit({
  eventId: 'denial_corr_0001',
  occurredAt: '2026-09-16T12:00:00.000Z',
  actorId: 'anonymous',
  actorType: 'unauthenticated',
  action: 'v1_bookings',
  resourceType: 'appointment',
  reasonCategory: 'authentication_required',
  correlationId: 'corr_0001',
  environment: 'internal_test'
});

class MemoryFirestore {
  public readonly docs = new Map<string, Record<string, unknown>>();
  public creates = 0;
  public failNext: unknown;

  public collection(name: string) {
    return {
      doc: (id: string) => ({
        create: async (data: Record<string, unknown>) => {
          this.creates += 1;
          if (this.failNext !== undefined) {
            const error = this.failNext;
            this.failNext = undefined;
            throw error;
          }
          const key = `${name}/${id}`;
          if (this.docs.has(key)) {
            throw Object.assign(new Error('already exists'), { code: 6 });
          }
          this.docs.set(key, { ...data });
        }
      })
    };
  }
}

describe('FirestoreDeniedAccessAuditStore', () => {
  it('appends one document for one event and does not overwrite duplicates', async () => {
    const db = new MemoryFirestore();
    const store = new FirestoreDeniedAccessAuditStore(db as never);
    await store.record(EVENT);
    await store.record({ ...EVENT, actorId: 'should_not_overwrite' });
    expect(db.creates).toBe(2);
    expect(db.docs.size).toBe(1);
    const stored = db.docs.get(
      `${AUTHORIZATION_DENIAL_COLLECTION}/${EVENT.eventId}`
    );
    expect(stored).toMatchObject({
      eventId: EVENT.eventId,
      actorId: 'anonymous',
      outcome: 'denied',
      resourceId: null
    });
    expect(JSON.stringify(stored)).not.toMatch(/password|token|totp|0912/i);
  });

  it('surfaces non-duplicate storage failures so the filter can report them', async () => {
    const db = new MemoryFirestore();
    db.failNext = Object.assign(new Error('unavailable'), { code: 14 });
    const store = new FirestoreDeniedAccessAuditStore(db as never);
    await expect(store.record(EVENT)).rejects.toMatchObject({ code: 14 });
    expect(db.docs.size).toBe(0);
  });
});
