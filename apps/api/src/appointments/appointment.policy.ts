import type { CreateAppointmentRequest } from '@beauessence/contracts';

import type { AuthenticationContext } from '../auth/authentication-context.js';

/**
 * D-006 has approved the baseline staff roles, completion/deletion authority
 * and deny-default controls. Authorization stays behind a port because the
 * Stage 2 C2～C4 identity, session and server-side enforcement slices are not
 * implemented yet.
 */
export interface AppointmentAuthorizationPolicy {
  assertCanCreate(
    context: AuthenticationContext,
    command: CreateAppointmentRequest
  ): Promise<void>;
}
