import type { AuthenticationContext } from '../../auth/authentication-context.js';
import type { AppointmentAuthorizationPolicy } from '../../appointments/appointment.policy.js';
import {
  evaluateAccess,
  type CandidateRole,
  type ResourceScope
} from './rbac.js';
import { AuthorizationDeniedError } from '../errors/api-error.js';

/**
 * Resolves the opaque, server-verified `actorRole` to a candidate role. This is
 * the unimplemented Stage 2 C2 IdP adapter's job. D-006 approved the policy;
 * injecting the resolver still keeps this layer from trusting request values
 * or guessing how provider claims map to roles.
 */
export type RoleResolver = (context: AuthenticationContext) => CandidateRole;

/**
 * Wires the candidate RBAC evaluator into the existing (still unrouted)
 * appointment authorization port. A patient may only create their own booking;
 * a staff role creates against the clinic-wide scope. The account is treated as
 * active because the session was validated upstream — the real disabled-account
 * signal is approved by D-006 but only arrives after the C2/C3 identity and
 * session implementation exists.
 */
/**
 * A patient without a server-verified identity is refused, never widened to the
 * clinic-wide scope. Falling through to `any` was fail-open: patients hold
 * `create_appointment`, so the missing identity — the very thing that binds a
 * booking to one person — became permission to book against anyone. The
 * application service happens to reject this first today, but a policy is only
 * worth having if it holds when reused on its own.
 */
function resolveScope(
  role: CandidateRole,
  verifiedPatientId: string | undefined
): ResourceScope {
  if (role !== 'patient') return { kind: 'any' };
  if (verifiedPatientId === undefined) throw new AuthorizationDeniedError();
  return { kind: 'own_patient', ownerPatientId: verifiedPatientId };
}

export function createRbacAppointmentPolicy(
  resolveRole: RoleResolver
): AppointmentAuthorizationPolicy {
  return {
    assertCanCreate(context: AuthenticationContext, _command): Promise<void> {
      // The port returns a Promise, so a denial must reject it rather than throw
      // synchronously. A Promise executor turns the synchronous throw from
      // evaluateAccess into that rejection, preserving the original error type.
      return new Promise<void>((resolve) => {
        const role = resolveRole(context);
        const scope = resolveScope(role, context.verifiedPatientId);
        evaluateAccess(context, {
          role,
          accountActive: true,
          permission: 'create_appointment',
          scope
        });
        resolve();
      });
    }
  };
}
