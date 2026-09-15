/**
 * WP-B2-2026-09-15 owner-signed API limiter parameters.
 *
 * Architecture B: Firestore durable limiter plus process-local burst.
 * D-006 authorization-code lock (5 / 15 min) is a different control; these
 * numbers must not lower it. Phone / DOB / tokens never appear in keys.
 */

export const UNAUTHENTICATED_GENERAL_LIMIT = 60;
export const UNAUTHENTICATED_GENERAL_WINDOW_MS = 60_000;

export const IDENTIFIED_WRITE_LIMIT = 30;
export const IDENTIFIED_WRITE_WINDOW_MS = 60_000;

export const LOOKUP_FAILURE_THRESHOLD = 5;
export const LOOKUP_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOOKUP_LOCK_MS = 15 * 60 * 1000;

export type RateLimitPolicyName =
  'unauthenticated_general' | 'identified_write' | 'lookup_or_auth_failure';

export interface RateLimitPolicy {
  readonly name: RateLimitPolicyName;
  readonly limit: number;
  readonly windowMs: number;
  readonly lockMs: number;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> =
  {
    unauthenticated_general: {
      name: 'unauthenticated_general',
      limit: UNAUTHENTICATED_GENERAL_LIMIT,
      windowMs: UNAUTHENTICATED_GENERAL_WINDOW_MS,
      lockMs: 0
    },
    identified_write: {
      name: 'identified_write',
      limit: IDENTIFIED_WRITE_LIMIT,
      windowMs: IDENTIFIED_WRITE_WINDOW_MS,
      lockMs: 0
    },
    lookup_or_auth_failure: {
      name: 'lookup_or_auth_failure',
      limit: LOOKUP_FAILURE_THRESHOLD,
      windowMs: LOOKUP_FAILURE_WINDOW_MS,
      lockMs: LOOKUP_LOCK_MS
    }
  };
