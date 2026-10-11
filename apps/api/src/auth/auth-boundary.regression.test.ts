import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF_ABSOLUTE_SESSION_MS } from '@beauessence/domain';

import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { InternalTestBookingAuthenticator } from '../internal-test-booking/internal-test-booking.authenticator.js';
import { assertInternalTestBookingWritable } from '../internal-test-booking/internal-test-booking.gate.js';
import { deriveClientIp } from '../platform/runtime/client-ip.js';
import { CalendarPilotSessionController } from './calendar-pilot-session.controller.js';
import {
  CalendarPilotSessionService,
  isCalendarPilotSessionActive,
  readCalendarPilotSessionCookie,
  roleForCalendarPilotEmail
} from './calendar-pilot-session.js';

const NOW = '2026-10-01T00:00:00.000Z';
const PROJECT = 'demo-sol-auth-boundary';
const ENV = { CALENDAR_PILOT_MANAGER_EMAILS: 'staff-fixture@example.invalid' };
const role = roleForCalendarPilotEmail(ENV.CALENDAR_PILOT_MANAGER_EMAILS, ENV);
if (role === undefined) throw new Error('Invalid synthetic role fixture.');
const STAFF = {
  actorId: 'opaque_staff_fixture',
  actorRole: role,
  sessionId: 'opaque_session_fixture'
};

afterEach(() => vi.unstubAllEnvs());

function boundary() {
  vi.stubEnv(
    'CALENDAR_PILOT_MANAGER_EMAILS',
    ENV.CALENDAR_PILOT_MANAGER_EMAILS
  );
  const sessions = {
    authenticate: vi.fn(() => Promise.resolve(STAFF)),
    assertCsrf: vi.fn(() => Promise.resolve())
  };
  const auth = {
    verifyIdToken: vi.fn(() =>
      Promise.resolve({
        uid: STAFF.actorId,
        email: ENV.CALENDAR_PILOT_MANAGER_EMAILS,
        email_verified: true,
        firebase: {
          sign_in_provider: 'google.com',
          sign_in_second_factor: 'totp'
        }
      })
    ),
    getUser: vi.fn(() => Promise.resolve({ disabled: false }))
  };
  const patients = {
    readReturnSession: vi.fn(() => Promise.resolve('opaque_patient_fixture'))
  };
  return {
    sessions,
    auth,
    patients,
    authenticator: new InternalTestBookingAuthenticator(
      sessions as never,
      auth as never,
      patients,
      () => NOW
    )
  };
}

function request(headers: Record<string, unknown>) {
  return { method: 'POST', headers } as never;
}

const RECORD = {
  ...STAFF,
  csrfHash: 'opaque_hash_fixture',
  createdAt: NOW,
  lastSeenAt: NOW,
  expiresAt: new Date(
    Date.parse(NOW) + STAFF_ABSOLUTE_SESSION_MS
  ).toISOString(),
  revokedAt: null
};

function gate(host: string, projectId = PROJECT) {
  try {
    assertInternalTestBookingWritable(NOW, {
      enabled: true,
      expiresAtUtc: '2026-10-02T00:00:00.000Z',
      projectId,
      emulatorHost: host
    });
    return true;
  } catch {
    return false;
  }
}

