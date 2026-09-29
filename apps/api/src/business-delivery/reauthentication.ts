import type { Auth } from 'firebase-admin/auth';

import { tokenHasTotpSecondFactor } from '../auth/calendar-pilot-session.js';
import { AuthenticationRequiredError } from '../platform/errors/api-error.js';

export const REAUTHENTICATION_HEADER = 'x-reauth-id-token';

/**
 * Fresh re-authentication for sensitive business-delivery actions: the caller
 * signs in again with Google + TOTP and sends the new ID token in a header.
 * The token must be unrevoked, belong to the same session user, carry the TOTP
 * second factor, and have been issued by a sign-in within the policy window.
 * The token itself is never stored or logged.
 */
export class FreshReauthenticationVerifier {
  public constructor(private readonly auth: Pick<Auth, 'verifyIdToken'>) {}

  public async assertFresh(input: {
    readonly idToken: string | undefined;
    readonly actorId: string;
    readonly now: string;
    readonly maxAgeSeconds: number;
  }): Promise<void> {
    if (input.idToken === undefined || input.idToken.trim() === '') {
      throw new AuthenticationRequiredError();
    }
    const decoded = await this.auth
      .verifyIdToken(input.idToken, true)
      .catch(() => {
        throw new AuthenticationRequiredError();
      });
    const ageSeconds = Date.parse(input.now) / 1000 - decoded.auth_time;
    if (
      decoded.uid !== input.actorId ||
      decoded.email_verified !== true ||
      !tokenHasTotpSecondFactor(decoded) ||
      !Number.isFinite(ageSeconds) ||
      ageSeconds < -60 ||
      ageSeconds > input.maxAgeSeconds
    ) {
      throw new AuthenticationRequiredError();
    }
  }
}
