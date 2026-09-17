import { sanitizeStructuredLog, type StructuredLog } from '@beauessence/domain';
import type { DecodedIdToken } from 'firebase-admin/auth';

import type { StructuredLogger } from '../platform/runtime/structured-logger.js';

/**
 * Low-cardinality calendar-session create() gate telemetry.
 *
 * Encodes the failing (or terminal success) gate in StructuredLog
 * `operation` / `result` / `errorCode` only. The global StructuredLog
 * schema is unchanged.
 *
 * `correlationId` is an opaque `randomUUID()` minted per
 * `CalendarPilotSessionService.create()` attempt. It is independent of
 * `ApiExceptionFilter`'s per-response correlation id; joining the two
 * would require request-scoped plumbing that this diagnosis does not
 * need. Operators correlate by timestamp + operation + this id.
 */
export type CalendarSessionSecondFactorClass = 'totp' | 'absent' | 'other';

export interface CalendarPilotSessionGateEvent {
  readonly correlationId: string;
  readonly operation: string;
  readonly result: StructuredLog['result'];
  readonly errorCode: string | null;
}

export interface CalendarPilotSessionGateTelemetry {
  emit(event: CalendarPilotSessionGateEvent): void;
}

export const NOOP_CALENDAR_PILOT_SESSION_GATE_TELEMETRY: CalendarPilotSessionGateTelemetry =
  {
    emit: () => undefined
  };

export const CALENDAR_SESSION_GATE_OPERATION = {
  verifyToken: 'calendar_session_verify_token',
  emailVerified: 'calendar_session_email_verified',
  allowlist: 'calendar_session_allowlist',
  secondFactor: 'calendar_session_second_factor',
  accountEnabled: 'calendar_session_account_enabled',
  cookieCreate: 'calendar_session_cookie_create',
  firestoreCreate: 'calendar_session_firestore_create',
  create: 'calendar_session_create',
  revokeVerifyCookie: 'calendar_session_revoke_verify_cookie',
  revokeFirestore: 'calendar_session_revoke_firestore',
  revokeFirebaseTokens: 'calendar_session_revoke_firebase_tokens'
} as const;

export const CALENDAR_SESSION_GATE_ERROR = {
  emailVerified: 'AUTH_GATE_EMAIL_VERIFIED',
  allowlist: 'AUTH_GATE_ALLOWLIST',
  secondFactorAbsent: 'AUTH_GATE_SECOND_FACTOR_ABSENT',
  secondFactorOther: 'AUTH_GATE_SECOND_FACTOR_OTHER',
  accountDisabled: 'AUTH_GATE_ACCOUNT_DISABLED',
  cookieCreate: 'AUTH_SESSION_COOKIE_CREATE_FAILED',
  firestoreCreate: 'AUTH_SESSION_FIRESTORE_CREATE_FAILED',
  revokeCookieInvalid: 'AUTH_SESSION_REVOKE_COOKIE_INVALID',
  revokeCookieExpired: 'AUTH_SESSION_REVOKE_COOKIE_EXPIRED',
  revokeCookieRevoked: 'AUTH_SESSION_REVOKE_COOKIE_REVOKED',
  revokePermissionDenied: 'AUTH_SESSION_REVOKE_PERMISSION_DENIED',
  revokeUnavailable: 'AUTH_SESSION_REVOKE_DEPENDENCY_UNAVAILABLE',
  revokeUnknown: 'AUTH_SESSION_REVOKE_UNKNOWN'
} as const;

/**
 * Fixed low-cardinality verifyIdToken failure classes. The Firebase Admin
 * exception is inspected in memory and never serialized. Project IDs, token
 * text, claims and identity values stay inside the classifier.
 *
 * firebase-admin@14.2.0 `verifyIdToken(idToken, true)` call chain is
 * `verifyJWT` then `verifyDecodedJWTNotRevokedOrDisabled` → `getUser`.
 * Reachable stable codes on that path:
 * - auth/id-token-expired
 * - auth/id-token-revoked
 * - auth/user-disabled
 * - auth/insufficient-permission (Auth backend lookup)
 * - auth/user-not-found (Auth backend lookup)
 * - auth/invalid-credential (missing project ID, or INVALID_SERVICE_ACCOUNT)
 * - app/invalid-credential (ADC / credential layer during getUser)
 * - auth/project-not-found (Auth backend lookup)
 * - auth/argument-error (decode, signature, algorithm, aud/iss, sub)
 * - auth/invalid-id-token (AuthErrorCode; classified malformed)
 * - auth/internal-error
 *
 * Audience/issuer have no distinct SDK code; they are argument-error with
 * deterministic message signatures. The classifier may read
 * `error.message` only to choose one of these enums. Raw codes, prefixes
 * and messages never leave this module.
 */
