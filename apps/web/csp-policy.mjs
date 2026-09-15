/**
 * Hosting CSP and framing policy catalog.
 *
 * Firebase applies every matching `headers` source, so CSP is never on `**`
 * (that would AND with path-specific policies). Staff, booking, clinic and
 * widget each have their own Content-Security-Policy.
 *
 * CURRENT_WIDGET_EMBED = DISABLED. Widget CSP is `frame-ancestors 'none'`,
 * which blocks framing by any parent in modern browsers. The widget route
 * omits `X-Frame-Options: DENY` only so a future authorised change can set
 * an explicit parent-origin allowlist; that absence does not make the
 * current widget embeddable. Do not use a wildcard frame-ancestors value
 * or speculative vendor hosts. Changing widget must not open /staff or
 * /booking.
 *
 * FUTURE_WIDGET_EMBED = ARCHITECTURALLY_SUPPORTED_BUT_NOT_AUTHORIZED.
 * Activation requires confirmed origin(s), security review, CSP regression
 * tests, iframe/widget E2E, and explicit deployment authority:
 * `frame-ancestors 'self' https://approved-clinic-or-vendor-origin.example`
 * (exact production hostname must not be invented here).
 */

export const STAGING_AUTH_FRAME =
  'https://beauessence-clinic-staging.firebaseapp.com';
export const ISOLATED_AUTH_FRAME =
  'https://beauessence-clinic-stg-c1a01.firebaseapp.com';

export const COMMON_SECURITY_HEADERS = Object.freeze([
  { key: 'Cache-Control', value: 'no-cache' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=(), attribution-reporting=(), join-ad-interest-group=(), run-ad-auction=()'
  },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }
]);

export const HSTS_HEADER = Object.freeze({
  key: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains'
});

export function contentSecurityPolicy({ authFrame, frameAncestors }) {
  const frameSrc =
    authFrame === null ? "frame-src 'self'" : `frame-src 'self' ${authFrame}`;
  return [
    "default-src 'self'",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    "style-src 'self'",
    "script-src 'self' https://apis.google.com",
    "img-src 'self'",
    "font-src 'self'",
    frameSrc,
    "object-src 'none'",
    "base-uri 'none'",
    `frame-ancestors ${frameAncestors}`,
    "form-action 'self'",
    "require-trusted-types-for 'script'"
  ].join('; ');
}

export function surfaceCsp(surface, authFrame) {
  if (surface === 'widget') {
    return contentSecurityPolicy({
      authFrame: null,
      frameAncestors: "'none'"
    });
  }
  return contentSecurityPolicy({
    authFrame,
    frameAncestors: "'none'"
  });
}

export function pathCspHeaders(authFrame) {
  const staff = surfaceCsp('staff', authFrame);
  const booking = surfaceCsp('booking', authFrame);
  const clinic = surfaceCsp('clinic', authFrame);
  const widget = surfaceCsp('widget', authFrame);
  const entries = [
    { source: '/staff', csp: staff, denyFrame: true },
    { source: '/index.html', csp: staff, denyFrame: true },
    { source: '/booking', csp: booking, denyFrame: true },
    { source: '/patient.html', csp: booking, denyFrame: true },
    { source: '/clinic', csp: clinic, denyFrame: true },
    { source: '/clinic/**', csp: clinic, denyFrame: true },
    { source: '/clinic.html', csp: clinic, denyFrame: true },
    { source: '/privacy', csp: clinic, denyFrame: true },
    { source: '/privacy.html', csp: clinic, denyFrame: true },
    { source: '/404.html', csp: clinic, denyFrame: true },
    { source: '/widget', csp: widget, denyFrame: false },
    { source: '/widget/**', csp: widget, denyFrame: false }
  ];
  return entries.map((entry) => ({
    source: entry.source,
    headers: [
      { key: 'Content-Security-Policy', value: entry.csp },
      ...(entry.denyFrame ? [{ key: 'X-Frame-Options', value: 'DENY' }] : [])
    ]
  }));
}

export function hostingHeadersForPath(pathname, { authFrame, includeHsts }) {
  const headers = {};
  for (const item of COMMON_SECURITY_HEADERS) headers[item.key] = item.value;
  if (includeHsts) headers[HSTS_HEADER.key] = HSTS_HEADER.value;
  let surface = 'clinic';
  if (pathname === '/staff' || pathname === '/index.html') surface = 'staff';
  else if (pathname === '/booking' || pathname === '/patient.html')
    surface = 'booking';
  else if (pathname === '/widget' || pathname.startsWith('/widget/'))
    surface = 'widget';
  headers['Content-Security-Policy'] = surfaceCsp(surface, authFrame);
  if (surface !== 'widget') headers['X-Frame-Options'] = 'DENY';
  return headers;
}

export function firebaseHostingHeaderBlocks(authFrame) {
  return [
    {
      source: '**',
      headers: [...COMMON_SECURITY_HEADERS, HSTS_HEADER]
    },
    ...pathCspHeaders(authFrame),
    {
      source: '**/*.@(js|css)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable'
        }
      ]
    }
  ];
}

export function assertIsolatedCsp(csp) {
  if (csp.includes(STAGING_AUTH_FRAME)) {
    throw new Error(
      'isolated CSP must not trust beauessence-clinic-staging.firebaseapp.com'
    );
  }
  if (/\s\*\s|; \*|; \*$/.test(` ${csp} `) || csp.includes('https://*.')) {
    throw new Error('isolated CSP must not use wildcards');
  }
}
