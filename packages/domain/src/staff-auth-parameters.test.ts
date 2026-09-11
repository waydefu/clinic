import { describe, expect, it } from 'vitest';

import { OPERATIONAL_ROLES } from './roles.js';
import {
  AUTHORIZATION_CODE_TTL_MS,
  AUTHORIZATION_LOCK_BASE_MS,
  AUTHORIZATION_LOCK_FAILURE_THRESHOLD,
  AUTHORIZATION_LOCK_MAX_MS,
  AUTHORIZATION_LOCK_NIST_HARD_CEILING,
  AUTHORIZATION_UNLOCK_ROLE,
  BREAK_GLASS,
  MFA_RECOVERY_CHANNEL,
  TOTP_ADJACENT_INTERVALS,
  authorizationLockDurationMs,
  emptyAuthorizationAttemptState,
  isAuthorizationAttemptLocked,
  isAuthorizationCodeExpired,
  recordAuthorizationFailure,
  recordAuthorizationSuccess
} from './staff-auth-parameters.js';

const T0 = Date.parse('2026-09-11T00:00:00.000Z');

describe('staff-auth-parameters', () => {
  it('keeps TOTP skew at one adjacent interval, not the provider default of five', () => {
    expect(TOTP_ADJACENT_INTERVALS).toBe(1);
  });

  it('locks after five consecutive failures and stays within the NIST ceiling', () => {
    expect(AUTHORIZATION_LOCK_FAILURE_THRESHOLD).toBe(5);
    expect(AUTHORIZATION_LOCK_FAILURE_THRESHOLD).toBeLessThanOrEqual(
      AUTHORIZATION_LOCK_NIST_HARD_CEILING
    );
    let state = emptyAuthorizationAttemptState();
    for (let i = 0; i < AUTHORIZATION_LOCK_FAILURE_THRESHOLD - 1; i += 1) {
      state = recordAuthorizationFailure(state, T0);
      expect(isAuthorizationAttemptLocked(state, T0)).toBe(false);
    }
    state = recordAuthorizationFailure(state, T0);
    expect(isAuthorizationAttemptLocked(state, T0)).toBe(true);
    expect(state.lockedUntilMs).toBe(T0 + AUTHORIZATION_LOCK_BASE_MS);
  });

  it('does not extend the lock when retries arrive while locked', () => {
    let state = emptyAuthorizationAttemptState();
    for (let i = 0; i < AUTHORIZATION_LOCK_FAILURE_THRESHOLD; i += 1) {
      state = recordAuthorizationFailure(state, T0);
    }
    const duringLock = recordAuthorizationFailure(state, T0 + 1_000);
    expect(duringLock).toEqual(state);
  });

  it('doubles lock duration on the next burst and caps at four hours', () => {
    expect(authorizationLockDurationMs(1)).toBe(AUTHORIZATION_LOCK_BASE_MS);
    expect(authorizationLockDurationMs(2)).toBe(AUTHORIZATION_LOCK_BASE_MS * 2);
    expect(authorizationLockDurationMs(8)).toBe(AUTHORIZATION_LOCK_MAX_MS);
    let state = emptyAuthorizationAttemptState();
    for (let i = 0; i < AUTHORIZATION_LOCK_FAILURE_THRESHOLD; i += 1) {
      state = recordAuthorizationFailure(state, T0);
    }
    const afterUnlock = T0 + AUTHORIZATION_LOCK_BASE_MS;
    for (let i = 0; i < AUTHORIZATION_LOCK_FAILURE_THRESHOLD; i += 1) {
      state = recordAuthorizationFailure(state, afterUnlock);
    }
    expect(state.lockedUntilMs).toBe(
      afterUnlock + AUTHORIZATION_LOCK_BASE_MS * 2
    );
  });

  it('resets on success and expires authorization codes after 24 hours', () => {
    const failed = recordAuthorizationFailure(
      emptyAuthorizationAttemptState(),
      T0
    );
    expect(failed.consecutiveFailures).toBe(1);
    expect(recordAuthorizationSuccess()).toEqual(
      emptyAuthorizationAttemptState()
    );
    expect(isAuthorizationCodeExpired(T0, T0 + AUTHORIZATION_CODE_TTL_MS)).toBe(
      true
    );
    expect(
      isAuthorizationCodeExpired(T0, T0 + AUTHORIZATION_CODE_TTL_MS - 1)
    ).toBe(false);
  });

  it('unlocks only via manager and keeps break-glass unprovisioned', () => {
    expect(OPERATIONAL_ROLES).toContain(AUTHORIZATION_UNLOCK_ROLE);
    expect(AUTHORIZATION_UNLOCK_ROLE).toBe('manager');
    expect(MFA_RECOVERY_CHANNEL).toBe('in_person_second_manager_rebind');
    expect(BREAK_GLASS).toBe('not_provisioned');
  });
});