export const CALENDAR_SESSION_VERIFY_TOKEN_FAILURE = {
  expired: 'AUTH_GATE_VERIFY_TOKEN_EXPIRED',
  revoked: 'AUTH_GATE_VERIFY_TOKEN_REVOKED',
  userDisabled: 'AUTH_GATE_VERIFY_TOKEN_USER_DISABLED',
  insufficientPermission: 'AUTH_GATE_VERIFY_TOKEN_INSUFFICIENT_PERMISSION',
  userNotFound: 'AUTH_GATE_VERIFY_TOKEN_USER_NOT_FOUND',
  invalidCredential: 'AUTH_GATE_VERIFY_TOKEN_INVALID_CREDENTIAL',
  projectNotFound: 'AUTH_GATE_VERIFY_TOKEN_PROJECT_NOT_FOUND',
  audienceMismatch: 'AUTH_GATE_VERIFY_TOKEN_AUDIENCE_MISMATCH',
  issuerMismatch: 'AUTH_GATE_VERIFY_TOKEN_ISSUER_MISMATCH',
  malformed: 'AUTH_GATE_VERIFY_TOKEN_MALFORMED',
  internal: 'AUTH_GATE_VERIFY_TOKEN_INTERNAL',
  unknown: 'AUTH_GATE_VERIFY_TOKEN_UNKNOWN'
} as const;

export type CalendarSessionVerifyTokenFailure =
  (typeof CALENDAR_SESSION_VERIFY_TOKEN_FAILURE)[keyof typeof CALENDAR_SESSION_VERIFY_TOKEN_FAILURE];

const FIREBASE_CODE_PREFIXES = ['auth/', 'app/'] as const;
const MAX_FIREBASE_CODE_LENGTH = 128;
const AUDIENCE_MISMATCH_SIGNATURE = 'incorrect "aud" (audience) claim';
const ISSUER_MISMATCH_SIGNATURE = 'incorrect "iss" (issuer) claim';

function readOwnString(value: unknown, key: string): string | undefined {
  if (value === null || value === undefined || typeof value !== 'object') {
    return undefined;
  }
  let property: unknown;
  try {
    property = (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
  return typeof property === 'string' ? property : undefined;
}

function readOwnCode(value: unknown, key: string): string | undefined {
  if (value === null || value === undefined || typeof value !== 'object') {
    return undefined;
  }
  let property: unknown;
  try {
    property = (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
  if (typeof property === 'string') return property;
  if (
    typeof property === 'number' &&
    Number.isInteger(property) &&
    property >= 0 &&
    property <= 999
  )
    return String(property);
  return undefined;
}

function isUsableFirebaseCode(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length > 0 &&
    value.length <= MAX_FIREBASE_CODE_LENGTH
  );
}

function normalizeFirebaseErrorCode(raw: string): string {
  for (const prefix of FIREBASE_CODE_PREFIXES) {
    if (raw.startsWith(prefix)) {
      return raw.slice(prefix.length);
    }
  }
  return raw;
}

function firebaseErrorInfoCode(error: unknown): string | undefined {
  if (error === null || error === undefined || typeof error !== 'object') {
    return undefined;
  }
  let errorInfo: unknown;
  try {
    errorInfo = (error as Record<string, unknown>)['errorInfo'];
  } catch {
    return undefined;
  }
  return readOwnString(errorInfo, 'code');
}

/**
 * Extract a normalized Firebase error code from `error.code`, falling
 * back to `error.errorInfo.code`. Never throws. Never reads message,
 * stack, token, or identity fields. Never serializes the error.
 */
function firebaseErrorCode(error: unknown): string | undefined {
  const direct = readOwnString(error, 'code');
  if (isUsableFirebaseCode(direct)) {
    return normalizeFirebaseErrorCode(direct);
  }
  const nested = firebaseErrorInfoCode(error);
  if (isUsableFirebaseCode(nested)) {
    return normalizeFirebaseErrorCode(nested);
  }
  return undefined;
}

function operationErrorCode(error: unknown): string | undefined {
  const firebaseCode = firebaseErrorCode(error);
  if (firebaseCode !== undefined) return firebaseCode;
  const direct = readOwnCode(error, 'code');
  return direct === undefined ? undefined : normalizeFirebaseErrorCode(direct);
}

/**
 * Classify a session-cookie verification failure without exposing the SDK
 * error. The route intentionally keeps the existing 401 behavior.
 */
export function classifyCalendarSessionRevokeCookieError(
  error: unknown
):
  | typeof CALENDAR_SESSION_GATE_ERROR.revokeCookieInvalid
  | typeof CALENDAR_SESSION_GATE_ERROR.revokeCookieExpired
  | typeof CALENDAR_SESSION_GATE_ERROR.revokeCookieRevoked {
  try {
    const code = operationErrorCode(error);
    if (code === 'session-cookie-expired')
      return CALENDAR_SESSION_GATE_ERROR.revokeCookieExpired;
    if (code === 'session-cookie-revoked')
      return CALENDAR_SESSION_GATE_ERROR.revokeCookieRevoked;
  } catch {
    // Fall through to the fixed invalid-cookie class.
  }
  return CALENDAR_SESSION_GATE_ERROR.revokeCookieInvalid;
}

/**
 * Classify a revoke dependency failure using only stable SDK/gRPC codes.
 * Error messages, stacks and identity fields are never read or serialized.
 */
export function classifyCalendarSessionRevokeDependencyError(
  error: unknown
):
  | typeof CALENDAR_SESSION_GATE_ERROR.revokePermissionDenied
  | typeof CALENDAR_SESSION_GATE_ERROR.revokeUnavailable
  | typeof CALENDAR_SESSION_GATE_ERROR.revokeUnknown {
  try {
    const code = operationErrorCode(error);
    if (
      code === 'insufficient-permission' ||
      code === 'permission-denied' ||
      code === '7'
    )
      return CALENDAR_SESSION_GATE_ERROR.revokePermissionDenied;
    if (
      code === 'unavailable' ||
      code === 'deadline-exceeded' ||
      code === 'resource-exhausted' ||
      code === 'aborted' ||
      code === '14'
    )
      return CALENDAR_SESSION_GATE_ERROR.revokeUnavailable;
  } catch {
    // Fall through to the fixed unknown class.
  }
  return CALENDAR_SESSION_GATE_ERROR.revokeUnknown;
}

/**
 * Map a Firebase Admin `verifyIdToken` rejection to a safe enum.
 * Never throws. Never returns or logs message/stack/identity.
 */
export function classifyCalendarSessionVerifyTokenError(
  error: unknown
): CalendarSessionVerifyTokenFailure {
  try {
    const code = firebaseErrorCode(error);
    if (code === 'id-token-expired') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.expired;
    }
    if (code === 'id-token-revoked') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.revoked;
    }
    if (code === 'user-disabled') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.userDisabled;
    }
    if (code === 'insufficient-permission') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.insufficientPermission;
    }
    if (code === 'user-not-found') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.userNotFound;
    }
    if (code === 'invalid-credential') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.invalidCredential;
    }
    if (code === 'project-not-found') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.projectNotFound;
    }

    const message = readOwnString(error, 'message');
    if (
      message !== undefined &&
      message.includes(AUDIENCE_MISMATCH_SIGNATURE)
    ) {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.audienceMismatch;
    }
    if (message !== undefined && message.includes(ISSUER_MISMATCH_SIGNATURE)) {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.issuerMismatch;
    }

    if (code === 'argument-error' || code === 'invalid-id-token') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.malformed;
    }
    if (code === 'internal-error') {
      return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.internal;
    }
    return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.unknown;
  } catch {
    return CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.unknown;
  }
}

