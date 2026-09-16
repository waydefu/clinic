// CAL-PILOT Google＋TOTP session exchange (T1-AUTH-01 follow-on).
//
// Enrollment and second-factor sign-in are intentionally different.
// `factors.enroll()` persists a TOTP factor on the Identity Platform
// account; it does not prove `firebase.sign_in_second_factor === 'totp'`
// on the ID token. Server session creation remains the authority and
// still requires that claim. This module therefore:
//
// 1. after a successful first-time enroll, signs Firebase Auth out and
//    asks for an explicit fresh Google login plus TOTP challenge;
// 2. exchanges `POST /calendar-session` only when a Firebase user already
//    has an enrolled factor (MFA resolve or a restored session);
// 3. on `AUTHENTICATION_REQUIRED` from that exchange, signs out the
//    stale first-factor IndexedDB user so the next click can raise MFA.
//
// Firebase objects are injected so unit tests do not need a real Auth
// backend, DOM, or ID token.

export const CALENDAR_PILOT_AUTH_OUTCOME = Object.freeze({
  AUTHENTICATED: 'authenticated',
  NEEDS_REAUTHENTICATION: 'needs_reauthentication',
  NOT_AUTHENTICATED: 'not_authenticated'
});

export const TOTP_ENROLLMENT_REAUTH_MESSAGE =
  '驗證器設定完成。請重新使用 Google 帳號登入，並輸入動態驗證碼完成雙重驗證。';

export const STALE_FIRST_FACTOR_REAUTH_MESSAGE =
  '登入狀態未完成雙重驗證，請重新使用 Google 帳號登入並輸入動態驗證碼。';

export const CALENDAR_PILOT_CLIENT_AUTH_KEYS = Object.freeze([
  'calPilotCsrf',
  'calPilotRole'
]);

export const CALENDAR_PILOT_LOGOUT_GUARD_KEY = 'calPilotLogoutInProgress';

let calendarPilotLogoutInFlight;

export function isCalendarPilotSessionAuthenticationRequired(error) {
  return (
    error !== null &&
    typeof error === 'object' &&
    error.code === 'AUTHENTICATION_REQUIRED'
  );
}

export function clearCalendarPilotClientAuthState(storage) {
  for (const key of CALENDAR_PILOT_CLIENT_AUTH_KEYS) storage.removeItem(key);
}

export function beginCalendarPilotLogout(storage) {
  storage.setItem(CALENDAR_PILOT_LOGOUT_GUARD_KEY, '1');
}

export function endCalendarPilotLogout(storage) {
  storage.removeItem(CALENDAR_PILOT_LOGOUT_GUARD_KEY);
}

export function isCalendarPilotLogoutInProgress(storage) {
  return storage.getItem(CALENDAR_PILOT_LOGOUT_GUARD_KEY) === '1';
}

export function shouldHydrateCalendarPilotWorkbench(storage) {
  return (
    Boolean(storage?.getItem('calPilotCsrf')) &&
    !isCalendarPilotLogoutInProgress(storage)
  );
}

export async function abandonFirebaseClientSession(ports) {
  try {
    await ports.signOut();
  } finally {
    clearCalendarPilotClientAuthState(ports.storage);
  }
}

function calendarPilotLogoutIncomplete(cause, evidence) {
  const error = new Error('登出未完成。工作臺已鎖定，請不要假設伺服器工作階段已結束。', {
    cause
  });
  error.code = 'CALENDAR_PILOT_LOGOUT_INCOMPLETE';
  error.calendarPilotLogout = evidence;
  return error;
}

async function runCalendarPilotLogoutTeardown(ports) {
  beginCalendarPilotLogout(ports.storage);
  let serverTerminated = false;
  let serverError;
  try {
    await ports.deleteServerSession();
    serverTerminated = true;
  } catch (error) {
    serverError = error;
  }

  let firebaseSignedOut = false;
  let firebaseError;
  try {
    await ports.signOut();
    firebaseSignedOut = true;
  } catch (error) {
    firebaseError = error;
  } finally {
    clearCalendarPilotClientAuthState(ports.storage);
  }

  const evidence = Object.freeze({
    serverTerminated,
    firebaseSignedOut,
    clientStateCleared: CALENDAR_PILOT_CLIENT_AUTH_KEYS.every(
      (key) => ports.storage.getItem(key) == null
    )
  });
  if (
    evidence.serverTerminated &&
    evidence.firebaseSignedOut &&
    evidence.clientStateCleared
  ) {
    endCalendarPilotLogout(ports.storage);
    return evidence;
  }
  throw calendarPilotLogoutIncomplete(serverError ?? firebaseError, evidence);
}

