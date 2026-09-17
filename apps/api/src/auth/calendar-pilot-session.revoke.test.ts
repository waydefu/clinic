import { describe, expect, it } from 'vitest';

import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { CalendarPilotSessionController } from './calendar-pilot-session.controller.js';
import { CalendarPilotSessionService } from './calendar-pilot-session.js';
import {
  CALENDAR_SESSION_GATE_ERROR,
  CALENDAR_SESSION_GATE_OPERATION,
  type CalendarPilotSessionGateEvent,
  type CalendarPilotSessionGateTelemetry
} from './calendar-pilot-session-gate-telemetry.js';

const COOKIE = 'opaque-cookie-fixture';
const UID = 'uid-fixture';
const NOW = '2026-09-18T00:00:00.000Z';

function errorWithCode(
  code: string | number
): Error & { code: string | number } {
  const error = new Error(`fixture error ${String(code)}`) as Error & {
    code: string | number;
  };
  error.code = code;
  return error;
}

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function authFor(options: {
  readonly verifyError?: Error;
  readonly verifyResult?: { readonly uid: string };
  readonly revoke?: () => Promise<unknown>;
}) {
  const calls = {
    verify: [] as Array<{
      readonly cookie: string;
      readonly checkRevoked: boolean;
    }>,
    revoke: [] as string[]
  };
  return {
    calls,
    auth: {
      verifySessionCookie: (cookie: string, checkRevoked: boolean) => {
        calls.verify.push({ cookie, checkRevoked });
        if (options.verifyError !== undefined)
          return Promise.reject(options.verifyError);
        return Promise.resolve(options.verifyResult ?? { uid: UID });
      },
      revokeRefreshTokens: (uid: string) => {
        calls.revoke.push(uid);
        return options.revoke?.() ?? Promise.resolve();
      }
    }
  };
}

function dbFor(update: (value: Record<string, unknown>) => Promise<unknown>) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    db: {
      collection(name: string) {
        expect(name).toBe('calendar_pilot_sessions');
        return {
          doc(id: string) {
            expect(id).toMatch(/^[a-f0-9]{64}$/);
            return {
              update(value: Record<string, unknown>) {
                calls.push(value);
                return update(value);
              }
            };
          }
        };
      }
    }
  };
}

function serviceFor(options: {
  readonly auth: unknown;
  readonly db: unknown;
  readonly telemetry?: CalendarPilotSessionGateTelemetry;
}): CalendarPilotSessionService {
  return new CalendarPilotSessionService(
    options.auth as never,
    options.db as never,
    {},
    options.telemetry
  );
}

function captureEvents(): {
  readonly events: CalendarPilotSessionGateEvent[];
  readonly telemetry: CalendarPilotSessionGateTelemetry;
} {
  const events: CalendarPilotSessionGateEvent[] = [];
  return {
    events,
    telemetry: {
      emit(event) {
        events.push(event);
      }
    }
  };
}

