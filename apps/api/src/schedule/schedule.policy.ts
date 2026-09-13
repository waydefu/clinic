import type { AuthenticationContext } from '../auth/authentication-context.js';

/**
 * Published grid is clinic-wide. Listing slots uses `create_appointment`
 * because that is the existing permission that already gates booking; there
 * is no second slot-read permission. Publishing stays `publish_schedule`.
 */
export interface ScheduleAuthorizationPolicy {
  assertCanPublish(context: AuthenticationContext): Promise<void>;
  assertCanReadGrid(context: AuthenticationContext): Promise<void>;
}
