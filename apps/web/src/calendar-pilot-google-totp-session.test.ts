import { describe, expect, it, vi } from 'vitest';

import {
  CALENDAR_PILOT_AUTH_OUTCOME,
  STALE_FIRST_FACTOR_REAUTH_MESSAGE,
  TOTP_ENROLLMENT_REAUTH_MESSAGE,
  abandonFirebaseClientSession,
  clearCalendarPilotClientAuthState,
  completeGoogleSignIn,
  isCalendarPilotSessionAuthenticationRequired
} from '../public/modules/pilot-google-totp-session.js';

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem(name: string) {
      return store.has(name) ? store.get(name)! : null;
    },
    setItem(name: string, value: string) {
      store.set(name, value);
    },
    removeItem(name: string) {
      store.delete(name);
    }
  };
}

function authenticationRequired() {
  const error = new Error('請先登入後再操作。');
  (error as Error & { code: string }).code = 'AUTHENTICATION_REQUIRED';
  return error;
}

function portsWith(
  overrides: Record<string, unknown> = {},
  storage = memoryStorage()
) {
  const enrolledUser = {
    syntheticId: 'staff_synthetic_001',
    enrolledFactors: [{ factorId: 'totp' }]
  };
  const enroll = vi.fn(() => Promise.resolve());
  const getIdToken = vi.fn(() =>
    Promise.resolve('id-token-synthetic'.padEnd(120, 'x'))
  );
  const createCalendarSession = vi.fn(() =>
    Promise.resolve({
      csrfToken: 'csrf_test',
      role: 'manager'
    })
  );
  const signOut = vi.fn(() => Promise.resolve());
  const promptTotp = vi.fn(() => Promise.resolve('123456'));
  const resolveSignIn = vi.fn(() => Promise.resolve({ user: enrolledUser }));
  const getRedirectResult = vi.fn(() => Promise.resolve(null));
  return {
    storage,
    enroll,
    getIdToken,
    createCalendarSession,
    signOut,
    promptTotp,
    resolveSignIn,
    getRedirectResult,
    ports: {
      getRedirectResult,
      getMultiFactorResolver: vi.fn(() => ({
        hints: [{ factorId: 'totp', uid: 'factor_synthetic_001' }],
        resolveSignIn
      })),
      totp: {
        FACTOR_ID: 'totp',
        generateSecret: vi.fn(() =>
          Promise.resolve({
            secretKey: 'ENROLLMENT_SECRET_TEST_ONLY'
          })
        ),
        assertionForEnrollment: vi.fn((secret, code) => ({
          kind: 'enroll',
          secret,
          code
        })),
        assertionForSignIn: vi.fn((factorUid, code) => ({
          kind: 'signIn',
          factorUid,
          code
        }))
      },
      multiFactor: vi.fn((user: { enrolledFactors?: unknown[] }) => ({
        enrolledFactors: user.enrolledFactors ?? [],
        getSession: vi.fn(() =>
          Promise.resolve({ session: 'enrollment_session' })
        ),
        enroll
      })),
      signOut,
      resolveBootUser: vi.fn(
        ({ redirectResult }: { redirectResult?: { user?: unknown } }) =>
          Promise.resolve(redirectResult?.user ?? null)
      ),
      promptTotp,
      getIdToken,
      createCalendarSession,
      storage,
      ...overrides
    }
  };
}

describe('clearCalendarPilotClientAuthState', () => {
  it('removes only CAL-PILOT bootstrap keys', () => {
    const storage = memoryStorage({
      calPilotCsrf: 'csrf_stale',
      calPilotRole: 'manager',
      unrelated: 'keep'
    });
    clearCalendarPilotClientAuthState(storage);
    expect(storage.getItem('calPilotCsrf')).toBeNull();
    expect(storage.getItem('calPilotRole')).toBeNull();
    expect(storage.getItem('unrelated')).toBe('keep');
  });
});

describe('isCalendarPilotSessionAuthenticationRequired', () => {
  it('matches only the session-exchange API code', () => {
    expect(
      isCalendarPilotSessionAuthenticationRequired(authenticationRequired())
    ).toBe(true);
    expect(
      isCalendarPilotSessionAuthenticationRequired({
        code: 'auth/invalid-verification-code'
      })
    ).toBe(false);
    expect(isCalendarPilotSessionAuthenticationRequired(null)).toBe(false);
  });
});