describe('CAL-PILOT server logout revoke', () => {
  it('waits for both revocations and emits one correlation id', async () => {
    const update = deferred<unknown>();
    const tokenRevoke = deferred<unknown>();
    const auth = authFor({ revoke: () => tokenRevoke.promise });
    const db = dbFor(() => update.promise);
    const captured = captureEvents();
    let completed = false;

    const pending = serviceFor({
      auth: auth.auth,
      db: db.db,
      telemetry: captured.telemetry
    })
      .revoke(COOKIE, NOW)
      .then(() => {
        completed = true;
      });

    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(auth.calls.verify).toEqual([
      { cookie: COOKIE, checkRevoked: false }
    ]);
    expect(auth.calls.revoke).toEqual([UID]);

    update.resolve(undefined);
    await Promise.resolve();
    expect(completed).toBe(false);
    tokenRevoke.resolve(undefined);
    await pending;

    expect(db.calls).toEqual([{ revokedAt: NOW }]);
    expect(captured.events.map((event) => event.operation)).toEqual([
      CALENDAR_SESSION_GATE_OPERATION.revokeVerifyCookie,
      CALENDAR_SESSION_GATE_OPERATION.revokeFirestore,
      CALENDAR_SESSION_GATE_OPERATION.revokeFirebaseTokens
    ]);
    expect(
      new Set(captured.events.map((event) => event.correlationId)).size
    ).toBe(1);
    expect(captured.events.every((event) => event.result === 'ok')).toBe(true);
    expect(
      captured.events.every((event) =>
        Object.keys(event).every((key) =>
          ['correlationId', 'operation', 'result', 'errorCode'].includes(key)
        )
      )
    ).toBe(true);
  });

  it('does not report success when Firestore revoke fails', async () => {
    const failure = errorWithCode(7);
    const auth = authFor({});
    const db = dbFor(() => Promise.reject(failure));
    const captured = captureEvents();

    await expect(
      serviceFor({
        auth: auth.auth,
        db: db.db,
        telemetry: captured.telemetry
      }).revoke(COOKIE, NOW)
    ).rejects.toBe(failure);

    expect(captured.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirestore,
          result: 'error',
          errorCode: CALENDAR_SESSION_GATE_ERROR.revokePermissionDenied
        }),
        expect.objectContaining({
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirebaseTokens,
          result: 'ok',
          errorCode: null
        })
      ])
    );
  });

  it('does not report success when Firebase token revoke fails', async () => {
    const failure = errorWithCode('auth/insufficient-permission');
    const auth = authFor({ revoke: () => Promise.reject(failure) });
    const db = dbFor(() => Promise.resolve(undefined));
    const captured = captureEvents();

    await expect(
      serviceFor({
        auth: auth.auth,
        db: db.db,
        telemetry: captured.telemetry
      }).revoke(COOKIE, NOW)
    ).rejects.toBe(failure);

    expect(captured.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirestore,
          result: 'ok',
          errorCode: null
        }),
        expect.objectContaining({
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirebaseTokens,
          result: 'error',
          errorCode: CALENDAR_SESSION_GATE_ERROR.revokePermissionDenied
        })
      ])
    );
  });

  it('records both dependency failures while rejecting the request', async () => {
    const firestoreFailure = errorWithCode(7);
    const firebaseFailure = errorWithCode('auth/internal-error');
    const auth = authFor({ revoke: () => Promise.reject(firebaseFailure) });
    const db = dbFor(() => Promise.reject(firestoreFailure));
    const captured = captureEvents();

    await expect(
      serviceFor({
        auth: auth.auth,
        db: db.db,
        telemetry: captured.telemetry
      }).revoke(COOKIE, NOW)
    ).rejects.toBe(firestoreFailure);

    expect(captured.events.filter((event) => event.result === 'error')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirestore,
          errorCode: CALENDAR_SESSION_GATE_ERROR.revokePermissionDenied
        }),
        expect.objectContaining({
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirebaseTokens,
          errorCode: CALENDAR_SESSION_GATE_ERROR.revokeUnknown
        })
      ])
    );
  });

  it('classifies invalid cookie failure and does not start revocation', async () => {
    const auth = authFor({
      verifyError: { code: 'auth/session-cookie-expired' }
    });
    const db = dbFor(() => Promise.resolve(undefined));
    const captured = captureEvents();

    await expect(
      serviceFor({
        auth: auth.auth,
        db: db.db,
        telemetry: captured.telemetry
      }).revoke(COOKIE, NOW)
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);

    expect(auth.calls.revoke).toEqual([]);
    expect(db.calls).toEqual([]);
    expect(captured.events).toEqual([
      expect.objectContaining({
        operation: CALENDAR_SESSION_GATE_OPERATION.revokeVerifyCookie,
        result: 'denied',
        errorCode: CALENDAR_SESSION_GATE_ERROR.revokeCookieExpired
      })
    ]);
  });

  it('classifies temporary dependency failure without exposing its code', async () => {
    const auth = authFor({ revoke: () => Promise.reject(errorWithCode(14)) });
    const db = dbFor(() => Promise.resolve(undefined));
    const captured = captureEvents();

    await expect(
      serviceFor({
        auth: auth.auth,
        db: db.db,
        telemetry: captured.telemetry
      }).revoke(COOKIE, NOW)
    ).rejects.toMatchObject({ code: 14 });

    expect(captured.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: CALENDAR_SESSION_GATE_OPERATION.revokeFirebaseTokens,
          errorCode: CALENDAR_SESSION_GATE_ERROR.revokeUnavailable
        })
      ])
    );
    expect(captured.events.every((event) => event.errorCode !== '14')).toBe(
      true
    );
  });

  it('retries already-revoked sessions without clearing revokedAt', async () => {
    const auth = authFor({});
    const db = dbFor(() => Promise.resolve(undefined));
    const service = serviceFor({ auth: auth.auth, db: db.db });

    await service.revoke(COOKIE, NOW);
    await service.revoke(COOKIE, '2026-09-18T00:01:00.000Z');

    expect(auth.calls.revoke).toEqual([UID, UID]);
    expect(db.calls).toEqual([
      { revokedAt: NOW },
      { revokedAt: '2026-09-18T00:01:00.000Z' }
    ]);
    expect(db.calls.every((value) => value.revokedAt !== null)).toBe(true);
  });

  it('retries after partial success without creating or reviving a session', async () => {
    let updateAttempts = 0;
    const auth = authFor({});
    const db = dbFor(() => {
      updateAttempts += 1;
      return updateAttempts === 1
        ? Promise.reject(errorWithCode(7))
        : Promise.resolve(undefined);
    });
    const captured = captureEvents();
    const service = serviceFor({
      auth: auth.auth,
      db: db.db,
      telemetry: captured.telemetry
    });

    await expect(service.revoke(COOKIE, NOW)).rejects.toMatchObject({
      code: 7
    });
    await expect(
      service.revoke(COOKIE, '2026-09-18T00:01:00.000Z')
    ).resolves.toBeUndefined();

    expect(auth.calls.revoke).toEqual([UID, UID]);
    expect(db.calls).toEqual([
      { revokedAt: NOW },
      { revokedAt: '2026-09-18T00:01:00.000Z' }
    ]);
    expect(db.calls.every((value) => value.revokedAt !== null)).toBe(true);
    expect(
      captured.events
        .filter(
          (event) =>
            event.operation === CALENDAR_SESSION_GATE_OPERATION.revokeFirestore
        )
        .map((event) => event.result)
    ).toEqual(['error', 'ok']);
  });

  it('keeps concurrent repeated logout requests independently safe', async () => {
    const auth = authFor({});
    const db = dbFor(() => Promise.resolve(undefined));
    const service = serviceFor({ auth: auth.auth, db: db.db });

    await Promise.all([
      service.revoke(COOKIE, NOW),
      service.revoke(COOKIE, '2026-09-18T00:01:00.000Z')
    ]);

    expect(auth.calls.revoke).toHaveLength(2);
    expect(db.calls).toHaveLength(2);
    expect(db.calls.every((value) => value.revokedAt !== null)).toBe(true);
  });

  it('does not let telemetry failure change revoke control flow', async () => {
    const auth = authFor({});
    const db = dbFor(() => Promise.resolve(undefined));
    const telemetry: CalendarPilotSessionGateTelemetry = {
      emit: () => {
        throw new Error('telemetry sink failure');
      }
    };

    await expect(
      serviceFor({ auth: auth.auth, db: db.db, telemetry }).revoke(COOKIE, NOW)
    ).resolves.toBeUndefined();
  });
});

describe('CAL-PILOT logout controller failure semantics', () => {
  it('does not clear the cookie after incomplete server revocation', async () => {
    const reply = {
      headers: [] as Array<{ readonly name: string; readonly value: string }>,
      header(name: string, value: string) {
        this.headers.push({ name, value });
      }
    };
    const failure = new Error('revoke failed');
    const sessions = {
      revoke: () => Promise.reject(failure)
    } as never;

    await expect(
      new CalendarPilotSessionController(sessions).destroy(
        '__session=opaque-cookie-fixture',
        reply
      )
    ).rejects.toBe(failure);
    expect(reply.headers).toEqual([]);
  });

  it('keeps no-cookie logout successful and clears the cookie', async () => {
    const reply = {
      value: '',
      header(_name: string, value: string) {
        this.value = value;
      }
    };
    const sessions = { revoke: () => Promise.resolve() } as never;

    await expect(
      new CalendarPilotSessionController(sessions).destroy(undefined, reply)
    ).resolves.toEqual({ signedOut: true });
    expect(reply.value).toContain('__session=; Max-Age=0');
  });
});
