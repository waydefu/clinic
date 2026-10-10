import { describe, expect, it, vi } from 'vitest';
import { OPERATIONAL_ROLES } from '@beauessence/domain';
import { CalendarPilotSessionController } from './calendar-pilot-session.controller.js';
import {
  AuthenticationRequiredError,
  RateLimitedError
} from '../platform/errors/api-error.js';
const UID = 'opaque_staff_fixture';
const context = {
  actorId: UID,
  actorRole: OPERATIONAL_ROLES[0],
  sessionId: 'opaque_session_fixture'
};
const limiter = () => ({
  assertUnauthenticatedIp: vi.fn(async () => {}),
  assertIdentifiedWrite: vi.fn(async () => {})
});
describe('controller-owned authenticated principal and issuance quotas', () => {
  it('only returns server identity after cookie and CSRF gates', async () => {
    const sessions = {
      authenticate: vi.fn(async () => Promise.resolve(context)),
      assertCsrf: vi.fn(async () => {})
    };
    const controller = new CalendarPilotSessionController(
      sessions as never,
      limiter() as never
    );
    await expect(
      controller.me('__session=opaque_cookie_fixture', 'opaque_csrf_fixture')
    ).resolves.toEqual({ actorId: UID, actorRole: context.actorRole });
    expect(sessions.authenticate).toHaveBeenCalledWith('opaque_cookie_fixture');
    expect(sessions.assertCsrf).toHaveBeenCalledWith(
      context.sessionId,
      'opaque_csrf_fixture'
    );
  });
  it.each([undefined, '', 'other=opaque_cookie'])(
    'denies absent cookie before principal read (%s)',
    async (cookie) => {
      const sessions = { authenticate: vi.fn() };
      await expect(
        new CalendarPilotSessionController(
          sessions as never,
          limiter() as never
        ).me(cookie, 'opaque_csrf_fixture')
      ).rejects.toBeInstanceOf(AuthenticationRequiredError);
      expect(sessions.authenticate).not.toHaveBeenCalled();
    }
  );
  it('denies invalid CSRF without returning identity', async () => {
    const sessions = {
      authenticate: vi.fn(async () => Promise.resolve(context)),
      assertCsrf: vi.fn(async () => {
        return Promise.reject(new AuthenticationRequiredError());
      })
    };
    await expect(
      new CalendarPilotSessionController(
        sessions as never,
        limiter() as never
      ).me('__session=opaque_cookie_fixture', 'opaque_wrong_fixture')
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });
  it('IP quota denial precedes all SDK/cookie issue work', async () => {
    const sessions = { create: vi.fn() };
    const limits = limiter();
    limits.assertUnauthenticatedIp.mockRejectedValueOnce(
      new RateLimitedError(60)
    );
    const controller = new CalendarPilotSessionController(
      sessions as never,
      limits as never
    );
    await expect(
      controller.create(
        { idToken: 'x'.repeat(100) },
        { header: vi.fn() },
        { ip: '192.0.2.1', headers: {} }
      )
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it('binds the account quota to the verified service callback, not body identity', async () => {
    const limits = limiter();
    const sessions = {
      create: vi.fn(
        async (
          _token: unknown,
          _now: unknown,
          beforeIssue: (uid: string) => Promise<void>
        ) => {
          await beforeIssue(UID);
          return {
            cookieValue: 'opaque_cookie',
            cookieMaxAgeSeconds: 60,
            csrfToken: 'opaque_csrf',
            authentication: context
          };
        }
      )
    };
    await new CalendarPilotSessionController(
      sessions as never,
      limits as never
    ).create(
      { idToken: 'x'.repeat(100) },
      { header: vi.fn() },
      { ip: '192.0.2.1', headers: {} }
    );
    expect(limits.assertIdentifiedWrite).toHaveBeenCalledWith(UID);
  });
});
