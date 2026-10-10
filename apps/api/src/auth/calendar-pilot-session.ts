import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from 'node:crypto';

import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import {
  STAFF_ABSOLUTE_SESSION_MS,
  assertUtcTimestamp,
  evaluateStaffSession,
  taipeiCalendarDateOf
} from '@beauessence/domain';

import type { AuthenticationContext } from './authentication-context.js';
import {
  CALENDAR_SESSION_GATE_ERROR,
  CALENDAR_SESSION_GATE_OPERATION,
  NOOP_CALENDAR_PILOT_SESSION_GATE_TELEMETRY,
  classifyCalendarSessionSecondFactor,
  classifyCalendarSessionRevokeCookieError,
  classifyCalendarSessionRevokeDependencyError,
  classifyCalendarSessionVerifyTokenError,
  secondFactorDenialErrorCode,
  type CalendarPilotSessionGateEvent,
  type CalendarPilotSessionGateTelemetry
} from './calendar-pilot-session-gate-telemetry.js';
import {
  AuthenticationRequiredError,
  DisabledAccountError
} from '../platform/errors/api-error.js';
import {
  BUSINESS_DELIVERY_COLLECTIONS,
  FIRST_ELIGIBLE_USE_DOC,
  staffLoginUsageEvent,
  staffUsageCaptureGapDocumentId
} from '../business-delivery/usage-events.js';

// Firebase Hosting strips incoming cookies before Cloud Run rewrites, except
// the exact name `__session`. See Hosting cache docs, "Using cookies".
export const CALENDAR_PILOT_COOKIE = '__session';
const SESSION_COOKIE_SCOPE = 'Path=/; HttpOnly; Secure; SameSite=Strict';

export function readCalendarPilotSessionCookie(
  header: string | string[] | undefined
): string | undefined {
  const raw = Array.isArray(header) ? header.join(';') : header;
  if (raw === undefined) return undefined;
  let cookie: string | undefined;
  for (const part of raw.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name !== CALENDAR_PILOT_COOKIE) continue;
    if (cookie !== undefined) throw new AuthenticationRequiredError();
    try {
      cookie = decodeURIComponent(value.join('='));
    } catch {
      throw new AuthenticationRequiredError();
    }
    if (cookie === '') throw new AuthenticationRequiredError();
  }
  return cookie;
}

export function calendarPilotSessionSetCookie(
  cookieValue: string,
  maxAgeSeconds: number
): string {
  return (
    `${CALENDAR_PILOT_COOKIE}=${encodeURIComponent(cookieValue)}; ` +
    `Max-Age=${maxAgeSeconds}; ${SESSION_COOKIE_SCOPE}`
  );
}

export function calendarPilotSessionClearCookie(): string {
  return `${CALENDAR_PILOT_COOKIE}=; Max-Age=0; ${SESSION_COOKIE_SCOPE}`;
}

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
  const managers = splitAllowlist(environment['CALENDAR_PILOT_MANAGER_EMAILS']);
  const frontDesk = splitAllowlist(
    environment['CALENDAR_PILOT_FRONT_DESK_EMAILS']
  );
  if ([...managers].some((address) => frontDesk.has(address))) {
    throw new AuthenticationRequiredError();
  }
  if (email === undefined) return undefined;
  const normalized = email.trim().toLowerCase();
  if (managers.has(normalized)) return 'manager';
  if (frontDesk.has(normalized)) return 'front_desk';
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
  now: string,
  accountDisabled = false
): boolean {
  if (
    session.actorId !== actorId ||
    session.actorRole !== role ||
    session.revokedAt !== null
  ) {
    return false;
  }
  try {
    assertUtcTimestamp(session.expiresAt, 'staffSession.expiresAt');
    if (Date.parse(now) >= Date.parse(session.expiresAt)) return false;
    return evaluateStaffSession({
      now,
      issuedAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      accountDisabled
    }).active;
  } catch {
    // Invalid stored timestamps deny authentication, not a public 400/500.
    return false;
  }
}

function proofLifetime(token: DecodedIdToken, now: string) {
  try {
    assertUtcTimestamp(now, 'staffSession.now');
  } catch {
    throw new AuthenticationRequiredError();
  }
  if (!Number.isSafeInteger(token.auth_time) || token.auth_time < 0) {
    throw new AuthenticationRequiredError();
  }
  const issuedMs = token.auth_time * 1000;
  const nowMs = Date.parse(now);
  const remainingMs = issuedMs + STAFF_ABSOLUTE_SESSION_MS - nowMs;
  if (issuedMs > nowMs || remainingMs <= 0)
    throw new AuthenticationRequiredError();
  return {
    expiresAt: new Date(issuedMs + STAFF_ABSOLUTE_SESSION_MS).toISOString(),
    remainingMs
  };
}

