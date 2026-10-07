import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rootRequire = createRequire(import.meta.url);
const firebasePath = rootRequire.resolve('firebase-tools/package.json');
const firebase = JSON.parse(readFileSync(firebasePath, 'utf8'));
const fromFirebase = createRequire(firebasePath);
const authPath = fromFirebase.resolve(
  '@modelcontextprotocol/sdk/client/auth.js'
);
const sdk = JSON.parse(
  readFileSync(resolve(dirname(authPath), '../../../package.json'), 'utf8')
);
const { auth } = fromFirebase('@modelcontextprotocol/sdk/client/auth.js');
const semver = fromFirebase('semver');
const resource = 'https://resource.example.invalid/mcp';
const trusted = 'https://authorization.example.invalid';

// All fetches are in-memory Response objects. No OAuth service, real tokens,
// registration, Firebase account or application/provider data is involved.
function fixture({
  selected = trusted,
  clientIssuer = trusted,
  tokenIssuer = trusted
} = {}) {
  const saved = vi.fn();
  const redirect = vi.fn();
  const fetchFn = vi.fn(async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === 'POST') {
      expect(url.href).toBe(`${selected}/token`);
      expect(new URLSearchParams(options.body).get('refresh_token')).toBe(
        'synthetic-refresh-not-a-real-token'
      );
      return new Response(
        JSON.stringify({
          access_token: 'synthetic-access',
          token_type: 'Bearer'
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.origin === new URL(resource).origin) {
      return new Response(
        JSON.stringify({ resource, authorization_servers: [selected] })
      );
    }
    // A malicious metadata document can echo the trusted issuer; the stored
    // credential binding must still follow the actual selected server URL.
    return new Response(
      JSON.stringify({
        issuer: trusted,
        authorization_endpoint: `${selected}/authorize`,
        token_endpoint: `${selected}/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none']
      })
    );
  });
  const provider = {
    redirectUrl: 'https://client.example.invalid/callback',
    clientMetadata: {
      redirect_uris: ['https://client.example.invalid/callback']
    },
    clientInformation: () => ({
      client_id: 'synthetic-client',
      issuer: clientIssuer
    }),
    tokens: () => ({
      access_token: 'synthetic-access',
      token_type: 'Bearer',
      refresh_token: 'synthetic-refresh-not-a-real-token',
      issuer: tokenIssuer
    }),
    saveTokens: saved,
    redirectToAuthorization: redirect,
    saveCodeVerifier: vi.fn(),
    state: () => 'synthetic-state'
  };
  return { provider, fetchFn, saved, redirect };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Real network access is forbidden in this regression');
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Firebase parent-chain MCP SDK OAuth issuer binding', () => {
  it('resolves a patched same-major SDK accepted by its actual parent', () => {
    const declared = firebase.dependencies['@modelcontextprotocol/sdk'];
    expect(declared).toBeTruthy();
    expect(semver.satisfies(sdk.version, declared)).toBe(true);
    expect(semver.satisfies(sdk.version, '>=1.31.0 <2.0.0')).toBe(true);
  });

  it.each([
    trusted,
    `${trusted}/`,
    'https://AUTHORIZATION.example.invalid:443'
  ])(
    'preserves trusted issuer refresh with equivalent binding %s',
    async (issuer) => {
      const f = fixture({ clientIssuer: issuer, tokenIssuer: issuer });
      await expect(
        auth(f.provider, { serverUrl: resource, fetchFn: f.fetchFn })
      ).resolves.toBe('AUTHORIZED');
      expect(f.saved).toHaveBeenCalledOnce();
      expect(new URL(f.saved.mock.calls[0][0].issuer).origin).toBe(trusted);
      expect(f.redirect).not.toHaveBeenCalled();
      expect(
        f.fetchFn.mock.calls.filter(([, o]) => o?.method === 'POST')
      ).toHaveLength(1);
    }
  );

  it.each([
    { selected: 'https://untrusted.example.invalid' },
    { selected: `${trusted}/other-tenant` },
    { selected: trusted, clientIssuer: `${trusted}/registered-tenant` }
  ])(
    'rejects changed server selection before sending bound credentials: %j',
    async (options) => {
      const f = fixture(options);
      await expect(
        auth(f.provider, { serverUrl: resource, fetchFn: f.fetchFn })
      ).rejects.toThrow();
      expect(
        f.fetchFn.mock.calls.filter(([, o]) => o?.method === 'POST')
      ).toHaveLength(0);
      expect(f.saved).not.toHaveBeenCalled();
      expect(f.redirect).not.toHaveBeenCalled();
    }
  );

  it('does not refresh with a token bound to another server', async () => {
    const f = fixture({ tokenIssuer: 'https://previous.example.invalid' });
    await expect(
      auth(f.provider, { serverUrl: resource, fetchFn: f.fetchFn })
    ).resolves.toBe('REDIRECT');
    expect(
      f.fetchFn.mock.calls.filter(([, o]) => o?.method === 'POST')
    ).toHaveLength(0);
    expect(f.saved).not.toHaveBeenCalled();
    expect(f.redirect).toHaveBeenCalledOnce();
  });
});
