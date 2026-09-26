import { describe, expect, it } from 'vitest';

import { AUTHORIZATION_LOCK_FAILURE_THRESHOLD } from './staff-auth-parameters.js';
import {
  IDENTIFIED_WRITE_LIMIT,
  LOOKUP_FAILURE_THRESHOLD,
  LOOKUP_IDENTITY_LIMIT,
  LOOKUP_LOCK_MS,
  RATE_LIMIT_POLICIES,
  UNAUTHENTICATED_GENERAL_LIMIT
} from './rate-limit-parameters.js';

describe('WP-B2 rate-limit parameters', () => {
  it('uses the owner-signed windows and does not lower D-006 lock threshold', () => {
    expect(UNAUTHENTICATED_GENERAL_LIMIT).toBe(60);
    expect(IDENTIFIED_WRITE_LIMIT).toBe(30);
    expect(LOOKUP_FAILURE_THRESHOLD).toBe(5);
    expect(LOOKUP_LOCK_MS).toBe(15 * 60 * 1000);
    expect(LOOKUP_FAILURE_THRESHOLD).toBe(AUTHORIZATION_LOCK_FAILURE_THRESHOLD);
    expect(RATE_LIMIT_POLICIES.lookup_or_auth_failure.lockMs).toBe(
      LOOKUP_LOCK_MS
    );
  });

  it('caps one lookup identity per 15-minute window without an extended lock', () => {
    expect(RATE_LIMIT_POLICIES.lookup_identity_failure).toEqual({
      name: 'lookup_identity_failure',
      limit: LOOKUP_IDENTITY_LIMIT,
      windowMs: 15 * 60 * 1000,
      lockMs: 0
    });
    expect(LOOKUP_IDENTITY_LIMIT).toBe(10);
    expect(LOOKUP_IDENTITY_LIMIT).toBeGreaterThan(LOOKUP_FAILURE_THRESHOLD);
  });
});
