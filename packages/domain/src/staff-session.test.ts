import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  STAFF_ABSOLUTE_SESSION_MS,
  evaluateStaffSession
} from './staff-session.js';

const issuedAt = '2026-09-13T00:00:00.000Z';
const issuedMs = Date.parse(issuedAt);

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe('evaluateStaffSession', () => {
  it('keeps a session active inside the 12-hour window', () => {
    expect(
      evaluateStaffSession({
        now: iso(issuedMs + 10 * 60 * 1000),
        issuedAt,
        lastSeenAt: iso(issuedMs + 5 * 60 * 1000),
        accountDisabled: false
      })
    ).toEqual({ active: true });
  });

  it('rejects a disabled account before any clock check', () => {
    expect(
      evaluateStaffSession({
        now: iso(issuedMs + 1_000),
        issuedAt,
        lastSeenAt: issuedAt,
        accountDisabled: true
      })
    ).toEqual({ active: false, reason: 'disabled' });
  });

  it('does not expire an untouched session before the absolute limit', () => {
    // STAFF-SESSION-12H-2026-10-03: no idle timeout.
    expect(
      evaluateStaffSession({
        now: iso(issuedMs + STAFF_ABSOLUTE_SESSION_MS - 1_000),
        issuedAt,
        lastSeenAt: issuedAt,
        accountDisabled: false
      })
    ).toEqual({ active: true });
  });

  it('enforces the 12-hour absolute lifetime even if lastSeen is fresh', () => {
    expect(STAFF_ABSOLUTE_SESSION_MS).toBe(12 * 60 * 60 * 1000);
    const nowMs = issuedMs + STAFF_ABSOLUTE_SESSION_MS;
    expect(
      evaluateStaffSession({
        now: iso(nowMs),
        issuedAt,
        lastSeenAt: iso(nowMs - 1_000),
        accountDisabled: false
      })
    ).toEqual({ active: false, reason: 'absolute_timeout' });
  });

  it('rejects a clock that is earlier than issue time', () => {
    expect(
      evaluateStaffSession({
        now: '2026-09-12T23:59:59.000Z',
        issuedAt,
        lastSeenAt: issuedAt,
        accountDisabled: false
      })
    ).toEqual({ active: false, reason: 'not_yet_valid' });
  });

  it('rejects a non-UTC timestamp rather than treating it as expired', () => {
    expect(() =>
      evaluateStaffSession({
        now: '2026-09-13T08:00:00+08:00',
        issuedAt,
        lastSeenAt: issuedAt,
        accountDisabled: false
      })
    ).toThrow(DomainError);
  });
});
