/**
 * Phase-1 staff identity parameters selected by C0-ENG-REC-2026-09-11.
 *
 * These are engineering recommendations, not owner approval and not a
 * routed C2/C4 implementation. Identity Platform's unreviewed default
 * `adjacentIntervals` is 5; this module keeps the tighter value already
 * used by the synthetic CAL-PILOT configurator.
 */
export const TOTP_ADJACENT_INTERVALS = 1;
export const AUTHORIZATION_LOCK_FAILURE_THRESHOLD = 5;
export const AUTHORIZATION_LOCK_NIST_HARD_CEILING = 10;
export const AUTHORIZATION_LOCK_BASE_MS = 15 * 60 * 1000;
export const AUTHORIZATION_LOCK_MAX_MS = 4 * 60 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const AUTHORIZATION_UNLOCK_ROLE = 'manager';
export const MFA_RECOVERY_CHANNEL = 'in_person_second_manager_rebind';
export const BREAK_GLASS = 'not_provisioned';
export function emptyAuthorizationAttemptState() {
    return {
        consecutiveFailures: 0,
        lockCycle: 0,
        lockedUntilMs: null
    };
}
export function isAuthorizationAttemptLocked(state, nowMs) {
    return state.lockedUntilMs !== null && nowMs < state.lockedUntilMs;
}
export function authorizationLockDurationMs(lockCycle) {
    if (lockCycle < 1)
        return 0;
    const duration = AUTHORIZATION_LOCK_BASE_MS * 2 ** (lockCycle - 1);
    return Math.min(duration, AUTHORIZATION_LOCK_MAX_MS);
}
export function recordAuthorizationFailure(state, nowMs) {
    if (isAuthorizationAttemptLocked(state, nowMs))
        return state;
    const consecutiveFailures = state.consecutiveFailures + 1;
    if (consecutiveFailures < AUTHORIZATION_LOCK_FAILURE_THRESHOLD) {
        return { ...state, consecutiveFailures, lockedUntilMs: null };
    }
    const lockCycle = state.lockCycle + 1;
    return {
        consecutiveFailures: 0,
        lockCycle,
        lockedUntilMs: nowMs + authorizationLockDurationMs(lockCycle)
    };
}
export function recordAuthorizationSuccess() {
    return emptyAuthorizationAttemptState();
}
export function isAuthorizationCodeExpired(issuedAtMs, nowMs) {
    return nowMs - issuedAtMs >= AUTHORIZATION_CODE_TTL_MS;
}
