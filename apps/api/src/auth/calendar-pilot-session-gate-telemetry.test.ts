import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sanitizeStructuredLog, type StructuredLog } from '@beauessence/domain';

import {
  AuthenticationRequiredError,
  DisabledAccountError,
  mapErrorToApiResponse
} from '../platform/errors/api-error.js';
import { ApiExceptionFilter } from '../platform/errors/api-exception.filter.js';
import { StdoutStructuredLogger } from '../platform/runtime/structured-logger.js';
import {
  CALENDAR_PILOT_COOKIE,
  CalendarPilotSessionService
} from './calendar-pilot-session.js';
import {
  CALENDAR_SESSION_VERIFY_TOKEN_FAILURE,
  classifyCalendarSessionSecondFactor,
  classifyCalendarSessionVerifyTokenError,
  createCalendarPilotSessionGateTelemetry,
  secondFactorDenialErrorCode,
  type CalendarPilotSessionGateEvent,
  type CalendarPilotSessionGateTelemetry
} from './calendar-pilot-session-gate-telemetry.js';

const NOW = '2026-09-16T09:04:42.000Z';
const EMAIL = 'gate.pilot@example.com';
const UID = 'uid_secret_fixture_001';
const ID_TOKEN = 'id_token_secret_fixture_value';
const TOTP_CODE = '847291';
const FACTOR_UID = 'factor_uid_secret_fixture';
const COOKIE = 'session_cookie_secret_fixture';
const GOOGLE_SUBJECT = 'google_subject_fixture';
const AUTHORIZATION = `Bearer ${ID_TOKEN}`;
const PII_PROJECT_ID = 'fixture-project-id-aaa111';
const PII_EXPECTED_PROJECT = 'fixture-expected-project-bbb222';
const PII_EMAIL = 'pii.verify@example.com';
const PII_UID = 'uid_verify_pii_fixture_001';
const PII_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.pii_token_body.pii_sig';
const PII_CREDENTIAL =
  'ya29.fixture-oauth-access-token-not-real_service-account-json';
const PII_SECRET_MESSAGE = `fixture secret text email=${PII_EMAIL} uid=${PII_UID} token=${PII_TOKEN} project=${PII_PROJECT_ID} credential=${PII_CREDENTIAL}`;

function firebaseAuthError(
  code: string,
  message: string
): Error & { readonly code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function firebaseErrorInfoOnly(
  code: string,
  message: string
): { readonly errorInfo: { readonly code: string; readonly message: string } } {
  return { errorInfo: { code, message } };
}

function firebaseConflictingCodes(
  code: string,
  errorInfoCode: string,
  message: string
): Error & {
  code: string;
  errorInfo: { code: string; message: string };
} {
  const error = firebaseAuthError(code, message) as Error & {
    code: string;
    errorInfo: { code: string; message: string };
  };
  error.errorInfo = { code: errorInfoCode, message };
  return error;
}

function audienceMismatchError(): Error & { readonly code: string } {
  return firebaseAuthError(
    'auth/argument-error',
    `Firebase ID token has incorrect "aud" (audience) claim. Expected "${PII_EXPECTED_PROJECT}" but got "${PII_PROJECT_ID}". email=${PII_EMAIL} uid=${PII_UID} token=${PII_TOKEN}`
  );
}

function issuerMismatchError(): Error & { readonly code: string } {
  return firebaseAuthError(
    'auth/argument-error',
    `Firebase ID token has incorrect "iss" (issuer) claim. Expected "https://securetoken.google.com/${PII_EXPECTED_PROJECT}" but got "https://securetoken.google.com/${PII_PROJECT_ID}". email=${PII_EMAIL} uid=${PII_UID} token=${PII_TOKEN}`
  );
}

const ALLOWLIST_ENV = {
  CALENDAR_PILOT_MANAGER_EMAILS: EMAIL,
  CALENDAR_PILOT_FRONT_DESK_EMAILS: ''
} as NodeJS.ProcessEnv;

const STRUCTURED_LOG_KEYS = [
  'timestamp',
  'environment',
  'service',
  'correlationId',
  'operation',
  'result',
  'errorCode',
  'durationMs',
  'retryState'
] as const;

function recordingTelemetry(): CalendarPilotSessionGateTelemetry & {
  readonly events: CalendarPilotSessionGateEvent[];
} {
  const events: CalendarPilotSessionGateEvent[] = [];
  return {
    events,
    emit(event: CalendarPilotSessionGateEvent): void {
      events.push(event);
    }
  };
}

function throwingTelemetry(): CalendarPilotSessionGateTelemetry {
  return {
    emit(): void {
      throw new Error('telemetry exploded');
    }
  };
}

function decodedToken(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    uid: UID,
    sub: GOOGLE_SUBJECT,
    email: EMAIL,
    email_verified: true,
    firebase: {
      sign_in_second_factor: 'totp',
      sign_in_second_factor_identifier: FACTOR_UID
    },
    totp: TOTP_CODE,
    ...overrides
  };
}

