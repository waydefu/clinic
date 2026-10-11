import { describe, expect, it } from 'vitest';
import {
  keyedLookupIdentityCandidate,
  opaqueLookupIdentity
} from './patient-lookup-identity.node.js';
const key = new Uint8Array(32).fill(0x11);
describe('offline lookup HMAC candidate, no live key deployment', () => {
  it('uses an explicit keyed domain and normalized tuple', () => {
    const value = keyedLookupIdentityCandidate('(000)000-0000', '--02-29', key);
    expect(value).toBe(
      'rlk3_046385fc62e27d85252c2aa66a8111c7fb61fe4d749a73a12bb4f7424293f1fe'
    );
    expect(value).not.toContain('0000000000');
  });
  it('separates key material and legacy namespace', () => {
    const value = keyedLookupIdentityCandidate('0000000000', '--02-29', key);
    expect(value).not.toBe(opaqueLookupIdentity('0000000000', '--02-29'));
    expect(value).not.toBe(
      keyedLookupIdentityCandidate(
        '0000000000',
        '--02-29',
        new Uint8Array(32).fill(0x22)
      )
    );
  });
  it('rejects insufficient synthetic material', () => {
    expect(() =>
      keyedLookupIdentityCandidate('0000000000', '--02-29', new Uint8Array(0))
    ).toThrow();
  });
});
