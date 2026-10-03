import { DomainError } from './errors.js';
import { assertUtcTimestamp } from './timestamp.js';

/**
 * Staff session lifetime. D-006 originally approved 30-minute idle and 8-hour
 * absolute limits; STAFF-SESSION-12H-2026-10-03 replaced them with one
 * 12-hour absolute limit and no idle timeout, so Google + TOTP is entered
 * about once per working day. Login MFA itself is unchanged, and sensitive
 * writes still require a fresh (10-minute) Google + TOTP reauthentication.
 * Firebase session cookies take a fixed expiresIn window (5 minutes to 2
 * weeks), which matches an absolute-only limit.
 *
 * @see https://firebase.google.com/docs/auth/admin/manage-cookies
 * @see https://firebase.google.com/docs/auth/admin/manage-sessions
 */
export const STAFF_ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;

export type StaffSessionDenialReason =
  'disabled' | 'absolute_timeout' | 'not_yet_valid';

export type StaffSessionEvaluation =
  | { readonly active: true }
  | { readonly active: false; readonly reason: StaffSessionDenialReason };

export interface StaffSessionInput {
  readonly now: string;
  readonly issuedAt: string;
  /** Still validated as stored session data; inactivity no longer expires it. */
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

  if (nowMs < issuedMs) return { active: false, reason: 'not_yet_valid' };
  if (nowMs - issuedMs >= STAFF_ABSOLUTE_SESSION_MS) {
    return { active: false, reason: 'absolute_timeout' };
  }
  return { active: true };
}
