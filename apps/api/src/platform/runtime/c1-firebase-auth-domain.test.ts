import { describe, expect, it } from 'vitest';

import {
  C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS,
  isAuthorizedC1FirebaseAuthDomain,
  isIsolatedC1ProjectId
} from './c1-firebase-auth-domain.js';

describe('isolated C1 Firebase authDomain allowlist', () => {
  it('accepts the current internal-preproduction Hosting host', () => {
    expect(C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS).toEqual([
      'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
    ]);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
      )
    ).toBe(true);
    expect(isIsolatedC1ProjectId('beauessence-clinic-stg-c1a01')).toBe(true);
  });

  it('rejects missing, firebaseapp.com, staging, production, and unrelated hosts', () => {
    expect(isAuthorizedC1FirebaseAuthDomain(undefined)).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('')).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        'beauessence-clinic-stg-c1a01.firebaseapp.com'
      )
    ).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain('beauessence-clinic-staging.web.app')
    ).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('beauessence.com.tw')).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('example.com')).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        'https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
      )
    ).toBe(false);
    expect(isIsolatedC1ProjectId('beauessence-clinic-staging')).toBe(false);
  });
});
