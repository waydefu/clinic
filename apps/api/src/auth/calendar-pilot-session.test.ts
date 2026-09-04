import { describe, expect, it } from 'vitest';

import { CalendarPilotSessionController } from './calendar-pilot-session.controller.js';
import {
  CALENDAR_PILOT_COOKIE,
  calendarPilotSessionClearCookie,
  calendarPilotSessionSetCookie,
  isCalendarPilotSessionActive,
  readCalendarPilotSessionCookie,
  roleForCalendarPilotEmail,
  tokenHasTotpSecondFactor,
  type CalendarPilotSessionService
} from './calendar-pilot-session.js';

function parseSetCookie(header: string): {
  readonly name: string;
  readonly value: string;
  readonly attributes: Readonly<Record<string, string | true>>;
} {
  const [pair, ...parts] = header.split(';').map((item) => item.trim());
  const separator = pair.indexOf('=');
  const attributes: Record<string, string | true> = {};
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index === -1) attributes[part.toLowerCase()] = true;
    else attributes[part.slice(0, index).toLowerCase()] = part.slice(index + 1);
  }
  return {
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
    attributes
  };
}

function expectLockedSessionCookieScope(
  attributes: Readonly<Record<string, string | true>>
): void {
  expect(attributes['secure']).toBe(true);
  expect(attributes['httponly']).toBe(true);
  expect(attributes['path']).toBe('/');
  expect(attributes['samesite']).toBe('Strict');
  expect(attributes['domain']).toBeUndefined();
}

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

describe('CAL-PILOT Hosting-forwarded session cookie contract', () => {
  it('uses exactly __session as the runtime cookie name', () => {
    expect(CALENDAR_PILOT_COOKIE).toBe('__session');
  });

  it('POST session Set-Cookie uses __session with locked attributes', async () => {
    const reply = {
      value: '',
      header(_name: string, next: string) {
        this.value = next;
      }
    };
    const sessions = {
      create: () =>
        Promise.resolve({
          cookieName: CALENDAR_PILOT_COOKIE,
          cookieValue: 'opaque-session',
          cookieMaxAgeSeconds: 28_800,
          csrfToken: 'csrf-token',
          authentication: { actorId: 'user_001', actorRole: 'manager' }
        })
    } as Pick<CalendarPilotSessionService, 'create'>;
    await new CalendarPilotSessionController(
      sessions as CalendarPilotSessionService
    ).create({ idToken: 'x'.repeat(100) }, reply);
    expect(reply.value).toBe(
      calendarPilotSessionSetCookie('opaque-session', 28_800)
    );
    expect(reply.value).not.toMatch(/Domain=/i);
    expect(reply.value).not.toContain('__Host-cal-pilot');
    const cookie = parseSetCookie(reply.value);
    expect(cookie.name).toBe('__session');
    expect(cookie.value).toBe(encodeURIComponent('opaque-session'));
    expect(cookie.attributes['max-age']).toBe('28800');
    expectLockedSessionCookieScope(cookie.attributes);
  });

  it('accepts only the __session cookie on authenticated requests', () => {
    expect(readCalendarPilotSessionCookie('__session=live-session')).toBe(
      'live-session'
    );
    expect(
      readCalendarPilotSessionCookie(
        '__Host-cal-pilot=stale-session; other=1; __session=live-session'
      )
    ).toBe('live-session');
    expect(
      readCalendarPilotSessionCookie(['other=1', '__session=from-array'])
    ).toBe('from-array');
  });

  it('does not treat the old __Host-cal-pilot cookie as authentication', () => {
    expect(
      readCalendarPilotSessionCookie('__Host-cal-pilot=stale-session')
    ).toBeUndefined();
    expect(
      readCalendarPilotSessionCookie(
        '__Host-cal-pilot=stale-session; session=not-it'
      )
    ).toBeUndefined();
    expect(
      calendarPilotSessionSetCookie('opaque-session', 28_800)
    ).not.toContain('__Host-cal-pilot');
  });

  it('clears logout with the same __session name and security attributes', async () => {
    const reply = {
      value: '',
      header(_name: string, next: string) {
        this.value = next;
      }
    };
    let revoked: string | undefined;
    const sessions = {
      revoke: (cookieValue: string) => {
        revoked = cookieValue;
        return Promise.resolve();
      }
    } as Pick<CalendarPilotSessionService, 'revoke'>;
    await new CalendarPilotSessionController(
      sessions as CalendarPilotSessionService
    ).destroy('__session=live-session; __Host-cal-pilot=stale-session', reply);
    expect(revoked).toBe('live-session');
    expect(reply.value).toBe(calendarPilotSessionClearCookie());
    expect(reply.value).not.toMatch(/Domain=/i);
    const cookie = parseSetCookie(reply.value);
    expect(cookie.name).toBe('__session');
    expect(cookie.value).toBe('');
    expect(cookie.attributes['max-age']).toBe('0');
    expectLockedSessionCookieScope(cookie.attributes);
  });
});
