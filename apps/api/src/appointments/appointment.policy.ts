import type { CreateAppointmentRequest } from '@beauessence/contracts';

import type { AuthenticationContext } from '../auth/authentication-context.js';

/**
 * Authorization stays behind a port until D-006 records the approved roles,
 * resource scopes and denied cases.
 */
export interface AppointmentAuthorizationPolicy {
  assertCanCreate(
    context: AuthenticationContext,
    command: CreateAppointmentRequest
  ): Promise<void>;
}