/**
 * Classify `firebase.sign_in_second_factor` without returning or logging
 * the raw claim. Authorization still requires the exact string `totp`
 * via `tokenHasTotpSecondFactor`.
 */
export function classifyCalendarSessionSecondFactor(
  token: Pick<DecodedIdToken, 'firebase'> | { readonly firebase?: unknown }
): CalendarSessionSecondFactorClass {
  const firebase = token.firebase;
  if (
    firebase === null ||
    firebase === undefined ||
    typeof firebase !== 'object'
  ) {
    return 'absent';
  }
  const record = firebase as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, 'sign_in_second_factor')) {
    return 'absent';
  }
  const value = record['sign_in_second_factor'];
  if (value === 'totp') return 'totp';
  if (value === undefined) return 'absent';
  return 'other';
}

export function secondFactorDenialErrorCode(
  classified: CalendarSessionSecondFactorClass
):
  | typeof CALENDAR_SESSION_GATE_ERROR.secondFactorAbsent
  | typeof CALENDAR_SESSION_GATE_ERROR.secondFactorOther {
  return classified === 'other'
    ? CALENDAR_SESSION_GATE_ERROR.secondFactorOther
    : CALENDAR_SESSION_GATE_ERROR.secondFactorAbsent;
}

function structuredLogFromGate(
  event: CalendarPilotSessionGateEvent
): StructuredLog {
  return {
    timestamp: new Date().toISOString(),
    environment: 'internal_test',
    service: 'api',
    correlationId: event.correlationId,
    operation: event.operation,
    result: event.result,
    errorCode: event.errorCode,
    durationMs: 0,
    retryState: 'none'
  };
}

/**
 * Adapter over the existing StructuredLogger. Always sanitizes. Logging
 * failures are swallowed so they cannot change authentication results.
 */
export function createCalendarPilotSessionGateTelemetry(
  logger: StructuredLogger
): CalendarPilotSessionGateTelemetry {
  return {
    emit(event: CalendarPilotSessionGateEvent): void {
      try {
        logger.emit(sanitizeStructuredLog(structuredLogFromGate(event)));
      } catch {
        // Logging must never change the authentication control flow.
      }
    }
  };
}