function fakeDb(createImpl?: (record: unknown) => Promise<void>): {
  readonly created: unknown[];
  collection(name: string): {
    doc(id: string): { create(record: unknown): Promise<void> };
  };
} {
  const created: unknown[] = [];
  return {
    created,
    collection(name: string) {
      expect(name).toBe('calendar_pilot_sessions');
      return {
        doc() {
          return {
            create(record: unknown) {
              if (createImpl !== undefined) return createImpl(record);
              created.push(record);
              return Promise.resolve();
            }
          };
        }
      };
    }
  };
}

function fakeAuth(options: {
  readonly decoded?: Record<string, unknown> | 'reject';
  readonly verifyError?: Error;
  readonly disabled?: boolean;
  readonly cookie?: string | Error;
}): {
  verifyIdToken: (
    idToken: string,
    checkRevoked?: boolean
  ) => Promise<Record<string, unknown>>;
  getUser: (uid: string) => Promise<{ disabled: boolean }>;
  createSessionCookie: (
    idToken: string,
    options: { expiresIn: number }
  ) => Promise<string>;
  readonly calls: {
    verifyIdToken: number;
    getUser: number;
    createSessionCookie: number;
  };
} {
  const calls = { verifyIdToken: 0, getUser: 0, createSessionCookie: 0 };
  return {
    calls,
    verifyIdToken(idToken: string, checkRevoked?: boolean) {
      calls.verifyIdToken += 1;
      expect(idToken).toBe(ID_TOKEN);
      expect(checkRevoked).toBe(true);
      if (options.verifyError !== undefined) {
        return Promise.reject(options.verifyError);
      }
      if (options.decoded === 'reject') {
        return Promise.reject(new Error('firebase verify failed'));
      }
      return Promise.resolve(options.decoded ?? decodedToken());
    },
    getUser(uid: string) {
      calls.getUser += 1;
      expect(uid).toBe(UID);
      return Promise.resolve({ disabled: options.disabled === true });
    },
    createSessionCookie(idToken: string) {
      calls.createSessionCookie += 1;
      expect(idToken).toBe(ID_TOKEN);
      if (options.cookie instanceof Error) {
        return Promise.reject(options.cookie);
      }
      return Promise.resolve(options.cookie ?? COOKIE);
    }
  };
}

function serviceFor(
  auth: ReturnType<typeof fakeAuth>,
  db: ReturnType<typeof fakeDb>,
  telemetry: CalendarPilotSessionGateTelemetry
): CalendarPilotSessionService {
  return new CalendarPilotSessionService(
    auth as never,
    db as never,
    ALLOWLIST_ENV,
    telemetry
  );
}

