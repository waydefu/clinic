import { describe, expect, it } from 'vitest';

import {
  C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS,
  evaluateC1FirebaseAuthDomain,
  inspectC1FirebaseAuthDomainSource,
  isAuthorizedC1FirebaseAuthDomain,
  ISOLATED_C1_FIREBASE_AUTH_DOMAIN,
  ISOLATED_C1_FIREBASE_AUTH_HANDLER
} from './c1-firebase-auth-domain.mjs';

describe('C1 firebase authDomain policy', () => {
  it('accepts only the authorized isolated preview host', () => {
    expect(C1_AUTHORIZED_FIREBASE_AUTH_DOMAINS).toEqual([
      ISOLATED_C1_FIREBASE_AUTH_DOMAIN
    ]);
    expect(ISOLATED_C1_FIREBASE_AUTH_DOMAIN).toBe(
      'beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app'
    );
    expect(
      isAuthorizedC1FirebaseAuthDomain(ISOLATED_C1_FIREBASE_AUTH_DOMAIN)
    ).toBe(true);
    expect(
      evaluateC1FirebaseAuthDomain(ISOLATED_C1_FIREBASE_AUTH_DOMAIN)
    ).toEqual({ ok: true, issues: [] });
    expect(ISOLATED_C1_FIREBASE_AUTH_HANDLER).toBe(
      `https://${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}/__/auth/handler`
    );
  });

  it('fails closed for missing, firebaseapp.com, staging, production, and arbitrary hosts', () => {
    expect(evaluateC1FirebaseAuthDomain('').ok).toBe(false);
    expect(evaluateC1FirebaseAuthDomain(undefined).ok).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        'beauessence-clinic-stg-c1a01.firebaseapp.com'
      )
    ).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        'beauessence-clinic-staging.firebaseapp.com'
      )
    ).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('beauessence.com.tw')).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('staff.beauessence.com.tw')).toBe(
      false
    );
    expect(isAuthorizedC1FirebaseAuthDomain('example.com')).toBe(false);
    expect(
      isAuthorizedC1FirebaseAuthDomain(
        `https://${ISOLATED_C1_FIREBASE_AUTH_DOMAIN}`
      )
    ).toBe(false);
    expect(isAuthorizedC1FirebaseAuthDomain('*.web.app')).toBe(false);
    expect(inspectC1FirebaseAuthDomainSource().issues).toEqual([]);
    expect(inspectC1FirebaseAuthDomainSource().ok).toBe(true);
  });
});
