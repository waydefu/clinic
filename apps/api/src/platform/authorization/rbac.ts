import type { AuthenticationContext } from '../../auth/authentication-context.js';
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from '../errors/api-error.js';

/**
 * Role-based access control, as a reviewable candidate.
 *
 * D-006 owns the real role names, the permission matrix and the resource
 * scopes; none of the values here are approved. What this file fixes is the
 * *shape* of the check the target architecture requires:
 *
 *   allow = authenticated && account active && role permits action
 *         && resource scope permits target
 *
 * Two properties matter and are tested. First, the opaque `actorRole` on the
 * authentication context is never guessed here — a future IdP adapter resolves
 * it to one of these candidate roles, and the resolver is the injected seam.
 * Second, access is decided from role and scope alone, never from whether the
 * target exists, so a denied caller cannot use the result to probe for real
 * patients or appointments (the NOT_FOUND enumeration oracle).
 */

export type CandidateRole =
  | 'patient'
  | 'front_desk'
  | 'case_manager'
  | 'manager'
  | 'system_admin'
  | 'auditor'
  | 'service_account';

export type Permission =
  | 'create_appointment'
  | 'request_cancellation'
  | 'confirm_cancellation'
  | 'complete_visit'
  | 'reschedule_appointment'
  | 'delete_appointment'
  | 'update_appointment_notes'
  | 'decide_follow_up'
  | 'publish_schedule'
  | 'assign_case_manager'
  | 'close_payroll_period'
  | 'record_payroll_adjustment'
  | 'read_audit';

/**
 * Candidate permission matrix. Deliberately least-privilege: the front desk
 * runs the daily counter but cannot delete records or touch payroll; deletion
 * and payroll sit with the manager/admin; the auditor is read-only. This is the
 * exact table the D-006 audit must confirm or overturn.
 */
export const CANDIDATE_ROLE_PERMISSIONS: Record<
  CandidateRole,
  readonly Permission[]
> = {
  patient: ['create_appointment', 'request_cancellation'],
  front_desk: [
    'create_appointment',
    'request_cancellation',
    'confirm_cancellation',
    'complete_visit',
    'reschedule_appointment',
    'update_appointment_notes',
    'decide_follow_up'
  ],
  case_manager: ['assign_case_manager', 'decide_follow_up', 'read_audit'],
  manager: [
    'create_appointment',
    'request_cancellation',
    'confirm_cancellation',
    'complete_visit',
    'reschedule_appointment',
    'delete_appointment',
    'update_appointment_notes',
    'decide_follow_up',
    'publish_schedule',
    'assign_case_manager',
    'close_payroll_period',
    'record_payroll_adjustment',
    'read_audit'
  ],
  system_admin: [
    'create_appointment',
    'request_cancellation',
    'confirm_cancellation',
    'complete_visit',
    'reschedule_appointment',
    'delete_appointment',
    'update_appointment_notes',
    'decide_follow_up',
    'publish_schedule',
    'assign_case_manager',
    'close_payroll_period',
    'record_payroll_adjustment',
    'read_audit'
  ],
  auditor: ['read_audit'],
  service_account: []
};

/**
 * Which target a permission is being exercised against.
 * - `any`: a clinic-wide resource such as the schedule.
 * - `own_patient`: the caller must be that patient (BOLA protection).
 * - `assigned_patient`: a case-manager-scoped patient.
 */
export type ResourceScope =
  | { readonly kind: 'any' }
  | { readonly kind: 'own_patient'; readonly ownerPatientId: string }
  | { readonly kind: 'assigned_patient'; readonly patientId: string };

export interface AccessRequest {
  readonly role: CandidateRole;
  readonly accountActive: boolean;
  readonly permission: Permission;
  readonly scope: ResourceScope;
}

export interface AccessOptions {
  /** Case-manager scoping predicate; supplied by the caller, not guessed here. */
  readonly isAssignedManager?: (patientId: string) => boolean;
}

function roleHasBroadScope(role: CandidateRole): boolean {
  return role === 'manager' || role === 'system_admin';
}

/**
 * Throws unless the caller is authenticated, active, permitted for the action
 * and in scope for the target. It never inspects resource existence, so a
 * denial reveals nothing about whether the target is real.
 */
export function evaluateAccess(
  context: AuthenticationContext,
  request: AccessRequest,
  options: AccessOptions = {}
): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(context.actorId)) {
    throw new AuthenticationRequiredError();
  }
  // A disabled account is a session that is no longer valid, not merely an
  // under-privileged one — fail it as authentication, before any role check.
  if (!request.accountActive) {
    throw new AuthenticationRequiredError();
  }

  const permitted = CANDIDATE_ROLE_PERMISSIONS[request.role];
  if (!permitted.includes(request.permission)) {
    throw new AuthorizationDeniedError();
  }

  switch (request.scope.kind) {
    case 'any':
      return;
    case 'own_patient':
      if (
        context.verifiedPatientId === undefined ||
        context.verifiedPatientId !== request.scope.ownerPatientId
      ) {
        throw new AuthorizationDeniedError();
      }
      return;
    case 'assigned_patient': {
      if (roleHasBroadScope(request.role)) return;
      const isAssigned = options.isAssignedManager;
      if (isAssigned === undefined || !isAssigned(request.scope.patientId)) {
        throw new AuthorizationDeniedError();
      }
      return;
    }
  }
}
