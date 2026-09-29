import type { DecodedIdToken } from 'firebase-admin/auth';
import { describe, expect, it } from 'vitest';

import { AuthenticationRequiredError } from '../platform/errors/api-error.js';
import { FreshReauthenticationVerifier } from './reauthentication.js';

const NOW = '2030-10-01T00:10:00.000Z';
const NOW_SECONDS = Date.parse(NOW) / 1000;

function token(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    uid: 'staff_uid_01',
    email_verified: true,
    auth_time: NOW_SECONDS - 60,
    firebase: { sign_in_second_factor: 'totp' },
    ...overrides
  } as unknown as DecodedIdToken;
}

function verifier(result: DecodedIdToken | Error) {
  const calls: Array<{ idToken: string; checkRevoked: boolean | undefined }> =
    [];
  return {
    calls,
    instance: new FreshReauthenticationVerifier({
      verifyIdToken: (idToken: string, checkRevoked?: boolean) => {
        calls.push({ idToken, checkRevoked });
        return result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve(result);
      }
    })
  };
}

const input = {
  idToken: 'fresh-id-token',
  actorId: 'staff_uid_01',
  now: NOW,
  maxAgeSeconds: 600
};

describe('FreshReauthenticationVerifier', () => {
  it('accepts a fresh, revocation-checked TOTP sign-in by the same user', async () => {
    const { instance, calls } = verifier(token());
    await expect(instance.assertFresh(input)).resolves.toBeUndefined();
    expect(calls).toEqual([{ idToken: 'fresh-id-token', checkRevoked: true }]);
  });

  it('accepts a sign-in exactly at the window edge', async () => {
    const { instance } = verifier(token({ auth_time: NOW_SECONDS - 600 }));
    await expect(instance.assertFresh(input)).resolves.toBeUndefined();
  });

  it.each([
    ['a missing token', undefined, token()],
    ['a blank token', '  ', token()],
    [
      'a stale sign-in',
      'fresh-id-token',
      token({ auth_time: NOW_SECONDS - 601 })
    ],
    ['another user', 'fresh-id-token', token({ uid: 'staff_uid_02' })],
    [
      'no TOTP factor',
      'fresh-id-token',
      token({ firebase: { sign_in_second_factor: 'phone' } })
    ],
    ['an unverified email', 'fresh-id-token', token({ email_verified: false })],
    [
      'a future sign-in',
      'fresh-id-token',
      token({ auth_time: NOW_SECONDS + 120 })
    ]
  ])('rejects %s', async (_label, idToken, decoded) => {
    const { instance } = verifier(decoded);
    await expect(
      instance.assertFresh({ ...input, idToken })
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it('rejects a revoked or invalid token', async () => {
    const { instance } = verifier(new Error('auth/id-token-revoked'));
    await expect(instance.assertFresh(input)).rejects.toBeInstanceOf(
      AuthenticationRequiredError
    );
  });
});
