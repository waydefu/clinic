import { describe, expect, it } from 'vitest';

import {
  isCalendarPilotSessionActive,
  roleForCalendarPilotEmail,
  tokenHasTotpSecondFactor
} from './calendar-pilot-session.js';

describe('CAL-PILOT session policy', () => {
  it('maps only exact normalized allowlisted accounts', () => {
    const environment = {
      CALENDAR_PILOT_MANAGER_EMAILS: ' Pilot.Manager@example.com ',
      CALENDAR_PILOT_FRONT_DESK_EMAILS: 'desk@example.com'
    };
    expect(
      roleForCalendarPilotEmail('pilot.manager@example.com', environment)
    ).toBe('manager');
    expect(roleForCalendarPilotEmail('desk@example.com', environment)).toBe(
      'front_desk'
    );
    expect(
      roleForCalendarPilotEmail('other@example.com', environment)
    ).toBeUndefined();
  });

  it('requires the TOTP second factor claim', () => {
    expect(
      tokenHasTotpSecondFactor({
        firebase: { sign_in_second_factor: 'totp' }
      } as never)
    ).toBe(true);
    expect(tokenHasTotpSecondFactor({ firebase: {} } as never)).toBe(false);
  });

  it('enforces 30 minute idle, 8 hour absolute and revocation boundaries', () => {
    const record = {
      actorId: 'user_001',
      actorRole: 'manager' as const,
      csrfHash: '00',
      createdAt: '2026-08-28T00:00:00.000Z',
      lastSeenAt: '2026-08-28T07:30:01.000Z',
      expiresAt: '2026-08-28T08:00:00.000Z',
      revokedAt: null
    };
    expect(
      isCalendarPilotSessionActive(
        record,
        'user_001',
        'manager',
        '2026-08-28T08:00:00.000Z'
      )
    ).toBe(false);
    expect(
      isCalendarPilotSessionActive(
        { ...record, expiresAt: '2026-08-28T09:00:00.000Z' },
        'user_001',
        'manager',
        '2026-08-28T08:00:00.000Z'
      )
    ).toBe(true);
    expect(
      isCalendarPilotSessionActive(
        {
          ...record,
          expiresAt: '2026-08-28T09:00:00.000Z',
          revokedAt: '2026-08-28T07:50:00.000Z'
        },
        'user_001',
        'manager',
        '2026-08-28T08:00:00.000Z'
      )
    ).toBe(false);
  });
});
