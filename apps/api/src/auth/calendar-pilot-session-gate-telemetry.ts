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
  create: 'calendar_session_create'
} as const;

export const CALENDAR_SESSION_GATE_ERROR = {
  verifyToken: 'AUTH_GATE_VERIFY_TOKEN',
  emailVerified: 'AUTH_GATE_EMAIL_VERIFIED',
  allowlist: 'AUTH_GATE_ALLOWLIST',
  secondFactorAbsent: 'AUTH_GATE_SECOND_FACTOR_ABSENT',
  secondFactorOther: 'AUTH_GATE_SECOND_FACTOR_OTHER',
  accountDisabled: 'AUTH_GATE_ACCOUNT_DISABLED',
  cookieCreate: 'AUTH_SESSION_COOKIE_CREATE_FAILED',
  firestoreCreate: 'AUTH_SESSION_FIRESTORE_CREATE_FAILED'
} as const;

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
