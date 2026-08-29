import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

import type { AuthenticationContext } from './authentication-context.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';

const ABSOLUTE_SESSION_MS = 8 * 60 * 60 * 1000;
const IDLE_SESSION_MS = 30 * 60 * 1000;
export const CALENDAR_PILOT_COOKIE = '__Host-cal-pilot';

export type CalendarPilotStaffRole = 'manager' | 'front_desk';

export interface CalendarPilotSessionRecord {
  readonly actorId: string;
  readonly actorRole: CalendarPilotStaffRole;
  readonly csrfHash: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface CreatedCalendarPilotSession {
  readonly cookieName: typeof CALENDAR_PILOT_COOKIE;
  readonly cookieValue: string;
  readonly cookieMaxAgeSeconds: number;
  readonly csrfToken: string;
  readonly authentication: AuthenticationContext;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function splitAllowlist(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item !== '')
  );
}

export function roleForCalendarPilotEmail(
  email: string | undefined,
  environment: NodeJS.ProcessEnv = process.env
): CalendarPilotStaffRole | undefined {
  if (email === undefined) return undefined;
  const normalized = email.trim().toLowerCase();
  if (
    splitAllowlist(environment['CALENDAR_PILOT_MANAGER_EMAILS']).has(normalized)
  )
    return 'manager';
  if (
    splitAllowlist(environment['CALENDAR_PILOT_FRONT_DESK_EMAILS']).has(
      normalized
    )
  )
    return 'front_desk';
  return undefined;
}

export function tokenHasTotpSecondFactor(token: DecodedIdToken): boolean {
  const firebase = token.firebase as unknown as Record<string, unknown>;
  return firebase['sign_in_second_factor'] === 'totp';
}

export function isCalendarPilotSessionActive(
  session: CalendarPilotSessionRecord,
  actorId: string,
  role: CalendarPilotStaffRole,
  now: string
): boolean {
  const nowMs = Date.parse(now);
  return (
    session.actorId === actorId &&
    session.actorRole === role &&
    session.revokedAt === null &&
    nowMs < Date.parse(session.expiresAt) &&
    nowMs - Date.parse(session.lastSeenAt) < IDLE_SESSION_MS
  );
}

/**
 * Google ID tokens are exchanged for an HttpOnly session cookie only after
 * verified email, allowlist membership and a TOTP second factor are proven.
 * The cookie value and CSRF token are stored only as hashes in Firestore.
 */
export class CalendarPilotSessionService {
  public constructor(
    private readonly auth: Auth,
    private readonly db: Firestore,
    private readonly environment: NodeJS.ProcessEnv = process.env
  ) {}

  public async create(
    idToken: string,
    now = new Date().toISOString()
  ): Promise<CreatedCalendarPilotSession> {
    const decoded = await this.auth.verifyIdToken(idToken, true).catch(() => {
      throw new AuthenticationRequiredError();
    });
    const role = roleForCalendarPilotEmail(decoded.email, this.environment);
    if (
      decoded.email_verified !== true ||
      role === undefined ||
      !tokenHasTotpSecondFactor(decoded)
    )
      throw new AuthenticationRequiredError();
    const user = await this.auth.getUser(decoded.uid);
    if (user.disabled) throw new AuthenticationRequiredError();

    const cookieValue = await this.auth.createSessionCookie(idToken, {
      expiresIn: ABSOLUTE_SESSION_MS
    });
    const sessionId = digest(cookieValue);
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.parse(now) + ABSOLUTE_SESSION_MS
    ).toISOString();
    const record: CalendarPilotSessionRecord = {
      actorId: decoded.uid,
      actorRole: role,
      csrfHash: digest(csrfToken),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null
    };
    await this.db
      .collection('calendar_pilot_sessions')
      .doc(sessionId)
      .create(record);
    return {
      cookieName: CALENDAR_PILOT_COOKIE,
      cookieValue,
      cookieMaxAgeSeconds: ABSOLUTE_SESSION_MS / 1000,
      csrfToken,
      authentication: { actorId: decoded.uid, actorRole: role }
    };
  }

  public async authenticate(
    cookieValue: string,
    now = new Date().toISOString()
  ): Promise<AuthenticationContext & { readonly sessionId: string }> {
    if (cookieValue.trim() === '') throw new AuthenticationRequiredError();
    const decoded = await this.auth
      .verifySessionCookie(cookieValue, true)
      .catch(() => {
        throw new AuthenticationRequiredError();
      });
    const role = roleForCalendarPilotEmail(decoded.email, this.environment);
    if (
      decoded.email_verified !== true ||
      role === undefined ||
      !tokenHasTotpSecondFactor(decoded)
    )
      throw new AuthenticationRequiredError();
    const user = await this.auth.getUser(decoded.uid);
    if (user.disabled) throw new AuthenticationRequiredError();

    const sessionId = digest(cookieValue);
    const ref = this.db.collection('calendar_pilot_sessions').doc(sessionId);
    await this.db.runTransaction(async (transaction) => {
      const document = await transaction.get(ref);
      if (!document.exists) throw new AuthenticationRequiredError();
      const session = document.data() as CalendarPilotSessionRecord;
      if (!isCalendarPilotSessionActive(session, decoded.uid, role, now))
        throw new AuthenticationRequiredError();
      transaction.update(ref, { lastSeenAt: now });
    });
    return { actorId: decoded.uid, actorRole: role, sessionId };
  }

  public async assertCsrf(sessionId: string, csrfToken: string): Promise<void> {
    const document = await this.db
      .collection('calendar_pilot_sessions')
      .doc(sessionId)
      .get();
    if (!document.exists || csrfToken.trim() === '')
      throw new AuthenticationRequiredError();
    const expected = Buffer.from(
      (document.data() as CalendarPilotSessionRecord).csrfHash,
      'hex'
    );
    const actual = Buffer.from(digest(csrfToken), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new AuthenticationRequiredError();
  }

  public async revoke(
    cookieValue: string,
    now = new Date().toISOString()
  ): Promise<void> {
    const decoded = await this.auth
      .verifySessionCookie(cookieValue, false)
      .catch(() => {
        throw new AuthenticationRequiredError();
      });
    const sessionId = digest(cookieValue);
    await Promise.all([
      this.db
        .collection('calendar_pilot_sessions')
        .doc(sessionId)
        .update({ revokedAt: now }),
      this.auth.revokeRefreshTokens(decoded.uid)
    ]);
  }
}
