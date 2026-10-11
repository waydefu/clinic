import { createHash, createHmac } from 'node:crypto';

import { patientPhoneDigits } from './patient-identity.js';

/** Server-only lookup key. Keep the v2 namespace stable for existing indexes. */
export function opaqueLookupIdentity(phone: string, birthDate: string): string {
  return `rlk2_${createHash('sha256')
    .update(`return-v2:${patientPhoneDigits(phone)}|${birthDate}`)
    .digest('hex')
    .slice(0, 32)}`;
}

/** Offline keyed successor candidate. No live caller or key provisioning here.
 * Approve key rotation and legacy-index transition before production wiring.
 */
export function keyedLookupIdentityCandidate(
  phone: string,
  birthDate: string,
  key: Uint8Array
): string {
  if (key.byteLength < 32)
    throw new Error('Lookup key material must contain at least 32 bytes.');
  const input = JSON.stringify([
    'beauessence.lookup-identity.v3',
    patientPhoneDigits(phone),
    birthDate
  ]);
  return `rlk3_${createHmac('sha256', key).update(input).digest('hex')}`;
}
