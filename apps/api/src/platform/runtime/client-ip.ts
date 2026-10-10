import { isIP } from 'node:net';

/**
 * Source-IP derivation for WP-B2. Trust only the controlled proxy chain.
 * Client-supplied X-Forwarded-For values to the left of the trusted hops
 * are ignored so a spoofed header cannot pick the bucket key.
 */

export interface ClientIpRequest {
  readonly headers: Record<string, unknown>;
  readonly ip?: string;
  readonly socket?: { readonly remoteAddress?: string };
}

export function trustedProxyHopCount(
  environment: NodeJS.ProcessEnv = process.env
): number {
  const raw = environment['TRUSTED_PROXY_HOPS']?.trim();
  if (raw === undefined || raw === '') return 1;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5) {
    throw new Error('TRUSTED_PROXY_HOPS must be an integer 0–5.');
  }
  return parsed;
}

/** Fastify 5 types omit numeric hop counts; map TRUSTED_PROXY_HOPS onto them. */
export function fastifyTrustProxy(
  hops: number = trustedProxyHopCount()
): boolean | ((address: string, hop: number) => boolean) {
  if (hops <= 0) return false;
  return (_address: string, hop: number) => hop < hops;
}

function headerValue(
  headers: Record<string, unknown>,
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function forwardingList(headers: Record<string, unknown>): string[] {
  const raw = headerValue(headers, 'x-forwarded-for');
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function normalizeIp(value: string): string {
  const trimmed = value.trim();
  const family = isIP(trimmed);
  if (family === 4) return trimmed;
  if (family !== 6) return 'unknown';
  try {
    // Canonicalize a validated IPv6 literal without DNS/network access.
    const address = new URL(`http://[${trimmed}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(address);
    if (mapped !== null) {
      const high = Number.parseInt(mapped[1] ?? '', 16);
      const low = Number.parseInt(mapped[2] ?? '', 16);
      return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
    }
    return address;
  } catch {
    return 'unknown';
  }
}

export function deriveClientIp(
  request: ClientIpRequest,
  hops: number = trustedProxyHopCount()
): string {
  const socketIp = normalizeIp(
    request.ip ?? request.socket?.remoteAddress ?? 'unknown'
  );
  if (hops <= 0) return socketIp;
  const forwarded = forwardingList(request.headers);
  if (forwarded.length === 0) return socketIp;
  const trusted = forwarded.slice(-hops);
  return normalizeIp(trusted[0] ?? socketIp);
}
