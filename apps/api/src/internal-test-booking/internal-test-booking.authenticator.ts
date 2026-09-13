import type { Auth } from 'firebase-admin/auth';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import {
  readCalendarPilotSessionCookie,
  roleForCalendarPilotEmail,
  tokenHasTotpSecondFactor,
  type CalendarPilotSessionService
} from '../auth/calendar-pilot-session.js';
import type {
  AppointmentAuthenticator,
  AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function header(
  request: AuthenticatableRequest,
  name: string
): string | undefined {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function bearerToken(request: AuthenticatableRequest): string | undefined {
  const authorization = header(request, 'authorization');
  if (authorization === undefined || !authorization.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authorization.slice('Bearer '.length).trim();
  return token === '' ? undefined : token;
}

/**
 * Internal-test booking authenticator. Staff reuse the CAL-PILOT
 * Google+TOTP `__session` cookie. Patients present a verified Firebase ID
 * token; MFA is a staff D-006 control, not a patient booking factor.
 * Preview URLs are not treated as authentication.
 */
export class InternalTestBookingAuthenticator implements AppointmentAuthenticator {
  public constructor(
    private readonly sessions: CalendarPilotSessionService,
    private readonly auth: Auth
  ) {}

  public async authenticate(
    request: AuthenticatableRequest
  ): Promise<AuthenticationContext> {
    const cookie = readCalendarPilotSessionCookie(header(request, 'cookie'));
    if (cookie !== undefined) {
      const authentication = await this.sessions.authenticate(cookie);
      if ((request.method ?? 'POST').toUpperCase() !== 'GET') {
        const csrf = header(request, 'x-csrf-token');
        if (csrf === undefined) throw new AuthenticationRequiredError();
        await this.sessions.assertCsrf(authentication.sessionId, csrf);
      }
      return {
        actorId: authentication.actorId,
        actorRole: authentication.actorRole
      };
    }

    const idToken = bearerToken(request);
    if (idToken === undefined) throw new AuthenticationRequiredError();
    const decoded = await this.auth.verifyIdToken(idToken, true).catch(() => {
      throw new AuthenticationRequiredError();
    });
    if (decoded.email_verified !== true)
      throw new AuthenticationRequiredError();
    const user = await this.auth.getUser(decoded.uid);
    if (user.disabled) throw new AuthenticationRequiredError();
    if (!OPAQUE_ID.test(decoded.uid)) throw new AuthenticationRequiredError();

    const staffRole = roleForCalendarPilotEmail(decoded.email);
    if (staffRole !== undefined) {
      if (!tokenHasTotpSecondFactor(decoded)) {
        throw new AuthenticationRequiredError();
      }
      return { actorId: decoded.uid, actorRole: staffRole };
    }

    return {
      actorId: decoded.uid,
      actorRole: 'patient',
      verifiedPatientId: decoded.uid
    };
  }
}
