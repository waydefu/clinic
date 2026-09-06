import { createHash } from 'node:crypto';

import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthenticationRequiredError } from '../../apps/api/src/platform/errors/api-error.js';
import { CalendarPilotSessionService } from '../../apps/api/src/auth/calendar-pilot-session.js';
import {
  LOCAL_FIREBASE_PROJECT_ID,
  requireLocalFirestoreEmulatorTarget
} from '../../packages/config/src/index.js';

requireLocalFirestoreEmulatorTarget(process.env['FIRESTORE_EMULATOR_HOST']);
const projectId = LOCAL_FIREBASE_PROJECT_ID;

const MANAGER_EMAIL = 'manager@example.com';
const ACTOR_ID = 'pilot_user_001';
const NOW = '2026-09-06T08:00:00.000Z';

interface FakeAccount {
  uid: string;
  email: string;
  totp: boolean;
  disabled: boolean;
  refreshTokensRevoked: boolean;
}

/**
 * Deterministic in-memory Firebase Auth stand-in. No network, no real
 * accounts: cookie/id-token strings map to accounts created per test.
 */
class FakeAuth {
  private accounts = new Map<string, FakeAccount>();
  private idTokens = new Map<string, string>();
  private sessionCookies = new Map<string, string>();
  private minted = 0;

  addAccount(account: FakeAccount): void {
    this.accounts.set(account.uid, account);
  }

  setDisabled(uid: string, disabled: boolean): void {
    const account = this.accounts.get(uid);
    if (account === undefined) throw new Error(`unknown account ${uid}`);
    account.disabled = disabled;
  }

  mintIdToken(uid: string): string {
    const token = `id_token_${uid}_${this.minted}`;
    this.minted += 1;
    this.idTokens.set(token, uid);
    return token;
  }

  private decodedFor(uid: string): DecodedIdToken {
    const account = this.accounts.get(uid);
    if (account === undefined) throw new Error(`unknown account ${uid}`);
    return {
      uid,
      email: account.email,
      email_verified: true,
      firebase: {
        sign_in_second_factor: account.totp ? 'totp' : undefined
      }
    } as unknown as DecodedIdToken;
  }

  verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    const uid = this.idTokens.get(idToken);
    if (uid === undefined) return Promise.reject(new Error('invalid token'));
    return Promise.resolve(this.decodedFor(uid));
  }

  verifySessionCookie(
    cookieValue: string,
    checkRevoked: boolean
  ): Promise<DecodedIdToken> {
    const uid = this.sessionCookies.get(cookieValue);
    if (uid === undefined) return Promise.reject(new Error('invalid cookie'));
    const account = this.accounts.get(uid);
    if (account === undefined)
      return Promise.reject(new Error('invalid cookie'));
    if (checkRevoked && account.refreshTokensRevoked)
      return Promise.reject(new Error('revoked'));
    return Promise.resolve(this.decodedFor(uid));
  }

  getUser(uid: string): Promise<{ disabled: boolean }> {
    const account = this.accounts.get(uid);
    if (account === undefined)
      return Promise.reject(new Error(`unknown user ${uid}`));
    return Promise.resolve({ disabled: account.disabled });
  }

  createSessionCookie(): Promise<string> {
    const cookie = `session_cookie_${this.minted}`;
    this.minted += 1;
    return Promise.resolve(cookie);
  }

  linkSessionCookie(cookieValue: string, uid: string): void {
    this.sessionCookies.set(cookieValue, uid);
  }

  revokeRefreshTokens(uid: string): Promise<void> {
    const account = this.accounts.get(uid);
    if (account === undefined)
      return Promise.reject(new Error(`unknown user ${uid}`));
    account.refreshTokensRevoked = true;
    return Promise.resolve();
  }

  get revoked(): boolean {
    return [...this.accounts.values()].some(
      (account) => account.refreshTokensRevoked
    );
  }
}

let app: App;
let db: Firestore;
let fake: FakeAuth;
let sessions: CalendarPilotSessionService;

const environment = {
  CALENDAR_PILOT_MANAGER_EMAILS: MANAGER_EMAIL,
  CALENDAR_PILOT_FRONT_DESK_EMAILS: ''
} as NodeJS.ProcessEnv;

function addManager(uid = ACTOR_ID): void {
  fake.addAccount({
    uid,
    email: MANAGER_EMAIL,
    totp: true,
    disabled: false,
    refreshTokensRevoked: false
  });
}

async function createSession(uid = ACTOR_ID): Promise<string> {
  const idToken = fake.mintIdToken(uid);
  const created = await sessions.create(idToken, NOW);
  fake.linkSessionCookie(created.cookieValue, uid);
  return created.cookieValue;
}

function sessionIdOf(cookieValue: string): string {
  return createHash('sha256').update(cookieValue).digest('hex');
}

beforeAll(() => {
  app = initializeApp({ projectId }, `pilot-session-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  const documents = await db
    .collection('calendar_pilot_sessions')
    .listDocuments();
  await Promise.all(documents.map((document) => document.delete()));
  fake = new FakeAuth();
  sessions = new CalendarPilotSessionService(
    fake as unknown as Auth,
    db,
    environment
  );
  addManager();
});

describe('CAL-PILOT session integration through the real authenticate path', () => {
  it('authenticates a freshly created session', async () => {
    const cookie = await createSession();

    const authentication = await sessions.authenticate(cookie, NOW);

    expect(authentication.actorId).toBe(ACTOR_ID);
    expect(authentication.actorRole).toBe('manager');
    expect(authentication.sessionId).toBe(sessionIdOf(cookie));
  });

  it('rejects the next request after the account is suspended', async () => {
    const cookie = await createSession();
    await sessions.authenticate(cookie, NOW);

    fake.setDisabled(ACTOR_ID, true);

    await expect(sessions.authenticate(cookie, NOW)).rejects.toThrow(
      AuthenticationRequiredError
    );
  });

  it('rejects an idle-expired session but keeps a recently seen one', async () => {
    const cookie = await createSession();
    await sessions.authenticate(cookie, NOW);

    await db
      .collection('calendar_pilot_sessions')
      .doc(sessionIdOf(cookie))
      .update({ lastSeenAt: '2026-09-06T07:29:59.000Z' });

    await expect(
      sessions.authenticate(cookie, '2026-09-06T08:00:00.000Z')
    ).rejects.toThrow(AuthenticationRequiredError);
  });

  it('rejects an absolute-expired session', async () => {
    const cookie = await createSession();
    await db
      .collection('calendar_pilot_sessions')
      .doc(sessionIdOf(cookie))
      .update({ lastSeenAt: '2026-09-06T15:59:00.000Z' });

    await expect(
      sessions.authenticate(cookie, '2026-09-06T16:00:01.000Z')
    ).rejects.toThrow(AuthenticationRequiredError);
  });

  it('rejects after logout and revokes refresh tokens', async () => {
    const cookie = await createSession();
    await sessions.authenticate(cookie, NOW);

    await sessions.revoke(cookie, NOW);

    expect(fake.revoked).toBe(true);
    await expect(sessions.authenticate(cookie, NOW)).rejects.toThrow(
      AuthenticationRequiredError
    );
  });

  it('rejects a session record that no longer exists', async () => {
    const cookie = await createSession();
    await db
      .collection('calendar_pilot_sessions')
      .doc(sessionIdOf(cookie))
      .delete();

    await expect(sessions.authenticate(cookie, NOW)).rejects.toThrow(
      AuthenticationRequiredError
    );
  });
});
