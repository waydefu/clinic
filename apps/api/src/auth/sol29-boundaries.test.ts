import { describe, expect, it, vi } from 'vitest';
import { STAFF_ABSOLUTE_SESSION_MS } from '@beauessence/domain';
import {
  CalendarPilotSessionService,
  roleForCalendarPilotEmail
} from './calendar-pilot-session.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { InternalTestBookingAuthenticator } from '../internal-test-booking/internal-test-booking.authenticator.js';

const NOW = '2026-10-01T00:00:00.000Z';
const EMAIL = 'opaque_staff@example.invalid';
const ENV = { CALENDAR_PILOT_MANAGER_EMAILS: EMAIL };
const role = roleForCalendarPilotEmail(EMAIL, ENV);
if (role === undefined) throw new Error('opaque_fixture_role_missing');

function fixture(patch: Record<string, unknown> = {}) {
  const decoded = {
    uid: 'opaque_staff',
    email: EMAIL,
    email_verified: true,
    auth_time: Date.parse(NOW) / 1000,
    firebase: { sign_in_provider: 'google.com', sign_in_second_factor: 'totp' },
    ...patch
  };
  const auth = {
    verifyIdToken: vi.fn().mockResolvedValue(decoded),
    verifySessionCookie: vi.fn().mockResolvedValue(decoded),
    getUser: vi.fn().mockResolvedValue({
      disabled: false,
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: true
    }),
    createSessionCookie: vi.fn().mockResolvedValue('opaque_cookie')
  };
  const rows = new Map<string, Record<string, unknown>>();
  const update = vi.fn(
    (ref: { id: string }, patch: Record<string, unknown>) => {
      rows.set(ref.id, { ...rows.get(ref.id), ...patch });
    }
  );
  const db = {
    collection: () => ({
      doc: (id: string) => ({
        id,
        create: vi.fn(async (record: Record<string, unknown>) => {
          rows.set(id, record);
          return Promise.resolve();
        })
      })
    }),
    runTransaction: async (work: (transaction: unknown) => Promise<void>) =>
      work({
        get: async (ref: { id: string }) =>
          Promise.resolve({
            exists: rows.has(ref.id),
            data: () => rows.get(ref.id)
          }),
        update
      })
  };
  const service = new CalendarPilotSessionService(
    auth as never,
    db as never,
    ENV
  );
  return { auth, rows, service, update };
}

describe('SOL29 session proof and allowlist regressions', () => {
  it('does not issue verified patient identity from an unbound Firebase UID', async () => {
    const b = fixture({ email: 'opaque_nonstaff@example.invalid' });
    const authenticator = new InternalTestBookingAuthenticator(
      {} as never,
      b.auth as never
    );
    await expect(
      authenticator.authenticate({
        method: 'GET',
        headers: { authorization: 'Bearer opaque_token' }
      })
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it('rejects any normalized allowlist overlap without role fallback', () => {
    const environment = {
      CALENDAR_PILOT_MANAGER_EMAILS: `${EMAIL},opaque_other@example.invalid`,
      CALENDAR_PILOT_FRONT_DESK_EMAILS: ` ${EMAIL.toUpperCase()} `
    };
    expect(() => roleForCalendarPilotEmail(EMAIL, environment)).toThrow(
      AuthenticationRequiredError
    );
    expect(() =>
      roleForCalendarPilotEmail('opaque_other@example.invalid', environment)
    ).toThrow(AuthenticationRequiredError);
    expect(() => roleForCalendarPilotEmail(undefined, environment)).toThrow(
      AuthenticationRequiredError
    );
  });

  it.each([
    undefined,
    NaN,
    -1,
    Date.parse(NOW) / 1000 + 1,
    Date.parse(NOW) / 1000 - STAFF_ABSOLUTE_SESSION_MS / 1000
  ])(
    'denies invalid or expired trusted auth_time %s before issuance',
    async (auth_time) => {
      const b = fixture({ auth_time });
      await expect(
        b.service.create('opaque_token', NOW)
      ).rejects.toBeInstanceOf(AuthenticationRequiredError);
      expect(b.auth.createSessionCookie).not.toHaveBeenCalled();
      expect(b.rows.size).toBe(0);
    }
  );

  it('does not extend the absolute lifetime on exchange of the same proof', async () => {
    const b = fixture();
    const later = new Date(Date.parse(NOW) + 60_000).toISOString();
    const issued = await b.service.create('opaque_token', later);
    expect(issued.cookieMaxAgeSeconds).toBe(
      (STAFF_ABSOLUTE_SESSION_MS - 60_000) / 1000
    );
    expect([...b.rows.values()][0]?.expiresAt).toBe(
      new Date(Date.parse(NOW) + STAFF_ABSOLUTE_SESSION_MS).toISOString()
    );
    expect(b.auth.createSessionCookie).toHaveBeenCalledWith('opaque_token', {
      expiresIn: STAFF_ABSOLUTE_SESSION_MS - 60_000
    });
  });

  it('refuses a remainder below the installed SDK five-minute minimum', async () => {
    const b = fixture();
    await expect(
      b.service.create(
        'opaque_token',
        new Date(
          Date.parse(NOW) + STAFF_ABSOLUTE_SESSION_MS - 299_000
        ).toISOString()
      )
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(b.auth.createSessionCookie).not.toHaveBeenCalled();
  });

  it.each(['password', 'anonymous', undefined])(
    'rejects a non-Google provider %s despite TOTP',
    async (sign_in_provider) => {
      const b = fixture({
        firebase: { sign_in_provider, sign_in_second_factor: 'totp' }
      });
      await expect(
        b.service.create('opaque_token', NOW)
      ).rejects.toBeInstanceOf(AuthenticationRequiredError);
      expect(b.auth.createSessionCookie).not.toHaveBeenCalled();
    }
  );

  it.each([
    'auth/user-disabled',
    'auth/id-token-revoked',
    'auth/argument-error'
  ])('classifies SDK denial %s without issuance', async (code) => {
    const b = fixture();
    b.auth.verifyIdToken.mockRejectedValue({
      code,
      message: 'opaque_private_message'
    });
    await expect(b.service.create('opaque_token', NOW)).rejects.toBeInstanceOf(
      AuthenticationRequiredError
    );
    expect(b.auth.createSessionCookie).not.toHaveBeenCalled();
    expect(b.rows.size).toBe(0);
  });

  it('keeps the valid current Google/TOTP account path without redundant same-minute writes or an idle timeout', async () => {
    const b = fixture();
    const issued = await b.service.create('opaque_token', NOW);
    await expect(
      b.service.authenticate(
        issued.cookieValue,
        new Date(Date.parse(NOW) + 30_000).toISOString()
      )
    ).resolves.toMatchObject({ actorId: 'opaque_staff', actorRole: role });
    expect(b.update).not.toHaveBeenCalled();
    await b.service.authenticate(
      issued.cookieValue,
      new Date(Date.parse(NOW) + 60_000).toISOString()
    );
    expect(b.update).toHaveBeenCalledOnce();
    await b.service.authenticate(
      issued.cookieValue,
      new Date(Date.parse(NOW) + 60_500).toISOString()
    );
    expect(b.update).toHaveBeenCalledOnce();
    expect(b.auth.verifyIdToken).toHaveBeenCalledWith('opaque_token', true);
    expect(b.auth.verifySessionCookie).toHaveBeenCalledWith(
      'opaque_cookie',
      true
    );
  });
});
