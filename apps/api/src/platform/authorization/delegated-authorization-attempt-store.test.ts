import { describe, expect, it } from 'vitest';

import { recordDelegationAttempt } from '@beauessence/domain';
import {
  InMemoryDelegatedAuthorizationAttemptStore,
  delegatedAttemptKey
} from './delegated-authorization-attempt-store.js';

describe('InMemoryDelegatedAuthorizationAttemptStore', () => {
  it('serializes overlapping failures so the lock cannot be lost', async () => {
    const store = new InMemoryDelegatedAuthorizationAttemptStore();
    const key = delegatedAttemptKey('staff_front_001', 'delete_appointment');

    await Promise.all(
      Array.from({ length: 8 }, () =>
        store.runExclusive(key, (state) => {
          const next = recordDelegationAttempt(state, 'failure', 3);
          store.replace(key, next);
          return next;
        })
      )
    );

    expect(store.snapshot(key)).toEqual({
      failedAttempts: 3,
      locked: true
    });
  });

  it('does not let a later success unlock a locked key', async () => {
    const store = new InMemoryDelegatedAuthorizationAttemptStore();
    const key = delegatedAttemptKey('staff_front_002', 'delete_appointment');
    await store.runExclusive(key, (state) => {
      store.replace(key, recordDelegationAttempt(state, 'failure', 1));
    });
    await store.runExclusive(key, (state) => {
      store.replace(key, recordDelegationAttempt(state, 'success', 1));
    });
    expect(store.snapshot(key)).toEqual({
      failedAttempts: 1,
      locked: true
    });
  });
});
