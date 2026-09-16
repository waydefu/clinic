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
  classifyCalendarSessionSecondFactor,
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
  it('emits AUTH_GATE_VERIFY_TOKEN and preserves AuthenticationRequiredError', async () => {
    const telemetry = recordingTelemetry();
    const auth = fakeAuth({ decoded: 'reject' });
    const db = fakeDb();
    await expectAuthenticationRequired(() =>
      serviceFor(auth, db, telemetry).create(ID_TOKEN, NOW)
    );
    expect(telemetry.events).toEqual([
      expect.objectContaining({
        operation: 'calendar_session_verify_token',
        result: 'denied',
        errorCode: 'AUTH_GATE_VERIFY_TOKEN'
      })
    ]);
    expect(auth.calls.getUser).toBe(0);
    expect(db.created).toEqual([]);
  });

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
      'AUTH_GATE_VERIFY_TOKEN',
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
        errorCode: 'AUTH_GATE_VERIFY_TOKEN'
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
    expect(session).not.toContain('authorization_denial_events');
    expect(telemetry).not.toContain('authorization_denial_events');
    expect(telemetry).toContain('sanitizeStructuredLog');
  });
});
