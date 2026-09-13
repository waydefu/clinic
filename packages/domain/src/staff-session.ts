import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * D-006 approved idle and absolute session lifetimes. Firebase session
 * cookies only offer a fixed expiresIn window (5 minutes to 2 weeks); they
 * do not implement idle timeout. Idle enforcement is therefore an
 * application check against lastSeenAt.
 *
 * @see https://firebase.google.com/docs/auth/admin/manage-cookies
 * @see https://firebase.google.com/docs/auth/admin/manage-sessions
 */
export const STAFF_IDLE_SESSION_MS = 30 * 60 * 1000;
export const STAFF_ABSOLUTE_SESSION_MS = 8 * 60 * 60 * 1000;

export type StaffSessionDenialReason =
  'disabled' | 'idle_timeout' | 'absolute_timeout' | 'not_yet_valid';

export type StaffSessionEvaluation =
  | { readonly active: true }
  | { readonly active: false; readonly reason: StaffSessionDenialReason };

export interface StaffSessionInput {
  readonly now: string;
  readonly issuedAt: string;
  readonly lastSeenAt: string;
  readonly accountDisabled: boolean;
}

export function evaluateStaffSession(
  input: StaffSessionInput
): StaffSessionEvaluation {
  assertUtcTimestamp(input.now, 'staffSession.now');
  assertUtcTimestamp(input.issuedAt, 'staffSession.issuedAt');
  assertUtcTimestamp(input.lastSeenAt, 'staffSession.lastSeenAt');
  if (typeof input.accountDisabled !== 'boolean') {
    throw new DomainError(
      'INVALID_VALUE',
      'staffSession.accountDisabled must be a boolean'
    );
  }

  // D-006: disabling an account must reject the next protected request,
  // rather than waiting for a previously issued token to expire.
  if (input.accountDisabled) return { active: false, reason: 'disabled' };

  const nowMs = Date.parse(input.now);
  const issuedMs = Date.parse(input.issuedAt);
  const lastSeenMs = Date.parse(input.lastSeenAt);

  if (nowMs < issuedMs) return { active: false, reason: 'not_yet_valid' };
  if (nowMs - issuedMs >= STAFF_ABSOLUTE_SESSION_MS) {
    return { active: false, reason: 'absolute_timeout' };
  }
  if (nowMs - lastSeenMs >= STAFF_IDLE_SESSION_MS) {
    return { active: false, reason: 'idle_timeout' };
  }
  return { active: true };
}
