import { createHash } from 'node:crypto';

import { patientPhoneDigits } from './patient-identity.js';

/** Server-only lookup key. Keep the v2 namespace stable for existing indexes. */
export function opaqueLookupIdentity(phone: string, birthDate: string): string {
  return `rlk2_${createHash('sha256')
    .update(`return-v2:${patientPhoneDigits(phone)}|${birthDate}`)
    .digest('hex')
    .slice(0, 32)}`;
}