function sdkDenial(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'auth/user-disabled'
  ) {
    throw new DisabledAccountError();
  }
  throw new AuthenticationRequiredError();
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
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly telemetry: CalendarPilotSessionGateTelemetry = NOOP_CALENDAR_PILOT_SESSION_GATE_TELEMETRY,
    /**
     * CP-03 usage ingress (ADR-0008). When on and the maintenance allowlist is
     * valid, the session, staff_login event and — for the first runtime login
     * — the trial-start marker commit in one transaction. When off, it writes
     * only the session; when classification is unavailable, it writes the
     * session and monthly gap marker in one transaction.
     */
    private readonly recordBusinessDeliveryUsage = false
  ) {}

  private emitGate(event: CalendarPilotSessionGateEvent): void {
    try {
      this.telemetry.emit(event);
    } catch {
      // Telemetry must never change authentication control flow.
    }
  }

  public async create(
    idToken: string,
    now = new Date().toISOString(),
    beforeIssue?: (actorId: string) => Promise<void>
  ): Promise<CreatedCalendarPilotSession> {
    const correlationId = randomUUID();
    const decoded = await this.auth
      .verifyIdToken(idToken, true)
      .catch((error: unknown) => {
        this.emitGate({
          correlationId,
          operation: CALENDAR_SESSION_GATE_OPERATION.verifyToken,
          result: 'denied',
          errorCode: classifyCalendarSessionVerifyTokenError(error)
        });
        throw new AuthenticationRequiredError();
      });
    if (decoded.email_verified !== true) {
      this.emitGate({
        correlationId,
        operation: CALENDAR_SESSION_GATE_OPERATION.emailVerified,
        result: 'denied',
        errorCode: CALENDAR_SESSION_GATE_ERROR.emailVerified
      });
      throw new AuthenticationRequiredError();
    }
    const role = roleForCalendarPilotEmail(decoded.email, this.environment);
    if (role === undefined) {
      this.emitGate({
        correlationId,
        operation: CALENDAR_SESSION_GATE_OPERATION.allowlist,
        result: 'denied',
        errorCode: CALENDAR_SESSION_GATE_ERROR.allowlist
      });
      throw new AuthenticationRequiredError();
    }
    if (!tokenHasTotpSecondFactor(decoded)) {
      this.emitGate({
        correlationId,
        operation: CALENDAR_SESSION_GATE_OPERATION.secondFactor,
        result: 'denied',
        errorCode: secondFactorDenialErrorCode(
          classifyCalendarSessionSecondFactor(decoded)
        )
      });
      throw new AuthenticationRequiredError();
    }
    const user = await this.auth.getUser(decoded.uid).catch(sdkDenial);
    if (user.disabled)
      this.emitGate({
        correlationId,
        operation: CALENDAR_SESSION_GATE_OPERATION.accountEnabled,
        result: 'denied',
        errorCode: CALENDAR_SESSION_GATE_ERROR.accountDisabled
      });
    if (user.disabled) throw new DisabledAccountError();

    if (decoded.firebase?.sign_in_provider !== 'google.com') {
      throw new AuthenticationRequiredError();
    }
    const lifetime = proofLifetime(decoded, now);
    // firebase-admin's installed minimum is five minutes, not a new idle policy.
    if (lifetime.remainingMs < 5 * 60 * 1000)
      throw new AuthenticationRequiredError();
    await beforeIssue?.(decoded.uid);
    let cookieValue: string;
    try {
      cookieValue = await this.auth.createSessionCookie(idToken, {
        expiresIn: lifetime.remainingMs
      });
    } catch (error) {
      this.emitGate({
        correlationId,
        operation: CALENDAR_SESSION_GATE_OPERATION.cookieCreate,
        result: 'error',
        errorCode: CALENDAR_SESSION_GATE_ERROR.cookieCreate
      });
      throw error;
    }
    // Recheck after external cookie issuance, before store/usage writes or
    // returning credentials. This is not atomic across Firebase/Firestore.
    const currentUser = await this.auth.getUser(decoded.uid).catch(() => {
      throw new AuthenticationRequiredError();
    });
    if (currentUser.disabled) {
      this.emitGate({
        correlationId,
        operation: CALENDAR_SESSION_GATE_OPERATION.accountEnabled,
        result: 'denied',
        errorCode: CALENDAR_SESSION_GATE_ERROR.accountDisabled
      });
      throw new AuthenticationRequiredError();
    }
    if (roleForCalendarPilotEmail(decoded.email, this.environment) !== role) {
      this.emitGate({
        correlationId,
        operation: CALENDAR_SESSION_GATE_OPERATION.allowlist,
        result: 'denied',
        errorCode: CALENDAR_SESSION_GATE_ERROR.allowlist
      });
      throw new AuthenticationRequiredError();
    }
    const sessionId = digest(cookieValue);
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = lifetime.expiresAt;
    const record: CalendarPilotSessionRecord = {
      actorId: decoded.uid,
      actorRole: role,
      csrfHash: digest(csrfToken),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      revokedAt: null
    };
    try {
      const sessionRef = this.db
        .collection('calendar_pilot_sessions')
        .doc(sessionId);
      if (this.recordBusinessDeliveryUsage) {
        const event = staffLoginUsageEvent({
          uid: decoded.uid,
          email: decoded.email,
          occurredAt: now,
          environment: this.environment
        });
        if (event !== undefined) {
          const firstUseRef = this.db
            .collection(BUSINESS_DELIVERY_COLLECTIONS.milestones)
            .doc(FIRST_ELIGIBLE_USE_DOC);
          await this.db.runTransaction(async (transaction) => {
            const firstUse = await transaction.get(firstUseRef);
            transaction.create(sessionRef, record);
            transaction.create(
              this.db
                .collection(BUSINESS_DELIVERY_COLLECTIONS.usageEvents)
                .doc(event.eventId),
              event
            );
            if (!firstUse.exists && event.eventClass === 'runtime')
              transaction.create(firstUseRef, {
                schemaVersion: 1,
                occurredAt: now,
                eventId: event.eventId
              });
          });
        } else {
          const month = taipeiCalendarDateOf(now).slice(0, 7);
          const captureGapRef = this.db
            .collection(BUSINESS_DELIVERY_COLLECTIONS.milestones)
            .doc(staffUsageCaptureGapDocumentId(month));
          await this.db.runTransaction(async (transaction) => {
            const captureGap = await transaction.get(captureGapRef);
            transaction.create(sessionRef, record);
            if (!captureGap.exists) {
              transaction.create(captureGapRef, {
                schemaVersion: 1,
                month,
                firstObservedAt: now,
                reason: 'maintenance_allowlist_unready'
              });
            }
          });
        }
      } else {
        await sessionRef.create(record);
      }
    } catch (error) {
      this.emitGate({
        correlationId,
        operation: CALENDAR_SESSION_GATE_OPERATION.firestoreCreate,
        result: 'error',
        errorCode: CALENDAR_SESSION_GATE_ERROR.firestoreCreate
      });
      throw error;
    }
    this.emitGate({
      correlationId,
      operation: CALENDAR_SESSION_GATE_OPERATION.create,
      result: 'ok',
      errorCode: null
    });
    return {
      cookieName: CALENDAR_PILOT_COOKIE,
      cookieValue,
      cookieMaxAgeSeconds: Math.floor(lifetime.remainingMs / 1000),
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
    proofLifetime(decoded, now);
    const role = roleForCalendarPilotEmail(decoded.email, this.environment);
    if (
      decoded.email_verified !== true ||
      role === undefined ||
      !tokenHasTotpSecondFactor(decoded)
    )
      throw new AuthenticationRequiredError();
    const user = await this.auth.getUser(decoded.uid).catch(sdkDenial);
    if (user.disabled) throw new DisabledAccountError();

    const sessionId = digest(cookieValue);
    const ref = this.db.collection('calendar_pilot_sessions').doc(sessionId);
    await this.db.runTransaction(async (transaction) => {
      const document = await transaction.get(ref);
      if (!document.exists) throw new AuthenticationRequiredError();
      const session = document.data() as CalendarPilotSessionRecord;
      if (
        !isCalendarPilotSessionActive(
          session,
          decoded.uid,
          role,
          now,
          user.disabled
        )
      )
        throw new AuthenticationRequiredError();
      // Approximate operational metadata, never an idle authorization gate.
      // This existing transaction serializes competing refreshes.
      const lastSeenAt = Date.parse(session.lastSeenAt);
      if (
        !Number.isFinite(lastSeenAt) ||
        Date.parse(now) - lastSeenAt >= 60_000
      ) {
        transaction.update(ref, { lastSeenAt: now });
      }
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
    const correlationId = randomUUID();
    const decoded = await this.auth
      .verifySessionCookie(cookieValue, false)
      .catch((error: unknown) => {
        this.emitGate({
          correlationId,
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeVerifyCookie,
          result: 'denied',
          errorCode: classifyCalendarSessionRevokeCookieError(error)
        });
        throw new AuthenticationRequiredError();
      });
    this.emitGate({
      correlationId,
      operation: CALENDAR_SESSION_GATE_OPERATION.revokeVerifyCookie,
      result: 'ok',
      errorCode: null
    });
    const sessionId = digest(cookieValue);
    const firestoreRevoke = this.db
      .collection('calendar_pilot_sessions')
      .doc(sessionId)
      .update({ revokedAt: now })
      .then(() => {
        this.emitGate({
          correlationId,
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirestore,
          result: 'ok',
          errorCode: null
        });
      })
      .catch((error: unknown) => {
        this.emitGate({
          correlationId,
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirestore,
          result: 'error',
          errorCode: classifyCalendarSessionRevokeDependencyError(error)
        });
        throw error;
      });
    const firebaseRevoke = this.auth
      .revokeRefreshTokens(decoded.uid)
      .then(() => {
        this.emitGate({
          correlationId,
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirebaseTokens,
          result: 'ok',
          errorCode: null
        });
      })
      .catch((error: unknown) => {
        this.emitGate({
          correlationId,
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirebaseTokens,
          result: 'error',
          errorCode: classifyCalendarSessionRevokeDependencyError(error)
        });
        throw error;
      });
    await Promise.all([firestoreRevoke, firebaseRevoke]);
  }
}