describe('completeGoogleSignIn', () => {
  it('enrolls a new TOTP factor then signs out without exchanging a session', async () => {
    const newUser = { syntheticId: 'staff_synthetic_new', enrolledFactors: [] };
    const { ports, enroll, getIdToken, createCalendarSession, signOut } =
      portsWith({
        getRedirectResult: vi.fn(() => Promise.resolve({ user: newUser })),
        resolveBootUser: vi.fn(() => Promise.resolve(newUser))
      });

    const result = await completeGoogleSignIn(ports);

    expect(result).toEqual({
      outcome: CALENDAR_PILOT_AUTH_OUTCOME.NEEDS_REAUTHENTICATION,
      message: TOTP_ENROLLMENT_REAUTH_MESSAGE
    });
    expect(enroll).toHaveBeenCalledTimes(1);
    expect(ports.promptTotp).toHaveBeenCalledWith({
      enrollmentKey: 'ENROLLMENT_SECRET_TEST_ONLY'
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(getIdToken).not.toHaveBeenCalled();
    expect(createCalendarSession).not.toHaveBeenCalled();
    expect(ports.storage.getItem('calPilotCsrf')).toBeNull();
  });

  it('exchanges a server session after TOTP resolveSignIn', async () => {
    const mfaError = Object.assign(new Error('mfa'), {
      code: 'auth/multi-factor-auth-required'
    });
    const { ports, getIdToken, createCalendarSession, resolveSignIn, signOut } =
      portsWith({
        getRedirectResult: vi.fn(() => Promise.reject(mfaError)),
        resolveBootUser: vi.fn(
          ({ redirectResult }: { redirectResult?: { user?: unknown } }) =>
            Promise.resolve(redirectResult?.user ?? null)
        )
      });

    const result = await completeGoogleSignIn(ports);

    expect(resolveSignIn).toHaveBeenCalledTimes(1);
    expect(getIdToken).toHaveBeenCalledTimes(1);
    expect(getIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ syntheticId: 'staff_synthetic_001' }),
      true
    );
    expect(createCalendarSession).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: CALENDAR_PILOT_AUTH_OUTCOME.AUTHENTICATED,
      csrfToken: 'csrf_test',
      role: 'manager'
    });
    expect(ports.storage.getItem('calPilotCsrf')).toBe('csrf_test');
    expect(ports.storage.getItem('calPilotRole')).toBe('manager');
  });

  it('signs out a stale first-factor user after session-exchange 401', async () => {
    const staleUser = {
      syntheticId: 'staff_synthetic_stale',
      enrolledFactors: [{ factorId: 'totp' }]
    };
    const storage = memoryStorage({
      calPilotCsrf: 'csrf_stale',
      calPilotRole: 'manager',
      unrelated: 'keep'
    });
    const { ports } = portsWith(
      {
        resolveBootUser: vi.fn(() => Promise.resolve(staleUser)),
        createCalendarSession: vi.fn(() =>
          Promise.reject(authenticationRequired())
        )
      },
      storage
    );

    const result = await completeGoogleSignIn(ports);

    expect(ports.getIdToken).toHaveBeenCalledTimes(1);
    expect(ports.createCalendarSession).toHaveBeenCalledTimes(1);
    expect(ports.signOut).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      outcome: CALENDAR_PILOT_AUTH_OUTCOME.NEEDS_REAUTHENTICATION,
      message: STALE_FIRST_FACTOR_REAUTH_MESSAGE
    });
    expect(storage.getItem('calPilotCsrf')).toBeNull();
    expect(storage.getItem('calPilotRole')).toBeNull();
    expect(storage.getItem('unrelated')).toBe('keep');
  });

  it('does not create a server session when TOTP resolveSignIn fails', async () => {
    const mfaError = Object.assign(new Error('mfa'), {
      code: 'auth/multi-factor-auth-required'
    });
    const resolveError = Object.assign(new Error('invalid code'), {
      code: 'auth/invalid-verification-code'
    });
    const resolveSignIn = vi.fn(() => Promise.reject(resolveError));
    const { ports } = portsWith({
      getRedirectResult: vi.fn(() => Promise.reject(mfaError)),
      getMultiFactorResolver: vi.fn(() => ({
        hints: [{ factorId: 'totp', uid: 'factor_synthetic_001' }],
        resolveSignIn
      }))
    });

    await expect(completeGoogleSignIn(ports)).rejects.toMatchObject({
      code: 'auth/invalid-verification-code'
    });
    expect(resolveSignIn).toHaveBeenCalledTimes(1);
    expect(ports.getIdToken).not.toHaveBeenCalled();
    expect(ports.createCalendarSession).not.toHaveBeenCalled();
  });

  it('returns not_authenticated when no Firebase user is present', async () => {
    const { ports, getIdToken, createCalendarSession } = portsWith();
    await expect(completeGoogleSignIn(ports)).resolves.toEqual({
      outcome: CALENDAR_PILOT_AUTH_OUTCOME.NOT_AUTHENTICATED
    });
    expect(getIdToken).not.toHaveBeenCalled();
    expect(createCalendarSession).not.toHaveBeenCalled();
  });
});

describe('abandonFirebaseClientSession', () => {
  it('clears bootstrap keys even when signOut fails', async () => {
    const storage = memoryStorage({ calPilotCsrf: 'csrf_stale' });
    await expect(
      abandonFirebaseClientSession({
        signOut: () => Promise.reject(new Error('sign-out-failed')),
        storage
      })
    ).rejects.toThrow('sign-out-failed');
    expect(storage.getItem('calPilotCsrf')).toBeNull();
  });
});