describe('credential and stored-session invariants (synthetic only)', () => {
  it('clears an invalid browser cookie while retaining authentication denial', async () => {
    const revoke = vi.fn();
    const controller = new CalendarPilotSessionController({ revoke } as never);
    const reply = { header: vi.fn() };
    await expect(
      controller.destroy('__session=%', reply)
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(revoke).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('Max-Age=0;')
    );
  });

  it('preserves the existing no-clear rule when server revocation fails', async () => {
    const error = new Error('opaque_dependency_failure');
    const controller = new CalendarPilotSessionController({
      revoke: vi.fn(() => Promise.reject(error))
    } as never);
    const reply = { header: vi.fn() };
    await expect(
      controller.destroy('__session=opaque_cookie_fixture', reply)
    ).rejects.toBe(error);
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('does not publish client auth configuration for an unapproved project', () => {
    vi.stubEnv('CALENDAR_PILOT_FIREBASE_WEB_API_KEY', 'opaque_web_key_fixture');
    vi.stubEnv(
      'CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN',
      'unapproved-fixture.example.invalid'
    );
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'unapproved-cloud-fixture');
    const controller = new CalendarPilotSessionController({} as never);
    expect(() => controller.clientConfig()).toThrow(
      AuthenticationRequiredError
    );
  });

  it('keeps the approved staff cookie and CSRF path', async () => {
    const b = boundary();
    await expect(
      b.authenticator.authenticate(
        request({
          cookie: '__session=opaque_cookie_fixture',
          'x-csrf-token': 'opaque_csrf_fixture'
        })
      )
    ).resolves.toEqual({ actorId: STAFF.actorId, actorRole: STAFF.actorRole });
    expect(b.sessions.assertCsrf).toHaveBeenCalledWith(
      STAFF.sessionId,
      'opaque_csrf_fixture'
    );
    expect(b.auth.verifyIdToken).not.toHaveBeenCalled();
  });

  it.each(
    [
      'Basic opaque_fixture',
      'Bearer',
      ['Bearer opaque_a', 'Bearer opaque_b']
    ].map((authorization) => ({ authorization }))
  )(
    'rejects conflicting or malformed authorization before resolving identity (%j)',
    async ({ authorization }) => {
      const b = boundary();
      await expect(
        b.authenticator.authenticate(
          request({
            authorization,
            'x-return-session': 'opaque_return_fixture'
          })
        )
      ).rejects.toBeInstanceOf(AuthenticationRequiredError);
      expect(b.patients.readReturnSession).not.toHaveBeenCalled();
      expect(b.auth.verifyIdToken).not.toHaveBeenCalled();
    }
  );

  it('rejects multiple credential sources before cookie authentication', async () => {
    const b = boundary();
    await expect(
      b.authenticator.authenticate(
        request({
          cookie: '__session=opaque_cookie_fixture',
          authorization: 'Bearer opaque_id_fixture',
          'x-csrf-token': 'opaque_csrf_fixture'
        })
      )
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(b.sessions.authenticate).not.toHaveBeenCalled();
    expect(b.auth.verifyIdToken).not.toHaveBeenCalled();
  });

  it('does not substitute a raw staff ID token for the approved session', async () => {
    const b = boundary();
    await expect(
      b.authenticator.authenticate(
        request({
          authorization: 'Bearer opaque_id_fixture'
        })
      )
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(b.auth.verifyIdToken).toHaveBeenCalledWith(
      'opaque_id_fixture',
      true
    );
  });

  it.each([
    '__session=%',
    '__session=',
    '__session=opaque_a; __session=opaque_b'
  ])('maps invalid cookie input to authentication denial (%s)', (cookie) => {
    expect(() => readCalendarPilotSessionCookie(cookie)).toThrow(
      AuthenticationRequiredError
    );
  });

  it('accepts split non-conflicting Cookie headers', () => {
    expect(
      readCalendarPilotSessionCookie([
        'other=opaque',
        '__session=opaque_cookie_fixture'
      ])
    ).toBe('opaque_cookie_fixture');
  });

  it.each([
    { expiresAt: NOW },
    { expiresAt: 'not-a-timestamp' },
    { createdAt: 'not-a-timestamp' },
    { lastSeenAt: 'not-a-timestamp' }
  ])(
    'denies expired or invalid stored metadata without leaking a domain exception (%j)',
    (patch) => {
      expect(
        isCalendarPilotSessionActive(
          { ...RECORD, ...patch },
          STAFF.actorId,
          STAFF.actorRole,
          NOW
        )
      ).toBe(false);
    }
  );

  it('does not persist or return a session after an account changes during issuance', async () => {
    const create = vi.fn(() => Promise.resolve());
    const auth = {
      verifyIdToken: vi.fn(() =>
        Promise.resolve({
          uid: STAFF.actorId,
          email: ENV.CALENDAR_PILOT_MANAGER_EMAILS,
          email_verified: true,
          auth_time: Date.parse(NOW) / 1000,
          firebase: {
            sign_in_provider: 'google.com',
            sign_in_second_factor: 'totp'
          }
        })
      ),
      getUser: vi
        .fn()
        .mockResolvedValueOnce({ disabled: false })
        .mockResolvedValueOnce({ disabled: true }),
      createSessionCookie: vi.fn(() => Promise.resolve('opaque_cookie_fixture'))
    };
    const db = { collection: () => ({ doc: () => ({ create }) }) };
    const service = new CalendarPilotSessionService(
      auth as never,
      db as never,
      ENV
    );
    await expect(
      service.create('opaque_id_fixture', NOW)
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(create).not.toHaveBeenCalled();
    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });
});

describe('isolated emulator and source-IP invariants', () => {
  it.each(['localhost:8080', '127.0.0.1:8080', '[::1]:8080'])(
    'accepts the approved local demo emulator (%s)',
    (host) => expect(gate(host)).toBe(true)
  );
  it.each([
    '198.51.100.1:8080',
    'localhost:0',
    'localhost:65536',
    'https://localhost:8080',
    'localhost:8080/path'
  ])('rejects non-loopback or invalid emulator authority (%s)', (host) =>
    expect(gate(host)).toBe(false)
  );
  it.each([
    ['2001:DB8:0:0:0:0:0:1', '2001:db8::1'],
    ['::ffff:192.0.2.1', '192.0.2.1'],
    ['::ffff:c000:201', '192.0.2.1'],
    ['not:a:valid:address', 'unknown'],
    ['2001:db8::1:invalid', 'unknown']
  ])('uses one valid per-host representation (%s)', (ip, expected) => {
    expect(deriveClientIp({ ip, headers: {} }, 0)).toBe(expected);
  });
  it('keeps separate IPv6 hosts separate without subnet aggregation', () => {
    expect(deriveClientIp({ ip: '2001:db8::1', headers: {} }, 0)).not.toBe(
      deriveClientIp({ ip: '2001:db8::2', headers: {} }, 0)
    );
  });
});
