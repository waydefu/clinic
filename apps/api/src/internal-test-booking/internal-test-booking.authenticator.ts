import type { Auth } from 'firebase-admin/auth';

import type { AuthenticationContext } from '../auth/authentication-context.js';
import {
  readCalendarPilotSessionCookie,
  roleForCalendarPilotEmail,
  type CalendarPilotSessionService
} from '../auth/calendar-pilot-session.js';
import type {
  AppointmentAuthenticator,
  AuthenticatableRequest
} from '../appointments/appointment.controller.js';
import type { PatientDirectoryPort } from '../patients/patient-directory.js';
import {
  AuthenticationRequiredError,
  DisabledAccountError
} from '../platform/errors/api-error.js';

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function header(
  request: AuthenticatableRequest,
  name: string
): string | undefined {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  if (value === undefined) return undefined;
  if (typeof value === 'string' && value.length > 0) return value;
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((part) => typeof part === 'string' && part.length > 0)
  ) {
    if (name === 'cookie') return value.join('; ');
    if (value.length === 1) return value[0] as string;
  }
  throw new AuthenticationRequiredError();
}

function bearerToken(request: AuthenticatableRequest): string | undefined {
  const authorization = header(request, 'authorization');
  if (authorization === undefined) {
    return undefined;
  }
  const scheme = authorization
    .slice(0, 'Bearer '.length)
    .replace(/[A-Z]/g, (character) => character.toLowerCase());
  if (scheme !== 'bearer ') return undefined;
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
    private readonly auth: Auth,
    private readonly patients?: PatientDirectoryPort,
    private readonly nowUtc: () => string = () => new Date().toISOString()
  ) {}

  public async authenticate(
    request: AuthenticatableRequest
  ): Promise<AuthenticationContext> {
    const authorization = header(request, 'authorization');
    const idToken = bearerToken(request);
    if (authorization !== undefined && idToken === undefined) {
      throw new AuthenticationRequiredError();
    }
    const returnSession = header(request, 'x-return-session');
    const cookie = readCalendarPilotSessionCookie(header(request, 'cookie'));
    const credentials = [returnSession, cookie, idToken];
    if (credentials.filter((value) => value !== undefined).length > 1) {
      throw new AuthenticationRequiredError();
    }
    if (returnSession !== undefined) {
      if (!OPAQUE_ID.test(returnSession))
        throw new AuthenticationRequiredError();
      if (this.patients === undefined) throw new AuthenticationRequiredError();
      const patientId = await this.patients.readReturnSession(
        returnSession,
        this.nowUtc()
      );
      if (patientId === undefined) throw new AuthenticationRequiredError();
      return {
        actorId: patientId,
        actorRole: 'patient',
        verifiedPatientId: patientId
      };
    }

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

    if (idToken === undefined) {
      return { actorId: 'anonymous', actorRole: 'patient' };
    }
    const decoded = await this.auth.verifyIdToken(idToken, true).catch(() => {
      throw new AuthenticationRequiredError();
    });
    if (decoded.email_verified !== true)
      throw new AuthenticationRequiredError();
    if (!OPAQUE_ID.test(decoded.uid)) throw new AuthenticationRequiredError();
    const user = await this.auth.getUser(decoded.uid).catch(() => {
      throw new AuthenticationRequiredError();
    });
    if (user.disabled) throw new DisabledAccountError();

    const staffRole = roleForCalendarPilotEmail(decoded.email);
    if (staffRole !== undefined) {
      // Staff must use the server session's expiry, revocation and CSRF gates.
      // An ID token is exchanged by the session controller, not used here.
      throw new AuthenticationRequiredError();
    }

    // No Firebase UID -> patient inference. The directory must explicitly
    // establish the association; accountless lookup is the Phase-1 default.
    const patientId = await this.patients?.readVerifiedPatientId?.(decoded.uid);
    if (patientId === undefined || !OPAQUE_ID.test(patientId)) {
      throw new AuthenticationRequiredError();
    }
    return {
      actorId: decoded.uid,
      actorRole: 'patient',
      verifiedPatientId: patientId
    };
  }
}