export function teardownCalendarPilotSessions(ports) {
  if (calendarPilotLogoutInFlight !== undefined)
    return calendarPilotLogoutInFlight;
  calendarPilotLogoutInFlight = runCalendarPilotLogoutTeardown(ports).finally(
    () => {
      calendarPilotLogoutInFlight = undefined;
    }
  );
  return calendarPilotLogoutInFlight;
}

/**
 * ports: {
 *   getRedirectResult(): Promise<{ user } | null>
 *   getMultiFactorResolver(error)
 *   totp: {
 *     FACTOR_ID: string
 *     generateSecret(session)
 *     assertionForEnrollment(secret, code)
 *     assertionForSignIn(factorUid, code)
 *   }
 *   multiFactor(user): {
 *     enrolledFactors: ReadonlyArray<unknown>
 *     getSession(): Promise<unknown>
 *     enroll(assertion, displayName): Promise<void>
 *   }
 *   signOut(): Promise<void>
 *   resolveBootUser({ redirectResult }): Promise<user | null>
 *   promptTotp({ enrollmentKey }?): Promise<string>
 *   getIdToken(user, forceRefresh: boolean): Promise<string>
 *   createCalendarSession(idToken): Promise<{ csrfToken: string, role?: string }>
 *   storage: { setItem(name, value): void, removeItem(name): void }
 * }
 */
export async function completeGoogleSignIn(ports) {
  let redirectResult;
  try {
    redirectResult = await ports.getRedirectResult();
  } catch (error) {
    if (error?.code !== 'auth/multi-factor-auth-required') throw error;
    const resolver = ports.getMultiFactorResolver(error);
    const factor = resolver.hints.find(
      (hint) => hint.factorId === ports.totp.FACTOR_ID
    );
    if (factor === undefined)
      throw new Error('此帳號沒有可用的 TOTP 驗證器。', { cause: error });
    const code = await ports.promptTotp();
    const assertion = ports.totp.assertionForSignIn(factor.uid, code);
    redirectResult = await resolver.resolveSignIn(assertion);
  }

  const user = await ports.resolveBootUser({ redirectResult });
  if (user === null)
    return { outcome: CALENDAR_PILOT_AUTH_OUTCOME.NOT_AUTHENTICATED };

  const factors = ports.multiFactor(user);
  if (factors.enrolledFactors.length === 0) {
    const secret = await ports.totp.generateSecret(await factors.getSession());
    const code = await ports.promptTotp({ enrollmentKey: secret.secretKey });
    await factors.enroll(
      ports.totp.assertionForEnrollment(secret, code),
      'CAL-PILOT 驗證器'
    );
    await abandonFirebaseClientSession(ports);
    return {
      outcome: CALENDAR_PILOT_AUTH_OUTCOME.NEEDS_REAUTHENTICATION,
      message: TOTP_ENROLLMENT_REAUTH_MESSAGE
    };
  }

  const idToken = await ports.getIdToken(user, true);
  let session;
  try {
    session = await ports.createCalendarSession(idToken);
  } catch (error) {
    if (!isCalendarPilotSessionAuthenticationRequired(error)) throw error;
    await abandonFirebaseClientSession(ports);
    return {
      outcome: CALENDAR_PILOT_AUTH_OUTCOME.NEEDS_REAUTHENTICATION,
      message: STALE_FIRST_FACTOR_REAUTH_MESSAGE
    };
  }

  if (session.role === 'manager' || session.role === 'front_desk') {
    ports.storage.setItem('calPilotRole', session.role);
  }
  ports.storage.setItem('calPilotCsrf', session.csrfToken);
  return {
    outcome: CALENDAR_PILOT_AUTH_OUTCOME.AUTHENTICATED,
    csrfToken: session.csrfToken,
    role: session.role
  };
}