async function expectAuthenticationRequired(
  run: () => Promise<unknown>
): Promise<unknown> {
  try {
    await run();
    throw new Error('expected AuthenticationRequiredError');
  } catch (error) {
    expect(error).toBeInstanceOf(AuthenticationRequiredError);
    expect(error).not.toBeInstanceOf(DisabledAccountError);
    const mapped = mapErrorToApiResponse(error, 'corr_test');
    expect(mapped.status).toBe(401);
    expect(mapped.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    return error;
  }
}

function assertNoIdentityLeak(serialized: string, extra: string[] = []): void {
  const needles = [
    EMAIL,
    UID,
    ID_TOKEN,
    TOTP_CODE,
    FACTOR_UID,
    COOKIE,
    GOOGLE_SUBJECT,
    AUTHORIZATION,
    CALENDAR_PILOT_COOKIE,
    'sign_in_second_factor',
    'second_factor_identifier',
    ...extra
  ];
  for (const needle of needles) {
    expect(serialized).not.toContain(needle);
  }
}

const VERIFY_TOKEN_FAILURE_CASES: ReadonlyArray<{
  readonly name: string;
  readonly error: Error;
  readonly errorCode: string;
}> = [
  {
    name: 'expired',
    error: firebaseAuthError(
      'auth/id-token-expired',
      `The provided Firebase ID token is expired. email=${PII_EMAIL} uid=${PII_UID} token=${PII_TOKEN} project=${PII_PROJECT_ID}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.expired
  },
  {
    name: 'revoked',
    error: firebaseAuthError(
      'auth/id-token-revoked',
      `The Firebase ID token has been revoked. email=${PII_EMAIL} uid=${PII_UID} token=${PII_TOKEN}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.revoked
  },
  {
    name: 'user_disabled',
    error: firebaseAuthError(
      'auth/user-disabled',
      `The user record is disabled. email=${PII_EMAIL} uid=${PII_UID}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.userDisabled
  },
  {
    name: 'audience_mismatch',
    error: audienceMismatchError(),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.audienceMismatch
  },
  {
    name: 'issuer_mismatch',
    error: issuerMismatchError(),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.issuerMismatch
  },
  {
    name: 'malformed',
    error: firebaseAuthError(
      'auth/argument-error',
      `Decoding Firebase ID token failed. Make sure you passed the entire string JWT which represents an ID token. token=${PII_TOKEN} email=${PII_EMAIL}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.malformed
  },
  {
    name: 'internal',
    error: firebaseAuthError(
      'auth/internal-error',
      `An internal error has occurred. project=${PII_PROJECT_ID} uid=${PII_UID}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.internal
  },
  {
    name: 'insufficient_permission',
    error: firebaseAuthError(
      'auth/insufficient-permission',
      `Credential lacks firebaseauth.users.get. email=${PII_EMAIL} uid=${PII_UID} project=${PII_PROJECT_ID} credential=${PII_CREDENTIAL}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.insufficientPermission
  },
  {
    name: 'user_not_found',
    error: firebaseAuthError(
      'auth/user-not-found',
      `There is no user record corresponding to the provided identifier. email=${PII_EMAIL} uid=${PII_UID}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.userNotFound
  },
  {
    name: 'invalid_credential',
    error: firebaseAuthError(
      'auth/invalid-credential',
      `Must initialize app with a cert credential. credential=${PII_CREDENTIAL} project=${PII_PROJECT_ID} token=${PII_TOKEN}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.invalidCredential
  },
  {
    name: 'invalid_credential_app_prefix',
    error: firebaseAuthError(
      'app/invalid-credential',
      `Credential implementation failed to fetch a valid Google OAuth2 access token. credential=${PII_CREDENTIAL} email=${PII_EMAIL}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.invalidCredential
  },
  {
    name: 'project_not_found',
    error: firebaseAuthError(
      'auth/project-not-found',
      `No project found for the provided identifier. project=${PII_PROJECT_ID} uid=${PII_UID}`
    ),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.projectNotFound
  },
  {
    name: 'unknown',
    error: new Error(`uid=${PII_UID} email=${PII_EMAIL}`),
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.unknown
  }
];

const NEW_VERIFY_CODE_CASES: ReadonlyArray<{
  readonly name: string;
  readonly code: string;
  readonly errorCode: string;
}> = [
  {
    name: 'insufficient_permission',
    code: 'auth/insufficient-permission',
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.insufficientPermission
  },
  {
    name: 'user_not_found',
    code: 'auth/user-not-found',
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.userNotFound
  },
  {
    name: 'invalid_credential',
    code: 'auth/invalid-credential',
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.invalidCredential
  },
  {
    name: 'invalid_credential_app_prefix',
    code: 'app/invalid-credential',
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.invalidCredential
  },
  {
    name: 'project_not_found',
    code: 'auth/project-not-found',
    errorCode: CALENDAR_SESSION_VERIFY_TOKEN_FAILURE.projectNotFound
  }
];

describe('classifyCalendarSessionVerifyTokenError', () => {
  it('maps auth/id-token-expired', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError('auth/id-token-expired', 'expired')
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_EXPIRED');
  });

  it('maps auth/id-token-revoked', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError('auth/id-token-revoked', 'revoked')
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_REVOKED');
  });

  it('maps auth/user-disabled', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError('auth/user-disabled', 'disabled')
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_USER_DISABLED');
  });

  it('maps the known audience mismatch signature', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(audienceMismatchError())
    ).toBe('AUTH_GATE_VERIFY_TOKEN_AUDIENCE_MISMATCH');
  });

  it('maps the known issuer mismatch signature', () => {
    expect(classifyCalendarSessionVerifyTokenError(issuerMismatchError())).toBe(
      'AUTH_GATE_VERIFY_TOKEN_ISSUER_MISMATCH'
    );
  });

  it('maps known malformed/invalid token errors', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/argument-error',
          'Firebase ID token has invalid signature.'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_MALFORMED');
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/invalid-id-token',
          'The provided ID token is not a valid Firebase ID token.'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_MALFORMED');
  });

  it('maps a known internal SDK error', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/internal-error',
          'An internal error has occurred.'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_INTERNAL');
  });

  it.each(NEW_VERIFY_CODE_CASES)(
    'maps $code from error.code to $errorCode',
    ({ code, errorCode }) => {
      expect(
        classifyCalendarSessionVerifyTokenError(
          firebaseAuthError(code, PII_SECRET_MESSAGE)
        )
      ).toBe(errorCode);
    }
  );

  it.each(NEW_VERIFY_CODE_CASES)(
    'maps $code from error.errorInfo.code to $errorCode',
    ({ code, errorCode }) => {
      expect(
        classifyCalendarSessionVerifyTokenError(
          firebaseErrorInfoOnly(code, PII_SECRET_MESSAGE)
        )
      ).toBe(errorCode);
    }
  );

  it('prefers error.code over a conflicting error.errorInfo.code', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseConflictingCodes(
          'auth/id-token-expired',
          'auth/insufficient-permission',
          PII_SECRET_MESSAGE
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_EXPIRED');
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseConflictingCodes(
          'auth/insufficient-permission',
          'auth/user-not-found',
          PII_SECRET_MESSAGE
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_INSUFFICIENT_PERMISSION');
  });

  it('ignores malformed nested errorInfo values without throwing', () => {
    expect(classifyCalendarSessionVerifyTokenError({ errorInfo: null })).toBe(
      'AUTH_GATE_VERIFY_TOKEN_UNKNOWN'
    );
    expect(
      classifyCalendarSessionVerifyTokenError({
        errorInfo: 'auth/insufficient-permission'
      })
    ).toBe('AUTH_GATE_VERIFY_TOKEN_UNKNOWN');
    expect(
      classifyCalendarSessionVerifyTokenError({
        errorInfo: { code: 403 }
      })
    ).toBe('AUTH_GATE_VERIFY_TOKEN_UNKNOWN');
    const throwingInfo = {};
    Object.defineProperty(throwingInfo, 'errorInfo', {
      get(): never {
        throw new Error(PII_SECRET_MESSAGE);
      }
    });
    expect(classifyCalendarSessionVerifyTokenError(throwingInfo)).toBe(
      'AUTH_GATE_VERIFY_TOKEN_UNKNOWN'
    );
    const throwingNestedCode = {};
    Object.defineProperty(throwingNestedCode, 'errorInfo', {
      get(): { readonly code: string } {
        return {
          get code(): string {
            throw new Error(PII_SECRET_MESSAGE);
          }
        };
      }
    });
    expect(classifyCalendarSessionVerifyTokenError(throwingNestedCode)).toBe(
      'AUTH_GATE_VERIFY_TOKEN_UNKNOWN'
    );
  });

  it('still classifies error.code when nested errorInfo is unusable', () => {
    const error = firebaseAuthError(
      'auth/insufficient-permission',
      PII_SECRET_MESSAGE
    ) as Error & { errorInfo: unknown };
    error.errorInfo = null;
    expect(classifyCalendarSessionVerifyTokenError(error)).toBe(
      'AUTH_GATE_VERIFY_TOKEN_INSUFFICIENT_PERMISSION'
    );
  });

  it('falls back to error.errorInfo.code when error.code is unusable', () => {
    expect(
      classifyCalendarSessionVerifyTokenError({
        code: '',
        errorInfo: {
          code: 'auth/user-not-found',
          message: PII_SECRET_MESSAGE
        }
      })
    ).toBe('AUTH_GATE_VERIFY_TOKEN_USER_NOT_FOUND');
    expect(
      classifyCalendarSessionVerifyTokenError({
        code: 403,
        errorInfo: {
          code: 'auth/project-not-found',
          message: PII_SECRET_MESSAGE
        }
      })
    ).toBe('AUTH_GATE_VERIFY_TOKEN_PROJECT_NOT_FOUND');
  });

  it('classifies new backend codes before audience/issuer message signatures', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/insufficient-permission',
          'incorrect "aud" (audience) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_INSUFFICIENT_PERMISSION');
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/user-not-found',
          'incorrect "iss" (issuer) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_USER_NOT_FOUND');
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/invalid-credential',
          'incorrect "aud" (audience) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_INVALID_CREDENTIAL');
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/project-not-found',
          'incorrect "iss" (issuer) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_PROJECT_NOT_FOUND');
  });

  it('maps an unknown object to AUTH_GATE_VERIFY_TOKEN_UNKNOWN', () => {
    expect(classifyCalendarSessionVerifyTokenError({ nope: true })).toBe(
      'AUTH_GATE_VERIFY_TOKEN_UNKNOWN'
    );
  });

  it('maps primitive values to AUTH_GATE_VERIFY_TOKEN_UNKNOWN without throwing', () => {
    for (const value of [null, undefined, 'auth/id-token-expired', 401]) {
      expect(classifyCalendarSessionVerifyTokenError(value)).toBe(
        'AUTH_GATE_VERIFY_TOKEN_UNKNOWN'
      );
    }
  });

  it('classifies audience before issuer before malformed', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/argument-error',
          'incorrect "aud" (audience) claim and incorrect "iss" (issuer) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_AUDIENCE_MISMATCH');
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/argument-error',
          'incorrect "iss" (issuer) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_ISSUER_MISMATCH');
  });

  it('prefers expired/revoked/disabled codes over message signatures', () => {
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/id-token-expired',
          'incorrect "aud" (audience) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_EXPIRED');
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/id-token-revoked',
          'incorrect "iss" (issuer) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_REVOKED');
    expect(
      classifyCalendarSessionVerifyTokenError(
        firebaseAuthError(
          'auth/user-disabled',
          'incorrect "aud" (audience) claim'
        )
      )
    ).toBe('AUTH_GATE_VERIFY_TOKEN_USER_DISABLED');
  });

  it('returns UNKNOWN when property accessors throw', () => {
    const poisoned = {};
    Object.defineProperty(poisoned, 'code', {
      get(): string {
        throw new Error('code accessor exploded');
      }
    });
    expect(classifyCalendarSessionVerifyTokenError(poisoned)).toBe(
      'AUTH_GATE_VERIFY_TOKEN_UNKNOWN'
    );
  });

  it('never returns message content', () => {
    const classified = classifyCalendarSessionVerifyTokenError(
      audienceMismatchError()
    );
    expect(classified).toBe('AUTH_GATE_VERIFY_TOKEN_AUDIENCE_MISMATCH');
    expect(classified).not.toContain(PII_PROJECT_ID);
    expect(classified).not.toContain(PII_EMAIL);
    expect(classified).not.toContain(PII_TOKEN);
  });
});

describe('calendar session second-factor classification', () => {
  it('classifies totp, absent, and other without exposing the raw claim', () => {
    expect(
      classifyCalendarSessionSecondFactor({
        firebase: { sign_in_second_factor: 'totp' }
      })
    ).toBe('totp');
    expect(classifyCalendarSessionSecondFactor({ firebase: {} })).toBe(
      'absent'
    );
    expect(classifyCalendarSessionSecondFactor({})).toBe('absent');
    expect(
      classifyCalendarSessionSecondFactor({
        firebase: { sign_in_second_factor: undefined }
      })
    ).toBe('absent');
    expect(
      classifyCalendarSessionSecondFactor({
        firebase: { sign_in_second_factor: 'phone' }
      })
    ).toBe('other');
    expect(secondFactorDenialErrorCode('absent')).toBe(
      'AUTH_GATE_SECOND_FACTOR_ABSENT'
    );
    expect(secondFactorDenialErrorCode('other')).toBe(
      'AUTH_GATE_SECOND_FACTOR_OTHER'
    );
  });
});

describe('CalendarPilotSessionService.create gate telemetry', () => {
  it.each(VERIFY_TOKEN_FAILURE_CASES)(
    'emits $errorCode and preserves AuthenticationRequiredError without later gates',
    async ({ error, errorCode }) => {
      const telemetry = recordingTelemetry();
      const auth = fakeAuth({ verifyError: error });
      const db = fakeDb();
      await expectAuthenticationRequired(() =>
        serviceFor(auth, db, telemetry).create(ID_TOKEN, NOW)
      );
      expect(telemetry.events).toHaveLength(1);
      expect(telemetry.events).toEqual([
        expect.objectContaining({
          operation: 'calendar_session_verify_token',
          result: 'denied',
          errorCode
        })
      ]);
      expect(auth.calls.verifyIdToken).toBe(1);
      expect(auth.calls.getUser).toBe(0);
      expect(auth.calls.createSessionCookie).toBe(0);
      expect(db.created).toEqual([]);
      expect(
        telemetry.events.some(
          (event) =>
            event.operation === 'calendar_session_allowlist' ||
            event.operation === 'calendar_session_second_factor' ||
            event.operation === 'calendar_session_email_verified' ||
            event.operation === 'calendar_session_account_enabled'
        )
      ).toBe(false);
    }
  );

  it('emits AUTH_GATE_EMAIL_VERIFIED when email_verified is false', async () => {
    const telemetry = recordingTelemetry();
    const auth = fakeAuth({
      decoded: decodedToken({ email_verified: false })
    });
    await expectAuthenticationRequired(() =>
      serviceFor(auth, fakeDb(), telemetry).create(ID_TOKEN, NOW)
    );
    expect(telemetry.events).toEqual([
      expect.objectContaining({
        operation: 'calendar_session_email_verified',
        result: 'denied',
        errorCode: 'AUTH_GATE_EMAIL_VERIFIED'
      })
    ]);
    expect(auth.calls.getUser).toBe(0);
  });

  it('emits AUTH_GATE_ALLOWLIST when role is undefined', async () => {
    const telemetry = recordingTelemetry();
    const auth = fakeAuth({
      decoded: decodedToken({ email: 'other.pilot@example.com' })
    });
    await expectAuthenticationRequired(() =>
      serviceFor(auth, fakeDb(), telemetry).create(ID_TOKEN, NOW)
    );
    expect(telemetry.events).toEqual([
      expect.objectContaining({
        operation: 'calendar_session_allowlist',
        result: 'denied',
        errorCode: 'AUTH_GATE_ALLOWLIST'
      })
    ]);
    expect(auth.calls.getUser).toBe(0);
  });

  it('emits AUTH_GATE_SECOND_FACTOR_ABSENT when the claim is missing', async () => {
    const telemetry = recordingTelemetry();
    const auth = fakeAuth({
      decoded: decodedToken({ firebase: {} })
    });
    await expectAuthenticationRequired(() =>
      serviceFor(auth, fakeDb(), telemetry).create(ID_TOKEN, NOW)
    );
    expect(telemetry.events).toEqual([
      expect.objectContaining({
        operation: 'calendar_session_second_factor',
        result: 'denied',
        errorCode: 'AUTH_GATE_SECOND_FACTOR_ABSENT'
      })
    ]);
    expect(auth.calls.getUser).toBe(0);
  });

  it('emits AUTH_GATE_SECOND_FACTOR_OTHER for a non-totp claim', async () => {
    const telemetry = recordingTelemetry();
    const auth = fakeAuth({
      decoded: decodedToken({
        firebase: { sign_in_second_factor: 'phone' }
      })
    });
    await expectAuthenticationRequired(() =>
      serviceFor(auth, fakeDb(), telemetry).create(ID_TOKEN, NOW)
    );
    expect(telemetry.events).toEqual([
      expect.objectContaining({
        operation: 'calendar_session_second_factor',
        result: 'denied',
        errorCode: 'AUTH_GATE_SECOND_FACTOR_OTHER'
      })
    ]);
    expect(auth.calls.getUser).toBe(0);
  });

  it('does not deny on totp and continues to getUser', async () => {
    const telemetry = recordingTelemetry();
    const auth = fakeAuth({ disabled: true });
    try {
      await serviceFor(auth, fakeDb(), telemetry).create(ID_TOKEN, NOW);
      throw new Error('expected DisabledAccountError');
    } catch (error) {
      expect(error).toBeInstanceOf(DisabledAccountError);
    }
    expect(auth.calls.getUser).toBe(1);
    expect(
      telemetry.events.some(
        (event) => event.operation === 'calendar_session_second_factor'
      )
    ).toBe(false);
  });

  it('emits AUTH_GATE_ACCOUNT_DISABLED and preserves DisabledAccountError', async () => {
    const telemetry = recordingTelemetry();
    const auth = fakeAuth({ disabled: true });
    try {
      await serviceFor(auth, fakeDb(), telemetry).create(ID_TOKEN, NOW);
      throw new Error('expected DisabledAccountError');
    } catch (error) {
      expect(error).toBeInstanceOf(DisabledAccountError);
      const mapped = mapErrorToApiResponse(error, 'corr_test');
      expect(mapped.status).toBe(401);
      expect(mapped.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    }
    expect(telemetry.events).toEqual([
      expect.objectContaining({
        operation: 'calendar_session_account_enabled',
        result: 'denied',
        errorCode: 'AUTH_GATE_ACCOUNT_DISABLED'
      })
    ]);
    expect(auth.calls.createSessionCookie).toBe(0);
  });

  it('emits AUTH_SESSION_COOKIE_CREATE_FAILED and rethrows', async () => {
    const telemetry = recordingTelemetry();
    const original = new Error('cookie mint failed');
    const auth = fakeAuth({ cookie: original });
    try {
      await serviceFor(auth, fakeDb(), telemetry).create(ID_TOKEN, NOW);
      throw new Error('expected cookie failure');
    } catch (error) {
      expect(error).toBe(original);
    }
    expect(telemetry.events).toEqual([
      expect.objectContaining({
        operation: 'calendar_session_cookie_create',
        result: 'error',
        errorCode: 'AUTH_SESSION_COOKIE_CREATE_FAILED'
      })
    ]);
  });

  it('emits AUTH_SESSION_FIRESTORE_CREATE_FAILED and rethrows', async () => {
    const telemetry = recordingTelemetry();
    const original = new Error('firestore create failed');
    const db = fakeDb(() => Promise.reject(original));
    try {
      await serviceFor(fakeAuth({}), db, telemetry).create(ID_TOKEN, NOW);
      throw new Error('expected firestore failure');
    } catch (error) {
      expect(error).toBe(original);
    }
    expect(telemetry.events).toEqual([
      expect.objectContaining({
        operation: 'calendar_session_firestore_create',
        result: 'error',
        errorCode: 'AUTH_SESSION_FIRESTORE_CREATE_FAILED'
      })
    ]);
  });

  it('emits calendar_session_create / ok exactly once on success', async () => {
    const telemetry = recordingTelemetry();
    const db = fakeDb();
    const created = await serviceFor(fakeAuth({}), db, telemetry).create(
      ID_TOKEN,
      NOW
    );
    expect(created.cookieName).toBe(CALENDAR_PILOT_COOKIE);
    expect(created.cookieValue).toBe(COOKIE);
    expect(created.authentication).toEqual({
      actorId: UID,
      actorRole: 'manager'
    });
    expect(db.created).toHaveLength(1);
    expect(telemetry.events).toHaveLength(1);
    expect(telemetry.events[0]).toEqual(
      expect.objectContaining({
        operation: 'calendar_session_create',
        result: 'ok',
        errorCode: null
      })
    );
    expect(telemetry.events[0]?.correlationId).toMatch(
      /^[A-Za-z0-9_-]{1,128}$/
    );
  });

  it('keeps authentication results when telemetry throws', async () => {
    const auth = fakeAuth({ decoded: 'reject' });
    await expectAuthenticationRequired(() =>
      serviceFor(auth, fakeDb(), throwingTelemetry()).create(ID_TOKEN, NOW)
    );
    const created = await serviceFor(
      fakeAuth({}),
      fakeDb(),
      throwingTelemetry()
    ).create(ID_TOKEN, NOW);
    expect(created.cookieValue).toBe(COOKIE);
  });

  it('keeps the three-argument constructor ergonomic', async () => {
    const created = await new CalendarPilotSessionService(
      fakeAuth({}) as never,
      fakeDb() as never,
      ALLOWLIST_ENV
    ).create(ID_TOKEN, NOW);
    expect(created.cookieValue).toBe(COOKIE);
  });
});

describe('calendar session gate telemetry PII safety', () => {
  it('serializes only sanitized StructuredLog fields with no identity', async () => {
    const lines: string[] = [];
    const logger = new StdoutStructuredLogger(
      () => 1_000,
      (line) => {
        lines.push(line);
      }
    );
    const telemetry = createCalendarPilotSessionGateTelemetry(logger);
    const db = fakeDb();
    const created = await serviceFor(fakeAuth({}), db, telemetry).create(
      ID_TOKEN,
      NOW
    );
    const sessionId = createHash('sha256').update(COOKIE).digest('hex');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? '{}') as StructuredLog;
    expect(Object.keys(parsed).sort()).toEqual([...STRUCTURED_LOG_KEYS].sort());
    expect(sanitizeStructuredLog(parsed)).toEqual(parsed);
    expect(parsed.operation).toBe('calendar_session_create');
    expect(parsed.result).toBe('ok');
    expect(parsed.errorCode).toBeNull();
    assertNoIdentityLeak(lines[0] ?? '', [
      created.csrfToken,
      sessionId,
      JSON.stringify(db.created[0])
    ]);
  });

  it('never serializes Firebase error messages, tokens, claims or identity', async () => {
    const lines: string[] = [];
    const logger = new StdoutStructuredLogger(
      () => 1_000,
      (line) => {
        lines.push(line);
      }
    );
    const telemetry = createCalendarPilotSessionGateTelemetry(logger);
    const piiNeedles = [
      PII_PROJECT_ID,
      PII_EXPECTED_PROJECT,
      PII_EMAIL,
      PII_UID,
      PII_TOKEN,
      PII_CREDENTIAL,
      'securetoken.google.com',
      'ya29.',
      'service-account-json',
      'fixture secret text',
      EMAIL,
      UID,
      ID_TOKEN,
      TOTP_CODE,
      FACTOR_UID,
      COOKIE,
      GOOGLE_SUBJECT,
      AUTHORIZATION,
      'sign_in_second_factor',
      'errorInfo',
      'insufficient-permission',
      'user-not-found',
      'invalid-credential',
      'project-not-found'
    ];
    for (const { error, errorCode } of VERIFY_TOKEN_FAILURE_CASES) {
      lines.length = 0;
      await expectAuthenticationRequired(() =>
        serviceFor(
          fakeAuth({ verifyError: error }),
          fakeDb(),
          telemetry
        ).create(ID_TOKEN, NOW)
      );
      expect(lines).toHaveLength(1);
      const serialized = lines[0] ?? '';
      const parsed = JSON.parse(serialized) as StructuredLog;
      expect(Object.keys(parsed).sort()).toEqual(
        [...STRUCTURED_LOG_KEYS].sort()
      );
      expect(sanitizeStructuredLog(parsed)).toEqual(parsed);
      expect(parsed.operation).toBe('calendar_session_verify_token');
      expect(parsed.result).toBe('denied');
      expect(parsed.errorCode).toBe(errorCode);
      expect(parsed.errorCode).toMatch(/^AUTH_GATE_VERIFY_TOKEN_[A-Z_]+$/);
      for (const needle of piiNeedles) {
        expect(serialized).not.toContain(needle);
      }
      expect(serialized).not.toMatch(/auth\/[a-z0-9-]+/);
      expect(serialized).not.toMatch(/app\/[a-z0-9-]+/);
    }
    for (const { code, errorCode } of NEW_VERIFY_CODE_CASES) {
      lines.length = 0;
      await expectAuthenticationRequired(() =>
        serviceFor(
          fakeAuth({
            verifyError: firebaseErrorInfoOnly(
              code,
              PII_SECRET_MESSAGE
            ) as Error
          }),
          fakeDb(),
          telemetry
        ).create(ID_TOKEN, NOW)
      );
      expect(lines).toHaveLength(1);
      const serialized = lines[0] ?? '';
      const parsed = JSON.parse(serialized) as StructuredLog;
      expect(parsed.errorCode).toBe(errorCode);
      for (const needle of piiNeedles) {
        expect(serialized).not.toContain(needle);
      }
      expect(serialized).not.toMatch(/auth\/[a-z0-9-]+/);
      expect(serialized).not.toMatch(/app\/[a-z0-9-]+/);
    }
  });

  it('sanitizes every denial and error gate event', async () => {
    const captured: StructuredLog[] = [];
    const telemetry = createCalendarPilotSessionGateTelemetry({
      emit(entry: StructuredLog): void {
        captured.push(sanitizeStructuredLog(entry));
      }
    });
    const cases: Array<() => Promise<unknown>> = [
      () =>
        serviceFor(fakeAuth({ decoded: 'reject' }), fakeDb(), telemetry).create(
          ID_TOKEN,
          NOW
        ),
      () =>
        serviceFor(
          fakeAuth({ decoded: decodedToken({ email_verified: false }) }),
          fakeDb(),
          telemetry
        ).create(ID_TOKEN, NOW),
      () =>
        serviceFor(
          fakeAuth({
            decoded: decodedToken({ email: 'other.pilot@example.com' })
          }),
          fakeDb(),
          telemetry
        ).create(ID_TOKEN, NOW),
      () =>
        serviceFor(
          fakeAuth({ decoded: decodedToken({ firebase: {} }) }),
          fakeDb(),
          telemetry
        ).create(ID_TOKEN, NOW),
      () =>
        serviceFor(
          fakeAuth({
            decoded: decodedToken({
              firebase: { sign_in_second_factor: 'phone' }
            })
          }),
          fakeDb(),
          telemetry
        ).create(ID_TOKEN, NOW),
      () =>
        serviceFor(fakeAuth({ disabled: true }), fakeDb(), telemetry).create(
          ID_TOKEN,
          NOW
        ),
      () =>
        serviceFor(
          fakeAuth({ cookie: new Error('cookie mint failed') }),
          fakeDb(),
          telemetry
        ).create(ID_TOKEN, NOW),
      () =>
        serviceFor(
          fakeAuth({}),
          fakeDb(() => Promise.reject(new Error('firestore create failed'))),
          telemetry
        ).create(ID_TOKEN, NOW)
    ];
    for (const run of cases) {
      await run().catch(() => undefined);
    }
    expect(captured.map((entry) => entry.errorCode)).toEqual([
      'AUTH_GATE_VERIFY_TOKEN_UNKNOWN',
      'AUTH_GATE_EMAIL_VERIFIED',
      'AUTH_GATE_ALLOWLIST',
      'AUTH_GATE_SECOND_FACTOR_ABSENT',
      'AUTH_GATE_SECOND_FACTOR_OTHER',
      'AUTH_GATE_ACCOUNT_DISABLED',
      'AUTH_SESSION_COOKIE_CREATE_FAILED',
      'AUTH_SESSION_FIRESTORE_CREATE_FAILED'
    ]);
    for (const entry of captured) {
      expect(sanitizeStructuredLog(entry)).toEqual(entry);
      expect(Object.keys(entry).sort()).toEqual(
        [...STRUCTURED_LOG_KEYS].sort()
      );
      assertNoIdentityLeak(JSON.stringify(entry));
    }
  });

  it('fails open when the structured logger rejects a log', () => {
    const telemetry = createCalendarPilotSessionGateTelemetry({
      emit(): void {
        throw new Error('sanitize or write failed');
      }
    });
    expect(() =>
      telemetry.emit({
        correlationId: 'corr_open',
        operation: 'calendar_session_verify_token',
        result: 'denied',
        errorCode: 'AUTH_GATE_VERIFY_TOKEN_UNKNOWN'
      })
    ).not.toThrow();
  });
});

describe('existing generic calendar-session exception log', () => {
  it('still emits v1_calendar-session denied AUTHENTICATION_REQUIRED', () => {
    const entries: StructuredLog[] = [];
    const filter = new ApiExceptionFilter(undefined, undefined, {
      emit(entry: StructuredLog): void {
        entries.push(entry);
      }
    });
    const reply = {
      statusCode: 0,
      body: undefined as unknown,
      header() {
        return this;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(body: unknown) {
        this.body = body;
      }
    };
    filter.catch(new AuthenticationRequiredError(), {
      switchToHttp: () => ({
        getResponse: () => reply,
        getRequest: () => ({
          method: 'POST',
          routerPath: '/v1/calendar-session'
        })
      })
    } as never);
    expect(reply.statusCode).toBe(401);
    expect(reply.body).toMatchObject({
      error: { code: 'AUTHENTICATION_REQUIRED' }
    });
    expect(entries).toEqual([
      expect.objectContaining({
        operation: 'v1_calendar-session',
        result: 'denied',
        errorCode: 'AUTHENTICATION_REQUIRED'
      })
    ]);
    expect(sanitizeStructuredLog(entries[0] as StructuredLog)).toEqual(
      entries[0]
    );
  });

  it('does not route calendar-session diagnosis through denial audit store', () => {
    const session = readFileSync(
      new URL('./calendar-pilot-session.ts', import.meta.url),
      'utf8'
    );
    const telemetry = readFileSync(
      new URL('./calendar-pilot-session-gate-telemetry.ts', import.meta.url),
      'utf8'
    );
    expect(session).toContain("firebase['sign_in_second_factor'] === 'totp'");
    expect(session).toContain('!tokenHasTotpSecondFactor(decoded)');
    expect(session).toContain(
      'if (user.disabled) throw new DisabledAccountError()'
    );
    expect(session).toContain('.verifyIdToken(idToken, true)');
    expect(session).not.toContain('.verifyIdToken(idToken, false)');
    expect(session).toContain(
      'errorCode: classifyCalendarSessionVerifyTokenError(error)'
    );
    expect(telemetry).toContain('function firebaseErrorCode');
    expect(telemetry).toContain('errorInfo');
    expect(telemetry).not.toContain('error.errorInfo.message');
    expect(telemetry).not.toContain('error.stack');
    expect(session).toContain('throw new AuthenticationRequiredError()');
    expect(session).not.toContain('authorization_denial_events');
    expect(telemetry).not.toContain('authorization_denial_events');
    expect(telemetry).toContain('sanitizeStructuredLog');
    expect(telemetry).not.toContain("verifyToken: 'AUTH_GATE_VERIFY_TOKEN'");
    expect(telemetry).not.toContain('JSON.stringify(error)');
    expect(telemetry).not.toContain('console.log');
    expect(telemetry).not.toContain('console.error');
    expect(session).not.toContain('console.log');
    expect(session).not.toContain('console.error');
  });
});
