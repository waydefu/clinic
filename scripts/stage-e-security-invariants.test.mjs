import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

describe('Stage E security invariants', () => {
  const authenticator = read(
    'apps/api/src/internal-test-booking/internal-test-booking.authenticator.ts'
  );
  const session = read('apps/api/src/auth/calendar-pilot-session.ts');
  const returnLookup = read(
    'apps/api/src/internal-test-booking/return-lookup.controller.ts'
  );
  const isolated = read('firebase.isolated-preview.json');
  const csp = read('apps/web/csp-policy.mjs');

  it('keeps public booking accountless and staff writes on CSRF', () => {
    expect(authenticator).toContain(
      "return { actorId: 'anonymous', actorRole: 'patient' }"
    );
    expect(authenticator).toContain("header(request, 'x-csrf-token')");
    expect(authenticator).toContain('assertCsrf');
    expect(session).toContain(
      "const SESSION_COOKIE_SCOPE = 'Path=/; HttpOnly; Secure; SameSite=Strict'"
    );
    expect(session).toContain('STAFF_ABSOLUTE_SESSION_MS');
    expect(session).toContain('evaluateStaffSession');
    expect(session).toContain(
      'if (user.disabled) throw new DisabledAccountError()'
    );
  });

  it('keeps return lookup generic, rate-limited, and without OTP or CAPTCHA', () => {
    expect(returnLookup).toContain('lookupReturn');
    expect(returnLookup).not.toMatch(/otp|totp|captcha/i);
    expect(returnLookup).toContain('WP_B2_RATE_LIMITER');
    expect(authenticator).not.toMatch(/captcha/i);
  });

  it('keeps isolated CSP off the staging Firebase origin and widget unframed separately', () => {
    expect(isolated).not.toContain(
      'https://beauessence-clinic-staging.firebaseapp.com'
    );
    expect(csp).toContain("surface === 'widget'");
    expect(csp).toContain('frameAncestors: "\'none\'"');
    expect(csp).toContain('denyFrame: false');
    expect(csp).toContain("source: '/staff'");
    expect(csp).toContain("source: '/booking'");
  });
});
