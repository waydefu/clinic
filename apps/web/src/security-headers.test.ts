import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ISOLATED_AUTH_FRAME,
  STAGING_AUTH_FRAME,
  firebaseHostingHeaderBlocks,
  hostingHeadersForPath,
  surfaceCsp
} from '../csp-policy.mjs';

const firebaseConfig = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../firebase.json', import.meta.url)),
    'utf8'
  )
);
const isolatedConfig = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../firebase.isolated-preview.json', import.meta.url)
    ),
    'utf8'
  )
);

function headerOn(
  config: {
    hosting: {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
  },
  source: string,
  key: string
): string {
  const rule = config.hosting.headers.find((entry) => entry.source === source);
  const header = rule?.headers.find(
    (item) => item.key.toLowerCase() === key.toLowerCase()
  );
  if (!header) throw new Error(`Missing "${key}" header on "${source}".`);
  return header.value;
}

describe('hosting security headers', () => {
  it('matches the CSP catalog for staging and isolated configs', () => {
    expect(firebaseConfig.hosting.headers).toEqual(
      firebaseHostingHeaderBlocks(STAGING_AUTH_FRAME)
    );
    expect(isolatedConfig.hosting.headers).toEqual(
      firebaseHostingHeaderBlocks(ISOLATED_AUTH_FRAME)
    );
  });

  it('locks staff, booking and clinic CSP directives without wildcards', () => {
    const csp = headerOn(firebaseConfig, '/booking', 'Content-Security-Policy');
    const directives = new Set(
      csp
        .split(';')
        .map((part: string) => part.trim())
        .filter(Boolean)
    );
    for (const directive of [
      "default-src 'self'",
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
      "style-src 'self'",
      "script-src 'self' https://apis.google.com",
      "img-src 'self'",
      "font-src 'self'",
      `frame-src 'self' ${STAGING_AUTH_FRAME}`,
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "require-trusted-types-for 'script'"
    ]) {
      expect(directives).toContain(directive);
    }
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('https://*.googleapis.com');
    expect(csp).not.toContain('https://*.firebaseapp.com');
  });

  it('removes the staging origin from isolated internal-preproduction CSP', () => {
    const isolatedBooking = headerOn(
      isolatedConfig,
      '/booking',
      'Content-Security-Policy'
    );
    const isolatedStaff = headerOn(
      isolatedConfig,
      '/staff',
      'Content-Security-Policy'
    );
    expect(isolatedBooking).toContain(ISOLATED_AUTH_FRAME);
    expect(isolatedBooking).not.toContain(STAGING_AUTH_FRAME);
    expect(isolatedStaff).not.toContain(STAGING_AUTH_FRAME);
    expect(
      headerOn(isolatedConfig, '/widget', 'Content-Security-Policy')
    ).toContain("frame-ancestors 'none'");
    expect(
      headerOn(isolatedConfig, '/widget', 'Content-Security-Policy')
    ).not.toContain(STAGING_AUTH_FRAME);
    expect(JSON.stringify(isolatedConfig)).not.toContain(STAGING_AUTH_FRAME);
  });

  it('keeps staff and booking frame-protected and current widget embedding disabled', () => {
    expect(headerOn(firebaseConfig, '/staff', 'X-Frame-Options')).toBe('DENY');
    expect(headerOn(firebaseConfig, '/booking', 'X-Frame-Options')).toBe(
      'DENY'
    );
    expect(
      headerOn(firebaseConfig, '/staff', 'Content-Security-Policy')
    ).toContain("frame-ancestors 'none'");
    expect(
      headerOn(firebaseConfig, '/booking', 'Content-Security-Policy')
    ).toContain("frame-ancestors 'none'");
    const widget = firebaseConfig.hosting.headers.find(
      (entry: { source: string }) => entry.source === '/widget'
    );
    expect(widget).toBeDefined();
    expect(
      widget?.headers.some(
        (item: { key: string }) => item.key === 'X-Frame-Options'
      )
    ).toBe(false);
    const widgetCsp = headerOn(
      firebaseConfig,
      '/widget',
      'Content-Security-Policy'
    );
    expect(widgetCsp).toBe(surfaceCsp('widget', STAGING_AUTH_FRAME));
    // CURRENT_WIDGET_EMBED = DISABLED: CSP is authoritative for modern browsers.
    expect(widgetCsp).toContain("frame-ancestors 'none'");
    expect(widgetCsp).not.toContain('frame-ancestors *');
    expect(widgetCsp).not.toMatch(/frame-ancestors [^;]*https:/);
    expect(headerOn(firebaseConfig, '**', 'X-Content-Type-Options')).toBe(
      'nosniff'
    );
    expect(headerOn(firebaseConfig, '**', 'Referrer-Policy')).toBe(
      'no-referrer'
    );
    expect(headerOn(firebaseConfig, '**', 'X-Robots-Tag')).toContain('noindex');
    expect(
      headerOn(firebaseConfig, '**', 'Strict-Transport-Security')
    ).toContain('max-age=31536000');
  });

  it('opts out of device access and the Privacy Sandbox APIs', () => {
    const policy = headerOn(firebaseConfig, '**', 'Permissions-Policy');
    for (const feature of [
      'camera',
      'microphone',
      'geolocation',
      'payment',
      'browsing-topics',
      'attribution-reporting',
      'join-ad-interest-group',
      'run-ad-auction'
    ]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it('revalidates html entry points without forfeiting the bfcache', () => {
    expect(headerOn(firebaseConfig, '**', 'Cache-Control')).toBe('no-cache');
  });

  it('caches content-hashed assets immutably without weakening the catch-all', () => {
    const blocks = firebaseConfig.hosting.headers;
    const assetIndex = blocks.findIndex(
      (entry: { source: string }) => entry.source === '**/*.@(js|css)'
    );
    const catchAllIndex = blocks.findIndex(
      (entry: { source: string }) => entry.source === '**'
    );
    expect(assetIndex).toBeGreaterThan(catchAllIndex);
    const cacheControl = blocks[assetIndex].headers.find(
      (item: { key: string }) => item.key.toLowerCase() === 'cache-control'
    );
    expect(cacheControl.value).toContain('immutable');
    expect(cacheControl.value).toContain('max-age=31536000');
  });
});

describe('the local server mirrors path policies without HSTS', () => {
  const server = readFileSync(
    fileURLToPath(new URL('../server.mjs', import.meta.url)),
    'utf8'
  );

  it('imports the shared CSP catalog and refuses HSTS on loopback HTTP', () => {
    expect(server).toContain("from './csp-policy.mjs'");
    expect(server).toContain('includeHsts: false');
    expect(server).not.toContain('Strict-Transport-Security');
  });

  it('serves booking and staff with frame-ancestors none', () => {
    const booking = hostingHeadersForPath('/booking', {
      authFrame: STAGING_AUTH_FRAME,
      includeHsts: false
    });
    const staff = hostingHeadersForPath('/staff', {
      authFrame: STAGING_AUTH_FRAME,
      includeHsts: false
    });
    expect(booking['Content-Security-Policy']).toContain(
      "frame-ancestors 'none'"
    );
    expect(staff['Content-Security-Policy']).toContain(
      "frame-ancestors 'none'"
    );
    expect(staff['X-Frame-Options']).toBe('DENY');
    expect(booking['X-Frame-Options']).toBe('DENY');
    expect(booking['Strict-Transport-Security']).toBeUndefined();
  });

  it('disables current widget embedding even without X-Frame-Options DENY', () => {
    const widget = hostingHeadersForPath('/widget', {
      authFrame: STAGING_AUTH_FRAME,
      includeHsts: false
    });
    expect(widget['Content-Security-Policy']).toContain(
      "frame-ancestors 'none'"
    );
    expect(widget['X-Frame-Options']).toBeUndefined();
    expect(widget['Content-Security-Policy']).not.toContain(STAGING_AUTH_FRAME);
  });
});
